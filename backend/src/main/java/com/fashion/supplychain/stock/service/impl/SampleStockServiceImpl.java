package com.fashion.supplychain.stock.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.common.ParamUtils;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.stock.dto.SampleStockInboundBatchRequest;
import com.fashion.supplychain.stock.entity.SampleLoan;
import com.fashion.supplychain.stock.entity.SampleStock;
import com.fashion.supplychain.stock.mapper.SampleLoanMapper;
import com.fashion.supplychain.stock.mapper.SampleStockMapper;
import com.fashion.supplychain.stock.orchestration.SampleStockOrchestrator;
import com.fashion.supplychain.stock.service.SampleStockService;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.mapper.StyleInfoMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
@Slf4j
public class SampleStockServiceImpl extends ServiceImpl<SampleStockMapper, SampleStock> implements SampleStockService {
    private static final DateTimeFormatter DESTROY_TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    @Autowired
    private StyleInfoMapper styleInfoMapper;

    @Autowired
    private SampleStockOrchestrator sampleStockOrchestrator;

    @Override
    public IPage<SampleStock> queryPage(Map<String, Object> params) {
        Integer page = ParamUtils.getPage(params);
        Integer pageSize = ParamUtils.getPageSize(params);
        Page<SampleStock> pageInfo = new Page<>(page, pageSize);

        String styleNo = (String) params.getOrDefault("styleNo", "");
        String sampleType = (String) params.getOrDefault("sampleType", "");
        String recordStatus = String.valueOf(params.getOrDefault("recordStatus", "active")).trim().toLowerCase();

        Long tid = com.fashion.supplychain.common.UserContext.tenantId();
        if (tid == null) log.warn("[租户隔离] 样衣库存查询租户上下文为空");
        LambdaQueryWrapper<SampleStock> wrapper = new LambdaQueryWrapper<SampleStock>()
                .eq(!"all".equals(recordStatus), SampleStock::getDeleteFlag, "destroyed".equals(recordStatus) ? 1 : 0)
                .eq(SampleStock::getTenantId, tid)
                .like(StringUtils.hasText(styleNo), SampleStock::getStyleNo, styleNo)
                .eq(StringUtils.hasText(sampleType), SampleStock::getSampleType, sampleType)
                .orderByDesc(SampleStock::getCreateTime);

        IPage<SampleStock> result = baseMapper.selectPage(pageInfo, wrapper);
        fillStyleFields(result.getRecords());
        return result;
    }

    @Override
    public void inbound(SampleStock stock) {
        sampleStockOrchestrator.inbound(stock);
    }

    @Override
    public void inboundBatch(SampleStockInboundBatchRequest request) {
        sampleStockOrchestrator.inboundBatch(request);
    }

    @Override
    public void loan(SampleLoan loan) {
        sampleStockOrchestrator.loan(loan);
    }

    @Override
    public void returnSample(String loanId, Integer returnQuantity, String remark) {
        sampleStockOrchestrator.returnSample(loanId, returnQuantity, remark);
    }

    @Override
    public void transferLoan(String sourceLoanId, SampleLoan newLoan) {
        sampleStockOrchestrator.transferLoan(sourceLoanId, newLoan);
    }

    @Override
    public void destroy(String stockId, String remark) {
        sampleStockOrchestrator.destroy(stockId, remark);
    }

    @Override
    public String transferToOutstock(String stockId, Integer quantity, String customerName,
                                      String customerPhone, String shippingAddress,
                                      String trackingNo, String expressCompany, String remark) {
        return sampleStockOrchestrator.transferToOutstock(stockId, quantity, customerName,
                customerPhone, shippingAddress, trackingNo, expressCompany, remark);
    }

    @Override
    public Map<String, Object> scanQuery(String styleNo, String color, String size) {
        return sampleStockOrchestrator.scanQuery(styleNo, color, size);
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
            collectStyleIdentifiers(stock, styleIds, styleNos);
        }

        if (styleIds.isEmpty() && styleNos.isEmpty()) {
            return;
        }

        Map<Long, StyleInfo> byId = new HashMap<>();
        Map<String, StyleInfo> byNo = new HashMap<>();
        loadStyleInfoMaps(styleIds, styleNos, byId, byNo);

        for (SampleStock stock : records) {
            if (stock == null) {
                continue;
            }
            applyStyleToStock(stock, byId, byNo);
        }
    }

    private void collectStyleIdentifiers(SampleStock stock, Set<Long> styleIds, Set<String> styleNos) {
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

    private void loadStyleInfoMaps(Set<Long> styleIds, Set<String> styleNos,
                                    Map<Long, StyleInfo> byId, Map<String, StyleInfo> byNo) {
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
    }

    private void applyStyleToStock(SampleStock stock, Map<Long, StyleInfo> byId, Map<String, StyleInfo> byNo) {
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
            return;
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
                log.warn("SampleStockServiceImpl.fillDestroyMeta 时间解析异常: timeText={}", timeText, e);
            }
            return;
        }
    }
}
