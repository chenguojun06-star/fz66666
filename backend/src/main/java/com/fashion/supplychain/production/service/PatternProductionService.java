package com.fashion.supplychain.production.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.fashion.supplychain.production.dto.PatternDevelopmentStatsDTO;
import com.fashion.supplychain.production.entity.PatternProduction;

/**
 * 样板生产 Service
 */
public interface PatternProductionService extends IService<PatternProduction> {

    /**
     * 获取样衣开发费用统计
     *
     * @param rangeType 时间范围：day=今日, week=本周, month=本月
     * @return 费用统计DTO
     */
    PatternDevelopmentStatsDTO getDevelopmentStats(String rangeType);
}
