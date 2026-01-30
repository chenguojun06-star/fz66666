package com.fashion.supplychain.production.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.production.entity.MaterialStock;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface MaterialStockMapper extends BaseMapper<MaterialStock> {

    @Update("UPDATE t_material_stock SET quantity = quantity + #{delta}, update_time = NOW() WHERE id = #{id}")
    int updateStockQuantity(@Param("id") String id, @Param("delta") int delta);

    @Update("UPDATE t_material_stock SET quantity = quantity - #{delta}, update_time = NOW() WHERE id = #{id} AND quantity >= #{delta}")
    int decreaseStockWithCheck(@Param("id") String id, @Param("delta") int delta);
}
