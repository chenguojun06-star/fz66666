package com.fashion.supplychain.intelligence.service;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.intelligence.entity.AgentContextFile;
import com.fashion.supplychain.intelligence.mapper.AgentContextFileMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.context.annotation.Lazy;

import java.util.Comparator;
import java.util.List;
import java.util.stream.Collectors;

@Slf4j
@Service
@Lazy
@RequiredArgsConstructor
public class AgentContextFileLoaderService {

    private final AgentContextFileMapper contextFileMapper;

    public String loadActiveContextFiles(Long tenantId) {
        QueryWrapper<AgentContextFile> qw = new QueryWrapper<>();
        qw.eq("is_active", 1)
                .and(w -> w.eq("tenant_id", 0).or().eq("tenant_id", tenantId))
                .orderByDesc("priority");
        List<AgentContextFile> files = contextFileMapper.selectList(qw);

        if (files.isEmpty()) {
            return loadDefaultContext();
        }

        List<AgentContextFile> sorted = files.stream()
                .sorted(Comparator.comparingInt(f -> f.getPriority() != null ? f.getPriority() : 0))
                .collect(Collectors.toList());

        StringBuilder sb = new StringBuilder();
        sb.append("[系统上下文文件]\n");
        for (AgentContextFile f : sorted) {
            sb.append("--- ").append(f.getFileName()).append(" ---\n");
            sb.append(f.getContent()).append("\n\n");
        }
        return sb.toString();
    }

    private String loadDefaultContext() {
        return """
                [小云AI系统上下文 - 服装供应链智能助手]
                
                ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                【身份定位】
                ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                你是小云，服装供应链智能AI助手。你的目标是：
                1. 帮助用户高效管理生产订单、追踪工序进度、发现异常
                2. 提供数据驱动的经营建议和风险预警
                3. 记住用户偏好和习惯，提供个性化服务
                4. 用自然语言理解用户意图，主动提供服务
                
                ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                【核心能力清单】
                ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                📦 生产管理：
                   - 订单创建、修改、查询、取消
                   - 工序扫码追踪（裁剪、缝制、质检、入库）
                   - 进度预测（交期预测、产能评估）
                   - 异常检测（逾期预警、质量异常、工序停滞）
                   
                📊 数据分析：
                   - 运营日报/周报/月报生成
                   - 工资成本核算与结算
                   - 物料采购与库存分析
                   - 供应商评分与比价
                   
                🤖 智能辅助：
                   - 自然语言查询（"查查逾期订单" "今天入库多少"）
                   - 异常根因分析
                   - 排产优化建议
                   - 以图搜款/缺陷检测
                   
                🔔 主动服务：
                   - 交期风险预警
                   - 物料短缺提醒
                   - 质检异常通知
                   - 工资结算提醒
                
                ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                【交互规范】
                ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                ✅ 回答原则：
                   - 数据要具体：有数字有依据，不要空泛
                   - 建议要可执行：给出明确操作建议
                   - 异常要分级：🔴紧急 🟠重要 🟡注意 🟢正常
                   - 找不到数据要诚实：明确说"暂无数据"而非编造
                   
                ✅ 口语化表达：
                   - 避免过度正式，用自然的对话语气
                   - 可适当使用emoji增加可读性
                   - 复杂问题分步骤解释
                   
                ✅ 上下文感知：
                   - 如果用户在说具体订单，主动提取订单号查询
                   - 如果用户在某个页面，可结合页面上下文理解意图
                   - 如果是多轮对话，记住之前的讨论内容
                
                ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                【安全与合规】
                ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                ⚠️ 数据隔离：每个租户的数据完全隔离，绝不泄露
                ⚠️ 权限遵守：严格遵循角色权限，看菜吃饭
                ⚠️ 可追溯：建议追溯到数据来源
                ⚠️ 主动纠错：发现用户操作有风险时主动提醒
                """;
    }

    public String loadForPrompt(Long tenantId) {
        String context = loadActiveContextFiles(tenantId);
        if (context.length() > 4000) {
            context = context.substring(0, 4000) + "\n[...上下文截断]";
        }
        return context;
    }
    
    /**
     * 加载特定业务域的上下文模板
     * @param domain 业务域：PRODUCTION/WAREHOUSE/FINANCE/STYLE/ANALYSIS
     */
    public String loadDomainContext(String domain) {
        return switch (domain.toUpperCase()) {
            case "PRODUCTION" -> """
                [生产管理域上下文]
                当用户询问生产相关问题时：
                - 重点关注：订单状态、工序进度、扫码记录、裁剪计划
                - 关键指标：完成率、逾期率、返工率、人均效率
                - 常见异常：工序停滞、扫码遗漏、质检不合格
                """;
            case "WAREHOUSE" -> """
                [仓储管理域上下文]
                当用户询问仓储相关问题时：
                - 重点关注：库存余量、入库记录、出库记录、物料批次
                - 关键指标：库存周转率、呆滞物料、库位利用率
                - 常见异常：库存不足、批次过期、库位冲突
                """;
            case "FINANCE" -> """
                [财务管理域上下文]
                当用户询问财务相关问题时：
                - 重点关注：工资结算、对账明细、成本构成、利润分析
                - 关键指标：计件单价、人工成本、物料成本、总成本
                - 常见异常：对账不平、工资核算错误、费用超支
                """;
            case "STYLE" -> """
                [款式管理域上下文]
                当用户询问款式相关问题时：
                - 重点关注：款号、BOM清单、工序定义、尺码表
                - 关键指标：开发周期、样衣进度、报价准确率
                - 常见异常：BOM不完整、工序遗漏、报价偏差大
                """;
            case "ANALYSIS" -> """
                [数据分析域上下文]
                当用户询问分析相关问题时：
                - 重点关注：日报周报、趋势分析、同比环比、排名对比
                - 关键指标：产值、效率、合格率、成本率
                - 常见异常：数据异常、趋势反转、异常波动
                """;
            default -> "";
        };
    }
}
