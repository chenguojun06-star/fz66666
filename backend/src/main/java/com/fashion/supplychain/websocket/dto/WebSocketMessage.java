package com.fashion.supplychain.websocket.dto;

import com.fashion.supplychain.websocket.enums.WebSocketMessageType;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * WebSocket消息对象
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class WebSocketMessage<T> {

    /**
     * 消息类型
     */
    private String type;

    /**
     * 消息数据
     */
    private T payload;

    /**
     * 发送者ID
     */
    private String senderId;

    /**
     * 发送者类型（miniprogram/pc）
     */
    private String senderType;

    /**
     * 目标用户ID（null表示广播）
     */
    private String targetUserId;

    /**
     * 时间戳
     */
    private LocalDateTime timestamp;

    /**
     * 消息ID
     */
    private String messageId;

    /**
     * 创建消息
     */
    public static <T> WebSocketMessage<T> create(WebSocketMessageType type, T payload) {
        return WebSocketMessage.<T>builder()
                .type(type.getCode())
                .payload(payload)
                .timestamp(LocalDateTime.now())
                .messageId(java.util.UUID.randomUUID().toString())
                .build();
    }

    /**
     * 创建消息（指定发送者）
     */
    public static <T> WebSocketMessage<T> create(WebSocketMessageType type, T payload, 
                                                  String senderId, String senderType) {
        return WebSocketMessage.<T>builder()
                .type(type.getCode())
                .payload(payload)
                .senderId(senderId)
                .senderType(senderType)
                .timestamp(LocalDateTime.now())
                .messageId(java.util.UUID.randomUUID().toString())
                .build();
    }

    /**
     * 创建广播消息
     */
    public static <T> WebSocketMessage<T> broadcast(WebSocketMessageType type, T payload) {
        return create(type, payload);
    }

    /**
     * 创建点对点消息
     */
    public static <T> WebSocketMessage<T> direct(WebSocketMessageType type, T payload, 
                                                  String targetUserId) {
        WebSocketMessage<T> message = create(type, payload);
        message.setTargetUserId(targetUserId);
        return message;
    }
}
