package com.fashion.supplychain.finance.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.fashion.supplychain.finance.entity.BargainPrice;

import java.util.List;

public interface BargainPriceService extends IService<BargainPrice> {

    List<BargainPrice> listByTarget(String targetType, String targetId);

    BargainPrice getLatestApproved(String targetType, String targetId);
}