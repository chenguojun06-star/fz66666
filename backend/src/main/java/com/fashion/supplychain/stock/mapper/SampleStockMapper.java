package com.fashion.supplychain.stock.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.stock.entity.SampleStock;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface SampleStockMapper extends BaseMapper<SampleStock> {

    @Update("UPDATE t_sample_stock SET quantity = quantity + #{quantity}, update_time = NOW() WHERE id = #{id} AND delete_flag = 0 AND tenant_id = #{tenantId}")
    int updateStockQuantity(@Param("id") String id, @Param("quantity") int quantity, @Param("tenantId") Long tenantId);

    @Update("UPDATE t_sample_stock SET loaned_quantity = loaned_quantity + #{quantity}, update_time = NOW() WHERE id = #{id} AND delete_flag = 0 AND tenant_id = #{tenantId} AND (quantity - loaned_quantity) >= CASE WHEN #{quantity} < 0 THEN 0 ELSE #{quantity} END")
    int updateLoanedQuantity(@Param("id") String id, @Param("quantity") int quantity, @Param("tenantId") Long tenantId);

    /**
     * P2 修复：样衣库存原子扣减（带数量校验）。
     * 替代 SampleStockOrchestrator 中"读-改-写"非原子扣减，避免并发超扣。
     * 仅当 quantity >= delta 时扣减成功，返回 1；否则返回 0。
     */
    @Update("UPDATE t_sample_stock SET quantity = quantity - #{delta}, update_time = NOW() WHERE id = #{id} AND delete_flag = 0 AND tenant_id = #{tenantId} AND quantity >= #{delta}")
    int decreaseStockQuantity(@Param("id") String id, @Param("delta") int delta, @Param("tenantId") Long tenantId);
}
