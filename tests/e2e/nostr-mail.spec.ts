/**
 * End-to-end test for nostr-mail bridge delivery.
 *
 * Flow: login with test key → submit report → verify events on relays.
 * Confirms gift-wrapped kind 1059 events reach the bridge's monitored relays.
 *
 * Usage:
 *   npx playwright test tests/e2e/nostr-mail.spec.ts
 *   TEST_NMAIL=true npx playwright test tests/e2e/nostr-mail.spec.ts
 */

import { test, expect } from '@playwright/test';

const LOCAL_RELAY = 'ws://localhost:7777';
const BRIDGE_PUBKEY = '0d365385f474d4b025377b4ade6ad241f847d514a9e9b475069f69a20f886c68';
const TEST_NSEC = 'nsec1g6wq6h5lgraqgqkp3v9quy7hlufkgcqj5vxjhjysggw7mx4mczssgwg850';
const RUN_NMAIL = !!process.env.TEST_NMAIL;

/** Query a Nostr relay. Returns matching events. */
async function queryRelay(relayUrl: string, filters: Record<string, unknown>, timeout = 10_000): Promise<any[]> {
  const { WebSocket } = await import('ws');
  return new Promise((resolve) => {
    const ws = new WebSocket(relayUrl);
    const events: any[] = [];
    const subId = `q${Date.now()}`;
    const timer = setTimeout(() => { try { ws.close(); } catch {} resolve(events); }, timeout);
    ws.on('open', () => ws.send(JSON.stringify(['REQ', subId, { ...filters, limit: 20 }])));
    ws.on('message', (data: any) => {
      const msg = JSON.parse(data.toString());
      if (msg[0] === 'EVENT' && msg[1] === subId) events.push(msg[2]);
      else if ((msg[0] === 'EOSE' || msg[0] === 'CLOSED') && msg[1] === subId) { clearTimeout(timer); try { ws.close(); } catch {} resolve(events); }
      else if (msg[0] === 'AUTH') console.log(`[relay] AUTH challenge from ${relayUrl}`);
    });
    ws.on('error', () => { clearTimeout(timer); resolve([]); });
  });
}

test('nostr-mail: login, submit, verify relay delivery', async ({ page }) => {
  test.setTimeout(120_000);

  // Load test keypair
  const { nip19 } = await import('nostr-tools');
  const { getPublicKey } = await import('nostr-tools/pure');
  const decoded = nip19.decode(TEST_NSEC);
  const secretKey = decoded.data;
  const pubkey = getPublicKey(secretKey);
  const nsec = TEST_NSEC;
  const npub = nip19.npubEncode(pubkey);
  console.log(`[test] Key: ${npub.slice(0, 20)}...`);

  // Collect console logs
  const logs: string[] = [];
  page.on('console', (msg) => {
    const text = msg.text();
    if (text.includes('[nostr-mail]') || text.includes('[mail]') || text.includes('Event published') || text.includes('Error')) {
      logs.push(text);
    }
  });

  // Skip splash, navigate to map with Ray County coordinates
  await page.goto('/');
  await page.evaluate(() => {
    try { localStorage.setItem('ftheroads:splash_dismissed', 'true'); } catch {}
  });
  await page.goto('/map?lat=39.45&lng=-93.80');
  await page.waitForTimeout(2000);

  // Login
  await expect(page.getByText(/sign in/i)).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: /existing user/i }).first().click();
  await page.locator('#nsec').fill(nsec);
  await page.locator('[role="dialog"]').getByRole('button', { name: /log in/i }).click();
  await expect(page.locator('[role="dialog"]')).not.toBeVisible({ timeout: 5_000 });
  console.log('[test] Logged in.');

  // Fill & submit form
  await expect(page.getByText(/road district|outside ray county/i).first()).toBeVisible({ timeout: 5_000 });

  const nameInput = page.locator('#reporter-name');
  if (await nameInput.isVisible()) await nameInput.fill('E2E Test');

  await page.locator('#report-title').fill(`E2E ${Date.now()}`);

  const selectBtns = page.locator('.space-y-3 button[role="combobox"]');
  await selectBtns.first().click();
  await page.getByRole('option', { name: /pothole/i }).click();
  await selectBtns.nth(1).click();
  await page.locator('[role="option"]').filter({ hasText: /high/i }).first().click();

  await page.getByRole('button', { name: /submit report/i }).click();
  await expect(page.getByText('Report Submitted!', { exact: true })).toBeVisible({ timeout: 30_000 });
  console.log('[test] Report submitted!');

  await page.waitForTimeout(8000);
  logs.filter(l => l.includes('[nostr-mail]') || l.includes('[mail]')).forEach(l => console.log(`  ${l}`));

  // Verify events on local relay (no 'since' — NIP-59 randomizes timestamps)
  const localBridge = await queryRelay(LOCAL_RELAY, { kinds: [1059], '#p': [BRIDGE_PUBKEY], limit: 5 });
  console.log(`[test] Local relay: ${localBridge.length} gift wraps to bridge`);
  expect(localBridge.length, 'Local relay should have gift wraps').toBeGreaterThanOrEqual(1);

  const localSelf = await queryRelay(LOCAL_RELAY, { kinds: [1059], '#p': [pubkey], limit: 5 });
  console.log(`[test] Local relay: ${localSelf.length} self-copy`);

  // Verify events on public relays (where bridge monitors via yakihonne/camelus)
  const publicBridge = await queryRelay('wss://relay.damus.io', { kinds: [1059], '#p': [BRIDGE_PUBKEY], limit: 5 });
  console.log(`[test] relay.damus.io: ${publicBridge.length} gift wraps`);
  expect(publicBridge.length, 'Public relays should have gift wraps').toBeGreaterThanOrEqual(1);

  console.log('[test] All checks passed!');
});

test('check nmail for sent/delivered email', async ({ browser }) => {
  test.skip(!RUN_NMAIL, 'Set TEST_NMAIL=true to enable');
  const { nip19 } = await import('nostr-tools');
  const { getPublicKey } = await import('nostr-tools/pure');
  const decoded = nip19.decode(TEST_NSEC);
  const secretKey = decoded.data;
  const pubkey = getPublicKey(secretKey);
  const npub = nip19.npubEncode(pubkey);

  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('https://app.nostrmail.org/');
  await page.waitForLoadState('networkidle');

  const input = page.locator('input[type="password"], input[placeholder*="nsec"], input[placeholder*="key"], textarea').first();
  if (await input.isVisible({ timeout: 5000 }).catch(() => false)) {
    await input.fill(TEST_NSEC);
    await page.getByRole('button', { name: /login|sign in|connect|unlock/i }).first().click();
    await page.waitForTimeout(5000);
  }

  const sentLink = page.getByText(/sent/i).first();
  if (await sentLink.isVisible({ timeout: 5000 }).catch(() => false)) {
    await sentLink.click();
    await page.waitForTimeout(3000);
  }
  const sentFound = await page.getByText(/HIGH/).first().isVisible({ timeout: 10_000 }).catch(() => false);
  console.log(`[test] nmail sent: ${sentFound ? 'FOUND' : 'NOT FOUND'}`);

  const inboxLink = page.getByText(/inbox/i).first();
  if (await inboxLink.isVisible({ timeout: 3000 }).catch(() => false)) {
    await inboxLink.click();
    await page.waitForTimeout(3000);
  }
  const inboxFound = await page.getByText(/HIGH/).first().isVisible({ timeout: 15_000 }).catch(() => false);
  console.log(`[test] nmail inbox: ${inboxFound ? 'DELIVERED' : 'NOT YET'}`);

  await ctx.close();
});
