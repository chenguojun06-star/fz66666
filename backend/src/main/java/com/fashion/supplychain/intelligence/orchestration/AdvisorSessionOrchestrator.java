package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.intelligence.entity.HyperAdvisorSession;
import com.fashion.supplychain.intelligence.mapper.HyperAdvisorSessionMapper;
import java.time.LocalDateTime;
import java.util.Collections;
import java.util.List;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * 超级顾问 — 会话连续性编排器
 *
 * <p>职责：
 * <ol>
 *   <li>持久化每轮 user/assistant 消息到 t_hyper_advisor_session</li>
 *   <li>加载历史消息构建上下文窗口（最近 N 轮）</li>
 *   <li>超过保留条数时自动软删除最旧消息</li>
 * </ol>
 */
@Service
@Slf4j
public class AdvisorSessionOrchestrator {

    private static final int MAX_HISTORY_MESSAGES = 20;

    @Autowired
    private HyperAdvisorSessionMapper sessionMapper;

    /** 加载指定会话的历史消息，拼接为可注入 Prompt 的文本 */
    public String loadSessionContext(Long tenantId, String sessionId) {
        if (tenantId == null || sessionId == null) return "";
        try {
            List<HyperAdvisorSession> messages = sessionMapper.selectList(
                    new LambdaQueryWrapper<HyperAdvisorSession>()
                            .eq(HyperAdvisorSession::getTenantId, tenantId)
                            .eq(HyperAdvisorSession::getSessionId, sessionId)
                            .eq(HyperAdvisorSession::getDeleteFlag, 0)
                            .orderByDesc(HyperAdvisorSession::getCreateTime)
                            .last("LIMIT " + MAX_HISTORY_MESSAGES));
            if (messages.isEmpty()) return "";

            Collections.reverse(messages);
            StringBuilder sb = new StringBuilder("【本次会话历史】\n");
            for (HyperAdvisorSession m : messages) {
                String label = "user".equals(m.getRole()) ? "用户" : "AI顾问";
                String text = m.getContent();
                if (text != null && text.length() > 300) text = text.substring(0, 300) + "...";
                sb.append(label).append("：").append(text).append("\n");
            }
            return sb.toString();
        } catch (Exception e) {
            log.warn("[AdvisorSession] 加载会话历史失败: {}", e.getMessage());
            return "";
        }
    }

    /** 保存一条消息到会话 */
    public void saveMessage(Long tenantId, String userId, String sessionId,
                            String role, String content, String metadataJson) {
        try {
            HyperAdvisorSession msg = new HyperAdvisorSession();
            msg.setTenantId(tenantId);
            msg.setUserId(userId);
            msg.setSessionId(sessionId);
            msg.setRole(role);
            msg.setContent(content);
            msg.setMetadataJson(metadataJson);
            msg.setCreateTime(LocalDateTime.now());
            msg.setDeleteFlag(0);
            sessionMapper.insert(msg);
            pruneOldMessages(tenantId, sessionId);
        } catch (Exception e) {
            log.warn("[AdvisorSession] 保存消息失败: {}", e.getMessage());
        }
    }

    private void pruneOldMessages(Long tenantId, String sessionId) {
        try {
            long count = sessionMapper.selectCount(
                    new LambdaQueryWrapper<HyperAdvisorSession>()
                            .eq(HyperAdvisorSession::getTenantId, tenantId)
                            .eq(HyperAdvisorSession::getSessionId, sessionId)
                            .eq(HyperAdvisorSession::getDeleteFlag, 0));
            if (count > MAX_HISTORY_MESSAGES * 2) {
                List<HyperAdvisorSession> oldest = sessionMapper.selectList(
                        new LambdaQueryWrapper<HyperAdvisorSession>()
                                .eq(HyperAdvisorSession::getTenantId, tenantId)
                                .eq(HyperAdvisorSession::getSessionId, sessionId)
                                .eq(HyperAdvisorSession::getDeleteFlag, 0)
                                .orderByAsc(HyperAdvisorSession::getCreateTime)
                                .last("LIMIT " + MAX_HISTORY_MESSAGES));
                List<Long> ids = oldest.stream().map(HyperAdvisorSession::getId)
                        .collect(Collectors.toList());
                if (!ids.isEmpty()) {
                    sessionMapper.update(null,
                            new com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper<HyperAdvisorSession>()
                                    .in(HyperAdvisorSession::getId, ids)
                                    .set(HyperAdvisorSession::getDeleteFlag, 1));
                }
            }
        } catch (Exception e) {
            log.debug("[AdvisorSession] 清理旧消息失败: {}", e.getMessage());
        }
    }
}
