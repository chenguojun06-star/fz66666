package com.fashion.supplychain.procurement.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.procurement.entity.SupplierUser;
import com.fashion.supplychain.procurement.mapper.SupplierUserMapper;
import com.fashion.supplychain.procurement.service.SupplierUserService;
import org.springframework.stereotype.Service;

@Service
public class SupplierUserServiceImpl extends ServiceImpl<SupplierUserMapper, SupplierUser> implements SupplierUserService {
}
