package com.fashion.supplychain.production.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.production.entity.MaterialRoll;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * 面辅料料卷 Mapper
 */
@Mapper
public interface MaterialRollMapper extends BaseMapper<MaterialRoll> {

    /**
     * 按入库单ID查询该批料卷列表
     */
    List<MaterialRoll> selectByInboundId(@Param("inboundId") String inboundId);

    /**
     * 按物料编码查询在库料卷
     */
    List<MaterialRoll> selectInStockByMaterialCode(@Param("materialCode") String materialCode,
                                                    @Param("tenantId") Long tenantId);
}
