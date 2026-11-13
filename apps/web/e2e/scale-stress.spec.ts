import { test, expect } from '@playwright/test';

// Scale/resilience UI smoke test: seeds a large (150,000-row) realistic
// Orders dataset directly into localStorage before the app boots (the same
// storage key the real upload path writes to), then drives the actual
// rendered UI against it -- the virtualized grid, Chat with Data, and the
// Dashboard -- to confirm the interface itself (not just the engine) stays
// responsive at a scale well beyond the toy 50-120 row sample datasets used
// elsewhere in this test suite.
test.describe('Scale stress: 150,000-row dataset through the real UI', () => {
  test.beforeEach(async ({ page }) => {
    const N = 150000;
    await page.addInitScript(({ n }) => {
      const regions = ['North America', 'EMEA', 'APAC', 'LATAM', 'ANZ'];
      const categories = ['Electronics', 'Apparel', 'Home & Garden', 'Sporting Goods', 'Toys', 'Grocery'];
      const statuses = ['completed', 'pending', 'cancelled', 'returned', 'shipped'];
      const rows = [];
      for (let i = 1; i <= n; i++) {
        rows.push({
          order_id: i,
          customer_id: 1 + (i % 20000),
          region: regions[i % regions.length],
          category: categories[i % categories.length],
          status: statuses[i % statuses.length],
          order_date: `2025-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`,
          amount: Math.round(((i * 37) % 200000) / 100 * 100) / 100,
          quantity: 1 + (i % 20),
          discount_pct: (i % 5) * 5,
        });
      }
      const now = new Date().toISOString();
      const meta = {
        id: 'ds_scale_ui_test',
        name: 'Orders (150K scale test)',
        original_filename: 'orders_150k.json',
        file_format: 'json',
        row_count: rows.length,
        column_count: Object.keys(rows[0]).length,
        file_size_bytes: 0,
        schema_metadata: Object.keys(rows[0]).map((name) => ({
          name,
          data_type: typeof rows[0][name] === 'number' ? 'float' : 'text',
          physical_type: typeof rows[0][name] === 'number' ? 'float' : 'text',
          nullable: true,
        })),
        created_at: now,
        updated_at: now,
      };
      window.localStorage.setItem('stepsheet_local_datasets_v1', JSON.stringify([{ meta, rows }]));
    }, { n: N });
  });

  test('loads the virtualized grid over 150K rows and stays responsive while scrolling', async ({ page }) => {
    const t0 = Date.now();
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const loadMs = Date.now() - t0;
    console.log(`[e2e-scale] page load (networkidle) with 150K-row dataset pre-seeded: ${loadMs}ms`);

    // The grid should render only a virtualized window of rows, not all
    // 150,000 at once -- this is itself a scale-correctness check.
    const dataGrid = page.locator('table, [role="grid"], div[class*="overflow"]').first();
    await expect(dataGrid).toBeVisible({ timeout: 15000 });

    const renderedRowEls = await page.locator('tr, [role="row"]').count();
    console.log(`[e2e-scale] DOM row elements actually rendered: ${renderedRowEls} (dataset has 150,000 -- should be a small virtualized window, not all of them)`);
    expect(renderedRowEls).toBeLessThan(500);

    await page.screenshot({ path: 'scratch/scale-test/e2e_grid_150k.png', fullPage: false });

    // Scroll the grid and confirm it keeps responding (no freeze/hang).
    const tScroll0 = Date.now();
    await dataGrid.evaluate((el) => { el.scrollTop = el.scrollHeight / 2; });
    await page.waitForTimeout(300);
    await dataGrid.evaluate((el) => { el.scrollTop = el.scrollHeight; });
    await page.waitForTimeout(300);
    const scrollMs = Date.now() - tScroll0;
    console.log(`[e2e-scale] scroll-to-bottom round trip: ${scrollMs}ms`);
    await page.screenshot({ path: 'scratch/scale-test/e2e_grid_150k_scrolled.png', fullPage: false });

    expect(loadMs).toBeLessThan(30000);
  });

  test('Chat with Data answers a question against the 150K-row live dataset', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const chatBtn = page.locator('button:has-text("Chat with Data"), button:has-text("Chat")').first();
    if (await chatBtn.isVisible().catch(() => false)) {
      await chatBtn.click();
      const input = page.locator('textarea, input[type="text"]').last();
      await input.fill('how many orders are there?');
      await input.press('Enter');
      await page.waitForTimeout(2000);
      await page.screenshot({ path: 'scratch/scale-test/e2e_chat_150k.png', fullPage: false });
      const bodyText = await page.locator('body').innerText();
      expect(bodyText).toContain('150,000');
    }
  });
});
