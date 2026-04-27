import { test, expect } from './fixtures';

test.describe.configure({ mode: 'serial', timeout: 60000 });

test.describe('财务对账E2E测试', () => {
  test('出货对账列表页面加载', async ({ authenticatedPage: page }) => {
    await page.goto('/finance/shipment-reconciliation');
    await page.waitForLoadState('networkidle');
    expect(page.url()).not.toContain('/login');
    await expect(page.locator('.ant-layout-content, main, #root > div').first())
      .toBeVisible({ timeout: 20000 });
  });

  test('物料对账列表页面加载', async ({ authenticatedPage: page }) => {
    await page.goto('/finance/material-reconciliation');
    await page.waitForLoadState('networkidle');
    expect(page.url()).not.toContain('/login');
    await expect(page.locator('.ant-layout-content, main, #root > div').first())
      .toBeVisible({ timeout: 20000 });
  });
});

test.describe('款式管理E2E测试', () => {
  test('款式列表页面加载', async ({ authenticatedPage: page }) => {
    await page.goto('/style/info');
    await page.waitForLoadState('networkidle');
    expect(page.url()).not.toContain('/login');
    await expect(page.locator('.ant-layout-content, main, #root > div').first())
      .toBeVisible({ timeout: 20000 });
  });

  test('款式详情页面加载', async ({ authenticatedPage: page }) => {
    await page.goto('/style/info');
    await page.waitForLoadState('networkidle');
    expect(page.url()).not.toContain('/login');
    const firstRow = await page.$('table tbody tr:first-child');
    if (firstRow) {
      await firstRow.click();
      await page.waitForLoadState('networkidle');
    }
    await expect(page.locator('.ant-layout-content, main, #root > div').first())
      .toBeVisible({ timeout: 20000 });
  });
});

test.describe('仓库管理E2E测试', () => {
  test('成品库存页面加载', async ({ authenticatedPage: page }) => {
    await page.goto('/warehouse/finished-inventory');
    await page.waitForLoadState('networkidle');
    expect(page.url()).not.toContain('/login');
    await expect(page.locator('.ant-layout-content, main, #root > div').first())
      .toBeVisible({ timeout: 20000 });
  });

  test('仓库仪表板页面加载', async ({ authenticatedPage: page }) => {
    await page.goto('/warehouse/dashboard');
    await page.waitForLoadState('networkidle');
    expect(page.url()).not.toContain('/login');
    await expect(page.locator('.ant-layout-content, main, #root > div').first())
      .toBeVisible({ timeout: 20000 });
  });
});

test.describe('仪表板E2E测试', () => {
  test('主仪表板页面加载', async ({ authenticatedPage: page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    expect(page.url()).not.toContain('/login');
    await expect(page.locator('.ant-layout-content, main, #root > div').first())
      .toBeVisible({ timeout: 20000 });
  });
});

test.describe('系统管理E2E测试', () => {
  test('用户管理页面加载', async ({ authenticatedPage: page }) => {
    await page.goto('/system/user');
    await page.waitForLoadState('networkidle');
    expect(page.url()).not.toContain('/login');
    await expect(page.locator('.ant-layout-content, main, #root > div').first())
      .toBeVisible({ timeout: 20000 });
  });

  test('角色管理页面加载', async ({ authenticatedPage: page }) => {
    await page.goto('/system/role');
    await page.waitForLoadState('networkidle');
    expect(page.url()).not.toContain('/login');
    await expect(page.locator('.ant-layout-content, main, #root > div').first())
      .toBeVisible({ timeout: 20000 });
  });
});
