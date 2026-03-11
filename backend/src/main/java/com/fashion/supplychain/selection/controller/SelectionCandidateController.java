package com.fashion.supplychain.selection.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.selection.dto.SelectionCandidateRequest;
import com.fashion.supplychain.selection.dto.SelectionReviewRequest;
import com.fashion.supplychain.selection.entity.SelectionCandidate;
import com.fashion.supplychain.selection.entity.SelectionReview;
import com.fashion.supplychain.selection.orchestration.SelectionApprovalOrchestrator;
import com.fashion.supplychain.selection.orchestration.SelectionCandidateOrchestrator;
import com.fashion.supplychain.selection.orchestration.TrendAnalysisOrchestrator;
import com.fashion.supplychain.style.entity.StyleInfo;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 选品候选款 Controller
 * — 候选款 CRUD / 评审 / 状态裁定 / AI打分
 */
@RestController
@RequestMapping("/api/selection/candidate")
@PreAuthorize("isAuthenticated()")
public class SelectionCandidateController {

    @Autowired
    private SelectionCandidateOrchestrator candidateOrchestrator;

    @Autowired
    private SelectionApprovalOrchestrator approvalOrchestrator;

    @Autowired
    private TrendAnalysisOrchestrator trendOrchestrator;

    /** 候选款分页列表 */
    @PostMapping("/list")
    public Result<IPage<SelectionCandidate>> list(@RequestBody Map<String, Object> params) {
        int page = params.get("page") != null ? Integer.parseInt(params.get("page").toString()) : 1;
        // 兼容前端 pageSize 和 size 两种参数名
        Object sizeObj = params.get("pageSize") != null ? params.get("pageSize") : params.get("size");
        int size = sizeObj != null ? Integer.parseInt(sizeObj.toString()) : 10;
        Map<String, Object> filters = new HashMap<>(params);
        filters.remove("page");
        filters.remove("size");
        filters.remove("pageSize");
        return Result.success(candidateOrchestrator.listCandidates(page, size, filters));
    }

    /** 新增候选款 */
    @PostMapping("/save")
    public Result<SelectionCandidate> save(@RequestBody SelectionCandidateRequest req) {
        if (req.getStyleName() == null || req.getStyleName().isEmpty()) {
            return Result.fail("款式名称不能为空");
        }
        if (req.getBatchId() == null) {
            return Result.fail("批次ID不能为空");
        }
        return Result.success(candidateOrchestrator.createCandidate(req));
    }

    /** 更新候选款 */
    @PostMapping("/update/{id}")
    public Result<SelectionCandidate> update(@PathVariable Long id, @RequestBody SelectionCandidateRequest req) {
        return Result.success(candidateOrchestrator.updateCandidate(id, req));
    }

    /** 提交评审意见 */
    @PostMapping("/review")
    public Result<SelectionReview> review(@RequestBody SelectionReviewRequest req) {
        if (req.getCandidateId() == null || req.getDecision() == null) {
            return Result.fail("候选款ID和评审意见不能为空");
        }
        return Result.success(candidateOrchestrator.submitReview(req));
    }

    /** 查看某款的全部评审记录 */
    @GetMapping("/{id}/reviews")
    public Result<List<SelectionReview>> getReviews(@PathVariable Long id) {
        return Result.success(candidateOrchestrator.getReviews(id));
    }

    /** 最终裁定：approve / reject / hold / reset */
    @PostMapping("/{id}/stage-action")
    public Result<SelectionCandidate> stageAction(
            @PathVariable Long id,
            @RequestParam String action,
            @RequestParam(required = false) String reason) {
        return Result.success(candidateOrchestrator.decideCandidate(id, action, reason));
    }

    /** 审批通过 → 自动创建正式款式 */
    @PostMapping("/{id}/create-style")
    public Result<StyleInfo> createStyle(@PathVariable Long id) {
        return Result.success(approvalOrchestrator.approveAndCreateStyle(id));
    }

    /** AI趋势打分 */
    @PostMapping("/{id}/ai-score")
    public Result<Map<String, Object>> aiScore(@PathVariable Long id) {
        return Result.success(trendOrchestrator.scoreCandidateByAi(id));
    }

    /** 删除候选款 */
    @PostMapping("/delete/{id}")
    public Result<Void> delete(@PathVariable Long id) {
        candidateOrchestrator.deleteCandidate(id);
        return Result.success(null);
    }
}
