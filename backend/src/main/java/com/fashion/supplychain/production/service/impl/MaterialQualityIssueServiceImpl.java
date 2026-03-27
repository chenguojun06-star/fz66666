package com.fashion.supplychain.production.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.production.entity.MaterialQualityIssue;
import com.fashion.supplychain.production.mapper.MaterialQualityIssueMapper;
import com.fashion.supplychain.production.service.MaterialQualityIssueService;
import org.springframework.stereotype.Service;

@Service
public class MaterialQualityIssueServiceImpl extends ServiceImpl<MaterialQualityIssueMapper, MaterialQualityIssue>
        implements MaterialQualityIssueService {
}
