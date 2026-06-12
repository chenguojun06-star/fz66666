package com.fashion.supplychain.intelligence.service;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.intelligence.entity.IntelligenceActionTaskFeedback;
import com.fashion.supplychain.intelligence.mapper.IntelligenceActionTaskFeedbackMapper;
import org.springframework.stereotype.Service;
import org.springframework.context.annotation.Lazy;

@Service
@Lazy
public class IntelligenceActionTaskFeedbackService extends ServiceImpl<IntelligenceActionTaskFeedbackMapper, IntelligenceActionTaskFeedback> {
}
