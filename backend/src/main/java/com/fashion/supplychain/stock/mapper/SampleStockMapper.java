package com.fashion.supplychain.stock.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.stock.entity.SampleStock;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface SampleStockMapper extends BaseMapper<SampleStock> {

    @Update("UPDATE t_sample_stock SET quantity = quantity + #{quantity}, update_time = NOW() WHERE id = #{id} AND delete_flag = 0")
    int updateStockQuantity(@Param("id") String id, @Param("quantity") int quantity);

    @Update("UPDATE t_sample_stock SET loaned_quantity = loaned_quantity + #{quantity}, update_time = NOW() WHERE id = #{id} AND delete_flag = 0 AND (quantity - loaned_quantity) >= CASE WHEN #{quantity} < 0 THEN 0 ELSE #{quantity} END")
    int updateLoanedQuantity(@Param("id") String id, @Param("quantity") int quantity);
}
