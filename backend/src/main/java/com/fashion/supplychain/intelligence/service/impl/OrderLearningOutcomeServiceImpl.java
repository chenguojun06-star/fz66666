package com.fashion.supplychain.intelligence.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.intelligence.entity.OrderLearningOutcome;
import com.fashion.supplychain.intelligence.mapper.OrderLearningOutcomeMapper;
import com.fashion.supplychain.intelligence.service.OrderLearningOutcomeService;
import org.springframework.stereotype.Service;

@Service
public class OrderLearningOutcomeServiceImpl
        extends ServiceImpl<OrderLearningOutcomeMapper, OrderLearningOutcome>
        implements OrderLearningOutcomeService {
}
