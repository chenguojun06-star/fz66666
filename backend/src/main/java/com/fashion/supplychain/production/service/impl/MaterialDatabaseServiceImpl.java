package com.fashion.supplychain.production.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.common.ParamUtils;
import com.fashion.supplychain.production.entity.MaterialDatabase;
import com.fashion.supplychain.production.mapper.MaterialDatabaseMapper;
import com.fashion.supplychain.production.service.MaterialDatabaseService;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Service
public class MaterialDatabaseServiceImpl extends ServiceImpl<MaterialDatabaseMapper, MaterialDatabase>
        implements MaterialDatabaseService {

    @Override
    public IPage<MaterialDatabase> queryPage(Map<String, Object> params) {
        Map<String, Object> safeParams = params == null ? new HashMap<>() : params;
        int page = ParamUtils.getPage(safeParams);
        int pageSize = ParamUtils.getPageSizeClamped(safeParams, 10, 1, 200);

        Page<MaterialDatabase> pageInfo = new Page<>(page, pageSize);

        String keyword = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(safeParams, "keyword"));
        String materialCode = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(safeParams, "materialCode"));
        String materialName = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(safeParams, "materialName"));
        String styleNo = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(safeParams, "styleNo"));
        String materialType = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(safeParams, "materialType"));
        String supplierName = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(safeParams, "supplierName"));
        String status = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(safeParams, "status"));
        String disabledStr = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(safeParams, "disabled"));

        LambdaQueryWrapper<MaterialDatabase> wrapper = new LambdaQueryWrapper<MaterialDatabase>()
                .eq(MaterialDatabase::getDeleteFlag, 0)
                .and(StringUtils.hasText(keyword), w -> w
                        .like(MaterialDatabase::getMaterialCode, keyword)
                        .or()
                        .like(MaterialDatabase::getMaterialName, keyword))
                .like(!StringUtils.hasText(keyword) && StringUtils.hasText(materialCode), MaterialDatabase::getMaterialCode, materialCode)
                .like(!StringUtils.hasText(keyword) && StringUtils.hasText(materialName), MaterialDatabase::getMaterialName, materialName)
                .like(StringUtils.hasText(styleNo), MaterialDatabase::getStyleNo, styleNo)
                .like(StringUtils.hasText(supplierName), MaterialDatabase::getSupplierName, supplierName)
                .eq(StringUtils.hasText(status), MaterialDatabase::getStatus, status)
                .orderByDesc(MaterialDatabase::getUpdateTime)
                .orderByDesc(MaterialDatabase::getCreateTime);

        if ("1".equals(disabledStr)) {
            wrapper.eq(MaterialDatabase::getDisabled, 1);
        }

        if (StringUtils.hasText(materialType)) {
            String mt = materialType.trim();
            if ("fabric".equalsIgnoreCase(mt) || "lining".equalsIgnoreCase(mt) || "accessory".equalsIgnoreCase(mt)) {
                wrapper.likeRight(MaterialDatabase::getMaterialType, mt.toLowerCase());
            } else {
                wrapper.eq(MaterialDatabase::getMaterialType, mt);
            }
        }

        return baseMapper.selectPage(pageInfo, wrapper);
    }

    @Override
    public String generateMaterialCode(String materialType) {
        String prefix;
        String baseType;
        if (materialType != null && materialType.toLowerCase().startsWith("lining")) {
            prefix = "L";
            baseType = "lining";
        } else if (materialType != null && materialType.toLowerCase().startsWith("fabric")) {
            prefix = "M";
            baseType = "fabric";
        } else {
            prefix = "F";
            baseType = "accessory";
        }

        String dateStr = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyyMMdd"));
        String codePrefix = prefix + dateStr;

        LambdaQueryWrapper<MaterialDatabase> wrapper = new LambdaQueryWrapper<MaterialDatabase>()
                .eq(MaterialDatabase::getDeleteFlag, 0)
                .likeRight(MaterialDatabase::getMaterialCode, codePrefix)
                .orderByDesc(MaterialDatabase::getMaterialCode)
                .last("LIMIT 1");

        MaterialDatabase lastRecord = baseMapper.selectOne(wrapper);
        int seq = 1;
        if (lastRecord != null && lastRecord.getMaterialCode() != null) {
            try {
                String lastCode = lastRecord.getMaterialCode();
                String seqPart = lastCode.substring(codePrefix.length());
                seq = Integer.parseInt(seqPart) + 1;
            } catch (Exception e) {
                seq = 1;
            }
        }

        return codePrefix + String.format("%03d", seq);
    }
}
