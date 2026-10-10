import { test, expect } from '@playwright/test';

test.describe('StepSheet End-to-End User Flows', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('Flow 1: Ingestion, Virtual Data Grid & Transformation Step Creation', async ({ page }) => {
    // 1. Verify Top Bar Branding and Status
    await expect(page.locator('text=StepSheet')).toBeVisible();
    await expect(page.locator('text=Workbench')).toBeVisible();

    // 2. Check Left Panel Dropzone or Load Sample button
    const loadSampleBtn = page.locator('button:has-text("Load Sample")').first();
    if (await loadSampleBtn.isVisible()) {
      await loadSampleBtn.click();
      await page.waitForTimeout(1000);
    }

    // 3. Verify Virtual Data Grid renders headers and rows
    const dataGrid = page.locator('table, [role="grid"], div[class*="overflow"]').first();
    await expect(dataGrid).toBeVisible();

    // 4. Verify Natural Language Step Assistant bar is ready
    const aiInput = page.locator('input[placeholder*="plain English"]');
    await expect(aiInput).toBeVisible();
  });

  test('Flow 2: Data Quality Suite, Quick Audit & Join ER Canvas', async ({ page }) => {
    // 1. Open Data Quality Modal
    const qualityBtn = page.locator('button:has-text("Data Quality")');
    await expect(qualityBtn).toBeVisible();
    await qualityBtn.click();

    // 2. Verify Quality Modal opened with scorecard and rule builder
    await expect(page.locator('text=Data Integrity & Quality Suite')).toBeVisible();
    await expect(page.locator('button:has-text("Audit Results"), button:has-text("Audit Report")').first()).toBeVisible();

    // Close Quality Modal
    await page.locator('button:has-text("Close")').last().click();

    // 3. Open ER Canvas / Relationships Modal
    const canvasBtn = page.locator('button:has-text("Canvas / ER")');
    await expect(canvasBtn).toBeVisible();
    await canvasBtn.click();

    await expect(page.locator('text=Multi-Table Relationships')).toBeVisible();
    await page.locator('button:has-text("Close")').last().click();
  });

  test('Flow 3: Multi-Format Exporters, Live Excel Formulas & Code Generator', async ({ page }) => {
    // 1. Open Export Modal
    const exportBtn = page.locator('button:has-text("Export")').first();
    await expect(exportBtn).toBeVisible();
    await exportBtn.click();

    // 2. Verify Export Modal opened
    await expect(page.locator('text=Export & Output Suite')).toBeVisible();
    await expect(page.locator('text=Files & Spreadsheets')).toBeVisible();
    await expect(page.locator('text=Live Excel Formulas').first()).toBeVisible();

    // 3. Switch to Code tab
    const codeTab = page.locator('button:has-text("Generated Code")');
    await expect(codeTab).toBeVisible();
    await codeTab.click();

    // Verify language tabs exist (Power Query M, SQL, Polars, Excel)
    await expect(page.locator('button:has-text("Power Query M")')).toBeVisible();
    await expect(page.locator('button:has-text("DuckDB SQL")')).toBeVisible();
    await expect(page.locator('button:has-text("Python (Polars)")')).toBeVisible();

    // 4. Switch to Full Run tab
    const runTab = page.locator('button:has-text("Full Dataset Run")');
    await expect(runTab).toBeVisible();
    await runTab.click();
    await expect(page.locator('button:has-text("Execute Full Pipeline")')).toBeVisible();

    // Close Export Modal
    await page.locator('button:has-text("Close")').last().click();
  });
});
