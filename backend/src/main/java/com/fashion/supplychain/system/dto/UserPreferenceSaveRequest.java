package com.fashion.supplychain.system.dto;

import lombok.Data;

/**
 * 用户偏好保存请求
 */
@Data
public class UserPreferenceSaveRequest {

    private String bizType;

    private String pageKey;

    private String preferenceType;

    /** 偏好值 JSON 字符串 */
    private String preferenceValue;
}
