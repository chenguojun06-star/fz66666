package com.fashion.supplychain.style.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.style.entity.SecondaryProcess;
import com.fashion.supplychain.style.mapper.SecondaryProcessMapper;
import com.fashion.supplychain.style.service.SecondaryProcessService;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * 二次工艺Service实现类
 */
@Service
public class SecondaryProcessServiceImpl extends ServiceImpl<SecondaryProcessMapper, SecondaryProcess> implements SecondaryProcessService {

    @Override
    public List<SecondaryProcess> listByStyleId(Long styleId) {
        LambdaQueryWrapper<SecondaryProcess> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SecondaryProcess::getStyleId, styleId)
               .orderByDesc(SecondaryProcess::getCreatedAt);
        return list(wrapper);
    }
}
