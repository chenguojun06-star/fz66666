package com.fashion.supplychain.intelligence.service;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.intelligence.entity.IntelligenceFeedbackReason;
import com.fashion.supplychain.intelligence.mapper.IntelligenceFeedbackReasonMapper;
import org.springframework.stereotype.Service;
import org.springframework.context.annotation.Lazy;

@Service
@Lazy
public class IntelligenceFeedbackReasonService extends ServiceImpl<IntelligenceFeedbackReasonMapper, IntelligenceFeedbackReason> {
}
