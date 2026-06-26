package com.fashion.supplychain.intelligence.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.intelligence.entity.QuickAnswer;
import com.fashion.supplychain.intelligence.mapper.QuickAnswerMapper;
import com.fashion.supplychain.intelligence.orchestration.QuickAnswerOrchestrator;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Lazy;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;

/**
 * 秒答缓存预构建答案初始化器。
 *
 * <p>启动时检查 t_quick_answer 中 PREBUILT 类型的公共答案是否存在，
 * 为空则导入基础高频问题的预构建答案模板：
 * <ol>
 *   <li>订单状态查询类</li>
 *   <li>延期风险类</li>
 *   <li>物料短缺类</li>
 *   <li>质检问题类</li>
 *   <li>工资结算类</li>
 * </ol>
 *
 * <p>设计原则：
 * <ul>
 *   <li>幂等：公共PREBUILT非空则跳过</li>
 *   <li>降级安全：初始化失败不阻断启动</li>
 *   <li>公共模板：tenant_id=0，所有租户可命中</li>
 * </ul>
 */
@Slf4j
@Component
@Lazy(false)
@Order(101)
@RequiredArgsConstructor
public class QuickAnswerInitializer implements ApplicationRunner {

    private final QuickAnswerMapper quickAnswerMapper;
    private final QuickAnswerOrchestrator quickAnswerOrchestrator;

    private static final Long PUBLIC_TENANT_ID = 0L;

    @Override
    public void run(ApplicationArguments args) {
        try {
            Long count = quickAnswerMapper.selectCount(
                    new LambdaQueryWrapper<QuickAnswer>()
                            .eq(QuickAnswer::getTenantId, PUBLIC_TENANT_ID)
                            .eq(QuickAnswer::getAnswerType, "PREBUILT")
                            .eq(QuickAnswer::getDeleteFlag, 0));
            if (count != null && count > 0) {
                log.info("[QuickAnswer-Init] 公共预构建答案已存在 {} 条，跳过初始化", count);
                return;
            }
            log.info("[QuickAnswer-Init] 公共预构建答案为空，开始导入基础模板...");

            initOrderStatusPrebuilt();
            initDelayRiskPrebuilt();
            initMaterialShortagePrebuilt();
            initQualityIssuePrebuilt();
            initWageSettlementPrebuilt();

            long finalCount = quickAnswerMapper.selectCount(
                    new LambdaQueryWrapper<QuickAnswer>()
                            .eq(QuickAnswer::getTenantId, PUBLIC_TENANT_ID)
                            .eq(QuickAnswer::getAnswerType, "PREBUILT")
                            .eq(QuickAnswer::getDeleteFlag, 0));
            log.info("[QuickAnswer-Init] 预构建答案导入完成，共 {} 条", finalCount);
        } catch (Exception e) {
            log.warn("[QuickAnswer-Init] 初始化失败（不阻断启动）: {}", e.getMessage());
        }
    }

    private QuickAnswer buildPrebuilt(String questionPattern, String answerSummary,
                                       String keywords, double confidence) {
        QuickAnswer qa = new QuickAnswer();
        qa.setTenantId(PUBLIC_TENANT_ID);
        qa.setAnswerType("PREBUILT");
        qa.setQuestionPattern(questionPattern);
        qa.setAnswerSummary(answerSummary);
        qa.setConfidence(confidence);
        qa.setDataTimestamp(LocalDateTime.now());
        qa.setCacheSource("QuickAnswerInitializer");
        qa.setHitCount(0);
        qa.setDeleteFlag(0);
        qa.setExpireTime(LocalDateTime.now().plusYears(1));
        return qa;
    }

    /** 1. 订单状态查询类 */
    private void initOrderStatusPrebuilt() {
        QuickAnswer qa = buildPrebuilt(
                "订单生产状态查询",
                "我来帮您查询订单状态。您可以告诉我订单号或款号，我会快速为您查询当前的生产进度、工序完成情况和预计完成时间。",
                "订单,生产,状态,进度",
                0.75
        );
        quickAnswerMapper.insert(qa);

        QuickAnswer qa2 = buildPrebuilt(
                "今天有多少订单在生产",
                "我可以帮您统计当前正在生产的订单数量、各工序进度和今日产量。请稍候，我正在查询最新的生产数据...",
                "今天,今日,订单,生产,在产",
                0.70
        );
        quickAnswerMapper.insert(qa2);
    }

    /** 2. 延期风险类 */
    private void initDelayRiskPrebuilt() {
        QuickAnswer qa = buildPrebuilt(
                "哪些订单有延期风险",
                "我来帮您排查延期风险订单。我会对比当前进度和计划交期，识别出可能延期的订单，并分析延期原因和建议措施。",
                "延期,延迟,拖期,交期,风险",
                0.75
        );
        quickAnswerMapper.insert(qa);
    }

    /** 3. 物料短缺类 */
    private void initMaterialShortagePrebuilt() {
        QuickAnswer qa = buildPrebuilt(
                "物料库存与短缺情况",
                "我来帮您查询物料库存和短缺情况。可以按类别查看库存水平、待入库采购单，以及影响生产的缺料项目。",
                "物料,材料,库存,短缺,缺料,采购",
                0.72
        );
        quickAnswerMapper.insert(qa);
    }

    /** 4. 质检问题类 */
    private void initQualityIssuePrebuilt() {
        QuickAnswer qa = buildPrebuilt(
                "质检不合格与次品情况",
                "我来帮您查询质检情况。可以查看今日/本周的质检通过率、次品类型分布，以及需要返工的工序和数量。",
                "质检,次品,返工,不合格,质量",
                0.72
        );
        quickAnswerMapper.insert(qa);
    }

    /** 5. 工资结算类 */
    private void initWageSettlementPrebuilt() {
        QuickAnswer qa = buildPrebuilt(
                "工人工资与计件统计",
                "我来帮您查询工资结算情况。可以按工人、工序、时间段统计计件数量和工资金额。",
                "工资,结算,工人,计件,工钱",
                0.70
        );
        quickAnswerMapper.insert(qa);
    }
}
