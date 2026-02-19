package com.fashion.supplychain.production.service;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.service.IService;
import com.fashion.supplychain.production.entity.OrderTransfer;

import java.util.Map;

/**
 * 订单转移Service接口
 */
public interface OrderTransferService extends IService<OrderTransfer> {

    /**
     * 发起订单转移请求
     *
     * @param orderId 订单ID
     * @param toUserId 接收人ID
     * @param message 转移留言
     * @param bundleIds 菲号ID列表（逗号分隔）
     * @param processCodes 工序编码列表（逗号分隔）
     * @return 转移记录
     */
    OrderTransfer createTransfer(String orderId, Long toUserId, String message, String bundleIds, String processCodes);

    /**
     * 查询待处理的转移请求(分页)
     *
     * @param params 查询参数
     * @return 分页结果
     */
    IPage<OrderTransfer> queryPendingTransfers(Map<String, Object> params);

    /**
     * 接受转移请求
     *
     * @param transferId 转移ID
     * @return 是否成功
     */
    boolean acceptTransfer(Long transferId);

    /**
     * 拒绝转移请求
     *
     * @param transferId 转移ID
     * @param rejectReason 拒绝原因
     * @return 是否成功
     */
    boolean rejectTransfer(Long transferId, String rejectReason);

    /**
     * 查询我发起的转移记录
     *
     * @param params 查询参数
     * @return 分页结果
     */
    IPage<OrderTransfer> queryMyTransfers(Map<String, Object> params);

    /**
     * 查询收到的转移请求
     *
     * @param params 查询参数
     * @return 分页结果
     */
    IPage<OrderTransfer> queryReceivedTransfers(Map<String, Object> params);
}
