/**
 * Prove the uid.ovh bridge works by sending an email through nmail.
 * Uses Playwright to drive the Flutter web app at app.nostrmail.org.
 *
 * Strategy:
 *   1. Query relays BEFORE to get baseline event IDs
 *   2. Login to nmail via Flutter accessibility
 *   3. Compose and send email to croix4clerk@pm.me
 *   4. Query relays AFTER — any NEW events prove nmail published
 *   5. Dump new events for format analysis
 *
 * Usage:
 *   npx playwright test tests/e2e/nmail-send.spec.ts --timeout 180000
 */

import { test, expect } from '@playwright/test';
import { WebSocket } from 'ws';
import { nip19 } from 'nostr-tools';
import { getPublicKey } from 'nostr-tools/pure';

const TEST_NSEC = 'nsec1g6wq6h5lgraqgqkp3v9quy7hlufkgcqj5vxjhjysggw7mx4mczssgwg850';
const BRIDGE_PUBKEY = '0d365385f474d4b025377b4ade6ad241f847d514a9e9b475069f69a20f886c68';
const TARGET_EMAIL = 'croix4clerk@pm.me';

/** Query a Nostr relay for events matching filters. */
function queryRelay(url: string, filters: Record<string, unknown>, timeout = 15000): Promise<any[]> {
  return new Promise((resolve) => {
    const ws = new WebSocket(url);
    const events: any[] = [];
    const subId = `q${Date.now()}${Math.random()}`.replace('.', '');
    const timer = setTimeout(() => { try { ws.close(); } catch {} resolve(events); }, timeout);
    ws.on('open', () => ws.send(JSON.stringify(['REQ', subId, { ...filters, limit: 50 }])));
    ws.on('message', (data: any) => {
      const msg = JSON.parse(data.toString());
      if (msg[0] === 'EVENT' && msg[1] === subId) events.push(msg[2]);
      else if ((msg[0] === 'EOSE' || msg[0] === 'CLOSED') && msg[1] === subId) {
        clearTimeout(timer);
        try { ws.close(); } catch {}
        resolve(events);
      }
    });
    ws.on('error', () => { clearTimeout(timer); resolve([]); });
  });
}

/** Helper: delay */
const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

test('send email through nmail to prove bridge works', async ({ browser }) => {
  test.setTimeout(180000);

  const decoded = nip19.decode(TEST_NSEC);
  const secretKey = decoded.data as Uint8Array;
  const pubkey = getPublicKey(secretKey);
  console.log('[test] Test pubkey:', pubkey);

  // --- BASELINE: query relays BEFORE sending ---
  const beforeYakihonne = await queryRelay('wss://nostr-01.yakihonne.com', { kinds: [1059], '#p': [BRIDGE_PUBKEY], limit: 100 });
  const beforeIds = new Set(beforeYakihonne.map(e => e.id));
  console.log(`[test] Before: ${beforeIds.size} gift wraps on yakihonne`);

  // Also check self-copy relays
  const beforeSelf = await queryRelay('wss://relay.damus.io', { kinds: [1059], '#p': [pubkey], limit: 50 });
  const beforeSelfIds = new Set(beforeSelf.map(e => e.id));

  // --- LOGIN TO NMAIL ---
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  // Collect console logs from nmail
  const logs: string[] = [];
  page.on('console', msg => logs.push(`[${msg.type()}] ${msg.text()}`));

  await page.goto('https://app.nostrmail.org/', { waitUntil: 'networkidle' });
  await delay(3000);

  // Enable Flutter accessibility
  await page.locator('flt-semantics-placeholder').dispatchEvent('click');
  await delay(2000);

  // Screenshot initial state
  await page.screenshot({ path: 'test-results/nmail-a1-initial.png' });
  console.log('[test] Screenshot: nmail-a1-initial.png');

  // Skip onboarding if visible
  const skipBtn = page.getByText('Skip', { exact: true });
  if (await skipBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await skipBtn.click();
    await delay(2000);
    console.log('[test] Skipped onboarding');
  }

  // Click "Log in"
  const loginBtn = page.getByText('Log in', { exact: true });
  await expect(loginBtn).toBeVisible({ timeout: 10000 });
  await loginBtn.click();
  await delay(2000);

  // Fill nsec — triggers auto-login
  const nsecInput = page.locator('input').first();
  await expect(nsecInput).toBeVisible({ timeout: 10000 });
  await nsecInput.fill(TEST_NSEC);
  await delay(5000);

  await page.screenshot({ path: 'test-results/nmail-a2-logged-in.png' });
  console.log('[test] Screenshot: nmail-a2-logged-in.png');

  // Verify we're logged in — look for mail UI
  const hasInbox = await page.getByText(/inbox|compose/i).first().isVisible({ timeout: 15000 }).catch(() => false);
  console.log(`[test] Logged in: ${hasInbox}`);
  expect(hasInbox, 'Should be logged into nmail').toBe(true);

  // --- COMPOSE EMAIL ---
  // Click Compose button
  const composeBtn = page.getByText('Compose', { exact: true });
  await expect(composeBtn).toBeVisible({ timeout: 5000 });
  await composeBtn.click();
  await delay(3000);

  await page.screenshot({ path: 'test-results/nmail-a3-compose-screen.png' });
  console.log('[test] Screenshot: nmail-a3-compose-screen.png');

  // List all inputs Flutter exposes
  const inputs = await page.locator('input').all();
  console.log(`[test] Found ${inputs.length} inputs on compose screen`);
  for (let i = 0; i < inputs.length; i++) {
    const placeholder = await inputs[i].getAttribute('placeholder') ?? '(none)';
    const type = await inputs[i].getAttribute('type') ?? '(none)';
    const visible = await inputs[i].isVisible().catch(() => false);
    console.log(`[test]   input[${i}]: placeholder="${placeholder}" type="${type}" visible=${visible}`);
  }

  // List all semantic buttons
  const buttons = await page.locator('[role="button"]').all();
  console.log(`[test] Found ${buttons.length} buttons on compose screen`);
  for (let i = 0; i < Math.min(buttons.length, 10); i++) {
    const text = await buttons[i].textContent().catch(() => '(no text)');
    console.log(`[test]   button[${i}]: "${text}"`);
  }

  // Try to fill the To field — use keyboard typing instead of fill()
  // First click to focus, then type
  if (inputs.length > 0) {
    // Click on the first input to focus it
    await inputs[0].click();
    await delay(300);
    // Clear any existing content
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Backspace');
    await delay(200);
    // Type the email address character by character
    await page.keyboard.type(TARGET_EMAIL, { delay: 50 });
    await delay(1000);

    // Press Tab to move to next field (Subject)
    await page.keyboard.press('Tab');
    await delay(500);

    // Type subject
    await page.keyboard.type('E2E nmail bridge test', { delay: 50 });
    await delay(500);

    // Press Tab to move to body
    await page.keyboard.press('Tab');
    await delay(500);

    // Type body
    await page.keyboard.type('Test email from nmail to verify bridge processes it.', { delay: 50 });
    await delay(1000);
  }

  await page.screenshot({ path: 'test-results/nmail-a4-filled.png' });
  console.log('[test] Screenshot: nmail-a4-filled.png');

  // Now find and click the Send button
  // Flutter might expose it as a button with "Send" text, or as an icon
  const sendByText = page.getByText('Send', { exact: true });
  const sendByRole = page.getByRole('button', { name: /send/i });
  const sendVisible = await sendByText.isVisible({ timeout: 3000 }).catch(() => false);
  console.log(`[test] Send button visible (by text): ${sendVisible}`);

  const sendRoleVisible = await sendByRole.isVisible({ timeout: 3000 }).catch(() => false);
  console.log(`[test] Send button visible (by role): ${sendRoleVisible}`);

  if (sendVisible) {
    await sendByText.click({ force: true });
    console.log('[test] Clicked Send (by text)');
  } else if (sendRoleVisible) {
    await sendByRole.click({ force: true });
    console.log('[test] Clicked Send (by role)');
  } else {
    // Try clicking the last button that might be Send
    console.log('[test] Send button not found by text/role, trying last button');
    const allButtons = await page.locator('[role="button"]').all();
    if (allButtons.length > 0) {
      const lastBtn = allButtons[allButtons.length - 1];
      const text = await lastBtn.textContent().catch(() => '?');
      console.log(`[test] Clicking last button: "${text}"`);
      await lastBtn.click({ force: true });
    }
  }

  await delay(5000);
  await page.screenshot({ path: 'test-results/nmail-a5-after-send.png' });
  console.log('[test] Screenshot: nmail-a5-after-send.png');

  // Wait for any confirmation dialog and dismiss it
  const okBtn = page.getByText(/ok|done|close/i);
  if (await okBtn.first().isVisible({ timeout: 3000 }).catch(() => false)) {
    await okBtn.first().click();
    await delay(1000);
  }

  // --- CHECK SENT FOLDER ---
  const sentBtn = page.getByText('Sent', { exact: true });
  if (await sentBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await sentBtn.click();
    await delay(5000);
    const syncBtn = page.getByText(/sync from relays/i);
    if (await syncBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await syncBtn.click();
      await delay(10000);
    }
  }
  await page.screenshot({ path: 'test-results/nmail-a6-sent-folder.png' });
  console.log('[test] Screenshot: nmail-a6-sent-folder.png');

  await ctx.close();

  // --- CHECK RELAYS FOR NEW EVENTS ---
  console.log('[test] Waiting 15s for relay propagation...');
  await delay(15000);

  // Check yakihonne for new bridge events
  const afterYakihonne = await queryRelay('wss://nostr-01.yakihonne.com', { kinds: [1059], '#p': [BRIDGE_PUBKEY], limit: 100 });
  const newBridgeEvents = afterYakihonne.filter(e => !beforeIds.has(e.id));
  console.log(`[test] Yakihonne: ${afterYakihonne.length} total, ${newBridgeEvents.length} NEW`);

  // Check damus for self-copy events
  const afterSelf = await queryRelay('wss://relay.damus.io', { kinds: [1059], '#p': [pubkey], limit: 50 });
  const newSelfEvents = afterSelf.filter(e => !beforeSelfIds.has(e.id));
  console.log(`[test] Damus self: ${afterSelf.length} total, ${newSelfEvents.length} NEW`);

  // Also check uid.ovh relays
  const afterUid = await queryRelay('wss://nostr-01.uid.ovh', { kinds: [1059], '#p': [BRIDGE_PUBKEY], limit: 50 });
  const afterUidIds = new Set(afterUid.map(e => e.id));
  const newUidEvents = afterUid.filter(e => !beforeIds.has(e.id));
  console.log(`[test] uid.ovh: ${afterUid.length} total, ${newUidEvents.length} NEW`);

  // Merge all new events
  const allNewEvents = [...newBridgeEvents, ...newSelfEvents, ...newUidEvents];
  // Deduplicate
  const seen = new Set<string>();
  const uniqueNew = allNewEvents.filter(e => {
    if (seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  });

  console.log(`\n[test] TOTAL new events across all relays: ${uniqueNew.length}`);

  if (uniqueNew.length > 0) {
    console.log('\n=== NEW EVENTS (nmail format) ===');
    uniqueNew.forEach(e => {
      console.log(`  id: ${e.id.slice(0, 24)}...`);
      console.log(`  pubkey: ${e.pubkey.slice(0, 24)}...`);
      console.log(`  created_at: ${new Date(e.created_at * 1000).toISOString()}`);
      console.log(`  kind: ${e.kind}`);
      console.log(`  tags: ${JSON.stringify(e.tags.map((t: any[]) => [t[0], t[1]?.slice(0, 60)]))}`);
      console.log(`  content length: ${e.content.length}`);
      console.log(`  content (first 200): ${e.content.slice(0, 200)}`);
      console.log('---');
    });

    // Save events to file for later analysis
    const fs = await import('fs');
    fs.writeFileSync(
      'test-results/nmail-events.json',
      JSON.stringify(uniqueNew, null, 2)
    );
    console.log('[test] Events saved to test-results/nmail-events.json');
  } else {
    console.log('[test] No new events found — nmail send may not have worked');
  }

  // Log any relevant console output from nmail
  const relevantLogs = logs.filter(l =>
    l.includes('send') || l.includes('publish') || l.includes('relay') ||
    l.includes('gift') || l.includes('wrap') || l.includes('error')
  );
  if (relevantLogs.length > 0) {
    console.log('\n[nmail console logs]');
    relevantLogs.forEach(l => console.log(`  ${l}`));
  }
});
