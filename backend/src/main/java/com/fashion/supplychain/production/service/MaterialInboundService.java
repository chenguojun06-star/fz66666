package com.fashion.supplychain.production.service;

import com.fashion.supplychain.production.entity.MaterialInbound;
import com.baomidou.mybatisplus.extension.service.IService;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;

import java.util.List;

/**
 * 面辅料入库记录 Service 接口
 */
public interface MaterialInboundService extends IService<MaterialInbound> {

    /**
     * 分页查询入库记录
     *
     * @param page 分页参数
     * @param materialCode 物料编码（可选）
     * @param purchaseId 采购单ID（可选）
     * @return 分页结果
     */
    IPage<MaterialInbound> queryPage(Page<MaterialInbound> page, String materialCode, String purchaseId);

    /**
     * 生成入库单号
     * 格式：IB+YYYYMMDD+4位序号（如：IB202601310001）
     *
     * @return 入库单号
     */
    String generateInboundNo();

    /**
     * 创建入库记录并更新库存
     *
     * @param inbound 入库记录
     * @return 创建的入库记录
     */
    MaterialInbound createInboundAndUpdateStock(MaterialInbound inbound);

    /**
     * 根据采购单ID查询入库记录
     *
     * @param purchaseId 采购单ID
     * @return 入库记录列表
     */
    List<MaterialInbound> listByPurchaseId(String purchaseId);
}
