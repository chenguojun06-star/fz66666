package com.fashion.supplychain.selection.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.selection.dto.SelectionCandidateRequest;
import com.fashion.supplychain.selection.dto.SelectionReviewRequest;
import com.fashion.supplychain.selection.entity.SelectionBatch;
import com.fashion.supplychain.selection.entity.SelectionCandidate;
import com.fashion.supplychain.selection.entity.SelectionReview;
import com.fashion.supplychain.selection.service.SelectionBatchService;
import com.fashion.supplychain.selection.service.SelectionCandidateService;
import com.fashion.supplychain.selection.service.SelectionReviewService;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;

/**
 * 选品候选款+评审编排器
 * — 候选款 CRUD
 * — 评审提交与聚合
 * — 候选款状态流转（PENDING/APPROVED/REJECTED/HOLD）
 */
@Service
@Slf4j
public class SelectionCandidateOrchestrator {

    @Autowired
    private SelectionCandidateService candidateService;

    @Autowired
    private SelectionBatchService batchService;

    @Autowired
    private SelectionReviewService reviewService;

    private final ObjectMapper objectMapper = new ObjectMapper();

    /** 分页查询候选款列表 */
    public IPage<SelectionCandidate> listCandidates(int page, int size, Map<String, Object> filters) {
        Long tenantId = UserContext.tenantId();
        LambdaQueryWrapper<SelectionCandidate> wrapper = new LambdaQueryWrapper<SelectionCandidate>()
                .eq(SelectionCandidate::getTenantId, tenantId)
                .eq(SelectionCandidate::getDeleteFlag, 0)
                .orderByDesc(SelectionCandidate::getCreateTime);

        Object batchId = filters.get("batchId");
        if (batchId != null && !batchId.toString().trim().isEmpty()) {
            wrapper.eq(SelectionCandidate::getBatchId, Long.valueOf(batchId.toString()));
        }

        String status = (String) filters.get("status");
        if (status != null && !status.isEmpty()) wrapper.eq(SelectionCandidate::getStatus, status);

        String category = (String) filters.get("category");
        if (category != null && !category.isEmpty()) wrapper.eq(SelectionCandidate::getCategory, category);

        String keyword = (String) filters.get("keyword");
        if (keyword != null && !keyword.isEmpty()) wrapper.like(SelectionCandidate::getStyleName, keyword);

        try {
            return candidateService.page(new Page<>(page, size), wrapper);
        } catch (Exception ex) {
            String msg = ex.getMessage() != null ? ex.getMessage() : "";
            // 表不存在 → Flyway 迁移未执行，返回空页避免 500
            if (msg.contains("doesn't exist") || msg.contains("does not exist") || msg.contains("Table") || msg.contains("t_selection_candidate")) {
                log.error("[Selection] t_selection_candidate 表不存在，Flyway 迁移可能未执行: {}", msg);
                return new Page<>(page, size);
            }
            log.error("[Selection] listCandidates 查询失败: tenantId={}, err={}", tenantId, msg, ex);
            return new Page<>(page, size);
        }
    }

    /** 创建候选款（batchId 为空时自动归入「市场热品导入」批次） */
    @Transactional(rollbackFor = Exception.class)
    public SelectionCandidate createCandidate(SelectionCandidateRequest req) {
        Long tenantId = UserContext.tenantId();
        // 市场热品一键加入时 batchId 为空，自动获取或创建默认批次
        if (req.getBatchId() == null) {
            req.setBatchId(getOrCreateQuickImportBatch(tenantId));
        }
        validateBatchEditable(req.getBatchId(), tenantId);

        String candidateNo = "CAND-" + LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMddHH"))
                + "-" + String.format("%04d", (int) (Math.random() * 9000) + 1000);

        SelectionCandidate candidate = new SelectionCandidate();
        candidate.setBatchId(req.getBatchId());
        candidate.setCandidateNo(candidateNo);
        candidate.setStyleName(req.getStyleName());
        candidate.setCategory(req.getCategory());
        candidate.setColorFamily(req.getColorFamily());
        candidate.setFabricType(req.getFabricType());
        candidate.setSourceType(req.getSourceType() != null ? req.getSourceType() : "INTERNAL");
        candidate.setSourceDesc(req.getSourceDesc());
        candidate.setCostEstimate(req.getCostEstimate());
        candidate.setTargetPrice(req.getTargetPrice());
        candidate.setTargetQty(req.getTargetQty());
        candidate.setSeasonTags(req.getSeasonTags());
        candidate.setStyleTags(req.getStyleTags());
        candidate.setRemark(req.getRemark());
        candidate.setStatus("PENDING");
        candidate.setReviewCount(0);
        candidate.setDeleteFlag(0);
        candidate.setTenantId(tenantId);
        candidate.setCreatedById(UserContext.userId());
        candidate.setCreatedByName(UserContext.username());

        // 序列化图片列表
        if (req.getReferenceImages() != null && !req.getReferenceImages().isEmpty()) {
            try {
                candidate.setReferenceImages(objectMapper.writeValueAsString(req.getReferenceImages()));
            } catch (Exception e) {
                log.warn("[Selection] 图片序列化失败", e);
            }
        }

        // 预估利润率
        if (req.getTargetPrice() != null && req.getCostEstimate() != null
                && req.getCostEstimate().compareTo(BigDecimal.ZERO) > 0) {
            BigDecimal profit = req.getTargetPrice().subtract(req.getCostEstimate())
                    .divide(req.getTargetPrice(), 4, RoundingMode.HALF_UP)
                    .multiply(new BigDecimal("100"))
                    .setScale(2, RoundingMode.HALF_UP);
            candidate.setProfitEstimate(profit);
        }

        candidateService.save(candidate);
        log.info("[Selection] 新增候选款: {} batchId={}", candidateNo, req.getBatchId());
        return candidate;
    }

    /** 更新候选款 */
    @Transactional(rollbackFor = Exception.class)
    public SelectionCandidate updateCandidate(Long id, SelectionCandidateRequest req) {
        Long tenantId = UserContext.tenantId();
        SelectionCandidate candidate = getOwnedCandidate(id, tenantId);
        if ("APPROVED".equals(candidate.getStatus())) {
            throw new RuntimeException("已通过的候选款不可修改");
        }
        if (req.getStyleName() != null) candidate.setStyleName(req.getStyleName());
        if (req.getCategory() != null) candidate.setCategory(req.getCategory());
        if (req.getColorFamily() != null) candidate.setColorFamily(req.getColorFamily());
        if (req.getFabricType() != null) candidate.setFabricType(req.getFabricType());
        if (req.getSourceType() != null) candidate.setSourceType(req.getSourceType());
        if (req.getSourceDesc() != null) candidate.setSourceDesc(req.getSourceDesc());
        if (req.getCostEstimate() != null) candidate.setCostEstimate(req.getCostEstimate());
        if (req.getTargetPrice() != null) candidate.setTargetPrice(req.getTargetPrice());
        if (req.getTargetQty() != null) candidate.setTargetQty(req.getTargetQty());
        if (req.getSeasonTags() != null) candidate.setSeasonTags(req.getSeasonTags());
        if (req.getStyleTags() != null) candidate.setStyleTags(req.getStyleTags());
        if (req.getRemark() != null) candidate.setRemark(req.getRemark());
        if (req.getReferenceImages() != null) {
            try {
                candidate.setReferenceImages(objectMapper.writeValueAsString(req.getReferenceImages()));
            } catch (Exception e) { log.warn("[Selection] 图片序列化失败", e); }
        }
        // 重算利润率
        if (candidate.getTargetPrice() != null && candidate.getCostEstimate() != null
                && candidate.getTargetPrice().compareTo(BigDecimal.ZERO) > 0) {
            BigDecimal profit = candidate.getTargetPrice().subtract(candidate.getCostEstimate())
                    .divide(candidate.getTargetPrice(), 4, RoundingMode.HALF_UP)
                    .multiply(new BigDecimal("100")).setScale(2, RoundingMode.HALF_UP);
            candidate.setProfitEstimate(profit);
        }
        candidateService.updateById(candidate);
        return candidate;
    }

    /** 提交评审意见（每人每款只能提交一次，可覆盖） */
    @Transactional(rollbackFor = Exception.class)
    public SelectionReview submitReview(SelectionReviewRequest req) {
        Long tenantId = UserContext.tenantId();
        String reviewerId = UserContext.userId();

        SelectionCandidate candidate = getOwnedCandidate(req.getCandidateId(), tenantId);

        // 查找是否已评审过（可覆盖）
        SelectionReview existing = reviewService.getOne(
                new LambdaQueryWrapper<SelectionReview>()
                        .eq(SelectionReview::getCandidateId, req.getCandidateId())
                        .eq(SelectionReview::getReviewerId, reviewerId));

        SelectionReview review = existing != null ? existing : new SelectionReview();
        review.setCandidateId(req.getCandidateId());
        review.setBatchId(candidate.getBatchId());
        review.setReviewerId(reviewerId);
        review.setReviewerName(UserContext.username());
        review.setScore(req.getScore());
        review.setDecision(req.getDecision());
        review.setComment(req.getComment());
        review.setDimensions(req.getDimensions());
        review.setReviewTime(LocalDateTime.now());
        review.setTenantId(tenantId);

        if (existing != null) {
            reviewService.updateById(review);
        } else {
            reviewService.save(review);
        }

        // 重新聚合平均分
        recalcCandidateAvgScore(req.getCandidateId(), tenantId);
        log.info("[Selection] 评审提交: candidateId={} decision={}", req.getCandidateId(), req.getDecision());
        return review;
    }

    /** 候选款状态流转（老板/负责人最终裁定） */
    @Transactional(rollbackFor = Exception.class)
    public SelectionCandidate decideCandidate(Long id, String action, String reason) {
        Long tenantId = UserContext.tenantId();
        SelectionCandidate candidate = getOwnedCandidate(id, tenantId);
        switch (action) {
            case "approve":
                candidate.setStatus("APPROVED");
                break;
            case "reject":
                candidate.setStatus("REJECTED");
                candidate.setRejectReason(reason);
                break;
            case "hold":
                candidate.setStatus("HOLD");
                break;
            case "reset":
                candidate.setStatus("PENDING");
                candidate.setRejectReason(null);
                break;
            default:
                throw new RuntimeException("未知操作: " + action);
        }
        candidateService.updateById(candidate);
        log.info("[Selection] 候选款 {} 状态变更: {}", candidate.getCandidateNo(), action);
        return candidate;
    }

    /** 删除候选款（软删除） */
    @Transactional(rollbackFor = Exception.class)
    public void deleteCandidate(Long id) {
        Long tenantId = UserContext.tenantId();
        SelectionCandidate candidate = getOwnedCandidate(id, tenantId);
        if ("APPROVED".equals(candidate.getStatus())) {
            LocalDateTime baseTime = candidate.getUpdateTime() != null ? candidate.getUpdateTime() : candidate.getCreateTime();
            if (baseTime == null || Duration.between(baseTime, LocalDateTime.now()).toDays() < 10) {
                throw new RuntimeException("审核通过后的候选款需保留满10天后才可删除");
            }
        }
        candidate.setDeleteFlag(1);
        candidateService.updateById(candidate);
    }

    /** 查询该候选款所有评审记录 */
    public List<SelectionReview> getReviews(Long candidateId) {
        Long tenantId = UserContext.tenantId();
        return reviewService.list(new LambdaQueryWrapper<SelectionReview>()
                .eq(SelectionReview::getCandidateId, candidateId)
                .eq(SelectionReview::getTenantId, tenantId)
                .orderByDesc(SelectionReview::getReviewTime));
    }

    // ── 私有方法 ────────────────────────────────────────────

    private void recalcCandidateAvgScore(Long candidateId, Long tenantId) {
        List<SelectionReview> reviews = reviewService.list(new LambdaQueryWrapper<SelectionReview>()
                .eq(SelectionReview::getCandidateId, candidateId)
                .eq(SelectionReview::getTenantId, tenantId)
                .isNotNull(SelectionReview::getScore));
        if (reviews.isEmpty()) return;

        BigDecimal sum = reviews.stream()
                .filter(r -> r.getScore() != null)
                .map(r -> new BigDecimal(r.getScore()))
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal avg = sum.divide(new BigDecimal(reviews.size()), 2, RoundingMode.HALF_UP);

        SelectionCandidate candidate = candidateService.getById(candidateId);
        candidate.setAvgReviewScore(avg);
        candidate.setReviewCount(reviews.size());
        candidateService.updateById(candidate);
    }

    private SelectionCandidate getOwnedCandidate(Long id, Long tenantId) {
        SelectionCandidate candidate = candidateService.getById(id);
        if (candidate == null || !candidate.getTenantId().equals(tenantId) || candidate.getDeleteFlag() == 1) {
            throw new RuntimeException("候选款不存在");
        }
        return candidate;
    }

    private void validateBatchEditable(Long batchId, Long tenantId) {
        SelectionBatch batch = batchService.getById(batchId);
        if (batch == null || !batch.getTenantId().equals(tenantId)) {
            throw new RuntimeException("批次不存在");
        }
        if ("APPROVED".equals(batch.getStatus()) || "CLOSED".equals(batch.getStatus())) {
            throw new RuntimeException("该批次已锁定，不可新增候选款");
        }
    }

    /**
     * 获取或创建「市场热品导入」默认批次。
     * 当用户在市场热品页直接点「加入选品」/「一键下版」且未选批次时调用。
     * 按年份+品季复用同名 DRAFT/REVIEWING 批次，避免重复建批。
     */
    private Long getOrCreateQuickImportBatch(Long tenantId) {
        int year  = LocalDateTime.now().getYear();
        int month = LocalDateTime.now().getMonthValue();
        String season    = (month >= 3 && month <= 8) ? "spring_summer" : "autumn_winter";
        String seasonCn  = season.equals("spring_summer") ? "春夏" : "秋冬";
        String batchName = "市场热品导入-" + year + seasonCn;

        // 查找同名可编辑批次（DRAFT 或 REVIEWING）
        LambdaQueryWrapper<SelectionBatch> q = new LambdaQueryWrapper<SelectionBatch>()
                .eq(SelectionBatch::getTenantId, tenantId)
                .eq(SelectionBatch::getBatchName, batchName)
                .eq(SelectionBatch::getDeleteFlag, 0)
                .in(SelectionBatch::getStatus, "DRAFT", "REVIEWING")
                .orderByDesc(SelectionBatch::getCreateTime)
                .last("LIMIT 1");
        SelectionBatch existing = batchService.getOne(q);
        if (existing != null) {
            return existing.getId();
        }

        // 不存在则自动创建
        SelectionBatch batch = new SelectionBatch();
        batch.setBatchNo("SEL-MKT-" + LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMdd"))
                + "-" + String.format("%04d", (int) (Math.random() * 9000) + 1000));
        batch.setBatchName(batchName);
        batch.setSeason(season);
        batch.setYear(year);
        batch.setStatus("DRAFT");
        batch.setFinalizedQty(0);
        batch.setDeleteFlag(0);
        batch.setTenantId(tenantId);
        batch.setCreatedById(UserContext.userId());
        batch.setCreatedByName(UserContext.username());
        batchService.save(batch);
        log.info("[Selection] 自动创建市场热品默认批次: batchName={}, tenantId={}, batchId={}",
                batchName, tenantId, batch.getId());
        return batch.getId();
    }
}
