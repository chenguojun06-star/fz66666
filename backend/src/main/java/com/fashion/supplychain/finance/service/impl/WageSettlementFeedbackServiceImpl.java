package com.fashion.supplychain.finance.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.finance.entity.WageSettlementFeedback;
import com.fashion.supplychain.finance.mapper.WageSettlementFeedbackMapper;
import com.fashion.supplychain.finance.service.WageSettlementFeedbackService;
import org.springframework.stereotype.Service;

@Service
public class WageSettlementFeedbackServiceImpl
        extends ServiceImpl<WageSettlementFeedbackMapper, WageSettlementFeedback>
        implements WageSettlementFeedbackService {
}
