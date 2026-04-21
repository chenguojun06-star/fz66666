# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: production.spec.ts >> 裁剪单管理 >> 裁剪单页面正常加载
- Location: e2e/production.spec.ts:84:3

# Error details

```
TimeoutError: page.waitForURL: Timeout 15000ms exceeded.
=========================== logs ===========================
waiting for navigation until "load"
============================================================
```

# Page snapshot

```yaml
- generic [ref=e4]:
  - generic [ref=e6]:
    - generic [ref=e7]:
      - generic [ref=e8]:
        - generic [ref=e9]: MARS｜云裳协同管理
        - heading "云裳智链多端协同" [level=2] [ref=e10]
        - generic [ref=e11]: 多厂协同管理, 实时数据看板 ,让交付变得更轻松.
      - generic [ref=e13]:
        - generic [ref=e27]:
          - generic [ref=e28]: 订单在线
          - strong [ref=e29]: 24h
        - generic [ref=e30]:
          - generic [ref=e31]: 排产协同
          - strong [ref=e32]: AI Flow
        - generic [ref=e33]:
          - generic [ref=e34]: 质检追踪
          - strong [ref=e35]: Live
        - generic [ref=e50]: AI
    - generic [ref=e51]:
      - generic [ref=e52]:
        - generic [ref=e53]: 统一视图
        - strong [ref=e54]: 订单 / 产能 / 交付
      - generic [ref=e55]:
        - generic [ref=e56]: 核心能力
        - strong [ref=e57]: 在线协同 · 智能预警
      - generic [ref=e58]:
        - generic [ref=e59]: 管理目标
        - strong [ref=e60]: 提升履约确定性
  - generic [ref=e64]:
    - generic [ref=e67]:
      - heading "云裳智链" [level=2] [ref=e68]
      - generic [ref=e69]: 衣智链｜多端协同智能提醒平台
    - generic [ref=e70]:
      - generic [ref=e72]:
        - generic "公司" [ref=e74]: "* 公司 :"
        - generic [ref=e75]:
          - generic [ref=e80] [cursor=pointer]:
            - img "search" [ref=e82]:
              - img [ref=e83]
            - combobox "* 公司 :" [ref=e85]
          - generic [ref=e89]: 请搜索并选择公司
      - generic [ref=e91]:
        - generic "用户名" [ref=e93]: "* 用户名 :"
        - generic [ref=e97]:
          - img "user" [ref=e99]:
            - img [ref=e100]
          - textbox "* 用户名 :" [ref=e102]:
            - /placeholder: 请输入用户名
            - text: admin
          - button "close-circle" [ref=e104] [cursor=pointer]:
            - img "close-circle" [ref=e105]:
              - img [ref=e106]
      - generic [ref=e109]:
        - generic "密码" [ref=e111]: "* 密码 :"
        - generic [ref=e115]:
          - img "lock" [ref=e117]:
            - img [ref=e118]
          - textbox "* 密码 :" [ref=e120]:
            - /placeholder: 请输入密码
            - text: admin123
          - img "eye-invisible" [ref=e122] [cursor=pointer]:
            - img [ref=e123]
      - button "登 录" [active] [ref=e131] [cursor=pointer]:
        - generic [ref=e132]: 登 录
      - button "还没有账号？立即注册" [ref=e138] [cursor=pointer]:
        - generic [ref=e139]: 还没有账号？立即注册
    - generic [ref=e140]: © 2026 云裳智链
    - generic [ref=e141]: 部署版本：bffda621 · 构建时间：2026/4/21 20:00:54
    - generic [ref=e143]:
      - generic [ref=e144]:
        - img "公安备案图标" [ref=e145]
        - link "粤公网安备44011302005352号" [ref=e146] [cursor=pointer]:
          - /url: https://beian.mps.gov.cn/#/query/webSearch?code=44011302005352
      - link "粤ICP备2026026776号-1" [ref=e147] [cursor=pointer]:
        - /url: https://beian.miit.gov.cn/
```

# Test source

```ts
  1  | import { test as base, expect, type Page } from '@playwright/test';
  2  | 
  3  | interface LoginCredentials {
  4  |   username: string;
  5  |   password: string;
  6  |   tenantId?: number;
  7  | }
  8  | 
  9  | export const TEST_CREDENTIALS: Record<string, LoginCredentials> = {
  10 |   admin: {
  11 |     username: process.env.E2E_ADMIN_USER || 'admin',
  12 |     password: process.env.E2E_ADMIN_PASS || 'admin123',
  13 |   },
  14 |   manager: {
  15 |     username: process.env.E2E_MANAGER_USER || 'manager',
  16 |     password: process.env.E2E_MANAGER_PASS || 'manager123',
  17 |   },
  18 | };
  19 | 
  20 | async function login(page: Page, credentials: LoginCredentials) {
  21 |   await page.goto('/login');
  22 |   await page.waitForLoadState('networkidle');
  23 | 
  24 |   const usernameInput = page.locator('input[placeholder*="用户名"], input[id="username"], input[name="username"]').first();
  25 |   const passwordInput = page.locator('input[placeholder*="密码"], input[type="password"]').first();
  26 | 
  27 |   await usernameInput.fill(credentials.username);
  28 |   await passwordInput.fill(credentials.password);
  29 | 
  30 |   const loginButton = page.locator('button[type="submit"], button:has-text("登录"), button:has-text("登 录")').first();
  31 |   await loginButton.click();
  32 | 
> 33 |   await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
     |              ^ TimeoutError: page.waitForURL: Timeout 15000ms exceeded.
  34 |   await page.waitForLoadState('networkidle');
  35 | }
  36 | 
  37 | export const test = base.extend<{
  38 |   authenticatedPage: Page;
  39 | }>({
  40 |   authenticatedPage: async ({ page }, use) => {
  41 |     await login(page, TEST_CREDENTIALS.admin);
  42 |     await use(page);
  43 |   },
  44 | });
  45 | 
  46 | export { expect, login };
  47 | 
```