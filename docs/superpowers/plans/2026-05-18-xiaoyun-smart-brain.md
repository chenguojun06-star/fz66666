# 小云AI智慧协同工作系统 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将小云AI面板升级为全系统智慧协同中枢：三档缩放 + 全模块任务管理 + 快捷入口

**Architecture:** 前端重构 GlobalAiAssistant 为统一面板（顶栏 + 侧边导航 + 主内容 + 辅助面板），后端扩展 TaskCenterOrchestrator/Controller 新增任务 CRUD API

**Tech Stack:** React 18 + TypeScript + Ant Design 5 + CSS Modules，Spring Boot 3.4.5 + MyBatis-Plus

---

## Phase 1: 后端 API 扩展

### Task 1.1: TaskCenterOrchestrator 新增 CRUD 方法

**Files:**
- Modify: `backend/src/main/java/com/fashion/supplychain/intelligence/orchestration/TaskCenterOrchestrator.java`

- [ ] **Step 1: 读取现有 Orchestrator**

```bash
# 先确认现有文件内容
```

- [ ] **Step 2: 新增 createTask / updateTask / deleteTask / claimTask / getMyTasks / getTaskStats 方法**

```java
// 在 TaskCenterOrchestrator 中新增以下方法：

/**
 * 创建个人任务（用户在小云面板内手动创建）
 */
public Map<String, Object> createTask(Map<String, Object> taskData) {
    String title = String.valueOf(taskData.getOrDefault("title", ""));
    String description = String.valueOf(taskData.getOrDefault("description", ""));
    String priority = String.valueOf(taskData.getOrDefault("priority", "medium"));
    String module = String.valueOf(taskData.getOrDefault("module", ""));
    String orderNo = String.valueOf(taskData.getOrDefault("orderNo", ""));
    String styleNo = String.valueOf(taskData.getOrDefault("styleNo", ""));
    String endTime = String.valueOf(taskData.getOrDefault("endTime", ""));
    
    UserContext ctx = UserContextHolder.get();
    Long tenantId = ctx.getTenantId();
    Long userId = ctx.getUserId();
    String userName = ctx.getUserName();
    
    // 插入 t_intelligence_user_task 表
    // 返回任务ID
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("success", true);
    result.put("taskId", /* 新任务ID */);
    return result;
}

/**
 * 更新任务（标题/描述/优先级/截止时间）
 */
public Map<String, Object> updateTask(Long taskId, Map<String, Object> taskData) {
    UserContext ctx = UserContextHolder.get();
    Long tenantId = ctx.getTenantId();
    Long userId = ctx.getUserId();
    
    // 校验任务归属（tenantId + creatorId）
    // 更新字段
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("success", true);
    return result;
}

/**
 * 删除任务（软删除）
 */
public Map<String, Object> deleteTask(Long taskId) {
    // 校验归属 → 软删除
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("success", true);
    return result;
}

/**
 * 领取任务（assign给自己）
 */
public Map<String, Object> claimTask(Long taskId) {
    UserContext ctx = UserContextHolder.get();
    Long userId = ctx.getUserId();
    String userName = ctx.getUserName();
    
    // 更新 assigneeId/assigneeName + status → in_progress
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("success", true);
    return result;
}

/**
 * 获取我的任务列表
 */
public Map<String, Object> getMyTasks(String status, String priority, String module, int page, int size) {
    UserContext ctx = UserContextHolder.get();
    Long tenantId = ctx.getTenantId();
    Long userId = ctx.getUserId();
    
    // 查询：assigneeId = userId OR creatorId = userId
    // 返回分页结果
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("rows", /* List<Map> */);
    result.put("total", /* long */);
    return result;
}

/**
 * 任务统计
 */
public Map<String, Object> getTaskStats() {
    // pending/in_progress/completed/cancelled 各类型计数
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("pendingCount", 0);
    result.put("inProgressCount", 0);
    result.put("completedCount", 0);
    result.put("highPriorityCount", 0);
    return result;
}
```

> ⚠️ 具体 JDBC/JPA 操作需根据项目中现有 TaskCenterOrchestrator 模式适配

- [ ] **Step 3: 编译验证**

```bash
cd backend && mvn compile -pl . -q 2>&1 | tail -5
# Expected: BUILD SUCCESS
```

---

### Task 1.2: IntelligenceTaskCenterController 新增端点

**Files:**
- Modify: `backend/src/main/java/com/fashion/supplychain/intelligence/controller/IntelligenceTaskCenterController.java`

- [ ] **Step 1: 新增 POST /tasks 创建任务**

```java
@PostMapping("/tasks")
public Result<Map<String, Object>> createTask(@RequestBody Map<String, Object> taskData) {
    Map<String, Object> result = taskCenterOrchestrator.createTask(taskData);
    if (Boolean.FALSE.equals(result.get("success"))) {
        return Result.fail(String.valueOf(result.get("error")));
    }
    return Result.success(result);
}
```

- [ ] **Step 2: 新增 PUT /tasks/{id} 更新任务**

```java
@PutMapping("/tasks/{taskId}")
public Result<Map<String, Object>> updateTask(
        @PathVariable Long taskId,
        @RequestBody Map<String, Object> taskData) {
    Map<String, Object> result = taskCenterOrchestrator.updateTask(taskId, taskData);
    if (Boolean.FALSE.equals(result.get("success"))) {
        return Result.fail(String.valueOf(result.get("error")));
    }
    return Result.success(result);
}
```

- [ ] **Step 3: 新增 DELETE /tasks/{id} 删除任务**

```java
@DeleteMapping("/tasks/{taskId}")
public Result<Map<String, Object>> deleteTask(@PathVariable Long taskId) {
    Map<String, Object> result = taskCenterOrchestrator.deleteTask(taskId);
    if (Boolean.FALSE.equals(result.get("success"))) {
        return Result.fail(String.valueOf(result.get("error")));
    }
    return Result.success(result);
}
```

- [ ] **Step 4: 新增 POST /tasks/{id}/claim 领取任务**

```java
@PostMapping("/tasks/{taskId}/claim")
public Result<Map<String, Object>> claimTask(@PathVariable Long taskId) {
    Map<String, Object> result = taskCenterOrchestrator.claimTask(taskId);
    if (Boolean.FALSE.equals(result.get("success"))) {
        return Result.fail(String.valueOf(result.get("error")));
    }
    return Result.success(result);
}
```

- [ ] **Step 5: 新增 GET /my-tasks 我的任务列表**

```java
@GetMapping("/my-tasks")
public Result<Map<String, Object>> getMyTasks(
        @RequestParam(required = false) String status,
        @RequestParam(required = false) String priority,
        @RequestParam(required = false) String module,
        @RequestParam(defaultValue = "1") int page,
        @RequestParam(defaultValue = "50") int size) {
    return Result.success(taskCenterOrchestrator.getMyTasks(status, priority, module, page, size));
}
```

- [ ] **Step 6: 新增 GET /task-stats 任务统计**

```java
@GetMapping("/task-stats")
public Result<Map<String, Object>> getTaskStats() {
    return Result.success(taskCenterOrchestrator.getTaskStats());
}
```

- [ ] **Step 7: 编译验证**

```bash
cd backend && mvn compile -q 2>&1 | tail -3
# Expected: BUILD SUCCESS
```

---

## Phase 2: 前端核心架构

### Task 2.1: 新增 usePanelResize Hook

**Files:**
- Create: `frontend/src/components/common/GlobalAiAssistant/usePanelResize.ts`

- [ ] **Step 1: 创建 Hook 文件**

```typescript
import { useState, useCallback, useEffect } from 'react';

export type PanelSize = 'small' | 'medium' | 'large';

const SIZE_DIMENSIONS: Record<PanelSize, { width: number; height: number }> = {
  small: { width: 640, height: 820 },
  medium: { width: 960, height: 820 },
  large: { width: 1280, height: 820 },
};

const SIZE_ORDER: PanelSize[] = ['small', 'medium', 'large'];

const STORAGE_KEY = 'xiaoyun.panel.size';

function loadPanelSize(): PanelSize {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && SIZE_ORDER.includes(saved as PanelSize)) return saved as PanelSize;
  } catch {}
  return 'small';
}

export function usePanelResize() {
  const [size, setSize] = useState<PanelSize>(loadPanelSize);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, size); } catch {}
  }, [size]);

  const cycleSize = useCallback(() => {
    setSize(prev => {
      const idx = SIZE_ORDER.indexOf(prev);
      return SIZE_ORDER[(idx + 1) % SIZE_ORDER.length];
    });
  }, []);

  const dimensions = SIZE_DIMENSIONS[size];
  const isSmall = size === 'small';
  const isMedium = size === 'medium';
  const isLarge = size === 'large';
  const showSidebar = size !== 'small';
  const showAuxPanel = size === 'large';

  return { size, setSize, cycleSize, dimensions, isSmall, isMedium, isLarge, showSidebar, showAuxPanel };
}
```

---

### Task 2.2: CSS 三档缩放 + 多栏布局

**Files:**
- Modify: `frontend/src/components/common/GlobalAiAssistant/index.module.css`

- [ ] **Step 1: 将固定尺寸改为动态 calc + CSS 变量**

```css
.chatPanel {
  width: var(--xiaoyun-panel-width, 640px);
  height: var(--xiaoyun-panel-height, 820px);
  background: var(--xiaoyun-bg-card);
  border-radius: 20px;
  box-shadow: 0 12px 32px rgba(0, 83, 204, 0.15), 0 4px 12px rgba(0, 0, 0, 0.05);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  pointer-events: auto;
  animation: popupBounce 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
  border: 1px solid var(--xiaoyun-primary-border);
  transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1), height 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.panelBody {
  display: flex;
  flex: 1;
  min-height: 0;
}

.sidebar {
  width: 60px;
  flex-shrink: 0;
  background: var(--xiaoyun-bg-page);
  border-right: 1px solid var(--xiaoyun-border-card);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 0;
  gap: 4px;
}

.sidebarItem {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--xiaoyun-text-secondary);
  font-size: 18px;
  transition: all 0.15s;
}

.sidebarItem:hover {
  background: var(--xiaoyun-primary-bg);
  color: var(--xiaoyun-primary);
}

.sidebarItem.active {
  background: var(--xiaoyun-primary);
  color: #fff;
}

.sidebarLabel {
  font-size: 10px;
  line-height: 1;
}

.mainContent {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.auxPanel {
  width: 300px;
  flex-shrink: 0;
  background: var(--xiaoyun-bg-page);
  border-left: 1px solid var(--xiaoyun-border-card);
  padding: 16px;
  overflow-y: auto;
}
```

- [ ] **Step 2: 更新 resizeIcon 样式（缩放按钮动画）**

```css
.resizeIcon {
  font-size: 14px;
  transition: transform 0.3s;
}
.resizeIconSmall { transform: rotate(0deg); }
.resizeIconMedium { transform: rotate(45deg); }
.resizeIconLarge { transform: rotate(90deg); }
```

---

### Task 2.3: 扩展 types.ts

**Files:**
- Modify: `frontend/src/components/common/GlobalAiAssistant/types.ts`

- [ ] **Step 1: 在 Message interface 后新增 TaskItem 类型**

```typescript
export type PanelView = 'chat' | 'tasks' | 'links';

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';
export type TaskPriority = 'high' | 'medium' | 'low';
export type TaskModule = 'production' | 'style' | 'warehouse' | 'procurement' | 'quality' | 'finance' | 'system';

export interface TaskItem {
  id: string;
  title: string;
  description: string;
  module: TaskModule;
  taskType: string;
  priority: TaskPriority;
  status: TaskStatus;
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

### Task 2.4: 新增 useTaskManager Hook

**Files:**
- Create: `frontend/src/components/common/GlobalAiAssistant/useTaskManager.ts`

- [ ] **Step 1: 创建 Hook**

```typescript
import { useState, useCallback, useRef } from 'react';
import { intelligenceApi } from '@/services/intelligence/intelligenceApi';
import type { TaskItem, TaskStatus, TaskPriority, TaskModule } from './types';

const POLL_INTERVAL = 30_000;

export function useTaskManager() {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchTasks = useCallback(async (filters?: {
    status?: string; priority?: string; module?: string;
  }) => {
    setLoading(true);
    try {
      const res = await intelligenceApi.getMyTasks(
        filters?.status, filters?.priority, filters?.module, 1, 200
      );
      const data = (res as any)?.data;
      setTasks(Array.isArray(data?.rows) ? data.rows : Array.isArray(data) ? data : []);
    } catch {} finally {
      setLoading(false);
    }
  }, []);

  const createTask = useCallback(async (data: {
    title: string; description?: string; priority?: TaskPriority;
    module?: TaskModule; orderNo?: string; styleNo?: string; endTime?: string;
  }) => {
    const res = await intelligenceApi.createTask(data as any) as any;
    await fetchTasks();
    return res?.data;
  }, [fetchTasks]);

  const updateTask = useCallback(async (taskId: string, data: {
    title?: string; description?: string; priority?: TaskPriority; endTime?: string;
  }) => {
    await intelligenceApi.updateTask(taskId, data as any);
    await fetchTasks();
  }, [fetchTasks]);

  const deleteTask = useCallback(async (taskId: string) => {
    await intelligenceApi.deleteTask(taskId);
    await fetchTasks();
  }, [fetchTasks]);

  const claimTask = useCallback(async (taskId: string) => {
    await intelligenceApi.claimTask(taskId);
    await fetchTasks();
  }, [fetchTasks]);

  const completeTask = useCallback(async (taskId: string) => {
    await intelligenceApi.updateTaskStatus(taskId, 'completed', '');
    await fetchTasks();
  }, [fetchTasks]);

  const startPolling = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => { void fetchTasks(); }, POLL_INTERVAL);
  }, [fetchTasks]);

  const stopPolling = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  const stats = {
    total: tasks.length,
    pending: tasks.filter(t => t.status === 'pending').length,
    inProgress: tasks.filter(t => t.status === 'in_progress').length,
    completed: tasks.filter(t => t.status === 'completed').length,
    highPriority: tasks.filter(t => t.priority === 'high').length,
  };

  return { tasks, loading, stats, fetchTasks, createTask, updateTask, deleteTask, claimTask, completeTask, startPolling, stopPolling };
}
```

---

### Task 2.5: 新增前端 API 函数

**Files:**
- Modify: `frontend/src/services/intelligence/intelligenceApi.ts`

- [ ] **Step 1: 在 intelligenceApi 对象中追加新方法**

```typescript
// 在 intelligenceApi 对象的末尾（getMyPendingTaskSummary 之后）追加：

/** 任务中心 - 创建任务 */
createTask: (data: Record<string, unknown>) =>
  api.post<{ code: number; data: Record<string, unknown> }>('/intelligence/task-center/tasks', data),

/** 任务中心 - 更新任务 */
updateTask: (taskId: string, data: Record<string, unknown>) =>
  api.put<{ code: number; data: Record<string, unknown> }>(`/intelligence/task-center/tasks/${taskId}`, data),

/** 任务中心 - 删除任务 */
deleteTask: (taskId: string) =>
  api.delete<{ code: number }>(`/intelligence/task-center/tasks/${taskId}`),

/** 任务中心 - 领取任务 */
claimTask: (taskId: string) =>
  api.post<{ code: number; data: Record<string, unknown> }>(`/intelligence/task-center/tasks/${taskId}/claim`),

/** 任务中心 - 获取我的任务列表 */
getMyTasks: (status?: string, priority?: string, module?: string, page?: number, size?: number) =>
  api.get<{ code: number; data: { rows: unknown[]; total: number } }>('/intelligence/task-center/my-tasks', {
    params: { status, priority, module, page: page ?? 1, size: size ?? 50 }
  }),

/** 任务中心 - 更新任务状态 */
updateTaskStatus: (taskId: string, status: string, note?: string) =>
  api.put<{ code: number; data: Record<string, unknown> }>(`/intelligence/task-center/tasks/${taskId}/status`, { status, note: note ?? '' }),
```

---

## Phase 3: UI 组件

### Task 3.1: TaskListView — 任务列表视图

**Files:**
- Create: `frontend/src/components/common/GlobalAiAssistant/TaskListView.tsx`
- Create: `frontend/src/components/common/GlobalAiAssistant/TaskListView.module.css`

- [ ] **Step 1: 创建 CSS 模块**

```css
.container { display: flex; flex-direction: column; height: 100%; }

.toolbar {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 16px; flex-shrink: 0;
  border-bottom: 1px solid var(--xiaoyun-border-card);
  flex-wrap: wrap;
}

.searchInput {
  flex: 1; min-width: 140px; height: 32px;
  border: 1px solid var(--xiaoyun-border-card);
  border-radius: 16px; padding: 0 12px;
  font-size: 13px; outline: none; background: var(--xiaoyun-bg-card);
}
.searchInput:focus { border-color: var(--xiaoyun-primary-border); }

.filterChip {
  height: 28px; padding: 0 10px; border-radius: 14px;
  border: 1px solid var(--xiaoyun-border-card);
  background: var(--xiaoyun-bg-card); cursor: pointer;
  font-size: 12px; color: var(--xiaoyun-text-secondary);
  white-space: nowrap; transition: all 0.15s;
}
.filterChip:hover { border-color: var(--xiaoyun-primary-border); }
.filterChipActive { background: var(--xiaoyun-primary); color: #fff; border-color: var(--xiaoyun-primary); }

.createBtn {
  height: 32px; padding: 0 14px; border-radius: 16px;
  background: var(--xiaoyun-primary); color: #fff; border: none;
  cursor: pointer; font-size: 13px; font-weight: 500;
  white-space: nowrap; transition: all 0.15s;
}
.createBtn:hover { background: var(--xiaoyun-primary-hover); }

.listArea { flex: 1; overflow-y: auto; padding: 8px; }

.taskCard {
  background: var(--xiaoyun-bg-card); border-radius: 12px;
  padding: 12px 14px; margin-bottom: 8px;
  border-left: 3px solid var(--xiaoyun-primary);
  cursor: pointer; transition: all 0.15s;
}
.taskCard:hover { box-shadow: 0 2px 8px rgba(0, 83, 204, 0.08); }

.taskCardTop {
  display: flex; align-items: flex-start; gap: 8px;
}

.priorityTag {
  padding: 1px 8px; border-radius: 10px; font-size: 11px;
  font-weight: 500; flex-shrink: 0; line-height: 20px;
}

.moduleTag {
  padding: 1px 6px; border-radius: 4px; font-size: 11px;
  color: var(--xiaoyun-text-secondary); background: var(--xiaoyun-bg-page);
  flex-shrink: 0;
}

.taskTitle {
  font-size: 13px; font-weight: 500; color: var(--xiaoyun-text-primary);
  flex: 1; line-height: 1.4;
}

.taskCardBottom {
  display: flex; align-items: center; justify-content: space-between;
  margin-top: 8px; gap: 8px;
}

.taskMeta {
  display: flex; gap: 10px; font-size: 11px;
  color: var(--xiaoyun-text-tertiary);
}

.taskActions {
  display: flex; gap: 6px;
}

.actionBtn {
  height: 26px; padding: 0 10px; border-radius: 13px;
  border: none; cursor: pointer; font-size: 12px; font-weight: 500;
  transition: all 0.15s; white-space: nowrap;
}
.claimBtn { background: var(--xiaoyun-primary-bg); color: var(--xiaoyun-primary); }
.claimBtn:hover { background: var(--xiaoyun-primary); color: #fff; }
.completeBtn { background: #f6ffed; color: #389e0d; border: 1px solid #b7eb8f; }
.completeBtn:hover { background: #389e0d; color: #fff; }
.editBtn { background: var(--xiaoyun-bg-page); color: var(--xiaoyun-text-secondary); }
.editBtn:hover { background: var(--xiaoyun-border-card); }

.emptyState {
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; padding: 48px 24px; gap: 12px;
  color: var(--xiaoyun-text-tertiary); font-size: 13px;
}

.loadingMore { text-align: center; padding: 12px; color: var(--xiaoyun-text-tertiary); font-size: 12px; }
```

- [ ] **Step 2: 创建 TaskListView 组件**

```tsx
import React, { useState, useMemo, useCallback } from 'react';
import { PlusOutlined, SearchOutlined } from '@ant-design/icons';
import type { TaskItem, TaskPriority, TaskModule, TaskStatus } from './types';
import styles from './TaskListView.module.css';

const STATUS_TABS: { key: string; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'pending', label: '待处理' },
  { key: 'in_progress', label: '进行中' },
  { key: 'completed', label: '已完成' },
];

const PRIORITY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  high: { label: '紧急', color: '#cf1322', bg: '#fff1f0' },
  medium: { label: '一般', color: '#d48806', bg: '#fffbe6' },
  low: { label: '低', color: '#389e0d', bg: '#f6ffed' },
};

const MODULE_LABELS: Record<string, string> = {
  production: '生产', style: '样衣', warehouse: '仓库',
  procurement: '采购', quality: '质检', finance: '财务', system: '系统',
};

interface Props {
  tasks: TaskItem[];
  loading: boolean;
  onClaim: (id: string) => void;
  onComplete: (id: string) => void;
  onEdit: (task: TaskItem) => void;
  onCreate: () => void;
}

const TaskListView: React.FC<Props> = ({ tasks, loading, onClaim, onComplete, onEdit, onCreate }) => {
  const [statusTab, setStatusTab] = useState('all');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    let result = tasks;
    if (statusTab !== 'all') result = result.filter(t => t.status === statusTab);
    if (search.trim()) {
      const kw = search.trim().toLowerCase();
      result = result.filter(t =>
        t.title.toLowerCase().includes(kw) ||
        (t.orderNo && t.orderNo.toLowerCase().includes(kw)) ||
        (t.styleNo && t.styleNo.toLowerCase().includes(kw))
      );
    }
    return result;
  }, [tasks, statusTab, search]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: tasks.length };
    for (const t of tasks) {
      counts[t.status] = (counts[t.status] || 0) + 1;
    }
    return counts;
  }, [tasks]);

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <div style={{ position: 'relative', flex: 1, minWidth: 140 }}>
          <SearchOutlined style={{ position: 'absolute', left: 10, top: 9, fontSize: 12, color: 'var(--xiaoyun-text-tertiary)' }} />
          <input
            className={styles.searchInput}
            placeholder="搜索任务/订单号/款号..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ paddingLeft: 28 }}
          />
        </div>
        <button className={styles.createBtn} onClick={onCreate}>
          <PlusOutlined style={{ marginRight: 4 }} />新建任务
        </button>
      </div>

      <div style={{ padding: '8px 16px 0', display: 'flex', gap: 6, flexShrink: 0 }}>
        {STATUS_TABS.map(tab => (
          <button
            key={tab.key}
            className={`${styles.filterChip} ${statusTab === tab.key ? styles.filterChipActive : ''}`}
            onClick={() => setStatusTab(tab.key)}
          >
            {tab.label} ({statusCounts[tab.key] || 0})
          </button>
        ))}
      </div>

      <div className={styles.listArea}>
        {loading && tasks.length === 0 && (
          <div className={styles.loadingMore}>加载中...</div>
        )}
        {filtered.map(task => (
          <div key={task.id} className={styles.taskCard} onClick={() => onEdit(task)}>
            <div className={styles.taskCardTop}>
              <span className={styles.priorityTag} style={{
                color: PRIORITY_CONFIG[task.priority]?.color,
                background: PRIORITY_CONFIG[task.priority]?.bg,
              }}>
                {PRIORITY_CONFIG[task.priority]?.label || '一般'}
              </span>
              <span className={styles.moduleTag}>
                {MODULE_LABELS[task.module] || task.module}
              </span>
              <span className={styles.taskTitle}>{task.title}</span>
            </div>
            <div className={styles.taskCardBottom}>
              <div className={styles.taskMeta}>
                {task.orderNo && <span>📦 {task.orderNo}</span>}
                {task.styleNo && <span>👗 {task.styleNo}</span>}
                {task.assigneeName && <span>👤 {task.assigneeName}</span>}
                {task.endTime && <span>📅 {task.endTime.slice(0, 10)}</span>}
              </div>
              <div className={styles.taskActions} onClick={e => e.stopPropagation()}>
                {task.status === 'pending' && (
                  <>
                    <button className={`${styles.actionBtn} ${styles.claimBtn}`}
                      onClick={() => onClaim(task.id)}>领取</button>
                    <button className={`${styles.actionBtn} ${styles.editBtn}`}
                      onClick={() => onEdit(task)}>编辑</button>
                  </>
                )}
                {task.status === 'in_progress' && (
                  <>
                    <button className={`${styles.actionBtn} ${styles.completeBtn}`}
                      onClick={() => onComplete(task.id)}>完成</button>
                    <button className={`${styles.actionBtn} ${styles.editBtn}`}
                      onClick={() => onEdit(task)}>编辑</button>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
        {!loading && filtered.length === 0 && (
          <div className={styles.emptyState}>
            <span style={{ fontSize: 32 }}>📋</span>
            <span>暂无任务</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default React.memo(TaskListView);
```

---

### Task 3.2: TaskFormModal — 任务创建/编辑表单

**Files:**
- Create: `frontend/src/components/common/GlobalAiAssistant/TaskFormModal.tsx`
- Create: `frontend/src/components/common/GlobalAiAssistant/TaskFormModal.module.css`

- [ ] **Step 1: 创建 CSS 模块**

```css
.overlay {
  position: absolute; inset: 0; z-index: 10;
  background: rgba(0,0,0,0.3); display: flex;
  align-items: center; justify-content: center;
}

.panel {
  width: 440px; max-height: 90%; background: var(--xiaoyun-bg-card);
  border-radius: 16px; box-shadow: 0 8px 32px rgba(0,0,0,0.18);
  display: flex; flex-direction: column; overflow: hidden;
  animation: slideUp 0.2s ease;
}
@keyframes slideUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}

.header {
  padding: 16px 20px; border-bottom: 1px solid var(--xiaoyun-border-card);
  display: flex; align-items: center; justify-content: space-between;
}
.title { font-size: 15px; font-weight: 600; }

.body { padding: 16px 20px; display: flex; flex-direction: column; gap: 14px; overflow-y: auto; }

.field { display: flex; flex-direction: column; gap: 4px; }
.label { font-size: 12px; color: var(--xiaoyun-text-secondary); font-weight: 500; }

.input {
  height: 36px; border: 1px solid var(--xiaoyun-border-card);
  border-radius: 8px; padding: 0 12px; font-size: 13px; outline: none;
}
.input:focus { border-color: var(--xiaoyun-primary-border); }

.textarea {
  height: 80px; border: 1px solid var(--xiaoyun-border-card);
  border-radius: 8px; padding: 8px 12px; font-size: 13px; outline: none; resize: vertical;
}
.textarea:focus { border-color: var(--xiaoyun-primary-border); }

.select {
  height: 36px; border: 1px solid var(--xiaoyun-border-card);
  border-radius: 8px; padding: 0 10px; font-size: 13px; outline: none;
  background: var(--xiaoyun-bg-card); cursor: pointer;
}
.select:focus { border-color: var(--xiaoyun-primary-border); }

.footer {
  padding: 14px 20px; border-top: 1px solid var(--xiaoyun-border-card);
  display: flex; justify-content: flex-end; gap: 8px;
}

.cancelBtn {
  height: 34px; padding: 0 18px; border-radius: 8px;
  border: 1px solid var(--xiaoyun-border-card); background: var(--xiaoyun-bg-card);
  cursor: pointer; font-size: 13px; color: var(--xiaoyun-text-secondary);
}

.saveBtn {
  height: 34px; padding: 0 20px; border-radius: 8px;
  border: none; background: var(--xiaoyun-primary); color: #fff;
  cursor: pointer; font-size: 13px; font-weight: 500;
}
.saveBtn:hover { background: var(--xiaoyun-primary-hover); }
.saveBtn:disabled { opacity: 0.5; cursor: not-allowed; }

.deleteBtn {
  height: 34px; padding: 0 16px; border-radius: 8px; margin-right: auto;
  border: 1px solid #ffa39e; background: #fff1f0; color: #cf1322;
  cursor: pointer; font-size: 12px;
}
.deleteBtn:hover { background: #ffa39e; color: #fff; }
```

- [ ] **Step 2: 创建 TaskFormModal 组件**

```tsx
import React, { useState, useEffect } from 'react';
import { CloseOutlined, DeleteOutlined } from '@ant-design/icons';
import type { TaskItem, TaskPriority, TaskModule } from './types';
import styles from './TaskFormModal.module.css';

interface Props {
  task?: TaskItem | null;
  onSave: (data: {
    title: string; description: string; priority: TaskPriority;
    module: TaskModule; orderNo: string; styleNo: string; endTime: string;
  }) => void;
  onDelete?: (id: string) => void;
  onClose: () => void;
}

const MODULE_OPTIONS: { value: TaskModule; label: string }[] = [
  { value: 'production', label: '生产管理' },
  { value: 'style', label: '样衣开发' },
  { value: 'warehouse', label: '仓库管理' },
  { value: 'procurement', label: '采购管理' },
  { value: 'quality', label: '质检管理' },
  { value: 'finance', label: '财务管理' },
  { value: 'system', label: '系统管理' },
];

const TaskFormModal: React.FC<Props> = ({ task, onSave, onDelete, onClose }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [module, setModule] = useState<TaskModule>('production');
  const [orderNo, setOrderNo] = useState('');
  const [styleNo, setStyleNo] = useState('');
  const [endTime, setEndTime] = useState('');

  const isEdit = !!task;

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description);
      setPriority(task.priority);
      setModule(task.module);
      setOrderNo(task.orderNo || '');
      setStyleNo(task.styleNo || '');
      setEndTime(task.endTime ? task.endTime.slice(0, 10) : '');
    }
  }, [task]);

  const handleSave = () => {
    if (!title.trim()) return;
    onSave({ title: title.trim(), description: description.trim(), priority, module, orderNo: orderNo.trim(), styleNo: styleNo.trim(), endTime });
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <span className={styles.title}>{isEdit ? '编辑任务' : '新建任务'}</span>
          <CloseOutlined style={{ cursor: 'pointer', color: 'var(--xiaoyun-text-tertiary)' }} onClick={onClose} />
        </div>
        <div className={styles.body}>
          <div className={styles.field}>
            <span className={styles.label}>任务标题 *</span>
            <input className={styles.input} value={title} onChange={e => setTitle(e.target.value)} placeholder="输入任务标题" autoFocus />
          </div>
          <div className={styles.field}>
            <span className={styles.label}>任务描述</span>
            <textarea className={styles.textarea} value={description} onChange={e => setDescription(e.target.value)} placeholder="任务详细描述（可选）" />
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <div className={styles.field} style={{ flex: 1 }}>
              <span className={styles.label}>优先级</span>
              <select className={styles.select} value={priority} onChange={e => setPriority(e.target.value as TaskPriority)}>
                <option value="high">🔴 紧急</option>
                <option value="medium">🟡 一般</option>
                <option value="low">🟢 低</option>
              </select>
            </div>
            <div className={styles.field} style={{ flex: 1 }}>
              <span className={styles.label}>所属模块</span>
              <select className={styles.select} value={module} onChange={e => setModule(e.target.value as TaskModule)}>
                {MODULE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <div className={styles.field} style={{ flex: 1 }}>
              <span className={styles.label}>关联订单号</span>
              <input className={styles.input} value={orderNo} onChange={e => setOrderNo(e.target.value)} placeholder="可选" />
            </div>
            <div className={styles.field} style={{ flex: 1 }}>
              <span className={styles.label}>关联款号</span>
              <input className={styles.input} value={styleNo} onChange={e => setStyleNo(e.target.value)} placeholder="可选" />
            </div>
          </div>
          <div className={styles.field}>
            <span className={styles.label}>截止日期</span>
            <input className={styles.input} type="date" value={endTime} onChange={e => setEndTime(e.target.value)} />
          </div>
        </div>
        <div className={styles.footer}>
          {isEdit && onDelete && (
            <button className={styles.deleteBtn} onClick={() => onDelete(task!.id)}>
              <DeleteOutlined style={{ marginRight: 4 }} />删除
            </button>
          )}
          <button className={styles.cancelBtn} onClick={onClose}>取消</button>
          <button className={styles.saveBtn} onClick={handleSave} disabled={!title.trim()}>
            {isEdit ? '保存' : '创建任务'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default React.memo(TaskFormModal);
```

---

### Task 3.3: QuickLinksPanel — 快捷入口面板

**Files:**
- Create: `frontend/src/components/common/GlobalAiAssistant/QuickLinksPanel.tsx`
- Create: `frontend/src/components/common/GlobalAiAssistant/QuickLinksPanel.module.css`

- [ ] **Step 1: 创建 CSS 模块**

```css
.container { padding: 8px; display: flex; flex-direction: column; gap: 16px; }

.sectionTitle { font-size: 12px; color: var(--xiaoyun-text-tertiary); font-weight: 500; padding: 0 8px; }

.grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 8px;
}

.linkCard {
  display: flex; align-items: center; gap: 10px;
  padding: 14px 12px; border-radius: 12px; background: var(--xiaoyun-bg-card);
  border: 1px solid var(--xiaoyun-border-card); cursor: pointer;
  transition: all 0.15s; font-size: 13px; color: var(--xiaoyun-text-primary);
  text-decoration: none;
}
.linkCard:hover { border-color: var(--xiaoyun-primary-border); box-shadow: 0 2px 8px rgba(0,83,204,0.06); }

.linkIcon { font-size: 20px; flex-shrink: 0; }
.linkLabel { font-weight: 500; line-height: 1.3; }
```

- [ ] **Step 2: 创建组件**

```tsx
import React from 'react';
import type { NavigateFunction } from 'react-router-dom';
import styles from './QuickLinksPanel.module.css';

interface LinkItem {
  key: string; icon: string; label: string; path: string;
}

const MODULE_LINKS: LinkItem[] = [
  { key: 'production', icon: '🏭', label: '生产管理', path: '/production' },
  { key: 'style', icon: '👗', label: '样衣开发', path: '/style' },
  { key: 'warehouse', icon: '📦', label: '仓库管理', path: '/warehouse' },
  { key: 'procurement', icon: '🛒', label: '采购管理', path: '/procurement' },
  { key: 'quality', icon: '✅', label: '质检管理', path: '/quality' },
  { key: 'finance', icon: '💰', label: '财务管理', path: '/finance' },
  { key: 'system', icon: '⚙️', label: '系统管理', path: '/system' },
  { key: 'dashboard', icon: '📊', label: '数据看板', path: '/dashboard' },
];

interface Props {
  navigate: NavigateFunction;
  onClose: () => void;
}

const QuickLinksPanel: React.FC<Props> = ({ navigate, onClose }) => {
  const goTo = (path: string) => {
    onClose();
    navigate(path);
  };

  return (
    <div className={styles.container}>
      <span className={styles.sectionTitle}>系统快捷入口</span>
      <div className={styles.grid}>
        {MODULE_LINKS.map(link => (
          <div key={link.key} className={styles.linkCard} onClick={() => goTo(link.path)}>
            <span className={styles.linkIcon}>{link.icon}</span>
            <span className={styles.linkLabel}>{link.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default React.memo(QuickLinksPanel);
```

---

## Phase 4: 主组件整合

### Task 4.1: 重构 GlobalAiAssistant/index.tsx

**Files:**
- Modify: `frontend/src/components/common/GlobalAiAssistant/index.tsx`

核心改动：将当前分离式 `isOpen`/`isTaskPanelOpen` 切换重构为统一面板 + 视图切换。

**关键变更点：**

1. 导入新组件和 Hook：
```typescript
import { usePanelResize } from './usePanelResize';
import { useTaskManager } from './useTaskManager';
import TaskListView from './TaskListView';
import TaskFormModal from './TaskFormModal';
import QuickLinksPanel from './QuickLinksPanel';
import type { PanelView, TaskItem, TaskPriority, TaskModule } from './types';
```

2. 新增状态：
```typescript
const [activeView, setActiveView] = useState<PanelView>('chat');
const [editingTask, setEditingTask] = useState<TaskItem | null>(null);
const [showTaskForm, setShowTaskForm] = useState(false);
```

3. 面板容器使用动态尺寸：
```tsx
<div className={styles.chatPanel} style={{
  '--xiaoyun-panel-width': `${dimensions.width}px`,
  '--xiaoyun-panel-height': `${dimensions.height}px`,
} as React.CSSProperties}>
```

4. 顶栏新增缩放按钮：
```tsx
<ExpandOutlined
  className={styles.headerActionBtn}
  onClick={cycleSize}
  title={size === 'small' ? '放大面板' : size === 'medium' ? '最大化' : '恢复默认'}
/>
```

5. 面板体结构：
```tsx
<div className={styles.panelBody}>
  {showSidebar && (
    <div className={styles.sidebar}>
      <button className={`${styles.sidebarItem} ${activeView === 'chat' ? styles.active : ''}`}
        onClick={() => setActiveView('chat')} title="对话">
        <MessageOutlined />
        <span className={styles.sidebarLabel}>对话</span>
      </button>
      <button className={`${styles.sidebarItem} ${activeView === 'tasks' ? styles.active : ''}`}
        onClick={() => { setActiveView('tasks'); fetchTasks(); }}>
        <UnorderedListOutlined />
        <span className={styles.sidebarLabel}>任务</span>
        {stats.pending > 0 && (
          <span style={{ fontSize: 10, background: 'var(--xiaoyun-danger)', color: '#fff', borderRadius: 8, padding: '0 4px', lineHeight: '16px', minWidth: 16, textAlign: 'center' }}>
            {stats.pending}
          </span>
        )}
      </button>
      <button className={`${styles.sidebarItem} ${activeView === 'links' ? styles.active : ''}`}
        onClick={() => setActiveView('links')} title="快捷入口">
        <LinkOutlined />
        <span className={styles.sidebarLabel}>快捷</span>
      </button>
    </div>
  )}

  <div className={styles.mainContent}>
    {activeView === 'chat' && (
      // ... 现有聊天区域代码（保持完整）
    )}
    {activeView === 'tasks' && !showTaskForm && (
      <TaskListView
        tasks={tasks} loading={loading}
        onClaim={claimTask} onComplete={handleCompleteTask}
        onEdit={setEditingTask} onCreate={() => { setEditingTask(null); setShowTaskForm(true); }}
      />
    )}
    {activeView === 'links' && (
      <QuickLinksPanel navigate={navigate} onClose={() => setIsOpen(false)} />
    )}
  </div>

  {showAuxPanel && activeView === 'tasks' && (
    <div className={styles.auxPanel}>
      {/* 任务统计 + 快捷操作 */}
    </div>
  )}
</div>
```

6. 任务表单浮层：
```tsx
{showTaskForm && (
  <TaskFormModal
    task={editingTask}
    onSave={async (data) => {
      if (editingTask) {
        await updateTask(editingTask.id, data);
      } else {
        await createTask(data);
      }
      setShowTaskForm(false);
      setEditingTask(null);
    }}
    onDelete={editingTask ? (id) => { deleteTask(id); setShowTaskForm(false); setEditingTask(null); } : undefined}
    onClose={() => { setShowTaskForm(false); setEditingTask(null); }}
  />
)}
```

7. handleCompleteTask（带确认）：
```typescript
const handleCompleteTask = useCallback((id: string) => {
  completeTask(id);
}, [completeTask]);
```

8. useEffect 生命周期：
```typescript
useEffect(() => {
  if (isOpen && activeView === 'tasks') startPolling();
  else stopPolling();
  return () => stopPolling();
}, [isOpen, activeView, startPolling, stopPolling]);
```

---

## Phase 5: 验证

### Task 5.1: 编译验证

- [ ] **Step 1: 后端编译**

```bash
cd backend && mvn clean compile -q 2>&1 | tail -3
# Expected: BUILD SUCCESS
```

- [ ] **Step 2: 前端 TypeScript 检查**

```bash
cd frontend && npx tsc --noEmit 2>&1 | tail -5
# Expected: 0 errors
```

### Task 5.2: 功能验证

- [ ] 小云浮标点击打开 → 640px 面板正常显示聊天
- [ ] 点击放大按钮 → 960px 面板，侧边导航出现
- [ ] 点击任务导航 → 任务列表显示
- [ ] 点击新建任务 → 表单弹出，填写后创建成功
- [ ] 点击领取 → 任务状态变为进行中
- [ ] 点击完成 → 任务状态变为已完成
- [ ] 点击编辑 → 表单弹出，修改后保存
- [ ] 点击删除 → 任务被删除
- [ ] 点击快捷入口 → 跳转到对应模块页面
- [ ] 再次点击放大 → 1280px 面板，辅助面板出现
- [ ] 关闭小云 → 浮标恢复吸附