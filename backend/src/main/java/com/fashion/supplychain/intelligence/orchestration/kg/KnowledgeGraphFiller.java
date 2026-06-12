package com.fashion.supplychain.intelligence.orchestration.kg;

import com.fashion.supplychain.intelligence.service.GraphRagService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.context.annotation.Lazy;

/**
 * 知识图谱自动填充器——从各业务模块的实际数据中自动构建知识图谱实体与关系。
 *
 * 核心关系链：
 *   订单 --[MANUFACTURED_BY]--> 工厂
 *   订单 --[BELONGS_TO]--> 客户
 *   款式 --[REQUIRES]--> 面料/辅料
 *   工厂 --[SUPPLIED_BY]--> 供应商
 *   订单 --[CONTAINS]--> 工序
 *
 * @author Knowledge Graph Engine
 * @date 2026-06-06
 */
@Slf4j
@Component
@Lazy
@RequiredArgsConstructor
public class KnowledgeGraphFiller {

    private final GraphRagService graphRagService;

    /** 记录订单-工厂生产关系 */
    public void recordOrderFactoryRelation(
            Long tenantId, String orderNo, Long factoryId, String factoryName) {
        graphRagService.recordRelation(tenantId,
                "ORDER", orderNo, orderNo,
                "FACTORY", factoryName, String.valueOf(factoryId),
                "MANUFACTURED_BY");
    }

    /** 记录订单-客户归属关系 */
    public void recordOrderCustomerRelation(
            Long tenantId, String orderNo, Long customerId, String customerName) {
        graphRagService.recordRelation(tenantId,
                "ORDER", orderNo, orderNo,
                "CUSTOMER", customerName, String.valueOf(customerId),
                "BELONGS_TO");
    }

    /** 记录款式-面料需求关系 */
    public void recordStyleMaterialRelation(
            Long tenantId, String styleNo, String materialType, String materialName) {
        graphRagService.recordRelation(tenantId,
                "STYLE", styleNo, styleNo,
                "MATERIAL", materialName, styleNo + "_" + materialType,
                "REQUIRES");
    }

    /** 记录工厂-供应商关系 */
    public void recordFactorySupplierRelation(
            Long tenantId, Long factoryId, String factoryName,
            Long supplierId, String supplierName) {
        graphRagService.recordRelation(tenantId,
                "FACTORY", factoryName, String.valueOf(factoryId),
                "SUPPLIER", supplierName, String.valueOf(supplierId),
                "SUPPLIED_BY");
    }

    /** 记录订单-工序包含关系 */
    public void recordOrderProcessRelation(
            Long tenantId, String orderNo, String processType, String processName) {
        graphRagService.recordRelation(tenantId,
                "ORDER", orderNo, orderNo,
                "PROCESS", processName, orderNo + "_" + processType,
                "CONTAINS");
    }
}
