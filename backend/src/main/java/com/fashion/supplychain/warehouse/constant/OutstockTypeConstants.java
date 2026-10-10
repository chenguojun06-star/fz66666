package com.fashion.supplychain.warehouse.constant;

import java.util.Set;

/**
 * 出库类型 / 销售渠道 统一口径（D-800）
 *
 * <h3>为什么要有这个类</h3>
 * 历史上出库类型白名单在多处各自维护，已经出现漂移：
 * <ul>
 *   <li>{@code FinishedOutstockHelper} 的白名单<b>有</b> {@code shipment}</li>
 *   <li>{@code FinishedWarehouseOperationOrchestrator} 的白名单<b>缺</b> {@code shipment}</li>
 * </ul>
 * 同一类型在两处合法性判断不一致，导致「能否记为销售」在不同入口结论不同。
 *
 * <h3>销售口径（唯一权威）</h3>
 * 「销量 / 销售出库」只认 {@link #SALE_OUTSTOCK_TYPES}，
 * 调拨、报废、样衣借出、冲销<b>永远不算销量</b>。
 * 库存、看板、应收、趋势分析必须共用这里的判定，禁止各自硬编码字符串。
 *
 * <h3>销售渠道</h3>
 * {@code platform_code} 语义是「这批货是从哪个销售渠道卖给客户的」，
 * 供销量趋势做渠道维度拆分。与「仓库位置」无关，与调拨/报废无关（那些不是销售）。
 */
public final class OutstockTypeConstants {

    private OutstockTypeConstants() {
    }

    // ==================== 出库类型 ====================

    /** 销售出货（唯一能产生应收的类型） */
    public static final String SHIPMENT = "shipment";
    /** 自由出库（仓库页 / POS / 店铺等，发给客户） */
    public static final String FREE_OUTBOUND = "free_outbound";
    /** 扫码出库（小程序扫码发货） */
    public static final String SCAN_OUTBOUND = "scan_outbound";
    /** 样衣出库（内部流转，<b>不算销量</b>） */
    public static final String SAMPLE_OUT = "sample_out";
    /** 报废出库（内部损耗，<b>不算销量</b>） */
    public static final String DAMAGE_OUT = "damage_out";
    /** 调拨出库（仓库间挪货，<b>不算销量</b>） */
    public static final String TRANSFER_OUT = "transfer_out";
    /** 其他出库 */
    public static final String OTHER_OUT = "other_out";
    /** 冲销红字（<b>不算销量</b>，且数量为负） */
    public static final String REVERSAL = "reversal";

    /** 合法出库类型全集（单一来源，替代各处的私有白名单） */
    public static final Set<String> VALID_OUTSTOCK_TYPES = Set.of(
            SHIPMENT, FREE_OUTBOUND, SCAN_OUTBOUND,
            SAMPLE_OUT, DAMAGE_OUT, TRANSFER_OUT, OTHER_OUT);

    /**
     * 计入销量的出库类型。
     *
     * <p>口径说明：调拨（transfer_out）只是仓库之间挪货，报废（damage_out）是损耗，
     * 样衣（sample_out）是对内借出，冲销（reversal）是红字反向记录 —— 四者都<b>不是卖给了客户</b>。
     * 历史上多张统计（含电商可售库存扣减、看板出库统计）漏了这个过滤，
     * 导致内部流转被当成销量，库存与销售数据双双失真。
     */
    public static final Set<String> SALE_OUTSTOCK_TYPES = Set.of(
            SHIPMENT, FREE_OUTBOUND, SCAN_OUTBOUND);

    /**
     * 需要客户信息的出库类型（真正「发货给客户」的场景）。
     * 内部流向不再强制，避免调拨/报废被逼着填客户。
     */
    public static final Set<String> REQUIRES_CUSTOMER_TYPES = SALE_OUTSTOCK_TYPES;

    /**
     * 是否计入销量。
     *
     * @param outstockType 出库类型；null 视为不计入（<b>不兜底成「是」</b>，避免把未知类型算成销量）
     */
    public static boolean isSale(String outstockType) {
        return outstockType != null && SALE_OUTSTOCK_TYPES.contains(outstockType);
    }

    /**
     * 是否为内部流转（调拨/报废/样衣/冲销）—— 这些<b>永远不能</b>计入销量。
     */
    public static boolean isInternalTransfer(String outstockType) {
        return SAMPLE_OUT.equals(outstockType)
                || DAMAGE_OUT.equals(outstockType)
                || TRANSFER_OUT.equals(outstockType)
                || REVERSAL.equals(outstockType);
    }

    // ==================== 销售渠道（platform_code） ====================

    /** 销售渠道：微信小程序 / 自营 C 端店铺 */
    public static final String CHANNEL_SHOP = "SHOP";
    /** 销售渠道：POS 收银台 */
    public static final String CHANNEL_POS = "POS";
    /** 销售渠道：电商平台（淘宝/京东/拼多多/抖音/小红书等，取 EC 的 platform 值 TB/JD/PDD/DY/XHS） */
    public static final String CHANNEL_EC_PREFIX = "EC:";
    /** 销售渠道：PC 端手工出库（无外部渠道归属） */
    public static final String CHANNEL_PC = "PC";

    /**
     * 构造电商销售渠道标识，如 {@code EC:TB}。
     *
     * <p>加 {@code EC:} 前缀是为了避免与 EC 原始平台码（如 {@code TB}）混淆：
     * {@code platform_code} 列上可能同时存在「历史裸平台码」与「新 EC: 前缀值」，
     * 前缀让新旧口径可区分、可追溯，统计时也能一眼看出数据是哪个时期写入的。
     */
    public static String ecChannel(String platformCode) {
        if (platformCode == null || platformCode.isBlank()) {
            return null;
        }
        return CHANNEL_EC_PREFIX + platformCode.trim().toUpperCase();
    }

    /**
     * 旧值归一化：把历史上已写入的裸平台码统一加上 {@code EC:} 前缀。
     * 仅用于统计时兼容读取，<b>不写回数据库</b>，避免改动历史数据。
     */
    public static String normalizeChannelForRead(String platformCode) {
        if (platformCode == null || platformCode.isBlank()) {
            return null;
        }
        String v = platformCode.trim();
        if (v.regionMatches(true, 0, CHANNEL_EC_PREFIX, 0, CHANNEL_EC_PREFIX.length())) {
            return v.toUpperCase();
        }
        // 裸的 EC 平台码（TB/JD/PDD/DY/XHS/WC/SFY）→ 视为历史 EC 渠道
        return isBareEcPlatformCode(v) ? ecChannel(v) : v.toUpperCase();
    }

    private static boolean isBareEcPlatformCode(String v) {
        String u = v.toUpperCase();
        return Set.of("TB", "JD", "PDD", "DY", "XHS", "WC", "SFY").contains(u);
    }
}