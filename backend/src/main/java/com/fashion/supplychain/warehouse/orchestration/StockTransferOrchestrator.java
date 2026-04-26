package com.fashion.supplychain.warehouse.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.warehouse.entity.StockTransfer;
import com.fashion.supplychain.warehouse.service.StockTransferService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.lang3.StringUtils;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.concurrent.ThreadLocalRandom;

@Slf4j
@Component
@RequiredArgsConstructor
public class StockTransferOrchestrator {

    private final StockTransferService transferService;

    public Result<Page<StockTransfer>> list(int page, int pageSize, String status,
                                             String transferType, String keyword) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        LambdaQueryWrapper<StockTransfer> qw = new LambdaQueryWrapper<>();
        qw.eq(StockTransfer::getTenantId, tenantId);
        qw.eq(StockTransfer::getDeleteFlag, 0);

        if (StringUtils.isNotBlank(status)) {
            qw.eq(StockTransfer::getStatus, status);
        }
        if (StringUtils.isNotBlank(transferType)) {
            qw.eq(StockTransfer::getTransferType, transferType);
        }
        if (StringUtils.isNotBlank(keyword)) {
            qw.and(w -> w.like(StockTransfer::getTransferNo, keyword)
                    .or().like(StockTransfer::getMaterialCode, keyword)
                    .or().like(StockTransfer::getStyleNo, keyword));
        }
        qw.orderByDesc(StockTransfer::getCreateTime);

        Page<StockTransfer> result = transferService.page(new Page<>(page, pageSize), qw);
        return Result.success(result);
    }

    @Transactional
    public Result<StockTransfer> create(StockTransfer transfer) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        if (StringUtils.isBlank(transfer.getFromLocationCode())) {
            return Result.fail("调出库位不能为空");
        }
        if (StringUtils.isBlank(transfer.getToLocationCode())) {
            return Result.fail("调入库位不能为空");
        }
        if (transfer.getFromLocationCode().equals(transfer.getToLocationCode())) {
            return Result.fail("调出和调入库位不能相同");
        }
        if (transfer.getQuantity() == null || transfer.getQuantity() <= 0) {
            return Result.fail("调拨数量必须大于0");
        }

        transfer.setTransferNo(generateTransferNo());
        transfer.setTenantId(tenantId);
        transfer.setDeleteFlag(0);
        transfer.setStatus("PENDING");
        transfer.setApplicantId(UserContext.userId());
        transfer.setApplicantName(UserContext.username());
        transfer.setCreateTime(LocalDateTime.now());
        transferService.save(transfer);

        log.info("[调拨] 创建调拨单: no={}, from={}, to={}, qty={}",
                transfer.getTransferNo(), transfer.getFromLocationCode(),
                transfer.getToLocationCode(), transfer.getQuantity());
        return Result.success(transfer);
    }

    @Transactional
    public Result<StockTransfer> approve(String id) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        StockTransfer transfer = transferService.lambdaQuery()
                .eq(StockTransfer::getId, id)
                .eq(StockTransfer::getTenantId, tenantId)
                .eq(StockTransfer::getDeleteFlag, 0)
                .one();
        if (transfer == null) {
            return Result.fail("调拨单不存在");
        }
        if (!"PENDING".equals(transfer.getStatus())) {
            return Result.fail("仅待审核状态可审批");
        }

        transfer.setStatus("APPROVED");
        transfer.setApproverId(UserContext.userId());
        transfer.setApproverName(UserContext.username());
        transfer.setApproveTime(LocalDateTime.now());
        transfer.setUpdateTime(LocalDateTime.now());
        transferService.updateById(transfer);

        log.info("[调拨] 审批通过: no={}", transfer.getTransferNo());
        return Result.success(transfer);
    }

    @Transactional
    public Result<StockTransfer> complete(String id) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        StockTransfer transfer = transferService.lambdaQuery()
                .eq(StockTransfer::getId, id)
                .eq(StockTransfer::getTenantId, tenantId)
                .eq(StockTransfer::getDeleteFlag, 0)
                .one();
        if (transfer == null) {
            return Result.fail("调拨单不存在");
        }
        if (!"APPROVED".equals(transfer.getStatus())) {
            return Result.fail("仅已审批状态可完成");
        }

        transfer.setStatus("COMPLETED");
        transfer.setUpdateTime(LocalDateTime.now());
        transferService.updateById(transfer);

        log.info("[调拨] 调拨完成: no={}", transfer.getTransferNo());
        return Result.success(transfer);
    }

    @Transactional
    public Result<Void> cancel(String id) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        StockTransfer transfer = transferService.lambdaQuery()
                .eq(StockTransfer::getId, id)
                .eq(StockTransfer::getTenantId, tenantId)
                .eq(StockTransfer::getDeleteFlag, 0)
                .one();
        if (transfer == null) {
            return Result.fail("调拨单不存在");
        }
        if ("COMPLETED".equals(transfer.getStatus())) {
            return Result.fail("已完成的调拨单不可取消");
        }

        transfer.setStatus("CANCELLED");
        transfer.setUpdateTime(LocalDateTime.now());
        transferService.updateById(transfer);

        log.info("[调拨] 取消调拨: no={}", transfer.getTransferNo());
        return Result.success(null);
    }

    private String generateTransferNo() {
        String date = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMdd"));
        int seq = ThreadLocalRandom.current().nextInt(1000, 9999);
        return "TF" + date + seq;
    }
}
