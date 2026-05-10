# 小云 AI 智能化提升 - 快速启动指南（立即可用）

**指南适用**：优先级选择 + 快速启动方案  
**文档日期**：2026-04-26  
**状态**：✅ 立即可执行

---

## 🎯 3 个快速启动选项

### 选项 A：流式 AsyncGenerator（首选，用户体验最佳）

**为什么选这个**：
- 用户最直观能感受到改进（实时进度反馈）
- 工作量相对较小（2-3 周）
- 前端可立即复用 EventSource API

**快速启动步骤**：

**步骤 1：后端新增流式端点**
```java
// backend/src/main/.../intelligence/orchestration/StreamingAiAgentOrchestrator.java

@RestController
@RequestMapping("/api/intelligence")
@PreAuthorize("isAuthenticated()")
public class StreamingAiAgentOrchestrator {
  
  @Autowired
  private AiAgentOrchestrator aiAgentOrchestrator;
  
  @PostMapping("/chat-stream")
  public Flux<ServerSentEvent<AgentMessage>> chatStream(
      @RequestBody ChatRequest req) {
    
    return Flux.create(sink -> {
      try {
        // 流式返回事件（而非一次性返回）
        aiAgentOrchestrator.processQueryStream(req.prompt)
          .forEach(message -> {
            sink.next(ServerSentEvent.<AgentMessage>builder()
              .event(message.getType())  // "thinking" / "tool_start" / "tool_progress" / "result"
              .data(message)
              .id(UUID.randomUUID().toString())
              .build());
          });
        sink.complete();
      } catch (Exception e) {
        sink.error(e);
      }
    });
  }
}
```

**步骤 2：Orchestrator 支持流式生成**
```java
// backend/src/main/.../intelligence/orchestration/AiAgentOrchestrator.java
// 添加新方法

@Transactional
public Stream<AgentMessage> processQueryStream(String prompt) {
  return Stream.<AgentMessage>builder()
    // ① 思考阶段
    .add(AgentMessage.builder()
      .type("thinking")
      .content("🤔 小云正在思考...")
      .build())
    
    // ② 工具执行
    .add(AgentMessage.builder()
      .type("tool_start")
      .toolName("ScanRecordLookup")
      .content("🔧 调用工具：扫码记录查询")
      .build())
    
    // 工具执行中的进度更新
    IntStream.rangeClosed(1, 5).forEach(i -> {
      add(AgentMessage.builder()
        .type("tool_progress")
        .toolName("ScanRecordLookup")
        .progress(i * 20)
        .content("进度：" + (i * 20) + "%")
        .build());
    });
    
    // ③ 工具完成
    .add(AgentMessage.builder()
      .type("tool_result")
      .toolName("ScanRecordLookup")
      .result(scanRecordData)
      .content("✅ 扫码查询完成，共 250 条记录")
      .build())
    
    // ④ 模型生成回复
    .add(AgentMessage.builder()
      .type("message_delta")
      .content("根据扫码数据，我分析出...")
      .build())
    
    // ⑤ 最终结果
    .add(AgentMessage.builder()
      .type("result")
      .content("本周订单进度良好...")
      .usage(new TokenUsage(1200, 450))
      .build())
    
    .build();
}
```

**步骤 3：前端接收流式事件**
```typescript
// frontend/src/modules/intelligence/hooks/useAiChatStream.ts

export const useAiChatStream = (prompt: string) => {
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    const eventSource = new EventSource(
      `/api/intelligence/chat-stream?prompt=${encodeURIComponent(prompt)}`
    );
    
    eventSource.addEventListener('thinking', (event) => {
      const message = JSON.parse(event.data);
      setMessages(prev => [...prev, {
        type: 'thinking',
        content: '🤔 小云正在思考...',
        timestamp: Date.now()
      }]);
    });
    
    eventSource.addEventListener('tool_start', (event) => {
      const { toolName, content } = JSON.parse(event.data);
      setMessages(prev => [...prev, {
        type: 'tool_start',
        content: `🔧 调用工具：${toolName}`,
        toolName
      }]);
    });
    
    eventSource.addEventListener('tool_progress', (event) => {
      const { progress, content } = JSON.parse(event.data);
      // 显示进度条
      setMessages(prev => {
        const last = prev[prev.length - 1];
        return [...prev.slice(0, -1), { ...last, progress, content }];
      });
    });
    
    eventSource.addEventListener('tool_result', (event) => {
      const message = JSON.parse(event.data);
      setMessages(prev => [...prev, {
        type: 'tool_result',
        content: '✅ ' + message.content
      }]);
    });
    
    eventSource.addEventListener('message_delta', (event) => {
      const { content } = JSON.parse(event.data);
      setMessages(prev => [...prev, {
        type: 'message',
        content
      }]);
    });
    
    eventSource.addEventListener('result', (event) => {
      const message = JSON.parse(event.data);
      setMessages(prev => [...prev, {
        type: 'final',
        content: message.content
      }]);
      setLoading(false);
    });
    
    eventSource.addEventListener('error', () => {
      setLoading(false);
      eventSource.close();
    });
    
    return () => eventSource.close();
  }, [prompt]);
  
  return { messages, loading };
};
```

**步骤 4：前端 UI 组件**
```typescript
// frontend/src/modules/intelligence/components/AiChatStreamView.tsx

export const AiChatStreamView: React.FC<{ prompt: string }> = ({ prompt }) => {
  const { messages, loading } = useAiChatStream(prompt);
  
  return (
    <div className="chat-stream-view">
      {messages.map((msg, i) => (
        <div key={i} className={`message ${msg.type}`}>
          {msg.type === 'tool_progress' && (
            <>
              <div>{msg.content}</div>
              <Progress percent={msg.progress} />
            </>
          )}
          {msg.type !== 'tool_progress' && (
            <div>{msg.content}</div>
          )}
        </div>
      ))}
      {loading && <Spin />}
    </div>
  );
};
```

**工作量分解**：
- 后端实现：3-5 天
- 前端实现：2-3 天
- 测试调优：3-5 天
- **总计**：2-3 周

---

### 选项 B：3 层内存系统（可与选项 A 并行）

**为什么选这个**：
- 可与流式化并行开发
- 为 Team 编排打基础
- AI 学习能力显著提升

**快速启动步骤**：

**步骤 1：新增 3 张数据库表**
```sql
-- Flyway: V20260426001__add_three_layer_memory_tables.sql

-- ① 转录级记忆（原始消息流）
CREATE TABLE IF NOT EXISTS t_agent_transcription (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  agent_id VARCHAR(64) NOT NULL,
  session_id VARCHAR(64) NOT NULL,
  turn_number INT NOT NULL,
  message_type ENUM('user_input', 'agent_thinking', 'tool_use', 'agent_response') NOT NULL,
  content LONGTEXT,
  metadata JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_tenant_agent_session (tenant_id, agent_id, session_id),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ② 自动提取级记忆（关键决策/问题/方案）
CREATE TABLE IF NOT EXISTS t_intelligence_memory_extracted (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  transcription_id BIGINT,
  memory_type ENUM('decision', 'problem', 'solution', 'insight') NOT NULL,
  key_text VARCHAR(255),
  full_content LONGTEXT,
  confidence FLOAT,
  embedding VECTOR(1024),  -- 可选：用于向量相似度查询
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_transcription_key (transcription_id, memory_type, key_text),
  INDEX idx_tenant_type (tenant_id, memory_type),
  FULLTEXT INDEX ft_content (full_content)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ③ Team 共享级记忆（跨 Team 可见）
CREATE TABLE IF NOT EXISTS t_team_shared_memory (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  team_id BIGINT NOT NULL,
  source_team_id BIGINT,
  memory_key VARCHAR(255),
  memory_content LONGTEXT,
  visibility ENUM('team_only', 'tenant_wide', 'public') DEFAULT 'team_only',
  version INT DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_team_visibility (team_id, visibility),
  UNIQUE KEY uq_team_key_version (team_id, memory_key, version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

**步骤 2：实现转录记录服务**
```java
// backend/src/main/.../intelligence/service/AgentTranscriptionService.java

@Service
public class AgentTranscriptionService {
  
  @Autowired
  private AgentTranscriptionMapper transcriptionMapper;
  
  @Autowired
  private MemoryExtractionService memoryExtractionService;
  
  /**
   * 记录每个 Agent 消息（异步，不阻塞主流程）
   */
  @Async
  public void recordMessage(
      Long tenantId,
      String agentId,
      String sessionId,
      AgentMessageType type,
      String content) {
    
    AgentTranscription trans = new AgentTranscription()
      .setTenantId(tenantId)
      .setAgentId(agentId)
      .setSessionId(sessionId)
      .setMessageType(type)
      .setContent(content)
      .setTurnNumber(getTurnNumber(sessionId));
    
    transcriptionMapper.insert(trans);
    
    // 触发异步内存提取
    memoryExtractionService.extractMemoriesAsync(trans.getId());
  }
}
```

**步骤 3：实现自动提取服务**
```java
// backend/src/main/.../intelligence/service/MemoryExtractionService.java

@Service
public class MemoryExtractionService {
  
  @Autowired
  private AiAgentOrchestrator aiAgentOrchestrator;
  
  @Autowired
  private IntelligenceMemoryExtractedMapper memoryMapper;
  
  /**
   * 从转录中自动提取关键记忆（异步）
   */
  @Async
  public void extractMemoriesAsync(Long transcriptionId) {
    AgentTranscription trans = transcriptionMapper.selectById(transcriptionId);
    
    // 调用 AI 提取关键信息
    String extractionPrompt = buildExtractionPrompt(trans.getContent());
    String extracted = aiAgentOrchestrator.querySimple(extractionPrompt);
    
    // 解析提取结果
    Map<String, List<String>> parsed = parseExtractedMemories(extracted);
    
    // 存储
    parsed.forEach((type, items) -> {
      items.forEach(item -> {
        IntelligenceMemoryExtracted memory = new IntelligenceMemoryExtracted()
          .setTenantId(trans.getTenantId())
          .setTranscriptionId(transcriptionId)
          .setMemoryType(MemoryType.valueOf(type.toUpperCase()))
          .setKeyText(item.substring(0, Math.min(255, item.length())))
          .setFullContent(item)
          .setConfidence(0.85f);  // 可后续由模型微调
        
        memoryMapper.insert(memory);
      });
    });
  }
  
  private String buildExtractionPrompt(String content) {
    return """
      从以下对话中提取关键决策、问题和解决方案：
      
      ${content}
      
      格式：
      [DECISION]
      - 决策1
      - 决策2
      
      [PROBLEM]
      - 问题1
      
      [SOLUTION]
      - 解决方案1
      
      [INSIGHT]
      - 洞察1
    """;
  }
}
```

**工作量分解**：
- 数据库迁移：1 天
- 后端服务实现：3-4 天
- 测试验证：2 天
- **总计**：1 周（可与流式化并行）

---

### 选项 C：权限系统 4 种模式（相对独立，第 2-3 周启动）

**快速判断**：
- 如果您更关心"安全性和工作效率"，选这个
- 如果您更关心"用户体验"，选选项 A
- **建议**：先做 A + B，再做 C

**实现步骤**：
```yaml
# 第 1 步：配置新增权限模式
intelligence:
  permission:
    mode: "auto"  # default/plan/auto/bypass
    auto-classifier:
      enabled: true
      model: "security-classifier-v2"

# 第 2 步：在 AgentTool 中标记风险等级
@Component
public class PayrollApproveTool implements AgentTool {
  @Override
  public RiskLevel getRiskLevel(Map<String, Object> input) {
    return RiskLevel.HIGH;  // 工资批准 = 高风险
  }
}

# 第 3 步：权限决策在执行前进行
PermissionDecisionOrchestrator.checkPermission(tool, input, mode)
  → 低风险直通
  → 中风险提示
  → 高风险拒绝
```

**工作量**：1-2 周

---

## 📊 三个选项的对比

| 指标 | 选项 A（流式） | 选项 B（内存） | 选项 C（权限） |
|------|--------------|--------------|--------------|
| **用户体验** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| **实现难度** | 中 | 中 | 中 |
| **工作量** | 2-3w | 1w | 1-2w |
| **风险** | 低 | 低 | 低 |
| **可并行** | A+B | A+B | 独立 |
| **优先启动** | 🥇 第 1 选 | 🥈 第 1 选（与 A 并行） | 🥉 第 2 选 |

---

## ✅ 最终核查清单（提交前）

选择某个选项后，执行前必须确认：

- [ ] 后端编译通过：`mvn clean compile -q`
- [ ] 前端类型检查通过：`npx tsc --noEmit`
- [ ] 新增数据库表已通过 Flyway 脚本创建（如需要）
- [ ] 单元测试已覆盖新增逻辑（建议覆盖率 > 70%）
- [ ] 代码评审通过
- [ ] git 状态确认：`git status` + `git diff --stat HEAD`
- [ ] 本地测试通过（手动或自动化）
- [ ] 准备好云端部署计划（如涉及 Flyway）

---

## 🚀 下一步行动

1. **今天**：选择选项 A 或 B，准备技术方案评审
2. **明天**：分配开发人员，启动代码实现
3. **第 1-2 周**：核心功能开发 + 单元测试
4. **第 3 周**：集成测试 + 性能测试 + 本地验收
5. **第 4 周**：云端灰度发布 + 线上监控

---

## 📞 常见问题

**Q：流式化会影响现有 API 吗？**  
A：不会。新增 `/chat-stream` 端点，原 `/chat` 保持不变。可逐步迁移。

**Q：3 层内存会增加数据库负载吗？**  
A：转录和提取都是异步的，不阻塞主流程。建议添加适当索引。

**Q：权限系统改动会影响已有权限吗？**  
A：不会。模式可配置，默认仍为当前行为。

**Q：三个选项都做需要多长时间？**  
A：10-12 周（单队伍顺序）或 6-8 周（多队伍并行 A+B）。

---

**文档完成时间**：2026-04-26  
**建议启动时间**：立即  
**预期交付时间**：3-4 周（选项 A+B）
