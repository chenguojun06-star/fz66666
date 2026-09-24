package com.fashion.supplychain.warehouse.service;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.warehouse.entity.ComboProduct;
import com.fashion.supplychain.warehouse.mapper.ComboProductMapper;
import org.springframework.stereotype.Service;

/**
 * D-529：组合商品主表单表 CRUD。
 */
@Service
public class ComboProductService extends ServiceImpl<ComboProductMapper, ComboProduct> {
}
