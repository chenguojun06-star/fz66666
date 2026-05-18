# 小云AI智慧协同工作系统 — 设计规格

> 日期：2026-05-18 | 状态：已批准 | 范围：PC端前端+后端API扩展

---

## 一、目标

将小云AI面板从「纯聊天窗口」升级为「全系统智慧协同中枢」：
1. 三档面板缩放（小640/中960/大1280 px宽）
2. 全模块任务统一管理（生产/样衣/仓库/采购/质检/财务/系统）
3. 所有任务操作内联完成（无需跳转页面）
4. 全系统快捷入口 + AI智能引导

---

## 二、面板架构

```
┌──────────────────────────────────────────────────────────┐
│ 🧠 小云智慧大脑 · 衣智链  │ 🔔3 │ 📋⑧待办 │ [⬜] [×] │  ← 统一顶栏
├───────┬──────────────────────┬───────────────────────────┤
│ 导航   │     主内容区          │    辅助面板（仅大尺寸）      │
│       │                      │                           │
│ 💬    │  聊天消息流            │  📊 任务统计               │
│ 📋    │  任务列表+详情+表单    │  💡 AI智能建议             │
│ 🔗    │  快捷面板             │  ⚡ 最近操作               │
└───────┴──────────────────────┴───────────────────────────┘
```

### 三档尺寸

| 档位 | 宽×高 | 布局 | 触发 |
|------|-------|------|------|
| 小 | 640×820 | 单栏（聊天/任务二选一） | 默认 |
| 中 | 960×820 | 双栏（60px导航 + 900px内容） | 点击 ⬜ |
| 大 | 1280×820 | 三栏（60px导航 + 920px内容 + 300px辅助） | 点击 ⊞ |

---

## 三、导航结构

```
💬 对话    → 聊天面板（已存在，保留）
📋 我的任务 → 统一任务列表（跨模块）
  ├── 全部 / 待处理 / 进行中 / 已完成
  ├── 筛选：优先级 / 模块 / 搜索
  ├── + 新建任务
  └── 任务卡片（查看/编辑/领取/完成）
🔗 快捷入口 → 全系统模块快捷面板
  ├── 生产管理 / 样衣开发 / 仓库管理
  ├── 采购管理 / 质检管理 / 财务管理
  ├── 系统管理 / 智能运营
  └── 最近访问
```

---

## 四、任务数据模型

```typescript
interface TaskItem {
  id: string;
  title: string;
  description: string;
  module: 'production'|'style'|'warehouse'|'procurement'|'quality'|'finance'|'system';
  taskType: string;
  priority: 'high'|'medium'|'low';
  status: 'pending'|'in_progress'|'completed'|'cancelled';
  assigneeId?: string;
  assigneeName?: string;
  orderNo?: string;
  styleNo?: string;
  deepLinkPath?: string;
  startTime?: string;
  endTime?: string;
  createdAt: string;
  updatedAt: string;
}
```

---

## 五、任务操作

| 操作 | 方式 | 实现 |
|------|------|------|
| 查看列表 | 导航「我的任务」 | GET /api/intelligence/task-center/my-tasks |
| 筛选搜索 | 顶栏筛选器 + 搜索框 | 客户端过滤 |
| 领取任务 | 点击「领取」按钮 | PUT /tasks/{id}/status {status:"in_progress"} |
| 完成任务 | 点击「完成」确认 | PUT /tasks/{id}/status {status:"completed"} |
| 创建任务 | 点击「+ 新建」→ 内联表单 | POST /tasks |
| 编辑任务 | 点击任务→编辑面板 | PUT /tasks/{id} |
| 删除任务 | 编辑面板内删除 | DELETE /tasks/{id} |
| 实时刷新 | WebSocket 推送 | task:updated / task:created |

---

## 六、后端API扩展

在 IntelligenceTaskCenterController 新增：

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/intelligence/task-center/tasks | 创建任务 |
| PUT | /api/intelligence/task-center/tasks/{id} | 更新任务 |
| DELETE | /api/intelligence/task-center/tasks/{id} | 删除任务 |
| POST | /api/intelligence/task-center/tasks/{id}/claim | 领取任务 |
| GET | /api/intelligence/task-center/my-tasks | 我的任务列表 |
| GET | /api/intelligence/task-center/task-stats | 任务统计 |

---

## 七、前端文件清单

| 操作 | 文件 | 说明 |
|------|------|------|
| 修改 | GlobalAiAssistant/index.tsx | 重构为统一面板架构 |
| 修改 | GlobalAiAssistant/index.module.css | 三档缩放+多栏布局 |
| 新增 | GlobalAiAssistant/TaskListView.tsx | 任务列表视图 |
| 新增 | GlobalAiAssistant/TaskFormModal.tsx | 任务创建/编辑表单 |
| 新增 | GlobalAiAssistant/QuickLinksPanel.tsx | 快捷入口面板 |
| 新增 | GlobalAiAssistant/useTaskManager.ts | 任务CRUD Hook |
| 新增 | GlobalAiAssistant/usePanelResize.ts | 面板缩放Hook |
| 修改 | GlobalAiAssistant/types.ts | Task类型扩展 |
| 修改 | intelligenceApi.ts | 任务API函数 |
| 修改 | intelligenceTypes/ | 任务TS类型 |

---

## 八、不变更范围

- 现有聊天功能（SSE流式/消息气泡/语音/文件上传）
- 现有拖拽吸附浮标
- 后端核心业务逻辑
- 小程序端
- 数据库结构（复用现有表）