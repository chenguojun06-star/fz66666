package com.fashion.supplychain.system.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.system.entity.UserFeedback;
import com.fashion.supplychain.system.mapper.UserFeedbackMapper;
import com.fashion.supplychain.system.service.UserFeedbackService;
import org.springframework.stereotype.Service;

@Service
public class UserFeedbackServiceImpl extends ServiceImpl<UserFeedbackMapper, UserFeedback>
        implements UserFeedbackService {
}
