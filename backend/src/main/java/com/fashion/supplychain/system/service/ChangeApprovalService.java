package com.fashion.supplychain.system.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.system.entity.ChangeApproval;
import com.fashion.supplychain.system.mapper.ChangeApprovalMapper;
import org.springframework.stereotype.Service;

@Service
public class ChangeApprovalService extends ServiceImpl<ChangeApprovalMapper, ChangeApproval>
        implements IService<ChangeApproval> {
}
