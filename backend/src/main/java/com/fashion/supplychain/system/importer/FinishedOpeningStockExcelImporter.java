package com.fashion.supplychain.system.importer;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.style.entity.ProductSku;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.ProductSkuService;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.warehouse.orchestration.FinishedWarehouseOperationOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import java.math.BigDecimal;
import java.util.*;

/**
 * 成品期初库存 Excel 导入器（D-751 租户入驻批量导入第一期）
 *
 * 语义：期初 = 一笔「自由入库」（FinishedWarehouseOperationOrchestrator.freeInbound）——
 * 增加对应 SKU 库存 + 落 t_product_warehousing 台账，账实同源、可审计，绝不裸写库存。
 *
 * 款号必须已存在（先导款式再导期初），避免自由入库自动造出无名字无品类的空壳款；
 * SKU 不存在时按 styleNo-颜色-码数 自动建（与成品入库页 autoCreateSku 同一路径）。
 *
 * 注意：本方法【故意不加 @Transactional】——freeInbound 自带事务，逐行独立提交/回滚，
 * 失败行不影响已成功行。
 */
@Component
@Slf4j
public class FinishedOpeningStockExcelImporter {

    private static final String[] STOCK_HEADERS = {
            "款号*", "数量*", "颜色", "码数", "库位", "单价", "备注"
    };
    private static final String[] STOCK_EXAMPLES = {
            "FZ2024001", "50", "黑色", "M", "默认仓", "89", "期初库存"
    };

    @Autowired
    private StyleInfoService styleInfoService;

    @Autowired
    private ProductSkuService productSkuService;

    @Autowired
    private FinishedWarehouseOperationOrchestrator finishedWarehouseOperationOrchestrator;

    @Autowired
    private ExcelImportHelper importHelper;

    public ExcelImportHelper.TemplateConfig getTemplateConfig() {
        ExcelImportHelper.TemplateConfig config = new ExcelImportHelper.TemplateConfig();
        config.headers = STOCK_HEADERS;
        config.examples = STOCK_EXAMPLES;
        config.sheetName = "成品期初库存";
        config.notes = new String[]{
                "款号*: 必填，必须是系统中已导入的款式（推荐顺序：款式 → 成品期初库存）",
                "数量*: 必填，正整数",
                "同一款号多颜色多码数：拆多行填，每行各落一条入库台账",
                "数量为累加语义：与成品仓储页「自由入库」完全一致，导入前请确认当前库存",
                "单价选填：入库台账金额与 SKU 成本价按此计，不填用款式定价",
                "单次最多导入 500 条"
        };
        return config;
    }

    public Map<String, Object> importFinishedOpeningStock(Long tenantId, MultipartFile file) {
        List<Map<String, String>> rows = importHelper.parseExcel(file, STOCK_HEADERS);
        if (rows.isEmpty()) {
            throw new IllegalArgumentException("Excel文件中没有数据");
        }
        if (rows.size() > 500) {
            throw new IllegalArgumentException("单次最多导入 500 条，当前 " + rows.size() + " 条");
        }

        List<Map<String, Object>> successRecords = new ArrayList<>();
        List<Map<String, Object>> failedRecords = new ArrayList<>();

        for (int index = 0; index < rows.size(); index++) {
            Map<String, String> item = rows.get(index);
            try {
                String styleNo = importHelper.safe(item.get("款号*"));
                Integer quantity = importHelper.parseInteger(item.get("数量*"));
                if (!StringUtils.hasText(styleNo)) {
                    throw new IllegalArgumentException("款号不能为空");
                }
                if (quantity == null || quantity <= 0) {
                    throw new IllegalArgumentException("数量必须是大于 0 的整数");
                }

                StyleInfo style = styleInfoService.getOne(
                        new LambdaQueryWrapper<StyleInfo>()
                                .eq(StyleInfo::getStyleNo, styleNo)
                                .eq(StyleInfo::getTenantId, tenantId)
                                .last("LIMIT 1")
                );
                if (style == null) {
                    throw new IllegalArgumentException("款式不存在: " + styleNo + "，请先导入款式资料");
                }

                String color = StringUtils.hasText(importHelper.safe(item.get("颜色")))
                        ? importHelper.safe(item.get("颜色")) : "默认色";
                String size = StringUtils.hasText(importHelper.safe(item.get("码数")))
                        ? importHelper.safe(item.get("码数")) : "均码";
                String location = importHelper.safe(item.get("库位"));
                BigDecimal unitPrice = importHelper.parseDecimal(item.get("单价"));

                String skuCode = resolveSkuCode(style, color, size, tenantId);

                Map<String, Object> params = new LinkedHashMap<>();
                params.put("skuCode", skuCode);
                params.put("quantity", quantity);
                params.put("warehouseLocation", StringUtils.hasText(location) ? location : "默认仓");
                params.put("sourceType", "free_inbound");
                params.put("autoCreateSku", true);
                params.put("styleNo", styleNo);
                params.put("color", color);
                params.put("size", size);
                params.put("unitPrice", unitPrice);
                params.put("remark", buildRemark(importHelper.safe(item.get("备注"))));

                finishedWarehouseOperationOrchestrator.freeInbound(params);

                Map<String, Object> success = new LinkedHashMap<>();
                success.put("row", index + 2);
                success.put("styleNo", styleNo);
                success.put("skuCode", skuCode);
                success.put("quantity", quantity);
                successRecords.add(success);
            } catch (Exception e) {
                Map<String, Object> fail = new LinkedHashMap<>();
                fail.put("row", index + 2);
                fail.put("styleNo", item.get("款号*"));
                fail.put("error", e.getMessage());
                failedRecords.add(fail);
            }
        }

        return importHelper.buildResult(rows.size(), successRecords, failedRecords, "成品期初库存");
    }

    /**
     * 优先复用该款式下同颜色同码数的既有 SKU 编码（保持与全系统条码一致）；
     * 不存在才按 styleNo-颜色-码数 构造，交由 freeInbound 的 autoCreateSku 建档。
     */
    private String resolveSkuCode(StyleInfo style, String color, String size, Long tenantId) {
        ProductSku existing = productSkuService.getOne(
                new LambdaQueryWrapper<ProductSku>()
                        .eq(ProductSku::getStyleId, style.getId())
                        .eq(ProductSku::getColor, color)
                        .eq(ProductSku::getSize, size)
                        .eq(ProductSku::getTenantId, tenantId)
                        .last("LIMIT 1")
        );
        if (existing != null && StringUtils.hasText(existing.getSkuCode())) {
            return existing.getSkuCode();
        }
        return style.getStyleNo() + "-" + color + "-" + size;
    }

    private String buildRemark(String userRemark) {
        String tag = "期初库存导入";
        return StringUtils.hasText(userRemark) ? tag + "：" + userRemark : tag;
    }
}
