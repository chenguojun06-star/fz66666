package com.fashion.supplychain.logistics.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.logistics.dto.CreateExpressOrderRequest;
import com.fashion.supplychain.logistics.dto.ExpressOrderDTO;
import com.fashion.supplychain.logistics.dto.LogisticsQueryRequest;
import com.fashion.supplychain.logistics.dto.LogisticsTrackDTO;
import com.fashion.supplychain.logistics.service.LogisticsService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import javax.validation.Valid;
import java.util.List;

/**
 * 物流管理Controller
 * 预留用于物流管理相关接口
 * <p>
 * 本模块为预留模块，暂未对接前端页面
 * 接口已完整实现，待后续前端开发时可直接使用
 * </p>
 */
@RestController
@RequestMapping("/api/logistics")
@RequiredArgsConstructor
@Tag(name = "物流管理", description = "物流管理相关接口（预留模块）")
public class LogisticsController {

    private final LogisticsService logisticsService;

    /**
     * 创建快递单
     */
    @PostMapping("/express-order")
    @Operation(summary = "创建快递单", description = "创建新的快递发货单（预留接口）")
    @PreAuthorize("hasAuthority('LOGISTICS_CREATE')")
    public Result<ExpressOrderDTO> createExpressOrder(
            @Valid @RequestBody CreateExpressOrderRequest request) {
        return logisticsService.createExpressOrder(request);
    }

    /**
     * 更新快递单
     */
    @PutMapping("/express-order/{id}")
    @Operation(summary = "更新快递单", description = "更新快递单信息（预留接口）")
    @PreAuthorize("hasAuthority('LOGISTICS_UPDATE')")
    public Result<ExpressOrderDTO> updateExpressOrder(
            @Parameter(description = "快递单ID") @PathVariable String id,
            @Valid @RequestBody CreateExpressOrderRequest request) {
        return logisticsService.updateExpressOrder(id, request);
    }

    /**
     * 删除快递单
     */
    @DeleteMapping("/express-order/{id}")
    @Operation(summary = "删除快递单", description = "删除快递单（预留接口）")
    @PreAuthorize("hasAuthority('LOGISTICS_DELETE')")
    public Result<Void> deleteExpressOrder(
            @Parameter(description = "快递单ID") @PathVariable String id) {
        return logisticsService.deleteExpressOrder(id);
    }

    /**
     * 获取快递单详情
     */
    @GetMapping("/express-order/{id}")
    @Operation(summary = "获取快递单详情", description = "根据ID获取快递单详情（预留接口）")
    @PreAuthorize("hasAuthority('LOGISTICS_VIEW')")
    public Result<ExpressOrderDTO> getExpressOrderDetail(
            @Parameter(description = "快递单ID") @PathVariable String id) {
        return logisticsService.getExpressOrderDetail(id);
    }

    /**
     * 根据快递单号查询
     */
    @GetMapping("/express-order/by-tracking-no/{trackingNo}")
    @Operation(summary = "根据快递单号查询", description = "根据快递单号查询详情（预留接口）")
    @PreAuthorize("hasAuthority('LOGISTICS_VIEW')")
    public Result<ExpressOrderDTO> getExpressOrderByTrackingNo(
            @Parameter(description = "快递单号") @PathVariable String trackingNo) {
        return logisticsService.getExpressOrderByTrackingNo(trackingNo);
    }

    /**
     * 分页查询快递单列表
     */
    @GetMapping("/express-order/list")
    @Operation(summary = "分页查询快递单列表", description = "分页查询快递单列表（预留接口）")
    @PreAuthorize("hasAuthority('LOGISTICS_VIEW')")
    public Result<Page<ExpressOrderDTO>> queryExpressOrderPage(LogisticsQueryRequest request) {
        return logisticsService.queryExpressOrderPage(request);
    }

    /**
     * 查询快递单列表（不分页）
     */
    @GetMapping("/express-order/list-all")
    @Operation(summary = "查询快递单列表", description = "查询所有快递单列表（预留接口）")
    @PreAuthorize("hasAuthority('LOGISTICS_VIEW')")
    public Result<List<ExpressOrderDTO>> queryExpressOrderList(LogisticsQueryRequest request) {
        return logisticsService.queryExpressOrderList(request);
    }

    /**
     * 根据订单ID查询关联的快递单
     */
    @GetMapping("/express-order/by-order/{orderId}")
    @Operation(summary = "根据订单ID查询快递单", description = "根据生产订单ID查询关联的快递单列表（预留接口）")
    @PreAuthorize("hasAuthority('LOGISTICS_VIEW')")
    public Result<List<ExpressOrderDTO>> getExpressOrdersByOrderId(
            @Parameter(description = "订单ID") @PathVariable String orderId) {
        return logisticsService.getExpressOrdersByOrderId(orderId);
    }

    /**
     * 更新物流状态
     */
    @PostMapping("/express-order/{id}/update-status")
    @Operation(summary = "更新物流状态", description = "手动更新物流状态（预留接口）")
    @PreAuthorize("hasAuthority('LOGISTICS_UPDATE')")
    public Result<Void> updateLogisticsStatus(
            @Parameter(description = "快递单ID") @PathVariable String id,
            @Parameter(description = "状态码(0-待发货,1-已发货,2-运输中,3-已到达,4-已签收,5-异常,6-已退回,7-已取消)") @RequestParam Integer status) {
        return logisticsService.updateLogisticsStatus(id, status);
    }

    /**
     * 签收确认
     */
    @PostMapping("/express-order/{id}/confirm-sign")
    @Operation(summary = "签收确认", description = "确认快递已签收（预留接口）")
    @PreAuthorize("hasAuthority('LOGISTICS_UPDATE')")
    public Result<Void> confirmSign(
            @Parameter(description = "快递单ID") @PathVariable String id,
            @Parameter(description = "签收人") @RequestParam String signPerson) {
        return logisticsService.confirmSign(id, signPerson);
    }

    /**
     * 同步物流轨迹
     */
    @PostMapping("/express-order/{id}/sync-track")
    @Operation(summary = "同步物流轨迹", description = "手动同步物流轨迹（预留接口）")
    @PreAuthorize("hasAuthority('LOGISTICS_UPDATE')")
    public Result<Void> syncLogisticsTrack(
            @Parameter(description = "快递单ID") @PathVariable String id) {
        return logisticsService.syncLogisticsTrack(id);
    }

    /**
     * 批量同步物流轨迹
     */
    @PostMapping("/express-order/batch-sync-track")
    @Operation(summary = "批量同步物流轨迹", description = "批量同步物流轨迹（预留接口）")
    @PreAuthorize("hasAuthority('LOGISTICS_UPDATE')")
    public Result<Void> batchSyncLogisticsTrack(@RequestBody List<String> ids) {
        return logisticsService.batchSyncLogisticsTrack(ids);
    }

    /**
     * 获取物流轨迹详情
     */
    @GetMapping("/express-order/{id}/tracks")
    @Operation(summary = "获取物流轨迹", description = "获取快递单物流轨迹详情（预留接口）")
    @PreAuthorize("hasAuthority('LOGISTICS_VIEW')")
    public Result<List<LogisticsTrackDTO>> getLogisticsTrack(
            @Parameter(description = "快递单ID") @PathVariable String id) {
        return logisticsService.getLogisticsTrack(id);
    }

    /**
     * 获取待同步的快递单列表
     */
    @GetMapping("/express-order/pending-sync")
    @Operation(summary = "获取待同步列表", description = "获取待同步物流轨迹的快递单列表（预留接口）")
    @PreAuthorize("hasAuthority('LOGISTICS_VIEW')")
    public Result<List<ExpressOrderDTO>> getPendingSyncList() {
        return logisticsService.getPendingSyncList();
    }

    // ==================== 物流服务商配置接口（预留）====================

    /**
     * 获取支持的快递公司列表
     */
    @GetMapping("/express-companies")
    @Operation(summary = "获取快递公司列表", description = "获取系统支持的快递公司列表（预留接口）")
    @PreAuthorize("hasAuthority('LOGISTICS_VIEW')")
    public Result<List<ExpressCompanyVO>> getExpressCompanies() {
        // 返回支持的快递公司列表
        List<ExpressCompanyVO> list = List.of(
                new ExpressCompanyVO(1, "顺丰速运", "SF"),
                new ExpressCompanyVO(2, "京东物流", "JD"),
                new ExpressCompanyVO(3, "中国邮政", "EMS"),
                new ExpressCompanyVO(4, "中通快递", "ZTO"),
                new ExpressCompanyVO(5, "圆通速递", "YTO"),
                new ExpressCompanyVO(6, "申通快递", "STO"),
                new ExpressCompanyVO(7, "韵达速递", "YUNDA"),
                new ExpressCompanyVO(8, "德邦快递", "DEBANG"),
                new ExpressCompanyVO(9, "九曳供应链", "JIULIU"),
                new ExpressCompanyVO(10, "百世快递", "BEST"),
                new ExpressCompanyVO(11, "天天快递", "TTK"),
                new ExpressCompanyVO(12, "优速快递", "UC"),
                new ExpressCompanyVO(99, "其他", "OTHER")
        );
        return Result.success(list);
    }

    /**
     * 快递公司VO
     */
    public record ExpressCompanyVO(Integer code, String name, String codeEn) {
    }

    // ==================== 物流统计接口（预留）====================

    /**
     * 获取物流统计信息
     */
    @GetMapping("/statistics")
    @Operation(summary = "物流统计", description = "获取物流相关统计数据（预留接口）")
    @PreAuthorize("hasAuthority('LOGISTICS_VIEW')")
    public Result<LogisticsStatisticsVO> getStatistics() {
        // 预留统计接口
        LogisticsStatisticsVO vo = new LogisticsStatisticsVO();
        vo.setTotalCount(0);
        vo.setPendingCount(0);
        vo.setInTransitCount(0);
        vo.setDeliveredCount(0);
        vo.setExceptionCount(0);
        return Result.success(vo);
    }

    /**
     * 物流统计VO
     */
    @lombok.Data
    public static class LogisticsStatisticsVO {
        private Integer totalCount;
        private Integer pendingCount;
        private Integer inTransitCount;
        private Integer deliveredCount;
        private Integer exceptionCount;
    }
}
