package com.fashion.supplychain.intelligence.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.intelligence.entity.QuickAnswer;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.time.LocalDateTime;
import java.util.List;

/**
 * AI秒答缓存 Mapper。
 *
 * <p>多租户隔离（P0 铁律 4）：所有自定义查询带 tenant_id WHERE。
 */
@Mapper
public interface QuickAnswerMapper extends BaseMapper<QuickAnswer> {

    /** 获取指定租户最新的SNAPSHOT类型缓存 */
    @Select("SELECT * FROM t_quick_answer WHERE tenant_id = #{tenantId} " +
            "AND answer_type = 'SNAPSHOT' AND delete_flag = 0 " +
            "AND expire_time > NOW() ORDER BY data_timestamp DESC LIMIT 1")
    QuickAnswer findLatestSnapshot(@Param("tenantId") Long tenantId);

    /** 按问题模式匹配（简单关键词匹配，用于PREBUILT类型） */
    @Select("SELECT * FROM t_quick_answer WHERE tenant_id = #{tenantId} " +
            "AND answer_type = 'PREBUILT' AND delete_flag = 0 " +
            "AND expire_time > NOW() AND (question_pattern LIKE CONCAT('%', #{keyword}, '%')) " +
            "ORDER BY confidence DESC, hit_count DESC LIMIT 3")
    List<QuickAnswer> findPrebuiltByKeyword(@Param("tenantId") Long tenantId,
                                            @Param("keyword") String keyword);

    /** 获取指定租户最新的HOTSPOT（热点预取）缓存 */
    @Select("SELECT * FROM t_quick_answer WHERE tenant_id = #{tenantId} " +
            "AND answer_type = 'HOTSPOT' AND delete_flag = 0 " +
            "AND expire_time > NOW() ORDER BY data_timestamp DESC LIMIT 5")
    List<QuickAnswer> findLatestHotspots(@Param("tenantId") Long tenantId);

    /** 更新命中计数（每次命中后调用，用于统计高频问题） */
    @Update("UPDATE t_quick_answer SET hit_count = hit_count + 1, " +
            "last_hit_time = NOW() WHERE id = #{id}")
    int incrementHitCount(@Param("id") Long id);

    /** 清理过期缓存（可被定时任务调用，delete_flag软删） */
    @Update("UPDATE t_quick_answer SET delete_flag = 1 WHERE expire_time < NOW() AND delete_flag = 0")
    int softDeleteExpired();

    /** 写入新快照前，把该租户旧的SNAPSHOT标记为已删除（每租户只留最新1条有效快照） */
    @Update("UPDATE t_quick_answer SET delete_flag = 1 " +
            "WHERE tenant_id = #{tenantId} AND answer_type = 'SNAPSHOT' AND delete_flag = 0")
    int softDeleteOldSnapshots(@Param("tenantId") Long tenantId);

    /** 真正从表中删除已软删且过期超过1天的数据（避免表无限变大） */
    @Update("DELETE FROM t_quick_answer WHERE delete_flag = 1 " +
            "AND expire_time < NOW() - INTERVAL 1 DAY LIMIT 500")
    int hardDeleteSoftDeleted();

    /** 获取近24小时内命中次数最高的前N个缓存（用于统计高频问题） */
    @Select("SELECT * FROM t_quick_answer WHERE tenant_id = #{tenantId} " +
            "AND delete_flag = 0 AND last_hit_time > #{sinceTime} " +
            "ORDER BY hit_count DESC LIMIT #{limit}")
    List<QuickAnswer> findTopHits(@Param("tenantId") Long tenantId,
                                   @Param("sinceTime") LocalDateTime sinceTime,
                                   @Param("limit") int limit);
}
