package com.fashion.supplychain.production.dto;

import lombok.Data;
import java.util.List;

@Data
public class ConfirmResultDto {
    private List<String> purchaseIds;
    private List<String> purchaseNos;
}
