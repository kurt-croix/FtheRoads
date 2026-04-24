import { test, expect } from '@playwright/test';

test.describe('Report form', () => {
  test('shows report form elements on the map page', async ({ page }) => {
    await page.goto('/');
    // The map page should load with the report button/form
    await expect(page.getByRole('heading', { name: /ftheroads/i })).or(page.getByText(/report/i)).toBeVisible({ timeout: 10000 });
  });

  test('report form validates required fields', async ({ page }) => {
    await page.goto('/');
    // Wait for page to load
    await page.waitForTimeout(2000);

    // Look for submit button (may need to click map first to open form)
    const submitBtn = page.getByRole('button', { name: /submit|report/i });
    if (await submitBtn.isVisible()) {
      submitBtn.click();
      // Should show validation error
      await expect(page.getByText(/required/i).or(page.getByText(/select/i))).toBeVisible({ timeout: 3000 });
    }
  });
});

test.describe('Lambda email endpoint', () => {
  test('rejects requests without valid origin', async ({ request }) => {
    const response = await request.post(process.env.VITE_LAMBDA_URL || 'http://localhost:9999', {
      headers: { 'Content-Type': 'application/json' },
      data: { to: 'test@test.com', subject: 'Test', text: 'Test' },
    });
    // Function URL should reject without valid origin
    expect([403, 500]).toContain(response.status());
  });

  test('rejects requests with missing fields', async ({ request }) => {
    const url = process.env.VITE_LAMBDA_URL;
    if (!url) return; // Skip if no Lambda URL configured

    const response = await request.post(url, {
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://ftheroads.com',
      },
      data: { to: 'test@test.com' },
    });
    expect(response.status()).toBe(400);
  });
});
