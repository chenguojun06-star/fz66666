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
    tenantId: Number(process.env.E2E_ADMIN_TENANT_ID || 1),
  },
  manager: {
    username: process.env.E2E_MANAGER_USER || 'manager',
    password: process.env.E2E_MANAGER_PASS || 'manager123',
    tenantId: Number(process.env.E2E_MANAGER_TENANT_ID || 1),
  },
};

async function selectTenant(page: Page, credentials: LoginCredentials) {
  const response = await page.request.get('/api/system/tenant/public-list');
  if (!response.ok()) {
    throw new Error(`加载租户列表失败: ${response.status()}`);
  }

  const body = await response.json() as { data?: Array<{ id?: number; tenantName?: string }> };
  const tenants = Array.isArray(body?.data) ? body.data : [];
  if (tenants.length === 0) {
    throw new Error('E2E 登录失败：租户列表为空');
  }

  const targetTenant = credentials.tenantId != null
    ? tenants.find((tenant) => Number(tenant?.id) === Number(credentials.tenantId)) || tenants[0]
    : tenants[0];

  const tenantName = String(targetTenant?.tenantName || '').trim();
  if (!tenantName) {
    throw new Error('E2E 登录失败：未找到可用租户名称');
  }

  const companyInput = page.locator('#login_companySearch, input[id="login_companySearch"]').first();
  await companyInput.fill(tenantName);

  const option = page.locator('.ant-select-item-option, .ant-select-item-option-content').filter({ hasText: tenantName }).first();
  await option.waitFor({ state: 'visible', timeout: 10000 });
  await option.click();

  await expect(page.getByText(`已选择：${tenantName}`).first()).toBeVisible({ timeout: 10000 });
}

async function login(page: Page, credentials: LoginCredentials) {
  await page.goto('/login');
  await page.waitForLoadState('networkidle');

  await selectTenant(page, credentials);

  const usernameInput = page.locator('input[placeholder*="用户名"], input[id="username"], input[name="username"]').first();
  const passwordInput = page.locator('input[placeholder*="密码"], input[type="password"]').first();

  await usernameInput.fill(credentials.username);
  await passwordInput.fill(credentials.password);

  const loginButton = page.locator('button[type="submit"], button:has-text("登录"), button:has-text("登 录")').first();
  await loginButton.click();

  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 30000 });
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

/**
 * 兼容旧版测试写法（extended.spec.ts 等直接调用）
 * 登录后从 localStorage 获取 JWT token，返回 { token }
 */
export async function authenticatedFixture(page: Page): Promise<{ token: string }> {
  await login(page, TEST_CREDENTIALS.admin);
  const token = await page.evaluate(() => {
    return (
      localStorage.getItem('token') ||
      localStorage.getItem('accessToken') ||
      localStorage.getItem('Authorization') ||
      ''
    );
  });
  return { token };
}

export { expect, login, selectTenant };
