package com.fashion.supplychain.style.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.entity.StyleQuotation;
import com.fashion.supplychain.style.mapper.StyleInfoMapper;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.style.service.StyleQuotationService;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.ParamUtils;
import com.fashion.supplychain.common.UserContext;
import java.math.BigDecimal;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import java.time.LocalDateTime;

/**
 * 款号资料Service实现类
 */
@lombok.extern.slf4j.Slf4j
@Service
public class StyleInfoServiceImpl extends ServiceImpl<StyleInfoMapper, StyleInfo> implements StyleInfoService {

    private static final String STYLE_STATUS_ENABLED = "ENABLED";
    private static final String STYLE_STATUS_DISABLED = "DISABLED";
    private static final String STYLE_STATUS_SCRAPPED = "SCRAPPED";

    @Autowired
    @Lazy
    private StyleQuotationService styleQuotationService;

    @Override
    public IPage<StyleInfo> queryPage(Map<String, Object> params) {
        Integer page = ParamUtils.getPage(params);
        Integer pageSize = ParamUtils.getPageSize(params);
        Long readableTenantId = resolveReadableTenantId();
        boolean tenantScopedRead = isTenantScopedRead();

        Page<StyleInfo> pageInfo = new Page<>(page, pageSize);
        LambdaQueryWrapper<StyleInfo> wrapper = buildQueryWrapper(params, readableTenantId, tenantScopedRead);

        IPage<StyleInfo> resultPage = baseMapper.selectPage(pageInfo,
            wrapper.orderByDesc(StyleInfo::getCreateTime));

        return resultPage;
    }

    private LambdaQueryWrapper<StyleInfo> buildQueryWrapper(Map<String, Object> params, Long readableTenantId, boolean tenantScopedRead) {
        String styleNo = (String) params.getOrDefault("styleNo", "");
        String styleNoExact = (String) params.getOrDefault("styleNoExact", "");
        String styleName = (String) params.getOrDefault("styleName", "");
        String category = (String) params.getOrDefault("category", "");
        String keyword = (String) params.getOrDefault("keyword", "");
        String progressNode = (String) params.getOrDefault("progressNode", "");

        boolean onlyCompleted = parseBooleanParam(params, "onlyCompleted");
        boolean pushedToOrderOnly = parseBooleanParam(params, "pushedToOrderOnly");
        boolean excludeScrapped = Boolean.TRUE.equals(params.get("excludeScrapped"));

        LambdaQueryWrapper<StyleInfo> wrapper = new LambdaQueryWrapper<StyleInfo>()
                .eq(tenantScopedRead, StyleInfo::getTenantId, readableTenantId)
                .eq(StringUtils.hasText(styleNoExact), StyleInfo::getStyleNo, styleNoExact)
                .like(!StringUtils.hasText(styleNoExact) && StringUtils.hasText(styleNo), StyleInfo::getStyleNo, styleNo)
                .like(StringUtils.hasText(styleName), StyleInfo::getStyleName, styleName)
                .eq(StringUtils.hasText(category), StyleInfo::getCategory, category)
                .and(StringUtils.hasText(keyword), w -> w
                    .like(StyleInfo::getStyleNo, keyword)
                    .or()
                    .like(StyleInfo::getStyleName, keyword)
                    .or()
                    .like(StyleInfo::getCategory, keyword))
                .eq(onlyCompleted, StyleInfo::getSampleStatus, "COMPLETED")
                .eq(pushedToOrderOnly, StyleInfo::getPushedToOrder, 1);

        applyStatusFilter(wrapper, excludeScrapped);
        applyExcludePushedToOrder(wrapper, params);
        applyProgressNodeFilter(wrapper, progressNode);

        return wrapper;
    }

    private boolean parseBooleanParam(Map<String, Object> params, String key) {
        Object raw = params.get(key);
        if (raw == null) return false;
        String s = String.valueOf(raw).trim();
        return "1".equals(s) || "true".equalsIgnoreCase(s) || "yes".equalsIgnoreCase(s);
    }

    private void applyStatusFilter(LambdaQueryWrapper<StyleInfo> wrapper, boolean excludeScrapped) {
        if (excludeScrapped) {
            wrapper.eq(StyleInfo::getStatus, STYLE_STATUS_ENABLED);
        } else {
            wrapper.and(w -> w.eq(StyleInfo::getStatus, STYLE_STATUS_ENABLED)
                    .or()
                    .eq(StyleInfo::getStatus, STYLE_STATUS_SCRAPPED));
        }
    }

    private void applyExcludePushedToOrder(LambdaQueryWrapper<StyleInfo> wrapper, Map<String, Object> params) {
        boolean excludePushedToOrder = Boolean.TRUE.equals(params.get("excludePushedToOrder"));
        if (excludePushedToOrder) {
            wrapper.and(w -> w.isNull(StyleInfo::getPushedToOrder).or().ne(StyleInfo::getPushedToOrder, 1));
        }
    }

    private void applyProgressNodeFilter(LambdaQueryWrapper<StyleInfo> wrapper, String progressNode) {
        if (!StringUtils.hasText(progressNode)) return;
        String node = progressNode.trim();
        switch (node) {
            case "开发样报废" -> wrapper.eq(StyleInfo::getStatus, STYLE_STATUS_SCRAPPED);
            case "样衣完成" -> wrapper.and(w -> w.eq(StyleInfo::getSampleStatus, "COMPLETED").or().eq(StyleInfo::getSampleStatus, "Completed"));
            case "样衣制作中" -> wrapper.and(w -> w.eq(StyleInfo::getSampleStatus, "IN_PROGRESS").or().eq(StyleInfo::getSampleStatus, "In_Progress"));
            case "纸样完成" -> wrapper
                .and(w -> w.eq(StyleInfo::getPatternStatus, "COMPLETED").or().eq(StyleInfo::getPatternStatus, "Completed"))
                .and(w -> w.isNull(StyleInfo::getSampleStatus)
                    .or()
                    .notIn(StyleInfo::getSampleStatus, "COMPLETED", "Completed", "IN_PROGRESS", "In_Progress"));
            case "纸样开发中" -> wrapper
                .and(w -> w.eq(StyleInfo::getPatternStatus, "IN_PROGRESS").or().eq(StyleInfo::getPatternStatus, "In_Progress"))
                .and(w -> w.isNull(StyleInfo::getSampleStatus)
                    .or()
                    .notIn(StyleInfo::getSampleStatus, "COMPLETED", "Completed", "IN_PROGRESS", "In_Progress"));
            case "未开始" -> wrapper
                .and(w -> w.isNull(StyleInfo::getSampleStatus)
                    .or()
                    .notIn(StyleInfo::getSampleStatus, "COMPLETED", "Completed", "IN_PROGRESS", "In_Progress"))
                .and(w -> w.isNull(StyleInfo::getPatternStatus)
                    .or()
                    .notIn(StyleInfo::getPatternStatus, "COMPLETED", "Completed", "IN_PROGRESS", "In_Progress"));
            default -> {}
        }
    }

    @Override
    public StyleInfo getDetailById(Long id) {
        Long readableTenantId = resolveReadableTenantId();
        boolean tenantScopedRead = isTenantScopedRead();
        StyleInfo style = baseMapper.selectOne(
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<StyleInfo>()
                        .eq(StyleInfo::getId, id)
                .eq(tenantScopedRead, StyleInfo::getTenantId, readableTenantId)
                .and(w -> w.eq(StyleInfo::getStatus, STYLE_STATUS_ENABLED)
                    .or()
                    .eq(StyleInfo::getStatus, STYLE_STATUS_SCRAPPED)));
        if (style == null) {
            return null;
        }

        try {
            Set<Long> one = new HashSet<>();
            one.add(id);
            Map<Long, String> styleNoByStyleId = new HashMap<>();
            if (StringUtils.hasText(style.getStyleNo())) {
                styleNoByStyleId.put(id, style.getStyleNo().trim());
            }
            BigDecimal target = null;

            StyleQuotation quotation = styleQuotationService == null ? null : styleQuotationService.getByStyleId(id);
            BigDecimal qp = quotation == null ? null : quotation.getTotalPrice();
            boolean fromQuotation = qp != null && qp.compareTo(BigDecimal.ZERO) > 0;
            if (fromQuotation) {
                target = qp;
            }

            BigDecimal current = style.getPrice();
            boolean needFallback = (current == null || current.compareTo(BigDecimal.ZERO) <= 0);
            if (target == null && needFallback && styleQuotationService != null) {
                target = styleQuotationService.resolveFinalUnitPriceByStyleIds(one, styleNoByStyleId).get(id);
            }

            if (target != null) {
                BigDecimal p = style.getPrice();
                if (p == null || p.compareTo(target) != 0) {
                    style.setPrice(target);
                    if (fromQuotation || p == null || p.compareTo(BigDecimal.ZERO) <= 0) {
                        StyleInfo patch = new StyleInfo();
                        patch.setId(id);
                        patch.setPrice(target);
                        patch.setUpdateTime(LocalDateTime.now());
                        this.updateById(patch);
                    }
                }
            }
        } catch (Exception e) {
            log.warn("StyleInfoServiceImpl.getDetailById 更新报价价格异常: styleId={}", id, e);
        }

        // 设置进度节点（与列表页逻辑一致）
        String patternStatus = StringUtils.hasText(style.getPatternStatus()) ? style.getPatternStatus().trim() : "";
        String sampleStatus = StringUtils.hasText(style.getSampleStatus()) ? style.getSampleStatus().trim() : "";

        if (STYLE_STATUS_SCRAPPED.equalsIgnoreCase(String.valueOf(style.getStatus()))) {
            style.setProgressNode("开发样报废");
            style.setCompletedTime(null);
        } else if ("COMPLETED".equalsIgnoreCase(sampleStatus)) {
            style.setProgressNode("样衣完成");
            style.setCompletedTime(style.getSampleCompletedTime());
        } else if ("IN_PROGRESS".equalsIgnoreCase(sampleStatus)) {
            style.setProgressNode("样衣制作中");
            style.setCompletedTime(null);
        } else if ("COMPLETED".equalsIgnoreCase(patternStatus)) {
            style.setProgressNode("纸样完成");
            style.setCompletedTime(style.getPatternCompletedTime());
        } else if ("IN_PROGRESS".equalsIgnoreCase(patternStatus)) {
            style.setProgressNode("纸样开发中");
            style.setCompletedTime(null);
        } else {
            style.setProgressNode("未开始");
            style.setCompletedTime(null);
        }

        return style;
    }

    private boolean isTenantScopedRead() {
        return !UserContext.isSuperAdmin();
    }

    private Long resolveReadableTenantId() {
        Long tenantId = UserContext.tenantId();
        return tenantId != null ? tenantId : -1L;
    }

    @Override
    public boolean saveOrUpdateStyle(StyleInfo styleInfo) {
        LocalDateTime now = LocalDateTime.now();

        if (styleInfo.getId() != null) {
            // 更新操作
            StyleInfo existing = this.getById(styleInfo.getId());
            if (existing != null) {
                styleInfo.setCreateTime(existing.getCreateTime());
                styleInfo.setPrice(existing.getPrice());
            }
            styleInfo.setUpdateTime(now);
        } else {
            // 新增操作
            if (styleInfo.getCreateTime() == null) {
                styleInfo.setCreateTime(now);
            }
            styleInfo.setUpdateTime(now);
            if (!StringUtils.hasText(styleInfo.getStatus())) {
                styleInfo.setStatus(STYLE_STATUS_ENABLED);
            }
            // 品类默认值（数据库NOT NULL约束要求）
            if (!StringUtils.hasText(styleInfo.getCategory())) {
                styleInfo.setCategory("未分类");
            }
            styleInfo.setPrice(null);

            // 设计师 = 创建款式的人（自动填充）
            String currentUser = UserContext.username();
            if (!StringUtils.hasText(styleInfo.getSampleNo())) {
                if (StringUtils.hasText(currentUser)) {
                    styleInfo.setSampleNo(currentUser);
                }
            }

            // 自动生成款号和SKC
            String timeStr = now.format(java.time.format.DateTimeFormatter.ofPattern("yyyyMMddHHmm"));

            if (!StringUtils.hasText(styleInfo.getStyleNo())) {
                String initials = "ST";
                try {
                    if (StringUtils.hasText(currentUser)) {
                        String py = cn.hutool.extra.pinyin.PinyinUtil.getFirstLetter(currentUser, "");
                        if (StringUtils.hasText(py)) {
                            initials = py.toUpperCase();
                        }
                    }
                } catch (Exception e) {
                    log.error("Failed to generate pinyin initials for user: " + currentUser, e);
                }
                styleInfo.setStyleNo(initials + timeStr);
            }

            if (!StringUtils.hasText(styleInfo.getSkc())) {
                styleInfo.setSkc("SKC" + timeStr);
            }
        }

        return this.saveOrUpdate(styleInfo);
    }

    @Override
    public boolean deleteById(Long id) {
        StyleInfo styleInfo = new StyleInfo();
        styleInfo.setId(id);
        styleInfo.setStatus(STYLE_STATUS_DISABLED);
        styleInfo.setUpdateTime(LocalDateTime.now());

        return this.updateById(styleInfo);
    }

    @Override
    public boolean isPatternLocked(Long styleId) {
        if (styleId == null) {
            return false;
        }
        StyleInfo style = this.getById(styleId);
        if (style == null) {
            return false;
        }
        if (Integer.valueOf(0).equals(style.getPatternRevLocked())) {
            return false;
        }
        String status = String.valueOf(style.getPatternStatus() == null ? "" : style.getPatternStatus()).trim();
        return "COMPLETED".equalsIgnoreCase(status);
    }

    @Override
    public StyleInfo getValidatedForOrderCreate(String styleId, String styleNo) {
        String sid = StringUtils.hasText(styleId) ? styleId.trim() : null;
        String sno = StringUtils.hasText(styleNo) ? styleNo.trim() : null;
        if (!StringUtils.hasText(sid) && !StringUtils.hasText(sno)) {
            throw new IllegalStateException("缺少款号信息，无法下单");
        }

        StyleInfo style = null;
        if (sid != null && !sid.isEmpty()) {
            boolean numeric = true;
            for (int i = 0; i < sid.length(); i++) {
                if (!Character.isDigit(sid.charAt(i))) {
                    numeric = false;
                    break;
                }
            }
            if (numeric) {
                style = this.lambdaQuery()
                        .select(StyleInfo::getId,
                                StyleInfo::getStyleNo,
                                StyleInfo::getStyleName,
                                StyleInfo::getStatus,
                                StyleInfo::getSampleStatus,
                                StyleInfo::getPatternStatus)
                        .eq(StyleInfo::getId, Long.parseLong(sid))
                        .last("limit 1")
                        .one();
            }
        }

        if (style == null && StringUtils.hasText(sno)) {
            style = this.lambdaQuery()
                    .select(StyleInfo::getId,
                            StyleInfo::getStyleNo,
                            StyleInfo::getStyleName,
                            StyleInfo::getStatus,
                            StyleInfo::getSampleStatus,
                            StyleInfo::getPatternStatus)
                    .eq(StyleInfo::getStyleNo, sno)
                    .last("limit 1")
                    .one();
        }

        if (style == null) {
            throw new NoSuchElementException("款号不存在");
        }

        String st = style.getStatus() == null ? "" : style.getStatus().trim();
        if (STYLE_STATUS_SCRAPPED.equalsIgnoreCase(st)) {
            throw new IllegalStateException("开发样已报废，无法下单");
        }
        if (StringUtils.hasText(st) && !STYLE_STATUS_ENABLED.equalsIgnoreCase(st)) {
            throw new IllegalStateException("款号已禁用，无法下单");
        }

        String sampleStatus = style.getSampleStatus() == null ? "" : style.getSampleStatus().trim();
        if (!"COMPLETED".equalsIgnoreCase(sampleStatus)) {
            throw new IllegalStateException("款号资料未完成（样衣未完成），无法下单");
        }

        return style;
    }
}
