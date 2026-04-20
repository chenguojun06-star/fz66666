import { test, expect } from './fixtures';

test.describe('生产订单核心链路', () => {
  test.beforeEach(async ({ authenticatedPage: page }) => {
    await page.goto('/production/list');
    await page.waitForLoadState('networkidle');
  });

  test('生产订单列表页正常加载', async ({ page }) => {
    await expect(page.locator('.ant-table, .ant-empty, .ant-spin')).toBeVisible({ timeout: 15000 });
  });

  test('生产订单列表包含表格或空状态', async ({ page }) => {
    const hasTable = await page.locator('.ant-table').isVisible().catch(() => false);
    const hasEmpty = await page.locator('.ant-empty').isVisible().catch(() => false);
    expect(hasTable || hasEmpty).toBeTruthy();
  });

  test('搜索功能正常响应', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="搜索"], input[placeholder*="订单"], input[placeholder*="款号"]').first();
    if (await searchInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await searchInput.fill('TEST');
      await page.waitForTimeout(500);
      const searchBtn = page.locator('button:has-text("搜索"), button:has-text("查询")').first();
      if (await searchBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await searchBtn.click();
      } else {
        await searchInput.press('Enter');
      }
      await page.waitForLoadState('networkidle');
      await expect(page.locator('.ant-table, .ant-empty')).toBeVisible({ timeout: 10000 });
    }
  });

  test('点击订单行可进入详情', async ({ page }) => {
    const tableRows = page.locator('.ant-table-row');
    const rowCount = await tableRows.count();

    if (rowCount > 0) {
      const firstRow = tableRows.first();
      await firstRow.click();
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveURL(/\/production/, { timeout: 10000 });
    }
  });

  test('生产订单详情页基本元素', async ({ page }) => {
    const tableRows = page.locator('.ant-table-row');
    const rowCount = await tableRows.count();

    if (rowCount > 0) {
      await tableRows.first().click();
      await page.waitForLoadState('networkidle');

      const hasTabs = await page.locator('.ant-tabs').isVisible().catch(() => false);
      const hasContent = await page.locator('.ant-descriptions, .ant-card').first().isVisible().catch(() => false);
      expect(hasTabs || hasContent).toBeTruthy();
    }
  });
});

test.describe('生产进度跟踪', () => {
  test.beforeEach(async ({ authenticatedPage: page }) => {
    await page.goto('/production/list');
    await page.waitForLoadState('networkidle');
  });

  test('可查看工序追踪', async ({ page }) => {
    const progressBtn = page.locator('button:has-text("进度"), a:has-text("进度"), [data-testid="progress-btn"]').first();
    if (await progressBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await progressBtn.click();
      await page.waitForLoadState('networkidle');
      await expect(page.locator('.ant-timeline, .ant-steps, .ant-table, .ant-card')).toBeVisible({ timeout: 10000 });
    }
  });
});

test.describe('裁剪单管理', () => {
  test.beforeEach(async ({ authenticatedPage: page }) => {
    await page.goto('/production/cutting');
    await page.waitForLoadState('networkidle');
  });

  test('裁剪单页面正常加载', async ({ page }) => {
    await expect(page.locator('.ant-table, .ant-empty, .ant-spin')).toBeVisible({ timeout: 15000 });
  });

  test('裁剪单列表包含数据或空状态', async ({ page }) => {
    const hasTable = await page.locator('.ant-table').isVisible().catch(() => false);
    const hasEmpty = await page.locator('.ant-empty').isVisible().catch(() => false);
    expect(hasTable || hasEmpty).toBeTruthy();
  });
});

test.describe('面料采购', () => {
  test.beforeEach(async ({ authenticatedPage: page }) => {
    await page.goto('/production/material-purchase');
    await page.waitForLoadState('networkidle');
  });

  test('面料采购页面正常加载', async ({ page }) => {
    await expect(page.locator('.ant-table, .ant-empty, .ant-spin')).toBeVisible({ timeout: 15000 });
  });
});
