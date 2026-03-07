package com.fashion.supplychain.system.dto;

import lombok.Data;

@Data
public class FactoryOrganizationSnapshot {
    private String factoryId;
    private String factoryName;
    private String factoryType;
    private String orgUnitId;
    private String parentOrgUnitId;
    private String parentOrgUnitName;
    private String orgPath;
}
