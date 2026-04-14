package com.fashion.supplychain.intelligence.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.intelligence.entity.AiJobRunLog;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/**
 * AI 定时任务日志 Mapper
 */
@Mapper
public interface AiJobRunLogMapper extends BaseMapper<AiJobRunLog> {

    /**
     * 查询最近 N 条任务日志（按开始时间倒序）
     */
    @Select("SELECT * FROM t_ai_job_run_log WHERE (#{tenantId} IS NULL OR tenant_id = #{tenantId}) ORDER BY start_time DESC LIMIT #{limit}")
    List<AiJobRunLog> selectRecent(@Param("limit") int limit, @Param("tenantId") Long tenantId);
}
