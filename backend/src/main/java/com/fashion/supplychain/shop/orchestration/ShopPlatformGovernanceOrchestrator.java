package com.fashion.supplychain.shop.orchestration;

import com.fashion.supplychain.common.OperationLogAppendUtil;
import com.fashion.supplychain.shop.mapper.ShopPlatformMapper;
import com.fashion.supplychain.production.orchestration.SysNoticeOrchestrator;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 平台治理：一键下架 / 恢复上架（P2 收尾）。
 *
 * <p><b>为什么不做前置审核</b>：淘宝/抖音/1688 现在主流都不是「先审后上」，
 * 而是<b>发布即上架 + 事后巡检 + 违规下架</b>。前置审核会让商家上架变慢、
 * 平台还要背审核人力；而且本系统里「上架」是商家自己的经营动作，
 * 平台没有理由把它变成审批流。所以这里只做**事后处置**。
 *
 * <p><b>权限边界（刻意的克制）</b>：
 * <ul>
 *   <li>平台只能改 {@code shop_listed}（能不能卖），**不能改商品资料**
 *       （标题/价格/详情仍归商家）—— 否则平台就成了「能改别人商品的后门」；</li>
 *   <li>下架**必须填原因**，原因会随通知发给商家：不告诉商家为什么，
 *       商家只会反复重新上架，治理变成猫鼠游戏；</li>
 *   <li>下架后可**恢复**：只给下架不给恢复，等于平台能一键把别人的生意做没，
 *       这是必须留的反向操作。</li>
 * </ul>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ShopPlatformGovernanceOrchestrator {

    /** 下架原因长度上限（通知里要完整展示，太长商家看不完） */
    private static final int MAX_REASON_LEN = 200;

    private final ShopPlatformMapper platformMapper;
    private final SysNoticeOrchestrator sysNoticeOrchestrator;
    /** 类目词表：平台商品列表也要显示中文类目（否则治理页里还是 WOMAN/上衣 混排） */
    private final ShopCategorySupport categorySupport;

    /**
     * 平台下架某商品（跨租户）并通知所属商家。
     *
     * @param styleId 款式 ID
     * @param reason  下架原因（必填，会发给商家）
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> takedown(Long styleId, String reason) {
        if (styleId == null) {
            throw new IllegalArgumentException("缺少商品");
        }
        String why = reason == null ? "" : reason.trim();
        if (!StringUtils.hasText(why)) {
            throw new IllegalArgumentException("请填写下架原因（商家需要知道为什么被下架）");
        }
        if (why.length() > MAX_REASON_LEN) {
            throw new IllegalArgumentException("下架原因最多 " + MAX_REASON_LEN + " 字");
        }

        Map<String, Object> brief = platformMapper.findStyleBrief(styleId);
        if (brief == null) {
            throw new IllegalArgumentException("商品不存在");
        }
        if (isListed(brief.get("shopListed"))) {
            platformMapper.updateListed(styleId, 0);
        } else {
            throw new IllegalArgumentException("该商品已是下架状态");
        }

        Long tenantId = toLong(brief.get("tenantId"));
        String styleNo = str(brief.get("styleNo"));
        String styleName = str(brief.get("styleName"));
        notifyTenant(tenantId,
                "商品已被平台下架",
                "您的商品「" + (StringUtils.hasText(styleName) ? styleName : styleNo) + "（" + styleNo + "）」"
                        + "已被平台下架，原因：" + why + "。\n"
                        + "修改后可在「电商运营 → 商品上架管理」重新上架；"
                        + "如对处理有疑问，请联系平台运营。");
        writeLog("平台下架商品", styleNo + " " + styleName + "｜原因：" + why, styleId, styleName);
        log.info("[ShopGovernance] 平台下架 styleId={} tenant={} reason={}", styleId, tenantId, why);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("styleId", styleId);
        out.put("shopListed", 0);
        out.put("notifiedTenantId", tenantId);
        return out;
    }

    /**
     * 恢复上架（平台方）。
     *
     * <p>恢复不加额外校验：这是把商家自己的商品还给他，不是给他新权限。
     * 若商品资料仍不合规，商家重新上架后平台可以再次下架。
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> relist(Long styleId) {
        if (styleId == null) {
            throw new IllegalArgumentException("缺少商品");
        }
        Map<String, Object> brief = platformMapper.findStyleBrief(styleId);
        if (brief == null) {
            throw new IllegalArgumentException("商品不存在");
        }
        if (!isListed(brief.get("shopListed"))) {
            platformMapper.updateListed(styleId, 1);
        } else {
            throw new IllegalArgumentException("该商品已在架");
        }

        Long tenantId = toLong(brief.get("tenantId"));
        String styleNo = str(brief.get("styleNo"));
        String styleName = str(brief.get("styleName"));
        notifyTenant(tenantId,
                "商品已恢复上架",
                "您的商品「" + (StringUtils.hasText(styleName) ? styleName : styleNo) + "（" + styleNo + "）」"
                        + "已由平台恢复上架，现已重新对顾客可见。");
        writeLog("平台恢复上架商品", styleNo + " " + styleName, styleId, styleName);
        log.info("[ShopGovernance] 平台恢复上架 styleId={} tenant={}", styleId, tenantId);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("styleId", styleId);
        out.put("shopListed", 1);
        out.put("notifiedTenantId", tenantId);
        return out;
    }

    /**
     * 平台方看全站款式（含已下架）。
     *
     * @param listedOnly true=只看在架 / false=只看已下架 / null=全部
     */
    public Map<String, Object> adminStyles(int page, int pageSize, String keyword, Boolean listedOnly) {
        int p = Math.max(1, page);
        int size = Math.min(Math.max(1, pageSize), 60);
        String kw = StringUtils.hasText(keyword) ? keyword.trim() : null;

        long total = platformMapper.countStylesForAdmin(kw, listedOnly);
        var records = platformMapper.pageStylesForAdmin(kw, listedOnly, (p - 1) * size, size);
        for (Map<String, Object> row : records) {
            row.put("shopListed", isListed(row.get("shopListed")) ? 1 : 0);
            row.put("categoryName", categorySupport.displayName(row.get("category")));
        }

        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("records", records);
        resp.put("total", total);
        resp.put("page", p);
        resp.put("pageSize", size);
        return resp;
    }

    // ── 内部 ────────────────────────────────────────────────────────────────

    /** 通知发不出去不该让下架失败（下架是治理动作，通知是配套） */
    private void notifyTenant(Long tenantId, String title, String content) {
        if (tenantId == null) {
            return;
        }
        try {
            sysNoticeOrchestrator.sendToTenant(tenantId, "platform_governance", title, content);
        } catch (Exception e) {
            log.warn("[ShopGovernance] 平台通知发送失败 tenant={} err={}", tenantId, e.getMessage());
        }
    }

    private void writeLog(String action, String detail, Long styleId, String styleName) {
        try {
            OperationLogAppendUtil.writeLog("电商平台治理", action, detail,
                    styleId == null ? null : String.valueOf(styleId), styleName);
        } catch (Exception e) {
            log.debug("[ShopGovernance] 操作日志写入失败: {}", e.getMessage());
        }
    }

    private static boolean isListed(Object v) {
        return v != null && ("1".equals(String.valueOf(v)) || Boolean.TRUE.equals(v));
    }

    private static Long toLong(Object v) {
        if (v == null) {
            return null;
        }
        if (v instanceof Number n) {
            return n.longValue();
        }
        try {
            return Long.parseLong(String.valueOf(v));
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static String str(Object v) {
        return v == null ? "" : String.valueOf(v);
    }
}
