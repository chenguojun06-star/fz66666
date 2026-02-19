package com.fashion.supplychain.style.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.entity.StyleOperationLog;
import com.fashion.supplychain.style.entity.StyleQuotation;
import com.fashion.supplychain.style.mapper.StyleInfoMapper;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.style.service.StyleOperationLogService;
import com.fashion.supplychain.style.service.StyleQuotationService;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.ParamUtils;
import com.fashion.supplychain.common.UserContext;
import java.math.BigDecimal;
import java.util.NoSuchElementException;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Lazy;
import java.util.List;
import java.util.Map;
import java.util.HashMap;
import java.util.Set;
import java.util.HashSet;
import java.util.ArrayList;
import java.time.LocalDateTime;

/**
 * 款号资料Service实现类
 */
@Service
public class StyleInfoServiceImpl extends ServiceImpl<StyleInfoMapper, StyleInfo> implements StyleInfoService {

    @Autowired
    private StyleOperationLogService styleOperationLogService;

    // TODO [架构债务] ProductionOrderService 是跨模块依赖（production→style）
    // queryPage中的订单统计、附加统计量逻辑应迁移到StyleInfoOrchestrator
    @Autowired
    private ObjectProvider<ProductionOrderService> productionOrderServiceProvider;

    @Autowired
    @Lazy
    private StyleQuotationService styleQuotationService;

    @Override
    public IPage<StyleInfo> queryPage(Map<String, Object> params) {
        Integer page = ParamUtils.getPage(params);
        Integer pageSize = ParamUtils.getPageSize(params);

        // 创建分页对象
        Page<StyleInfo> pageInfo = new Page<>(page, pageSize);

        // 构建查询条件
        String styleNo = (String) params.getOrDefault("styleNo", "");
        String styleName = (String) params.getOrDefault("styleName", "");
        String category = (String) params.getOrDefault("category", "");
        String keyword = (String) params.getOrDefault("keyword", "");
        String progressNode = (String) params.getOrDefault("progressNode", "");

        boolean onlyCompleted = false;
        Object onlyCompletedRaw = params.get("onlyCompleted");
        if (onlyCompletedRaw != null) {
            String s = String.valueOf(onlyCompletedRaw).trim();
            onlyCompleted = "1".equals(s) || "true".equalsIgnoreCase(s) || "yes".equalsIgnoreCase(s);
        }

        // 使用条件构造器进行查询
        com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<StyleInfo> wrapper =
            new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<StyleInfo>()
                .like(StringUtils.hasText(styleNo), StyleInfo::getStyleNo, styleNo)
                .like(StringUtils.hasText(styleName), StyleInfo::getStyleName, styleName)
                .eq(StringUtils.hasText(category), StyleInfo::getCategory, category)
                .and(StringUtils.hasText(keyword), w -> w
                    .like(StyleInfo::getStyleNo, keyword)
                    .or()
                    .like(StyleInfo::getStyleName, keyword)
                    .or()
                    .like(StyleInfo::getCategory, keyword))
                .eq(onlyCompleted, StyleInfo::getSampleStatus, "COMPLETED")
                .eq(StyleInfo::getStatus, "ENABLED");

        if (StringUtils.hasText(progressNode)) {
            String node = progressNode.trim();
            switch (node) {
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
                default -> {
                }
            }
        }

        IPage<StyleInfo> resultPage = baseMapper.selectPage(pageInfo,
            wrapper.orderByDesc(StyleInfo::getCreateTime));

        fillQuotationPriceFields(resultPage.getRecords());
        fillProgressFields(resultPage.getRecords());
        fillOrderCountFields(resultPage.getRecords());

        return resultPage;
    }

    private void fillOrderCountFields(List<StyleInfo> records) {
        if (records == null || records.isEmpty()) {
            return;
        }

        List<String> styleIds = new ArrayList<>();
        Set<String> styleNos = new HashSet<>();
        for (StyleInfo s : records) {
            if (s == null) {
                continue;
            }
            if (s.getId() != null) {
                styleIds.add(String.valueOf(s.getId()));
            }
            if (StringUtils.hasText(s.getStyleNo())) {
                styleNos.add(s.getStyleNo().trim());
            }
        }

        Map<String, Integer> countByStyleId = new HashMap<>();
        Map<String, Integer> countByStyleNo = new HashMap<>();
        Map<String, LocalDateTime> latestOrderTimeByStyleId = new HashMap<>();
        Map<String, LocalDateTime> latestOrderTimeByStyleNo = new HashMap<>();
        Map<String, String> latestOrderCreatorByStyleId = new HashMap<>();
        Map<String, String> latestOrderCreatorByStyleNo = new HashMap<>();

        if (!styleIds.isEmpty() || !styleNos.isEmpty()) {
            ProductionOrderService productionOrderService = productionOrderServiceProvider.getIfAvailable();
            if (productionOrderService == null) {
                return;
            }

            // 统计订单数量
            QueryWrapper<ProductionOrder> qw = new QueryWrapper<>();
            qw.select("style_id as styleId", "style_no as styleNo", "count(1) as cnt")
                    .and(w -> {
                        boolean hasPrev = false;
                        if (!styleIds.isEmpty()) {
                            w.in("style_id", styleIds);
                            hasPrev = true;
                        }
                        if (!styleNos.isEmpty()) {
                            if (hasPrev) {
                                w.or();
                            }
                            w.in("style_no", styleNos);
                        }
                    })
                    .and(w -> w.isNull("delete_flag").or().eq("delete_flag", 0))
                    .groupBy("style_id", "style_no");

            List<Map<String, Object>> rows = productionOrderService.listMaps(qw);
            for (Map<String, Object> r : rows) {
                if (r == null) {
                    continue;
                }
                String sid = r.get("styleId") == null ? null : String.valueOf(r.get("styleId")).trim();
                String sno = r.get("styleNo") == null ? null : String.valueOf(r.get("styleNo")).trim();
                int cnt;
                try {
                    cnt = r.get("cnt") == null ? 0 : Integer.parseInt(String.valueOf(r.get("cnt")));
                } catch (Exception e) {
                    cnt = 0;
                }
                if (cnt <= 0) {
                    continue;
                }
                if (StringUtils.hasText(sid)) {
                    countByStyleId.put(sid, cnt);
                }
                if (StringUtils.hasText(sno)) {
                    countByStyleNo.put(sno, cnt);
                }
            }

            // 查询最近下单时间和下单人
            QueryWrapper<ProductionOrder> timeQw = new QueryWrapper<>();
            timeQw.select("style_id as styleId", "style_no as styleNo", "MAX(create_time) as latestTime",
                         "(SELECT created_by_name FROM t_production_order po2 WHERE " +
                         "(po2.style_id = t_production_order.style_id OR po2.style_no = t_production_order.style_no) " +
                         "AND (po2.delete_flag IS NULL OR po2.delete_flag = 0) " +
                         "ORDER BY po2.create_time DESC LIMIT 1) as latestCreator")
                    .and(w -> {
                        boolean hasPrev = false;
                        if (!styleIds.isEmpty()) {
                            w.in("style_id", styleIds);
                            hasPrev = true;
                        }
                        if (!styleNos.isEmpty()) {
                            if (hasPrev) {
                                w.or();
                            }
                            w.in("style_no", styleNos);
                        }
                    })
                    .and(w -> w.isNull("delete_flag").or().eq("delete_flag", 0))
                    .groupBy("style_id", "style_no");

            List<Map<String, Object>> timeRows = productionOrderService.listMaps(timeQw);
            for (Map<String, Object> r : timeRows) {
                if (r == null) {
                    continue;
                }
                String sid = r.get("styleId") == null ? null : String.valueOf(r.get("styleId")).trim();
                String sno = r.get("styleNo") == null ? null : String.valueOf(r.get("styleNo")).trim();
                Object latestTimeObj = r.get("latestTime");
                LocalDateTime latestTime = null;
                if (latestTimeObj instanceof LocalDateTime) {
                    latestTime = (LocalDateTime) latestTimeObj;
                }
                String latestCreator = r.get("latestCreator") == null ? null : String.valueOf(r.get("latestCreator")).trim();

                if (latestTime != null) {
                    if (StringUtils.hasText(sid)) {
                        latestOrderTimeByStyleId.put(sid, latestTime);
                        if (StringUtils.hasText(latestCreator)) {
                            latestOrderCreatorByStyleId.put(sid, latestCreator);
                        }
                    }
                    if (StringUtils.hasText(sno)) {
                        latestOrderTimeByStyleNo.put(sno, latestTime);
                        if (StringUtils.hasText(latestCreator)) {
                            latestOrderCreatorByStyleNo.put(sno, latestCreator);
                        }
                    }
                }
            }
        }

        for (StyleInfo s : records) {
            if (s == null) {
                continue;
            }
            String idKey = s.getId() == null ? null : String.valueOf(s.getId());
            Integer byId = StringUtils.hasText(idKey) ? countByStyleId.get(idKey) : null;
            if (byId != null && byId > 0) {
                s.setOrderCount(byId);
                if (StringUtils.hasText(idKey)) {
                    s.setLatestOrderTime(latestOrderTimeByStyleId.get(idKey));
                    s.setLatestOrderCreator(latestOrderCreatorByStyleId.get(idKey));
                }
                continue;
            }
            String sno = StringUtils.hasText(s.getStyleNo()) ? s.getStyleNo().trim() : null;
            s.setOrderCount(StringUtils.hasText(sno) ? countByStyleNo.getOrDefault(sno, 0) : 0);
            if (StringUtils.hasText(sno)) {
                s.setLatestOrderTime(latestOrderTimeByStyleNo.get(sno));
                s.setLatestOrderCreator(latestOrderCreatorByStyleNo.get(sno));
            }
        }
    }

    private void fillQuotationPriceFields(List<StyleInfo> records) {
        if (records == null || records.isEmpty()) {
            return;
        }

        Set<Long> ids = new HashSet<>();
        for (StyleInfo s : records) {
            if (s != null && s.getId() != null) {
                ids.add(s.getId());
            }
        }

        if (styleQuotationService == null) {
            return;
        }

        Map<Long, String> styleNoByStyleId = new HashMap<>();
        for (StyleInfo s : records) {
            if (s == null || s.getId() == null) {
                continue;
            }
            if (StringUtils.hasText(s.getStyleNo())) {
                styleNoByStyleId.put(s.getId(), s.getStyleNo().trim());
            }
        }

        Map<Long, BigDecimal> unitPriceByStyleId = styleQuotationService.resolveFinalUnitPriceByStyleIds(ids,
                styleNoByStyleId);

        for (StyleInfo s : records) {
            if (s == null || s.getId() == null) {
                continue;
            }

            BigDecimal target = unitPriceByStyleId.get(s.getId());
            if (target == null || target.compareTo(BigDecimal.ZERO) <= 0) {
                continue;
            }

            BigDecimal p = s.getPrice();

            if (p == null || p.compareTo(target) != 0) {
                s.setPrice(target);
                try {
                    StyleInfo patch = new StyleInfo();
                    patch.setId(s.getId());
                    patch.setPrice(target);
                    patch.setUpdateTime(LocalDateTime.now());
                    this.updateById(patch);
                } catch (Exception ignored) {
                }
            }
        }
    }

    private void fillProgressFields(List<StyleInfo> records) {
        if (records == null || records.isEmpty()) {
            return;
        }

        Set<Long> ids = new HashSet<>();
        for (StyleInfo s : records) {
            if (s != null && s.getId() != null) {
                ids.add(s.getId());
            }
        }

        Map<Long, StyleOperationLog> latestMaintenance = new HashMap<>();
        if (!ids.isEmpty()) {
            List<StyleOperationLog> logs = styleOperationLogService.lambdaQuery()
                    .in(StyleOperationLog::getStyleId, ids)
                    .eq(StyleOperationLog::getBizType, "maintenance")
                    .orderByDesc(StyleOperationLog::getCreateTime)
                    .list();
            for (StyleOperationLog log : logs) {
                if (log == null || log.getStyleId() == null) {
                    continue;
                }
                if (!latestMaintenance.containsKey(log.getStyleId())) {
                    latestMaintenance.put(log.getStyleId(), log);
                }
            }
        }

        for (StyleInfo style : records) {
            if (style == null) {
                continue;
            }

            StyleOperationLog m = style.getId() != null ? latestMaintenance.get(style.getId()) : null;
            style.setMaintenanceTime(m != null ? m.getCreateTime() : null);
            style.setMaintenanceMan(m != null ? m.getOperator() : null);
            style.setMaintenanceRemark(m != null ? m.getRemark() : null);

            String patternStatus = StringUtils.hasText(style.getPatternStatus()) ? style.getPatternStatus().trim() : "";
            String sampleStatus = StringUtils.hasText(style.getSampleStatus()) ? style.getSampleStatus().trim() : "";

            style.setLatestOrderNo(null);
            style.setLatestOrderStatus(null);
            style.setLatestProductionProgress(null);

            if ("COMPLETED".equalsIgnoreCase(sampleStatus)) {
                style.setProgressNode("样衣完成");
                style.setCompletedTime(style.getSampleCompletedTime());
                continue;
            }

            if ("IN_PROGRESS".equalsIgnoreCase(sampleStatus)) {
                style.setProgressNode("样衣制作中");
                style.setCompletedTime(null);
                continue;
            }

            if ("COMPLETED".equalsIgnoreCase(patternStatus)) {
                style.setProgressNode("纸样完成");
                style.setCompletedTime(style.getPatternCompletedTime());
                continue;
            }

            if ("IN_PROGRESS".equalsIgnoreCase(patternStatus)) {
                style.setProgressNode("纸样开发中");
                style.setCompletedTime(null);
                continue;
            }

            style.setProgressNode("未开始");
            style.setCompletedTime(null);
        }
    }

    @Override
    public StyleInfo getDetailById(Long id) {
        StyleInfo style = baseMapper.selectOne(
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<StyleInfo>()
                        .eq(StyleInfo::getId, id)
                        .eq(StyleInfo::getStatus, "ENABLED"));
        if (style == null) {
            return null;
        }

        StyleOperationLog reset = styleOperationLogService.lambdaQuery()
                .eq(StyleOperationLog::getStyleId, id)
                .eq(StyleOperationLog::getBizType, "maintenance")
                .eq(StyleOperationLog::getAction, "PATTERN_RESET")
                .orderByDesc(StyleOperationLog::getCreateTime)
                .last("limit 1")
                .one();
        LocalDateTime resetTime = reset != null ? reset.getCreateTime() : null;

        StyleOperationLog start = styleOperationLogService.lambdaQuery()
                .eq(StyleOperationLog::getStyleId, id)
                .eq(StyleOperationLog::getBizType, "pattern")
                .eq(StyleOperationLog::getAction, "PATTERN_START")
                .gt(resetTime != null, StyleOperationLog::getCreateTime, resetTime)
                .orderByDesc(StyleOperationLog::getCreateTime)
                .last("limit 1")
                .one();
        style.setPatternStartTime(start != null ? start.getCreateTime() : null);

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
        } catch (Exception ignored) {
        }

        // 设置进度节点（与列表页逻辑一致）
        String patternStatus = StringUtils.hasText(style.getPatternStatus()) ? style.getPatternStatus().trim() : "";
        String sampleStatus = StringUtils.hasText(style.getSampleStatus()) ? style.getSampleStatus().trim() : "";

        if ("COMPLETED".equalsIgnoreCase(sampleStatus)) {
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
                styleInfo.setStatus("ENABLED");
            }
            // 品类默认值（数据库NOT NULL约束要求）
            if (!StringUtils.hasText(styleInfo.getCategory())) {
                styleInfo.setCategory("未分类");
            }
            styleInfo.setPrice(null);

            // 设计师 = 创建款式的人（自动填充）
            if (!StringUtils.hasText(styleInfo.getSampleNo())) {
                String currentUser = UserContext.username();
                if (StringUtils.hasText(currentUser)) {
                    styleInfo.setSampleNo(currentUser);
                }
            }
        }

        return this.saveOrUpdate(styleInfo);
    }

    @Override
    public boolean deleteById(Long id) {
        StyleInfo styleInfo = new StyleInfo();
        styleInfo.setId(id);
        styleInfo.setStatus("DISABLED");
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
                style = this.getById(Long.parseLong(sid));
            }
        }

        if (style == null && StringUtils.hasText(sno)) {
            style = this.lambdaQuery().eq(StyleInfo::getStyleNo, sno).last("limit 1").one();
        }

        if (style == null) {
            throw new NoSuchElementException("款号不存在");
        }

        String st = style.getStatus() == null ? "" : style.getStatus().trim();
        if (StringUtils.hasText(st) && !"ENABLED".equalsIgnoreCase(st)) {
            throw new IllegalStateException("款号已禁用，无法下单");
        }

        String sampleStatus = style.getSampleStatus() == null ? "" : style.getSampleStatus().trim();
        if (!"COMPLETED".equalsIgnoreCase(sampleStatus)) {
            throw new IllegalStateException("款号资料未完成（样衣未完成），无法下单");
        }

        return style;
    }
}
