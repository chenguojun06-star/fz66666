package com.fashion.supplychain.production.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.production.entity.CuttingBom;
import com.fashion.supplychain.production.entity.CuttingMaterialUsage;
import com.fashion.supplychain.production.entity.CuttingTask;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.MaterialRoll;
import com.fashion.supplychain.production.service.CuttingBomService;
import com.fashion.supplychain.production.service.CuttingMaterialUsageService;
import com.fashion.supplychain.production.service.CuttingTaskService;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.MaterialRollService;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

/**
 * 裁剪用料台账编排（D-823）
 *
 * <p>职责：按「裁剪任务 × 物料」维护 计划 → 领出 → 实际消耗 → 余料 → 回库 全链路，
 * 与采购侧口径（t_material_purchase：到货-已用=剩余）衔接。
 *
 * <p>设计口径（用户业务口径：采购总数量 vs 裁剪实际使用数量，每种物料都有记录）：
 * <ul>
 *   <li>计划量 plannedAmount = BOM单件用量 × 裁剪件数 × (1 + 损耗率)，与库存预警同款公式</li>
 *   <li>领出量 issuedAmount 默认 = 计划量（登记时可按实际领料改）</li>
 *   <li>实际消耗 actualUsed 默认 = 领出量（无余料时一键确认即可）</li>
 *   <li>余料 remnantAmount = 领出 - 实际；> 0 时可回库（复用 manualInbound 入库链路）</li>
 * </ul>
 */
@Component
@Slf4j
public class CuttingMaterialUsageOrchestrator {

    @Autowired
    private CuttingMaterialUsageService usageService;

    @Autowired
    private CuttingBomService cuttingBomService;

    @Autowired
    private CuttingTaskService cuttingTaskService;

    @Autowired
    private MaterialPurchaseService materialPurchaseService;

    @Autowired
    private MaterialRollService materialRollService;

    @Autowired
    private MaterialInboundOrchestrator materialInboundOrchestrator;

    private static final int AMOUNT_SCALE = 4;

    // ==================== 1. 完工快照：从裁剪 BOM 生成台账行 ====================

    /**
     * 裁剪完工（分扎生成）时调用：按 CuttingBom 的每种物料快照生成台账行。
     * 幂等：已有台账行的任务不重复生成（不覆盖用户已登记数据）。
     *
     * ⚠️ 防御性设计：台账是增值功能，任何失败（如迁移未执行导致表不存在）
     * 只记 warn 不上抛——不能因为台账初始化失败拖垮分扎生成主链。
     */
    @Transactional(rollbackFor = Exception.class)
    public void initFromTask(CuttingTask task) {
        if (task == null || !StringUtils.hasText(task.getId())) {
            return;
        }
        try {
            doInitFromTask(task);
        } catch (Exception e) {
            log.warn("裁剪用料台账初始化失败（不影响分扎生成）: taskId={}, err={}",
                    task.getId(), e.getMessage());
        }
    }

    private void doInitFromTask(CuttingTask task) {
        if (task == null || !StringUtils.hasText(task.getId())) {
            return;
        }
        List<CuttingMaterialUsage> existing = usageService.listByCuttingTaskId(task.getId());
        if (existing != null && !existing.isEmpty()) {
            return; // 幂等：已初始化过
        }
        List<CuttingBom> bomList = cuttingBomService.listByCuttingTaskId(task.getId());
        if (bomList == null || bomList.isEmpty()) {
            return; // 无裁剪 BOM（存量任务未初始化）——登记时前端按任务物料兜底
        }
        int cuttingQty = task.getCuttingQuantity() != null && task.getCuttingQuantity() > 0
                ? task.getCuttingQuantity()
                : (task.getOrderQuantity() != null ? task.getOrderQuantity() : 0);

        LocalDateTime now = LocalDateTime.now();
        Long tenantId = task.getTenantId() != null ? task.getTenantId() : UserContext.tenantId();
        List<CuttingMaterialUsage> rows = new ArrayList<>();
        for (CuttingBom bom : bomList) {
            if (!StringUtils.hasText(bom.getMaterialCode())) {
                continue;
            }
            CuttingMaterialUsage row = new CuttingMaterialUsage();
            row.setId(com.baomidou.mybatisplus.core.toolkit.IdWorker.get32UUID());
            row.setCuttingTaskId(task.getId());
            row.setProductionOrderId(task.getProductionOrderId());
            row.setProductionOrderNo(task.getProductionOrderNo());
            row.setStyleNo(task.getStyleNo());
            row.setMaterialCode(bom.getMaterialCode());
            row.setMaterialName(bom.getMaterialName());
            row.setMaterialType(bom.getMaterialType());
            row.setColor(bom.getColor());
            row.setSize(bom.getSpecification());
            row.setUnit(bom.getUnit());
            row.setUnitPrice(bom.getUnitPrice() != null ? bom.getUnitPrice() : BigDecimal.ZERO);
            row.setPlannedAmount(calcPlannedAmount(bom, cuttingQty));
            row.setRemnantAmount(BigDecimal.ZERO);
            row.setRemnantStatus("NONE");
            row.setTenantId(tenantId);
            row.setCreateTime(now);
            row.setUpdateTime(now);
            rows.add(row);
        }
        if (!rows.isEmpty()) {
            usageService.saveBatch(rows);
            log.info("裁剪用料台账初始化: taskId={}, rows={}", task.getId(), rows.size());
        }
    }

    /**
     * 计划量 = 单件用量 × 裁剪件数 × (1 + 损耗率)
     * 与 MaterialStockOrchestrator 库存预警的 perPieceUsage 公式同源（L682-693）。
     */
    private BigDecimal calcPlannedAmount(CuttingBom bom, int cuttingQty) {
        BigDecimal usage = bom.getUsageAmount() == null ? BigDecimal.ZERO : bom.getUsageAmount();
        BigDecimal loss = bom.getLossRate() == null ? BigDecimal.ZERO : bom.getLossRate();
        BigDecimal factor = BigDecimal.ONE.add(loss.movePointLeft(2));
        return usage.multiply(factor)
                .multiply(BigDecimal.valueOf(Math.max(cuttingQty, 0)))
                .setScale(AMOUNT_SCALE, RoundingMode.HALF_UP);
    }

    // ==================== 2. 查询台账 ====================

    /**
     * 查询某裁剪任务的用料台账（含汇总与任务上下文）。
     */
    public Map<String, Object> listByTask(String cuttingTaskId) {
        Map<String, Object> result = new HashMap<>();
        if (!StringUtils.hasText(cuttingTaskId)) {
            result.put("rows", new ArrayList<>());
            return result;
        }
        CuttingTask task = cuttingTaskService.getById(cuttingTaskId.trim());
        if (task == null) {
            throw new IllegalArgumentException("裁剪任务不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(task.getTenantId(), "裁剪任务");

        List<CuttingMaterialUsage> rows = usageService.listByCuttingTaskId(task.getId());
        if (rows == null || rows.isEmpty()) {
            // 兜底：完工快照未生成（如存量任务/无BOM）时，按需现算一次
            initFromTask(task);
            rows = usageService.listByCuttingTaskId(task.getId());
        }
        result.put("rows", rows == null ? new ArrayList<>() : rows);
        result.put("cuttingQuantity", task.getCuttingQuantity());
        result.put("orderQuantity", task.getOrderQuantity());
        result.put("orderNo", task.getProductionOrderNo());
        result.put("styleNo", task.getStyleNo());
        result.put("usageConfirmed", task.getUsageConfirmed());
        result.put("remnantTotal", task.getRemnantTotal());
        return result;
    }

    // ==================== 3. 完工登记：实际消耗 ====================

    /**
     * 登记实际消耗（裁剪完工后按物料行录入）。
     * rows: [{ materialCode, issuedAmount, actualUsed }]
     * - issuedAmount 缺省 = 计划量；actualUsed 缺省 = 领出量（默认无余料，一键确认）
     * - 余料 = 领出 - 实际；> 0 自动置 PENDING 待回库
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> saveActual(String cuttingTaskId, List<Map<String, Object>> rows,
            String operatorId, String operatorName) {
        CuttingTask task = requireTask(cuttingTaskId);
        List<CuttingMaterialUsage> usageRows = usageService.listByCuttingTaskId(task.getId());
        if (usageRows == null || usageRows.isEmpty()) {
            throw new IllegalArgumentException("该任务暂无用料台账（无裁剪BOM或未完工）");
        }
        Map<String, CuttingMaterialUsage> byCode = new LinkedHashMap<>();
        for (CuttingMaterialUsage u : usageRows) {
            byCode.put(u.getMaterialCode(), u);
        }
        if (rows == null) {
            rows = new ArrayList<>();
        }

        LocalDateTime now = LocalDateTime.now();
        BigDecimal remnantTotal = BigDecimal.ZERO;
        int touched = 0;
        for (Map<String, Object> row : rows) {
            String code = str(row.get("materialCode"));
            if (!StringUtils.hasText(code)) {
                continue;
            }
            CuttingMaterialUsage u = byCode.get(code.trim());
            if (u == null) {
                continue; // 非台账物料（如BOM外的领料）暂不纳管
            }
            BigDecimal planned = nz(u.getPlannedAmount());
            BigDecimal issued = dec(row.get("issuedAmount"), planned);
            BigDecimal actual = dec(row.get("actualUsed"), issued);
            if (issued.compareTo(BigDecimal.ZERO) < 0 || actual.compareTo(BigDecimal.ZERO) < 0) {
                throw new IllegalArgumentException("物料「" + u.getMaterialName() + "」数量不能为负");
            }
            if (actual.compareTo(issued) > 0) {
                throw new IllegalArgumentException("物料「" + u.getMaterialName() + "」实际消耗不能大于领出量");
            }
            BigDecimal remnant = issued.subtract(actual).setScale(AMOUNT_SCALE, RoundingMode.HALF_UP);
            u.setIssuedAmount(issued);
            u.setActualUsed(actual);
            u.setRemnantAmount(remnant);
            u.setRemnantStatus(remnant.compareTo(BigDecimal.ZERO) > 0 ? "PENDING" : "NONE");
            u.setUpdateTime(now);
            usageService.updateById(u);
            remnantTotal = remnantTotal.add(remnant);
            touched++;
        }
        if (touched == 0) {
            throw new IllegalArgumentException("没有匹配到台账物料行，请检查物料编码");
        }

        cuttingTaskService.lambdaUpdate()
                .eq(com.fashion.supplychain.production.entity.CuttingTask::getId, task.getId())
                .set(com.fashion.supplychain.production.entity.CuttingTask::getUsageConfirmed, 1)
                .set(com.fashion.supplychain.production.entity.CuttingTask::getRemnantTotal, remnantTotal)
                .update();

        Map<String, Object> result = new HashMap<>();
        result.put("success", true);
        result.put("remnantTotal", remnantTotal);
        result.put("message", remnantTotal.compareTo(BigDecimal.ZERO) > 0
                ? "登记完成，共余料 " + remnantTotal.stripTrailingZeros().toPlainString() + "，可执行回库"
                : "登记完成，无余料");
        return result;
    }

    // ==================== 4. 余料回库 ====================

    /**
     * 余料回库：逐行走 manualInbound 入库链路（写入库单 + 加库存），回写台账状态。
     * rows: [{ materialCode, quantity, warehouseLocation }]；quantity 缺省 = 该行全部余料。
     * 支持部分回库：quantity < 余料时仅扣减余料，状态保持 PENDING。
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> remnantInbound(String cuttingTaskId, List<Map<String, Object>> rows,
            String operatorId, String operatorName) {
        CuttingTask task = requireTask(cuttingTaskId);
        List<CuttingMaterialUsage> usageRows = usageService.listByCuttingTaskId(task.getId());
        if (usageRows == null || usageRows.isEmpty()) {
            throw new IllegalArgumentException("该任务暂无用料台账");
        }
        Map<String, CuttingMaterialUsage> byCode = new LinkedHashMap<>();
        for (CuttingMaterialUsage u : usageRows) {
            byCode.put(u.getMaterialCode(), u);
        }

        List<Map<String, Object>> inboundResults = new ArrayList<>();
        BigDecimal inboundTotal = BigDecimal.ZERO;
        for (Map<String, Object> row : rows == null ? new ArrayList<Map<String, Object>>() : rows) {
            String code = str(row.get("materialCode"));
            if (!StringUtils.hasText(code)) {
                continue;
            }
            CuttingMaterialUsage u = byCode.get(code.trim());
            if (u == null) {
                continue;
            }
            BigDecimal remnant = nz(u.getRemnantAmount());
            BigDecimal quantity = dec(row.get("quantity"), remnant);
            if (quantity.compareTo(BigDecimal.ZERO) <= 0) {
                continue; // 无余料的行跳过（前端不渲染回库按钮，这里双保险）
            }
            if (quantity.compareTo(remnant) > 0) {
                throw new IllegalArgumentException("物料「" + u.getMaterialName() + "」回库数量不能大于余料量");
            }
            String location = str(row.get("warehouseLocation"));
            if (!StringUtils.hasText(location)) {
                location = "默认仓";
            }
            String remark = "裁剪余料回库 · 订单 " + (task.getProductionOrderNo() == null ? "-" : task.getProductionOrderNo())
                    + " · 裁剪单 " + task.getId();
            Map<String, Object> inbound = materialInboundOrchestrator.manualInbound(
                    u.getMaterialCode(),
                    u.getMaterialName(),
                    u.getMaterialType(),
                    u.getColor(),
                    u.getSize(),
                    quantity,
                    location,
                    null, // 余料回库无供应商
                    operatorId,
                    operatorName,
                    remark);

            BigDecimal remaining = remnant.subtract(quantity).setScale(AMOUNT_SCALE, RoundingMode.HALF_UP);
            u.setRemnantAmount(remaining);
            u.setRemnantStatus(remaining.compareTo(BigDecimal.ZERO) > 0 ? "PENDING" : "INBOUNDED");
            u.setRemnantInboundNo(str(inbound.get("inboundNo")));
            u.setUpdateTime(LocalDateTime.now());
            usageService.updateById(u);

            Map<String, Object> item = new HashMap<>();
            item.put("materialCode", u.getMaterialCode());
            item.put("materialName", u.getMaterialName());
            item.put("quantity", quantity);
            item.put("inboundNo", inbound.get("inboundNo"));
            inboundResults.add(item);
            inboundTotal = inboundTotal.add(quantity);
        }
        if (inboundResults.isEmpty()) {
            throw new IllegalArgumentException("没有可回库的余料行");
        }

        // 回写任务余料合计
        BigDecimal remnantTotal = BigDecimal.ZERO;
        for (CuttingMaterialUsage u : usageService.listByCuttingTaskId(task.getId())) {
            remnantTotal = remnantTotal.add(nz(u.getRemnantAmount()));
        }
        cuttingTaskService.lambdaUpdate()
                .eq(com.fashion.supplychain.production.entity.CuttingTask::getId, task.getId())
                .set(com.fashion.supplychain.production.entity.CuttingTask::getRemnantTotal, remnantTotal)
                .update();

        Map<String, Object> result = new HashMap<>();
        result.put("success", true);
        result.put("inbounds", inboundResults);
        result.put("inboundTotal", inboundTotal);
        result.put("remnantTotal", remnantTotal);
        result.put("message", "余料回库完成，共 " + inboundTotal.stripTrailingZeros().toPlainString()
                + "（" + inboundResults.size() + " 项）已入库");
        return result;
    }

    // ==================== 4.5 料卷级登记与余料卷回库（D-826） ====================

    /**
     * 查询某裁剪任务已发料的料卷（按订单号关联），每卷标注匹配的台账行。
     * 卷级登记入口：车间按卷录实际消耗，比任务级总账更细。
     */
    public Map<String, Object> listRolls(String cuttingTaskId) {
        CuttingTask task = requireTask(cuttingTaskId);
        Map<String, Object> result = new HashMap<>();
        if (!StringUtils.hasText(task.getProductionOrderNo())) {
            result.put("rolls", new ArrayList<>());
            return result;
        }
        Long tenantId = UserContext.tenantId();
        List<MaterialRoll> rolls = materialRollService.lambdaQuery()
                .eq(MaterialRoll::getIssuedOrderNo, task.getProductionOrderNo().trim())
                .eq(tenantId != null, MaterialRoll::getTenantId, tenantId)
                .orderByAsc(MaterialRoll::getCreateTime)
                .list();
        List<CuttingMaterialUsage> usageRows = usageService.listByCuttingTaskId(task.getId());
        List<Map<String, Object>> out = new ArrayList<>();
        for (MaterialRoll roll : rolls == null ? List.<MaterialRoll>of() : rolls) {
            CuttingMaterialUsage matched = matchUsageRow(usageRows, roll);
            Map<String, Object> item = new HashMap<>();
            item.put("rollId", roll.getId());
            item.put("rollCode", roll.getRollCode());
            item.put("materialCode", roll.getMaterialCode());
            item.put("materialName", roll.getMaterialName());
            item.put("color", roll.getColor());
            item.put("unit", roll.getUnit());
            item.put("rollQuantity", roll.getQuantity());
            item.put("status", roll.getStatus());
            item.put("usedQuantity", roll.getUsedQuantity());
            item.put("remaining", nz(roll.getQuantity()).subtract(nz(roll.getUsedQuantity())));
            item.put("usageId", matched != null ? matched.getId() : null);
            out.add(item);
        }
        result.put("rolls", out);
        result.put("orderNo", task.getProductionOrderNo());
        return result;
    }

    /**
     * 卷级登记实际消耗。rows: [{ rollId, usedQuantity }]
     * - usedQuantity ∈ [0, 本卷数量]；卷必须属于本订单（issuedOrderNo 匹配）
     * - 有卷关联的台账行：领出 = Σ卷数量（卷是真相源），实际 = Σ卷消耗，余料自动重算
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> saveRollUsage(String cuttingTaskId, List<Map<String, Object>> rows,
            String operatorId, String operatorName) {
        CuttingTask task = requireTask(cuttingTaskId);
        List<CuttingMaterialUsage> usageRows = usageService.listByCuttingTaskId(task.getId());
        if (usageRows == null || usageRows.isEmpty()) {
            throw new IllegalArgumentException("该任务暂无用料台账");
        }
        LocalDateTime now = LocalDateTime.now();
        int touched = 0;
        for (Map<String, Object> row : rows == null ? new ArrayList<Map<String, Object>>() : rows) {
            String rollId = str(row.get("rollId"));
            if (!StringUtils.hasText(rollId)) {
                continue;
            }
            MaterialRoll roll = materialRollService.getById(rollId.trim());
            if (roll == null) {
                throw new IllegalArgumentException("料卷不存在：" + rollId);
            }
            TenantAssert.assertBelongsToCurrentTenant(roll.getTenantId(), "料卷");
            if (StringUtils.hasText(task.getProductionOrderNo())
                    && !task.getProductionOrderNo().trim().equals(String.valueOf(roll.getIssuedOrderNo()).trim())) {
                throw new IllegalArgumentException("料卷「" + roll.getRollCode() + "」不属于本订单，不能登记");
            }
            BigDecimal used = dec(row.get("usedQuantity"), BigDecimal.ZERO);
            BigDecimal rollQty = nz(roll.getQuantity());
            if (used.compareTo(BigDecimal.ZERO) < 0 || used.compareTo(rollQty) > 0) {
                throw new IllegalArgumentException("料卷「" + roll.getRollCode() + "」消耗数量必须在 0 ~ " + rollQty + " 之间");
            }
            CuttingMaterialUsage matched = matchUsageRow(usageRows, roll);
            roll.setUsedQuantity(used);
            roll.setCuttingUsageId(matched != null ? matched.getId() : roll.getCuttingUsageId());
            roll.setUpdateTime(now);
            materialRollService.updateById(roll);
            touched++;
        }
        if (touched == 0) {
            throw new IllegalArgumentException("没有有效的料卷登记行");
        }
        recalcUsageFromRolls(task, usageRows);
        Map<String, Object> result = new HashMap<>();
        result.put("success", true);
        result.put("message", "已登记 " + touched + " 卷的实际消耗");
        return result;
    }

    /**
     * 卷级余料回库：每卷剩余生成「余料卷」（新 rollCode、IN_STOCK、备注来源）
     * + 走手动入库链路加库存 + 扣减台账行余料。rows: [{ rollId, quantity, warehouseLocation }]
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> remnantInboundByRoll(String cuttingTaskId, List<Map<String, Object>> rows,
            String operatorId, String operatorName) {
        CuttingTask task = requireTask(cuttingTaskId);
        List<CuttingMaterialUsage> usageRows = usageService.listByCuttingTaskId(task.getId());
        if (usageRows == null || usageRows.isEmpty()) {
            throw new IllegalArgumentException("该任务暂无用料台账");
        }
        List<Map<String, Object>> results = new ArrayList<>();
        BigDecimal total = BigDecimal.ZERO;
        for (Map<String, Object> row : rows == null ? new ArrayList<Map<String, Object>>() : rows) {
            String rollId = str(row.get("rollId"));
            if (!StringUtils.hasText(rollId)) {
                continue;
            }
            MaterialRoll roll = materialRollService.getById(rollId.trim());
            if (roll == null) {
                throw new IllegalArgumentException("料卷不存在：" + rollId);
            }
            TenantAssert.assertBelongsToCurrentTenant(roll.getTenantId(), "料卷");
            BigDecimal remaining = nz(roll.getQuantity()).subtract(nz(roll.getUsedQuantity()));
            BigDecimal quantity = dec(row.get("quantity"), remaining);
            if (quantity.compareTo(BigDecimal.ZERO) <= 0) {
                continue;
            }
            if (quantity.compareTo(remaining) > 0) {
                throw new IllegalArgumentException("料卷「" + roll.getRollCode() + "」回库数量不能大于剩余 " + remaining);
            }
            String location = str(row.get("warehouseLocation"));
            if (!StringUtils.hasText(location)) {
                location = StringUtils.hasText(roll.getWarehouseLocation()) ? roll.getWarehouseLocation() : "默认仓";
            }

            // 1) 生成余料卷（实物标签，可再扫码流转）
            MaterialRoll remnant = new MaterialRoll();
            remnant.setId(com.baomidou.mybatisplus.core.toolkit.IdWorker.get32UUID());
            remnant.setRollCode(materialRollService.generateRollCode());
            remnant.setMaterialCode(roll.getMaterialCode());
            remnant.setMaterialName(roll.getMaterialName());
            remnant.setMaterialType(roll.getMaterialType());
            remnant.setColor(roll.getColor());
            remnant.setSpecifications(roll.getSpecifications());
            remnant.setUnit(roll.getUnit());
            remnant.setQuantity(quantity);
            remnant.setStatus("IN_STOCK");
            remnant.setWarehouseLocation(location);
            remnant.setSupplierName(roll.getSupplierName());
            remnant.setCuttingUsageId(roll.getCuttingUsageId());
            remnant.setRemark("余料 · 来源 " + roll.getRollCode()
                    + (StringUtils.hasText(task.getProductionOrderNo()) ? " · 订单 " + task.getProductionOrderNo() : ""));
            remnant.setTenantId(roll.getTenantId());
            remnant.setCreatorId(operatorId);
            remnant.setCreatorName(operatorName);
            remnant.setCreateTime(LocalDateTime.now());
            remnant.setUpdateTime(LocalDateTime.now());
            materialRollService.save(remnant);

            // 2) 入库（库存账）+ 台账扣减
            materialInboundOrchestrator.manualInbound(
                    roll.getMaterialCode(), roll.getMaterialName(), roll.getMaterialType(),
                    roll.getColor(), roll.getSpecifications(), quantity, location,
                    roll.getSupplierName(), operatorId, operatorName,
                    "裁剪余料回库 · 来源卷 " + roll.getRollCode()
                            + (StringUtils.hasText(task.getProductionOrderNo()) ? " · 订单 " + task.getProductionOrderNo() : ""));

            if (StringUtils.hasText(roll.getCuttingUsageId())) {
                CuttingMaterialUsage usage = usageService.getById(roll.getCuttingUsageId());
                if (usage != null) {
                    BigDecimal newRemnant = nz(usage.getRemnantAmount()).subtract(quantity)
                            .max(BigDecimal.ZERO).setScale(AMOUNT_SCALE, RoundingMode.HALF_UP);
                    usage.setRemnantAmount(newRemnant);
                    usage.setRemnantStatus(newRemnant.compareTo(BigDecimal.ZERO) > 0 ? "PENDING" : "INBOUNDED");
                    usage.setUpdateTime(LocalDateTime.now());
                    usageService.updateById(usage);
                }
            }

            Map<String, Object> item = new HashMap<>();
            item.put("rollCode", roll.getRollCode());
            item.put("materialName", roll.getMaterialName());
            item.put("quantity", quantity);
            item.put("remnantRollCode", remnant.getRollCode());
            results.add(item);
            total = total.add(quantity);
        }
        if (results.isEmpty()) {
            throw new IllegalArgumentException("没有可回库的料卷");
        }

        // 重算任务余料合计
        BigDecimal remnantTotal = BigDecimal.ZERO;
        for (CuttingMaterialUsage u : usageService.listByCuttingTaskId(task.getId())) {
            remnantTotal = remnantTotal.add(nz(u.getRemnantAmount()));
        }
        cuttingTaskService.lambdaUpdate()
                .eq(com.fashion.supplychain.production.entity.CuttingTask::getId, task.getId())
                .set(com.fashion.supplychain.production.entity.CuttingTask::getRemnantTotal, remnantTotal)
                .update();

        Map<String, Object> result = new HashMap<>();
        result.put("success", true);
        result.put("inbounds", results);
        result.put("inboundTotal", total);
        result.put("remnantTotal", remnantTotal);
        result.put("message", "余料回库完成，共 " + total.stripTrailingZeros().toPlainString()
                + "（" + results.size() + " 卷）已生成余料卷并入账");
        return result;
    }

    /** 台账行 ↔ 料卷匹配：物料编码 + 颜色（尺码卷级通常不分） */
    private CuttingMaterialUsage matchUsageRow(List<CuttingMaterialUsage> usageRows, MaterialRoll roll) {
        if (usageRows == null || roll == null) {
            return null;
        }
        String code = String.valueOf(roll.getMaterialCode() == null ? "" : roll.getMaterialCode()).trim();
        String color = String.valueOf(roll.getColor() == null ? "" : roll.getColor()).trim();
        for (CuttingMaterialUsage u : usageRows) {
            if (code.equals(String.valueOf(u.getMaterialCode() == null ? "" : u.getMaterialCode()).trim())
                    && color.equals(String.valueOf(u.getColor() == null ? "" : u.getColor()).trim())) {
                return u;
            }
        }
        // 降级：仅按物料编码匹配（颜色不一致时至少不错账）
        for (CuttingMaterialUsage u : usageRows) {
            if (code.equals(String.valueOf(u.getMaterialCode() == null ? "" : u.getMaterialCode()).trim())) {
                return u;
            }
        }
        return null;
    }

    /**
     * 按卷重算台账行：有卷关联的行，领出 = Σ卷数量（卷是真相源）、实际 = Σ卷消耗。
     * 无卷关联的行保持任务级登记值不动。
     */
    private void recalcUsageFromRolls(CuttingTask task, List<CuttingMaterialUsage> usageRows) {
        Long tenantId = UserContext.tenantId();
        List<MaterialRoll> rolls = materialRollService.lambdaQuery()
                .eq(MaterialRoll::getIssuedOrderNo, task.getProductionOrderNo())
                .eq(tenantId != null, MaterialRoll::getTenantId, tenantId)
                .list();
        if (rolls == null) {
            rolls = new ArrayList<>();
        }
        LocalDateTime now = LocalDateTime.now();
        BigDecimal remnantTotal = BigDecimal.ZERO;
        for (CuttingMaterialUsage u : usageRows) {
            BigDecimal issued = BigDecimal.ZERO;
            BigDecimal actual = BigDecimal.ZERO;
            boolean hasRoll = false;
            for (MaterialRoll roll : rolls) {
                CuttingMaterialUsage matched = matchUsageRow(java.util.Collections.singletonList(u), roll);
                if (matched == null || !matched.getId().equals(u.getId())) {
                    continue;
                }
                hasRoll = true;
                issued = issued.add(nz(roll.getQuantity()));
                actual = actual.add(nz(roll.getUsedQuantity()));
            }
            if (hasRoll) {
                BigDecimal remnant = issued.subtract(actual).max(BigDecimal.ZERO)
                        .setScale(AMOUNT_SCALE, RoundingMode.HALF_UP);
                u.setIssuedAmount(issued);
                u.setActualUsed(actual);
                u.setRemnantAmount(remnant);
                // 已回库过的不降级（INBOUNDED → 保持，除非又有新余料）
                if (!"INBOUNDED".equals(u.getRemnantStatus()) || remnant.compareTo(BigDecimal.ZERO) > 0) {
                    u.setRemnantStatus(remnant.compareTo(BigDecimal.ZERO) > 0 ? "PENDING" : "NONE");
                }
                u.setUpdateTime(now);
                usageService.updateById(u);
            }
            remnantTotal = remnantTotal.add(nz(u.getRemnantAmount()));
        }
        cuttingTaskService.lambdaUpdate()
                .eq(com.fashion.supplychain.production.entity.CuttingTask::getId, task.getId())
                .set(com.fashion.supplychain.production.entity.CuttingTask::getRemnantTotal, remnantTotal)
                .update();
    }

    // ==================== 5. 全链路汇总（采购 ↔ 裁剪穿透，P1 数据源） ====================

    /**
     * 按「订单号 + 物料编码」汇总全链路：采购 → 到货 → 本单领出(采购侧已用) →
     * 裁剪计划 → 裁剪实际消耗 → 余料 → 已回库。
     */
    public Map<String, Object> chainSummary(String orderNo, String materialCode) {
        Map<String, Object> result = new HashMap<>();
        if (!StringUtils.hasText(orderNo)) {
            throw new IllegalArgumentException("订单号不能为空");
        }
        Long tenantId = UserContext.tenantId();
        List<MaterialPurchase> purchases = materialPurchaseService.lambdaQuery()
                .eq(MaterialPurchase::getOrderNo, orderNo.trim())
                .eq(StringUtils.hasText(materialCode), MaterialPurchase::getMaterialCode,
                        materialCode == null ? null : materialCode.trim())
                .eq(tenantId != null, MaterialPurchase::getTenantId, tenantId)
                .list();
        BigDecimal purchaseQty = BigDecimal.ZERO;
        BigDecimal arrivedQty = BigDecimal.ZERO;
        BigDecimal usedQty = BigDecimal.ZERO;
        BigDecimal returnQty = BigDecimal.ZERO;
        for (MaterialPurchase p : purchases) {
            purchaseQty = purchaseQty.add(nz(p.getPurchaseQuantity()));
            arrivedQty = arrivedQty.add(nz(p.getArrivedQuantity()));
            usedQty = usedQty.add(nz(p.getUsedQuantity()));
            returnQty = returnQty.add(nz(p.getReturnQuantity()));
        }
        result.put("purchaseQuantity", purchaseQty);
        result.put("arrivedQuantity", arrivedQty);
        result.put("usedQuantity", usedQty);   // 采购侧口径：仓库确认出库时累加
        result.put("returnQuantity", returnQty);
        result.put("purchaseRemaining", arrivedQty.subtract(usedQty)); // 采购侧剩余 = 到货 - 已用

        // 裁剪侧：该订单全部裁剪任务的台账汇总
        List<CuttingTask> tasks = cuttingTaskService.lambdaQuery()
                .eq(CuttingTask::getProductionOrderNo, orderNo.trim())
                .eq(tenantId != null, CuttingTask::getTenantId, tenantId)
                .list();
        BigDecimal planned = BigDecimal.ZERO;
        BigDecimal issued = BigDecimal.ZERO;
        BigDecimal actual = BigDecimal.ZERO;
        BigDecimal remnant = BigDecimal.ZERO;
        BigDecimal inbounded = BigDecimal.ZERO;
        for (CuttingTask t : tasks) {
            for (CuttingMaterialUsage u : usageService.listByCuttingTaskId(t.getId())) {
                if (StringUtils.hasText(materialCode) && !materialCode.trim().equals(u.getMaterialCode())) {
                    continue;
                }
                planned = planned.add(nz(u.getPlannedAmount()));
                issued = issued.add(nz(u.getIssuedAmount()));
                actual = actual.add(nz(u.getActualUsed()));
                remnant = remnant.add(nz(u.getRemnantAmount()));
                if ("INBOUNDED".equals(u.getRemnantStatus())) {
                    inbounded = inbounded.add(nz(u.getIssuedAmount()).subtract(nz(u.getActualUsed())));
                }
            }
        }
        result.put("cuttingPlanned", planned);
        result.put("cuttingIssued", issued);
        result.put("cuttingActualUsed", actual);
        result.put("cuttingRemnant", remnant);
        result.put("remnantInbounded", inbounded);
        return result;
    }

    // ==================== 内部工具 ====================

    private CuttingTask requireTask(String cuttingTaskId) {
        if (!StringUtils.hasText(cuttingTaskId)) {
            throw new IllegalArgumentException("裁剪任务ID不能为空");
        }
        CuttingTask task = cuttingTaskService.getById(cuttingTaskId.trim());
        if (task == null) {
            throw new IllegalArgumentException("裁剪任务不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(task.getTenantId(), "裁剪任务");
        return task;
    }

    private static BigDecimal nz(BigDecimal v) {
        return v == null ? BigDecimal.ZERO : v;
    }

    private static String str(Object v) {
        return v == null ? null : String.valueOf(v).trim();
    }

    private static BigDecimal dec(Object v, BigDecimal fallback) {
        if (v == null || String.valueOf(v).trim().isEmpty()) {
            return fallback;
        }
        try {
            return new BigDecimal(String.valueOf(v).trim()).setScale(AMOUNT_SCALE, RoundingMode.HALF_UP);
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("数量格式不正确: " + v);
        }
    }
}
