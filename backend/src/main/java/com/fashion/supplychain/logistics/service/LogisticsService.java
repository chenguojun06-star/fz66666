package com.fashion.supplychain.logistics.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.logistics.dto.CreateExpressOrderRequest;
import com.fashion.supplychain.logistics.dto.ExpressOrderDTO;
import com.fashion.supplychain.logistics.dto.LogisticsQueryRequest;
import com.fashion.supplychain.logistics.dto.LogisticsTrackDTO;

import java.util.List;

/**
 * 物流服务接口
 * 预留用于物流管理核心业务
 */
public interface LogisticsService {

    /**
     * 创建快递单
     *
     * @param request 创建请求
     * @return 创建结果
     */
    Result<ExpressOrderDTO> createExpressOrder(CreateExpressOrderRequest request);

    /**
     * 更新快递单
     *
     * @param id      快递单ID
     * @param request 更新请求
     * @return 更新结果
     */
    Result<ExpressOrderDTO> updateExpressOrder(String id, CreateExpressOrderRequest request);

    /**
     * 删除快递单
     *
     * @param id 快递单ID
     * @return 删除结果
     */
    Result<Void> deleteExpressOrder(String id);

    /**
     * 获取快递单详情
     *
     * @param id 快递单ID
     * @return 详情
     */
    Result<ExpressOrderDTO> getExpressOrderDetail(String id);

    /**
     * 根据快递单号查询
     *
     * @param trackingNo 快递单号
     * @return 详情
     */
    Result<ExpressOrderDTO> getExpressOrderByTrackingNo(String trackingNo);

    /**
     * 分页查询快递单列表
     *
     * @param request 查询条件
     * @return 分页结果
     */
    Result<Page<ExpressOrderDTO>> queryExpressOrderPage(LogisticsQueryRequest request);

    /**
     * 查询快递单列表（不分页）
     *
     * @param request 查询条件
     * @return 列表
     */
    Result<List<ExpressOrderDTO>> queryExpressOrderList(LogisticsQueryRequest request);

    /**
     * 更新物流状态
     *
     * @param id     快递单ID
     * @param status 状态码
     * @return 更新结果
     */
    Result<Void> updateLogisticsStatus(String id, Integer status);

    /**
     * 手动同步物流轨迹
     *
     * @param id 快递单ID
     * @return 同步结果
     */
    Result<Void> syncLogisticsTrack(String id);

    /**
     * 批量同步物流轨迹
     *
     * @param ids 快递单ID列表
     * @return 同步结果
     */
    Result<Void> batchSyncLogisticsTrack(List<String> ids);

    /**
     * 获取物流轨迹详情
     *
     * @param expressOrderId 快递单ID
     * @return 轨迹列表
     */
    Result<List<LogisticsTrackDTO>> getLogisticsTrack(String expressOrderId);

    /**
     * 根据订单ID查询关联的快递单
     *
     * @param orderId 订单ID
     * @return 快递单列表
     */
    Result<List<ExpressOrderDTO>> getExpressOrdersByOrderId(String orderId);

    /**
     * 签收确认
     *
     * @param id         快递单ID
     * @param signPerson 签收人
     * @return 确认结果
     */
    Result<Void> confirmSign(String id, String signPerson);

    /**
     * 获取待同步的快递单列表
     *
     * @return 快递单列表
     */
    Result<List<ExpressOrderDTO>> getPendingSyncList();

    /**
     * 自动同步所有待更新物流（定时任务调用）
     */
    void autoSyncAllPendingTracks();
}
