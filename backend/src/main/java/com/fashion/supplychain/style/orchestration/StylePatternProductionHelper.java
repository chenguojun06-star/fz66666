package com.fashion.supplychain.style.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.PatternProduction;
import com.fashion.supplychain.production.helper.SampleOrderCreationHelper;
import com.fashion.supplychain.production.service.PatternProductionService;
import com.fashion.supplychain.style.entity.StyleInfo;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.util.StringUtils;

/**
 * 样板生产记录的自动创建与同步 — 从 StyleInfoOrchestrator 拆出
 *
 * ★ 多色多码拆分（P0 修复）：
 *   旧实现一个款式只创建 1 条 PatternProduction（color=第一个颜色，size=全码拼接串），
 *   导致 2色×11码 的样衣共享一个 progressNodes——扫一个色码全部色码跟着完成。
 *   新实现按 sizeColorConfig 的色码矩阵拆分：每个 颜色×码数 = 1 条独立生产任务
 *   （独立进度、独立二维码、独立扫码记录）。
 *   存量兼容：更新款式时 syncPatternProductionInfo 会把老单条记录"改写"为第一个
 *   色码组合（保留已有进度/领取人），并为缺失的色码补建记录。
 */
@Component
@Slf4j
public class StylePatternProductionHelper {

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    /** progressNodes 初始值（全部 0%） */
    private static final String INIT_PROGRESS_NODES = "{\"cutting\":0,\"sewing\":0,\"ironing\":0,\"quality\":0,\"secondary\":0,\"packaging\":0}";

    @Autowired
    private PatternProductionService patternProductionService;

    @Autowired
    private SampleOrderCreationHelper sampleOrderCreationHelper;

    @Autowired
    private PlatformTransactionManager transactionManager;

    private TransactionTemplate requiresNewTx;

    @PostConstruct
    private void initRequiresNewTx() {
        requiresNewTx = new TransactionTemplate(transactionManager);
        requiresNewTx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    // ==================== 色码矩阵解析 ====================

    /**
     * 解析 sizeColorConfig → 有序色码矩阵
     * key = "颜色|码数"，value = 该色码数量
     * 解析失败/无配置时返回空 Map（调用方退化为旧单条逻辑）
     */
    private LinkedHashMap<String, Integer> parseColorSizeMatrix(StyleInfo styleInfo) {
        LinkedHashMap<String, Integer> matrix = new LinkedHashMap<>();
        String config = styleInfo.getSizeColorConfig();
        if (!StringUtils.hasText(config)) {
            return matrix;
        }
        try {
            Map<String, Object> parsed = OBJECT_MAPPER.readValue(config, new TypeReference<Map<String, Object>>() {});
            List<String> sizes = extractList(parsed.get("sizes"));

            // 路径1：matrixRows（每色一行，quantities 按 sizes 顺序）
            Object rowsRaw = parsed.get("matrixRows");
            if (rowsRaw instanceof List<?> rows) {
                for (Object item : rows) {
                    if (!(item instanceof Map<?, ?> row)) {
                        continue;
                    }
                    String color = row.get("color") == null ? "" : String.valueOf(row.get("color")).trim();
                    Object quantitiesRaw = row.get("quantities");
                    if (!StringUtils.hasText(color) || !(quantitiesRaw instanceof List<?> quantities)) {
                        continue;
                    }
                    for (int i = 0; i < sizes.size(); i++) {
                        int qty = i < quantities.size() ? parseIntSafe(quantities.get(i)) : 0;
                        if (qty > 0) {
                            matrix.put(color + "|" + sizes.get(i), qty);
                        }
                    }
                }
            }
            if (!matrix.isEmpty()) {
                return matrix;
            }

            // 路径2：顶层单色 + quantities（无 matrix 的退化结构）
            List<String> colors = extractList(parsed.get("colors"));
            String color = colors.isEmpty()
                    ? (StringUtils.hasText(styleInfo.getColor()) ? styleInfo.getColor().trim() : extractFirstColor(parsed))
                    : colors.get(0);
            if (!StringUtils.hasText(color)) {
                return matrix;
            }
            Object topQuantitiesRaw = parsed.get("quantities");
            if (topQuantitiesRaw instanceof List<?> topQuantities) {
                for (int i = 0; i < sizes.size(); i++) {
                    int qty = i < topQuantities.size() ? parseIntSafe(topQuantities.get(i)) : 0;
                    if (qty > 0) {
                        matrix.put(color + "|" + sizes.get(i), qty);
                    }
                }
            }
        } catch (Exception e) {
            log.warn("解析 sizeColorConfig 失败（退化为旧单条逻辑）: styleId={}, err={}", styleInfo.getId(), e.getMessage());
        }
        return matrix;
    }

    private List<String> extractList(Object raw) {
        List<String> result = new ArrayList<>();
        if (raw instanceof List<?> list) {
            for (Object item : list) {
                String text = item == null ? "" : String.valueOf(item).trim();
                if (!text.isEmpty()) {
                    result.add(text);
                }
            }
        }
        return result;
    }

    private String extractFirstColor(Map<String, Object> parsed) {
        Object raw = parsed.get("color");
        return raw == null ? "" : String.valueOf(raw).trim();
    }

    private int parseIntSafe(Object value) {
        if (value == null) {
            return 0;
        }
        try {
            return (int) Double.parseDouble(String.valueOf(value).trim());
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    /** color|size key → color */
    private String keyColor(String key) {
        int idx = key.indexOf('|');
        return idx > 0 ? key.substring(0, idx) : key;
    }

    /** color|size key → size */
    private String keySize(String key) {
        int idx = key.indexOf('|');
        return idx > 0 ? key.substring(idx + 1) : key;
    }

    // ==================== 创建 ====================

    /**
     * 款式保存时自动创建样板生产记录。
     * 多色多码：按 sizeColorConfig 矩阵拆分，每个 颜色×码数 一条独立记录；
     * 无矩阵配置时退化为旧单条逻辑（color=款式第一色，size=全码串）。
     */
    public void createPatternProductionRecord(StyleInfo styleInfo) {
        if (styleInfo == null || styleInfo.getId() == null) {
            return;
        }

        long existingCount = patternProductionService.lambdaQuery()
                .eq(PatternProduction::getStyleId, String.valueOf(styleInfo.getId()))
                .count();

        if (existingCount > 0) {
            log.info("样板生产记录已存在，跳过自动创建: styleId={}", styleInfo.getId());
            return;
        }

        LinkedHashMap<String, Integer> matrix = parseColorSizeMatrix(styleInfo);
        if (matrix.isEmpty()) {
            // 退化：无色码矩阵 → 旧单条逻辑
            createOnePattern(styleInfo, null, null, defaultQuantity(styleInfo));
            return;
        }

        for (Map.Entry<String, Integer> entry : matrix.entrySet()) {
            createOnePattern(styleInfo, keyColor(entry.getKey()), keySize(entry.getKey()), entry.getValue());
        }
        log.info("[多色多码拆分] 创建样板生产记录: styleId={}, colorSizeCombos={}", styleInfo.getId(), matrix.size());
    }

    private int defaultQuantity(StyleInfo styleInfo) {
        Integer quantity = styleInfo.getSampleQuantity();
        return (quantity == null || quantity == 0) ? 1 : quantity;
    }

    /**
     * 创建单条样板生产记录。color/size 为 null 时用旧兜底值（第一色/全码串）。
     */
    private void createOnePattern(StyleInfo styleInfo, String color, String size, int quantity) {
        PatternProduction patternProduction = new PatternProduction();
        patternProduction.setStyleId(String.valueOf(styleInfo.getId()));
        patternProduction.setStyleNo(styleInfo.getStyleNo());

        patternProduction.setColor(StringUtils.hasText(color) ? color
                : (StringUtils.hasText(styleInfo.getColor()) ? styleInfo.getColor() : "-"));
        patternProduction.setSize(StringUtils.hasText(size) ? size
                : (StringUtils.hasText(styleInfo.getSize()) ? styleInfo.getSize() : "均码"));
        patternProduction.setQuantity(Math.max(quantity, 1));

        patternProduction.setReleaseTime(styleInfo.getCreateTime());
        patternProduction.setDeliveryTime(styleInfo.getDeliveryDate());
        patternProduction.setStatus("PENDING");
        patternProduction.setProgressNodes(INIT_PROGRESS_NODES);
        patternProduction.setCreateTime(LocalDateTime.now());
        patternProduction.setUpdateTime(LocalDateTime.now());
        patternProduction.setHasSecondaryProcess(1);

        UserContext ctx = UserContext.get();
        if (ctx != null) {
            patternProduction.setCreateBy(ctx.getUsername());
        }

        boolean saved = patternProductionService.save(patternProduction);
        if (saved) {
            log.info("自动创建样板生产记录成功: styleId={}, styleNo={}, patternId={}, color={}, size={}, quantity={}",
                    styleInfo.getId(), styleInfo.getStyleNo(), patternProduction.getId(),
                    patternProduction.getColor(), patternProduction.getSize(), patternProduction.getQuantity());

            registerSampleOrderCreation(patternProduction.getId());
        }
    }

    /**
     * 事务提交后自动创建样衣生产订单+菲号+QR码（每条色码记录独立订单）
     */
    private void registerSampleOrderCreation(String patternId) {
        UserContext savedCtx = UserContext.get();
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    try {
                        if (savedCtx != null) {
                            UserContext.set(savedCtx);
                        }
                        var orderResult = requiresNewTx.execute(status -> sampleOrderCreationHelper.createSampleProductionOrder(patternId));
                        log.info("[样衣创建] 自动创建生产订单+菲号+QR码: patternId={}, orderId={}",
                                patternId, orderResult.get("orderId"));
                    } catch (Exception e) {
                        log.warn("[样衣创建] 自动创建生产订单失败（不影响样板记录创建）: patternId={}", patternId, e);
                    } finally {
                        UserContext.clear();
                    }
                }
            });
        } else {
            try {
                var orderResult = requiresNewTx.execute(status -> sampleOrderCreationHelper.createSampleProductionOrder(patternId));
                log.info("[样衣创建] 自动创建生产订单+菲号+QR码: patternId={}, orderId={}",
                        patternId, orderResult.get("orderId"));
            } catch (Exception e) {
                log.warn("[样衣创建] 自动创建生产订单失败（不影响样板记录创建）: patternId={}", patternId, e);
            }
        }
    }

    // ==================== 同步（款式更新时） ====================

    /**
     * 款式更新时同步样板生产记录 → 按色码矩阵增删同步：
     * - 色码组合仍存在 → 更新数量/交期
     * - 新增色码组合 → 创建记录（优先"改写"老汇总记录以保留进度）
     * - 配置已删除的色码 → 无进度则软删，有进度保留
     * - 无矩阵配置 → 旧逻辑（全量覆盖 color/quantity/交期）
     */
    public void syncPatternProductionInfo(StyleInfo styleInfo) {
        if (styleInfo == null || styleInfo.getId() == null) {
            return;
        }

        LambdaQueryWrapper<PatternProduction> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(PatternProduction::getStyleId, String.valueOf(styleInfo.getId()))
                .eq(PatternProduction::getDeleteFlag, 0);

        List<PatternProduction> records = patternProductionService.list(wrapper);
        if (records == null || records.isEmpty()) {
            // 款式存在但无样衣生产记录（历史创建失败/旧版本遗漏，如 CI 停摆期间创建的款式）
            // → 补建记录（createPatternProductionRecord 自带幂等检查）
            log.info("款式无样衣生产记录，保存时补建: styleId={}, styleNo={}", styleInfo.getId(), styleInfo.getStyleNo());
            createPatternProductionRecord(styleInfo);
            return;
        }

        LinkedHashMap<String, Integer> matrix = parseColorSizeMatrix(styleInfo);
        if (matrix.isEmpty()) {
            syncLegacy(styleInfo, records);
            return;
        }

        // 1. 现有记录按 色码key 分组；匹配不上的进 legacy（老汇总记录/配置已删色码）
        Map<String, PatternProduction> matched = new LinkedHashMap<>();
        List<PatternProduction> legacy = new ArrayList<>();
        for (PatternProduction record : records) {
            String key = record.getColor() + "|" + record.getSize();
            if (matrix.containsKey(key) && !matched.containsKey(key)) {
                matched.put(key, record);
            } else {
                legacy.add(record);
            }
        }

        int created = 0;
        int updated = 0;
        int reused = 0;
        // 需要批量落库的记录（matched + 从 legacy 改写的 reused，二者都要持久化）
        List<PatternProduction> toUpdate = new ArrayList<>();

        // 2. 逐个色码组合同步
        for (Map.Entry<String, Integer> entry : matrix.entrySet()) {
            String key = entry.getKey();
            int qty = Math.max(entry.getValue(), 1);
            PatternProduction record = matched.get(key);

            if (record == null && !legacy.isEmpty()) {
                // 改写老汇总记录为该色码（保留进度/领取人/审核状态）
                record = legacy.remove(0);
                reused++;
            }

            if (record == null) {
                // 新建该色码记录
                record = new PatternProduction();
                record.setStyleId(String.valueOf(styleInfo.getId()));
                record.setStyleNo(styleInfo.getStyleNo());
                record.setStatus("PENDING");
                record.setProgressNodes(INIT_PROGRESS_NODES);
                record.setCreateTime(LocalDateTime.now());
                record.setHasSecondaryProcess(1);
                UserContext ctx = UserContext.get();
                if (ctx != null) {
                    record.setCreateBy(ctx.getUsername());
                }
                record.setColor(keyColor(key));
                record.setSize(keySize(key));
                record.setQuantity(qty);
                record.setDeliveryTime(styleInfo.getDeliveryDate());
                record.setUpdateTime(LocalDateTime.now());
                patternProductionService.save(record);
                registerSampleOrderCreation(record.getId());
                created++;
            } else {
                record.setColor(keyColor(key));
                record.setSize(keySize(key));
                record.setQuantity(qty);
                record.setDeliveryTime(styleInfo.getDeliveryDate());
                record.setUpdateTime(LocalDateTime.now());
                updated++;
                toUpdate.add(record);
            }
        }

        // 3. 剩余 legacy = 配置已删除的色码：无进度软删，有进度保留
        int removed = 0;
        Iterator<PatternProduction> it = legacy.iterator();
        while (it.hasNext()) {
            PatternProduction leftover = it.next();
            if (!hasAnyProgress(leftover)) {
                leftover.setDeleteFlag(1);
                leftover.setUpdateTime(LocalDateTime.now());
                patternProductionService.updateById(leftover);
                removed++;
            }
        }

        if (!toUpdate.isEmpty() && patternProductionService.updateBatchById(toUpdate)) {
            log.info("[多色多码同步] styleId={}, combos={}, updated={}, reused={}, created={}, removed={}, keptWithProgress={}",
                    styleInfo.getId(), matrix.size(), updated, reused, created, removed, legacy.size() - removed);
        }
    }

    /** 记录是否有任何生产进度（领取/扫码/完成） */
    private boolean hasAnyProgress(PatternProduction record) {
        if (StringUtils.hasText(record.getReceiver())) {
            return true;
        }
        String status = record.getStatus();
        if (StringUtils.hasText(status) && !"PENDING".equals(status.trim().toUpperCase())) {
            return true;
        }
        return false;
    }

    /** 旧逻辑：无色码矩阵时全量覆盖（兼容存量数据） */
    private void syncLegacy(StyleInfo styleInfo, List<PatternProduction> records) {
        String color = styleInfo.getColor();
        if (!StringUtils.hasText(color)) {
            color = "-";
        }
        Integer quantity = styleInfo.getSampleQuantity();
        if (quantity == null || quantity == 0) {
            quantity = 1;
        }

        for (PatternProduction record : records) {
            record.setColor(color);
            record.setQuantity(quantity);
            record.setDeliveryTime(styleInfo.getDeliveryDate());
            record.setUpdateTime(LocalDateTime.now());
        }

        boolean updatedFlag = patternProductionService.updateBatchById(records);
        if (updatedFlag) {
            log.info("同步样板生产记录成功（旧逻辑）: styleId={}, recordCount={}, color={}, quantity={}",
                    styleInfo.getId(), records.size(), color, quantity);
        }
    }
}
