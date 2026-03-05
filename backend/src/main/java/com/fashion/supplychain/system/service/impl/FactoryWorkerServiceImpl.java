package com.fashion.supplychain.system.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.system.entity.FactoryWorker;
import com.fashion.supplychain.system.mapper.FactoryWorkerMapper;
import com.fashion.supplychain.system.service.FactoryWorkerService;
import org.springframework.stereotype.Service;

@Service
public class FactoryWorkerServiceImpl extends ServiceImpl<FactoryWorkerMapper, FactoryWorker>
        implements FactoryWorkerService {
}
