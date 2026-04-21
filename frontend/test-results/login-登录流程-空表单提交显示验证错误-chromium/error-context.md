# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: login.spec.ts >> 登录流程 >> 空表单提交显示验证错误
- Location: e2e/login.spec.ts:14:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('.ant-form-item-explain-error, .ant-form-item-has-error')
Expected: visible
Error: strict mode violation: locator('.ant-form-item-explain-error, .ant-form-item-has-error') resolved to 6 elements:
    1) <div class="ant-form-item css-var-r1 ant-form-css-var css-dev-only-do-not-override-xbngoj ant-form-item-with-help ant-form-item-has-error ant-form-item-horizontal">…</div> aka locator('div').filter({ hasText: /^公司输入公司名称搜索请搜索并选择公司$/ }).first()
    2) <div class="ant-form-item-explain-error">请搜索并选择公司</div> aka getByText('请搜索并选择公司')
    3) <div class="ant-form-item css-var-r1 ant-form-css-var css-dev-only-do-not-override-xbngoj ant-form-item-with-help ant-form-item-has-error ant-form-item-horizontal">…</div> aka locator('div').filter({ hasText: /^用户名请输入用户名$/ }).first()
    4) <div class="ant-form-item-explain-error">请输入用户名</div> aka getByText('请输入用户名')
    5) <div class="ant-form-item css-var-r1 ant-form-css-var css-dev-only-do-not-override-xbngoj ant-form-item-with-help ant-form-item-has-error ant-form-item-horizontal">…</div> aka locator('div').filter({ hasText: /^密码请输入密码$/ }).first()
    6) <div class="ant-form-item-explain-error">请输入密码</div> aka getByText('请输入密码')

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('.ant-form-item-explain-error, .ant-form-item-has-error')

```

```
Tearing down "context" exceeded the test timeout of 30000ms.
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
        - generic [ref=e94]:
          - generic [ref=e97]:
            - img "user" [ref=e99]:
              - img [ref=e100]
            - textbox "* 用户名 :" [ref=e102]:
              - /placeholder: 请输入用户名
          - generic [ref=e106]: 请输入用户名
      - generic [ref=e108]:
        - generic "密码" [ref=e110]: "* 密码 :"
        - generic [ref=e111]:
          - generic [ref=e114]:
            - img "lock" [ref=e116]:
              - img [ref=e117]
            - textbox "* 密码 :" [ref=e119]:
              - /placeholder: 请输入密码
            - img "eye-invisible" [ref=e121] [cursor=pointer]:
              - img [ref=e122]
          - generic [ref=e127]: 请输入密码
      - button "登 录" [active] [ref=e133] [cursor=pointer]:
        - generic [ref=e134]: 登 录
      - button "还没有账号？立即注册" [ref=e140] [cursor=pointer]:
        - generic [ref=e141]: 还没有账号？立即注册
    - generic [ref=e142]: © 2026 云裳智链
    - generic [ref=e143]: 部署版本：bffda621 · 构建时间：2026/4/21 20:00:54
    - generic [ref=e145]:
      - generic [ref=e146]:
        - img "公安备案图标" [ref=e147]
        - link "粤公网安备44011302005352号" [ref=e148] [cursor=pointer]:
          - /url: https://beian.mps.gov.cn/#/query/webSearch?code=44011302005352
      - link "粤ICP备2026026776号-1" [ref=e149] [cursor=pointer]:
        - /url: https://beian.miit.gov.cn/
```