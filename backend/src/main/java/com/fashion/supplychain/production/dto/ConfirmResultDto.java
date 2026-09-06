package com.fashion.supplychain.production.dto;

import lombok.Data;
import java.util.List;

@Data
public class ConfirmResultDto {
    private List<String> purchaseIds;
    private List<String> purchaseNos;
    /** D-308：本次结算中"累计到已有待领取采购单"的组数（同款同物料重复添加不新建、数量累计） */
    private Integer mergedCount;
}
