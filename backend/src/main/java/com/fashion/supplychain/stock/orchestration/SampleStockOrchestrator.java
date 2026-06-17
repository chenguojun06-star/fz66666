package com.fashion.supplychain.stock.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.production.entity.PatternProduction;
import com.fashion.supplychain.production.entity.PatternScanRecord;
import com.fashion.supplychain.production.entity.ProductOutstock;
import com.fashion.supplychain.production.helper.PatternStatusHelper;
import com.fashion.supplychain.production.service.PatternProductionService;
import com.fashion.supplychain.production.service.PatternScanRecordService;
import com.fashion.supplychain.production.service.ProductOutstockService;
import com.fashion.supplychain.stock.dto.SampleStockInboundBatchRequest;
import com.fashion.supplychain.stock.entity.SampleLoan;
import com.fashion.supplychain.stock.entity.SampleStock;
import com.fashion.supplychain.stock.mapper.SampleLoanMapper;
import com.fashion.supplychain.stock.mapper.SampleStockMapper;
import com.fashion.supplychain.stock.service.SampleStockService;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.mapper.StyleInfoMapper;
import com.fashion.supplychain.warehouse.service.WarehouseAreaService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
@Slf4j
public class SampleStockOrchestrator {

    private static final DateTimeFormatter DESTROY_TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    @Autowired
    private SampleStockService sampleStockService;

    @Autowired
    private SampleLoanMapper sampleLoanMapper;

    @Autowired
    private SampleStockMapper sampleStockMapper;

    @Autowired
    private StyleInfoMapper styleInfoMapper;

    @Autowired
    private PatternProductionService patternProductionService;

    @Autowired
    private PatternScanRecordService patternScanRecordService;

    @Autowired
    private PatternStatusHelper patternStatusHelper;

    @Autowired
    private com.fashion.supplychain.production.service.ScanRecordService scanRecordService;

    @Autowired
    private WarehouseAreaService warehouseAreaService;

    @Autowired
    private ProductOutstockService productOutstockService;

    @Transactional(rollbackFor = Exception.class)
    public void inbound(SampleStock stock) {
        TenantAssert.assertTenantContext();
        Long currentTenantId = UserContext.tenantId();
        StyleInfo style = resolveStyleForInbound(stock, currentTenantId);
        syncInboundBaseFields(stock, style);
        validateInboundPayload(stock, style, currentTenantId);

        PatternProduction matchedPattern = findPatternForStock(stock);
        if (matchedPattern != null) {
            String reviewStatus = matchedPattern.getReviewStatus() != null
                    ? matchedPattern.getReviewStatus().trim().toUpperCase() : "";
            String reviewResult = matchedPattern.getReviewResult() != null
                    ? matchedPattern.getReviewResult().trim().toUpperCase() : "";
            boolean approved = "APPROVED".equals(reviewStatus) || "APPROVED".equals(reviewResult);
            if (!approved) {
                throw new IllegalStateException("样衣审核未通过，不能入库。请先在小程序或PC端完成样衣审核。");
            }
        }

        LambdaQueryWrapper<SampleStock> query = new LambdaQueryWrapper<SampleStock>()
                .eq(SampleStock::getDeleteFlag, 0)
                .eq(SampleStock::getStyleNo, stock.getStyleNo())
                .eq(SampleStock::getColor, stock.getColor())
                .eq(SampleStock::getSize, stock.getSize())
                .eq(SampleStock::getSampleType, stock.getSampleType())
                .eq(SampleStock::getTenantId, currentTenantId);

        SampleStock exist = sampleStockService.getOne(query);
        if (exist != null) {
            throw new IllegalArgumentException("该颜色尺码已入库，禁止重复入库");
        }

        stock.setCreateTime(LocalDateTime.now());
        stock.setUpdateTime(LocalDateTime.now());
        stock.setDeleteFlag(0);
        stock.setLoanedQuantity(0);
        stock.setTenantId(currentTenantId);
        sampleStockService.save(stock);

        if (matchedPattern != null) {
            saveInboundScanRecords(stock, matchedPattern, currentTenantId);
            patternStatusHelper.updatePatternStatusByOperation(matchedPattern, "WAREHOUSE_IN", UserContext.username());
            log.info("PC入库同步完成: styleNo={}, patternId={}", stock.getStyleNo(), matchedPattern.getId());
        } else {
            log.warn("PC入库未找到对应样板生产记录，仅创建库存记录: styleNo={}, color={}", stock.getStyleNo(), stock.getColor());
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public void inboundBatch(SampleStockInboundBatchRequest request) {
        TenantAssert.assertTenantContext();
        if (request == null || request.getRows() == null || request.getRows().isEmpty()) {
            throw new IllegalArgumentException("未识别到可入库的颜色尺码明细");
        }

        for (SampleStockInboundBatchRequest.Row row : request.getRows()) {
            SampleStock stock = new SampleStock();
            stock.setStyleId(request.getStyleId());
            stock.setStyleNo(request.getStyleNo());
            stock.setStyleName(request.getStyleName());
            stock.setSampleType(StringUtils.hasText(request.getSampleType()) ? request.getSampleType().trim() : "development");
            stock.setLocation(request.getLocation());
            stock.setWarehouseAreaId(request.getWarehouseAreaId());
            stock.setWarehouseAreaName(request.getWarehouseAreaName());
            stock.setRemark(request.getRemark());
            stock.setImageUrl(request.getImageUrl());
            stock.setColor(row == null ? null : row.getColor());
            stock.setSize(row == null ? null : row.getSize());
            stock.setQuantity(row == null ? null : row.getQuantity());
            inbound(stock);
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public void loan(SampleLoan loan) {
        TenantAssert.assertTenantContext();
        Long currentTenantId = UserContext.tenantId();

        SampleStock stock = sampleStockService.lambdaQuery()
                .eq(SampleStock::getId, loan.getSampleStockId())
                .eq(SampleStock::getTenantId, currentTenantId)
                .one();
        if (stock == null) {
            throw new IllegalArgumentException("样衣库存不存在");
        }

        int loanQty = loan.getQuantity() == null ? 1 : loan.getQuantity();
        if (loanQty <= 0) {
            throw new IllegalArgumentException("借出数量必须大于0");
        }

        boolean hasLendTo = StringUtils.hasText(loan.getLendTo());
        boolean hasLendToFactory = StringUtils.hasText(loan.getLendToFactoryId()) || StringUtils.hasText(loan.getLendToFactoryName());
        if (!hasLendTo && !hasLendToFactory) {
            throw new IllegalArgumentException("借入人或借入工厂不能为空，请填写借给谁");
        }

        if (hasLendToFactory && !StringUtils.hasText(loan.getLendToType())) {
            loan.setLendToType("factory");
        } else if (hasLendTo && !StringUtils.hasText(loan.getLendToType())) {
            loan.setLendToType("person");
        }

        int available = (stock.getQuantity() == null ? 0 : stock.getQuantity())
                - (stock.getLoanedQuantity() == null ? 0 : stock.getLoanedQuantity());

        if (available < loanQty) {
            throw new IllegalStateException("可用库存不足，无法借出");
        }

        loan.setLoanDate(LocalDateTime.now());
        loan.setCreateTime(LocalDateTime.now());
        loan.setUpdateTime(LocalDateTime.now());
        loan.setStatus("borrowed");
        loan.setDeleteFlag(0);
        loan.setTenantId(currentTenantId);
        loan.setRemainingQuantity(loanQty);
        loan.setOperatorId(UserContext.userId());
        loan.setOperatorName(UserContext.username());
        if (!StringUtils.hasText(loan.getBorrower())) {
            loan.setBorrower(UserContext.username());
        }
        if (!StringUtils.hasText(loan.getBorrowerId())) {
            loan.setBorrowerId(UserContext.userId());
        }
        if (StringUtils.hasText(loan.getWarehouseAreaId()) && !StringUtils.hasText(loan.getWarehouseAreaName())) {
            try {
                com.fashion.supplychain.warehouse.entity.WarehouseArea area = warehouseAreaService.getById(loan.getWarehouseAreaId());
                if (area != null) loan.setWarehouseAreaName(area.getAreaName());
            } catch (Exception ignored) {}
        }
        sampleLoanMapper.insert(loan);

        sampleStockMapper.updateLoanedQuantity(stock.getId(), loanQty, currentTenantId);

        PatternProduction loanPattern = findPatternForStock(stock);
        if (loanPattern != null) {
            try {
                PatternScanRecord scanRecord = new PatternScanRecord();
                scanRecord.setPatternProductionId(loanPattern.getId());
                scanRecord.setStyleId(loanPattern.getStyleId());
                scanRecord.setStyleNo(loanPattern.getStyleNo());
                scanRecord.setColor(loanPattern.getColor());
                scanRecord.setOperationType("WAREHOUSE_OUT");
                scanRecord.setOperatorId(UserContext.userId());
                scanRecord.setOperatorName(UserContext.username());
                scanRecord.setOperatorRole("WAREHOUSE");
                scanRecord.setScanTime(LocalDateTime.now());
                String lendToDesc = buildLendToDesc(loan);
                scanRecord.setRemark("样衣借出 → " + lendToDesc);
                scanRecord.setCreateTime(LocalDateTime.now());
                scanRecord.setDeleteFlag(0);
                patternScanRecordService.save(scanRecord);

                patternStatusHelper.updatePatternStatusByOperation(loanPattern, "WAREHOUSE_OUT", UserContext.username());
                log.info("样衣借出同步PatternProduction状态: patternId={}, lendTo={}", loanPattern.getId(), lendToDesc);
            } catch (Exception e) {
                log.error("样衣借出同步PatternProduction状态失败: styleNo={}", stock.getStyleNo(), e);
            }
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public void returnSample(String loanId, Integer returnQuantity, String remark) {
        TenantAssert.assertTenantContext();
        Long currentTenantId = UserContext.tenantId();
        SampleLoan loan = sampleLoanMapper.selectOne(new LambdaQueryWrapper<SampleLoan>()
                .eq(SampleLoan::getId, loanId)
                .eq(SampleLoan::getTenantId, currentTenantId));
        if (loan == null) {
            throw new IllegalArgumentException("借出记录不存在");
        }
        if (!"borrowed".equals(loan.getStatus())) {
            throw new IllegalStateException("该记录已归还或非借出状态");
        }

        int remaining = loan.getRemainingQuantity() != null ? loan.getRemainingQuantity() : loan.getQuantity();
        int qty = returnQuantity == null ? remaining : returnQuantity;
        if (qty <= 0) {
            throw new IllegalArgumentException("归还数量必须大于0");
        }
        if (qty > remaining) {
            throw new IllegalArgumentException("归还数量不能大于剩余未还数量(" + remaining + ")");
        }

        int newRemaining = remaining - qty;

        if (newRemaining == 0) {
            loan.setStatus("returned");
            loan.setReturnDate(LocalDateTime.now());
        }
        loan.setRemainingQuantity(newRemaining);
        loan.setUpdateTime(LocalDateTime.now());
        if (StringUtils.hasText(remark)) {
            String existingRemark = loan.getRemark();
            if (StringUtils.hasText(existingRemark)) {
                loan.setRemark(existingRemark + " | 归还备注: " + remark);
            } else {
                loan.setRemark("归还备注: " + remark);
            }
        }
        sampleLoanMapper.updateById(loan);

        sampleStockMapper.updateLoanedQuantity(loan.getSampleStockId(), -qty, currentTenantId);

        SampleStock returnStock = sampleStockService.lambdaQuery()
                .eq(SampleStock::getId, loan.getSampleStockId())
                .eq(SampleStock::getTenantId, currentTenantId)
                .one();
        if (returnStock != null) {
            PatternProduction returnPattern = findPatternForStock(returnStock);
            if (returnPattern != null) {
                try {
                    PatternScanRecord scanRecord = new PatternScanRecord();
                    scanRecord.setPatternProductionId(returnPattern.getId());
                    scanRecord.setStyleId(returnPattern.getStyleId());
                    scanRecord.setStyleNo(returnPattern.getStyleNo());
                    scanRecord.setColor(returnPattern.getColor());
                    scanRecord.setOperationType("WAREHOUSE_RETURN");
                    scanRecord.setOperatorId(UserContext.userId());
                    scanRecord.setOperatorName(UserContext.username());
                    scanRecord.setOperatorRole("WAREHOUSE");
                    scanRecord.setScanTime(LocalDateTime.now());
                    scanRecord.setRemark("样衣归还 " + qty + " 件");
                    scanRecord.setCreateTime(LocalDateTime.now());
                    scanRecord.setDeleteFlag(0);
                    patternScanRecordService.save(scanRecord);

                    patternStatusHelper.updatePatternStatusByOperation(returnPattern, "WAREHOUSE_RETURN", UserContext.username());
                    log.info("样衣归还同步PatternProduction状态: patternId={}", returnPattern.getId());
                } catch (Exception e) {
                    log.error("样衣归还同步PatternProduction状态失败: stockId={}", loan.getSampleStockId(), e);
                }
            }
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public void transferLoan(String sourceLoanId, SampleLoan newLoan) {
        TenantAssert.assertTenantContext();
        Long currentTenantId = UserContext.tenantId();

        SampleLoan sourceLoan = sampleLoanMapper.selectOne(new LambdaQueryWrapper<SampleLoan>()
                .eq(SampleLoan::getId, sourceLoanId)
                .eq(SampleLoan::getTenantId, currentTenantId));
        if (sourceLoan == null) {
            throw new IllegalArgumentException("原借调记录不存在");
        }
        if (!"borrowed".equals(sourceLoan.getStatus())) {
            throw new IllegalStateException("仅借出中状态可转借");
        }

        int sourceRemaining = sourceLoan.getRemainingQuantity() != null ? sourceLoan.getRemainingQuantity() : sourceLoan.getQuantity();
        int transferQty = newLoan.getQuantity() == null ? sourceRemaining : newLoan.getQuantity();
        if (transferQty <= 0 || transferQty > sourceRemaining) {
            throw new IllegalArgumentException("转借数量无效，剩余可转借 " + sourceRemaining + " 件");
        }

        boolean hasLendTo = StringUtils.hasText(newLoan.getLendTo());
        boolean hasLendToFactory = StringUtils.hasText(newLoan.getLendToFactoryId()) || StringUtils.hasText(newLoan.getLendToFactoryName());
        if (!hasLendTo && !hasLendToFactory) {
            throw new IllegalArgumentException("转借入人或工厂不能为空，请填写转借给谁");
        }

        newLoan.setSampleStockId(sourceLoan.getSampleStockId());
        newLoan.setLoanDate(LocalDateTime.now());
        newLoan.setCreateTime(LocalDateTime.now());
        newLoan.setUpdateTime(LocalDateTime.now());
        newLoan.setStatus("borrowed");
        newLoan.setDeleteFlag(0);
        newLoan.setTenantId(currentTenantId);
        newLoan.setQuantity(transferQty);
        newLoan.setRemainingQuantity(transferQty);
        newLoan.setTransferFromLoanId(sourceLoanId);
        newLoan.setOperatorId(UserContext.userId());
        newLoan.setOperatorName(UserContext.username());
        if (!StringUtils.hasText(newLoan.getBorrower())) {
            newLoan.setBorrower(sourceLoan.getLendTo());
        }
        if (!StringUtils.hasText(newLoan.getBorrowerId())) {
            newLoan.setBorrowerId(sourceLoan.getLendToId());
        }
        if (StringUtils.hasText(newLoan.getWarehouseAreaId()) && !StringUtils.hasText(newLoan.getWarehouseAreaName())) {
            try {
                com.fashion.supplychain.warehouse.entity.WarehouseArea area = warehouseAreaService.getById(newLoan.getWarehouseAreaId());
                if (area != null) newLoan.setWarehouseAreaName(area.getAreaName());
            } catch (Exception ignored) {}
        }
        sampleLoanMapper.insert(newLoan);

        int newSourceRemaining = sourceRemaining - transferQty;
        sourceLoan.setRemainingQuantity(newSourceRemaining);
        sourceLoan.setUpdateTime(LocalDateTime.now());
        if (newSourceRemaining == 0) {
            sourceLoan.setStatus("transferred");
        }
        String transferDesc = "转借 " + transferQty + " 件 → " + buildLendToDesc(newLoan);
        if (StringUtils.hasText(sourceLoan.getRemark())) {
            sourceLoan.setRemark(sourceLoan.getRemark() + " | " + transferDesc);
        } else {
            sourceLoan.setRemark(transferDesc);
        }
        sampleLoanMapper.updateById(sourceLoan);

        log.info("样衣转借完成: sourceLoanId={}, newLoanId={}, qty={}, lendTo={}",
                sourceLoanId, newLoan.getId(), transferQty, buildLendToDesc(newLoan));
    }

    @Transactional(rollbackFor = Exception.class)
    public void destroy(String stockId, String remark) {
        TenantAssert.assertTenantContext();
        if (!StringUtils.hasText(stockId)) {
            throw new IllegalArgumentException("库存记录不能为空");
        }
        if (!StringUtils.hasText(remark)) {
            throw new IllegalArgumentException("销毁必须填写备注原因");
        }

        Long tid = UserContext.tenantId();
        SampleStock stock = sampleStockService.lambdaQuery()
                .eq(SampleStock::getId, stockId)
                .eq(SampleStock::getDeleteFlag, 0)
                .eq(SampleStock::getTenantId, tid)
                .one();
        if (stock == null) {
            throw new IllegalArgumentException("样衣库存不存在");
        }
        if ((stock.getLoanedQuantity() == null ? 0 : stock.getLoanedQuantity()) > 0) {
            throw new IllegalStateException("当前样衣仍有借出记录，无法销毁");
        }

        LocalDateTime now = LocalDateTime.now();
        String destroyNote = "【销毁 " + now.format(DESTROY_TIME_FORMATTER) + "】" + remark.trim();
        String mergedRemark = StringUtils.hasText(stock.getRemark())
                ? stock.getRemark().trim() + System.lineSeparator() + destroyNote
                : destroyNote;

        boolean updated = sampleStockService.lambdaUpdate()
                .eq(SampleStock::getId, stockId)
                .eq(SampleStock::getDeleteFlag, 0)
                .set(SampleStock::getDeleteFlag, 1)
                .set(SampleStock::getRemark, mergedRemark)
                .set(SampleStock::getUpdateTime, now)
                .update();
        if (!updated) {
            throw new IllegalStateException("销毁失败，请刷新后重试");
        }

        PatternProduction destroyedPattern = findPatternForStock(stock);
        if (destroyedPattern != null) {
            try {
                destroyedPattern.setStatus("DESTROYED");
                destroyedPattern.setUpdateTime(now);
                patternProductionService.updateById(destroyedPattern);
                patternStatusHelper.updatePatternStatusByOperation(destroyedPattern, "DESTROY", UserContext.username());
                log.info("样衣销毁同步PatternProduction状态: patternId={}", destroyedPattern.getId());
            } catch (Exception e) {
                log.error("样衣销毁同步PatternProduction状态失败: styleNo={}", stock.getStyleNo(), e);
            }
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public String transferToOutstock(String stockId, Integer quantity, String customerName,
                                      String customerPhone, String shippingAddress,
                                      String trackingNo, String expressCompany, String remark) {
        TenantAssert.assertTenantContext();
        Long currentTenantId = UserContext.tenantId();

        SampleStock stock = sampleStockService.lambdaQuery()
                .eq(SampleStock::getId, stockId)
                .eq(SampleStock::getDeleteFlag, 0)
                .eq(SampleStock::getTenantId, currentTenantId)
                .one();
        if (stock == null) {
            throw new IllegalArgumentException("样衣库存不存在或已销毁");
        }

        int outQty = quantity != null ? quantity : 1;
        if (outQty <= 0) {
            throw new IllegalArgumentException("出库数量必须大于0");
        }

        int available = (stock.getQuantity() == null ? 0 : stock.getQuantity())
                - (stock.getLoanedQuantity() == null ? 0 : stock.getLoanedQuantity());
        if (available < outQty) {
            throw new IllegalStateException("可用库存不足，当前可用 " + available + " 件，无法出库 " + outQty + " 件");
        }

        stock.setQuantity(stock.getQuantity() - outQty);
        stock.setUpdateTime(LocalDateTime.now());
        sampleStockService.updateById(stock);

        ProductOutstock outstock = new ProductOutstock();
        outstock.setStyleId(stock.getStyleId());
        outstock.setStyleNo(stock.getStyleNo());
        outstock.setStyleName(stock.getStyleName());
        outstock.setColor(stock.getColor());
        outstock.setSize(stock.getSize());
        outstock.setOutstockQuantity(outQty);
        outstock.setOutstockType("sample_out");
        outstock.setSourceType("sample_stock");
        outstock.setCustomerName(customerName);
        outstock.setCustomerPhone(customerPhone);
        outstock.setShippingAddress(shippingAddress);
        outstock.setTrackingNo(trackingNo);
        outstock.setExpressCompany(expressCompany);
        outstock.setRemark(remark);
        outstock.setOperatorId(UserContext.userId());
        outstock.setOperatorName(UserContext.username());
        outstock.setCreatorId(UserContext.userId());
        outstock.setCreatorName(UserContext.username());
        outstock.setTenantId(currentTenantId);
        outstock.setCreateTime(LocalDateTime.now());
        outstock.setUpdateTime(LocalDateTime.now());
        outstock.setDeleteFlag(0);
        productOutstockService.save(outstock);

        PatternProduction pattern = findPatternForStock(stock);
        if (pattern != null) {
            try {
                PatternScanRecord scanRecord = new PatternScanRecord();
                scanRecord.setPatternProductionId(pattern.getId());
                scanRecord.setStyleId(pattern.getStyleId());
                scanRecord.setStyleNo(pattern.getStyleNo());
                scanRecord.setColor(pattern.getColor());
                scanRecord.setOperationType("TRANSFER_OUTSTOCK");
                scanRecord.setOperatorId(UserContext.userId());
                scanRecord.setOperatorName(UserContext.username());
                scanRecord.setOperatorRole("WAREHOUSE");
                scanRecord.setScanTime(LocalDateTime.now());
                scanRecord.setRemark("样衣转成品出库 " + outQty + " 件");
                scanRecord.setCreateTime(LocalDateTime.now());
                scanRecord.setDeleteFlag(0);
                patternScanRecordService.save(scanRecord);
                log.info("样衣转成品出库同步扫码记录: patternId={}, outstockId={}", pattern.getId(), outstock.getId());
            } catch (Exception e) {
                log.warn("样衣转成品出库同步扫码记录失败，不影响主流程: {}", e.getMessage());
            }
        }

        log.info("样衣转成品出库完成: stockId={}, outQty={}, outstockId={}", stockId, outQty, outstock.getId());
        return outstock.getId();
    }

    private void saveInboundScanRecords(SampleStock stock, PatternProduction matchedPattern, Long currentTenantId) {
        PatternScanRecord scanRecord = new PatternScanRecord();
        scanRecord.setPatternProductionId(matchedPattern.getId());
        scanRecord.setStyleId(matchedPattern.getStyleId());
        scanRecord.setStyleNo(matchedPattern.getStyleNo());
        scanRecord.setColor(matchedPattern.getColor());
        scanRecord.setOperationType("WAREHOUSE_IN");
        scanRecord.setOperatorId(UserContext.userId());
        scanRecord.setOperatorName(UserContext.username());
        scanRecord.setOperatorRole("WAREHOUSE");
        scanRecord.setScanTime(LocalDateTime.now());
        scanRecord.setRemark(stock.getRemark() != null ? stock.getRemark() : "PC端样衣库存入库");
        scanRecord.setWarehouseCode(stock.getLocation());
        scanRecord.setWarehouseAreaId(stock.getWarehouseAreaId());
        scanRecord.setWarehouseLocationCode(stock.getLocation());
        scanRecord.setCreateTime(LocalDateTime.now());
        scanRecord.setDeleteFlag(0);
        patternScanRecordService.save(scanRecord);

        try {
            com.fashion.supplychain.production.entity.ScanRecord sr = new com.fashion.supplychain.production.entity.ScanRecord();
            sr.setScanType("pattern");
            sr.setScanResult("success");
            sr.setOperatorId(UserContext.userId());
            sr.setOperatorName(UserContext.username());
            sr.setScanTime(LocalDateTime.now());
            sr.setStyleNo(matchedPattern.getStyleNo());
            sr.setOrderNo(matchedPattern.getStyleNo());
            sr.setColor(matchedPattern.getColor());
            sr.setProcessName("样衣入库");
            sr.setProcessCode("样衣入库");
            sr.setProgressStage("样衣入库");
            sr.setQuantity(1);
            sr.setTenantId(currentTenantId);
            sr.setFactoryId(null);
            sr.setCuttingBundleNo(null);
            sr.setRemark(stock.getRemark() != null ? stock.getRemark() : "PC端样衣库存入库");
            sr.setCreateTime(LocalDateTime.now());
            scanRecordService.saveScanRecord(sr);
        } catch (Exception e) {
            log.warn("PC端入库同步写入ScanRecord失败，不影响主流程: {}", e.getMessage());
        }
    }

    private String buildLendToDesc(SampleLoan loan) {
        if (StringUtils.hasText(loan.getLendToFactoryName())) {
            return loan.getLendToFactoryName() + (StringUtils.hasText(loan.getLendTo()) ? "(" + loan.getLendTo() + ")" : "");
        }
        return loan.getLendTo() != null ? loan.getLendTo() : "未知";
    }

    private PatternProduction findPatternForStock(SampleStock stock) {
        if (stock == null) {
            return null;
        }
        LambdaQueryWrapper<PatternProduction> query = new LambdaQueryWrapper<PatternProduction>()
                .eq(PatternProduction::getDeleteFlag, 0)
                .eq(StringUtils.hasText(stock.getStyleId()), PatternProduction::getStyleId, stock.getStyleId())
                .eq(!StringUtils.hasText(stock.getStyleId()) && StringUtils.hasText(stock.getStyleNo()), PatternProduction::getStyleNo, stock.getStyleNo())
                .eq(StringUtils.hasText(stock.getColor()), PatternProduction::getColor, stock.getColor())
                .orderByDesc(PatternProduction::getUpdateTime)
                .orderByDesc(PatternProduction::getCreateTime)
                .last("LIMIT 1");
        return patternProductionService.getOne(query, false);
    }

    private StyleInfo resolveStyleForInbound(SampleStock stock, Long tenantId) {
        if (stock == null || (!StringUtils.hasText(stock.getStyleId()) && !StringUtils.hasText(stock.getStyleNo()))) {
            throw new IllegalArgumentException("款号不能为空");
        }

        LambdaQueryWrapper<StyleInfo> query = new LambdaQueryWrapper<StyleInfo>()
                .eq(StringUtils.hasText(stock.getStyleId()), StyleInfo::getId, stock.getStyleId())
                .eq(!StringUtils.hasText(stock.getStyleId()) && StringUtils.hasText(stock.getStyleNo()), StyleInfo::getStyleNo, stock.getStyleNo())
                .eq(StyleInfo::getTenantId, tenantId)
                .last("LIMIT 1");
        StyleInfo style = styleInfoMapper.selectOne(query);
        if (style == null) {
            throw new IllegalArgumentException("未找到对应样衣开发资料");
        }
        return style;
    }

    private void syncInboundBaseFields(SampleStock stock, StyleInfo style) {
        stock.setStyleId(String.valueOf(style.getId()));
        stock.setStyleNo(style.getStyleNo());
        stock.setStyleName(style.getStyleName());
        if (!StringUtils.hasText(stock.getImageUrl()) && StringUtils.hasText(style.getCover())) {
            stock.setImageUrl(style.getCover());
        }
    }

    private void validateInboundPayload(SampleStock stock, StyleInfo style, Long tenantId) {
        if (!StringUtils.hasText(stock.getColor())) {
            throw new IllegalArgumentException("颜色不能为空");
        }
        if (!StringUtils.hasText(stock.getSize())) {
            throw new IllegalArgumentException("尺码不能为空");
        }
        if (stock.getQuantity() == null || stock.getQuantity() <= 0) {
            throw new IllegalArgumentException("入库数量必须大于0");
        }

        Map<String, Integer> validSpecMap = collectValidSpecMap(style.getColor(), style.getSize(), style.getSampleQuantity(), style.getSizeColorConfig());
        List<String> allowedColors = new ArrayList<>(new java.util.LinkedHashSet<>(validSpecMap.keySet().stream()
                .map(key -> key.split("\\|", 2)[0])
                .filter(StringUtils::hasText)
                .toList()));
        List<String> allowedSizes = new ArrayList<>(new java.util.LinkedHashSet<>(validSpecMap.keySet().stream()
                .map(key -> key.split("\\|", 2)[1])
                .filter(StringUtils::hasText)
                .toList()));
        if (!allowedColors.isEmpty() && !allowedColors.contains(stock.getColor().trim())) {
            throw new IllegalArgumentException("入库颜色与样衣开发资料不匹配");
        }
        if (!allowedSizes.isEmpty() && !allowedSizes.contains(stock.getSize().trim())) {
            throw new IllegalArgumentException("入库尺码与样衣开发资料不匹配");
        }
        if (!validSpecMap.isEmpty() && !validSpecMap.containsKey(stock.getColor().trim() + "|" + stock.getSize().trim())) {
            throw new IllegalArgumentException("入库颜色尺码与样衣生产配置不匹配");
        }

        int plannedQuantity = resolvePlannedQuantity(style, stock.getColor().trim(), stock.getSize().trim());
        if (plannedQuantity <= 0) {
            plannedQuantity = style.getSampleQuantity() != null && style.getSampleQuantity() > 0 ? style.getSampleQuantity() : 1;
        }

        List<SampleStock> existingStocks = sampleStockService.lambdaQuery()
                .eq(SampleStock::getDeleteFlag, 0)
                .eq(SampleStock::getSampleType, stock.getSampleType())
                .eq(SampleStock::getTenantId, tenantId)
                .eq(StringUtils.hasText(stock.getStyleId()), SampleStock::getStyleId, stock.getStyleId())
                .eq(StringUtils.hasText(stock.getColor()), SampleStock::getColor, stock.getColor().trim())
                .eq(StringUtils.hasText(stock.getSize()), SampleStock::getSize, stock.getSize().trim())
                .last("LIMIT 5000")
                .list();
        int currentTotal = existingStocks.stream()
                .mapToInt(item -> item.getQuantity() == null ? 0 : item.getQuantity())
                .sum();
        if (currentTotal + stock.getQuantity() > plannedQuantity) {
            throw new IllegalArgumentException("入库数量超过样衣生产数量，无法重复入库");
        }
    }

    private int resolvePlannedQuantity(StyleInfo style, String color, String size) {
        if (style == null) {
            return 0;
        }
        int matrixQuantity = resolveMatrixPlannedQuantity(style.getSizeColorConfig(), color, size);
        if (matrixQuantity > 0) {
            return matrixQuantity;
        }
        LambdaQueryWrapper<PatternProduction> query = new LambdaQueryWrapper<PatternProduction>()
                .eq(PatternProduction::getDeleteFlag, 0)
                .eq(StringUtils.hasText(String.valueOf(style.getId())), PatternProduction::getStyleId, String.valueOf(style.getId()))
                .eq(StringUtils.hasText(color), PatternProduction::getColor, color)
                .orderByDesc(PatternProduction::getUpdateTime)
                .orderByDesc(PatternProduction::getCreateTime)
                .last("LIMIT 1");
        PatternProduction pattern = patternProductionService.getOne(query, false);
        return pattern != null && pattern.getQuantity() != null ? pattern.getQuantity() : 0;
    }

    private int resolveMatrixPlannedQuantity(String sizeColorConfig, String color, String size) {
        if (!StringUtils.hasText(sizeColorConfig) || !StringUtils.hasText(color) || !StringUtils.hasText(size)) {
            return 0;
        }
        try {
            Map<String, Object> parsed = OBJECT_MAPPER.readValue(sizeColorConfig, new TypeReference<Map<String, Object>>() {});
            Object sizesRaw = parsed.get("sizes");
            if (!(sizesRaw instanceof List<?> sizes)) {
                return 0;
            }
            int sizeIndex = -1;
            for (int i = 0; i < sizes.size(); i++) {
                if (size.equals(String.valueOf(sizes.get(i)).trim())) {
                    sizeIndex = i;
                    break;
                }
            }
            if (sizeIndex < 0) {
                return 0;
            }

            Object rowsRaw = parsed.get("matrixRows");
            if (rowsRaw instanceof List<?> rows) {
                for (Object item : rows) {
                    if (!(item instanceof Map<?, ?> row)) {
                        continue;
                    }
                    String rowColor = row.get("color") == null ? "" : String.valueOf(row.get("color")).trim();
                    if (!color.equals(rowColor)) {
                        continue;
                    }
                    Object quantitiesRaw = row.get("quantities");
                    if (!(quantitiesRaw instanceof List<?> quantities) || sizeIndex >= quantities.size()) {
                        return 0;
                    }
                    Object quantity = quantities.get(sizeIndex);
                    return quantity instanceof Number ? ((Number) quantity).intValue() : Integer.parseInt(String.valueOf(quantity));
                }
            }

            Object colorsRaw = parsed.get("colors");
            Object topQuantitiesRaw = parsed.get("quantities");
            if (colorsRaw instanceof List<?> colors && topQuantitiesRaw instanceof List<?> topQuantities) {
                String configColor = "";
                for (Object item : colors) {
                    String normalized = item == null ? "" : String.valueOf(item).trim();
                    if (StringUtils.hasText(normalized)) {
                        configColor = normalized;
                        break;
                    }
                }
                if (color.equals(configColor) && sizeIndex < topQuantities.size()) {
                    Object quantity = topQuantities.get(sizeIndex);
                    return quantity instanceof Number ? ((Number) quantity).intValue() : Integer.parseInt(String.valueOf(quantity));
                }
            }
        } catch (Exception e) {
            log.warn("SampleStockOrchestrator.resolveMatrixPlannedQuantity 解析异常: {}", e.getMessage());
        }
        return 0;
    }

    private Map<String, Integer> collectValidSpecMap(String directColor, String directSize, Integer sampleQuantity, String sizeColorConfig) {
        LinkedHashMap<String, Integer> values = new LinkedHashMap<>();
        try {
            if (StringUtils.hasText(sizeColorConfig)) {
                parseSizeColorConfig(sizeColorConfig, values);
            }
        } catch (Exception e) {
            log.warn("SampleStockOrchestrator.collectValidSpecMap 解析异常: {}", e.getMessage());
        }

        if (!values.isEmpty()) {
            return values;
        }

        fallbackDirectSpecMap(directColor, directSize, sampleQuantity, values);
        return values;
    }

    private void parseSizeColorConfig(String sizeColorConfig, LinkedHashMap<String, Integer> values) throws Exception {
        Map<String, Object> parsed = OBJECT_MAPPER.readValue(sizeColorConfig, new TypeReference<Map<String, Object>>() {});
        List<String> sizes = extractSizes(parsed);

        Object rowsRaw = parsed.get("matrixRows");
        if (rowsRaw instanceof List<?> list) {
            for (Object item : list) {
                if (!(item instanceof Map<?, ?> row)) {
                    continue;
                }
                String color = row.get("color") == null ? "" : String.valueOf(row.get("color")).trim();
                Object quantitiesRaw = row.get("quantities");
                if (!StringUtils.hasText(color) || !(quantitiesRaw instanceof List<?> quantities)) {
                    continue;
                }
                for (int i = 0; i < sizes.size(); i++) {
                    int quantity = i < quantities.size() ? Integer.parseInt(String.valueOf(quantities.get(i) == null ? 0 : quantities.get(i))) : 0;
                    if (quantity > 0) {
                        values.put(color + "|" + sizes.get(i), quantity);
                    }
                }
            }
        }
        if (!values.isEmpty()) {
            return;
        }

        String color = extractFirstColor(parsed);
        if (!StringUtils.hasText(color)) {
            return;
        }
        Object topQuantitiesRaw = parsed.get("quantities");
        if (topQuantitiesRaw instanceof List<?> topQuantities) {
            for (int i = 0; i < sizes.size(); i++) {
                int quantity = i < topQuantities.size() ? Integer.parseInt(String.valueOf(topQuantities.get(i) == null ? 0 : topQuantities.get(i))) : 0;
                if (quantity > 0) {
                    values.put(color + "|" + sizes.get(i), quantity);
                }
            }
        }
    }

    private List<String> extractSizes(Map<String, Object> parsed) {
        List<String> sizes = new ArrayList<>();
        Object sizesRaw = parsed.get("sizes");
        if (sizesRaw instanceof List<?> list) {
            for (Object item : list) {
                String normalized = item == null ? "" : String.valueOf(item).trim();
                if (StringUtils.hasText(normalized)) {
                    sizes.add(normalized);
                }
            }
        }
        return sizes;
    }

    private String extractFirstColor(Map<String, Object> parsed) {
        Object colorsRaw = parsed.get("colors");
        if (colorsRaw instanceof List<?> list) {
            for (Object item : list) {
                String normalized = item == null ? "" : String.valueOf(item).trim();
                if (StringUtils.hasText(normalized)) {
                    return normalized;
                }
            }
        }
        return "";
    }

    private void fallbackDirectSpecMap(String directColor, String directSize, Integer sampleQuantity, LinkedHashMap<String, Integer> values) {
        List<String> colors = new ArrayList<>();
        for (String part : String.valueOf(directColor == null ? "" : directColor).split("[/，,\\s]+")) {
            String normalized = part == null ? "" : part.trim();
            if (StringUtils.hasText(normalized) && !colors.contains(normalized)) {
                colors.add(normalized);
            }
        }
        List<String> sizes = new ArrayList<>();
        for (String part : String.valueOf(directSize == null ? "" : directSize).split("[/，,\\s]+")) {
            String normalized = part == null ? "" : part.trim();
            if (StringUtils.hasText(normalized) && !sizes.contains(normalized)) {
                sizes.add(normalized);
            }
        }
        if (colors.size() == 1 && sizes.size() == 1 && sampleQuantity != null && sampleQuantity > 0) {
            values.put(colors.get(0) + "|" + sizes.get(0), sampleQuantity);
        }
    }

    private void fillDestroyMeta(SampleStock stock) {
        if (stock == null) {
            return;
        }
        if (!"destroyed".equals(stock.getInventoryStatus()) || !StringUtils.hasText(stock.getRemark())) {
            return;
        }

        String[] lines = stock.getRemark().split("\\r?\\n");
        for (int i = lines.length - 1; i >= 0; i--) {
            String line = lines[i] == null ? "" : lines[i].trim();
            if (!line.startsWith("【销毁 ")) {
                continue;
            }
            int end = line.indexOf("】");
            if (end <= 3) {
                continue;
            }
            String timeText = line.substring(3, end).replaceFirst("^销毁\\s*", "").trim();
            String remarkText = line.substring(end + 1).trim();
            stock.setDestroyRemark(remarkText);
            try {
                stock.setDestroyTime(LocalDateTime.parse(timeText, DESTROY_TIME_FORMATTER));
            } catch (Exception e) {
                log.warn("SampleStockOrchestrator.fillDestroyMeta 时间解析异常: timeText={}", timeText, e);
            }
            return;
        }
    }

    public Map<String, Object> scanQuery(String styleNo, String color, String size) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        if (!StringUtils.hasText(styleNo) || !StringUtils.hasText(color) || !StringUtils.hasText(size)) {
            throw new IllegalArgumentException("款号、颜色、尺码不能为空");
        }

        SampleStock stock = sampleStockService.lambdaQuery()
                .eq(SampleStock::getStyleNo, styleNo)
                .eq(SampleStock::getColor, color)
                .eq(SampleStock::getSize, size)
                .eq(SampleStock::getDeleteFlag, 0)
                .eq(SampleStock::getTenantId, tenantId)
                .one();

        Map<String, Object> result = new HashMap<>();
        List<String> actions = new ArrayList<>();

        if (stock == null) {
            result.put("found", false);
            actions.add("inbound");
        } else {
            result.put("found", true);
            result.put("stock", stock);

            int qty = stock.getQuantity() == null ? 0 : stock.getQuantity();
            int loaned = stock.getLoanedQuantity() == null ? 0 : stock.getLoanedQuantity();
            int available = qty - loaned;
            result.put("availableQuantity", available);

            if (available > 0) {
                actions.add("loan");
            }
            if (loaned > 0) {
                actions.add("return");
                List<SampleLoan> activeLoans = sampleLoanMapper.selectList(
                        new LambdaQueryWrapper<SampleLoan>()
                                .eq(SampleLoan::getSampleStockId, stock.getId())
                                .eq(SampleLoan::getStatus, "borrowed")
                                .eq(SampleLoan::getDeleteFlag, 0)
                                .eq(SampleLoan::getTenantId, tenantId));
                result.put("activeLoans", activeLoans);
            }
        }
        result.put("actions", actions);
        return result;
    }
}
