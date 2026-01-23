# GitHub Copilot 指令 - 服装供应链管理系统

## 🎯 系统概览

三端协同的服装供应链管理系统：**Java Spring Boot 后端** + **React TypeScript PC端** + **微信小程序手机端**，管理从订单到生产、质检、对账的完整流程。系统评分 96/100。

**核心技术栈**：
- 后端：Spring Boot 2.7.18 + MyBatis Plus 3.5.7 + MySQL 9.0 + Java 21
- PC端：React 18 + Ant Design 6.1.3 + Vite 7 + TypeScript 5.3.3 + Zustand
- 小程序：微信原生框架 + JSDoc 类型注释

## 🏗️ 架构关键设计

### 后端：Orchestrator 模式（核心）
业务逻辑使用 **Orchestrator 编排层** + **Service 服务层** 分离架构：
- **Orchestrator**: 跨服务业务编排，处理复杂事务逻辑（如 `ShipmentReconciliationOrchestrator`、`ProductionOrderOrchestrator`）
- **Service/ServiceImpl**: 单一领域的 CRUD 操作
- 示例路径：`backend/src/main/java/com/fashion/supplychain/*/orchestration/`

### 前端：ResizableModal 统一弹窗规范
所有表单弹窗使用 `<ResizableModal>` 组件，统一尺寸：**80vw × 85vh**
```typescript
// frontend/src/components/common/ResizableModal.tsx
<ResizableModal
  title="编辑订单"
  visible={visible}
  defaultWidth="80vw"
  defaultHeight="85vh"
>
```
已在 14+ 页面采用，包括裁剪单、对账单、质检入库等。

### 小程序：智能扫码工序识别
核心业务逻辑（参考 `SCAN_SYSTEM_LOGIC.md`）：
1. **自动工序识别**：扫码次数决定工序（第1次=做领，第2次=上领...），无需手动选择
2. **防重复保护**：动态计算最小间隔 = `max(30秒, 菲号数量 × 工序分钟 × 60 × 50%)`
3. **动态工序列表**：从订单的 `progressNodeUnitPrices` 读取，支持任意配置

代码位置：`miniprogram/pages/work/index.js` 的 `handleScan` 函数

## 🔑 开发工作流

### 启动开发环境
```bash
# 1. 启动 MySQL（Docker，注意端口3308非标准端口）
docker start fashion-mysql-simple

# 2. 后端（推荐用 dev-public.sh，自动加载 .run/backend.env）
./dev-public.sh  # 或
cd backend && mvn spring-boot:run

# 3. 前端
cd frontend && npm run dev  # http://localhost:5173

# 4. 微信小程序
# 使用微信开发者工具打开 miniprogram/ 目录
```

**环境变量配置**：
- 后端环境变量在 `.run/backend.env`（需自行创建，不入版本库）
- 数据库连接默认 `localhost:3308`（非标准端口，Docker映射配置）
- JWT密钥、微信配置等敏感信息通过环境变量注入

### 数据库管理
- **配置**：`deployment/DATABASE_CONFIG.md`
- **管理脚本**：`deployment/db-manager.sh`（备份/恢复/迁移）
- **SQL 脚本**：`scripts/` 目录下的 `.sql` 文件
- **连接串**：`jdbc:mysql://127.0.0.1:3308/fashion_supplychain?useUnicode=true&characterEncoding=utf-8`

### 快速测试
参考 `QUICK_TEST_GUIDE.md`，重点测试：
1. 扫码系统（菲号识别、防重复、工序自动切换）
2. 裁剪单生成（二维码生成）
3. 对账流程（工厂/物料/发货）

### Git 同步
```bash
./git-sync.sh "你的提交信息"  # 自动 pull + add + commit + push
```

## 📐 编码规范

### Java 后端
- **实体层**：`@TableName` 标记表名，使用 Lombok `@Data`
- **服务层**：优先编写 Orchestrator 处理跨服务逻辑，Service 只做本域 CRUD
- **权限控制**：`@PreAuthorize("hasAuthority('CODE')")` 配合 `permissionCodes` 常量
- **认证**：JWT Token，通过 `AuthTokenService` 和 `TokenAuthFilter` 实现
- **API 文档**：SpringDoc OpenAPI，访问 `/swagger-ui.html`
- **⚠️ UTF-8编码**：application.yml 必须配置 `server.servlet.encoding.force=true` 和 `spring.jackson.generator.escape-non-ascii=false`，否则中文乱码

### React 前端
- **组件规范**：功能组件 + TypeScript + Hooks
- **状态管理**：Zustand (`frontend/src/utils/appContext.tsx`)
- **表单验证**：Ant Design Form + `validationRules`（与小程序一致）
- **弹窗尺寸**：统一 80vw × 85vh，使用 `ResizableModal`
- **API 调用**：`services/api.ts` 统一封装，自动处理错误和 token
- **路由配置**：`routeConfig.ts` 定义路径和权限码
- **性能优化**：使用 `requestAnimationFrame` 优化 INP 到 <200ms，构建限制 chunk 大小（800KB main, 300KB vendor）

### 微信小程序
- **目录结构**：`pages/` 页面，`utils/` 工具，`components/` 组件
- **网络请求**：使用 `utils/request.js`（10s 超时，2次重试）
- **数据验证**：`utils/dataValidator.js` + `utils/validationRules.js`（与 PC 端规则一致）
- **错误处理**：`utils/errorHandler.js` 统一 7 种错误分类
- **实时同步**：`utils/syncManager.js` 提供 30s 轮询机制
- **类型定义**：`types/index.js` 使用 JSDoc 注释实现 IDE 提示

## 🔍 关键文件速查

### 必读文档（优先级排序）
1. `DEVELOPMENT_GUIDE.md` - **开发指南**（⭐ 最重要，包含完整架构和最佳实践）
2. `SYSTEM_STATUS.md` - 系统状态和文档索引（从这里开始）
3. `xindiedai.md` - 架构评估报告（96分细节）
4. `SCAN_SYSTEM_LOGIC.md` - 扫码系统核心逻辑
5. `PROJECT_DOCUMENTATION.md` - 完整技术文档
6. `WORKFLOW_EXPLANATION.md` - 业务流程说明

### 核心配置
- `backend/pom.xml` - Spring Boot 2.7.18, MyBatis Plus 3.5.7
- `frontend/package.json` - React 18, Ant Design 6.1.3, Vite 7
- `deployment/docker-compose.yml` - 生产环境部署配置

### 关键业务文件
- 订单实体：`backend/src/main/java/com/fashion/supplychain/production/entity/ProductionOrder.java`
- PC端路由：`frontend/src/routeConfig.ts`
- 小程序扫码：`miniprogram/pages/work/index.js`
- 前端弹窗：`frontend/src/components/common/ResizableModal.tsx`

## 💡 技术亮点与注意事项

### 数据同步
- 小程序和 PC 端使用相同的验证规则库（`validationRules`），确保数据一致性
- 小程序有实时同步机制（30s 轮询），PC 端暂无，需手动刷新

### 性能优化
- PC 端采用 `requestAnimationFrame` 优化 INP 到 <200ms
- 构建配置限制 chunk 大小（800KB main, 300KB vendor）
- 代码分割：路由级懒加载

### 安全与权限
- 后端使用 Spring Security + JWT
- 支持微信用户手动输入账户登录（`app.auth.header-auth-enabled`）
- 数据权限：角色绑定 `dataScope`（ALL/FACTORY_ONLY）

### 扫码系统特殊逻辑
- 菲号（Bundle）：`orderNo + color + seq`，例如 `PO20260122001-黑色-01`
- 工序自动识别基于扫码次数，配置在订单的 `progressNodeUnitPrices` 中
- 防重复时间计算公式在 `SCAN_SYSTEM_LOGIC.md` 有详细说明

## 🚀 常见任务指南

### 添加新业务模块
1. 后端：创建 `entity` → `mapper` → `service/serviceImpl` → `orchestrator`（如需跨服务） → `controller`
2. 前端：在 `pages/` 创建目录 → 添加路由到 `routeConfig.ts` → 编写 API 到 `services/`
3. 权限：在数据库 `t_role_permission` 添加权限码，后端 controller 添加 `@PreAuthorize`

### 修改弹窗表单
1. 找到对应页面（如 `frontend/src/pages/Production/Cutting.tsx`）
2. 使用 `<ResizableModal>` 包裹表单，确保尺寸 80vw × 85vh
3. 表单校验使用 Ant Design 的 `rules` 配合 `validationRules`

### 扫码系统调试
1. 参考 `QUICK_TEST_GUIDE.md` 创建测试订单
2. 在小程序 `pages/work/index.js` 的 `handleScan` 打断点
3. 验证：菲号识别 → 工序判断 → 防重复检查 → API 调用

### 数据库变更
1. 编写 SQL 脚本放到 `scripts/` 目录
2. 使用 `deployment/db-manager.sh` 执行备份后再执行
3. 更新对应的 Java Entity 和 TypeScript 类型定义

---

*最后更新：2026-01-23*  
*维护者：如需更多细节，查阅根目录的 MD 文档*
