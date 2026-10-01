package com.fashion.supplychain.datacenter.orchestration;

import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.datacenter.service.DataCenterQueryService;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.style.entity.StyleAttachment;
import com.fashion.supplychain.style.entity.StyleBom;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.entity.StyleSize;
import com.fashion.supplychain.style.service.StyleAttachmentService;
import com.fashion.supplychain.style.service.StyleBomService;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.style.service.StyleSizeService;
import java.util.List;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

/**
 * 数据中心跨域查询编排（D-693：原 {@code DataCenterQueryServiceImpl}，位于 {@code datacenter.service}）。
 *
 * <p><b>更名理由</b>：本类注入 6 个业务 Service（StyleInfo / MaterialPurchase / ProductionOrder /
 * StyleBom / StyleSize / StyleAttachment）做跨域取数组装，触发 ArchUnit 规则7
 * 「Service 不得依赖其他 Service」。其唯一调用方 {@link DataCenterOrchestrator} 本身就在编排层，
 * 职责同为跨域聚合，故按 D-653 / D-655 的既有做法改名为 {@code *Orchestrator} 并移入
 * {@code orchestration} 包（接口 {@link DataCenterQueryService} 仍留在 {@code service} 包）。
 *
 * <p><b>⚠️ 为什么不是「并入 {@link DataCenterOrchestrator}」</b>：本类 7 个方法全部带
 * {@code @Cacheable}，依赖 Spring AOP 代理。若把方法搬进 {@code DataCenterOrchestrator}，
 * 调用方变成<b>同类自调用</b> → 代理不生效 → <b>缓存静默失效</b>（不报错、只是每次都查库）。
 * 保持独立 Bean 由 {@code DataCenterOrchestrator} 跨 Bean 调用，代理才生效。
 *
 * <p>方法体与事务语义零改动：全部为只读查询，无 {@code @Transactional}。
 */
@Service
public class DataCenterQueryOrchestrator implements DataCenterQueryService {

    private final StyleInfoService styleInfoService;
    private final MaterialPurchaseService materialPurchaseService;
    private final ProductionOrderService productionOrderService;
    private final StyleBomService styleBomService;
    private final StyleSizeService styleSizeService;
    private final StyleAttachmentService styleAttachmentService;

    public DataCenterQueryOrchestrator(
            StyleInfoService styleInfoService,
            MaterialPurchaseService materialPurchaseService,
            ProductionOrderService productionOrderService,
            StyleBomService styleBomService,
            StyleSizeService styleSizeService,
            StyleAttachmentService styleAttachmentService) {
        this.styleInfoService = styleInfoService;
        this.materialPurchaseService = materialPurchaseService;
        this.productionOrderService = productionOrderService;
        this.styleBomService = styleBomService;
        this.styleSizeService = styleSizeService;
        this.styleAttachmentService = styleAttachmentService;
    }

    @Override
    @Cacheable(value = "dataCenter", key = "T(com.fashion.supplychain.common.UserContext).tenantId() + ':enabledStylesCount'")
    public long countEnabledStyles() {
        Long tenantId = TenantAssert.requireTenantId();
        return styleInfoService.lambdaQuery()
                .eq(StyleInfo::getStatus, "ENABLED")
                .eq(StyleInfo::getTenantId, tenantId)
                .count();
    }

    @Override
    @Cacheable(value = "dataCenter", key = "T(com.fashion.supplychain.common.UserContext).tenantId() + ':materialPurchasesCount'")
    public long countMaterialPurchases() {
        Long tenantId = TenantAssert.requireTenantId();
        return materialPurchaseService.lambdaQuery()
                .eq(MaterialPurchase::getDeleteFlag, 0)
                .eq(MaterialPurchase::getTenantId, tenantId)
                .count();
    }

    @Override
    @Cacheable(value = "dataCenter", key = "T(com.fashion.supplychain.common.UserContext).tenantId() + ':productionOrdersCount'")
    public long countProductionOrders() {
        Long tenantId = TenantAssert.requireTenantId();
        return productionOrderService.lambdaQuery()
                .eq(ProductionOrder::getDeleteFlag, 0)
                .eq(ProductionOrder::getTenantId, tenantId)
                .count();
    }

    @Override
    @Cacheable(value = "style", key = "T(com.fashion.supplychain.common.UserContext).tenantId() + ':' + (#styleId != null ? 'style:' + #styleId : (#styleNo != null ? 'styleByNo:' + #styleNo.trim() : 'style:null'))")
    public StyleInfo findStyle(Long styleId, String styleNo) {
        Long tenantId = TenantAssert.requireTenantId();
        if (styleId != null) {
            return styleInfoService.lambdaQuery()
                    .eq(StyleInfo::getId, styleId)
                    .eq(StyleInfo::getTenantId, tenantId)
                    .one();
        }
        String sn = StringUtils.hasText(styleNo) ? styleNo.trim() : null;
        if (!StringUtils.hasText(sn)) {
            return null;
        }
        return styleInfoService.lambdaQuery()
                .eq(StyleInfo::getStyleNo, sn)
                .eq(StyleInfo::getTenantId, tenantId)
                .one();
    }

    @Override
    @Cacheable(value = "style", key = "T(com.fashion.supplychain.common.UserContext).tenantId() + ':bom:' + #styleId")
    public List<StyleBom> listBom(Long styleId) {
        return styleBomService.listByStyleId(styleId);
    }

    @Override
    @Cacheable(value = "style", key = "T(com.fashion.supplychain.common.UserContext).tenantId() + ':size:' + #styleId")
    public List<StyleSize> listSize(Long styleId) {
        return styleSizeService.listByStyleId(styleId);
    }

    @Override
    @Cacheable(value = "style", key = "T(com.fashion.supplychain.common.UserContext).tenantId() + ':attachments:' + #styleId")
    public List<StyleAttachment> listAttachments(Long styleId) {
        return styleAttachmentService.listByStyleId(String.valueOf(styleId));
    }
}
