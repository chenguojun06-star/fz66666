# 小云 AI 当前项目 - 立即可实施的 3 大优化方案

**生成日期**：2026-04-26  
**适用对象**：当前的 AiAgentOrchestrator  
**优先级**：🔴 高（可立即启动）  
**目标**：基于 Claude Code 的对标分析，提取对当前项目最有帮助的 3 个改进

---

## 优化方案概览

| 方案 | 改进点 | 工作量 | 收益 | 启动难度 |
|------|--------|--------|------|----------|
| **方案 1** | 添加流式进度回调 | 3-5 天 | 用户体验+20% | ⭐ 低 |
| **方案 2** | 缓存优化（已有基础） | 2-3 天 | 响应速度+30% | ⭐ 低 |
| **方案 3** | 权限决策前置检查 | 2-3 天 | 安全性+工作效率 | ⭐ 低 |

---

## 🎯 方案 1：流式进度回调（最高收益）

### 问题分析

**当前状态**：
```java
// AiAgentOrchestrator.java:101
public Result<String> executeAgent(String userMessage) {
    // ... 长流程执行
    return Result.success(finalResult);  // 用户等待到完全结束
}
```

**用户感受**：调用 API 后**无任何反馈**，直到 2-3 秒后返回结果。

### 解决方案

**步骤 1：新增 SseEmitter 端点**

```java
// backend/src/main/.../intelligence/controller/AiAgentStreamController.java（新建）

@RestController
@RequestMapping("/api/intelligence/agent")
@PreAuthorize("isAuthenticated()")
@Slf4j
public class AiAgentStreamController {
  
  @Autowired
  private AiAgentOrchestrator aiAgentOrchestrator;
  
  /**
   * 流式 AI Agent 执行（返回 Server-Sent Events）
   * 
   * 响应格式：
   * event: thinking
   * data: {"progress":0,"message":"🤔 小云正在思考..."}
   * 
   * event: tool_start
   * data: {"toolName":"ScanRecordLookup","progress":10}
   * 
   * event: tool_progress
   * data: {"toolName":"ScanRecordLookup","progress":50,"current":250,"total":500}
   * 
   * event: result
   * data: {"result":"...","usage":{"tokens":1200}}
   */
  @GetMapping("/execute-stream")
  public SseEmitter executeAgentStream(
      @RequestParam String message,
      @RequestParam(required = false) String context) {
    
    SseEmitter emitter = new SseEmitter(30_000L);  // 30秒超时
    
    // 异步执行，不阻塞 HTTP 线程
    new Thread(() -> {
      try {
        // 第 1 步：思考阶段
        emitter.send(SseEmitter.event()
          .id(UUID.randomUUID().toString())
          .name("thinking")
          .data(Map.of("progress", 5, "message", "🤔 小云正在思考..."))
          .build());
        
        // 第 2 步：执行 Agent（核心逻辑）
        // 这里需要改造 AiAgentOrchestrator 支持流式回调
        aiAgentOrchestrator.executeAgentWithProgress(message, context, new ProgressCallback() {
          @Override
          public void onToolStart(String toolName, int progress) {
            try {
              emitter.send(SseEmitter.event()
                .name("tool_start")
                .data(Map.of("toolName", toolName, "progress", progress))
                .build());
            } catch (IOException e) {
              log.error("SSE send error", e);
            }
          }
          
          @Override
          public void onToolProgress(String toolName, int current, int total) {
            try {
              int progress = (int) (20 + (60.0 * current / total));  // 20%-80%
              emitter.send(SseEmitter.event()
                .name("tool_progress")
                .data(Map.of(
                  "toolName", toolName,
                  "progress", progress,
                  "current", current,
                  "total", total,
                  "message", String.format("%s: %d/%d", toolName, current, total)
                ))
                .build());
            } catch (IOException e) {
              log.error("SSE send error", e);
            }
          }
          
          @Override
          public void onToolComplete(String toolName) {
            try {
              emitter.send(SseEmitter.event()
                .name("tool_complete")
                .data(Map.of("toolName", toolName, "progress", 85))
                .build());
            } catch (IOException e) {
              log.error("SSE send error", e);
            }
          }
          
          @Override
          public void onResult(String result, Map<String, Object> usage) {
            try {
              emitter.send(SseEmitter.event()
                .name("result")
                .data(Map.of(
                  "result", result,
                  "progress", 100,
                  "usage", usage
                ))
                .build());
              emitter.complete();
            } catch (IOException e) {
              log.error("SSE send error", e);
              emitter.completeWithError(e);
            }
          }
        });
        
      } catch (IOException e) {
        log.error("SSE initialization error", e);
        try {
          emitter.send(SseEmitter.event()
            .name("error")
            .data(Map.of("message", e.getMessage()))
            .build());
        } catch (IOException ioe) {
          log.error("SSE error send failed", ioe);
        }
        emitter.completeWithError(e);
      }
    }).start();
    
    return emitter;
  }
}
```

**步骤 2：定义 ProgressCallback 接口**

```java
// backend/src/main/.../intelligence/agent/ProgressCallback.java（新建）

public interface ProgressCallback {
  void onThinking();
  void onToolStart(String toolName, int progress);
  void onToolProgress(String toolName, int current, int total);
  void onToolComplete(String toolName);
  void onResult(String result, Map<String, Object> usage);
}
```

**步骤 3：改造 AiAgentOrchestrator**

```java
// AiAgentOrchestrator.java（修改现有方法）

// 新增一个重载方法，支持回调
public String executeAgentWithProgress(
    String userMessage,
    String pageContext,
    ProgressCallback callback) {
  
  try {
    // 思考阶段
    if (callback != null) callback.onThinking();
    
    // ... 现有逻辑 ...
    List<AgentTool> selectedTools = toolAdvisor.selectTools(userMessage);
    
    for (AgentTool tool : selectedTools) {
      if (callback != null) {
        callback.onToolStart(tool.name(), 30 + (selectedTools.indexOf(tool) * 10));
      }
      
      // 工具执行（添加进度回调）
      Object toolResult = executeToolWithProgress(tool, callback);
      
      if (callback != null) {
        callback.onToolComplete(tool.name());
      }
    }
    
    // 最终结果
    String finalResult = generateFinalAnswer(selectedTools);
    
    if (callback != null) {
      callback.onResult(finalResult, Map.of(
        "tokens", estimatedTokens,
        "tools", selectedTools.size(),
        "duration_ms", System.currentTimeMillis() - startTime
      ));
    }
    
    return finalResult;
    
  } catch (Exception e) {
    if (callback != null) {
      callback.onError(e.getMessage());
    }
    throw e;
  }
}

private Object executeToolWithProgress(AgentTool tool, ProgressCallback callback) {
  // 假设工具支持批量操作，分批返回进度
  // 例如：查询 500 条记录时，每 100 条报告一次进度
  
  return tool.call();  // 当前简化版，后续可扩展
}
```

**步骤 4：前端实现 SSE 接收**

```typescript
// frontend/src/modules/intelligence/hooks/useAiAgentStream.ts（新建）

export const useAiAgentStream = (message: string, context?: string) => {
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<'thinking' | 'executing' | 'done' | 'error'>('thinking');
  const [result, setResult] = useState('');
  const [toolProgress, setToolProgress] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    const eventSource = new EventSource(
      `/api/intelligence/agent/execute-stream?message=${encodeURIComponent(message)}&context=${context || ''}`
    );

    eventSource.addEventListener('thinking', () => {
      setStatus('thinking');
      setProgress(5);
    });

    eventSource.addEventListener('tool_start', (event) => {
      const { toolName, progress: p } = JSON.parse(event.data);
      setStatus('executing');
      setProgress(p);
      setToolProgress(prev => new Map(prev).set(toolName, p));
    });

    eventSource.addEventListener('tool_progress', (event) => {
      const { toolName, progress: p, message: msg } = JSON.parse(event.data);
      setToolProgress(prev => new Map(prev).set(toolName, p));
      setProgress(p);
      console.log(`[进度] ${msg}`);  // 用户可看到"ScanRecordLookup: 250/500"
    });

    eventSource.addEventListener('tool_complete', (event) => {
      const { toolName } = JSON.parse(event.data);
      setToolProgress(prev => {
        const m = new Map(prev);
        m.delete(toolName);
        return m;
      });
    });

    eventSource.addEventListener('result', (event) => {
      const { result: r, usage } = JSON.parse(event.data);
      setResult(r);
      setProgress(100);
      setStatus('done');
      console.log(`[完成] 耗时: ${usage.duration_ms}ms, tokens: ${usage.tokens}`);
      eventSource.close();
    });

    eventSource.addEventListener('error', (event) => {
      setStatus('error');
      console.error('SSE error:', event);
      eventSource.close();
    });

    return () => eventSource.close();
  }, [message, context]);

  return { progress, status, result, toolProgress };
};
```

**步骤 5：前端 UI 显示进度**

```tsx
// frontend/src/modules/intelligence/components/AiAgentStreamView.tsx（新建）

export const AiAgentStreamView: React.FC<{ message: string }> = ({ message }) => {
  const { progress, status, result, toolProgress } = useAiAgentStream(message);

  return (
    <div className="ai-stream-view">
      {/* 主进度条 */}
      <Progress percent={progress} status={status === 'error' ? 'exception' : status === 'done' ? 'success' : 'active'} />

      {/* 工具进度详情 */}
      {toolProgress.size > 0 && (
        <div className="tool-progress-detail">
          {Array.from(toolProgress.entries()).map(([toolName, p]) => (
            <div key={toolName}>
              <span>{toolName}</span>
              <Progress percent={p} size="small" />
            </div>
          ))}
        </div>
      )}

      {/* 最终结果 */}
      {status === 'done' && <Alert message={result} type="success" />}
      {status === 'error' && <Alert message="执行出错" type="error" />}
    </div>
  );
};
```

### 工作量分解

- 后端新增 Controller：1 天
- 改造 AiAgentOrchestrator：1 天
- 前端 Hook + 组件：1 天
- 测试调优：1-2 天
- **总计**：3-5 天

### 收益

- ✅ 用户体验：等待期间看到实时进度，体验提升 20-30%
- ✅ 用户留存：不会因为"无反馈"而怀疑系统卡住
- ✅ 调试效率：开发人员可看到工具执行的实时进度

---

## 方案 2：缓存优化（已有基础）

### 问题分析

**当前状态**：
```java
// AiAgentOrchestrator.java:88
private final ConcurrentHashMap<String, CacheEntry> queryCache = new ConcurrentHashMap<>();
private static final long CACHE_TTL_MS = TimeUnit.MINUTES.toMillis(5);
private static final int CACHE_MAX_SIZE = 200;
```

**改进空间**：
- 缓存命中率可能只有 30%
- 相同问题重复执行

### 解决方案

**步骤 1：增强缓存 Key 生成**

```java
private String generateCacheKey(String message, String pageContext) {
  // 当前：可能只用消息本身
  // 优化：考虑用户ID、工厂ID、上下文等维度
  
  String normalized = message.toLowerCase()
    .replaceAll("\\s+", "")
    .replaceAll("[？？!！.,，。]", "");  // 标准化问题
  
  String contextHash = pageContext != null 
    ? Integer.toHexString(pageContext.hashCode()) 
    : "default";
  
  String tenantHash = Integer.toHexString(UserContext.tenantId().hashCode());
  
  return String.format("%s::%s::%s", tenantHash, normalized, contextHash);
}
```

**步骤 2：缓存预热**

```java
@PostConstruct
public void warmupCache() {
  // 预装载常见问题的缓存
  String[] commonQuestions = {
    "今日销售额",
    "本周订单进度",
    "工资结算状态",
    "库存预警",
    "质检异常"
  };
  
  for (String q : commonQuestions) {
    Result<String> result = executeAgent(q);
    if (result.isSuccess()) {
      queryCache.put(generateCacheKey(q, null), new CacheEntry(result.getData()));
    }
  }
}
```

**步骤 3：多维度缓存统计**

```java
@Value("${xiaoyun.cache.enable-stats:true}")
private boolean enableCacheStats;

private Map<String, CacheStats> cacheStats = new ConcurrentHashMap<>();

private void recordCacheHit(String cacheKey, boolean isHit) {
  if (!enableCacheStats) return;
  
  cacheStats.computeIfAbsent(cacheKey, k -> new CacheStats())
    .recordHit(isHit);
}

// 定期输出缓存效率报告
@Scheduled(fixedDelay = 3600000)  // 每小时
public void logCacheStats() {
  log.info("=== Cache Statistics ===");
  double hitRate = cacheStats.values().stream()
    .mapToDouble(s -> s.getHitRate())
    .average()
    .orElse(0.0);
  log.info("Overall hit rate: {}", String.format("%.2f%%", hitRate * 100));
  
  cacheStats.entrySet().stream()
    .sorted((a, b) -> Double.compare(b.getValue().getHitRate(), a.getValue().getHitRate()))
    .limit(10)
    .forEach(e -> log.info("  {}: {}", e.getKey(), e.getValue()));
}
```

### 工作量

- 缓存 Key 优化：1 天
- 缓存预热机制：1 天
- 统计监控：0.5 天
- **总计**：2-3 天

### 收益

- 响应速度提升 20-30%（高命中率场景）
- 降低 LLM API 调用成本 15-20%

---

## 方案 3：权限决策前置检查

### 问题分析

**当前状态**：
```java
// 权限检查可能在工具执行过程中才发现
// 导致已经消耗 token 才被拒绝
```

### 解决方案

**步骤 1：在 Agent 执行前检查权限**

```java
// AiAgentOrchestrator.java（新增方法）

public boolean canExecuteTools(String userMessage, List<AgentTool> selectedTools) {
  // 在调用工具前，先批量检查权限
  for (AgentTool tool : selectedTools) {
    if (!aiAgentToolAccessService.hasAccess(tool)) {
      log.warn("User {} denied access to tool {}", UserContext.userId(), tool.name());
      return false;
    }
  }
  return true;
}

public Result<String> executeAgent(String userMessage, String pageContext) {
  // ... 现有逻辑 ...
  
  List<AgentTool> selectedTools = toolAdvisor.selectTools(userMessage);
  
  // 权限前置检查（新增）
  if (!canExecuteTools(userMessage, selectedTools)) {
    return Result.error("权限不足，无法执行该操作");
  }
  
  // 继续执行
  return Result.success(executeTools(selectedTools));
}
```

### 工作量

- 权限检查逻辑：1-2 天
- 测试用例：0.5 天
- **总计**：2-3 天

---

## 📊 三个方案的优先级排序

### 🥇 立即启动（第 1 周）：方案 1（流式进度）

**原因**：
- 用户体验最直观
- 工作量最小（3-5 天）
- 收益立竿见影

### 🥈 第 2 周：方案 2（缓存优化）

**原因**：
- 可与方案 1 并行开发
- 对用户和后端都有益
- 工作量小（2-3 天）

### 🥉 第 3 周：方案 3（权限前置）

**原因**：
- 收益较内敛（不影响 happy path）
- 但提升安全性

---

## 🎯 实施路线图

**第 1 周（方案 1 启动）**：
```
Day 1：新建 AiAgentStreamController + ProgressCallback
Day 2：改造 AiAgentOrchestrator 支持回调
Day 3-4：前端 Hook + UI 组件 + 测试
Day 5：集成测试 + 本地验收
```

**第 2 周（方案 2 并行）**：
```
Day 1-2：缓存 Key 优化 + 预热机制
Day 3：缓存统计监控
Day 4-5：性能测试 + 线上灰度
```

**第 3 周（方案 3）**：
```
Day 1-2：权限前置检查
Day 3：集成测试
Day 4-5：发布验收
```

---

## ✅ 验收清单

### 方案 1 验收

- [ ] `/api/intelligence/agent/execute-stream` 端点已创建并返回 SSE
- [ ] 前端能接收并显示 `thinking` / `tool_start` / `tool_progress` / `result` 事件
- [ ] 进度条平滑递进（0% → 100%）
- [ ] 用户手动中断时 EventSource 正确关闭
- [ ] 错误场景正确捕获并返回

### 方案 2 验收

- [ ] 缓存命中率从 30% 提升到 50%+
- [ ] 相同问题的响应时间从 2s 降低到 0.1s
- [ ] 月 LLM API 调用成本下降 15-20%

### 方案 3 验收

- [ ] 权限检查在工具执行前完成
- [ ] 无权限的工具立即返回 403，不消耗 token
- [ ] 权限决策日志完整

---

## 📞 后续支持

如需：
- 更详细的代码实现
- 性能测试方案
- 线上灰度发布计划

我都已准备好具体方案。

**推荐下一步**：
1. 选择方案 1 作为立即启动项
2. 分配 1 名后端 + 1 名前端工程师
3. 本周 Kickoff，下周一上线
