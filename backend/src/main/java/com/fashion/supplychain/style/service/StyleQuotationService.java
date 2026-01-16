package com.fashion.supplychain.style.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.fashion.supplychain.style.entity.StyleQuotation;

public interface StyleQuotationService extends IService<StyleQuotation> {
    StyleQuotation getByStyleId(Long styleId);
}
