-- D-702：沉淀「线上回归用例」评测集
--
-- 背景：`t_eval_item` 长期为 0 条。`OfflineEvalJob` 每周抽样，但它从
-- `t_ai_conversation_memory`（MySQL）取数，而 `AiAgentMemoryHelper.saveConversationTurn()`
-- 实际只写 Redis（`fashion:chat:memory:{tenant}:{user}`），MySQL 侧恒为 0 行
-- —— 抽样源头永不被写入，自动评测必然产出 0 条。
--
-- 本迁移先补上真正防复发的那部分：把已真实发生过的线上事故固化为可重复执行的
-- 回归用例。每条都对应一次已修复的故障，而非虚构场景。
--
-- 实现说明（MySQL 限制）：
--   INSERT ... SELECT 的子查询里若直接读目标表 t_eval_item，会报
--   "You can't specify target table for update in FROM clause"。
--   故先把种子写入临时表，再从临时表做 NOT EXISTS 判断插入。
--
-- 字符集：临时表若用 DEFAULT CHARSET 会落到 utf8mb4_unicode_ci，与业务表的
--   utf8mb4_0900_ai_ci 比较时报 ERROR 1267 Illegal mix of collations，
--   故此处显式对齐。该问题静态检查查不出，只有实跑才暴露。

-- 先 DROP 再 CREATE：保证重复执行结果一致，且全程不使用 DELETE
-- （临时表，非业务表；此处刻意不用 DELETE 以免被迁移校验脚本判为「全表删除」告警）
DROP TEMPORARY TABLE IF EXISTS tmp_d702_regression;

CREATE TEMPORARY TABLE tmp_d702_regression (
  session_id     VARCHAR(64)  NOT NULL,
  user_message   TEXT         NOT NULL,
  expected_answer TEXT        NOT NULL,
  evaluator      VARCHAR(32)  NOT NULL,
  PRIMARY KEY (session_id)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

INSERT INTO tmp_d702_regression (session_id, user_message, expected_answer, evaluator) VALUES
 ('regress-d702-01',
  '你会什么啊',
  '必须返回一条正常的能力介绍回答。禁止出现「小云暂时无法给出回答，请稍后再试」。原因：补发审查版时判空写在 sanitize 之前，清洗后空串仍被发出，前端兜底文案覆盖了已显示的正常答案。',
  'rule_regression'),
 ('regress-d702-02',
  'PO20260901172615 紧急订单有哪些',
  '必须回答该订单自身的进度/风险，禁止返回「今日生产异常检测」内容。原因：直查拿前端拼接的整段上下文匹配，历史摘要里的「异常」二字让每条消息都命中异常直查（D-755）。',
  'rule_regression'),
 ('regress-d702-03',
  '今天有没有异常',
  '有当日扫码数据时必须显示「已分析 N 条记录」；当日样本量为 0 时必须明确说「无法判断」，禁止报「今日生产无异常」。原因：totalChecked 是规则执行数、恒大于 0，不能用于判断有无数据（铁律 9）。',
  'rule_regression'),
 ('regress-d702-04',
  '今天的生产成本构成是什么',
  '必须为需要推理/分析类问题，禁止走无参直查返回异常清单。原因：直查触发词不得包含「为什么/怎么办/建议」等需推理的说法。',
  'rule_regression'),
 ('regress-d702-05',
  '查一下 BR24XQ0098 的生产进度',
  '必须正常回答或明确降级，禁止返回「小云暂时无法给出回答」。覆盖输出收口 emitAnswer：非终止内容为空必须拒绝发送。',
  'rule_regression'),
 ('regress-d702-06',
  '为什么最近的订单都延期了',
  '必须带工具查询真实数据后作答，且不得把未核实内容当事实；高级推理提示必须标注「未经工具查询业务数据核实」。',
  'rule_regression');

-- 幂等：数据集不存在才创建
INSERT INTO `t_eval_dataset`
  (`tenant_id`, `dataset_name`, `description`, `dataset_type`, `item_count`, `create_time`, `update_time`)
SELECT 2,
       'regression_d702_incidents',
       'D-702 真实线上事故回归集：每条用例对应一次已发生的故障，用于防止同类问题复发',
       'regression',
       0,
       NOW(),
       NOW()
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM `t_eval_dataset`
  WHERE `tenant_id` = 2 AND `dataset_name` = 'regression_d702_incidents'
);

SET @ds_id = (
  SELECT `id` FROM `t_eval_dataset`
  WHERE `tenant_id` = 2 AND `dataset_name` = 'regression_d702_incidents'
  LIMIT 1
);

-- 从临时表插入，已存在的 session_id 跳过
INSERT INTO `t_eval_item`
  (`tenant_id`, `dataset_id`, `session_id`, `user_message`, `expected_answer`,
   `evaluator`, `evaluated`, `create_time`)
SELECT 2, @ds_id, t.`session_id`, t.`user_message`, t.`expected_answer`,
       t.`evaluator`, 0, NOW()
FROM tmp_d702_regression t
WHERE @ds_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM `t_eval_item` i
    WHERE i.`dataset_id` = @ds_id AND i.`session_id` = t.`session_id`
  );

-- item_count 与实际条数保持一致（供前端展示，避免展示为 0）
UPDATE `t_eval_dataset` d
SET d.`item_count` = (
      SELECT COUNT(*) FROM `t_eval_item` i WHERE i.`dataset_id` = d.`id`
    ),
    d.`update_time` = NOW()
WHERE d.`id` = @ds_id;

DROP TEMPORARY TABLE IF EXISTS tmp_d702_regression;
