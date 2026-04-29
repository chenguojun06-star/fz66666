# AI小云迭代升级方案 — "更聪明更智慧的大脑"

> 编制日期: 2026-04-30
> 适用系统: 智能化未来的小云 — 服装供应链生产管理平台
> 核心目标: 实现小云从"能回答"到"会思考"的质变

---

## 目录

1. [当前能力边界与不足](#1-当前能力边界与不足)
2. [智能提升方向](#2-智能提升方向)
3. [分阶段技术实现路线图](#3-分阶段技术实现路线图)
4. [评估体系与量化指标](#4-评估体系与量化指标)
5. [系统架构升级方案](#5-系统架构升级方案)
6. [用户反馈闭环机制](#6-用户反馈闭环机制)

---

## 1. 当前能力边界与不足

### 1.1 能力全景图

```
                        小云当前能力雷达图
                     ┌─────────────────────┐
                    /        知识图谱        \
                   /      ★★☆☆☆ (20%)      \
                  /                           \
           记忆系统 │                    │ 推理决策
        ★★★☆☆(60%) │                    │ ★★★☆☆(60%)
                  \                           /
                   \      自然语言理解      /
                    \    ★★★☆☆ (60%)     /
                     └─────────────────────┘
                    /                       \
              多模态交互                 多代理协作
           ★★☆☆☆(40%)              ★★★☆☆(60%)
```

### 1.2 五大核心不足

| 编号 | 不足 | 严重程度 | 影响 |
|------|------|---------|------|
| **G01** | 知识图谱形同虚设 | 🔴 致命 | 5个孤立节点、0条关系，RAG三路召回退化为两路，图谱推理完全失效 |
| **G02** | 3/4专家Agent无真实数据 | 🔴 致命 | Sourcing/Compliance/Logistics纯LLM推理，输出可能虚构，与DataTruthGuard矛盾 |
| **G03** | 意图识别无法组合 | 🟡 严重 | 35个意图互斥路由，"延期订单中哪个工厂最严重"等多意图查询无法处理 |
| **G04** | 视觉AI无真实视觉能力 | 🟡 严重 | 依赖LLM文字描述图片URL，缺陷检测/色差检查名不副实 |
| **G05** | 学习追踪纯内存 | 🟡 严重 | NlQueryLearningTracker重启即丢失，无法形成持久学习闭环 |

### 1.3 各模块详细不足

#### 自然语言理解 (NLU)

| 维度 | 当前状态 | 不足 |
|------|---------|------|
| 意图覆盖 | 35个意图 | 无法组合(overdue+factory_ranking)、无法否定("除了XX")、无法时间范围("上个月") |
| 处理器 | 10个DataHandler + 21个SmartHandler | 多意图复用同一处理器(quote→cost)，无法差异化回答 |
| 准确率追踪 | NlQueryLearningTracker | 纯内存ConcurrentLinkedDeque(500条)，重启丢失，QueryRecord字段赋值不完整 |
| 降级策略 | LLM意图→关键词兜底 | 无A/B测试能力，无法对比两种方式的准确率 |

#### 知识图谱

| 维度 | 当前状态 | 不足 |
|------|---------|------|
| 实体 | 5个类型(supplier/order/style/process/factory) | 无自动增量更新，需手动触发`buildGraphFromBusinessData` |
| 关系 | **0条** | `buildGraphFromBusinessData`只调用`upsertEntity`，从未调用`upsertRelation` |
| 推理 | `reason()`方法存在 | 依赖`traverseGraph`递归SQL，但无关系数据可遍历 |
| 同义词 | LIKE模糊匹配 | 无法处理"超期"="延期"="逾期"等同义词 |

#### 记忆系统

| 维度 | 当前状态 | 不足 |
|------|---------|------|
| 三层记忆 | FACT/EPISODIC/REFLECTIVE | LongTermMemory仅MySQL检索，未接入Qdrant向量检索 |
| 对话记忆 | AiConversationMemory | 每用户最多10条，重要性评分规则简单(30+加分项) |
| 向量检索 | Qdrant + 伪向量降级 | 伪向量128维语义能力几乎为零，切换需重建集合 |
| 融合排序 | 语义53%+关键词32%+采纳15% | 权重硬编码，无法按场景动态调整 |

#### 多模态

| 维度 | 当前状态 | 不足 |
|------|---------|------|
| 视觉AI | 3种任务(缺陷检测/款式识别/色差检查) | 无真实视觉模型，LLM无法"看到"图片 |
| 语音 | 前端WebSpeech+后端TTS | 后端无ASR能力，COMMAND模式未连接执行引擎 |
| 文件分析 | Excel/CSV(5MB限制) | 无OCR、无PDF/Word、图片仅提示文字 |
| TTS | Edge TTS(默认)+Azure TTS | Edge非官方API，Azure文本限制200字，无SSML |

#### 推理与决策

| 维度 | 当前状态 | 不足 |
|------|---------|------|
| 批评家 | 7条审查规则 | 无量化评估、无审查日志、单轮审查、evidence截断300字 |
| 反思引擎 | 5维批判+迭代反思 | 场景映射仅3种，反思质量无反馈闭环 |
| 自一致性 | 3次采样+多数投票 | 仅7个高风险场景生效，归一化过于简单(纯字符串) |
| 根因分析 | 5-Why+鱼骨图6M | 无业务数据注入，JSON解析脆弱，无根因验证 |

#### 多代理系统

| 维度 | 当前状态 | 不足 |
|------|---------|------|
| 专家数量 | 4个(Delivery/Sourcing/Compliance/Logistics) | 缺少生产计划/成本核算/质量追溯专家 |
| 数据驱动 | 仅Delivery有真实数据 | 3/4专家纯LLM推理，可能虚构数据 |
| 执行控制 | CompletableFuture.allOf().join() | 无并行超时、无降级、重路由只做一次 |
| 专家通信 | 仅通过AgentState.contextSummary | 专家间不能直接交互 |

#### 前端交互

| 维度 | PC端 | H5端 | 小程序 | Flutter |
|------|------|------|--------|---------|
| SSE流式 | ✅ | ✅ | ✅ | ❌(仅同步) |
| 语音输入 | ✅ | ✅ | ❌ | ❌ |
| 拍照识别 | ✅ | ✅ | ❌ | ❌ |
| 用户反馈 | ✅(点赞/点踩) | ❌ | ❌ | ❌ |
| 步骤向导UI | ✅ | ✅ | 解析无UI | 解析无UI |
| 图表渲染 | ✅ | 仅标题 | 仅标题 | ❌ |

---

## 2. 智能提升方向

### 2.1 自然语言理解能力增强

#### 方向1: 多意图组合识别

**目标**: 支持用户自然地组合多个意图

```
当前: "延期订单中哪个工厂最严重？" → 只命中overdue，丢失factory_ranking
之后: "延期订单中哪个工厂最严重？" → 命中[overdue, factory_ranking] → 组合查询
```

**实现方案**:
- LLM意图分类从单标签改为多标签（返回top-3意图+置信度）
- 引入意图组合模板：`overdue+factory_ranking → handleOverdueByFactoryQuery`
- 关键词兜底也支持多关键词匹配

#### 方向2: 时间范围与否定查询

**目标**: 支持"上个月"、"除了XX"等自然表达

```
当前: "上个月的延期情况" → 无法精确路由
之后: "上个月的延期情况" → intent=overdue, timeRange=last_month
```

**实现方案**:
- LLM意图分类增加时间范围提取（`timeRange`字段）
- 否定词检测（"除了"、"不包括"、"不要"）→ 生成排除条件
- 时间范围映射：`上个月→last_month`, `本周→this_week`, `最近3天→last_3d`

#### 方向3: 意图追踪持久化

**目标**: 建立持久的意图识别准确率度量

**实现方案**:
- `NlQueryLearningTracker` 从内存ConcurrentLinkedDeque改为数据库表`t_nl_query_log`
- 新增字段：`userFeedback`(satisfied/unsatisfied)、`correctIntent`(人工标注)
- 自动计算：意图准确率 = correctIntent匹配数 / 总查询数
- 低置信度查询(<60)自动标记，供人工审核

### 2.2 知识图谱构建与应用

#### 方向1: 自动关系抽取

**目标**: 从业务数据自动构建关系网络

```
当前: 5个孤立节点、0条关系
之后: 完整的服装供应链知识图谱
```

**关系类型体系**:

| 关系类型 | 源实体 | 目标实体 | 抽取来源 |
|---------|--------|---------|---------|
| `produces` | factory | order | t_production_order.factory_id |
| `contains` | order | style | t_production_order.style_id |
| `requires` | style | process | t_style_process.style_id |
| `depends_on` | process | process | t_process_parent_mapping |
| `supplies` | supplier | material | t_material_purchase |
| `delivers` | factory | shipment | t_factory_shipment |
| `inspects` | worker | quality | t_scan_record |
| `belongs_to` | order | tenant | t_production_order.tenant_id |

**实现方案**:
- `KnowledgeGraphOrchestrator.buildGraphFromBusinessData()` 增加关系抽取逻辑
- 增量更新：监听业务表变更事件，实时更新图谱
- 同义词映射表：`t_kg_synonym`(word, canonical_entity, tenant_id)

#### 方向2: 图谱增强推理

**目标**: 利用关系网络实现多跳推理

```
用户问: "XX工厂的裁剪工序经常延期，根因是什么？"
图谱推理: factory:XX → produces → order:* → contains → style:* → requires → process:裁剪
         → depends_on → process:面料准备(上游) → 发现面料准备经常延迟
```

**实现方案**:
- `reason()` 方法增加关系权重计算
- 置信度公式：`1.0 / hop * relationWeight * entityMatchScore`
- 支持反向推理：从结果找原因

### 2.3 多模态交互优化

#### 方向1: 真实视觉能力

**目标**: 从"图片描述"升级为"真正的缺陷检测"

**方案A: 接入多模态大模型(推荐)**
- Spring AI + GPT-4V / Qwen-VL / Doubao-Vision
- 通过`AiInferenceGateway`统一调用，支持模型切换
- 图片预处理：压缩到1024px、格式转换、EXIF处理

**方案B: 专用检测模型(高精度场景)**
- 训练布料缺陷检测YOLO模型
- 部署为独立微服务，通过MCP工具桥接

#### 方向2: Flutter端SSE流式

**目标**: Flutter App从同步对话升级为流式对话

**实现方案**:
- 使用`web_socket_channel`建立SSE连接
- 或使用`http`包的`StreamedResponse`实现HTTP分块传输
- 解析SSE事件类型(answer_chunk/thinking/tool_call/answer)

#### 方向3: 全端反馈机制

**目标**: H5/小程序/Flutter均支持点赞/点踩

**实现方案**:
- 统一`FeedbackWidget`组件，四端共享逻辑
- 回传到`/intelligence/feedback-reason/ai-message-feedback`
- 反馈数据驱动学习闭环

### 2.4 推理与决策能力增强

#### 方向1: 专家Agent数据驱动化

**目标**: 所有专家Agent都基于真实业务数据推理

| 专家 | 当前 | 升级后 |
|------|------|--------|
| Delivery | ✅有数据 | 保持 |
| Sourcing | ❌纯LLM | 接入t_material_purchase + t_supplier_user |
| Compliance | ❌纯LLM | 接入t_quality_issue + t_scan_record |
| Logistics | ❌纯LLM | 接入t_factory_shipment + t_logistics_track |
| **新增: Production** | — | 接入t_production_order + t_production_process_tracking |
| **新增: Cost** | — | 接入t_payroll_settlement + t_material_reconciliation |

#### 方向2: 批评家量化评估

**目标**: 批评家输出结构化审查报告

```json
{
  "overallScore": 85,
  "dimensions": {
    "dataTraceability": 90,
    "logicalConsistency": 80,
    "completeness": 85,
    "riskDisclosure": 70,
    "alternativeProvided": true
  },
  "corrections": [
    {"original": "延期5天", "corrected": "延期3天", "evidence": "tool_order_query返回deliveryDelayDays=3"}
  ]
}
```

#### 方向3: 自一致性语义对比

**目标**: 从纯字符串匹配升级为语义相似度对比

**实现方案**:
- 引入向量余弦相似度：两次采样的回答embedding余弦 > 0.85 视为一致
- 扩展高风险场景列表：从7个扩展到15个
- 采样数动态调整：简单问题1次，复杂问题3次，关键决策5次

### 2.5 记忆系统增强

#### 方向1: LongTermMemory接入Qdrant

**目标**: 长期记忆从MySQL检索升级为向量语义检索

**实现方案**:
- `LongTermMemoryOrchestrator.retrieveMultiSignal()` 增加Qdrant向量召回
- 三路融合：时间衰减40% + BM25关键词30% + 向量语义30%
- 向量生成：复用`QdrantService.computeEmbedding()`

#### 方向2: 记忆质量验证

**目标**: 沉淀的记忆是否真的改善了后续建议

**实现方案**:
- 记忆被召回时记录`recallCount`和`lastRecallTime`
- 记忆被采纳后记录`adoptionCount`
- 记忆质量分 = `adoptionCount / recallCount`（采纳率）
- 采纳率 < 10% 的记忆自动降权或标记为"待清理"

---

## 3. 分阶段技术实现路线图

### 3.1 总体时间线

```
Sprint 1-2 (第1-4周): 修复致命缺陷 — 知识图谱+专家数据驱动
    ↓
Sprint 3-4 (第5-8周): NLU增强+记忆升级 — 多意图+持久化+向量检索
    ↓
Sprint 5-6 (第9-12周): 多模态+推理增强 — 视觉能力+批评家量化+语义一致性
    ↓
Sprint 7-8 (第13-16周): 全端体验统一 — Flutter SSE+全端反馈+图表渲染
    ↓
Sprint 9+ (持续): 持续进化 — 新专家+新能力+用户反馈驱动
```

### 3.2 Sprint 1-2: 修复致命缺陷 (第1-4周)

#### 任务清单

| 任务 | 具体内容 | 优先级 | 风险 |
|------|---------|--------|------|
| S1.1 知识图谱关系抽取 | `buildGraphFromBusinessData`增加8种关系类型抽取 | P0 | 中 |
| S1.2 同义词映射表 | 新建`t_kg_synonym`表+管理接口 | P0 | 低 |
| S1.3 图谱增量更新 | 监听业务表变更事件，实时更新图谱 | P1 | 中 |
| S1.4 Sourcing专家数据驱动 | 接入采购+供应商数据 | P0 | 低 |
| S1.5 Compliance专家数据驱动 | 接入质检+扫码数据 | P0 | 低 |
| S1.6 Logistics专家数据驱动 | 接入发货+物流数据 | P0 | 低 |
| S1.7 新增Production专家 | 接入生产+工序数据 | P1 | 中 |
| S1.8 新增Cost专家 | 接入工资+对账数据 | P1 | 中 |

#### 数据库迁移

```sql
-- V20260501001__create_kg_synonym_table.sql
CREATE TABLE IF NOT EXISTS t_kg_synonym (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    word VARCHAR(128) NOT NULL,
    canonical_entity VARCHAR(128) NOT NULL,
    entity_type VARCHAR(64),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE INDEX idx_kg_synonym_tenant_word (tenant_id, word),
    INDEX idx_kg_synonym_tenant_entity (tenant_id, canonical_entity)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- V20260501002__create_nl_query_log_table.sql
CREATE TABLE IF NOT EXISTS t_nl_query_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    user_id VARCHAR(64),
    question TEXT NOT NULL,
    detected_intent VARCHAR(64),
    confidence INT,
    handler_type VARCHAR(16),
    user_feedback VARCHAR(16),
    correct_intent VARCHAR(64),
    response_time_ms INT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_nlql_tenant_created (tenant_id, created_at),
    INDEX idx_nlql_tenant_intent (tenant_id, detected_intent)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

#### 验收标准

- 知识图谱：每个租户平均100+实体、200+关系
- 专家Agent：所有6个专家都基于真实数据推理，输出包含数据来源标注
- 图谱推理：`reason()` 方法能返回2跳以内的推理路径

### 3.3 Sprint 3-4: NLU增强+记忆升级 (第5-8周)

| 任务 | 具体内容 | 优先级 |
|------|---------|--------|
| S2.1 多意图识别 | LLM意图分类改为多标签(top-3) | P0 |
| S2.2 意图组合模板 | 定义10个常用组合模板 | P0 |
| S2.3 时间范围提取 | LLM提取timeRange字段 | P1 |
| S2.4 否定查询支持 | 检测否定词生成排除条件 | P1 |
| S2.5 意图追踪持久化 | NlQueryLearningTracker→数据库 | P0 |
| S2.6 LongTermMemory向量检索 | 接入Qdrant语义召回 | P1 |
| S2.7 记忆质量验证 | 采纳率计算+低质量记忆清理 | P1 |
| S2.8 对话记忆扩容 | 每用户10条→30条，重要性评分细化 | P2 |

#### 验收标准

- 多意图识别：组合查询命中率 ≥ 80%
- 意图追踪：准确率可量化，月度报告自动生成
- 记忆检索：向量语义召回的采纳率比纯关键词高 ≥ 20%

### 3.4 Sprint 5-6: 多模态+推理增强 (第9-12周)

| 任务 | 具体内容 | 优先级 |
|------|---------|--------|
| S3.1 视觉AI真实化 | 接入GPT-4V/Qwen-VL多模态模型 | P0 |
| S3.2 图片预处理 | 压缩/格式转换/EXIF处理 | P1 |
| S3.3 批评家量化 | 输出结构化审查报告(5维评分) | P1 |
| S3.4 自一致性语义对比 | 向量余弦相似度替代字符串匹配 | P1 |
| S3.5 根因分析数据注入 | 5-Why分析注入实际订单/工序数据 | P1 |
| S3.6 反思引擎场景扩展 | 从3种扩展到8种场景映射 | P2 |
| S3.7 TTS增强 | SSML控制+多角色+流式输出 | P2 |
| S3.8 文件分析增强 | OCR能力+PDF/Word支持 | P2 |

#### 验收标准

- 视觉AI：缺陷检测准确率 ≥ 70%（人工标注测试集）
- 批评家：审查报告5维评分与人工评估相关性 ≥ 0.8
- 自一致性：语义等价判断准确率 ≥ 90%

### 3.5 Sprint 7-8: 全端体验统一 (第13-16周)

| 任务 | 具体内容 | 优先级 |
|------|---------|--------|
| S4.1 Flutter SSE流式 | WorkAiController改为SSE流式 | P0 |
| S4.2 H5反馈机制 | 添加点赞/点踩按钮 | P0 |
| S4.3 小程序反馈机制 | 添加点赞/点踩按钮 | P0 |
| S4.4 Flutter反馈机制 | 添加点赞/点踩按钮 | P0 |
| S4.5 小程序步骤向导UI | 渲染stepWizardCards | P1 |
| S4.6 H5/小程序图表渲染 | 集成轻量图表库(ECharts精简版) | P1 |
| S4.7 Flutter智能通知 | 监听ai:traceable_advice事件 | P1 |
| S4.8 featureFlags自助入口 | 系统设置页添加智能开关管理 | P2 |

#### 验收标准

- Flutter SSE：流式输出延迟 < 500ms（首token）
- 全端反馈：四端均可点赞/点踩，数据统一回传
- 图表渲染：H5/小程序AI回复中的图表可正常展示

### 3.6 Sprint 9+: 持续进化 (第17周+)

| 方向 | 内容 |
|------|------|
| 预测能力 | 交期预测模型训练、产量预测、物料需求预测 |
| 主动智能 | 小云主动发现问题并推送建议（不等待用户提问） |
| 个性化 | 基于用户角色/历史行为的差异化回答策略 |
| 跨租户学习 | 平台级匿名经验共享（已支持PLATFORM_GLOBAL作用域） |
| Agent工具扩展 | 新增10+业务工具（库存调拨、成本核算、质量追溯等） |

---

## 4. 评估体系与量化指标

### 4.1 智能提升指标体系

| 维度 | 指标 | 当前基线 | Sprint2目标 | Sprint4目标 | Sprint6目标 |
|------|------|---------|------------|------------|------------|
| **NLU** | 意图识别准确率 | ~75%(估) | 80% | 85% | 90% |
| **NLU** | 多意图组合命中率 | 0% | 60% | 80% | 90% |
| **NLU** | 否定/时间查询支持率 | 0% | 0% | 60% | 80% |
| **知识图谱** | 实体数/租户 | ~5 | 100+ | 200+ | 500+ |
| **知识图谱** | 关系数/租户 | 0 | 200+ | 500+ | 1000+ |
| **知识图谱** | 推理路径命中率 | 0% | 30% | 50% | 70% |
| **记忆** | 记忆召回采纳率 | ~30%(估) | 35% | 45% | 55% |
| **记忆** | 向量检索覆盖率 | ~40%(估) | 60% | 80% | 95% |
| **多模态** | 视觉检测准确率 | ~20%(估) | 50% | 70% | 80% |
| **推理** | 批评家审查覆盖率 | 100%(定性) | 100%(5维量化) | 100% | 100% |
| **推理** | 自一致性等价判断准确率 | ~60%(字符串) | 70% | 85% | 90% |
| **多代理** | 专家数据驱动率 | 25%(1/4) | 100%(6/6) | 100% | 100% |
| **多代理** | 图执行成功率 | ~80%(估) | 90% | 95% | 98% |
| **体验** | 全端反馈覆盖率 | 25%(仅PC) | 50% | 100% | 100% |
| **体验** | Flutter SSE首token延迟 | N/A(同步) | <500ms | <300ms | <200ms |

### 4.2 自动化度量机制

| 机制 | 实现方式 | 频率 |
|------|---------|------|
| 意图准确率 | `t_nl_query_log` + 人工标注 + 自动计算 | 每日 |
| 知识图谱规模 | `SELECT COUNT(*) FROM t_kg_entity/t_kg_relation` | 每日 |
| 记忆采纳率 | `adoptionCount / recallCount` | 每周 |
| AI准确率仪表盘 | `AiAccuracyOrchestrator.computeDashboard()` | 每日 |
| 成本追踪 | `AiCostTrackingOrchestrator.getCostSummary()` | 每日 |
| 用户满意度 | 点赞率 / 点踩率 | 实时 |

### 4.3 A/B测试框架

```
实验组: 新NLU多意图识别
对照组: 旧NLU单意图识别
指标: 意图准确率、用户满意度、平均对话轮数
流量: 10% → 30% → 50% → 100%
周期: 2周
决策: 准确率提升≥5%且满意度不降 → 全量发布
```

---

## 5. 系统架构升级方案

### 5.1 升级后架构全景

```
┌─────────────────────────────────────────────────────────────────────┐
│                        四端前端 (统一交互层)                          │
│  PC(React18) │ H5(React18) │ 小程序(原生) │ Flutter App(GetX)       │
│  ✅SSE ✅反馈  │ ✅SSE 🔲反馈  │ ✅SSE 🔲反馈  │ 🔲SSE 🔲反馈          │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ HTTP/SSE/WebSocket
┌──────────────────────────▼──────────────────────────────────────────┐
│                    Controller 层 + @PreAuthorize                     │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────────┐
│                  Orchestrator 编排层                                  │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │              AiInferenceGateway (统一推理网关)                │    │
│  │  LegacyAdapter(自研引擎) ←路由→ SpringAiAdapter(标准套件)    │    │
│  │  自动记录: AiCostTracking + AiOperationAudit                  │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐      │
│  │ NLU增强层   │ │ 知识图谱    │ │ 记忆系统    │ │ 多代理系统  │      │
│  │ 多意图识别  │ │ 关系抽取    │ │ 向量检索    │ │ 数据驱动    │      │
│  │ 时间/否定   │ │ 同义词映射  │ │ 质量验证    │ │ 新专家      │      │
│  │ 持久化追踪  │ │ 增量更新    │ │ 三层融合    │ │ 超时降级    │      │
│  └────────────┘ └────────────┘ └────────────┘ └────────────┘      │
│                                                                      │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐                      │
│  │ 推理增强    │ │ 多模态      │ │ 闭环学习    │                      │
│  │ 批评家量化  │ │ 真实视觉    │ │ 订单学习    │                      │
│  │ 语义一致性  │ │ Flutter SSE │ │ 扫码反馈    │                      │
│  │ 根因数据化  │ │ 全端反馈    │ │ 风险追踪    │                      │
│  └────────────┘ └────────────┘ └────────────┘                      │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────────┐
│                    数据层                                             │
│  MySQL(业务+图谱+记忆) │ Qdrant(向量) │ Redis(缓存+锁)               │
│  Flyway迁移 │ TenantInterceptor │ SafeQueryHelper                   │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.2 新增数据库表

| 表名 | 用途 | Sprint |
|------|------|--------|
| `t_kg_synonym` | 同义词映射 | S1 |
| `t_nl_query_log` | 意图查询日志 | S2 |
| `t_kg_relation_auto_config` | 关系自动抽取配置 | S1 |

### 5.3 兼容性保障

| 原则 | 措施 |
|------|------|
| 增量设计 | 新增表/字段/接口，不修改旧有逻辑 |
| 功能开关 | 所有新能力通过TenantSmartFeature开关控制 |
| 旁路写入 | 闭环功能异常不影响主业务流程(try-catch隔离) |
| 路由策略 | AI推理通过Gateway路由，默认走legacy(自研引擎) |
| 灰度发布 | 新功能先对1%租户开放，逐步扩大 |

### 5.4 新增功能开关

| 开关Key | 用途 | 默认值 |
|---------|------|--------|
| `smart.nl.multi-intent.enabled` | 多意图组合识别 | false |
| `smart.nl.time-range.enabled` | 时间范围提取 | false |
| `smart.kg.auto-build.enabled` | 知识图谱自动构建 | false |
| `smart.kg.reasoning.enabled` | 图谱推理增强 | false |
| `smart.memory.vector-retrieval.enabled` | 记忆向量检索 | false |
| `smart.vision.real-model.enabled` | 真实视觉模型 | false |
| `smart.critic.quantified.enabled` | 批评家量化评估 | false |
| `smart.consistency.semantic.enabled` | 语义一致性验证 | false |

---

## 6. 用户反馈闭环机制

### 6.1 反馈收集四层架构

```
┌──────────────────────────────────────────────────────┐
│  第1层: 隐式反馈 (自动收集)                            │
│  - 用户是否采纳AI建议(采纳率)                          │
│  - 用户是否重新提问(不满意率)                          │
│  - 用户对话轮数(问题解决效率)                          │
│  - 用户停留时间(交互深度)                              │
├──────────────────────────────────────────────────────┤
│  第2层: 显式反馈 (主动收集)                            │
│  - 点赞/点踩(四端统一)                                │
│  - 5星评分(AgentGraphPanel)                           │
│  - 反馈原因选择(反馈原因标签)                          │
├──────────────────────────────────────────────────────┤
│  第3层: 纠错反馈 (深度收集)                            │
│  - 用户修改AI回答中的错误数据                          │
│  - 用户标注正确意图(correctIntent)                     │
│  - 用户补充AI遗漏的信息                               │
├──────────────────────────────────────────────────────┤
│  第4层: 主动调研 (定期收集)                            │
│  - 月度用户满意度调研                                 │
│  - 新功能体验反馈                                     │
│  - NPS(净推荐值)评分                                  │
└──────────────────────────────────────────────────────┘
```

### 6.2 反馈驱动优化闭环

```
用户反馈 → 数据收集 → 分析归因 → 策略调整 → 效果验证
    ↑                                              │
    └──────────────────────────────────────────────┘

具体路径:
1. 点踩率上升 → 分析低分回答的共同特征 → 调整prompt/增加工具/修复数据
2. 采纳率下降 → 分析拒绝原因分布 → 优化建议策略/调整阈值
3. 多轮对话增加 → 分析追问类型 → 增强首次回答的完整性
4. 意图识别错误 → 人工标注correctIntent → 微调意图分类
```

### 6.3 反馈数据存储

| 表 | 用途 | 已有 |
|----|------|------|
| `t_intelligence_feedback` | AI建议反馈(采纳/拒绝) | ✅ |
| `t_ai_process_reward` | 过程奖励(PRM) | ✅ |
| `t_nl_query_log` | 意图查询日志+用户反馈 | 🔲新增 |
| `t_ai_conversation_memory.feedback_score` | 对话记忆反馈 | ✅ |

---

## 附录: 资源需求

| 角色 | 人数 | Sprint1-2 | Sprint3-4 | Sprint5-6 | Sprint7-8 |
|------|------|-----------|-----------|-----------|-----------|
| 后端开发 | 2 | 知识图谱+专家 | NLU+记忆 | 推理增强 | 反馈统一 |
| 前端开发 | 1 | — | — | 视觉UI | Flutter+全端 |
| AI工程师 | 1 | 图谱设计 | NLU调优 | 视觉模型 | 评估体系 |
| 测试 | 1 | 图谱验证 | NLU测试 | 视觉测试 | 全端测试 |
