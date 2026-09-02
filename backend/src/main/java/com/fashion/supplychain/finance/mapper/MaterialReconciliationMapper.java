package com.fashion.supplychain.finance.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.finance.entity.MaterialReconciliation;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface MaterialReconciliationMapper extends BaseMapper<MaterialReconciliation> {

    /**
     * D-271：查询被逻辑删除的对账单（绕过 MP 逻辑删除插件）。
     *
     * <p>全局配置 {@code logic-delete-field: deleteFlag} 后，MyBatis-Plus 会对所有
     * wrapper 查询自动追加 {@code AND delete_flag = 0}——因此
     * {@code lambdaQuery().eq(deleteFlag, 1)} 永远查不到数据（SQL 变成
     * {@code delete_flag = 1 AND delete_flag = 0}）。
     * 恢复误删记录必须走原生 SQL（自定义 @Select 不受插件影响）。
     */
    @Select("SELECT * FROM t_material_reconciliation " +
            "WHERE purchase_id = #{purchaseId} AND delete_flag = 1 " +
            "ORDER BY create_time DESC LIMIT 1")
    MaterialReconciliation selectDeletedByPurchaseId(@Param("purchaseId") String purchaseId);
}
