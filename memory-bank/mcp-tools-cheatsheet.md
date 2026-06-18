# MCP 工具参数速查表

> 每轮对话开始时加载到上下文，消除 MCP 工具调用的参数试错环节
> 规则：调用 MCP 前先查表，第一次就用正确参数名

---

## 一、本机可用的 MCP Servers

| Server Name | 用途 | 何时使用 |
|-------------|------|---------|
| **integrated_browser** | 浏览器自动化（导航/点击/填表/截图/抽取数据） | 需要打开网页、操作 Web 界面、获取 Web 内容时 |
| **mcp_Filesystem** | 本地文件系统（读文件/目录/文件信息） | MCP 场景下读写本地文件 |
| **mcp_Sequential_Thinking** | 多步推理（显式逐步思考） | 复杂问题需要拆解思路时 |
| **mcp_context7** | 第三方库/框架官方文档查询（resolve + query） | 需要查某个库的 API 用法时 |
| **mcp_docker** | Docker 容器管理（列表/启动/停止/日志/镜像/网络/卷） | 需要操作 Docker 容器、镜像时 |

---

## 二、各 Server 工具清单 & 正确参数名

### 2.1 mcp_Filesystem

> **⚠️ 路径限制**：只能访问 `/Users/guojunmini4/Desktop` 和 `/Users/guojunmini4/Documents`
> **⚠️ 注意**：本项目路径是 `/Volumes/macoo2/Users/guojunmini4/Documents/服装66666/`，MCP Filesystem **无法直接访问**
> **✅ 方案**：项目内的文件操作**优先使用原生工具**（Read / Edit / Write / Glob / Grep / LS / SearchCodebase），不要调用 mcp_Filesystem

| Tool | 参数（必填） | 说明 |
|------|-------------|------|
| **read_file** | `path` (string) | 读取文件（二进制）|
| **read_text_file** | `path` (string) | 读取文本文件 |
| **read_multiple_files** | `paths` (array of string) | 批量读取多个文件 |
| **write_file** | `path` (string), `content` (string) | 写入文件 |
| **create_directory** | `path` (string) | 创建目录 |
| **list_directory** | `path` (string) | 列出目录内容 |
| **directory_tree** | `path` (string) | 目录树 |
| **get_file_info** | `path` (string) | 文件元信息 |
| **edit_file** | `path` (string), `edits` (array) | 编辑文件 |
| **search_files** | `pattern` (string), `path` (string, optional) | 搜索文件 |
| **list_allowed_directories** | 无参数 | 列出允许访问的目录 |

**正确调用示例**：
```
run_mcp(mcp_Filesystem, read_text_file, { path: "/Users/guojunmini4/Documents/test.txt" })
```

---

### 2.2 mcp_Sequential_Thinking

| Tool | 参数（必填） | 说明 |
|------|-------------|------|
| **sequentialthinking** | `thought` (string), `thoughtNumber` (number), `totalThoughts` (number), `nextThoughtNeeded` (boolean), `enable_hardcoded_system_prompt` (boolean, optional) | 一步一步思考 |

**正确调用示例**：
```
run_mcp(mcp_Sequential_Thinking, sequentialthinking, {
  thought: "第1步：分析问题核心",
  thoughtNumber: 1,
  totalThoughts: 3,
  nextThoughtNeeded: true,
  enable_hardcoded_system_prompt: true
})
```

---

### 2.3 mcp_docker

| Tool | 参数（必填） | 说明 |
|------|-------------|------|
| **list_containers** | 无参数 | 列出所有容器 |
| **create_container** | `name` (string), `image` (string), ... | 创建容器 |
| **run_container** | `name` (string), `image` (string), ... | 运行容器 |
| **recreate_container** | `name` (string), `image` (string), ... | 重新创建并运行 |
| **start_container** | `name` (string) | 启动已有容器 |
| **stop_container** | `name` (string) | 停止容器 |
| **remove_container** | `name` (string) | 删除容器 |
| **fetch_container_logs** | `name` (string), `tail` (number, optional) | 获取容器日志 |
| **list_images** | 无参数 | 列出镜像 |
| **pull_image** | `image` (string) | 拉取镜像 |
| **push_image** | `image` (string) | 推送镜像 |
| **build_image** | `dockerfile` (string), `tag` (string), `context` (string) | 构建镜像 |
| **remove_image** | `image` (string) | 删除镜像 |
| **list_networks** | 无参数 | 列出网络 |
| **create_network** | `name` (string) | 创建网络 |
| **remove_network** | `name` (string) | 删除网络 |
| **list_volumes** | 无参数 | 列出卷 |
| **create_volume** | `name` (string) | 创建卷 |
| **remove_volume** | `name` (string) | 删除卷 |

**正确调用示例**：
```
run_mcp(mcp_docker, list_containers, {})
run_mcp(mcp_docker, fetch_container_logs, { name: "fashion-mysql-simple", tail: 50 })
```

---

### 2.4 mcp_context7

| Tool | 参数（必填） | 说明 |
|------|-------------|------|
| **resolve-library-id** | `libraryName` (string) | 通过关键词找 libraryId（格式：`/owner/repo`）|
| **query-docs** | `libraryId` (string, 格式 `/owner/repo`), `query` (string), `context_length` (number, optional), `response_type` (string, optional) | 查询指定库的文档 |

**正确调用示例**：
```
run_mcp(mcp_context7, resolve-library-id, { libraryName: "Spring Boot" })
run_mcp(mcp_context7, query-docs, {
  libraryId: "/spring-projects/spring-boot",
  query: "如何配置 @Transactional 事务隔离级别",
  context_length: 4000,
  response_type: "brief"
})
```

---

### 2.5 integrated_browser

| Tool | 参数（必填） | 说明 |
|------|-------------|------|
| **browser_navigate** | （无需参数，浏览器内部有状态）| 导航到指定 URL |
| **browser_navigate_back** | 无参数 | 返回上一页 |
| **browser_tabs** | 无参数 | 列出当前打开的标签页 |
| **browser_snapshot** | 无参数 | 获取当前页面快照（DOM 结构/可点击元素）|
| **browser_take_screenshot** | 无参数 | 截取当前页面截图 |
| **browser_click** | `element` (string, CSS选择器或元素引用) | 点击元素 |
| **browser_hover** | `element` (string) | 悬停在元素上 |
| **browser_type** | `element` (string), `text` (string) | 在输入框中输入文本 |
| **browser_select_option** | `element` (string), `option` (string) | 选择下拉选项 |
| **browser_press_key** | `key` (string) | 按下键盘按键 |
| **browser_get_attribute** | `element` (string), `attribute` (string) | 获取元素属性 |
| **browser_scroll** | `direction` (string: "up"/"down"/"left"/"right") | 滚动页面 |
| **browser_console_messages** | 无参数 | 获取浏览器 console 输出 |
| **browser_network_requests** | 无参数 | 获取网络请求记录 |
| **browser_wait_for** | 无参数，或 `selector` (string, optional) | 等待页面加载或元素出现 |
| **browser_lock** | 无参数 | 锁定浏览器（操作前必须）|
| **browser_unlock** | 无参数 | 解锁浏览器（操作后必须）|
| **browser_evaluate** | `script` (string) | 在页面执行 JS |
| **browser_handle_dialog** | `action` (string: "accept"/"dismiss") | 处理弹窗 |

**标准调用流程**：
```
1. run_mcp(integrated_browser, browser_lock, {})            // 先锁定
2. run_mcp(integrated_browser, browser_navigate, { url: "https://example.com" })
3. run_mcp(integrated_browser, browser_snapshot, {})         // 看页面有什么
4. run_mcp(integrated_browser, browser_click, { element: "button.submit" })
5. run_mcp(integrated_browser, browser_take_screenshot, {})  // 截图验证
6. run_mcp(integrated_browser, browser_unlock, {})           // 最后解锁
```

---

## 三、文件操作工具优先级

| 场景 | 优先工具 | 说明 |
|------|---------|------|
| 项目内文件读取 | **Read** / **Glob** | 不受 MCP 路径限制 |
| 项目内代码搜索 | **SearchCodebase** / **Grep** | 支持中文关键词，带行号 |
| 项目内文件修改 | **Edit** / **Write** | 直接修改 |
| 项目外文件读/写 | **mcp_Filesystem** | 仅限 `/Users/guojunmini4/Documents` 和 `Desktop` |
| 复杂文件操作 | **RunCommand** | bash 命令灵活处理 |

**铁律**：项目文件操作永远不调用 mcp_Filesystem，直接用原生工具。

---

## 四、MCP 调用失败自愈流程

当 MCP 返回 `Input validation error` 或 `server is not found` 时，按以下顺序自愈：

### Step 1：参数名错误（最常见）
检查：参数名是否与上表一致？常见错写：
- ❌ `uri` → ✅ `path` (Filesystem)
- ❌ `query` → ✅ `thought` (SequentialThinking)
- ❌ `library` → ✅ `libraryId` (context7)
- ❌ `container` → ✅ `name` (docker)
- ❌ `url` → ✅ 浏览器内部状态，通常 navigate 不需要参数

### Step 2：路径不在允许范围内（Filesystem）
- 检查 path 是否以 `/Users/guojunmini4/Documents` 或 `/Users/guojunmini4/Desktop` 开头
- 如果是 `/Volumes/macoo2/...`，改用 **原生 Read/Glob/LS**

### Step 3：Server 不可用
- 查"本机可用的 MCP Servers"列表
- 目标 server 不在列表中 → 改用替代方案（如用 `RunCommand` 替代 mcp_docker 等）

### Step 4：返回给用户的信息
- 如果自愈失败，明确告诉用户：尝试了 X 种参数名 / 路径方案，均失败
- 给出下一步建议（如"请确认 MCP server 是否已启用"或"改用 shell 命令执行"）
