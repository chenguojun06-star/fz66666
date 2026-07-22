package com.fashion.supplychain.intelligence.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.intelligence.entity.EvalItem;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

/**
 * 离线评估数据项 Mapper（P1-4）
 *
 * @author xiaoyun
 * @since 2026-07-22
 */
@Mapper
public interface EvalItemMapper extends BaseMapper<EvalItem> {

    /**
     * 查询数据集中未评估的项（带租户隔离，P0铁律4）。
     */
    @Select("SELECT * FROM t_eval_item WHERE tenant_id = #{tenantId} "
            + "AND dataset_id = #{datasetId} AND evaluated = 0 LIMIT #{limit}")
    List<EvalItem> findUnevaluated(@Param("tenantId") Long tenantId,
                                   @Param("datasetId") Long datasetId,
                                   @Param("limit") int limit);

    /**
     * 刷新数据集的 item_count（按 dataset_id 计数；dataset_id 全局唯一，已隐含租户隔离）。
     */
    @Update("UPDATE t_eval_dataset SET item_count = "
            + "(SELECT COUNT(*) FROM t_eval_item WHERE dataset_id = #{datasetId}) "
            + "WHERE id = #{datasetId}")
    int refreshItemCount(@Param("datasetId") Long datasetId);
}
