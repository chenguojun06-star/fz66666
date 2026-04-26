package com.fashion.supplychain.intelligence.lifecycle;

import java.time.LocalDateTime;
import java.util.UUID;

public class LifeCycleUtil {

    public static String generateBizId() {
        return UUID.randomUUID().toString().replace("-", "");
    }

    public static BizLifeCycle init() {
        BizLifeCycle cycle = new BizLifeCycle();
        cycle.setBizId(generateBizId());
        cycle.setStatus(BizLifeStatus.CREATED);
        cycle.setCreateTime(LocalDateTime.now());
        return cycle;
    }

    public static void start(BizLifeCycle cycle) {
        cycle.setStatus(BizLifeStatus.PROCESSING);
        cycle.setStartTime(LocalDateTime.now());
    }

    public static void finish(BizLifeCycle cycle) {
        cycle.setStatus(BizLifeStatus.FINISHED);
        cycle.setFinishTime(LocalDateTime.now());
    }

    public static void abnormal(BizLifeCycle cycle, String remark) {
        cycle.setStatus(BizLifeStatus.ABNORMAL);
        cycle.setErrorRemark(remark);
    }

    public static void cancel(BizLifeCycle cycle) {
        cycle.setStatus(BizLifeStatus.CANCELED);
    }

    public static boolean isActive(BizLifeCycle cycle) {
        return cycle != null && (cycle.getStatus() == BizLifeStatus.CREATED || cycle.getStatus() == BizLifeStatus.PROCESSING);
    }

    public static boolean isFinished(BizLifeCycle cycle) {
        return cycle != null && cycle.getStatus() == BizLifeStatus.FINISHED;
    }
}
