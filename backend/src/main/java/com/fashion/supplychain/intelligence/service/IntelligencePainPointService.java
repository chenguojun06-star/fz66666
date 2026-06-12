package com.fashion.supplychain.intelligence.service;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.intelligence.entity.IntelligencePainPoint;
import com.fashion.supplychain.intelligence.mapper.IntelligencePainPointMapper;
import org.springframework.stereotype.Service;
import org.springframework.context.annotation.Lazy;

@Service
@Lazy
public class IntelligencePainPointService extends ServiceImpl<IntelligencePainPointMapper, IntelligencePainPoint> {
}
