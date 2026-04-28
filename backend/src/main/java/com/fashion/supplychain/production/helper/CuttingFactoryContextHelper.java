package com.fashion.supplychain.production.helper;

import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.system.dto.FactoryOrganizationSnapshot;
import com.fashion.supplychain.system.entity.Factory;
import com.fashion.supplychain.system.entity.OrganizationUnit;
import com.fashion.supplychain.system.helper.OrganizationUnitBindingHelper;
import com.fashion.supplychain.system.service.FactoryService;
import com.fashion.supplychain.system.service.OrganizationUnitService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Component
@Slf4j
public class CuttingFactoryContextHelper {

    private final FactoryService factoryService;
    private final OrganizationUnitService organizationUnitService;
    private final OrganizationUnitBindingHelper organizationUnitBindingHelper;

    public CuttingFactoryContextHelper(
            FactoryService factoryService,
            OrganizationUnitService organizationUnitService,
            OrganizationUnitBindingHelper organizationUnitBindingHelper) {
        this.factoryService = factoryService;
        this.organizationUnitService = organizationUnitService;
        this.organizationUnitBindingHelper = organizationUnitBindingHelper;
    }

    public String resolveFactoryType(String factoryType, String orgUnitId) {
        if (StringUtils.hasText(factoryType)) {
            return factoryType.trim().toUpperCase();
        }
        return StringUtils.hasText(orgUnitId) ? "INTERNAL" : "EXTERNAL";
    }

    public FactoryContext resolveFactoryContext(String resolvedFactoryType, String factoryId, String orgUnitId) {
        FactoryContext ctx = new FactoryContext();
        ctx.factoryType = resolvedFactoryType;
        if ("INTERNAL".equals(resolvedFactoryType)) {
            if (!StringUtils.hasText(orgUnitId)) {
                throw new IllegalArgumentException("请选择内部生产组/车间");
            }
            ctx.internalUnit = organizationUnitService.getById(orgUnitId.trim());
            if (ctx.internalUnit == null
                    || (ctx.internalUnit.getDeleteFlag() != null && ctx.internalUnit.getDeleteFlag() == 1)
                    || !"DEPARTMENT".equalsIgnoreCase(ctx.internalUnit.getNodeType())) {
                throw new IllegalArgumentException("所选生产组/车间不存在");
            }
            if (StringUtils.hasText(ctx.internalUnit.getParentId())) {
                ctx.internalParentUnit = organizationUnitService.getById(ctx.internalUnit.getParentId());
            }
        } else {
            if (!StringUtils.hasText(factoryId)) {
                throw new IllegalArgumentException("请选择外发工厂");
            }
            ctx.factory = factoryService.getById(factoryId.trim());
            if (ctx.factory == null || (ctx.factory.getDeleteFlag() != null && ctx.factory.getDeleteFlag() == 1)) {
                throw new IllegalArgumentException("所选工厂不存在");
            }
            ctx.factorySnapshot = organizationUnitBindingHelper.getFactorySnapshot(ctx.factory);
        }
        return ctx;
    }

    public void applyFactoryFields(ProductionOrder order, FactoryContext factoryCtx) {
        if ("INTERNAL".equals(factoryCtx.factoryType)) {
            OrganizationUnit unit = factoryCtx.internalUnit;
            OrganizationUnit parent = factoryCtx.internalParentUnit;
            order.setFactoryId(null);
            order.setFactoryName(unit.getNodeName());
            order.setFactoryContactPerson(null);
            order.setFactoryContactPhone(null);
            order.setFactoryType("INTERNAL");
            order.setOrgUnitId(unit.getId());
            order.setParentOrgUnitId(parent != null ? parent.getId() : unit.getParentId());
            order.setParentOrgUnitName(parent != null ? parent.getNodeName() : null);
            order.setOrgPath(unit.getPathNames());
        } else {
            Factory factory = factoryCtx.factory;
            FactoryOrganizationSnapshot snapshot = factoryCtx.factorySnapshot;
            order.setFactoryId(factory.getId());
            order.setFactoryName(factory.getFactoryName());
            order.setFactoryContactPerson(factory.getContactPerson());
            order.setFactoryContactPhone(factory.getContactPhone());
            order.setFactoryType(snapshot.getFactoryType());
            order.setOrgUnitId(snapshot.getOrgUnitId());
            order.setParentOrgUnitId(snapshot.getParentOrgUnitId());
            order.setParentOrgUnitName(snapshot.getParentOrgUnitName());
            order.setOrgPath(snapshot.getOrgPath());
        }
    }

    public static class FactoryContext {
        public String factoryType;
        public Factory factory;
        public FactoryOrganizationSnapshot factorySnapshot;
        public OrganizationUnit internalUnit;
        public OrganizationUnit internalParentUnit;
    }
}
