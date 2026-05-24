package com.fashion.supplychain.production.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.production.entity.UrgeRecord;
import com.fashion.supplychain.production.mapper.UrgeRecordMapper;
import com.fashion.supplychain.production.service.UrgeRecordService;
import org.springframework.stereotype.Service;

import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

@Service
public class UrgeRecordServiceImpl extends ServiceImpl<UrgeRecordMapper, UrgeRecord>
        implements UrgeRecordService {

    @Override
    public Set<String> findUrgedOrderIds(Long tenantId, List<String> orderIds) {
        if (orderIds == null || orderIds.isEmpty()) {
            return Collections.emptySet();
        }
        List<UrgeRecord> records = lambdaQuery()
                .eq(UrgeRecord::getTenantId, tenantId)
                .in(UrgeRecord::getOrderId, orderIds)
                .select(UrgeRecord::getOrderId)
                .groupBy(UrgeRecord::getOrderId)
                .list();
        Set<String> result = new HashSet<>();
        for (UrgeRecord r : records) {
            if (r.getOrderId() != null) {
                result.add(r.getOrderId());
            }
        }
        return result;
    }
}
