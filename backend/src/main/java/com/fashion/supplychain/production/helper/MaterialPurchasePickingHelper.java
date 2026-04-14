package com.fashion.supplychain.production.helper;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Objects;
import java.util.stream.Collectors;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.fashion.supplychain.common.ParamUtils;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.constant.MaterialConstants;
import com.fashion.supplychain.production.entity.MaterialOutboundLog;
import com.fashion.supplychain.production.entity.MaterialPicking;
import com.fashion.supplychain.production.entity.MaterialPickingItem;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.MaterialStock;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.mapper.MaterialOutboundLogMapper;
import com.fashion.supplychain.production.orchestration.MaterialPurchaseOrchestratorHelper;
import com.fashion.supplychain.production.orchestration.ProductionOrderOrchestrator;
import com.fashion.supplychain.production.service.MaterialPickingService;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.MaterialStockService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.finance.entity.DeductionItem;
import com.fashion.supplychain.finance.entity.ShipmentReconciliation;
import com.fashion.supplychain.finance.mapper.DeductionItemMapper;
import com.fashion.supplychain.finance.service.ShipmentReconciliationService;
import com.fashion.supplychain.warehouse.entity.MaterialPickupRecord;
import com.fashion.supplychain.warehouse.mapper.MaterialPickupRecordMapper;
import com.fashion.supplychain.warehouse.orchestration.MaterialPickupOrchestrator;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

/**
 * 物料采购 — 领料/出库/仓库确认 相关方法
 * 从 MaterialPurchaseOrchestrator 拆分而来，减少主编排器行数
 */
@Component
@Slf4j
public class MaterialPurchasePickingHelper {

    @Autowired
    private MaterialPurchaseService materialPurchaseService;

    @Autowired
    private MaterialStockService materialStockService;

    @Autowired
    private MaterialPickingService materialPickingService;

    @Autowired
    private MaterialOutboundLogMapper materialOutboundLogMapper;

    @Autowired
    private MaterialPickupOrchestrator materialPickupOrchestrator;

    @Autowired
    private MaterialPickupRecordMapper materialPickupRecordMapper;

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private MaterialPurchaseOrchestratorHelper helper;

    @Autowired
    private ProductionOrderOrchestrator productionOrderOrchestrator;

    @Autowired
    private ShipmentReconciliationService shipmentReconciliationService;

    @Autowired
    private DeductionItemMapper deductionItemMapper;

    // ──────────────────────────────────────────────────────────────
    // 智能一键领取
    // ──────────────────────────────────────────────────────────────

    /**
     * 智能一键领取全部（优先使用库存，不足时创建采购）
     * @param body 包含 orderNo(订单号), receiverId, receiverName
     * @return 汇总结果 { outboundCount, purchaseCount, details }
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> smartReceiveAll(Map<String, Object> body) {
        String orderNo = body == null ? null
            : (body.get("orderNo") == null ? null : String.valueOf(body.get("orderNo")).trim());
        String receiverId = body == null ? null
            : (body.get("receiverId") == null ? null : String.valueOf(body.get("receiverId")).trim());
        String receiverName = body == null ? null
            : (body.get("receiverName") == null ? null : String.valueOf(body.get("receiverName")).trim());

        if (!StringUtils.hasText(orderNo)) {
            throw new IllegalArgumentException("订单号不能为空");
        }
        if (!StringUtils.hasText(receiverId) && !StringUtils.hasText(receiverName)) {
            throw new IllegalArgumentException("领取人ID或姓名不能为空");
        }

        // 1. 查询订单的所有待处理采购任务
        List<MaterialPurchase> pendingPurchases = materialPurchaseService.lambdaQuery()
            .eq(MaterialPurchase::getOrderNo, orderNo)
            .eq(MaterialPurchase::getDeleteFlag, 0)
            .eq(MaterialPurchase::getStatus, MaterialConstants.STATUS_PENDING)
            .list();

        if (pendingPurchases.isEmpty()) {
            Map<String, Object> result = new java.util.LinkedHashMap<>();
            result.put("outboundCount", 0);
            result.put("purchaseCount", 0);
            result.put("message", "无待处理的采购任务");
            return result;
        }

        int outboundCount = 0;  // 走出库的数量
        int purchaseCount = 0;  // 保持采购的数量
        List<Map<String, Object>> details = new ArrayList<>();

        // 2. 遍历每个采购任务，智能分发
        for (MaterialPurchase purchase : pendingPurchases) {
            String materialCode = purchase.getMaterialCode();
            String color = purchase.getColor();
            String size = purchase.getSize();
            int requiredQty = purchase.getPurchaseQuantity() != null ? purchase.getPurchaseQuantity().intValue() : 0;

            // 2.1 查询库存（按 materialCode + color + size 匹配）
            LambdaQueryWrapper<MaterialStock> stockWrapper = new LambdaQueryWrapper<>();
            stockWrapper.eq(MaterialStock::getMaterialCode, materialCode);
            if (StringUtils.hasText(color)) {
                stockWrapper.eq(MaterialStock::getColor, color);
            }
            if (StringUtils.hasText(size)) {
                stockWrapper.eq(MaterialStock::getSize, size);
            }

            List<MaterialStock> stockList = materialStockService.list(stockWrapper);

            // 计算可用库存（总库存 - 锁定库存）
            int availableStock = stockList.stream()
                .mapToInt(stock -> {
                    int qty = stock.getQuantity() != null ? stock.getQuantity() : 0;
                    int locked = stock.getLockedQuantity() != null ? stock.getLockedQuantity() : 0;
                    return Math.max(0, qty - locked);
                })
                .sum();

            Map<String, Object> detail = new java.util.LinkedHashMap<>();
            detail.put("materialCode", materialCode);
            detail.put("materialName", purchase.getMaterialName());
            detail.put("color", color);
            detail.put("size", size);
            detail.put("requiredQty", requiredQty);
            detail.put("availableStock", availableStock);

            // 2.2 判断：有足够库存 → 出库，否则 → 采购
            if (availableStock >= requiredQty && !stockList.isEmpty()) {
                // ✅ 走出库流程
                try {
                    createOutboundPicking(purchase, receiverId, receiverName, stockList);
                    outboundCount++;
                    detail.put("action", "outbound");
                    detail.put("status", "success");
                } catch (Exception e) {
                    log.error("创建出库单失败: materialCode={}, error={}", materialCode, e.getMessage());
                    detail.put("action", "outbound");
                    detail.put("status", "failed");
                    detail.put("error", e.getMessage());
                }
            } else if (availableStock > 0 && !stockList.isEmpty()) {
                // 🔄 部分出库：有多少领多少，不足部分创建新采购任务
                try {
                    createOutboundPicking(purchase, receiverId, receiverName, stockList, availableStock);
                    outboundCount++;
                    int deficitQty = requiredQty - availableStock;
                    // 为不足部分补建新采购任务（status=pending，等待外部采购）
                    MaterialPurchase deficitPurchase = new MaterialPurchase();
                    deficitPurchase.setOrderId(purchase.getOrderId());
                    deficitPurchase.setOrderNo(purchase.getOrderNo());
                    deficitPurchase.setStyleId(purchase.getStyleId());
                    deficitPurchase.setStyleNo(purchase.getStyleNo());
                    deficitPurchase.setStyleName(purchase.getStyleName());
                    deficitPurchase.setMaterialId(purchase.getMaterialId());
                    deficitPurchase.setMaterialCode(purchase.getMaterialCode());
                    deficitPurchase.setMaterialName(purchase.getMaterialName());
                    deficitPurchase.setMaterialType(purchase.getMaterialType());
                    deficitPurchase.setColor(purchase.getColor());
                    deficitPurchase.setSize(purchase.getSize());
                    deficitPurchase.setUnit(purchase.getUnit());
                    deficitPurchase.setSpecifications(purchase.getSpecifications());
                    deficitPurchase.setPurchaseQuantity(BigDecimal.valueOf(deficitQty));
                    deficitPurchase.setStatus("pending");
                    deficitPurchase.setRemark("部分领取补采|原任务ID=" + purchase.getId() + "|缺口=" + deficitQty);
                    deficitPurchase.setTenantId(purchase.getTenantId());
                    deficitPurchase.setCreatorId(receiverId);
                    deficitPurchase.setCreateTime(LocalDateTime.now());
                    deficitPurchase.setUpdateTime(LocalDateTime.now());
                    deficitPurchase.setDeleteFlag(0);
                    materialPurchaseService.save(deficitPurchase);
                    purchaseCount++;
                    detail.put("action", "partial");
                    detail.put("pickedQty", availableStock);
                    detail.put("deficitQty", deficitQty);
                    detail.put("status", "partial");
                    detail.put("message", String.format("部分出库 %d%s，缺口 %d%s 已创建采购任务",
                        availableStock, purchase.getUnit() != null ? purchase.getUnit() : "",
                        deficitQty, purchase.getUnit() != null ? purchase.getUnit() : ""));
                } catch (Exception e) {
                    log.error("创建部分出库单失败: materialCode={}, error={}", materialCode, e.getMessage());
                    purchaseCount++;
                    detail.put("action", "purchase");
                    detail.put("status", "pending");
                    detail.put("message", "部分出库失败，保持采购状态");
                }
            } else {
                // ❌ 无库存，保持采购状态（等待外部采购）
                purchaseCount++;
                detail.put("action", "purchase");
                detail.put("status", "pending");
                detail.put("message", "库存不足，等待采购");
            }

            details.add(detail);
        }

        // 3. 返回汇总结果
        Map<String, Object> result = new java.util.LinkedHashMap<>();
        result.put("outboundCount", outboundCount);
        result.put("purchaseCount", purchaseCount);
        result.put("totalCount", pendingPurchases.size());
        result.put("message", String.format("处理完成：%d项走出库，%d项走采购", outboundCount, purchaseCount));
        result.put("details", details);

        log.info("✅ 智能一键领取完成: orderNo={}, 出库={}, 采购={}", orderNo, outboundCount, purchaseCount);
        return result;
    }

    // ──────────────────────────────────────────────────────────────
    // 创建领料出库单
    // ──────────────────────────────────────────────────────────────

    /**
     * 创建领料出库单并扣减库存
     */
    private void createOutboundPicking(MaterialPurchase purchase, String receiverId, String receiverName,
                                       List<MaterialStock> stockList) {
        int pickQty = purchase.getPurchaseQuantity() != null ? purchase.getPurchaseQuantity().intValue() : 0;
        createOutboundPicking(purchase, receiverId, receiverName, stockList, pickQty);
    }

    private void createOutboundPicking(MaterialPurchase purchase, String receiverId, String receiverName,
                                       List<MaterialStock> stockList, int pickQty) {
        // 1. 创建主表（MaterialPicking）—— status="pending"，等待仓库确认后再扣库存
        MaterialPicking picking = new MaterialPicking();
        picking.setPickingNo("PICK-" + System.currentTimeMillis());
        picking.setOrderId(purchase.getOrderId());
        picking.setOrderNo(purchase.getOrderNo());
        picking.setStyleId(purchase.getStyleId());
        picking.setStyleNo(purchase.getStyleNo());
        picking.setPickerId(receiverId);
        picking.setPickerName(receiverName);
        picking.setPickupType(resolvePickupType(purchase));
        picking.setUsageType(resolveUsageType(purchase));
        picking.setPickTime(LocalDateTime.now());
        picking.setStatus("pending");  // 仓库待确认出库
        // 存储 purchaseId，仓库确认出库时用于回写采购单状态
        picking.setRemark("WAREHOUSE_PICK|purchaseId=" + (purchase.getId() != null ? purchase.getId() : ""));
        picking.setCreateTime(LocalDateTime.now());
        picking.setUpdateTime(LocalDateTime.now());
        picking.setDeleteFlag(0);

        List<MaterialPickingItem> items = new ArrayList<>();

        // 2. 仅准备明细（不扣库存，仓库确认出库时再扣）
        int remainingQty = pickQty;
        for (MaterialStock stock : stockList) {
            if (remainingQty <= 0) break;

            int stockAvailable = Math.max(0,
                (stock.getQuantity() != null ? stock.getQuantity() : 0)
                - (stock.getLockedQuantity() != null ? stock.getLockedQuantity() : 0));

            if (stockAvailable <= 0) continue;

            int pickFromThis = Math.min(remainingQty, stockAvailable);

            MaterialPickingItem item = new MaterialPickingItem();
            item.setMaterialStockId(stock.getId());
            item.setMaterialId(stock.getMaterialId());
            item.setMaterialCode(stock.getMaterialCode());
            item.setMaterialName(stock.getMaterialName());
            item.setColor(stock.getColor());
            item.setSize(stock.getSize());
            item.setQuantity(pickFromThis);
            item.setUnit(stock.getUnit());
            item.setCreateTime(LocalDateTime.now());
            items.add(item);

            materialStockService.lockStock(stock.getId(), pickFromThis);

            remainingQty -= pickFromThis;
        }

        // 3. 保存待出库单（不扣库存，但已锁定）
        String pickingId = materialPickingService.savePendingPicking(picking, items);

        // 4. 更新采购任务状态为「仓库待出库」（尚未完成，等仓库出库后变 completed）
        purchase.setStatus(MaterialConstants.STATUS_WAREHOUSE_PENDING);
        purchase.setReceiverId(receiverId);
        purchase.setReceiverName(receiverName);
        purchase.setUpdateTime(LocalDateTime.now());
        materialPurchaseService.updateById(purchase);

        log.info("✅ 智能一键领取出库单完成：pickingId={}, materialCode={}, qty={}, 已推送仓库系统",
            pickingId, purchase.getMaterialCode(), pickQty);
    }

    // ──────────────────────────────────────────────────────────────
    // 智能领取预览
    // ──────────────────────────────────────────────────────────────

    /**
     * 智能领取预览（不执行，仅查询库存状态）
     * 返回该订单所有物料采购任务的需求数量、仓库可用数量和当前状态，供前端显示表格
     */
    public Map<String, Object> previewSmartReceive(String orderNo) {
        if (!StringUtils.hasText(orderNo)) {
            throw new IllegalArgumentException("订单号不能为空");
        }

        // 1. 查询订单的所有采购任务（不限状态，让前端看到全貌）
        // 显式指定字段，规避云端 t_material_purchase 新增列未迁移导致的 Unknown column 500
        List<MaterialPurchase> allPurchases = materialPurchaseService.lambdaQuery()
            .select(
                MaterialPurchase::getId,
                MaterialPurchase::getMaterialCode,
                MaterialPurchase::getMaterialName,
                MaterialPurchase::getMaterialType,
                MaterialPurchase::getColor,
                MaterialPurchase::getSize,
                MaterialPurchase::getPurchaseQuantity,
                MaterialPurchase::getStatus,
                MaterialPurchase::getUnit,
                MaterialPurchase::getArrivedQuantity
            )
            .eq(MaterialPurchase::getOrderNo, orderNo.trim())
            .eq(MaterialPurchase::getDeleteFlag, 0)
            .list();

        List<Map<String, Object>> items = new ArrayList<>();
        int pendingCount = 0;

        for (MaterialPurchase purchase : allPurchases) {
            String materialCode = purchase.getMaterialCode();
            String color = purchase.getColor();
            String size = purchase.getSize();
            int requiredQty = purchase.getPurchaseQuantity() != null ? purchase.getPurchaseQuantity().intValue() : 0;
            String status = purchase.getStatus() != null ? purchase.getStatus() : "";

            // 查询库存
            LambdaQueryWrapper<MaterialStock> stockWrapper = new LambdaQueryWrapper<>();
            stockWrapper.eq(MaterialStock::getMaterialCode, materialCode);
            if (StringUtils.hasText(color)) {
                stockWrapper.eq(MaterialStock::getColor, color);
            }
            if (StringUtils.hasText(size)) {
                stockWrapper.eq(MaterialStock::getSize, size);
            }

            List<MaterialStock> stockList = materialStockService.list(stockWrapper);
            int availableStock = stockList.stream()
                .mapToInt(stock -> {
                    int qty = stock.getQuantity() != null ? stock.getQuantity() : 0;
                    int locked = stock.getLockedQuantity() != null ? stock.getLockedQuantity() : 0;
                    return Math.max(0, qty - locked);
                })
                .sum();

            boolean isPending = MaterialConstants.STATUS_PENDING.equals(status);
            boolean isWarehousePending = MaterialConstants.STATUS_WAREHOUSE_PENDING.equals(status);
            if (isPending || isWarehousePending) pendingCount++;

            Map<String, Object> item = new java.util.LinkedHashMap<>();
            item.put("purchaseId", purchase.getId());
            item.put("materialCode", materialCode);
            item.put("materialName", purchase.getMaterialName());
            item.put("materialType", purchase.getMaterialType());
            item.put("color", color != null ? color : "");
            item.put("size", size != null ? size : "");
            item.put("requiredQty", requiredQty);
            item.put("availableStock", availableStock);
            item.put("purchaseStatus", status);
            // 可领取数量 = pending状态下 min(需求, 库存)，否则0
            int canPickQty = isPending ? Math.min(requiredQty, availableStock) : 0;
            item.put("canPickQty", canPickQty);
            // 需采购数量 = pending状态下 需求 - 可领取，否则0
            int needPurchaseQty = isPending ? Math.max(0, requiredQty - canPickQty) : 0;
            item.put("needPurchaseQty", needPurchaseQty);
            item.put("unit", purchase.getUnit());
            item.put("arrivedQuantity", purchase.getArrivedQuantity() != null ? purchase.getArrivedQuantity() : 0);

            items.add(item);
        }

        // 2. 查询已有的出库单
        // 显式指定字段，规避云端 t_material_picking 新增列未迁移导致的 Unknown column 500
        List<MaterialPicking> existingPickings = materialPickingService.lambdaQuery()
            .select(
                MaterialPicking::getId,
                MaterialPicking::getPickingNo,
                MaterialPicking::getStatus,
                MaterialPicking::getPickerName,
                MaterialPicking::getPickTime,
                MaterialPicking::getRemark
            )
            .eq(MaterialPicking::getOrderNo, orderNo.trim())
            .eq(MaterialPicking::getDeleteFlag, 0)
            .orderByDesc(MaterialPicking::getCreateTime)
            .list();

        List<Map<String, Object>> pickingRecords = new ArrayList<>();
        for (MaterialPicking picking : existingPickings) {
            Map<String, Object> record = new java.util.LinkedHashMap<>();
            record.put("pickingId", picking.getId());
            record.put("pickingNo", picking.getPickingNo());
            record.put("status", picking.getStatus());
            record.put("pickerName", picking.getPickerName());
            record.put("pickTime", picking.getPickTime());
            record.put("remark", picking.getRemark());
            // 获取出库明细
            List<MaterialPickingItem> items2 = materialPickingService.getItemsByPickingId(picking.getId());
            record.put("items", items2);
            pickingRecords.add(record);
        }

        Map<String, Object> result = new java.util.LinkedHashMap<>();
        result.put("orderNo", orderNo.trim());
        result.put("materials", items);
        result.put("pickingRecords", pickingRecords);
        result.put("totalRequired", items.stream().mapToInt(i -> (int) i.get("requiredQty")).sum());
        result.put("totalAvailable", items.stream().mapToInt(i -> (int) i.get("availableStock")).sum());
        result.put("pendingCount", pendingCount);
        result.put("totalCount", items.size());
        return result;
    }

    // ──────────────────────────────────────────────────────────────
    // 单项仓库领取
    // ──────────────────────────────────────────────────────────────

    /**
     * 执行单项仓库领取（从仓库出库指定物料指定数量）
     * @param body { purchaseId, pickQty, receiverId, receiverName }
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> warehousePickSingle(Map<String, Object> body) {
        String purchaseId = ParamUtils.toTrimmedString(body == null ? null : body.get("purchaseId"));
        int pickQty = ParamUtils.toIntSafe(body == null ? null : body.get("pickQty"));
        String receiverId = ParamUtils.toTrimmedString(body == null ? null : body.get("receiverId"));
        String receiverName = ParamUtils.toTrimmedString(body == null ? null : body.get("receiverName"));

        if (!StringUtils.hasText(purchaseId)) {
            throw new IllegalArgumentException("采购任务ID不能为空");
        }
        if (pickQty <= 0) {
            throw new IllegalArgumentException("领取数量必须大于0");
        }

        MaterialPurchase purchase = materialPurchaseService.getById(purchaseId);
        if (purchase == null) {
            throw new NoSuchElementException("采购任务不存在");
        }

        // 幂等校验：已提交仓库出库申请，禁止重复提交
        if (MaterialConstants.STATUS_WAREHOUSE_PENDING.equals(purchase.getStatus())) {
            throw new IllegalStateException("该物料已提交仓库出库申请（待仓库确认），请勿重复提交");
        }

        String materialCode = purchase.getMaterialCode();
        String color = purchase.getColor();
        String size = purchase.getSize();
        int requiredQty = purchase.getPurchaseQuantity() != null ? purchase.getPurchaseQuantity().intValue() : 0;

        // 查询库存
        LambdaQueryWrapper<MaterialStock> stockWrapper = new LambdaQueryWrapper<>();
        stockWrapper.eq(MaterialStock::getMaterialCode, materialCode);
        if (StringUtils.hasText(color)) {
            stockWrapper.eq(MaterialStock::getColor, color);
        }
        if (StringUtils.hasText(size)) {
            stockWrapper.eq(MaterialStock::getSize, size);
        }
        List<MaterialStock> stockList = materialStockService.list(stockWrapper);

        int availableStock = stockList.stream()
            .mapToInt(stock -> {
                int qty = stock.getQuantity() != null ? stock.getQuantity() : 0;
                int locked = stock.getLockedQuantity() != null ? stock.getLockedQuantity() : 0;
                return Math.max(0, qty - locked);
            })
            .sum();

        if (availableStock < pickQty) {
            throw new IllegalArgumentException("仓库库存不足，可用库存: " + availableStock + "，需领取: " + pickQty);
        }

        // 创建待出库单（status="pending"，仓库确认后才扣库存）
        MaterialPicking picking = new MaterialPicking();
        picking.setPickingNo("PICK-" + System.currentTimeMillis());
        picking.setOrderId(purchase.getOrderId());
        picking.setOrderNo(purchase.getOrderNo());
        picking.setStyleId(purchase.getStyleId());
        picking.setStyleNo(purchase.getStyleNo());
        picking.setPickerId(receiverId);
        picking.setPickerName(receiverName);
        picking.setPickupType(resolvePickupType(purchase));
        picking.setUsageType(resolveUsageType(purchase));
        picking.setPickTime(LocalDateTime.now());
        picking.setStatus("pending");  // 待仓库确认出库
        // 存储 purchaseId，仓库确认出库时用于回写采购单状态
        picking.setRemark("WAREHOUSE_PICK|purchaseId=" + purchaseId);
        picking.setCreateTime(LocalDateTime.now());
        picking.setUpdateTime(LocalDateTime.now());
        picking.setDeleteFlag(0);

        List<MaterialPickingItem> items = new ArrayList<>();
        int remainingQty = pickQty;

        for (MaterialStock stock : stockList) {
            if (remainingQty <= 0) break;
            int stockAvailable = Math.max(0,
                (stock.getQuantity() != null ? stock.getQuantity() : 0)
                - (stock.getLockedQuantity() != null ? stock.getLockedQuantity() : 0));
            if (stockAvailable <= 0) continue;
            int pickFromThis = Math.min(remainingQty, stockAvailable);

            MaterialPickingItem item = new MaterialPickingItem();
            item.setMaterialStockId(stock.getId());
            item.setMaterialId(stock.getMaterialId());
            item.setMaterialCode(stock.getMaterialCode());
            item.setMaterialName(stock.getMaterialName());
            item.setColor(stock.getColor());
            item.setSize(stock.getSize());
            item.setQuantity(pickFromThis);
            item.setUnit(stock.getUnit());
            item.setCreateTime(LocalDateTime.now());
            items.add(item);

            materialStockService.lockStock(stock.getId(), pickFromThis);

            // 不扣库存，仓库确认出库时再扣（避免采购侧点击即扣减，仓库尚未实际发货）
            remainingQty -= pickFromThis;
        }

        String pickingId = materialPickingService.savePendingPicking(picking, items);

        // 更新采购任务状态为「仓库待出库」
        purchase.setStatus(MaterialConstants.STATUS_WAREHOUSE_PENDING);
        purchase.setReceiverId(receiverId);
        purchase.setReceiverName(receiverName);
        purchase.setUpdateTime(LocalDateTime.now());
        materialPurchaseService.updateById(purchase);

        Map<String, Object> result = new java.util.LinkedHashMap<>();
        result.put("pickingId", pickingId);
        result.put("pickingNo", picking.getPickingNo());
        result.put("pickedQty", pickQty);
        result.put("remainingPurchaseQty", Math.max(0, requiredQty - pickQty));
        result.put("materialCode", materialCode);
        result.put("materialName", purchase.getMaterialName());
        log.info("✅ 仓库单项领取成功: pickingId={}, materialCode={}, qty={}", pickingId, materialCode, pickQty);
        return result;
    }

    // ──────────────────────────────────────────────────────────────
    // 仓库确认出库
    // ──────────────────────────────────────────────────────────────

    /**
     * 仓库确认出库（两步流第二步）
     * 实际扣减库存 + picking 状态改为 completed + 关联采购单改为 completed
     * @param pickingId 待出库单ID（status=pending 的 MaterialPicking）
     */
    @Transactional(rollbackFor = Exception.class)
    public void confirmPickingOutbound(String pickingId) {
        if (!StringUtils.hasText(pickingId)) {
            throw new IllegalArgumentException("出库单ID不能为空");
        }
        MaterialPicking picking = materialPickingService.getById(pickingId);
        if (picking == null || (picking.getDeleteFlag() != null && picking.getDeleteFlag() != 0)) {
            throw new java.util.NoSuchElementException("出库单不存在");
        }
        if (!"pending".equalsIgnoreCase(picking.getStatus())) {
            throw new IllegalStateException("该出库单状态不是待出库，当前状态: " + picking.getStatus());
        }

        // 1. 扣减库存
        List<com.fashion.supplychain.production.entity.MaterialPickingItem> items =
                materialPickingService.getItemsByPickingId(pickingId);
        LocalDateTime outboundTime = LocalDateTime.now();
        int pickedTotalQty = 0;
        List<String> stockIds = items.stream()
                .map(com.fashion.supplychain.production.entity.MaterialPickingItem::getMaterialStockId)
                .filter(id -> id != null)
                .distinct()
                .toList();
        Map<String, MaterialStock> stockMap = stockIds.isEmpty()
                ? Map.of()
                : materialStockService.listByIds(stockIds).stream()
                        .collect(java.util.stream.Collectors.toMap(MaterialStock::getId, s -> s, (a, b) -> a));
        for (com.fashion.supplychain.production.entity.MaterialPickingItem item : items) {
            if (item.getQuantity() != null && item.getQuantity() > 0) {
                pickedTotalQty += item.getQuantity();
                MaterialStock stock = null;
                if (item.getMaterialStockId() != null) {
                    stock = stockMap.get(item.getMaterialStockId());
                    if (stock != null) {
                        materialStockService.decreaseStockAndUnlock(item.getMaterialStockId(), item.getQuantity());
                    }
                } else {
                    materialStockService.decreaseStock(
                            item.getMaterialId(), item.getColor(), item.getSize(), item.getQuantity());
                }
                recordOutboundLog(picking, item, stock, outboundTime);
            }
        }

        // 2. 更新出库单状态为 completed
        picking.setStatus("completed");
        picking.setUpdateTime(LocalDateTime.now());
        materialPickingService.updateById(picking);

        MaterialPurchase purchase = null;
        String remark = picking.getRemark();
        if (StringUtils.hasText(remark) && remark.contains("purchaseId=")) {
            String associatedPurchaseId = remark.substring(remark.indexOf("purchaseId=") + "purchaseId=".length()).trim();
            if (StringUtils.hasText(associatedPurchaseId)) {
                purchase = materialPurchaseService.getById(associatedPurchaseId);
                if (purchase != null) {
                    purchase.setStatus(MaterialConstants.STATUS_AWAITING_CONFIRM);
                    purchase.setReceivedTime(LocalDateTime.now());
                    purchase.setUpdateTime(LocalDateTime.now());
                    materialPurchaseService.updateById(purchase);

                    // 同步订单面料到货率
                    try {
                        if (StringUtils.hasText(purchase.getOrderId())) {
                            helper.recomputeAndUpdateMaterialArrivalRate(purchase.getOrderId(), productionOrderOrchestrator);
                        }
                    } catch (Exception e) {
                        log.warn("confirmPickingOutbound: 同步订单面料到货率失败, purchaseId={}", associatedPurchaseId, e);
                    }
                }
            }
        }

        syncPickupRecordAfterOutbound(picking, purchase, items, pickedTotalQty);

        // 外发工厂领面料出库 → 自动产生扣款记录
        FactorySnapshot factorySnapshot = resolveFactorySnapshot(purchase, picking);
        if ("EXTERNAL".equalsIgnoreCase(factorySnapshot.factoryType)) {
            applyMaterialDeductionForExternalFactory(picking, purchase, items, factorySnapshot);
        }

        log.info("✅ 仓库确认出库完成: pickingId={}, itemCount={}", pickingId, items.size());
    }

    // ──────────────────────────────────────────────────────────────
    // 撤销出库单
    // ──────────────────────────────────────────────────────────────

    /**
     * 撤销出库单（主管以上权限）
     * 回退库存，恢复采购任务状态，需填写备注原因
     * @param body { pickingId, reason }
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> cancelPicking(Map<String, Object> body) {
        String pickingId = ParamUtils.toTrimmedString(body == null ? null : body.get("pickingId"));
        String reason = ParamUtils.toTrimmedString(body == null ? null : body.get("reason"));

        if (!StringUtils.hasText(pickingId)) {
            throw new IllegalArgumentException("出库单ID不能为空");
        }
        if (!StringUtils.hasText(reason)) {
            throw new IllegalArgumentException("撤销原因不能为空");
        }

        // 检查权限：主管以上
        String currentRole = UserContext.role();
        if (currentRole == null || (!currentRole.contains("admin") && !currentRole.contains("supervisor")
                && !currentRole.contains("manager") && !currentRole.contains("主管") && !currentRole.contains("管理员"))) {
            // 允许权限通过 @PreAuthorize 控制，这里做兜底
            log.warn("用户 {} 尝试撤销出库单，角色: {}", UserContext.username(), currentRole);
        }

        MaterialPicking picking = materialPickingService.getById(pickingId);
        if (picking == null || picking.getDeleteFlag() != null && picking.getDeleteFlag() == 1) {
            throw new NoSuchElementException("出库单不存在或已被删除");
        }
        if ("cancelled".equals(picking.getStatus())) {
            throw new IllegalStateException("出库单已撤销，不可重复操作");
        }

        // 1. 获取出库明细
        List<MaterialPickingItem> items = materialPickingService.getItemsByPickingId(pickingId);

        boolean wasCompleted = "completed".equalsIgnoreCase(picking.getStatus());

        // 2. 回退库存
        for (MaterialPickingItem item : items) {
            if (item.getMaterialStockId() != null) {
                if (wasCompleted) {
                    materialStockService.update(null, new LambdaUpdateWrapper<com.fashion.supplychain.production.entity.MaterialStock>()
                            .eq(com.fashion.supplychain.production.entity.MaterialStock::getId, item.getMaterialStockId())
                            .setSql("quantity = quantity + " + item.getQuantity())
                            .set(com.fashion.supplychain.production.entity.MaterialStock::getUpdateTime, LocalDateTime.now()));
                } else {
                    materialStockService.unlockStock(item.getMaterialStockId(), item.getQuantity());
                }
            }
        }

        // 3. 标记出库单为已撤销
        picking.setStatus(MaterialConstants.STATUS_CANCELLED);
        picking.setRemark("【撤销】" + reason + " | 操作人: " + UserContext.username() + " | 原备注: " + (picking.getRemark() != null ? picking.getRemark() : ""));
        picking.setUpdateTime(LocalDateTime.now());
        materialPickingService.updateById(picking);

        // 4. 恢复关联的采购任务状态为 pending
        String orderNo = picking.getOrderNo();
        if (StringUtils.hasText(orderNo)) {
            // 查找与出库单物料匹配的采购任务，恢复为 pending
            for (MaterialPickingItem item : items) {
                List<MaterialPurchase> relatedPurchases = materialPurchaseService.lambdaQuery()
                    .eq(MaterialPurchase::getOrderNo, orderNo)
                    .eq(MaterialPurchase::getMaterialCode, item.getMaterialCode())
                    .eq(MaterialPurchase::getDeleteFlag, 0)
                    .in(MaterialPurchase::getStatus, MaterialConstants.STATUS_COMPLETED, MaterialConstants.STATUS_AWAITING_CONFIRM, MaterialConstants.STATUS_PARTIAL, MaterialConstants.STATUS_WAREHOUSE_PENDING)
                    .list();

                for (MaterialPurchase purchase : relatedPurchases) {
                    // ⚠️ 用 LambdaUpdateWrapper 显式 SET NULL
                    LambdaUpdateWrapper<MaterialPurchase> purchaseUw = new LambdaUpdateWrapper<>();
                    purchaseUw.eq(MaterialPurchase::getId, purchase.getId())
                              .set(MaterialPurchase::getStatus, MaterialConstants.STATUS_PENDING)
                              .set(MaterialPurchase::getReceivedTime, null)
                              .set(MaterialPurchase::getReceiverId, null)
                              .set(MaterialPurchase::getReceiverName, null)
                              .set(MaterialPurchase::getArrivedQuantity, 0)
                              .set(MaterialPurchase::getUpdateTime, LocalDateTime.now());
                    materialPurchaseService.update(purchaseUw);
                    log.info("✅ 采购任务已恢复: purchaseId={}, materialCode={}", purchase.getId(), purchase.getMaterialCode());
                }
            }
        }

        Map<String, Object> result = new java.util.LinkedHashMap<>();
        result.put("pickingId", pickingId);
        result.put("pickingNo", picking.getPickingNo());
        result.put("status", "cancelled");
        result.put("reason", reason);
        result.put("restoredItems", items.size());
        log.info("✅ 出库单已撤销: pickingNo={}, reason={}, 回退{}项物料", picking.getPickingNo(), reason, items.size());
        return result;
    }

    // ──────────────────────────────────────────────────────────────
    // 内部辅助方法
    // ──────────────────────────────────────────────────────────────

    private void syncPickupRecordAfterOutbound(
            MaterialPicking picking,
            MaterialPurchase purchase,
            List<MaterialPickingItem> items,
            int pickedTotalQty) {
        if (picking == null || pickedTotalQty <= 0 || items == null || items.isEmpty()) {
            return;
        }

        String syncRemark = buildPickupRemark(picking, purchase);
        if (existsAutoSyncedPickupRecord(syncRemark)) {
            log.info("syncPickupRecordAfterOutbound: 跳过重复同步, pickingId={}, purchaseId={}",
                    picking.getId(), purchase != null ? purchase.getId() : null);
            return;
        }

        MaterialPickingItem firstItem = items.get(0);
        FactorySnapshot factorySnapshot = resolveFactorySnapshot(purchase, picking);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("pickupType", resolvePickupType(purchase, picking));
        body.put("movementType", "OUTBOUND");
        body.put("sourceType", "PICKING_OUTBOUND");
        body.put("usageType", resolveUsageType(purchase, picking));
        body.put("sourceRecordId", picking.getId());
        body.put("sourceDocumentNo", picking.getPickingNo());
        body.put("factoryId", factorySnapshot.factoryId);
        body.put("factoryName", factorySnapshot.factoryName);
        body.put("factoryType", factorySnapshot.factoryType);
        body.put("orderNo", purchase != null ? purchase.getOrderNo() : picking.getOrderNo());
        body.put("styleNo", purchase != null ? purchase.getStyleNo() : picking.getStyleNo());
        body.put("materialId", purchase != null ? purchase.getMaterialId() : firstItem.getMaterialId());
        body.put("materialCode", purchase != null ? purchase.getMaterialCode() : firstItem.getMaterialCode());
        body.put("materialName", purchase != null ? purchase.getMaterialName() : firstItem.getMaterialName());
        body.put("materialType", purchase != null ? purchase.getMaterialType() : firstItem.getMaterialType());
        body.put("color", purchase != null ? purchase.getColor() : firstItem.getColor());
        body.put("specification", purchase != null ? purchase.getSpecifications() : firstItem.getSpecification());
        body.put("fabricComposition", purchase != null ? purchase.getFabricComposition() : firstItem.getFabricComposition());
        body.put("fabricWidth", purchase != null ? purchase.getFabricWidth() : firstItem.getFabricWidth());
        body.put("fabricWeight", purchase != null ? purchase.getFabricWeight() : null);
        body.put("unit", purchase != null ? purchase.getUnit() : firstItem.getUnit());
        body.put("quantity", pickedTotalQty);
        body.put("unitPrice", purchase != null ? purchase.getUnitPrice() : firstItem.getUnitPrice());
        body.put("receiverId", picking.getPickerId());
        body.put("receiverName", picking.getPickerName());
        body.put("issuerId", UserContext.userId());
        body.put("issuerName", UserContext.username());
        body.put("warehouseLocation", resolveWarehouseLocation(items) != null ? resolveWarehouseLocation(items) : firstItem.getWarehouseLocation());
        body.put("remark", syncRemark);

        materialPickupOrchestrator.create(body);
    }

    private boolean existsAutoSyncedPickupRecord(String syncRemark) {
        if (!StringUtils.hasText(syncRemark)) {
            return false;
        }
        Long count = materialPickupRecordMapper.selectCount(new LambdaQueryWrapper<MaterialPickupRecord>()
                .eq(MaterialPickupRecord::getDeleteFlag, 0)
                .eq(MaterialPickupRecord::getRemark, syncRemark)
                .last("LIMIT 1"));
        return count != null && count > 0;
    }

    private String resolvePickupType(MaterialPurchase purchase, MaterialPicking picking) {
        if (picking != null && StringUtils.hasText(picking.getPickupType())) {
            return picking.getPickupType().trim();
        }
        if (purchase == null) {
            return "INTERNAL";
        }

        String factoryType = purchase.getFactoryType();
        if (!StringUtils.hasText(factoryType) && StringUtils.hasText(purchase.getOrderId())) {
            ProductionOrder order = productionOrderService.getById(purchase.getOrderId().trim());
            if (order != null) {
                factoryType = order.getFactoryType();
            }
        }

        return StringUtils.hasText(factoryType) && "EXTERNAL".equalsIgnoreCase(factoryType.trim())
                ? "EXTERNAL"
                : "INTERNAL";
    }

    private String resolvePickupType(MaterialPurchase purchase) {
        return resolvePickupType(purchase, null);
    }

    private String resolveUsageType(MaterialPurchase purchase, MaterialPicking picking) {
        if (picking != null && StringUtils.hasText(picking.getUsageType())) {
            return picking.getUsageType().trim();
        }
        if (purchase == null || !StringUtils.hasText(purchase.getSourceType())) {
            return "BULK";
        }
        String sourceType = purchase.getSourceType().trim().toLowerCase();
        if ("sample".equals(sourceType)) {
            return "SAMPLE";
        }
        if ("stock".equals(sourceType)) {
            return "STOCK";
        }
        return "BULK";
    }

    private String resolveUsageType(MaterialPurchase purchase) {
        return resolveUsageType(purchase, null);
    }

    private String buildPickupRemark(MaterialPicking picking, MaterialPurchase purchase) {
        String sourceType = purchase == null ? null : purchase.getSourceType();
        String factoryType = purchase == null ? null : purchase.getFactoryType();
        String orderBizType = purchase == null ? null : purchase.getOrderBizType();

        if ((!StringUtils.hasText(factoryType) || !StringUtils.hasText(orderBizType))
                && purchase != null && StringUtils.hasText(purchase.getOrderId())) {
            ProductionOrder order = productionOrderService.getById(purchase.getOrderId().trim());
            if (order != null) {
                if (!StringUtils.hasText(factoryType)) {
                    factoryType = order.getFactoryType();
                }
                if (!StringUtils.hasText(orderBizType)) {
                    orderBizType = order.getOrderBizType();
                }
            }
        }

        return "AUTO_PICKUP_SYNC"
                + "|sourceType=" + (StringUtils.hasText(sourceType) ? sourceType.trim() : "unknown")
                + "|factoryType=" + (StringUtils.hasText(factoryType) ? factoryType.trim() : "unknown")
                + "|orderBizType=" + (StringUtils.hasText(orderBizType) ? orderBizType.trim() : "unknown")
                + "|purchaseId=" + (purchase != null && StringUtils.hasText(purchase.getId()) ? purchase.getId().trim() : "")
                + "|purchaseNo=" + (purchase != null && StringUtils.hasText(purchase.getPurchaseNo()) ? purchase.getPurchaseNo().trim() : "")
                + "|pickingId=" + (picking != null && StringUtils.hasText(picking.getId()) ? picking.getId().trim() : "")
                + "|pickingNo=" + (picking != null && StringUtils.hasText(picking.getPickingNo()) ? picking.getPickingNo().trim() : "");
    }

    private void recordOutboundLog(MaterialPicking picking, MaterialPickingItem item, MaterialStock stock, LocalDateTime outboundTime) {
        FactorySnapshot factorySnapshot = resolveFactorySnapshot(null, picking);
        MaterialOutboundLog outboundLog = new MaterialOutboundLog();
        outboundLog.setStockId(stock != null ? stock.getId() : item.getMaterialStockId());
        outboundLog.setOutboundNo(picking.getPickingNo());
        outboundLog.setSourceType("PICKING_OUTBOUND");
        outboundLog.setPickupType(resolvePickupType(null, picking));
        outboundLog.setUsageType(resolveUsageType(null, picking));
        outboundLog.setOrderId(picking.getOrderId());
        outboundLog.setOrderNo(picking.getOrderNo());
        outboundLog.setStyleId(picking.getStyleId());
        outboundLog.setStyleNo(picking.getStyleNo());
        outboundLog.setFactoryId(factorySnapshot.factoryId);
        outboundLog.setFactoryName(factorySnapshot.factoryName);
        outboundLog.setFactoryType(factorySnapshot.factoryType);
        outboundLog.setPickingId(picking.getId());
        outboundLog.setPickingNo(picking.getPickingNo());
        outboundLog.setMaterialCode(stock != null ? stock.getMaterialCode() : item.getMaterialCode());
        outboundLog.setMaterialName(stock != null ? stock.getMaterialName() : item.getMaterialName());
        outboundLog.setQuantity(item.getQuantity());
        outboundLog.setOperatorId(StringUtils.hasText(UserContext.userId()) ? UserContext.userId() : picking.getPickerId());
        outboundLog.setOperatorName(StringUtils.hasText(UserContext.username()) ? UserContext.username() : picking.getPickerName());
        outboundLog.setReceiverId(picking.getPickerId());
        outboundLog.setReceiverName(picking.getPickerName());
        outboundLog.setWarehouseLocation(stock != null ? stock.getLocation() : null);
        outboundLog.setRemark("仓库确认出库|pickingNo=" + picking.getPickingNo());
        outboundLog.setOutboundTime(outboundTime);
        outboundLog.setCreateTime(outboundTime);
        outboundLog.setDeleteFlag(0);
        materialOutboundLogMapper.insert(outboundLog);

        if (stock != null && StringUtils.hasText(stock.getId())) {
            MaterialStock patch = new MaterialStock();
            patch.setId(stock.getId());
            patch.setLastOutboundDate(outboundTime);
            patch.setUpdateTime(outboundTime);
            materialStockService.updateById(patch);
        }
    }

    private FactorySnapshot resolveFactorySnapshot(MaterialPurchase purchase, MaterialPicking picking) {
        FactorySnapshot snapshot = new FactorySnapshot();
        if (purchase != null) {
            snapshot.factoryName = purchase.getFactoryName();
            snapshot.factoryType = purchase.getFactoryType();
        }
        String orderId = purchase != null ? purchase.getOrderId() : null;
        String orderNo = purchase != null ? purchase.getOrderNo() : null;
        if (picking != null) {
            if (!StringUtils.hasText(orderId)) {
                orderId = picking.getOrderId();
            }
            if (!StringUtils.hasText(orderNo)) {
                orderNo = picking.getOrderNo();
            }
        }
        ProductionOrder order = null;
        if (StringUtils.hasText(orderId)) {
            order = productionOrderService.getById(orderId.trim());
        }
        if (order == null && StringUtils.hasText(orderNo)) {
            order = productionOrderService.lambdaQuery()
                    .eq(ProductionOrder::getOrderNo, orderNo.trim())
                    .eq(ProductionOrder::getDeleteFlag, 0)
                    .last("LIMIT 1")
                    .one();
        }
        if (order != null) {
            snapshot.factoryId = order.getFactoryId();
            if (!StringUtils.hasText(snapshot.factoryName)) {
                snapshot.factoryName = order.getFactoryName();
            }
            if (!StringUtils.hasText(snapshot.factoryType)) {
                snapshot.factoryType = order.getFactoryType();
            }
        }
        if (!StringUtils.hasText(snapshot.factoryType) && purchase != null && StringUtils.hasText(purchase.getFactoryType())) {
            snapshot.factoryType = purchase.getFactoryType().trim();
        }
        if (!StringUtils.hasText(snapshot.factoryName) && purchase != null && StringUtils.hasText(purchase.getFactoryName())) {
            snapshot.factoryName = purchase.getFactoryName().trim();
        }
        return snapshot;
    }

    private String resolveWarehouseLocation(List<MaterialPickingItem> items) {
        return items.stream()
                .map(MaterialPickingItem::getMaterialStockId)
                .filter(StringUtils::hasText)
                .map(materialStockService::getById)
                .filter(Objects::nonNull)
                .map(MaterialStock::getLocation)
                .filter(StringUtils::hasText)
                .map(String::trim)
                .distinct()
                .collect(Collectors.joining("、"));
    }

    private void applyMaterialDeductionForExternalFactory(
            MaterialPicking picking,
            MaterialPurchase purchase,
            List<MaterialPickingItem> items,
            FactorySnapshot factorySnapshot) {
        try {
            String orderId = purchase != null ? purchase.getOrderId() : picking.getOrderId();
            String orderNo = purchase != null ? purchase.getOrderNo() : picking.getOrderNo();
            if (!StringUtils.hasText(orderId) && !StringUtils.hasText(orderNo)) {
                return;
            }

            BigDecimal totalMaterialCost = BigDecimal.ZERO;
            for (MaterialPickingItem item : items) {
                BigDecimal unitPrice = item.getUnitPrice() != null ? item.getUnitPrice() : BigDecimal.ZERO;
                int qty = item.getQuantity() != null ? item.getQuantity() : 0;
                totalMaterialCost = totalMaterialCost.add(unitPrice.multiply(BigDecimal.valueOf(qty)));
            }

            if (totalMaterialCost.compareTo(BigDecimal.ZERO) <= 0) {
                return;
            }

            ShipmentReconciliation recon = shipmentReconciliationService.lambdaQuery()
                    .and(w -> {
                        if (StringUtils.hasText(orderId)) w.eq(ShipmentReconciliation::getOrderId, orderId);
                        if (StringUtils.hasText(orderNo)) w.or().eq(ShipmentReconciliation::getOrderNo, orderNo);
                    })
                    .orderByDesc(ShipmentReconciliation::getCreateTime)
                    .last("LIMIT 1")
                    .one();

            if (recon == null) {
                log.info("外发工厂面料扣款: 暂无出货对账单，扣款将在关单时自动归集, orderNo={}", orderNo);
                return;
            }

            DeductionItem deduction = new DeductionItem();
            deduction.setReconciliationId(recon.getId());
            deduction.setDeductionType("MATERIAL_PICKUP");
            deduction.setDeductionAmount(totalMaterialCost);
            deduction.setDescription("外发工厂领料扣款|" + (factorySnapshot.factoryName != null ? factorySnapshot.factoryName : "")
                    + "|pickingNo=" + picking.getPickingNo()
                    + "|物料" + items.size() + "项|金额" + totalMaterialCost.setScale(2, java.math.RoundingMode.HALF_UP));
            deductionItemMapper.insert(deduction);

            BigDecimal existingDeduction = recon.getDeductionAmount() != null ? recon.getDeductionAmount() : BigDecimal.ZERO;
            recon.setDeductionAmount(existingDeduction.add(totalMaterialCost));
            recon.setFinalAmount(recon.getTotalAmount() != null ? recon.getTotalAmount().subtract(recon.getDeductionAmount()) : BigDecimal.ZERO);
            shipmentReconciliationService.updateById(recon);

            log.info("外发工厂面料扣款已记录: orderNo={}, pickingNo={}, deductionAmount={}, totalDeduction={}",
                    orderNo, picking.getPickingNo(), totalMaterialCost, recon.getDeductionAmount());
        } catch (Exception e) {
            log.error("外发工厂面料扣款记录失败: pickingId={}", picking.getId(), e);
        }
    }

    private static class FactorySnapshot {
        private String factoryId;
        private String factoryName;
        private String factoryType;
    }
}
