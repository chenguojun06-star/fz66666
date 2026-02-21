package com.fashion.supplychain.production.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.common.lock.DistributedLockService;
import com.fashion.supplychain.production.entity.MaterialInbound;
import com.fashion.supplychain.production.mapper.MaterialInboundMapper;
import com.fashion.supplychain.production.service.MaterialInboundService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.concurrent.TimeUnit;

/**
 * 面辅料入库记录 Service 实现类
 */
@Slf4j
@Service
public class MaterialInboundServiceImpl extends ServiceImpl<MaterialInboundMapper, MaterialInbound>
        implements MaterialInboundService {

    @Autowired(required = false)
    private DistributedLockService distributedLockService;

    @Override
    public IPage<MaterialInbound> queryPage(Page<MaterialInbound> page, String materialCode, String purchaseId) {
        LambdaQueryWrapper<MaterialInbound> wrapper = new LambdaQueryWrapper<>();

        if (materialCode != null && !materialCode.trim().isEmpty()) {
            wrapper.eq(MaterialInbound::getMaterialCode, materialCode);
        }

        if (purchaseId != null && !purchaseId.trim().isEmpty()) {
            wrapper.eq(MaterialInbound::getPurchaseId, purchaseId);
        }

        wrapper.orderByDesc(MaterialInbound::getInboundTime);

        return this.page(page, wrapper);
    }

    @Override
    public String generateInboundNo() {
        // 优先使用分布式锁（支持多实例部署）；Redis 不可用时降级为单机 synchronized
        if (distributedLockService != null) {
            return distributedLockService.executeWithLockOrFallback(
                    "inbound:generateNo", 5, TimeUnit.SECONDS,
                    this::doGenerateInboundNo);
        }
        // 降级：单机 synchronized
        synchronized (this) {
            return doGenerateInboundNo();
        }
    }

    private String doGenerateInboundNo() {
        LocalDate today = LocalDate.now();
        String datePrefix = today.format(DateTimeFormatter.ofPattern("yyyyMMdd"));

        // 查询当天最大序号
        LambdaQueryWrapper<MaterialInbound> wrapper = new LambdaQueryWrapper<>();
        wrapper.likeRight(MaterialInbound::getInboundNo, "IB" + datePrefix)
               .orderByDesc(MaterialInbound::getInboundNo)
               .last("LIMIT 1");

        MaterialInbound lastInbound = this.getOne(wrapper);

        int sequence = 1;
        if (lastInbound != null && lastInbound.getInboundNo() != null) {
            String lastNo = lastInbound.getInboundNo();
            // IB20260131001 -> 001
            String lastSequence = lastNo.substring(lastNo.length() - 4);
            try {
                sequence = Integer.parseInt(lastSequence) + 1;
            } catch (NumberFormatException e) {
                log.warn("解析入库单号序号失败: {}", lastNo, e);
            }
        }

        return String.format("IB%s%04d", datePrefix, sequence);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public MaterialInbound createInboundAndUpdateStock(MaterialInbound inbound) {
        // 1. 生成入库单号（如果没有）
        if (inbound.getInboundNo() == null || inbound.getInboundNo().trim().isEmpty()) {
            inbound.setInboundNo(generateInboundNo());
        }

        // 2. 设置入库时间（如果没有）
        if (inbound.getInboundTime() == null) {
            inbound.setInboundTime(LocalDateTime.now());
        }

        // 3. 保存入库记录
        this.save(inbound);

        log.info("创建入库记录: 单号={}, 物料={}, 数量={}",
                inbound.getInboundNo(), inbound.getMaterialCode(), inbound.getInboundQuantity());

        // 4. 更新库存（注意：这里暂不更新，由 Orchestrator 统一协调）
        // 因为需要同时更新采购单的 inbound_record_id

        return inbound;
    }

    @Override
    public List<MaterialInbound> listByPurchaseId(String purchaseId) {
        if (purchaseId == null || purchaseId.trim().isEmpty()) {
            return List.of();
        }

        LambdaQueryWrapper<MaterialInbound> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(MaterialInbound::getPurchaseId, purchaseId)
               .orderByDesc(MaterialInbound::getInboundTime);

        return this.list(wrapper);
    }
}
