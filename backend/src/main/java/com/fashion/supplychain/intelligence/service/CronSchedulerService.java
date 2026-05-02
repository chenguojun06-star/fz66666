package com.fashion.supplychain.intelligence.service;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.intelligence.entity.CronJob;
import com.fashion.supplychain.intelligence.gateway.AiInferenceRouter;
import com.fashion.supplychain.intelligence.mapper.CronJobMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class CronSchedulerService {

    private final CronJobMapper cronJobMapper;
    private final AiInferenceRouter inferenceRouter;

    @Scheduled(fixedRate = 60_000)
    public void tick() {
        LocalDateTime now = LocalDateTime.now();
        QueryWrapper<CronJob> qw = new QueryWrapper<>();
        qw.eq("enabled", 1).eq("delete_flag", 0);
        List<CronJob> jobs = cronJobMapper.selectList(qw);

        for (CronJob job : jobs) {
            if (!shouldRunNow(job, now)) continue;
            executeJobAsync(job);
        }
    }

    private boolean shouldRunNow(CronJob job, LocalDateTime now) {
        if (job.getLastRunAt() == null) return true;
        String cron = job.getCronExpression();
        if (cron == null) return false;

        if ("@hourly".equals(cron)) return job.getLastRunAt().plusHours(1).isBefore(now);
        if ("@daily".equals(cron)) return job.getLastRunAt().plusDays(1).isBefore(now);
        if ("@weekly".equals(cron)) return job.getLastRunAt().plusWeeks(1).isBefore(now);
        if ("@midnight".equals(cron)) {
            LocalDateTime todayMidnight = now.toLocalDate().atStartOfDay();
            return job.getLastRunAt().isBefore(todayMidnight);
        }

        try {
            org.springframework.scheduling.support.CronExpression expr =
                    org.springframework.scheduling.support.CronExpression.parse(cron);
            LocalDateTime next = expr.next(job.getLastRunAt());
            return next != null && next.isBefore(now);
        } catch (Exception e) {
            log.warn("[CronScheduler] cron表达式解析失败 job={} expr={}", job.getId(), cron);
            return false;
        }
    }

    private void executeJobAsync(CronJob job) {
        String jobId = job.getId();
        synchronized (("cron_lock_" + jobId).intern()) {
            try {
                log.info("[CronScheduler] 执行定时任务: {} ({})", job.getName(), job.getCronExpression());
                String result = inferenceRouter.chatSimple(job.getTaskPrompt());
                job.setLastRunAt(LocalDateTime.now());
                job.setLastResult(truncate(result, 500));
                job.setSuccessCount(job.getSuccessCount() + 1);
            } catch (Exception e) {
                log.error("[CronScheduler] 定时任务执行失败 job={}: {}", jobId, e.getMessage());
                job.setLastRunAt(LocalDateTime.now());
                job.setLastResult("执行失败: " + e.getMessage());
                job.setFailCount(job.getFailCount() + 1);
            }
            cronJobMapper.updateById(job);
        }
    }

    public void createJobFromNaturalLanguage(Long tenantId, String naturalLanguage,
                                              String cronExpr, String taskType, String userId) {
        CronJob job = new CronJob();
        job.setId("cron_" + java.util.UUID.randomUUID().toString().replace("-", "").substring(0, 20));
        job.setTenantId(tenantId);
        job.setName("AI定时任务_" + job.getId().substring(0, 8));
        job.setCronExpression(cronExpr != null ? cronExpr : "@daily");
        job.setNaturalLanguage(naturalLanguage);
        job.setTaskType(taskType != null ? taskType : "custom_skill");
        job.setTaskPrompt(naturalLanguage);
        job.setEnabled(1);
        job.setDeleteFlag(0);
        job.setCreatedBy(userId);
        job.setSuccessCount(0);
        job.setFailCount(0);
        job.setCreateTime(LocalDateTime.now());
        job.setUpdateTime(LocalDateTime.now());
        cronJobMapper.insert(job);
        log.info("[CronScheduler] 新建定时任务: {} ({})", job.getName(), cronExpr);
    }

    public List<CronJob> listByTenant(Long tenantId) {
        QueryWrapper<CronJob> qw = new QueryWrapper<>();
        qw.eq("tenant_id", tenantId).eq("delete_flag", 0).orderByDesc("updated_at");
        return cronJobMapper.selectList(qw);
    }

    private String truncate(String text, int maxLen) {
        if (text == null) return "";
        return text.length() > maxLen ? text.substring(0, maxLen) + "…" : text;
    }
}
