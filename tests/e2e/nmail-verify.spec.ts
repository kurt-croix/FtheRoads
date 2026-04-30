import { test, expect } from '@playwright/test';

const TEST_NSEC = 'nsec1g6wq6h5lgraqgqkp3v9quy7hlufkgcqj5vxjhjysggw7mx4mczssgwg850';

test('verify nmail sent folder contents', async ({ browser }) => {
  test.setTimeout(60000);
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('https://app.nostrmail.org/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  // Enable accessibility + skip onboarding + login
  await page.locator('flt-semantics-placeholder').dispatchEvent('click');
  await page.waitForTimeout(2000);
  await page.getByText('Skip', { exact: true }).click();
  await page.waitForTimeout(2000);
  await page.getByText('Log in', { exact: true }).click();
  await page.waitForTimeout(2000);
  await page.locator('input').first().fill(TEST_NSEC);
  await page.waitForTimeout(5000);

  // Go to sent and sync
  await page.getByText('Sent', { exact: true }).click();
  await page.waitForTimeout(3000);
  const syncBtn = page.getByText(/sync from relays/i);
  if (await syncBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await syncBtn.click();
    await page.waitForTimeout(10000);
  }

  await page.screenshot({ path: 'test-results/nmail-verify-sent.png' });

  // Dump all text we can get
  const text = await page.evaluate(() => document.body.innerText);
  console.log('nmail page text:\n', text);

  await ctx.close();
});
