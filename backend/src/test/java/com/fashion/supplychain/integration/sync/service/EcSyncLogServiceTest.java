package com.fashion.supplychain.integration.sync.service;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.integration.sync.entity.EcSyncLog;
import com.fashion.supplychain.integration.sync.mapper.EcSyncLogMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("EcSyncLogService - 电商同步日志服务")
class EcSyncLogServiceTest {

    @Mock
    private EcSyncLogMapper mapper;

    private EcSyncLogService service;

    @BeforeEach
    void setUp() {
        service = new EcSyncLogService();
        ReflectionTestUtils.setField(service, "baseMapper", mapper);
    }

    private EcSyncLog buildLog() {
        EcSyncLog log = new EcSyncLog();
        log.setId(1L);
        log.setTenantId(1L);
        log.setSyncType("STOCK");
        log.setPlatformCode("TAOBAO");
        log.setDirection("UP");
        log.setStyleId(100L);
        log.setSkuId(200L);
        log.setStatus("PENDING");
        log.setRetryCount(0);
        log.setMaxRetries(3);
        log.setTriggeredBy("SYSTEM");
        return log;
    }

    @Nested
    @DisplayName("createLog - 创建同步日志")
    class CreateLog {

        @Test
        @DisplayName("正常创建-状态为PENDING")
        void normalCreate_pendingStatus() {
            when(mapper.insert(any(EcSyncLog.class))).thenReturn(1);

            EcSyncLog result = service.createLog(1L, "STOCK", "TAOBAO", "UP", 100L, 200L, "SYSTEM");

            ArgumentCaptor<EcSyncLog> captor = ArgumentCaptor.forClass(EcSyncLog.class);
            verify(mapper).insert(captor.capture());

            EcSyncLog saved = captor.getValue();
            assertThat(saved.getTenantId()).isEqualTo(1L);
            assertThat(saved.getSyncType()).isEqualTo("STOCK");
            assertThat(saved.getPlatformCode()).isEqualTo("TAOBAO");
            assertThat(saved.getStatus()).isEqualTo("PENDING");
            assertThat(saved.getRetryCount()).isEqualTo(0);
            assertThat(saved.getMaxRetries()).isEqualTo(3);
        }

        @Test
        @DisplayName("各参数正确传递")
        void allParametersPassed() {
            when(mapper.insert(any(EcSyncLog.class))).thenReturn(1);

            service.createLog(5L, "PRICE", "JD", "DOWN", 300L, 400L, "USER");

            ArgumentCaptor<EcSyncLog> captor = ArgumentCaptor.forClass(EcSyncLog.class);
            verify(mapper).insert(captor.capture());

            EcSyncLog saved = captor.getValue();
            assertThat(saved.getTenantId()).isEqualTo(5L);
            assertThat(saved.getSyncType()).isEqualTo("PRICE");
            assertThat(saved.getPlatformCode()).isEqualTo("JD");
            assertThat(saved.getDirection()).isEqualTo("DOWN");
            assertThat(saved.getStyleId()).isEqualTo(300L);
            assertThat(saved.getSkuId()).isEqualTo(400L);
            assertThat(saved.getTriggeredBy()).isEqualTo("USER");
        }
    }

    @Nested
    @DisplayName("markSyncing - 标记同步中")
    class MarkSyncing {

        @Test
        @DisplayName("正常标记-状态变为SYNCING")
        void normalMark_statusChanged() {
            EcSyncLog existing = buildLog();
            when(mapper.selectById(1L)).thenReturn(existing);
            when(mapper.updateById(any(EcSyncLog.class))).thenReturn(1);

            service.markSyncing(1L);

            ArgumentCaptor<EcSyncLog> captor = ArgumentCaptor.forClass(EcSyncLog.class);
            verify(mapper).updateById(captor.capture());
            assertThat(captor.getValue().getStatus()).isEqualTo("SYNCING");
        }

        @Test
        @DisplayName("日志不存在-不抛异常")
        void logNotExists_noException() {
            when(mapper.selectById(999L)).thenReturn(null);

            service.markSyncing(999L);

            verify(mapper, never()).updateById(any(EcSyncLog.class));
        }
    }

    @Nested
    @DisplayName("markSuccess - 标记成功")
    class MarkSuccess {

        @Test
        @DisplayName("正常标记-状态变为SYNCED")
        void normalMark_success() {
            EcSyncLog existing = buildLog();
            when(mapper.selectById(1L)).thenReturn(existing);
            when(mapper.updateById(any(EcSyncLog.class))).thenReturn(1);

            service.markSuccess(1L, "{\"code\":0}", 1500);

            ArgumentCaptor<EcSyncLog> captor = ArgumentCaptor.forClass(EcSyncLog.class);
            verify(mapper).updateById(captor.capture());

            EcSyncLog updated = captor.getValue();
            assertThat(updated.getStatus()).isEqualTo("SYNCED");
            assertThat(updated.getResponsePayload()).isEqualTo("{\"code\":0}");
            assertThat(updated.getDurationMs()).isEqualTo(1500);
        }

        @Test
        @DisplayName("响应超长-截断至4000字符")
        void responseTruncated() {
            EcSyncLog existing = buildLog();
            when(mapper.selectById(1L)).thenReturn(existing);
            when(mapper.updateById(any(EcSyncLog.class))).thenReturn(1);

            String longResponse = "x".repeat(5000);
            service.markSuccess(1L, longResponse, 100);

            ArgumentCaptor<EcSyncLog> captor = ArgumentCaptor.forClass(EcSyncLog.class);
            verify(mapper).updateById(captor.capture());
            assertThat(captor.getValue().getResponsePayload()).hasSize(4000);
        }

        @Test
        @DisplayName("日志不存在-不抛异常")
        void logNotExists_noException() {
            when(mapper.selectById(999L)).thenReturn(null);

            service.markSuccess(999L, "response", 100);

            verify(mapper, never()).updateById(any(EcSyncLog.class));
        }
    }

    @Nested
    @DisplayName("markFailed - 标记失败")
    class MarkFailed {

        @Test
        @DisplayName("首次失败-状态变为FAILED")
        void firstFailure_statusFailed() {
            EcSyncLog existing = buildLog();
            existing.setRetryCount(0);
            when(mapper.selectById(1L)).thenReturn(existing);
            when(mapper.updateById(any(EcSyncLog.class))).thenReturn(1);

            service.markFailed(1L, "ERR_TIMEOUT", "连接超时");

            ArgumentCaptor<EcSyncLog> captor = ArgumentCaptor.forClass(EcSyncLog.class);
            verify(mapper).updateById(captor.capture());

            EcSyncLog updated = captor.getValue();
            assertThat(updated.getStatus()).isEqualTo("FAILED");
            assertThat(updated.getRetryCount()).isEqualTo(1);
            assertThat(updated.getErrorCode()).isEqualTo("ERR_TIMEOUT");
            assertThat(updated.getErrorMessage()).isEqualTo("连接超时");
            assertThat(updated.getNextRetryAt()).isNotNull();
        }

        @Test
        @DisplayName("达到最大重试次数-状态变为DEAD_LETTER")
        void maxRetriesReached_deadLetter() {
            EcSyncLog existing = buildLog();
            existing.setRetryCount(2);
            when(mapper.selectById(1L)).thenReturn(existing);
            when(mapper.updateById(any(EcSyncLog.class))).thenReturn(1);

            service.markFailed(1L, "ERR_FINAL", "最终失败");

            ArgumentCaptor<EcSyncLog> captor = ArgumentCaptor.forClass(EcSyncLog.class);
            verify(mapper).updateById(captor.capture());
            assertThat(captor.getValue().getStatus()).isEqualTo("DEAD_LETTER");
        }

        @Test
        @DisplayName("错误信息超长-截断至1000字符")
        void errorMessageTruncated() {
            EcSyncLog existing = buildLog();
            when(mapper.selectById(1L)).thenReturn(existing);
            when(mapper.updateById(any(EcSyncLog.class))).thenReturn(1);

            String longError = "e".repeat(1500);
            service.markFailed(1L, "ERR_LONG", longError);

            ArgumentCaptor<EcSyncLog> captor = ArgumentCaptor.forClass(EcSyncLog.class);
            verify(mapper).updateById(captor.capture());
            assertThat(captor.getValue().getErrorMessage()).hasSize(1000);
        }

        @Test
        @DisplayName("重试延迟递增计算")
        void retryDelayCalculation() {
            EcSyncLog existing = buildLog();
            when(mapper.selectById(1L)).thenReturn(existing);
            when(mapper.updateById(any(EcSyncLog.class))).thenReturn(1);

            service.markFailed(1L, "ERR", "msg");

            ArgumentCaptor<EcSyncLog> captor = ArgumentCaptor.forClass(EcSyncLog.class);
            verify(mapper).updateById(captor.capture());

            LocalDateTime nextRetry = captor.getValue().getNextRetryAt();
            assertThat(nextRetry).isAfter(LocalDateTime.now());
        }
    }

    @Nested
    @DisplayName("findRetryable - 查询可重试日志")
    class FindRetryable {

        @Test
        @DisplayName("返回待重试的日志")
        void returnsRetryableLogs() {
            EcSyncLog log1 = buildLog();
            log1.setId(1L);
            EcSyncLog log2 = buildLog();
            log2.setId(2L);
            when(mapper.selectList(any(QueryWrapper.class))).thenReturn(List.of(log1, log2));

            List<EcSyncLog> result = service.findRetryable();

            assertThat(result).hasSize(2);
        }

        @Test
        @DisplayName("空结果-返回空列表")
        void emptyResult() {
            when(mapper.selectList(any(QueryWrapper.class))).thenReturn(List.of());

            List<EcSyncLog> result = service.findRetryable();

            assertThat(result).isEmpty();
        }
    }

    @Nested
    @DisplayName("findDeadLetters - 查询死信日志")
    class FindDeadLetters {

        @Test
        @DisplayName("按租户ID查询死信")
        void findsByTenantId() {
            EcSyncLog log = buildLog();
            log.setStatus("DEAD_LETTER");
            when(mapper.selectList(any(QueryWrapper.class))).thenReturn(List.of(log));

            List<EcSyncLog> result = service.findDeadLetters(1L);

            assertThat(result).hasSize(1);
        }
    }
}
