package com.fashion.supplychain.production.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.dto.MaterialBatchDetailDto;
import com.fashion.supplychain.production.dto.MaterialStockAlertDto;
import com.fashion.supplychain.production.dto.MaterialTransactionDto;
import com.fashion.supplychain.production.entity.MaterialInbound;
import com.fashion.supplychain.production.entity.MaterialOutboundLog;
import com.fashion.supplychain.production.entity.MaterialStock;
import com.fashion.supplychain.production.mapper.MaterialInboundMapper;
import com.fashion.supplychain.production.mapper.MaterialOutboundLogMapper;
import com.fashion.supplychain.production.orchestration.MaterialStockOrchestrator;
import com.fashion.supplychain.production.service.MaterialStockService;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/production/material/stock")
@PreAuthorize("isAuthenticated()")
public class MaterialStockController {

    @Autowired
    private MaterialStockService materialStockService;

    @Autowired
    private MaterialStockOrchestrator materialStockOrchestrator;

    @Autowired
    private MaterialOutboundLogMapper materialOutboundLogMapper;

    @Autowired
    private MaterialInboundMapper materialInboundMapper;

    @GetMapping("/list")
    public Result<IPage<MaterialStock>> getPage(@RequestParam Map<String, Object> params) {
        // 工厂账号不可查看面辅料库存（属于租户级仓库数据）
        if (com.fashion.supplychain.common.DataPermissionHelper.isFactoryAccount()) {
            return Result.success(new com.baomidou.mybatisplus.extension.plugins.pagination.Page<>());
        }
        IPage<MaterialStock> page = materialStockService.queryPage(params);
        enrichLastOperationInfo(page.getRecords());
        return Result.success(page);
    }

    @GetMapping("/summary")
    public Result<java.util.List<MaterialStock>> getSummary(@RequestParam("materialIds") java.util.List<String> materialIds) {
        return Result.success(materialStockService.getStocksByMaterialIds(materialIds));
    }

    @GetMapping("/alerts")
    public Result<java.util.List<MaterialStockAlertDto>> getAlerts(@RequestParam Map<String, Object> params) {
        return Result.success(materialStockOrchestrator.listAlerts(params));
    }

    /**
     * 查询物料批次明细（用于出库时按批次FIFO）
     *
     * @param materialCode 物料编码（必填）
     * @param color 颜色（可选）
     * @param size 尺码（可选）
     * @return 批次明细列表，按入库时间升序排列
     */
    @GetMapping("/batches")
    public Result<java.util.List<MaterialBatchDetailDto>> getBatchDetails(
            @RequestParam String materialCode,
            @RequestParam(required = false) String color,
            @RequestParam(required = false) String size) {
        return Result.success(materialStockService.getBatchDetails(materialCode, color, size));
    }

    /**
     * 手动出库（仓库页面直接扣减库存，并写入出库日志）
     */
    @PostMapping("/manual-outbound")
    public Result<Void> manualOutbound(@RequestBody java.util.Map<String, Object> body) {
        String stockId = body.get("stockId") != null ? String.valueOf(body.get("stockId")) : null;
        int quantity = body.get("quantity") != null ? Integer.parseInt(String.valueOf(body.get("quantity"))) : 0;
        if (!org.springframework.util.StringUtils.hasText(stockId)) {
            return Result.fail("stockId 不能为空");
        }
        if (quantity <= 0) {
            return Result.fail("出库数量必须大于0");
        }
        materialStockService.decreaseStockById(stockId, quantity);

        // ── 写出库日志 ──
        try {
            MaterialStock stock = materialStockService.getById(stockId);
            String operatorName = body.get("operatorName") != null ? String.valueOf(body.get("operatorName")) : null;
            String reason = body.get("reason") != null ? String.valueOf(body.get("reason")) : "手动出库";
            if (!org.springframework.util.StringUtils.hasText(operatorName)) {
                operatorName = UserContext.username();
            }
            MaterialOutboundLog log = new MaterialOutboundLog();
            log.setStockId(stockId);
            log.setMaterialCode(stock != null ? stock.getMaterialCode() : "");
            log.setMaterialName(stock != null ? stock.getMaterialName() : "");
            log.setQuantity(quantity);
            log.setOperatorId(UserContext.userId());
            log.setOperatorName(operatorName);
            log.setWarehouseLocation(stock != null ? stock.getLocation() : null);
            log.setRemark(reason);
            log.setOutboundTime(LocalDateTime.now());
            log.setCreateTime(LocalDateTime.now());
            log.setDeleteFlag(0);
            materialOutboundLogMapper.insert(log);

            // 同步更新 t_material_stock.last_outbound_date
            MaterialStock toUpdate = new MaterialStock();
            toUpdate.setId(stockId);
            toUpdate.setLastOutboundDate(LocalDateTime.now());
            materialStockService.updateById(toUpdate);
        } catch (Exception e) {
            // 日志写入失败不影响出库主流程
            org.slf4j.LoggerFactory.getLogger(getClass()).warn("写出库日志失败: {}", e.getMessage());
        }

        return Result.success(null);
    }

    /**
     * 查询面辅料出入库流水（合并入库+出库，按时间倒序）
     */
    @GetMapping("/transactions")
    public Result<List<MaterialTransactionDto>> getTransactions(
            @RequestParam String materialCode,
            @RequestParam(required = false) String stockId) {
        DateTimeFormatter fmt = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
        List<MaterialTransactionDto> result = new ArrayList<>();

        // 1. 入库记录（来自 t_material_inbound）
        LambdaQueryWrapper<MaterialInbound> inQuery = new LambdaQueryWrapper<MaterialInbound>()
                .eq(MaterialInbound::getMaterialCode, materialCode)
                .eq(MaterialInbound::getDeleteFlag, 0)
                .orderByDesc(MaterialInbound::getInboundTime);
        List<MaterialInbound> inbounds = materialInboundMapper.selectList(inQuery);
        for (MaterialInbound ib : inbounds) {
            MaterialTransactionDto dto = new MaterialTransactionDto();
            dto.setType("IN");
            dto.setTypeLabel("入库");
            dto.setQuantity(ib.getInboundQuantity());
            dto.setOperatorName(ib.getOperatorName());
            dto.setWarehouseLocation(ib.getWarehouseLocation());
            dto.setRemark(ib.getRemark());
            if (ib.getInboundTime() != null) {
                dto.setOperationTime(ib.getInboundTime().format(fmt));
            }
            result.add(dto);
        }

        // 2. 出库记录（来自 t_material_outbound_log）
        QueryWrapper<MaterialOutboundLog> outQuery = new QueryWrapper<MaterialOutboundLog>()
                .eq("material_code", materialCode)
                .eq("delete_flag", 0);
        if (org.springframework.util.StringUtils.hasText(stockId)) {
            outQuery.eq("stock_id", stockId);
        }
        outQuery.orderByDesc("outbound_time");
        List<MaterialOutboundLog> outbounds = materialOutboundLogMapper.selectList(outQuery);
        for (MaterialOutboundLog ob : outbounds) {
            MaterialTransactionDto dto = new MaterialTransactionDto();
            dto.setType("OUT");
            dto.setTypeLabel("出库");
            dto.setQuantity(ob.getQuantity());
            dto.setOperatorName(ob.getOperatorName());
            dto.setWarehouseLocation(ob.getWarehouseLocation());
            dto.setRemark(ob.getRemark());
            if (ob.getOutboundTime() != null) {
                dto.setOperationTime(ob.getOutboundTime().format(fmt));
            }
            result.add(dto);
        }

        // 3. 按时间倒序排序
        result.sort(Comparator.comparing(
                dto -> dto.getOperationTime() == null ? "" : dto.getOperationTime(),
                Comparator.reverseOrder()
        ));

        return Result.success(result);
    }

    /**
     * 更新安全库存
     */
    @PostMapping("/update-safety-stock")
    public Result<Boolean> updateSafetyStock(@RequestBody java.util.Map<String, Object> params) {
        String stockId = params.get("stockId") == null ? null : String.valueOf(params.get("stockId"));
        Integer safetyStock = params.get("safetyStock") == null ? null
                : Integer.valueOf(String.valueOf(params.get("safetyStock")));
        boolean ok = materialStockService.updateSafetyStock(stockId, safetyStock);
        if (!ok) {
            return Result.fail("更新安全库存失败");
        }
        return Result.success(true);
    }

    private void enrichLastOperationInfo(List<MaterialStock> records) {
        if (records == null || records.isEmpty()) {
            return;
        }

        Set<String> stockIds = records.stream()
                .map(MaterialStock::getId)
                .filter(StringUtils::hasText)
                .collect(Collectors.toSet());
        Set<String> materialCodes = records.stream()
                .map(MaterialStock::getMaterialCode)
                .filter(StringUtils::hasText)
                .collect(Collectors.toSet());

        Map<String, MaterialInbound> latestInboundByKey = new HashMap<>();
        if (!materialCodes.isEmpty()) {
            List<MaterialInbound> inboundList = materialInboundMapper.selectList(new LambdaQueryWrapper<MaterialInbound>()
                    .eq(MaterialInbound::getDeleteFlag, 0)
                    .in(MaterialInbound::getMaterialCode, materialCodes)
                    .orderByDesc(MaterialInbound::getInboundTime)
                    .orderByDesc(MaterialInbound::getCreateTime));
            for (MaterialInbound inbound : inboundList) {
                latestInboundByKey.putIfAbsent(buildMaterialKey(inbound.getMaterialCode(), inbound.getColor(), inbound.getSize()), inbound);
            }
        }

        Map<String, MaterialOutboundLog> latestOutboundByStockId = new HashMap<>();
        if (!stockIds.isEmpty()) {
            List<MaterialOutboundLog> outboundList = materialOutboundLogMapper.selectList(new LambdaQueryWrapper<MaterialOutboundLog>()
                    .eq(MaterialOutboundLog::getDeleteFlag, 0)
                    .in(MaterialOutboundLog::getStockId, stockIds)
                    .orderByDesc(MaterialOutboundLog::getOutboundTime)
                    .orderByDesc(MaterialOutboundLog::getCreateTime));
            for (MaterialOutboundLog outbound : outboundList) {
                if (StringUtils.hasText(outbound.getStockId())) {
                    latestOutboundByStockId.putIfAbsent(outbound.getStockId(), outbound);
                }
            }
        }

        for (MaterialStock record : records) {
            MaterialInbound inbound = latestInboundByKey.get(buildMaterialKey(record.getMaterialCode(), record.getColor(), record.getSize()));
            if (inbound != null) {
                record.setLastInboundBy(inbound.getOperatorName());
                if (record.getLastInboundDate() == null) {
                    record.setLastInboundDate(inbound.getInboundTime());
                }
            }

            MaterialOutboundLog outbound = latestOutboundByStockId.get(record.getId());
            if (outbound != null) {
                record.setLastOutboundBy(outbound.getOperatorName());
                if (record.getLastOutboundDate() == null) {
                    record.setLastOutboundDate(outbound.getOutboundTime());
                }
            }
        }
    }

    private String buildMaterialKey(String materialCode, String color, String size) {
        return String.join("|",
                Objects.toString(materialCode, ""),
                Objects.toString(color, ""),
                Objects.toString(size, ""));
    }
}
