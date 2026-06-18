package com.fashion.supplychain.production.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.production.entity.MaterialColorCard;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface MaterialColorCardMapper extends BaseMapper<MaterialColorCard> {

    @Select("<script>" +
            "SELECT * FROM t_material_color_card WHERE delete_flag = 0 AND tenant_id = #{tenantId} " +
            "<if test='keyword != null and keyword != \"\"'>" +
            " AND (card_code LIKE CONCAT('%', #{keyword}, '%') " +
            " OR card_name LIKE CONCAT('%', #{keyword}, '%') " +
            " OR supplier_name LIKE CONCAT('%', #{keyword}, '%')) " +
            "</if>" +
            "<if test='materialType != null and materialType != \"\"'>" +
            " AND material_type = #{materialType} " +
            "</if>" +
            " ORDER BY create_time DESC LIMIT #{offset}, #{pageSize} " +
            "</script>")
    List<MaterialColorCard> selectByQuery(@Param("tenantId") Long tenantId,
                                          @Param("keyword") String keyword,
                                          @Param("materialType") String materialType,
                                          @Param("offset") int offset,
                                          @Param("pageSize") int pageSize);

    @Select("<script>" +
            "SELECT COUNT(*) FROM t_material_color_card WHERE delete_flag = 0 AND tenant_id = #{tenantId} " +
            "<if test='keyword != null and keyword != \"\"'>" +
            " AND (card_code LIKE CONCAT('%', #{keyword}, '%') " +
            " OR card_name LIKE CONCAT('%', #{keyword}, '%') " +
            " OR supplier_name LIKE CONCAT('%', #{keyword}, '%')) " +
            "</if>" +
            "<if test='materialType != null and materialType != \"\"'>" +
            " AND material_type = #{materialType} " +
            "</if>" +
            "</script>")
    long countByQuery(@Param("tenantId") Long tenantId,
                      @Param("keyword") String keyword,
                      @Param("materialType") String materialType);
}
