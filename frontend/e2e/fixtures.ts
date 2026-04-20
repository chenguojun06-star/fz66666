import { test as base, expect, type Page } from '@playwright/test';

interface LoginCredentials {
  username: string;
  password: string;
  tenantId?: number;
}

export const TEST_CREDENTIALS: Record<string, LoginCredentials> = {
  admin: {
    username: process.env.E2E_ADMIN_USER || 'admin',
    password: process.env.E2E_ADMIN_PASS || 'admin123',
  },
  manager: {
    username: process.env.E2E_MANAGER_USER || 'manager',
    password: process.env.E2E_MANAGER_PASS || 'manager123',
  },
};

async function login(page: Page, credentials: LoginCredentials) {
  await page.goto('/login');
  await page.waitForLoadState('networkidle');

  const usernameInput = page.locator('input[placeholder*="用户名"], input[id="username"], input[name="username"]').first();
  const passwordInput = page.locator('input[placeholder*="密码"], input[type="password"]').first();

  await usernameInput.fill(credentials.username);
  await passwordInput.fill(credentials.password);

  const loginButton = page.locator('button[type="submit"], button:has-text("登录"), button:has-text("登 录")').first();
  await loginButton.click();

  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
  await page.waitForLoadState('networkidle');
}

export const test = base.extend<{
  authenticatedPage: Page;
}>({
  authenticatedPage: async ({ page }, use) => {
    await login(page, TEST_CREDENTIALS.admin);
    await use(page);
  },
});

export { expect, login };
