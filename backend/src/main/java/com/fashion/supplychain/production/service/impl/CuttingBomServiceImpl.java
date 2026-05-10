package com.fashion.supplychain.production.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.production.entity.CuttingBom;
import com.fashion.supplychain.production.mapper.CuttingBomMapper;
import com.fashion.supplychain.production.service.CuttingBomService;
import org.springframework.stereotype.Service;
import java.util.List;

@Service
public class CuttingBomServiceImpl extends ServiceImpl<CuttingBomMapper, CuttingBom> implements CuttingBomService {

    @Override
    public List<CuttingBom> listByCuttingTaskId(String cuttingTaskId) {
        return list(new LambdaQueryWrapper<CuttingBom>()
                .eq(CuttingBom::getCuttingTaskId, cuttingTaskId)
                .eq(CuttingBom::getDeleteFlag, 0)
                .orderByAsc(CuttingBom::getMaterialType)
                .orderByAsc(CuttingBom::getMaterialCode));
    }

    @Override
    public List<CuttingBom> listByStyleNo(String styleNo) {
        return list(new LambdaQueryWrapper<CuttingBom>()
                .eq(CuttingBom::getStyleNo, styleNo)
                .eq(CuttingBom::getDeleteFlag, 0)
                .orderByAsc(CuttingBom::getMaterialType)
                .orderByAsc(CuttingBom::getMaterialCode));
    }
}
