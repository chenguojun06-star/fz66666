package com.fashion.supplychain.system.importer;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.production.entity.MaterialDatabase;
import com.fashion.supplychain.production.entity.MaterialStock;
import com.fashion.supplychain.production.orchestration.MaterialInboundOrchestrator;
import com.fashion.supplychain.production.service.MaterialDatabaseService;
import com.fashion.supplychain.production.service.MaterialStockService;
import com.fashion.supplychain.common.UserContext;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import java.math.BigDecimal;
import java.util.*;

/**
 * 物料期初库存 Excel 导入器（D-751 租户入驻批量导入第一期）
 *
 * 语义：期初 = 一笔「手动入库」（MaterialInboundOrchestrator.manualInbound）——
 * 每行落一条入库台账 + 增加库存，账实同源、可审计，绝不裸写库存表。
 *
 * 防重边界：数量是累加语义（与页面手动入库一致），同编码多行（多颜色/多仓位）合法；
 * 物料编码必须已存在于物料主档，避免造出无主档的幽灵库存（D-586 教训）。
 *
 * 注意：本方法【故意不加 @Transactional】——manualInbound 自带事务，
 * 逐行独立提交/回滚，失败行不影响已成功行（整体一个事务反而会被内层
 * rollback-only 标记拖垮全部）。
 */
@Component
@Slf4j
public class MaterialOpeningStockExcelImporter {

    private static final String[] STOCK_HEADERS = {
            "物料编码*", "数量*", "颜色", "尺码/规格", "库位", "单价", "供应商名称", "备注"
    };
    private static final String[] STOCK_EXAMPLES = {
            "WL0001", "320", "黑色", "", "A区-01", "25.5", "广州XX面料厂", "期初库存"
    };

    @Autowired
    private MaterialDatabaseService materialDatabaseService;

    @Autowired
    private MaterialStockService materialStockService;

    @Autowired
    private MaterialInboundOrchestrator materialInboundOrchestrator;

    @Autowired
    private ExcelImportHelper importHelper;

    public ExcelImportHelper.TemplateConfig getTemplateConfig() {
        ExcelImportHelper.TemplateConfig config = new ExcelImportHelper.TemplateConfig();
        config.headers = STOCK_HEADERS;
        config.examples = STOCK_EXAMPLES;
        config.sheetName = "物料期初库存";
        config.notes = new String[]{
                "物料编码*: 必填，必须是「物料主档导入」中已存在的编码（推荐顺序：物料主档 → 期初库存）",
                "数量*: 必填，大于 0，支持小数（面料按米/公斤）",
                "同一物料不同颜色/规格/仓位：拆多行填，每行各落一条入库台账",
                "数量为累加语义：与仓库页「手动入库」完全一致，导入前请确认该物料当前库存",
                "单次最多导入 500 条"
        };
        return config;
    }

    public Map<String, Object> importMaterialOpeningStock(Long tenantId, MultipartFile file) {
        List<Map<String, String>> rows = importHelper.parseExcel(file, STOCK_HEADERS);
        if (rows.isEmpty()) {
            throw new IllegalArgumentException("Excel文件中没有数据");
        }
        if (rows.size() > 500) {
            throw new IllegalArgumentException("单次最多导入 500 条，当前 " + rows.size() + " 条");
        }

        List<Map<String, Object>> successRecords = new ArrayList<>();
        List<Map<String, Object>> failedRecords = new ArrayList<>();

        String operatorId = UserContext.userId();
        String operatorName = UserContext.username();

        for (int index = 0; index < rows.size(); index++) {
            Map<String, String> item = rows.get(index);
            try {
                String materialCode = importHelper.safe(item.get("物料编码*"));
                BigDecimal quantity = importHelper.parseDecimal(item.get("数量*"));
                if (!StringUtils.hasText(materialCode)) {
                    throw new IllegalArgumentException("物料编码不能为空");
                }
                if (quantity == null || quantity.compareTo(BigDecimal.ZERO) <= 0) {
                    throw new IllegalArgumentException("数量必须大于 0");
                }

                MaterialDatabase master = materialDatabaseService.getOne(
                        new LambdaQueryWrapper<MaterialDatabase>()
                                .eq(MaterialDatabase::getMaterialCode, materialCode)
                                .eq(MaterialDatabase::getTenantId, tenantId)
                                .and(w -> w.isNull(MaterialDatabase::getDeleteFlag).or().eq(MaterialDatabase::getDeleteFlag, 0))
                                .last("LIMIT 1")
                );
                if (master == null) {
                    throw new IllegalArgumentException("物料主档中不存在编码 " + materialCode + "，请先导入物料主档");
                }

                String color = importHelper.safe(item.get("颜色"));
                String size = importHelper.safe(item.get("尺码/规格"));
                String location = importHelper.safe(item.get("库位"));
                String supplierName = importHelper.safe(item.get("供应商名称"));
                BigDecimal unitPrice = importHelper.parseDecimal(item.get("单价"));
                BigDecimal beforeStock = getCurrentStock(materialCode, color);

                materialInboundOrchestrator.manualInbound(
                        materialCode,
                        master.getMaterialName(),
                        master.getMaterialType(),
                        color,
                        size,
                        quantity,
                        location,
                        supplierName != null ? supplierName : master.getSupplierName(),
                        operatorId,
                        operatorName,
                        buildRemark(importHelper.safe(item.get("备注")))
                );

                Map<String, Object> success = new LinkedHashMap<>();
                success.put("row", index + 2);
                success.put("materialCode", materialCode);
                success.put("quantity", quantity);
                success.put("currentStock", beforeStock.add(quantity));
                successRecords.add(success);
            } catch (Exception e) {
                Map<String, Object> fail = new LinkedHashMap<>();
                fail.put("row", index + 2);
                fail.put("materialCode", item.get("物料编码*"));
                fail.put("error", e.getMessage());
                failedRecords.add(fail);
            }
        }

        return importHelper.buildResult(rows.size(), successRecords, failedRecords, "物料期初库存");
    }

    private BigDecimal getCurrentStock(String materialCode, String color) {
        MaterialStock stock = materialStockService.getOne(
                new LambdaQueryWrapper<MaterialStock>()
                        .eq(MaterialStock::getMaterialCode, materialCode)
                        .eq(color != null, MaterialStock::getColor, color)
                        .last("LIMIT 1")
        );
        return stock != null && stock.getQuantity() != null ? stock.getQuantity() : BigDecimal.ZERO;
    }

    private String buildRemark(String userRemark) {
        String tag = "期初库存导入";
        return StringUtils.hasText(userRemark) ? tag + "：" + userRemark : tag;
    }
}
