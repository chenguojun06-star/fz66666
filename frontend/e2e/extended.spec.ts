import { test, expect } from '@playwright/test';
import { authenticatedFixture } from './fixtures';

test.describe('财务对账E2E测试', () => {
  test('出货对账列表页面加载', async ({ page }) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { token } = await authenticatedFixture(page);
    await page.goto('/finance/shipment-reconciliation');
    await page.waitForLoadState('networkidle');
    const title = await page.textContent('h1, .page-title, [data-testid="page-title"]');
    expect(title).toBeTruthy();
  });

  test('物料对账列表页面加载', async ({ page }) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { token } = await authenticatedFixture(page);
    await page.goto('/finance/material-reconciliation');
    await page.waitForLoadState('networkidle');
    const title = await page.textContent('h1, .page-title, [data-testid="page-title"]');
    expect(title).toBeTruthy();
  });
});

test.describe('款式管理E2E测试', () => {
  test('款式列表页面加载', async ({ page }) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { token } = await authenticatedFixture(page);
    await page.goto('/style/info');
    await page.waitForLoadState('networkidle');
    const title = await page.textContent('h1, .page-title, [data-testid="page-title"]');
    expect(title).toBeTruthy();
  });

  test('款式详情页面加载', async ({ page }) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { token } = await authenticatedFixture(page);
    await page.goto('/style/info');
    await page.waitForLoadState('networkidle');
    const firstRow = await page.$('table tbody tr:first-child');
    if (firstRow) {
      await firstRow.click();
      await page.waitForLoadState('networkidle');
    }
  });
});

test.describe('仓库管理E2E测试', () => {
  test('成品库存页面加载', async ({ page }) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { token } = await authenticatedFixture(page);
    await page.goto('/warehouse/finished-inventory');
    await page.waitForLoadState('networkidle');
    const title = await page.textContent('h1, .page-title, [data-testid="page-title"]');
    expect(title).toBeTruthy();
  });

  test('仓库仪表板页面加载', async ({ page }) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { token } = await authenticatedFixture(page);
    await page.goto('/warehouse/dashboard');
    await page.waitForLoadState('networkidle');
    const title = await page.textContent('h1, .page-title, [data-testid="page-title"]');
    expect(title).toBeTruthy();
  });
});

test.describe('仪表板E2E测试', () => {
  test('主仪表板页面加载', async ({ page }) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { token } = await authenticatedFixture(page);
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    const title = await page.textContent('h1, .page-title, [data-testid="page-title"]');
    expect(title).toBeTruthy();
  });
});

test.describe('系统管理E2E测试', () => {
  test('用户管理页面加载', async ({ page }) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { token } = await authenticatedFixture(page);
    await page.goto('/system/user');
    await page.waitForLoadState('networkidle');
    const title = await page.textContent('h1, .page-title, [data-testid="page-title"]');
    expect(title).toBeTruthy();
  });

  test('角色管理页面加载', async ({ page }) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { token } = await authenticatedFixture(page);
    await page.goto('/system/role');
    await page.waitForLoadState('networkidle');
    const title = await page.textContent('h1, .page-title, [data-testid="page-title"]');
    expect(title).toBeTruthy();
  });
});
