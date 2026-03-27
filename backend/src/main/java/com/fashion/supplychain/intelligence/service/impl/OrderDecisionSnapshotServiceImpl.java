package com.fashion.supplychain.intelligence.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.intelligence.entity.OrderDecisionSnapshot;
import com.fashion.supplychain.intelligence.mapper.OrderDecisionSnapshotMapper;
import com.fashion.supplychain.intelligence.service.OrderDecisionSnapshotService;
import org.springframework.stereotype.Service;

@Service
public class OrderDecisionSnapshotServiceImpl
        extends ServiceImpl<OrderDecisionSnapshotMapper, OrderDecisionSnapshot>
        implements OrderDecisionSnapshotService {
}
