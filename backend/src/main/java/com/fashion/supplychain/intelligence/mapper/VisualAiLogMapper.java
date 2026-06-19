package com.fashion.supplychain.intelligence.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.intelligence.entity.VisualAiLog;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;
import java.util.Map;

@Mapper
public interface VisualAiLogMapper extends BaseMapper<VisualAiLog> {

    /**
     * 根据关键词搜索相似款式（关键词搜索替代向量搜索）。
     * 在 style_name, category, season, color, description, image_insight 字段中做 LIKE 匹配，
     * 统计每个款式命中的关键词数，按匹配分数排序，返回 Top K。
     */
    @Select("<script>" +
            "SELECT style_no, style_name, category, season, color, cover, " +
            "       difficulty_score, difficulty_level, " +
            "       ( " +
            "<foreach collection='keywords' item='kw' separator='+'>" +
            "         CASE WHEN style_name LIKE CONCAT('%', #{kw, jdbcType=VARCHAR}, '%') THEN 1 ELSE 0 END " +
            "         + CASE WHEN category LIKE CONCAT('%', #{kw, jdbcType=VARCHAR}, '%') THEN 1 ELSE 0 END " +
            "         + CASE WHEN season LIKE CONCAT('%', #{kw, jdbcType=VARCHAR}, '%') THEN 1 ELSE 0 END " +
            "         + CASE WHEN color LIKE CONCAT('%', #{kw, jdbcType=VARCHAR}, '%') THEN 1 ELSE 0 END " +
            "         + CASE WHEN IFNULL(description, '') LIKE CONCAT('%', #{kw, jdbcType=VARCHAR}, '%') THEN 1 ELSE 0 END " +
            "         + CASE WHEN IFNULL(image_insight, '') LIKE CONCAT('%', #{kw, jdbcType=VARCHAR}, '%') THEN 1 ELSE 0 END " +
            "</foreach> " +
            "       ) AS match_score " +
            "FROM t_style_info " +
            "WHERE tenant_id = #{tenantId} " +
            "  AND status = 'ENABLED' " +
            "  AND ( " +
            "<foreach collection='keywords' item='kw' separator=' OR '>" +
            "    style_name LIKE CONCAT('%', #{kw, jdbcType=VARCHAR}, '%') " +
            "    OR category LIKE CONCAT('%', #{kw, jdbcType=VARCHAR}, '%') " +
            "    OR season LIKE CONCAT('%', #{kw, jdbcType=VARCHAR}, '%') " +
            "    OR color LIKE CONCAT('%', #{kw, jdbcType=VARCHAR}, '%') " +
            "    OR IFNULL(description, '') LIKE CONCAT('%', #{kw, jdbcType=VARCHAR}, '%') " +
            "    OR IFNULL(image_insight, '') LIKE CONCAT('%', #{kw, jdbcType=VARCHAR}, '%') " +
            "</foreach> " +
            "  ) " +
            "ORDER BY match_score DESC " +
            "LIMIT #{topK}" +
            "</script>")
    List<Map<String, Object>> searchSimilarStylesByKeywords(
        @Param("tenantId") Long tenantId,
        @Param("keywords") List<String> keywords,
        @Param("topK") int topK
    );
}
