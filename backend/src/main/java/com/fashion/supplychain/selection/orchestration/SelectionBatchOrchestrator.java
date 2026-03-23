package com.fashion.supplychain.selection.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.selection.dto.SelectionBatchRequest;
import com.fashion.supplychain.selection.entity.SelectionBatch;
import com.fashion.supplychain.selection.entity.SelectionCandidate;
import com.fashion.supplychain.selection.service.SelectionBatchService;
import com.fashion.supplychain.selection.service.SelectionCandidateService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Map;

/**
 * 选品批次编排器
 * — 批次创建/修改/状态流转
 * — 批次统计聚合
 */
@Service
@Slf4j
public class SelectionBatchOrchestrator {

    @Autowired
    private SelectionBatchService batchService;

    @Autowired
    private SelectionCandidateService candidateService;

    /** 查询批次列表（分页） */
    public IPage<SelectionBatch> listBatch(int page, int size, Map<String, Object> filters) {
        Long tenantId = UserContext.tenantId();
        LambdaQueryWrapper<SelectionBatch> wrapper = new LambdaQueryWrapper<SelectionBatch>()
                .eq(SelectionBatch::getTenantId, tenantId)
                .eq(SelectionBatch::getDeleteFlag, 0)
                .orderByDesc(SelectionBatch::getCreateTime);

        String status = (String) filters.get("status");
        if (status != null && !status.isEmpty()) {
            wrapper.eq(SelectionBatch::getStatus, status);
        }
        Object year = filters.get("year");
        if (year != null) {
            wrapper.eq(SelectionBatch::getYear, Integer.valueOf(year.toString()));
        }
        String keyword = (String) filters.get("keyword");
        if (keyword != null && !keyword.isEmpty()) {
            wrapper.like(SelectionBatch::getBatchName, keyword);
        }
        return batchService.page(new Page<>(page, size), wrapper);
    }

    /** 创建批次 */
    @Transactional(rollbackFor = Exception.class)
    public SelectionBatch createBatch(SelectionBatchRequest req) {
        Long tenantId = UserContext.tenantId();
        String batchNo = "SEL-" + LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMdd"))
                + "-" + String.format("%04d", (int) (Math.random() * 9000) + 1000);

        SelectionBatch batch = new SelectionBatch();
        batch.setBatchNo(batchNo);
        batch.setBatchName(req.getBatchName());
        batch.setSeason(req.getSeason());
        batch.setYear(req.getYear() != null ? req.getYear() : LocalDateTime.now().getYear());
        batch.setTheme(req.getTheme());
        batch.setStatus("DRAFT");
        batch.setTargetQty(req.getTargetQty());
        batch.setFinalizedQty(0);
        batch.setRemark(req.getRemark());
        batch.setCreatedById(UserContext.userId());
        batch.setCreatedByName(UserContext.username());
        batch.setDeleteFlag(0);
        batch.setTenantId(tenantId);
        batchService.save(batch);
        log.info("[Selection] 创建选品批次: {}", batchNo);
        return batch;
    }

    /** 更新批次 */
    @Transactional(rollbackFor = Exception.class)
    public SelectionBatch updateBatch(Long id, SelectionBatchRequest req) {
        Long tenantId = UserContext.tenantId();
        SelectionBatch batch = batchService.getById(id);
        if (batch == null || !batch.getTenantId().equals(tenantId)) {
            throw new RuntimeException("批次不存在");
        }
        if ("APPROVED".equals(batch.getStatus()) || "CLOSED".equals(batch.getStatus())) {
            throw new RuntimeException("已确认/归档的批次不可修改");
        }
        if (req.getBatchName() != null) batch.setBatchName(req.getBatchName());
        if (req.getSeason() != null) batch.setSeason(req.getSeason());
        if (req.getYear() != null) batch.setYear(req.getYear());
        if (req.getTheme() != null) batch.setTheme(req.getTheme());
        if (req.getTargetQty() != null) batch.setTargetQty(req.getTargetQty());
        if (req.getRemark() != null) batch.setRemark(req.getRemark());
        batchService.updateById(batch);
        return batch;
    }

    /** 批次状态流转 */
    @Transactional(rollbackFor = Exception.class)
    public SelectionBatch stageAction(Long id, String action) {
        Long tenantId = UserContext.tenantId();
        SelectionBatch batch = batchService.getById(id);
        if (batch == null || !batch.getTenantId().equals(tenantId)) {
            throw new RuntimeException("批次不存在");
        }
        switch (action) {
            case "submit":
                if (!"DRAFT".equals(batch.getStatus())) throw new RuntimeException("仅草稿状态可提交评审");
                batch.setStatus("REVIEWING");
                break;
            case "approve":
                if (!"REVIEWING".equals(batch.getStatus())) throw new RuntimeException("仅评审中状态可确认");
                batch.setStatus("APPROVED");
                batch.setApprovedById(UserContext.userId());
                batch.setApprovedByName(UserContext.username());
                batch.setApprovedTime(LocalDateTime.now());
                // 统计已通过候选款数量
                long approvedCount = candidateService.count(
                        new LambdaQueryWrapper<SelectionCandidate>()
                                .eq(SelectionCandidate::getBatchId, id)
                                .eq(SelectionCandidate::getStatus, "APPROVED")
                                .eq(SelectionCandidate::getDeleteFlag, 0));
                batch.setFinalizedQty((int) approvedCount);
                break;
            case "close":
                batch.setStatus("CLOSED");
                break;
            case "reopen":
                if (!"CLOSED".equals(batch.getStatus())) throw new RuntimeException("仅归档状态可重新开启");
                batch.setStatus("REVIEWING");
                break;
            default:
                throw new RuntimeException("未知操作: " + action);
        }
        batchService.updateById(batch);
        log.info("[Selection] 批次 {} 状态流转: {}", batch.getBatchNo(), action);
        return batch;
    }

    /** 删除批次（软删除） */
    @Transactional(rollbackFor = Exception.class)
    public void deleteBatch(Long id) {
        Long tenantId = UserContext.tenantId();
        SelectionBatch batch = batchService.getById(id);
        if (batch == null) {
            // 幂等：已删除视为成功
            log.warn("[BATCH-DELETE] id={} already deleted, idempotent success", id);
            return;
        }
        if (!batch.getTenantId().equals(tenantId)) {
            throw new RuntimeException("批次不存在");
        }
        if ("APPROVED".equals(batch.getStatus())) {
            throw new RuntimeException("已确认批次不可删除");
        }
        batchService.removeById(id);
    }
}
