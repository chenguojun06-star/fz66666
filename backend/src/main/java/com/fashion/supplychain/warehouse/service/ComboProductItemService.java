package com.fashion.supplychain.warehouse.service;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.warehouse.entity.ComboProductItem;
import com.fashion.supplychain.warehouse.mapper.ComboProductItemMapper;
import org.springframework.stereotype.Service;

/**
 * D-529：组合商品子项明细单表 CRUD。
 */
@Service
public class ComboProductItemService extends ServiceImpl<ComboProductItemMapper, ComboProductItem> {
}
