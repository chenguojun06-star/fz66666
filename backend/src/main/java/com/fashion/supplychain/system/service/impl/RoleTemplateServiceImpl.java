package com.fashion.supplychain.system.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.system.entity.RoleTemplate;
import com.fashion.supplychain.system.mapper.RoleTemplateMapper;
import com.fashion.supplychain.system.service.RoleTemplateService;
import org.springframework.stereotype.Service;

/**
 * 角色模板服务实现类
 */
@Service
public class RoleTemplateServiceImpl extends ServiceImpl<RoleTemplateMapper, RoleTemplate> implements RoleTemplateService {
}
