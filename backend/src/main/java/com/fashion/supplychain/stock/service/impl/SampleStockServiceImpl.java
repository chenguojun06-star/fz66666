package com.fashion.supplychain.stock.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.common.ParamUtils;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.PatternProduction;
import com.fashion.supplychain.production.entity.PatternScanRecord;
import com.fashion.supplychain.production.service.PatternProductionService;
import com.fashion.supplychain.production.service.PatternScanRecordService;
import com.fashion.supplychain.production.helper.PatternStatusHelper;
import com.fashion.supplychain.production.orchestration.PatternProductionOrchestrator;
import com.fashion.supplychain.stock.dto.SampleStockInboundBatchRequest;
import com.fashion.supplychain.stock.entity.SampleLoan;
import com.fashion.supplychain.stock.entity.SampleStock;
import com.fashion.supplychain.stock.mapper.SampleLoanMapper;
import com.fashion.supplychain.stock.mapper.SampleStockMapper;
import com.fashion.supplychain.stock.service.SampleStockService;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.mapper.StyleInfoMapper;
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
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
@Slf4j
public class SampleStockServiceImpl extends ServiceImpl<SampleStockMapper, SampleStock> implements SampleStockService {
    private static final DateTimeFormatter DESTROY_TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    @Autowired
    private SampleLoanMapper sampleLoanMapper;

    @Autowired
    private StyleInfoMapper styleInfoMapper;

    @Autowired
    private PatternProductionService patternProductionService;

    @Autowired
    private PatternScanRecordService patternScanRecordService;

    @Autowired
    private PatternProductionOrchestrator patternProductionOrchestrator;

    @Autowired
    private PatternStatusHelper patternStatusHelper;

    @Override
    public IPage<SampleStock> queryPage(Map<String, Object> params) {
        Integer page = ParamUtils.getPage(params);
        Integer pageSize = ParamUtils.getPageSize(params);
        Page<SampleStock> pageInfo = new Page<>(page, pageSize);

        String styleNo = (String) params.getOrDefault("styleNo", "");
        String sampleType = (String) params.getOrDefault("sampleType", "");
        String recordStatus = String.valueOf(params.getOrDefault("recordStatus", "active")).trim().toLowerCase();

        Long tid = com.fashion.supplychain.common.UserContext.tenantId();
        LambdaQueryWrapper<SampleStock> wrapper = new LambdaQueryWrapper<SampleStock>()
                .eq(!"all".equals(recordStatus), SampleStock::getDeleteFlag, "destroyed".equals(recordStatus) ? 1 : 0)
                .eq(tid != null, SampleStock::getTenantId, tid)
                .like(StringUtils.hasText(styleNo), SampleStock::getStyleNo, styleNo)
                .eq(StringUtils.hasText(sampleType), SampleStock::getSampleType, sampleType)
                .orderByDesc(SampleStock::getCreateTime);

        IPage<SampleStock> result = baseMapper.selectPage(pageInfo, wrapper);
        fillStyleFields(result.getRecords());
        return result;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void inbound(SampleStock stock) {
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
                .eq(currentTenantId != null, SampleStock::getTenantId, currentTenantId);

        SampleStock exist = this.getOne(query);
        if (exist != null) {
            throw new IllegalArgumentException("该颜色尺码已入库，禁止重复入库");
        }

        stock.setCreateTime(LocalDateTime.now());
        stock.setUpdateTime(LocalDateTime.now());
        stock.setDeleteFlag(0);
        stock.setLoanedQuantity(0);
        stock.setTenantId(currentTenantId);
        this.save(stock);

        if (matchedPattern != null) {
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
            scanRecord.setCreateTime(LocalDateTime.now());
            scanRecord.setDeleteFlag(0);
            patternScanRecordService.save(scanRecord);

            patternStatusHelper.updatePatternStatusByOperation(matchedPattern, "WAREHOUSE_IN", UserContext.username());

            log.info("PC入库同步完成: styleNo={}, patternId={}", stock.getStyleNo(), matchedPattern.getId());
        } else {
            log.warn("PC入库未找到对应样板生产记录，仅创建库存记录: styleNo={}, color={}", stock.getStyleNo(), stock.getColor());
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void inboundBatch(SampleStockInboundBatchRequest request) {
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
            stock.setRemark(request.getRemark());
            stock.setImageUrl(request.getImageUrl());
            stock.setColor(row == null ? null : row.getColor());
            stock.setSize(row == null ? null : row.getSize());
            stock.setQuantity(row == null ? null : row.getQuantity());
            inbound(stock);
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void loan(SampleLoan loan) {
        Long currentTenantId = com.fashion.supplychain.common.UserContext.tenantId();

        SampleStock stock = this.getById(loan.getSampleStockId());
        if (stock == null) {
            throw new IllegalArgumentException("样衣库存不存在");
        }

        int loanQty = loan.getQuantity() == null ? 1 : loan.getQuantity();
        if (loanQty <= 0) {
             throw new IllegalArgumentException("借出数量必须大于0");
        }

        // Check available stock
        int available = (stock.getQuantity() == null ? 0 : stock.getQuantity()) -
                        (stock.getLoanedQuantity() == null ? 0 : stock.getLoanedQuantity());

        if (available < loanQty) {
            throw new IllegalStateException("可用库存不足，无法借出");
        }

        // Create loan record
        loan.setLoanDate(LocalDateTime.now());
        loan.setCreateTime(LocalDateTime.now());
        loan.setUpdateTime(LocalDateTime.now());
        loan.setStatus("borrowed");
        loan.setDeleteFlag(0);
        loan.setTenantId(currentTenantId);
        sampleLoanMapper.insert(loan);

        baseMapper.updateLoanedQuantity(stock.getId(), loanQty, currentTenantId);

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
                scanRecord.setRemark("PC端样衣借出");
                scanRecord.setCreateTime(LocalDateTime.now());
                scanRecord.setDeleteFlag(0);
                patternScanRecordService.save(scanRecord);

                patternStatusHelper.updatePatternStatusByOperation(loanPattern, "WAREHOUSE_OUT", UserContext.username());
                log.info("PC端借出同步PatternProduction状态: patternId={}", loanPattern.getId());
            } catch (Exception e) {
                log.error("PC端借出同步PatternProduction状态失败: styleNo={}", stock.getStyleNo(), e);
            }
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void returnSample(String loanId, Integer returnQuantity, String remark) {
        SampleLoan loan = sampleLoanMapper.selectById(loanId);
        if (loan == null) {
            throw new IllegalArgumentException("借出记录不存在");
        }
        if (!"borrowed".equals(loan.getStatus())) {
             throw new IllegalStateException("该记录已归还或非借出状态");
        }

        int qty = returnQuantity == null ? loan.getQuantity() : returnQuantity;
        if (qty > loan.getQuantity()) {
             throw new IllegalArgumentException("归还数量不能大于借出数量");
        }

        // Update loan status
        // For simplicity, we assume full return or mark as returned.
        // If partial return is needed, we might need split logic or just update status if qty matches.
        // Here assuming full return or final return for this record.
        loan.setStatus("returned");
        loan.setReturnDate(LocalDateTime.now());
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

        baseMapper.updateLoanedQuantity(loan.getSampleStockId(), -qty, com.fashion.supplychain.common.UserContext.tenantId());

        SampleStock returnStock = this.getById(loan.getSampleStockId());
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
                    scanRecord.setRemark("PC端样衣归还");
                    scanRecord.setCreateTime(LocalDateTime.now());
                    scanRecord.setDeleteFlag(0);
                    patternScanRecordService.save(scanRecord);

                    patternStatusHelper.updatePatternStatusByOperation(returnPattern, "WAREHOUSE_RETURN", UserContext.username());
                    log.info("PC端归还同步PatternProduction状态: patternId={}", returnPattern.getId());
                } catch (Exception e) {
                    log.error("PC端归还同步PatternProduction状态失败: stockId={}", loan.getSampleStockId(), e);
                }
            }
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void destroy(String stockId, String remark) {
        if (!StringUtils.hasText(stockId)) {
            throw new IllegalArgumentException("库存记录不能为空");
        }
        if (!StringUtils.hasText(remark)) {
            throw new IllegalArgumentException("销毁必须填写备注原因");
        }

        Long tid = com.fashion.supplychain.common.UserContext.tenantId();
        SampleStock stock = this.lambdaQuery()
                .eq(SampleStock::getId, stockId)
                .eq(SampleStock::getDeleteFlag, 0)
                .eq(tid != null, SampleStock::getTenantId, tid)
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

        boolean updated = this.lambdaUpdate()
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

    @Override
    public Map<String, Object> scanQuery(String styleNo, String color, String size) {
        Long tenantId = com.fashion.supplychain.common.UserContext.tenantId();
        if (!StringUtils.hasText(styleNo) || !StringUtils.hasText(color) || !StringUtils.hasText(size)) {
            throw new IllegalArgumentException("款号、颜色、尺码不能为空");
        }

        SampleStock stock = this.lambdaQuery()
                .eq(SampleStock::getStyleNo, styleNo)
                .eq(SampleStock::getColor, color)
                .eq(SampleStock::getSize, size)
                .eq(SampleStock::getDeleteFlag, 0)
                .eq(tenantId != null, SampleStock::getTenantId, tenantId)
                .one();

        Map<String, Object> result = new HashMap<>();
        List<String> actions = new ArrayList<>();

        if (stock == null) {
            result.put("found", false);
            actions.add("inbound");
        } else {
            fillStyleFields(List.of(stock));
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
                                .eq(SampleLoan::getDeleteFlag, 0));
                result.put("activeLoans", activeLoans);
            }
        }
        result.put("actions", actions);
        return result;
    }

    private void fillStyleFields(List<SampleStock> records) {
        if (records == null || records.isEmpty()) {
            return;
        }

        Set<Long> styleIds = new LinkedHashSet<>();
        Set<String> styleNos = new LinkedHashSet<>();
        for (SampleStock stock : records) {
            if (stock == null) {
                continue;
            }
            stock.setInventoryStatus(stock.getDeleteFlag() != null && stock.getDeleteFlag() == 1 ? "destroyed" : "active");
            fillDestroyMeta(stock);
            if (StringUtils.hasText(stock.getStyleId())) {
                try {
                    styleIds.add(Long.valueOf(stock.getStyleId().trim()));
                } catch (Exception e) {
                    log.warn("SampleStockServiceImpl.fillStyleFields styleId解析异常: styleId={}", stock.getStyleId(), e);
                }
            }
            if (StringUtils.hasText(stock.getStyleNo())) {
                styleNos.add(stock.getStyleNo().trim());
            }
        }

        if (styleIds.isEmpty() && styleNos.isEmpty()) {
            return;
        }

        LambdaQueryWrapper<StyleInfo> styleQuery = new LambdaQueryWrapper<StyleInfo>()
                .select(StyleInfo::getId, StyleInfo::getStyleNo, StyleInfo::getStyleName, StyleInfo::getPatternNo, StyleInfo::getSampleCompletedTime);
        if (!styleIds.isEmpty() && !styleNos.isEmpty()) {
            styleQuery.and(wrapper -> wrapper.in(StyleInfo::getId, new ArrayList<>(styleIds))
                    .or()
                    .in(StyleInfo::getStyleNo, new ArrayList<>(styleNos)));
        } else if (!styleIds.isEmpty()) {
            styleQuery.in(StyleInfo::getId, new ArrayList<>(styleIds));
        } else {
            styleQuery.in(StyleInfo::getStyleNo, new ArrayList<>(styleNos));
        }

        List<StyleInfo> styles = styleInfoMapper.selectList(styleQuery);
        if (styles == null || styles.isEmpty()) {
            return;
        }

        Map<Long, StyleInfo> byId = new HashMap<>();
        Map<String, StyleInfo> byNo = new HashMap<>();
        for (StyleInfo style : styles) {
            if (style == null) {
                continue;
            }
            if (style.getId() != null) {
                byId.putIfAbsent(style.getId(), style);
            }
            if (StringUtils.hasText(style.getStyleNo())) {
                byNo.putIfAbsent(style.getStyleNo().trim(), style);
            }
        }

        for (SampleStock stock : records) {
            if (stock == null) {
                continue;
            }
            StyleInfo style = null;
            if (StringUtils.hasText(stock.getStyleId())) {
                try {
                    style = byId.get(Long.valueOf(stock.getStyleId().trim()));
                } catch (Exception e) {
                    log.warn("SampleStockServiceImpl.fillStyleFields styleId查找异常: styleId={}", stock.getStyleId(), e);
                }
            }
            if (style == null && StringUtils.hasText(stock.getStyleNo())) {
                style = byNo.get(stock.getStyleNo().trim());
            }
            if (style == null) {
                continue;
            }
            if (!StringUtils.hasText(stock.getStyleName()) && StringUtils.hasText(style.getStyleName())) {
                stock.setStyleName(style.getStyleName());
            }
            if (!StringUtils.hasText(stock.getImageUrl()) && StringUtils.hasText(style.getCover())) {
                stock.setImageUrl(style.getCover());
            }
            stock.setPatternNo(style.getPatternNo());
            stock.setSampleCompletedTime(style.getSampleCompletedTime());
        }
    }

    /**
     * 根据库存记录查找对应的样板生产记录（按 styleId/styleNo + color 匹配，取最近更新的一条）
     * 供 inbound() 审核校验 + 扫码记录创建 + syncPatternCompletion 共用
     */
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
                .eq(tenantId != null, StyleInfo::getTenantId, tenantId)
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
        List<String> allowedColors = new ArrayList<>(new LinkedHashSet<>(validSpecMap.keySet().stream()
                .map(key -> key.split("\\|", 2)[0])
                .filter(StringUtils::hasText)
                .toList()));
        List<String> allowedSizes = new ArrayList<>(new LinkedHashSet<>(validSpecMap.keySet().stream()
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

        List<SampleStock> existingStocks = this.lambdaQuery()
                .eq(SampleStock::getDeleteFlag, 0)
                .eq(SampleStock::getSampleType, stock.getSampleType())
                .eq(tenantId != null, SampleStock::getTenantId, tenantId)
                .eq(StringUtils.hasText(stock.getStyleId()), SampleStock::getStyleId, stock.getStyleId())
                .eq(StringUtils.hasText(stock.getColor()), SampleStock::getColor, stock.getColor().trim())
                .eq(StringUtils.hasText(stock.getSize()), SampleStock::getSize, stock.getSize().trim())
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
            Object colorsRaw = parsed.get("colors");
            Object topQuantitiesRaw = parsed.get("quantities");
            Object rowsRaw = parsed.get("matrixRows");
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
            log.warn("SampleStockServiceImpl.resolveMatrixPlannedQuantity 解析异常: {}", e.getMessage());
        }
        return 0;
    }

    private Map<String, Integer> collectValidSpecMap(String directColor, String directSize, Integer sampleQuantity, String sizeColorConfig) {
        LinkedHashMap<String, Integer> values = new LinkedHashMap<>();
        try {
            if (StringUtils.hasText(sizeColorConfig)) {
                Map<String, Object> parsed = OBJECT_MAPPER.readValue(sizeColorConfig, new TypeReference<Map<String, Object>>() {});
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
                    return values;
                }

                String color = "";
                Object colorsRaw = parsed.get("colors");
                if (colorsRaw instanceof List<?> list) {
                    for (Object item : list) {
                        String normalized = item == null ? "" : String.valueOf(item).trim();
                        if (StringUtils.hasText(normalized)) {
                            color = normalized;
                            break;
                        }
                    }
                }
                if (!StringUtils.hasText(color)) {
                    color = String.valueOf(directColor == null ? "" : directColor).trim();
                }
                Object topQuantitiesRaw = parsed.get("quantities");
                if (StringUtils.hasText(color) && topQuantitiesRaw instanceof List<?> topQuantities) {
                    for (int i = 0; i < sizes.size(); i++) {
                        int quantity = i < topQuantities.size() ? Integer.parseInt(String.valueOf(topQuantities.get(i) == null ? 0 : topQuantities.get(i))) : 0;
                        if (quantity > 0) {
                            values.put(color + "|" + sizes.get(i), quantity);
                        }
                    }
                }
            }
        } catch (Exception e) {
            log.warn("SampleStockServiceImpl.collectValidSpecMap 解析异常: {}", e.getMessage());
        }

        if (!values.isEmpty()) {
            return values;
        }

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
        return values;
    }

    private void fillDestroyMeta(SampleStock stock) {
        if (stock == null) {
            return;
        }
        if (!StringUtils.hasText(stock.getInventoryStatus())) {
            stock.setInventoryStatus(stock.getDeleteFlag() != null && stock.getDeleteFlag() == 1 ? "destroyed" : "active");
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
                log.warn("SampleStockServiceImpl.fillDestroyMeta 时间解析异常: timeText={}", timeText, e);
            }
            return;
        }
    }
}
