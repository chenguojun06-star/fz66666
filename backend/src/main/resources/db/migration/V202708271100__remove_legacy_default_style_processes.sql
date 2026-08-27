-- D-169：清理历史自动生成的"默认五连"工序数据
-- 根因：旧版创建样衣时自动插入一套默认工序（采购/裁剪/整件/手工剪线/入库），
--       该逻辑已于 2026-06 删除（新款式不再自动插入），但 5/30-5/31 期间的历史数据残留，
--       导致样衣详情页/扫码页显示大量用户从未配置的"没用的工序"。
-- 识别：款式工序恰好 5 道、同一时刻批量插入、名称集合精确等于 {采购,裁剪,整件,手工剪线,入库}。
-- 保留：含真实工艺名的变体组合（如 132 的"整烫包装剪线头"、74 的"车板/钉扣"）不动。
-- 安全：这些款式关联的样衣生产记录均无有效扫码记录（delete_flag=0），删除无引用风险。
-- 幂等：DELETE 精确匹配，重复执行影响 0 行。

DELETE p FROM t_style_process p
WHERE p.style_id IN (
    SELECT style_id FROM (
        SELECT style_id
        FROM t_style_process
        GROUP BY style_id
        HAVING COUNT(*) = 5
           AND SUM(process_name = '采购') = 1
           AND SUM(process_name = '裁剪') = 1
           AND SUM(process_name = '整件') = 1
           AND SUM(process_name = '手工剪线') = 1
           AND SUM(process_name = '入库') = 1
    ) matched
)
AND p.process_name IN ('采购', '裁剪', '整件', '手工剪线', '入库');
