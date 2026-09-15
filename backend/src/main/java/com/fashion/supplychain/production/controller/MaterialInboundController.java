package com.fashion.supplychain.production.controller;
import java.math.BigDecimal;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.production.entity.MaterialInbound;
import com.fashion.supplychain.production.orchestration.MaterialInboundOrchestrator;
import com.fashion.supplychain.production.service.MaterialInboundService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 面辅料入库记录 Controller
 */
@Slf4j
@RestController
@RequestMapping("/api/production/material/inbound")
@PreAuthorize("isAuthenticated()")
public class MaterialInboundController {

    @Autowired
    private MaterialInboundService materialInboundService;

    @Autowired
    private MaterialInboundOrchestrator materialInboundOrchestrator;

    /**
     * 分页查询入库记录
     */
    @GetMapping("/list")
    public Result<?> list(
            @RequestParam(defaultValue = "1") Integer pageNum,
            @RequestParam(defaultValue = "10") Integer pageSize,
            @RequestParam(required = false) String materialCode,
            @RequestParam(required = false) String purchaseId) {
        // 工厂账号不可查看入库记录（属于租户级仓库数据）
        if (com.fashion.supplychain.common.DataPermissionHelper.isFactoryAccount()) {
            return Result.success(new Page<MaterialInbound>());
        }

        Page<MaterialInbound> page = new Page<>(pageNum, pageSize);
        IPage<MaterialInbound> result = materialInboundService.queryPage(page, materialCode, purchaseId);

        return Result.success(result);
    }

    /**
     * 采购到货入库
     * 完整流程：采购到货 → 生成入库单 → 更新库存 → 关联采购单
     */
    @PostMapping("/confirm-arrival")
    public Result<?> confirmArrival(@RequestBody Map<String, Object> params) {
        try {
            String purchaseId = (String) params.get("purchaseId");
            BigDecimal arrivedQuantity = parseQuantity(params.get("arrivedQuantity"), "到货数量");
            String warehouseLocation = (String) params.get("warehouseLocation");
            String operatorId = (String) params.get("operatorId");
            String operatorName = (String) params.get("operatorName");
            String remark = (String) params.get("remark");

            Map<String, Object> result = materialInboundOrchestrator.confirmArrivalAndInbound(
                    purchaseId, arrivedQuantity, warehouseLocation,
                    operatorId, operatorName, remark);

            return Result.success(result);
        } catch (Exception e) {
            log.error("采购到货入库失败", e);
            return Result.fail(e.getMessage());
        }
    }

    /**
     * 安全解析数量参数。
     * <p>
     * 前端 JSON 数字经 Jackson 反序列化后可能是 Integer/Long/Double，旧代码直接
     * {@code (Integer) params.get(...)} 遇到小数会抛 ClassCastException（用户只看到一串类型转换异常）。
     * <p>
     * D-410：物料到货/入库量已升级为 DECIMAL(12,4)（见 V202709150100），与采购量同精度。
     * <p>
     * 此前这里会检测小数并抛「当前只支持整数（物料到货/入库量为整数模型）」——
     * 也就是说采购 1.32 米时，用户录入 1.32 会直接被接口拒绝，只能录入 1，
     * 结果采购单永远到不齐、对账单还按 1 米结算（少付货款）。现已放开小数。
     */
    private static BigDecimal parseQuantity(Object value, String fieldLabel) {
        if (value == null) {
            return null;
        }
        java.math.BigDecimal decimal;
        if (value instanceof java.math.BigDecimal bd) {
            decimal = bd;
        } else if (value instanceof Number number) {
            decimal = new java.math.BigDecimal(number.toString());
        } else {
            String text = String.valueOf(value).trim();
            if (text.isEmpty()) {
                return null;
            }
            try {
                decimal = new java.math.BigDecimal(text);
            } catch (NumberFormatException ex) {
                throw new IllegalArgumentException(fieldLabel + "格式不正确: " + text);
            }
        }
        // D-410：不再拒绝小数，仅保留"必须为正"的业务校验
        if (decimal.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException(fieldLabel + "必须大于 0，当前输入：" + decimal.toPlainString());
        }
        return decimal;
    }

    /**
     * D-360h：存量补录入库——已完成但未入仓的采购，把已到货数量补入仓库（不重复累加到货）
     */
    @PostMapping("/backfill")
    public Result<?> backfillInbound(@RequestBody Map<String, Object> params) {
        try {
            String purchaseId = (String) params.get("purchaseId");
            BigDecimal quantity = parseQuantity(params.get("quantity"), "补录数量");
            String warehouseLocation = (String) params.get("warehouseLocation");
            String operatorId = (String) params.get("operatorId");
            String operatorName = (String) params.get("operatorName");
            String remark = (String) params.get("remark");

            Map<String, Object> result = materialInboundOrchestrator.backfillInbound(
                    purchaseId, quantity, warehouseLocation,
                    operatorId, operatorName, remark);

            return Result.success(result);
        } catch (Exception e) {
            log.error("采购补录入库失败", e);
            return Result.fail(e.getMessage());
        }
    }

    /**
     * 手动入库（无采购单）
     * 用于：退货入库、其他来源入库
     */
    @PostMapping("/manual")
    public Result<?> manualInbound(@RequestBody Map<String, Object> params) {
        try {
            String materialCode = (String) params.get("materialCode");
            String materialName = (String) params.get("materialName");
            String materialType = (String) params.get("materialType");
            String color = (String) params.get("color");
            String size = (String) params.get("size");
            BigDecimal quantity = parseQuantity(params.get("quantity"), "入库数量");
            String warehouseLocation = (String) params.get("warehouseLocation");
            String supplierName = (String) params.get("supplierName");
            String operatorId = (String) params.get("operatorId");
            String operatorName = (String) params.get("operatorName");
            String remark = (String) params.get("remark");

            Map<String, Object> result = materialInboundOrchestrator.manualInbound(
                    materialCode, materialName, materialType, color, size,
                    quantity, warehouseLocation, supplierName,
                    operatorId, operatorName, remark);

            return Result.success(result);
        } catch (Exception e) {
            log.error("手动入库失败", e);
            return Result.fail(e.getMessage());
        }
    }

    /**
     * 查询入库记录详情
     */
    @GetMapping("/{id}")
    public Result<?> getById(@PathVariable String id) {
        MaterialInbound inbound = materialInboundService.getById(id);
        if (inbound == null) {
            return Result.fail("入库记录不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(inbound.getTenantId(), "入库记录");
        return Result.success(inbound);
    }

    /**
     * 生成入库单号（仅供测试）
     */
    @GetMapping("/generate-no")
    public Result<?> generateInboundNo() {
        String inboundNo = materialInboundService.generateInboundNo();
        return Result.success(Map.of("inboundNo", inboundNo));
    }
}
