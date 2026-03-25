package com.fashion.supplychain.intelligence.dto;

import lombok.Data;

@Data
public class CollaborationDispatchRequest {
    private String instruction;
    private String orderNo;
    private String targetRole;
    private String targetUser;
    private String title;
    private String content;
    private String dueHint;
}
