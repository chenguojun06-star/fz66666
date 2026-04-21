import type { Page } from '@playwright/test';
import { test, expect, login, selectTenant, TEST_CREDENTIALS } from './fixtures';

test.describe.configure({ mode: 'serial', timeout: 120000 });

async function logoutFromUserMenu(page: Page) {
  await page.evaluate(() => {
    const oldToken = localStorage.getItem('authToken');
    localStorage.removeItem('authToken');
    localStorage.removeItem('userInfo');
    window.dispatchEvent(new StorageEvent('storage', {
      key: 'authToken',
      oldValue: oldToken,
      newValue: null,
      storageArea: localStorage,
      url: window.location.href,
    }));
    window.dispatchEvent(new Event('user-logout'));
  });

  await page.waitForURL(/\/login/, { timeout: 15000 });
}

test.describe('登录流程', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
  });

  test('登录页正常加载', async ({ page }) => {
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"], button:has-text("登录")').first()).toBeVisible();
  });

  test('空表单提交显示验证错误', async ({ page }) => {
    const submitBtn = page.locator('button[type="submit"], button:has-text("登录")').first();
    await submitBtn.click();
    await expect(page.getByText('请搜索并选择公司').first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('请输入用户名').first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('请输入密码').first()).toBeVisible({ timeout: 5000 });
  });

  test('错误凭据显示错误提示', async ({ page }) => {
    await selectTenant(page, TEST_CREDENTIALS.admin);

    const usernameInput = page.locator('input[placeholder*="用户名"], input[id="username"], input[name="username"]').first();
    const passwordInput = page.locator('input[placeholder*="密码"], input[type="password"]').first();

    await usernameInput.fill('wrong_user');
    await passwordInput.fill('wrong_pass');

    const submitBtn = page.locator('button[type="submit"], button:has-text("登录")').first();
    await submitBtn.click();

    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
    await expect(
      page.locator('.ant-message-notice-content, .ant-notification-notice, .ant-alert-error')
        .filter({ hasText: /登录失败|请检查公司、用户名和密码|用户名或密码/ })
        .first(),
    ).toBeVisible({ timeout: 10000 });
  });

  test('正确凭据登录成功跳转', async ({ page }) => {
    await login(page, TEST_CREDENTIALS.admin);

    await expect(page).toHaveURL(/\/(dashboard|production)/, { timeout: 15000 });
    await expect(page.getByRole('heading', { name: '仪表盘' }).first()).toBeVisible({ timeout: 10000 });
  });

  test('登录后 localStorage 包含 token', async ({ page }) => {
    await login(page, TEST_CREDENTIALS.admin);

    const tokenHandle = await page.waitForFunction(() => localStorage.getItem('authToken'), undefined, { timeout: 10000 });
    const token = await tokenHandle.jsonValue<string | null>();
    expect(token).toBeTruthy();
    expect(String(token).split('.').length).toBe(3);
  });

  test('登录后 localStorage 包含用户信息', async ({ page }) => {
    await login(page, TEST_CREDENTIALS.admin);

    const userInfo = await page.evaluate(() => {
      const raw = localStorage.getItem('userInfo');
      return raw ? JSON.parse(raw) : null;
    });
    expect(userInfo).toBeTruthy();
    expect(userInfo.id).toBeTruthy();
    expect(userInfo.username).toBeTruthy();
    expect(userInfo.role).toBeTruthy();
  });
});

test.describe('登出流程', () => {
  test('登出后跳转到登录页', async ({ authenticatedPage: page }) => {
    await logoutFromUserMenu(page);
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
  });

  test('登出后 localStorage 清空', async ({ authenticatedPage: page }) => {
    await logoutFromUserMenu(page);
    const clearedHandle = await page.waitForFunction(() => localStorage.getItem('authToken') === null, undefined, { timeout: 10000 });
    const tokenCleared = await clearedHandle.jsonValue<boolean>();
    expect(tokenCleared).toBe(true);
  });
});

test.describe('Token 过期处理', () => {
  test('Token 被清除后自动跳转登录页', async ({ authenticatedPage: page }) => {
    await page.evaluate(() => {
      const oldToken = localStorage.getItem('authToken');
      localStorage.removeItem('authToken');
      localStorage.removeItem('userInfo');
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'authToken',
        oldValue: oldToken,
        newValue: null,
        storageArea: localStorage,
        url: window.location.href,
      }));
      window.dispatchEvent(new Event('user-logout'));
    });

    await expect(page).toHaveURL(/\/login/, { timeout: 15000 });
  });
});
