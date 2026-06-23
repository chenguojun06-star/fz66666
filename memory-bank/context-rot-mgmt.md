# 上下文腐烂治理（Context Rot Management）

> 对话越长，记忆越稀释。自动管理上下文生命周期，防止"失忆跑偏"
> 借鉴：Claude Code GET SHIT DONE 模式 + RooFlow Memory Bank

---

## 📖 什么是上下文腐烂

**现象**：对话进行到第10轮以后，AI 开始：
- 忘记早期约定的规范（如"必须用POST /list"）
- 重复问已经回答过的问题
- 给出的代码与前几轮的架构决定不一致
- P0铁律的某些条目失效

**根本原因**：模型注意力被历史无关内容稀释，早期关键信息权重下降。

**本项目解决方案**：多层记忆 + 会话压缩 + 上下文块动态加载

---

## 🏗️ 五层记忆系统

本项目已实现的记忆架构（由浅入深）：

| 层级 | 文件/位置 | 存储内容 | 生命周期 |
|------|----------|---------|---------|
| L1 即时上下文 | 当前对话 | 用户最新问题 + 最近3轮对话 | 单轮对话内 |
| L2 活跃上下文 | memory-bank/activeContext.md | 当前开发目标 + 最近变更 | 本次会话周期 |
| L3 进度跟踪 | memory-bank/progress.md | 已完成任务清单 + 里程碑 | 跨会话/数天 |
| L4 决策日志 | memory-bank/decisionLog.md | 关键技术决策 + 理由 | 永久/跨月 |
| L5 产品背景 | memory-bank/productContext.md | 项目核心业务规则 + API约定 | 永久/稳定 |

---

## 🔄 会话摘要与压缩机制

### 何时触发压缩

| 触发条件 | 动作 |
|---------|------|
| 当前对话轮次 > 15 | 执行摘要压缩 |
| 本次会话工具调用 > 20次 | 执行摘要压缩 |
| Token 估算 > 70%（黄警） | 执行摘要压缩 |
| 用户明确说"从头开始"/"换个话题" | 强制重置 + 生成摘要归档 |

### 摘要模板（压缩后追加到 activeContext.md）

每次会话结束或压缩时，按以下格式追加一条记录：

```markdown
### 2026-06-23 会话摘要：五大能力增强

**完成事项**：
- ✅ 创建 AI操作仪表盘 ai-dashboard.md（HUD可观测性）
- ✅ 创建 变更影响矩阵 change-impact-matrix.md
- ✅ 创建 上下文腐烂治理 context-rot-mgmt.md（本文）

**关键决策**：
- 决策1：HUD使用Markdown表格而非专用工具（轻量且无需额外依赖）
- 决策2：变更影响矩阵按P0/P1/P2三级分类，与agent-workflow.md的风险等级对齐

**修改/新增的文件清单**：
- 新增：memory-bank/ai-dashboard.md
- 新增：memory-bank/change-impact-matrix.md
- 新增：memory-bank/context-rot-mgmt.md
- 新增：memory-bank/quick-start-5min.md
- 新增：memory-bank/anti-patterns.md

**下次会话的起始点**：
- 继续完成 P2 和 P3 的文件
- 然后更新 .github/pull_request_template.md（增强变更摘要）
- 最后更新 memory-bank/activeContext.md 记录整体状态
```

---

## 🧭 上下文块智能开关

### 默认永远加载的核心块（= 8个文件）

以下文件**每次会话开头**必须读取，无条件加载：

| 文件 | 为什么必须 |
|------|-----------|
| memory-bank/activeContext.md | 知道当前在做什么 |
| memory-bank/progress.md | 知道已完成什么 |
| memory-bank/decisionLog.md | 知道历史决策，不重复争论 |
| memory-bank/productContext.md | 知道项目核心业务规则 |
| .trae/rules/project_rules.md | P0铁律，安全底线 |
| .trae/rules/agent-workflow.md | 7步工作流，保证做事有条理 |
| .github/copilot-instructions.md | 代码规范总入口 |
| 最近2个 .trae/rules/optimization-log-*.md | 最近踩的坑，不重复踩 |

### 条件加载的上下文块（按需加载）

根据用户提问的关键词，动态决定是否加载：

| 用户问题关键词 | 额外加载的文件 |
|-------------|--------------|
| "扫码"/"扫码记录"/"工序"/"质检" | memory-bank/change-impact-matrix.md 扫码相关章节 |
| "数据库"/"schema"/"Flyway"/"ALTER TABLE" | .trae/rules/optimization-log-*中数据库相关条目 |
| "前端"/"页面"/"组件"/"弹窗" | .github/instructions/frontend.instructions.md |
| "小程序" | .github/instructions/miniprogram.instructions.md + miniprogram/相关页面 |
| "API"/"接口"/"路由" | .github/instructions/backend.instructions.md |
| "权限"/"角色"/"403" | .trae/rules/project_rules.md 权限章节 |
| "打印"/"标签"/"水洗唛" | .trae/rules/project_rules.md 打印字体铁律 |
| "部署"/"发布"/"CI" | .github/workflows/ci.yml + deployment/ 文档 |

### 上下文清理时机

每次执行完以下操作后，**立即清理不再需要的上下文内容**：
1. 一个完整功能开发完成并通过编译验证
2. 用户说"这个话题结束了"/"我们换个话题"
3. 会话轮次超过20轮但目标已完成

清理方式：生成会话摘要 → 追加到 activeContext.md 的"最近变更"部分 → 接下来的对话只引用摘要，不展开历史细节

---

## ⚠️ 上下文稀释预警信号

当 AI 开始出现以下行为时，说明上下文已腐烂，需要立即触发压缩/重置：

| 信号 | 含义 | 应对动作 |
|-----|------|---------|
| "你刚才说xxx是怎么做的？" | 忘记刚刚做的决定 | 🔄 执行摘要压缩 |
| 开始问已经回答过的问题 | 早期信息被稀释 | 🔄 执行摘要压缩 |
| 给出的代码违反已确定的规范 | 规范被历史内容淹没 | 🔴 重新加载 project_rules.md 并执行 |
| 重复做已经完成的任务 | progress.md 信息未被读取 | 🔄 重新读取 progress.md + 重置任务清单 |
| 输出与 P0 铁律冲突 | 核心规范被挤出上下文窗口 | 🔴 强制从头读取 8个核心块 |

---

## 📋 每次会话结束的标准收尾动作

每次完成用户目标后，按以下清单收尾：

- [ ] **1. 更新 activeContext.md**：在"当前目标"和"最近变更"部分追加本次内容
- [ ] **2. 更新 progress.md**：标记已完成的任务，添加新项目
- [ ] **3. 如有重要决策，更新 decisionLog.md**：记录决策内容 + 理由
- [ ] **4. 生成会话摘要**：按上文模板格式写入 activeContext.md 底部
- [ ] **5. 核对 8 个核心块是否需要更新**：特别是 project_rules.md 和 agent-workflow.md 是否有新内容要加
- [ ] **6. 编译验证**：如果改了代码，执行 mvn compile + npx tsc --noEmit
- [ ] **7. 报告完成**：给用户一个简洁的完成报告（做了什么+改了什么文件+验证结果）

---

## 💾 归档策略

### 旧会话归档

活跃上下文文件过长时（> 500 行），执行归档：

1. 将 activeContext.md 中超过2周的内容移至 `memory-bank/archive/activeContext-YYYYMMDD.md`
2. 在 activeContext.md 顶部保留最近3次会话摘要
3. 在 decisionLog.md 中记录"已归档 XXXX年XX月XX日内容"

### optimization-log 归档

规则已定义在 `optimization-log-20260620.md` 顶部（`每月1号` 归档旧日志到 `.trae/archive/`）。
