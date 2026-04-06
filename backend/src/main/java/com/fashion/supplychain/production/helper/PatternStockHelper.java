package com.fashion.supplychain.production.helper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.PatternProduction;
import com.fashion.supplychain.production.entity.PatternScanRecord;
import com.fashion.supplychain.stock.entity.SampleLoan;
import com.fashion.supplychain.stock.entity.SampleStock;
import com.fashion.supplychain.stock.mapper.SampleLoanMapper;
import com.fashion.supplychain.stock.mapper.SampleStockMapper;
import com.fashion.supplychain.stock.service.SampleStockService;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.*;

@Slf4j
@Service
public class PatternStockHelper {

    @Autowired
    private SampleStockService sampleStockService;

    @Autowired
    private SampleLoanMapper sampleLoanMapper;

    @Autowired
    private SampleStockMapper sampleStockMapper;

    @Autowired
    private StyleInfoService styleInfoService;

    @Autowired
    private ObjectMapper objectMapper;

    public void syncStockByOperation(PatternProduction pattern, PatternScanRecord scanRecord,
                                      String operationType, String operatorId, String operatorName) {
        if (pattern == null) return;
        Long tenantId = UserContext.tenantId();
        int qty = pattern.getQuantity() != null && pattern.getQuantity() > 0
                ? pattern.getQuantity() : 1;

        if ("WAREHOUSE_IN".equals(operationType)) {
            List<SampleStock> plannedStocks = buildInboundStocksFromPattern(pattern, scanRecord, tenantId);
            for (SampleStock stock : plannedStocks) {
                LambdaQueryWrapper<SampleStock> q = new LambdaQueryWrapper<SampleStock>()
                        .eq(SampleStock::getDeleteFlag, 0)
                        .eq(SampleStock::getStyleNo, stock.getStyleNo())
                        .eq(SampleStock::getColor, stock.getColor())
                        .eq(SampleStock::getSize, stock.getSize())
                        .eq(SampleStock::getSampleType, "development")
                        .eq(tenantId != null, SampleStock::getTenantId, tenantId);
                SampleStock existing = sampleStockService.getOne(q);
                if (existing != null) {
                    throw new IllegalStateException("该颜色尺码已存在库存，不能重复扫码入库");
                }
                sampleStockService.save(stock);
                log.info("[样衣扫码入库] 新建库存 styleNo={} color={} size={} qty={}",
                        stock.getStyleNo(), stock.getColor(), stock.getSize(), stock.getQuantity());
            }
        } else if ("WAREHOUSE_OUT".equals(operationType)) {
            LambdaQueryWrapper<SampleStock> q = new LambdaQueryWrapper<SampleStock>()
                    .eq(SampleStock::getDeleteFlag, 0)
                    .eq(SampleStock::getStyleNo, pattern.getStyleNo())
                    .eq(SampleStock::getColor, pattern.getColor())
                    .eq(SampleStock::getSampleType, "development")
                    .eq(tenantId != null, SampleStock::getTenantId, tenantId);
            SampleStock stock = sampleStockService.getOne(q);
            if (stock == null) {
                log.warn("[样衣出库] 未找到对应库存记录，跳过借出登记 styleNo={}", pattern.getStyleNo());
                return;
            }
            int available = (stock.getQuantity() == null ? 0 : stock.getQuantity())
                    - (stock.getLoanedQuantity() == null ? 0 : stock.getLoanedQuantity());
            if (available < qty) {
                throw new IllegalStateException(
                        String.format("样衣可用库存不足（可用%d件，出库%d件）", available, qty));
            }
            SampleLoan loan = new SampleLoan();
            loan.setSampleStockId(stock.getId());
            loan.setBorrower(operatorName);
            loan.setBorrowerId(operatorId);
            loan.setQuantity(qty);
            loan.setLoanDate(LocalDateTime.now());
            loan.setStatus("borrowed");
            loan.setRemark(scanRecord.getWarehouseCode() != null
                    ? "扫码出库，目的地：" + scanRecord.getWarehouseCode() : "扫码出库");
            loan.setCreateTime(LocalDateTime.now());
            loan.setUpdateTime(LocalDateTime.now());
            loan.setDeleteFlag(0);
            loan.setTenantId(tenantId);
            sampleLoanMapper.insert(loan);
            sampleStockMapper.updateLoanedQuantity(stock.getId(), qty);
            log.info("[样衣出库] loanId={} stockId={} qty={}", loan.getId(), stock.getId(), qty);
        } else if ("WAREHOUSE_RETURN".equals(operationType)) {
            LambdaQueryWrapper<SampleStock> sq = new LambdaQueryWrapper<SampleStock>()
                    .eq(SampleStock::getDeleteFlag, 0)
                    .eq(SampleStock::getStyleNo, pattern.getStyleNo())
                    .eq(SampleStock::getColor, pattern.getColor())
                    .eq(SampleStock::getSampleType, "development")
                    .eq(tenantId != null, SampleStock::getTenantId, tenantId);
            SampleStock stock = sampleStockService.getOne(sq);
            if (stock == null) {
                log.warn("[样衣归还] 未找到库存记录，跳过 styleNo={}", pattern.getStyleNo());
                return;
            }
            LambdaQueryWrapper<SampleLoan> lq = new LambdaQueryWrapper<SampleLoan>()
                    .eq(SampleLoan::getSampleStockId, stock.getId())
                    .eq(SampleLoan::getStatus, "borrowed")
                    .eq(SampleLoan::getDeleteFlag, 0)
                    .orderByDesc(SampleLoan::getLoanDate)
                    .last("LIMIT 1");
            SampleLoan loan = sampleLoanMapper.selectOne(lq);
            if (loan == null) {
                log.warn("[样衣归还] 未找到借出记录，跳过 stockId={}", stock.getId());
                return;
            }
            loan.setStatus("returned");
            loan.setReturnDate(LocalDateTime.now());
            loan.setUpdateTime(LocalDateTime.now());
            loan.setRemark("扫码归还");
            sampleLoanMapper.updateById(loan);
            sampleStockMapper.updateLoanedQuantity(stock.getId(), -loan.getQuantity());
            log.info("[样衣归还] loanId={} stockId={} qty=-{}", loan.getId(), stock.getId(), loan.getQuantity());
        }
    }

    private List<SampleStock> buildInboundStocksFromPattern(PatternProduction pattern, PatternScanRecord scanRecord, Long tenantId) {
        StyleInfo styleInfo = null;
        Long styleId = parseStyleId(pattern.getStyleId());
        if (styleId != null) {
            styleInfo = styleInfoService.getById(styleId);
        }
        if (styleInfo == null && StringUtils.hasText(pattern.getStyleNo())) {
            styleInfo = styleInfoService.lambdaQuery()
                    .eq(StyleInfo::getStyleNo, pattern.getStyleNo())
                    .last("LIMIT 1")
                    .one();
        }
        if (styleInfo == null) {
            throw new IllegalStateException("未找到样衣开发资料，无法自动匹配颜色尺码数量入库");
        }

        List<Map<String, Object>> specRows = extractConfiguredSpecRows(styleInfo, pattern.getColor());
        if (specRows.isEmpty()) {
            throw new IllegalStateException("未配置有生产数量的颜色尺码，无法扫码入库");
        }

        List<SampleStock> stocks = new ArrayList<>();
        for (Map<String, Object> row : specRows) {
            SampleStock stock = new SampleStock();
            stock.setStyleId(String.valueOf(styleInfo.getId()));
            stock.setStyleNo(styleInfo.getStyleNo());
            stock.setStyleName(styleInfo.getStyleName());
            stock.setImageUrl(styleInfo.getCover());
            stock.setColor(String.valueOf(row.get("color")));
            stock.setSize(String.valueOf(row.get("size")));
            stock.setSampleType("development");
            stock.setQuantity((Integer) row.get("quantity"));
            stock.setLoanedQuantity(0);
            stock.setLocation(scanRecord == null ? null : scanRecord.getWarehouseCode());
            stock.setRemark("扫码自动入库");
            stock.setCreateTime(LocalDateTime.now());
            stock.setUpdateTime(LocalDateTime.now());
            stock.setDeleteFlag(0);
            stock.setTenantId(tenantId);
            stocks.add(stock);
        }
        return stocks;
    }

    private List<Map<String, Object>> extractConfiguredSpecRows(StyleInfo styleInfo, String preferredColor) {
        List<Map<String, Object>> rows = new ArrayList<>();
        if (styleInfo == null || !StringUtils.hasText(styleInfo.getSizeColorConfig())) {
            return rows;
        }
        try {
            Map<String, Object> config = objectMapper.readValue(styleInfo.getSizeColorConfig(), new TypeReference<Map<String, Object>>() {});
            List<String> sizes = new ArrayList<>();
            Object sizesRaw = config.get("sizes");
            if (sizesRaw instanceof List<?> list) {
                for (Object item : list) {
                    String value = item == null ? "" : String.valueOf(item).trim();
                    if (StringUtils.hasText(value)) {
                        sizes.add(value);
                    }
                }
            }

            String directColor = StringUtils.hasText(styleInfo.getColor()) ? styleInfo.getColor().trim() : "";
            Object colorsRaw = config.get("colors");
            if (colorsRaw instanceof List<?> list) {
                for (Object item : list) {
                    String value = item == null ? "" : String.valueOf(item).trim();
                    if (StringUtils.hasText(value)) {
                        directColor = value;
                        break;
                    }
                }
            }
            if (!StringUtils.hasText(directColor)) {
                directColor = StringUtils.hasText(preferredColor) ? preferredColor.trim() : "";
            }

            Object matrixRowsRaw = config.get("matrixRows");
            if (matrixRowsRaw instanceof List<?> list) {
                for (Object item : list) {
                    if (!(item instanceof Map<?, ?> matrixRow)) {
                        continue;
                    }
                    String color = matrixRow.get("color") == null ? "" : String.valueOf(matrixRow.get("color")).trim();
                    if (!StringUtils.hasText(color)) {
                        continue;
                    }
                    if (StringUtils.hasText(preferredColor) && !preferredColor.trim().equalsIgnoreCase(color)) {
                        continue;
                    }
                    Object quantitiesRaw = matrixRow.get("quantities");
                    if (!(quantitiesRaw instanceof List<?> quantities)) {
                        continue;
                    }
                    for (int i = 0; i < sizes.size(); i++) {
                        int quantity = i < quantities.size() ? Integer.parseInt(String.valueOf(quantities.get(i) == null ? 0 : quantities.get(i))) : 0;
                        if (quantity <= 0) {
                            continue;
                        }
                        Map<String, Object> row = new HashMap<>();
                        row.put("color", color);
                        row.put("size", sizes.get(i));
                        row.put("quantity", quantity);
                        rows.add(row);
                    }
                }
            }
            if (!rows.isEmpty()) {
                return rows;
            }

            Object topQuantitiesRaw = config.get("quantities");
            if (StringUtils.hasText(directColor) && topQuantitiesRaw instanceof List<?> topQuantities) {
                for (int i = 0; i < sizes.size(); i++) {
                    int quantity = i < topQuantities.size() ? Integer.parseInt(String.valueOf(topQuantities.get(i) == null ? 0 : topQuantities.get(i))) : 0;
                    if (quantity <= 0) {
                        continue;
                    }
                    if (StringUtils.hasText(preferredColor) && !preferredColor.trim().equalsIgnoreCase(directColor)) {
                        continue;
                    }
                    Map<String, Object> row = new HashMap<>();
                    row.put("color", directColor);
                    row.put("size", sizes.get(i));
                    row.put("quantity", quantity);
                    rows.add(row);
                }
            }
        } catch (Exception e) {
            log.warn("解析样衣配置失败，styleNo={}, error={}", styleInfo.getStyleNo(), e.getMessage());
        }
        return rows;
    }

    private Long parseStyleId(String styleIdStr) {
        if (!StringUtils.hasText(styleIdStr)) return null;
        try { return Long.parseLong(styleIdStr.trim()); }
        catch (Exception e) { return null; }
    }
}
