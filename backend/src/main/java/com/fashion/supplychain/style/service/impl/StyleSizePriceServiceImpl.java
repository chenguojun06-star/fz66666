package com.fashion.supplychain.style.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.style.entity.StyleSizePrice;
import com.fashion.supplychain.style.mapper.StyleSizePriceMapper;
import com.fashion.supplychain.style.service.StyleSizePriceService;
import org.springframework.stereotype.Service;

/**
 * 样衣多码单价配置Service实现类
 */
@Service
public class StyleSizePriceServiceImpl extends ServiceImpl<StyleSizePriceMapper, StyleSizePrice> implements StyleSizePriceService {
}
