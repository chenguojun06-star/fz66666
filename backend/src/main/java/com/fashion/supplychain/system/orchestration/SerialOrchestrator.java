package com.fashion.supplychain.system.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.StyleInfoService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;

@Service
public class SerialOrchestrator {

    private static final DateTimeFormatter DAY_FMT = DateTimeFormatter.ofPattern("yyyyMMdd");

    @Autowired
    private StyleInfoService styleInfoService;

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    public String generate(String ruleCode) {
        String code = StringUtils.hasText(ruleCode) ? ruleCode.trim().toUpperCase() : "";
        if (!StringUtils.hasText(code)) {
            throw new IllegalArgumentException("ruleCode不能为空");
        }

        if ("STYLE_NO".equals(code)) {
            return nextStyleNo();
        }
        if ("ORDER_NO".equals(code)) {
            return nextOrderNo();
        }

        throw new IllegalArgumentException("不支持的ruleCode");
    }

    private String nextStyleNo() {
        String day = LocalDate.now().format(DAY_FMT);
        String prefix = "ST" + day;
        StyleInfo latest = styleInfoService.getOne(new LambdaQueryWrapper<StyleInfo>()
                .likeRight(StyleInfo::getStyleNo, prefix)
                .orderByDesc(StyleInfo::getStyleNo)
                .last("limit 1"));

        int seq = resolveNextSeq(prefix, latest == null ? null : latest.getStyleNo());
        for (int i = 0; i < 200; i++) {
            String candidate = prefix + "%03d".formatted(seq);
            Long cnt = styleInfoService.count(new LambdaQueryWrapper<StyleInfo>()
                    .eq(StyleInfo::getStyleNo, candidate));
            if (cnt == null || cnt == 0) {
                return candidate;
            }
            seq += 1;
        }

        String fallback = String.valueOf(System.nanoTime());
        String suffix = fallback.length() > 6 ? fallback.substring(fallback.length() - 6) : fallback;
        return prefix + suffix;
    }

    private String nextOrderNo() {
        String day = LocalDate.now().format(DAY_FMT);
        String prefix = "PO" + day;
        Long tenantId = UserContext.tenantId();

        // 使用 JdbcTemplate 绕过 MyBatis-Plus 全局逻辑删除过滤
        // 确保已软删除的订单号也被纳入查重，避免命中 uk_tenant_order_no 唯一约束导致 409
        String latestOrderNo = findLatestOrderNo(prefix, tenantId);
        int seq = resolveNextSeq(prefix, latestOrderNo);

        for (int i = 0; i < 200; i++) {
            String candidate = prefix + "%03d".formatted(seq);
            if (countOrderNoIncludingDeleted(candidate, tenantId) == 0) {
                return candidate;
            }
            seq += 1;
        }

        String fallback = String.valueOf(System.nanoTime());
        String suffix = fallback.length() > 6 ? fallback.substring(fallback.length() - 6) : fallback;
        return prefix + suffix;
    }

    /** 查询最新订单号（包含已软删除的记录），绕过 logic-delete 过滤 */
    private String findLatestOrderNo(String prefix, Long tenantId) {
        String sql;
        Object[] params;
        if (tenantId != null) {
            sql = "SELECT order_no FROM t_production_order WHERE tenant_id = ? AND order_no LIKE ? ORDER BY order_no DESC LIMIT 1";
            params = new Object[]{tenantId, prefix + "%"};
        } else {
            sql = "SELECT order_no FROM t_production_order WHERE order_no LIKE ? ORDER BY order_no DESC LIMIT 1";
            params = new Object[]{prefix + "%"};
        }
        List<String> results = jdbcTemplate.queryForList(sql, String.class, params);
        return results.isEmpty() ? null : results.get(0);
    }

    /** 检查订单号是否已存在（包含已软删除的记录），绕过 logic-delete 过滤 */
    private int countOrderNoIncludingDeleted(String orderNo, Long tenantId) {
        String sql;
        Object[] params;
        if (tenantId != null) {
            sql = "SELECT COUNT(*) FROM t_production_order WHERE tenant_id = ? AND order_no = ?";
            params = new Object[]{tenantId, orderNo};
        } else {
            sql = "SELECT COUNT(*) FROM t_production_order WHERE order_no = ?";
            params = new Object[]{orderNo};
        }
        Integer cnt = jdbcTemplate.queryForObject(sql, Integer.class, params);
        return cnt != null ? cnt : 0;
    }

    private int resolveNextSeq(String prefix, String latestValue) {
        if (!StringUtils.hasText(prefix) || !StringUtils.hasText(latestValue)) {
            return 1;
        }
        String v = latestValue.trim();
        if (!v.startsWith(prefix) || v.length() < prefix.length() + 3) {
            return 1;
        }
        String tail = v.substring(v.length() - 3);
        try {
            int n = Integer.parseInt(tail);
            return Math.max(1, n + 1);
        } catch (Exception e) {
            return 1;
        }
    }
}
