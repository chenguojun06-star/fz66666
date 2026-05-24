package com.fashion.supplychain.production.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.fashion.supplychain.production.entity.UrgeRecord;

import java.util.List;
import java.util.Set;

public interface UrgeRecordService extends IService<UrgeRecord> {

    Set<String> findUrgedOrderIds(Long tenantId, List<String> orderIds);
}
