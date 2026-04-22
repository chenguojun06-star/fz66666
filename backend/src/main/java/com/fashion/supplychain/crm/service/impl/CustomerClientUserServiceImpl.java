package com.fashion.supplychain.crm.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.crm.entity.CustomerClientUser;
import com.fashion.supplychain.crm.mapper.CustomerClientUserMapper;
import com.fashion.supplychain.crm.service.CustomerClientUserService;
import org.springframework.stereotype.Service;

@Service
public class CustomerClientUserServiceImpl extends ServiceImpl<CustomerClientUserMapper, CustomerClientUser> implements CustomerClientUserService {
}
