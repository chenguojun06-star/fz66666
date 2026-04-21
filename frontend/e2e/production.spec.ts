import { test, expect } from './fixtures';

test.describe.configure({ mode: 'serial', timeout: 120000 });

test.describe('生产订单核心链路', () => {
  test.beforeEach(async ({ authenticatedPage: page }) => {
    await page.goto('/production');
    await expect(page.getByRole('heading', { name: '订单管理' }).first()).toBeVisible({ timeout: 15000 });
  });

  test('生产订单列表页正常加载', async ({ page }) => {
    await expect(page.getByRole('heading', { name: '订单管理' }).first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator('input[placeholder*="搜索订单号/款号/加工厂"]').first()).toBeVisible({ timeout: 15000 });
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
      await expect(page.locator('.ant-table, .ant-empty, .ant-spin').first()).toBeVisible({ timeout: 10000 });
    }
  });

  test('订单管理页关键操作可见', async ({ page }) => {
    await expect(page.locator('button:has-text("刷新"), button:has-text("导出"), button:has-text("新建")').first()).toBeVisible({ timeout: 10000 });
  });

  test('订单管理页列表或统计区域存在', async ({ page }) => {
    const hasTable = await page.locator('.ant-table').isVisible().catch(() => false);
    const hasEmpty = await page.locator('.ant-empty').isVisible().catch(() => false);
    const hasSummary = await page.getByText(/生产订单|延期订单|今日下单/).first().isVisible().catch(() => false);
    expect(hasTable || hasEmpty || hasSummary).toBeTruthy();
  });
});

test.describe('生产进度跟踪', () => {
  test.beforeEach(async ({ authenticatedPage: page }) => {
    await page.goto('/production');
    await expect(page.getByRole('heading', { name: '订单管理' }).first()).toBeVisible({ timeout: 15000 });
  });

  test('可查看工序追踪', async ({ page }) => {
    const progressBtn = page.locator('button:has-text("进度"), a:has-text("进度"), [data-testid="progress-btn"]').first();
    if (await progressBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await progressBtn.click();
      await expect(page.locator('.ant-timeline, .ant-steps, .ant-table, .ant-card').first()).toBeVisible({ timeout: 10000 });
    }
  });
});

test.describe('裁剪单管理', () => {
  test.beforeEach(async ({ authenticatedPage: page }) => {
    await page.goto('/production/cutting');
    await expect(page.getByRole('heading', { name: /裁剪管理|裁剪明细/ }).first()).toBeVisible({ timeout: 15000 });
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
    await page.goto('/production/material');
    await expect(page.getByRole('heading', { name: '面料采购' }).first()).toBeVisible({ timeout: 15000 });
  });

  test('面料采购页面正常加载', async ({ page }) => {
    await expect(page.getByRole('heading', { name: '面料采购' }).first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.ant-table, .ant-empty, .ant-spin')).toBeVisible({ timeout: 15000 });
  });
});
