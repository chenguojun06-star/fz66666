package com.fashion.supplychain.intelligence.aspect;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.intelligence.annotation.DataTruth;
import com.fashion.supplychain.intelligence.service.DataTruthGuard;
import lombok.extern.slf4j.Slf4j;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.reflect.MethodSignature;
import org.springframework.stereotype.Component;

import java.util.Map;

@Slf4j
@Aspect
@Component
public class DataTruthAspect {

    private final DataTruthGuard dataTruthGuard;

    public DataTruthAspect(DataTruthGuard dataTruthGuard) {
        this.dataTruthGuard = dataTruthGuard;
    }

    @Around("@annotation(dataTruth)")
    public Object guardDataTruth(ProceedingJoinPoint pjp, DataTruth dataTruth) throws Throwable {
        if (dataTruth.requireTenantCheck()) {
            DataTruthGuard.TruthCheckResult tenantCheck = dataTruthGuard.checkTenantIntegrity();
            if (!tenantCheck.isPassed()) {
                log.warn("[DataTruth] 租户校验失败: endpoint={}, reason={}",
                        ((MethodSignature) pjp.getSignature()).getMethod().getName(),
                        tenantCheck.getReason());
                return Result.fail("数据访问权限校验失败：" + tenantCheck.getReason());
            }
        }

        Object result = pjp.proceed();

        if (result instanceof Result) {
            Result<?> r = (Result<?>) result;
            Object data = r.getData();
            if (data instanceof Map) {
                @SuppressWarnings("unchecked")
                Map<String, Object> map = (Map<String, Object>) data;
                map.putIfAbsent("_dataSource", dataTruth.source().name());
                if (dataTruth.source() != DataTruth.Source.REAL_DATA) {
                    map.putIfAbsent("_dataWarning", getDataWarning(dataTruth.source()));
                }
            }
        }

        return result;
    }

    private String getDataWarning(DataTruth.Source source) {
        return switch (source) {
            case AI_DERIVED -> "本数据由AI推理生成，未经业务数据验证，仅供参考";
            case SIMULATED -> "本数据为模拟推演结果，非真实业务数据";
            case DEFAULT_ESTIMATE -> "本数据为系统默认估算值，非实测数据";
            default -> null;
        };
    }
}
