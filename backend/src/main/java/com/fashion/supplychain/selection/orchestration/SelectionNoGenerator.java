package com.fashion.supplychain.selection.orchestration;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.IntSupplier;

/**
 * 选品模块编号序号发生器（按 日期段 + 类型 分段、进程内原子自增）
 *
 * <p><b>背景（D-628）</b>：此前批次号 / 候选号 / 款号的后缀统一用
 * {@code String.format("%04d", (int)(Math.random() * 9000) + 1000)} 生成，
 * 取值范围仅 1000~9999 共 9000 个。按生日悖论，同一日期段内约
 * {@code sqrt(2 × 9000 × ln2) ≈ 112} 条记录即有 50% 概率出现重复，且随机数
 * 不可重放、不利于排查。三处受影响字段的实际风险并不相同：
 *
 * <ul>
 *   <li><b>批次号</b>（{@code t_selection_batch.batch_no}）、<b>候选号</b>
 *       （{@code t_selection_candidate.candidate_no}）—— 表上有
 *       {@code uk_*_no_tenant} 唯一索引兜底，撞号表现为插入失败（用户看到
 *       "创建失败"），属可恢复故障；</li>
 *   <li><b>款号</b>（{@code t_style_info.style_no}）—— <b>没有唯一索引</b>
 *       （V20260131 里的建索引语句被注释掉了），撞号会静默产生重复款号，
 *       是最危险的一处。</li>
 * </ul>
 *
 * <p><b>修复方式</b>：改为「日期段 + 类型 分段的进程内原子自增」，分段起点由调用方
 * 通过 {@code seedSupplier} 从数据库水位（该日期段当天/当月最大编号）推导，避免服务
 * 重启后序号归零与历史编号重复。与 {@code B2BOrderOrchestrator.generateOrderNo()}
 * 及 {@code PaymentNoGenerator} 的既有思路保持一致，不引入分布式锁——
 * <b>锁只能防并发写，防不住不同时刻的随机碰撞</b>，这里要解决的是唯一性问题。
 *
 * <p>分段键不含 tenantId：编号唯一约束是 {@code (编号, tenant_id)}，但序号段在各租户
 * 间共享，可避免同一日期段内两个租户抢到同一序号后才被唯一索引拒绝。
 */
@Slf4j
@Component
public class SelectionNoGenerator {

    /** key = scope|datePart，value = 该分段已分配到的序号（初始为 seed-1） */
    private static final ConcurrentHashMap<String, AtomicInteger> SEQ = new ConcurrentHashMap<>();

    /**
     * 分配下一个序号。
     *
     * @param scope        分段类型，如 BATCH / MKT_BATCH / CAND / STYLE
     * @param datePart     日期段字符串，如 20260929 / 2026092901 / 2609
     * @param seedSupplier 数据库水位提供者：返回该分段「下一个可用序号」的下界。
     *                     仅在该分段首次被访问时调用一次，之后纯内存自增。
     * @return 递增且在该进程内唯一的序号（从 1 开始）
     */
    public int nextSeq(String scope, String datePart, IntSupplier seedSupplier) {
        String key = scope + "|" + datePart;
        AtomicInteger counter = SEQ.computeIfAbsent(key, k -> {
            int seed;
            try {
                seed = Math.max(1, seedSupplier.getAsInt());
            } catch (Exception e) {
                log.warn("[SelectionNo] 序号水位加载失败，回退从 1 开始: scope={}, datePart={}", scope, datePart, e);
                seed = 1;
            }
            log.info("[SelectionNo] 序号分段初始化: scope={}, datePart={}, seed={}", scope, datePart, seed);
            return new AtomicInteger(seed - 1);
        });
        return counter.incrementAndGet();
    }

    /**
     * 按 4 位补零格式化序号。
     *
     * <p>超过 9999 时位数自然增长（{@code %04d} 输出 5 位），<b>刻意不做取模回绕</b>——
     * 编号唯一性优先于格式固定。按天分段的批次号要跑到 9999 条/天、按月分段的款号要
     * 跑到 9999 条/月才会触发，属可接受的极端情形。
     */
    public static String format(int seq) {
        return String.format("%04d", seq);
    }

    /**
     * 从形如 {@code SEL-20260929-0012} / {@code SEL2609 0012} / {@code CAND-2026092901-0012}
     * 的编号中解析末尾序号。用于推导数据库水位。
     *
     * @return 解析出的序号；编号为空或无数字后缀时返回 0
     */
    public static int parseSeq(String no) {
        if (no == null || no.isEmpty()) {
            return 0;
        }
        int i = no.length();
        while (i > 0 && Character.isDigit(no.charAt(i - 1))) {
            i--;
        }
        if (i == no.length()) {
            return 0;
        }
        try {
            return Integer.parseInt(no.substring(i));
        } catch (NumberFormatException e) {
            log.warn("[SelectionNo] 编号后缀解析失败，按水位 0 处理: no={}", no);
            return 0;
        }
    }
}
