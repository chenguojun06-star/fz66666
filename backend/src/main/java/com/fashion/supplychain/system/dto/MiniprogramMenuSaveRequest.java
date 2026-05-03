package com.fashion.supplychain.system.dto;

import java.util.Map;
import lombok.Data;

@Data
public class MiniprogramMenuSaveRequest {
    private Map<String, Boolean> menus;
}
