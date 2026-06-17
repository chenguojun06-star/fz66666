package com.fashion.supplychain.production.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.production.entity.ColorCardItem;
import java.util.List;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface ColorCardItemMapper extends BaseMapper<ColorCardItem> {

    @Select("SELECT * FROM t_color_card_item WHERE color_card_id = #{colorCardId} AND delete_flag = 0 ORDER BY sort_order ASC, create_time ASC")
    List<ColorCardItem> selectByCardId(@Param("colorCardId") String colorCardId);

    @Delete("UPDATE t_color_card_item SET delete_flag = 1 WHERE color_card_id = #{colorCardId}")
    int deleteByCardId(@Param("colorCardId") String colorCardId);

    @Insert("<script>" +
            "<foreach collection='items' item='item' separator=';'>" +
            "INSERT INTO t_color_card_item (id, color_card_id, color_no, color_name, unit_price, image, remark, sort_order, tenant_id, delete_flag, create_time, update_time) " +
            "VALUES (#{item.id}, #{item.colorCardId}, #{item.colorNo}, #{item.colorName}, #{item.unitPrice}, #{item.image}, #{item.remark}, #{item.sortOrder}, #{item.tenantId}, 0, NOW(), NOW())" +
            "</foreach>" +
            "</script>")
    int batchInsert(@Param("items") List<ColorCardItem> items);
}
