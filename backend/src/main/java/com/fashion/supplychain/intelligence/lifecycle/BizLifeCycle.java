package com.fashion.supplychain.intelligence.lifecycle;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class BizLifeCycle {
    private String bizId;
    private BizLifeStatus status;
    private LocalDateTime createTime;
    private LocalDateTime startTime;
    private LocalDateTime finishTime;
    private String errorRemark;
}
