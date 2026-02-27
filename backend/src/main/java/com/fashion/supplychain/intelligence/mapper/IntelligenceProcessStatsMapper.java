package com.fashion.supplychain.intelligence.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.intelligence.entity.IntelligenceProcessStats;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/**
 * 工序统计 Mapper — 支持 CRUD 及聚合学习查询
 */
@Mapper
public interface IntelligenceProcessStatsMapper extends BaseMapper<IntelligenceProcessStats> {

    /**
     * 查询最近 90 天内有扫码记录的活跃租户列表（供学习 Job 批量遍历）
     */
    @Select("SELECT DISTINCT tenant_id FROM t_scan_record "
            + "WHERE scan_time >= DATE_SUB(NOW(), INTERVAL 90 DAY) "
            + "AND tenant_id IS NOT NULL")
    List<Long> findActiveTenantIds();

    /**
     * 核心聚合查询：从 t_scan_record 计算各工序的平均耗时统计
     *
     * <p>逻辑：
     * <ol>
     *   <li>内层子查询：按 (order_id, progress_stage, scan_type) 分组，
     *       计算每订单/每阶段的：首次→末次扫码时间跨度（分钟）、每件平均耗时</li>
     *   <li>过滤异常样本：扫码次数>1、时间跨度2~43200分钟、每件耗时0~480分钟</li>
     *   <li>外层聚合：按 (progress_stage, scan_type) 分组，
     *       计算 AVG/MIN/MAX 以及样本量</li>
     *   <li>仅保留样本量≥2的工序（避免单点噪音）</li>
     * </ol>
     *
     * <p>返回结果字段别名与 {@code IntelligenceProcessStats} 属性名一一对应，
     * MyBatis 自动完成映射（包含 BigDecimal 转换）。
     */
    @Select({
        "SELECT",
        "  sub.progress_stage     AS stageName,",
        "  sub.scan_type          AS scanType,",
        "  COUNT(DISTINCT sub.order_id)        AS sampleCount,",
        "  AVG(sub.per_unit_avg)               AS avgMinutesPerUnit,",
        "  MIN(sub.per_unit_avg)               AS minMinutesPerUnit,",
        "  MAX(sub.per_unit_avg)               AS maxMinutesPerUnit,",
        "  AVG(sub.span_minutes)               AS avgStageTotalMinutes",
        "FROM (",
        "  SELECT",
        "    order_id,",
        "    progress_stage,",
        "    scan_type,",
        "    TIMESTAMPDIFF(MINUTE, MIN(scan_time), MAX(scan_time))                    AS span_minutes,",
        "    TIMESTAMPDIFF(MINUTE, MIN(scan_time), MAX(scan_time))",
        "      / NULLIF(SUM(quantity), 0)                                             AS per_unit_avg",
        "  FROM t_scan_record",
        "  WHERE scan_result = 'success'",
        "    AND tenant_id      = #{tenantId}",
        "    AND scan_time      >= DATE_SUB(NOW(), INTERVAL 90 DAY)",
        "    AND progress_stage IS NOT NULL",
        "    AND progress_stage != ''",
        "  GROUP BY order_id, progress_stage, scan_type",
        "  HAVING",
        "    SUM(quantity) > 0",
        "    AND COUNT(*) > 1",
        "    AND TIMESTAMPDIFF(MINUTE, MIN(scan_time), MAX(scan_time)) > 2",
        "    AND TIMESTAMPDIFF(MINUTE, MIN(scan_time), MAX(scan_time)) < 43200",
        "    AND TIMESTAMPDIFF(MINUTE, MIN(scan_time), MAX(scan_time))",
        "          / NULLIF(SUM(quantity), 0) > 0",
        "    AND TIMESTAMPDIFF(MINUTE, MIN(scan_time), MAX(scan_time))",
        "          / NULLIF(SUM(quantity), 0) < 480",
        ") sub",
        "GROUP BY sub.progress_stage, sub.scan_type",
        "HAVING COUNT(DISTINCT sub.order_id) >= 2"
    })
    List<IntelligenceProcessStats> aggregateFromScanRecord(@Param("tenantId") Long tenantId);
}
