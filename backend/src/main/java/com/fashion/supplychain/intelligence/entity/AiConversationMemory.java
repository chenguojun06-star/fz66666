package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.LocalDateTime;
import lombok.Data;

/**
 * AI 对话记忆实体 — 用户级跨会话持久化
 *
 * <p>每次会话结束（小程序 onHide 或手动触发）时，
 * 由 AiMemoryOrchestrator 调用 LLM 将本轮对话摘要为 2-4 条要点，
 * 写入本表。下次会话启动时，buildSystemPrompt() 读取最近 3 条注入系统提示，
 * 让 AI 具备跨会话记忆能力。
 */
@Data
@TableName("t_ai_conversation_memory")
public class AiConversationMemory {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;

    /** 系统用户ID（对应 UserContext.userId()，VARCHAR） */
    private String userId;

    /** LLM 生成的对话摘要（2-4 条要点，以 • 开头） */
    private String memorySummary;

    /** 本轮对话中提及的关键实体（JSON 数组：订单号/款式/工厂名等） */
    private String keyEntities;

    /** 重要性评分 0-100，后续可用于过滤低价值记忆 */
    private Integer importanceScore;

    /** 来源的消息条数（user + assistant 总计） */
    private Integer sourceMessageCount;

    private LocalDateTime createTime;

    /** 过期时间，NULL=永不过期；默认 30 天后过期 */
    private LocalDateTime expireTime;

    private Integer deleteFlag;
}
