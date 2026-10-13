# 大模型输出解析统一：LlmJsonUtils（2026-10-13）

## 问题

线上日志里反复出现这类错误（不是偶发，是每次走到那条链路都可能发生）：

```
[MultiAgent] CEO 智能体输出 JSON 解析失败: {"title":"…","content":"…","recommendedAction":"1）2小时内…并评估外
[Pattern] 解析LLM输出异常
[TrendAnalysis] AI分数JSON解析失败，使用原始内容
[QualityAI] 未找到JSON块: …
```

根因是**大模型返回的从来不是干净 JSON**：

1. 爱加 Markdown 围栏（```` ```json … ``` ````）；
2. 爱在前后加一段解释（"好的，我的分析如下：{…} 希望对你有帮助"）；
3. **最要命的是被输出长度截断** —— 内容写到一半就没了，JSON 结构不闭合。
   线上实例：CEO 智能体的 `recommendedAction` 写到"…并评估外"就断了。

## 更根本的问题：15 份手写实现

盘点发现全仓有 **15 处**各自手写的「从第一个 `{` 到最后一个 `}` 切片」：

```java
int start = content.indexOf('{');
int end = content.lastIndexOf('}');
if (start < 0 || end <= start) return null;
String json = content.substring(start, end + 1);
```

这个写法有三处硬伤，而且**线上都真出过事**：

| 硬伤 | 后果 |
|---|---|
| 被截断时没有结尾 `}` | `end <= start` 成立 → **整条结果丢掉**（诊断降级成"解析失败"） |
| 字符串值里含 `}` | 切错位置（description 里贴段代码就中招） |
| 只认 `{}` | 模型返回数组 `[]` 时无能为力 |

15 份各写各的，等于同一个坑踩 15 次 —— 和「两套建表真相」是同一类问题。

## 解法

新增 `common/util/LlmJsonUtils`：

- `extractJson(raw)`：**去围栏 → 抠出最外层 JSON 值（按栈配对，尊重字符串与转义）→ 截断时修补**
- `parse(raw, type)`：extract + Jackson 反序列化，失败时抛出带原始片段的异常

截断修补只保证**结构能解析**，不保证内容完整 —— 截断掉的部分就是没有，
调用方要按"部分数据"处理。刻意不做"猜内容"（比如补一句假的结束语）：
宁可 `content` 少半句，也不凭空编一句。

13 个用例覆盖：干净 JSON / 围栏 / 前后解释 / 字符串里的花括号 / **截断在字符串中间** /
截断在逗号后 / 截断在"有 key 没值"处 / 嵌套截断 / 数组截断 / 完全不是 JSON /
括号错配 / 多字段容忍 / null 输入。

### 替换范围（15 处 → 全部走 LlmJsonUtils）

- 生产实际报错的两处：`MultiAgentDebateOrchestrator`、`PatternDiscoveryOrchestrator`
- 其余 13 处：`TrendAnalysis` / `StyleDocOcr`(×2) / `EcLogisticsAnomaly` / `SmartImport` /
  `ExpenseDoc` / `SmartReplenishmentAdvisor` / `EcBillReconciliation` /
  `DistributorBillReconciliation` / `MaterialColorCard` / `QualityAiSuggestion` /
  `MaterialPurchaseDoc` / `SelfCriticHelper` / `MemoryNudge` / `StyleDifficulty` /
  `AgentPlanningEngine` / `ProductionAgenticCrew` / `TaskDecompositionEngine` /
  `MultiStepTask` / `GoldenEval` / `VisionAnalysis`(×2) / `IntentDrivenDag` /
  `SkillEvolution` / `SkillAutoCreation` / `UserProfileEvolution`

`PatternDiscoveryOrchestrator` 顺带重写得更彻底：原来是「按 `},{` 拆串 + 正则抠字段」，
现在整段交给 Jackson 按节点取字段（值里有花括号、有转义引号都不会错）。

### 顺手降低截断概率

`MultiAgentDebateOrchestrator` 的提示词**调整了字段顺序**：
短字段/枚举（`priority`、`notificationType`）放前面，长文本（`content`、
`recommendedAction`）放最后，并给了字数上限提示。
这样即使真被截断，前面那些字段也还在。

## 防复发

新增 `LlmJsonExtractionGuardTest`：

1. 全仓不得再出现 `indexOf('{') + lastIndexOf('}')` 式手写切片（出现即构建失败）；
2. `LlmJsonUtils` 必须保留截断修补能力，且不得退化成简单切片。

## 验证

- `LlmJsonUtilsTest` 13 个用例全绿（含线上真实截断样本）
- 全量 `mvn test` 849 个用例全绿
- 4 个静态校验脚本全 PASS
- 全仓残留手写切片：**0**
