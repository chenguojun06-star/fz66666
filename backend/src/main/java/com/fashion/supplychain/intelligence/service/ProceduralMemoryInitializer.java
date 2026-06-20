package com.fashion.supplychain.intelligence.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.intelligence.entity.ProceduralMemory;
import com.fashion.supplychain.intelligence.mapper.ProceduralMemoryMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Lazy;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;

/**
 * L4 程序性记忆初始化器。
 *
 * <p>启动时检查 t_procedural_memory 是否为空，为空则导入 5 类初始 SOP（公共，tenant_id=0）：
 * <ol>
 *   <li>SCAN_WORKFLOW — 扫码流程（工序/质检/入库）</li>
 *   <li>WAGE_SETTLEMENT — 工资结算</li>
 *   <li>DELIVERY_FORECAST — 交期预测</li>
 *   <li>SUPPLIER_EVAL — 供应商评估</li>
 *   <li>QUALITY_CHECK — 质检流程</li>
 * </ol>
 *
 * <p>设计原则：
 * <ul>
 *   <li>幂等：表非空则跳过（避免重复导入）</li>
 *   <li>降级安全：初始化失败不阻断启动（catch 所有异常）</li>
 *   <li>公共 SOP：tenant_id=0，所有租户可命中（参考 MemoryBankEntry 公共记忆模式）</li>
 * </ul>
 *
 * <p>SOP 内容来源：memory-bank/decisionLog.md（D-008/D-009 等）+ 项目业务流程文档。
 */
@Slf4j
@Component
@Lazy(false)
@Order(100)
@RequiredArgsConstructor
public class ProceduralMemoryInitializer implements ApplicationRunner {

    private final ProceduralMemoryMapper proceduralMemoryMapper;

    /** 公共租户ID（参考 MemoryBankEntry：tenant_id=0 表示公共记忆） */
    private static final Long PUBLIC_TENANT_ID = 0L;

    @Override
    public void run(ApplicationArguments args) {
        try {
            long count = proceduralMemoryMapper.selectCount(
                    new LambdaQueryWrapper<ProceduralMemory>()
                            .eq(ProceduralMemory::getTenantId, PUBLIC_TENANT_ID));
            if (count > 0) {
                log.info("[L4-PM-Init] 公共 SOP 已存在 {} 条，跳过初始化", count);
                return;
            }
            log.info("[L4-PM-Init] 公共 SOP 为空，开始导入 5 类初始 SOP...");
            insertScanWorkflowSop();
            insertWageSettlementSop();
            insertDeliveryForecastSop();
            insertSupplierEvalSop();
            insertQualityCheckSop();
            log.info("[L4-PM-Init] 5 类初始 SOP 导入完成");
        } catch (Exception e) {
            log.warn("[L4-PM-Init] 初始化失败（不阻断启动）: {}", e.getMessage());
        }
    }

    /** SOP 1: 扫码流程（工序/质检/入库） */
    private void insertScanWorkflowSop() {
        ProceduralMemory sop = new ProceduralMemory();
        sop.setTenantId(PUBLIC_TENANT_ID);
        sop.setSopName("扫码流程（工序/质检/入库）");
        sop.setSopType("SCAN_WORKFLOW");
        sop.setTriggerKeywords("扫码,工序扫码,质检扫码,入库扫码,扫工序码,扫菲,扫码记录,扫码撤回,产量扫码");
        sop.setConfidence(new BigDecimal("0.85"));
        sop.setSource("manual");
        sop.setEnabled(1);
        sop.setVersion(1);
        sop.setPreconditions("{\"checks\":[\"操作员已登录且绑定工厂\",\"生产单状态为进行中\",\"工序已分配给操作员\"]}");
        sop.setStepsJson("["
            + "{\"step\":1,\"action\":\"扫工序码/扫码菲\",\"tool\":\"scan_operation\",\"expected\":\"工序属于当前生产单且已分配给操作员\"},"
            + "{\"step\":2,\"action\":\"校验工序归属与防重复扫码\",\"tool\":\"scan_operation\",\"expected\":\"同一工序同一菲同一操作员不重复扫码（D-008 原子SQL防并发）\"},"
            + "{\"step\":3,\"action\":\"写入扫码记录\",\"tool\":\"scan_operation\",\"expected\":\"t_scan_record 写入成功，tenant_id 正确\"},"
            + "{\"step\":4,\"action\":\"更新生产进度\",\"tool\":\"query_progress\",\"expected\":\"生产单进度按工序权重累加\"},"
            + "{\"step\":5,\"action\":\"质检扫码（如该工序需质检）\",\"tool\":\"quality_check\",\"expected\":\"次品记录到 t_quality_record，合格率更新\"},"
            + "{\"step\":6,\"action\":\"入库扫码（如为末道工序）\",\"tool\":\"warehousing\",\"expected\":\"入库记录到 t_product_warehousing\"}"
            + "]");
        sop.setPostcheck("{\"verify\":[\"t_scan_record 有新记录\",\"生产单进度已更新\",\"工资待结算金额已累加（D-009 双字段校验）\"]}");
        proceduralMemoryMapper.insert(sop);
    }

    /** SOP 2: 工资结算 */
    private void insertWageSettlementSop() {
        ProceduralMemory sop = new ProceduralMemory();
        sop.setTenantId(PUBLIC_TENANT_ID);
        sop.setSopName("工资结算流程");
        sop.setSopType("WAGE_SETTLEMENT");
        sop.setTriggerKeywords("工资,结算,计件,工资单,工资结算,结算工资,工资撤回,外发任务工资,工资支付");
        sop.setConfidence(new BigDecimal("0.85"));
        sop.setSource("manual");
        sop.setEnabled(1);
        sop.setVersion(1);
        sop.setPreconditions("{\"checks\":[\"操作员有计件扫码记录\",\"生产单工序已验收\",\"非外发任务（外发任务工资单独结算）\"]}");
        sop.setStepsJson("["
            + "{\"step\":1,\"action\":\"查询待结算扫码记录\",\"tool\":\"query_wage\",\"expected\":\"operator_id 归属当前租户，settlement_status=unsettled\"},"
            + "{\"step\":2,\"action\":\"校验外发任务排除\",\"tool\":\"query_wage\",\"expected\":\"外发任务（factory_id 非本租户）不计入本租户工资\"},"
            + "{\"step\":3,\"action\":\"计算计件工资\",\"tool\":\"query_wage\",\"expected\":\"单价 × 数量，按工序单价表计算\"},"
            + "{\"step\":4,\"action\":\"生成工资单\",\"tool\":\"create_wage_settlement\",\"expected\":\"写入 t_wage_settlement，状态=pending\"},"
            + "{\"step\":5,\"action\":\"工资支付\",\"tool\":\"pay_wage\",\"expected\":\"状态=paid，支付时间记录\"},"
            + "{\"step\":6,\"action\":\"标记扫码记录为已结算\",\"tool\":\"mark_settled\",\"expected\":\"settlement_status=payroll_settled 且 payroll_settlement_id 回写（D-009 双字段）\"}"
            + "]");
        sop.setPostcheck("{\"verify\":[\"已结算的扫码记录禁止撤回（D-009）\",\"工资单金额与扫码记录汇总一致\",\"外发任务工资未混入\"]}");
        proceduralMemoryMapper.insert(sop);
    }

    /** SOP 3: 交期预测 */
    private void insertDeliveryForecastSop() {
        ProceduralMemory sop = new ProceduralMemory();
        sop.setTenantId(PUBLIC_TENANT_ID);
        sop.setSopName("交期预测流程");
        sop.setSopType("DELIVERY_FORECAST");
        sop.setTriggerKeywords("交期,延期,逾期,排产,产能,交付风险,交期预测,延期订单,排程");
        sop.setConfidence(new BigDecimal("0.80"));
        sop.setSource("manual");
        sop.setEnabled(1);
        sop.setVersion(1);
        sop.setPreconditions("{\"checks\":[\"生产单有交货日期\",\"工序进度有扫码记录\",\"供应商评分数据可用\"]}");
        sop.setStepsJson("["
            + "{\"step\":1,\"action\":\"查询生产单工序进度\",\"tool\":\"query_progress\",\"expected\":\"各工序完成百分比 + 剩余工序\"},"
            + "{\"step\":2,\"action\":\"计算理论剩余工时\",\"tool\":\"query_progress\",\"expected\":\"剩余工序 × 标准工时 / 当前产能\"},"
            + "{\"step\":3,\"action\":\"评估供应商到货风险\",\"tool\":\"query_supplier\",\"expected\":\"面料/辅料供应商准时交付率\"},"
            + "{\"step\":4,\"action\":\"识别瓶颈工序\",\"tool\":\"query_progress\",\"expected\":\"排队最长 / 产能最低的工序\"},"
            + "{\"step\":5,\"action\":\"生成交期风险分级\",\"tool\":\"forecast_delivery\",\"expected\":\"绿色（按期）/黄色（风险）/红色（必延期）\"},"
            + "{\"step\":6,\"action\":\"建议调整动作\",\"tool\":\"forecast_delivery\",\"expected\":\"工序调整/人员调配/物料催促\"}"
            + "]");
        sop.setPostcheck("{\"verify\":[\"预测结果标注为预测非确定\",\"建议动作可执行\",\"风险分级与历史延期数据一致\"]}");
        proceduralMemoryMapper.insert(sop);
    }

    /** SOP 4: 供应商评估 */
    private void insertSupplierEvalSop() {
        ProceduralMemory sop = new ProceduralMemory();
        sop.setTenantId(PUBLIC_TENANT_ID);
        sop.setSopName("供应商评估流程");
        sop.setSopType("SUPPLIER_EVAL");
        sop.setTriggerKeywords("供应商,评估,评级,考核,寻源,供应商风险,供应商评分,供应商管理");
        sop.setConfidence(new BigDecimal("0.80"));
        sop.setSource("manual");
        sop.setEnabled(1);
        sop.setVersion(1);
        sop.setPreconditions("{\"checks\":[\"供应商有历史订单数据\",\"至少 3 次合作记录\",\"质检数据可用\"]}");
        sop.setStepsJson("["
            + "{\"step\":1,\"action\":\"查询供应商历史订单\",\"tool\":\"query_supplier\",\"expected\":\"订单数 + 准时交付数\"},"
            + "{\"step\":2,\"action\":\"计算准时交付率\",\"tool\":\"query_supplier\",\"expected\":\"准时交付订单数 / 总订单数\"},"
            + "{\"step\":3,\"action\":\"计算质量合格率\",\"tool\":\"query_quality\",\"expected\":\"合格批次 / 总批次\"},"
            + "{\"step\":4,\"action\":\"评估价格竞争力\",\"tool\":\"query_supplier\",\"expected\":\"与同类供应商均价对比\"},"
            + "{\"step\":5,\"action\":\"评估响应速度\",\"tool\":\"query_supplier\",\"expected\":\"报价/交期响应平均时长\"},"
            + "{\"step\":6,\"action\":\"生成 A/B/C/D 风险分级\",\"tool\":\"evaluate_supplier\",\"expected\":\"A=优质/B=合格/C=关注/D=淘汰\"}"
            + "]");
        sop.setPostcheck("{\"verify\":[\"评分基于事实数据非主观\",\"建议动作与分级匹配\",\"合作年限纳入考量\"]}");
        proceduralMemoryMapper.insert(sop);
    }

    /** SOP 5: 质检流程 */
    private void insertQualityCheckSop() {
        ProceduralMemory sop = new ProceduralMemory();
        sop.setTenantId(PUBLIC_TENANT_ID);
        sop.setSopName("质检流程（首件/巡检/末件/入库）");
        sop.setSopType("QUALITY_CHECK");
        sop.setTriggerKeywords("质检,次品,返工,不合格,合格率,首件,巡检,末件,入库质检,疵点,视觉质检");
        sop.setConfidence(new BigDecimal("0.85"));
        sop.setSource("manual");
        sop.setEnabled(1);
        sop.setVersion(1);
        sop.setPreconditions("{\"checks\":[\"生产单有工序扫码记录\",\"质检标准已配置\",\"次品处理流程已定义\"]}");
        sop.setStepsJson("["
            + "{\"step\":1,\"action\":\"首件质检\",\"tool\":\"quality_check\",\"expected\":\"首件合格后批量生产方可开始\"},"
            + "{\"step\":2,\"action\":\"巡检（按工序抽样）\",\"tool\":\"quality_check\",\"expected\":\"抽样比例符合标准，次品记录到 t_quality_record\"},"
            + "{\"step\":3,\"action\":\"末件质检\",\"tool\":\"quality_check\",\"expected\":\"末件合格后工序方可结案\"},"
            + "{\"step\":4,\"action\":\"入库质检\",\"tool\":\"quality_check\",\"expected\":\"入库前全检或抽检，合格品入库\"},"
            + "{\"step\":5,\"action\":\"次品处理\",\"tool\":\"quality_check\",\"expected\":\"次品标记返工/报废/让步接收\"},"
            + "{\"step\":6,\"action\":\"计算合格率\",\"tool\":\"query_quality\",\"expected\":\"合格数 / (合格数 + 次品数)\"}"
            + "]");
        sop.setPostcheck("{\"verify\":[\"次品有处理记录\",\"合格率按工序/款号统计\",\"质检记录带 tenant_id\"]}");
        proceduralMemoryMapper.insert(sop);
    }
}
