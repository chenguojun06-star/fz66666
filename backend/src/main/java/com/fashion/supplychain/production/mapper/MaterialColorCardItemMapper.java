package com.fashion.supplychain.production.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.production.entity.MaterialColorCardItem;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface MaterialColorCardItemMapper extends BaseMapper<MaterialColorCardItem> {

    @Select("SELECT * FROM t_material_color_card_item WHERE material_color_card_id = #{cardId} " +
            "AND tenant_id = #{tenantId} AND delete_flag = 0 " +
            "ORDER BY sort_order ASC, create_time ASC")
    List<MaterialColorCardItem> selectByCardId(@Param("cardId") String cardId, @Param("tenantId") Long tenantId);

    @Update("UPDATE t_material_color_card_item SET delete_flag = 1 WHERE material_color_card_id = #{cardId} AND tenant_id = #{tenantId}")
    int deleteByCardIdAndTenantId(@Param("cardId") String cardId, @Param("tenantId") Long tenantId);
}
