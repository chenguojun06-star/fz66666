package com.fashion.supplychain.common.dto;

import lombok.Data;

/**
 * 领取操作结果DTO
 * 用于统一双端领取操作的返回信息
 */
@Data
public class ReceiveResult {
    
    /** 领取是否成功 */
    private boolean success;
    
    /** 提示消息 */
    private String message;
    
    /** 是否已被他人领取 */
    private boolean alreadyReceived;
    
    /** 当前领取人ID */
    private String receiverId;
    
    /** 当前领取人姓名 */
    private String receiverName;
    
    /** 领取时间 */
    private String receivedTime;
    
    public static ReceiveResult success() {
        ReceiveResult result = new ReceiveResult();
        result.setSuccess(true);
        result.setMessage("领取成功");
        result.setAlreadyReceived(false);
        return result;
    }
    
    public static ReceiveResult success(String message) {
        ReceiveResult result = new ReceiveResult();
        result.setSuccess(true);
        result.setMessage(message);
        result.setAlreadyReceived(false);
        return result;
    }
    
    public static ReceiveResult alreadyReceivedBySelf() {
        ReceiveResult result = new ReceiveResult();
        result.setSuccess(true);
        result.setMessage("您已领取该任务");
        result.setAlreadyReceived(true);
        return result;
    }
    
    public static ReceiveResult alreadyReceivedByOther(String receiverName) {
        ReceiveResult result = new ReceiveResult();
        result.setSuccess(false);
        result.setMessage("该任务已被" + (receiverName != null ? receiverName : "他人") + "领取");
        result.setAlreadyReceived(true);
        result.setReceiverName(receiverName);
        return result;
    }
    
    public static ReceiveResult fail(String message) {
        ReceiveResult result = new ReceiveResult();
        result.setSuccess(false);
        result.setMessage(message);
        result.setAlreadyReceived(false);
        return result;
    }
}
