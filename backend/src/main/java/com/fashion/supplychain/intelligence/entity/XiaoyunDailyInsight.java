package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import java.time.LocalDate;
import java.time.LocalDateTime;
import lombok.Data;

/**
 * 小云每日洞察卡片（feature B + J）
 * 对应 t_xiaoyun_daily_insight（V202611020000 新建）。
 * 由 XiaoyunDailyInsightJob 每天早上 6:30 按租户生成，
 * 前端小程序 / PC 主页的"小云待办"模块拉取展示。
 */
@Data
@TableName("t_xiaoyun_daily_insight")
public class XiaoyunDailyInsight {
    private String id;
    private Long tenantId;
    private LocalDate insightDate;
    /** 场景 key：morning_brief / overdue / highrisk / quality / capacity */
    private String scene;
    /** 严重程度：info / warn / high */
    private String severity;
    private String title;
    private String content;
    /** 可选卡片 JSON，前端直接渲染 */
    private String cardJson;
    /** 点击跳转的前端路由 */
    private String actionUrl;
    /** 若 severity=high 已自动建 Todo，关联 ID */
    private String autoTodoId;
    private Integer readFlag;
    private Integer dismissed;
    private LocalDateTime createdAt;
}
