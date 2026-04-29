package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.entity.ScanPrecheckFeedback;
import com.fashion.supplychain.intelligence.mapper.ScanPrecheckFeedbackMapper;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Slf4j
@Service
public class ScanPrecheckFeedbackOrchestrator {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Autowired private ScanPrecheckFeedbackMapper feedbackMapper;

    public Long recordFeedback(String orderNo, String scanType, List<String> issues, String userAction, String remark) {
        try {
            ScanPrecheckFeedback feedback = new ScanPrecheckFeedback();
            feedback.setTenantId(UserContext.tenantId());
            feedback.setOrderNo(orderNo);
            feedback.setScanType(scanType);
            feedback.setPrecheckIssues(MAPPER.writeValueAsString(issues));
            feedback.setUserAction(userAction);
            feedback.setUserRemark(remark);
            feedback.setOperatorName(UserContext.username());
            feedbackMapper.insert(feedback);
            log.info("[扫码预检闭环] 反馈已记录: orderNo={}, action={}, issues={}", orderNo, userAction, issues.size());
            return feedback.getId();
        } catch (Exception e) {
            log.warn("[扫码预检闭环] 记录反馈失败: {}", e.getMessage());
            return null;
        }
    }

    public Map<String, Object> getStats(int days) {
        Map<String, Object> stats = new LinkedHashMap<>();
        try {
            Long tenantId = UserContext.tenantId();
            LocalDateTime since = LocalDateTime.now().minusDays(days);
            LambdaQueryWrapper<ScanPrecheckFeedback> wrapper = new LambdaQueryWrapper<>();
            wrapper.eq(ScanPrecheckFeedback::getTenantId, tenantId);
            wrapper.ge(ScanPrecheckFeedback::getCreatedAt, since);
            List<ScanPrecheckFeedback> records = feedbackMapper.selectList(wrapper);

            long total = records.size();
            long adopted = records.stream().filter(r -> "adopted".equals(r.getUserAction())).count();
            long dismissed = records.stream().filter(r -> "dismissed".equals(r.getUserAction())).count();
            long corrected = records.stream().filter(r -> "corrected".equals(r.getUserAction())).count();

            stats.put("period", days + "天");
            stats.put("totalPrechecks", total);
            stats.put("adopted", adopted);
            stats.put("dismissed", dismissed);
            stats.put("corrected", corrected);
            stats.put("adoptionRate", total > 0 ? Math.round((double) adopted / total * 1000.0) / 10.0 + "%" : "N/A");
            stats.put("falsePositiveRate", total > 0 ? Math.round((double) dismissed / total * 1000.0) / 10.0 + "%" : "N/A");
            stats.put("correctionRate", total > 0 ? Math.round((double) corrected / total * 1000.0) / 10.0 + "%" : "N/A");
        } catch (Exception e) {
            log.warn("[扫码预检闭环] 获取统计失败: {}", e.getMessage());
        }
        return stats;
    }
}
