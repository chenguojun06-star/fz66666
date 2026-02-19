package com.fashion.supplychain.stock.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.common.ParamUtils;
import com.fashion.supplychain.stock.entity.SampleLoan;
import com.fashion.supplychain.stock.entity.SampleStock;
import com.fashion.supplychain.stock.mapper.SampleLoanMapper;
import com.fashion.supplychain.stock.mapper.SampleStockMapper;
import com.fashion.supplychain.stock.service.SampleStockService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.Map;
import java.util.UUID;

@Service
@Slf4j
public class SampleStockServiceImpl extends ServiceImpl<SampleStockMapper, SampleStock> implements SampleStockService {

    @Autowired
    private SampleLoanMapper sampleLoanMapper;

    @Override
    public IPage<SampleStock> queryPage(Map<String, Object> params) {
        Integer page = ParamUtils.getPage(params);
        Integer pageSize = ParamUtils.getPageSize(params);
        Page<SampleStock> pageInfo = new Page<>(page, pageSize);

        String styleNo = (String) params.getOrDefault("styleNo", "");
        String sampleType = (String) params.getOrDefault("sampleType", "");

        LambdaQueryWrapper<SampleStock> wrapper = new LambdaQueryWrapper<SampleStock>()
                .eq(SampleStock::getDeleteFlag, 0)
                .like(StringUtils.hasText(styleNo), SampleStock::getStyleNo, styleNo)
                .eq(StringUtils.hasText(sampleType), SampleStock::getSampleType, sampleType)
                .orderByDesc(SampleStock::getUpdateTime);

        return baseMapper.selectPage(pageInfo, wrapper);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void inbound(SampleStock stock) {
        Long currentTenantId = com.fashion.supplychain.common.UserContext.tenantId();

        // Check if exists (style + color + size + type + tenantId)
        LambdaQueryWrapper<SampleStock> query = new LambdaQueryWrapper<SampleStock>()
                .eq(SampleStock::getDeleteFlag, 0)
                .eq(SampleStock::getStyleNo, stock.getStyleNo())
                .eq(SampleStock::getColor, stock.getColor())
                .eq(SampleStock::getSize, stock.getSize())
                .eq(SampleStock::getSampleType, stock.getSampleType())
                .eq(currentTenantId != null, SampleStock::getTenantId, currentTenantId);

        SampleStock exist = this.getOne(query);
        if (exist != null && !StringUtils.hasText(stock.getRemark())) {
            throw new IllegalArgumentException("重复入库需填写备注原因");
        }
        if (exist != null) {
            // Update quantity
            baseMapper.updateStockQuantity(exist.getId(), stock.getQuantity());
        } else {
            // Create new
            stock.setCreateTime(LocalDateTime.now());
            stock.setUpdateTime(LocalDateTime.now());
            stock.setDeleteFlag(0);
            stock.setLoanedQuantity(0);
            stock.setTenantId(currentTenantId);  // ✅ 设置租户ID
            if (!StringUtils.hasText(stock.getId())) {
                 // Mybatis-plus auto generates ID if configured, but let's ensure
            }
            this.save(stock);
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
        loan.setTenantId(currentTenantId);  // ✅ 设置租户ID
        sampleLoanMapper.insert(loan);

        // Update stock loaned quantity
        baseMapper.updateLoanedQuantity(stock.getId(), loanQty);
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
            loan.setRemark(remark);
        }
        sampleLoanMapper.updateById(loan);

        // Update stock loaned quantity (decrease)
        baseMapper.updateLoanedQuantity(loan.getSampleStockId(), -qty);
    }
}
