package com.fashion.supplychain.production.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.production.entity.MaterialInbound;
import com.fashion.supplychain.production.entity.MaterialRoll;
import com.fashion.supplychain.production.service.MaterialInboundService;
import com.fashion.supplychain.production.service.MaterialRollService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 面辅料料卷编排器
 *
 * 职责：
 *  1. generateRolls()     - 为某入库单批量生成料卷记录（PC端调用）
 *  2. scanRoll()          - 仓管扫料卷二维码（小程序调用）
 *                           - action=issue: 确认发料（IN_STOCK → ISSUED）
 *                           - action=confirm_inbound: 重新上架（ISSUED → IN_STOCK）
 */
@Slf4j
@Service
public class MaterialRollOrchestrator {

    @Autowired
    private MaterialRollService materialRollService;

    @Autowired
    private MaterialInboundService materialInboundService;

    // ----------------------------------------------------------------
    // 1. 生成料卷 QR 标签（PC端调用）
    // ----------------------------------------------------------------

    /**
     * 为某入库单批量生成料卷记录
     *
     * @param inboundId       入库单ID
     * @param rollCount       料卷/箱数量（贴多少张标签）
     * @param quantityPerRoll 每卷/箱数量
     * @param unit            单位（米/件/kg）
     * @return 生成的料卷列表（含 rollCode = 二维码内容）
     */
    @Transactional(rollbackFor = Exception.class)
    public List<Map<String, Object>> generateRolls(
            String inboundId,
            int rollCount,
            double quantityPerRoll,
            String unit) {

        TenantAssert.assertTenantContext();

        // 查询入库单
        MaterialInbound inbound = materialInboundService.getById(inboundId);
        if (inbound == null) {
            throw new RuntimeException("入库单不存在: " + inboundId);
        }
        if (rollCount <= 0 || rollCount > 500) {
            throw new RuntimeException("料卷数量必须在 1~500 之间");
        }

        Long tenantId = UserContext.tenantId();
        List<Map<String, Object>> result = new ArrayList<>();

        for (int i = 0; i < rollCount; i++) {
            String rollCode = materialRollService.generateRollCode();

            MaterialRoll roll = new MaterialRoll();
            roll.setRollCode(rollCode);
            roll.setInboundId(inboundId);
            roll.setInboundNo(inbound.getInboundNo());
            roll.setMaterialCode(inbound.getMaterialCode());
            roll.setMaterialName(inbound.getMaterialName());
            roll.setMaterialType(inbound.getMaterialType());
            roll.setColor(inbound.getColor());
            roll.setSpecifications(inbound.getSize());
            roll.setUnit(unit != null ? unit : "件");
            roll.setQuantity(new java.math.BigDecimal(String.valueOf(quantityPerRoll)));
            roll.setWarehouseLocation(inbound.getWarehouseLocation());
            roll.setStatus("IN_STOCK");
            roll.setSupplierName(inbound.getSupplierName());
            roll.setTenantId(tenantId);
            roll.setCreateTime(LocalDateTime.now());
            roll.setUpdateTime(LocalDateTime.now());
            roll.setDeleteFlag(0);

            materialRollService.save(roll);

            Map<String, Object> item = new HashMap<>();
            item.put("rollCode", rollCode);
            item.put("id", roll.getId());
            item.put("materialCode", roll.getMaterialCode());
            item.put("materialName", roll.getMaterialName());
            item.put("quantity", roll.getQuantity());
            item.put("unit", roll.getUnit());
            item.put("warehouseLocation", roll.getWarehouseLocation());
            item.put("inboundNo", roll.getInboundNo());
            result.add(item);
        }

        log.info("为入库单 {} 生成了 {} 张料卷标签", inbound.getInboundNo(), rollCount);
        return result;
    }

    // ----------------------------------------------------------------
    // 2. 扫码处理（小程序调用）
    // ----------------------------------------------------------------

    /**
     * 仓管扫料卷二维码
     *
     * @param rollCode      二维码内容（即 roll_code 字段，格式：MR...）
     * @param action        动作：issue=发料出库 / return=退回入库 / query=仅查询
     * @param cuttingOrderNo 关联裁剪单号（发料时可选填）
     * @param operatorId    操作人ID
     * @param operatorName  操作人姓名
     * @return 扫码结果
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> scanRoll(
            String rollCode,
            String action,
            String cuttingOrderNo,
            String operatorId,
            String operatorName) {

        if (rollCode == null || rollCode.isBlank()) {
            throw new RuntimeException("二维码内容不能为空");
        }

        MaterialRoll roll = materialRollService.findByRollCode(rollCode);
        if (roll == null) {
            throw new RuntimeException("未找到该料卷信息，二维码：" + rollCode);
        }

        Map<String, Object> result = new HashMap<>();
        result.put("rollCode", rollCode);
        result.put("materialCode", roll.getMaterialCode());
        result.put("materialName", roll.getMaterialName());
        result.put("color", roll.getColor());
        result.put("quantity", roll.getQuantity());
        result.put("unit", roll.getUnit());
        result.put("warehouseLocation", roll.getWarehouseLocation());
        result.put("inboundNo", roll.getInboundNo());
        result.put("currentStatus", roll.getStatus());

        if ("query".equals(action)) {
            // 仅查询，不修改状态
            result.put("message", "查询成功");
            return result;
        }

        if ("issue".equals(action)) {
            // 发料出库：IN_STOCK → ISSUED
            if (!"IN_STOCK".equals(roll.getStatus())) {
                throw new RuntimeException("该料卷已发料（状态：" + statusLabel(roll.getStatus()) + "），不能重复操作");
            }
            roll.setStatus("ISSUED");
            roll.setIssuedOrderNo(cuttingOrderNo);
            roll.setIssuedTime(LocalDateTime.now());
            roll.setIssuedById(operatorId);
            roll.setIssuedByName(operatorName);
            roll.setUpdateTime(LocalDateTime.now());
            materialRollService.updateById(roll);

            result.put("action", "issue");
            result.put("newStatus", "ISSUED");
            result.put("message", "发料成功！" + roll.getMaterialName() + " × " + roll.getQuantity() + roll.getUnit() + " 已出库");
            log.info("料卷发料: rollCode={}, operator={}, cuttingOrder={}", rollCode, operatorName, cuttingOrderNo);

        } else if ("return".equals(action)) {
            // 退回：ISSUED → IN_STOCK
            if (!"ISSUED".equals(roll.getStatus())) {
                throw new RuntimeException("该料卷当前状态为「" + statusLabel(roll.getStatus()) + "」，无需退回");
            }
            roll.setStatus("IN_STOCK");
            roll.setIssuedOrderNo(null);
            roll.setIssuedTime(null);
            roll.setIssuedById(null);
            roll.setIssuedByName(null);
            roll.setUpdateTime(LocalDateTime.now());
            materialRollService.updateById(roll);

            result.put("action", "return");
            result.put("newStatus", "IN_STOCK");
            result.put("message", "退回成功！" + roll.getMaterialName() + " 已重新入库");
            log.info("料卷退回: rollCode={}, operator={}", rollCode, operatorName);

        } else {
            throw new RuntimeException("无效的操作类型，支持：issue（发料）/ return（退回）/ query（查询）");
        }

        return result;
    }

    /**
     * 查询入库单下所有料卷
     */
    public List<MaterialRoll> listRollsByInbound(String inboundId) {
        return materialRollService.listByInboundId(inboundId);
    }

    // ----------------------------------------------------------------
    // 私有工具
    // ----------------------------------------------------------------

    private String statusLabel(String status) {
        return switch (status) {
            case "IN_STOCK" -> "在库";
            case "ISSUED"   -> "已发料";
            case "RETURNED" -> "已退回";
            default         -> status;
        };
    }
}
