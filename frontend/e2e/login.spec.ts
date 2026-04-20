import { test, expect, login, TEST_CREDENTIALS } from './fixtures';

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
    await expect(page.locator('.ant-form-item-explain-error, .ant-form-item-has-error')).toBeVisible({ timeout: 5000 });
  });

  test('错误凭据显示错误提示', async ({ page }) => {
    const usernameInput = page.locator('input[placeholder*="用户名"], input[id="username"], input[name="username"]').first();
    const passwordInput = page.locator('input[placeholder*="密码"], input[type="password"]').first();

    await usernameInput.fill('wrong_user');
    await passwordInput.fill('wrong_pass');

    const submitBtn = page.locator('button[type="submit"], button:has-text("登录")').first();
    await submitBtn.click();

    await expect(page.locator('.ant-message-error, .ant-notification-error, .ant-alert-error')).toBeVisible({ timeout: 10000 });
  });

  test('正确凭据登录成功跳转', async ({ page }) => {
    await login(page, TEST_CREDENTIALS.admin);

    await expect(page).toHaveURL(/\/(dashboard|production)/, { timeout: 15000 });
    await expect(page.locator('.ant-layout')).toBeVisible({ timeout: 10000 });
  });

  test('登录后 localStorage 包含 token', async ({ page }) => {
    await login(page, TEST_CREDENTIALS.admin);

    const token = await page.evaluate(() => localStorage.getItem('authToken'));
    expect(token).toBeTruthy();
    expect(token!.split('.').length).toBe(3);
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
    const logoutTrigger = page.locator('[data-testid="logout"], .ant-dropdown-menu-item:has-text("退出"), button:has-text("退出")').first();
    if (await logoutTrigger.isVisible({ timeout: 3000 }).catch(() => false)) {
      await logoutTrigger.click();
    } else {
      const avatarTrigger = page.locator('.ant-avatar, .ant-dropdown-trigger').first();
      await avatarTrigger.click();
      const logoutItem = page.locator('.ant-dropdown-menu-item:has-text("退出"), .ant-dropdown-menu-item:has-text("登出")').first();
      await logoutItem.click();
    }

    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
  });

  test('登出后 localStorage 清空', async ({ authenticatedPage: page }) => {
    const avatarTrigger = page.locator('.ant-avatar, .ant-dropdown-trigger').first();
    await avatarTrigger.click();
    const logoutItem = page.locator('.ant-dropdown-menu-item:has-text("退出"), .ant-dropdown-menu-item:has-text("登出")').first();
    await logoutItem.click();

    await page.waitForURL(/\/login/, { timeout: 10000 });

    const token = await page.evaluate(() => localStorage.getItem('authToken'));
    expect(token).toBeNull();
  });
});

test.describe('Token 过期处理', () => {
  test('Token 被清除后自动跳转登录页', async ({ authenticatedPage: page }) => {
    await page.evaluate(() => {
      localStorage.removeItem('authToken');
      localStorage.removeItem('userInfo');
    });

    await page.reload();
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveURL(/\/login/, { timeout: 15000 });
  });
});
