package com.fashion.supplychain.shop.orchestration;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * D-781：生产工艺内容识别。
 *
 * <p>线上实测款式 BR25CQ0573B 的 {@code description} 里存的是生产工序文档，
 * 直接渲染在顾客端详情页上。用户明确要求「生产工艺说明不应该出现在电商页面」。
 *
 * <p>本测试用的是**真实线上文本**，不是编造的样例 —— 编造的样例往往
 * 「一眼就该判定」，真实脏数据才是难点。
 */
@DisplayName("生产工艺内容识别（D-781）")
class ProductionContentDetectorTest {

    /** 线上 BR25CQ0573B 的真实款式详情（截取自生产库，保留原文用词） */
    private static final String REAL_PROCESS_DOC =
            "大货工艺要求<br/>3 供应商管理有限公司 - 大货工艺制造单(2/2)<br/>"
            + "4 一、裁剪工艺说明：<br/>裁剪前需熨平熨烫，确认布号、正反面及丝布，裁剪按合同订单数量明细裁剪；<br/>"
            + "5 针织面料需松布2-4小时后可裁剪，拉布经纬纱向要求经直纬平，注意避开布疵点和色差；<br/>"
            + "6 裁剪按纸样标注的位置点做，钉刀眼对位（特殊面料和款式不可钻孔和打对位刀口），"
            + "分清各部位不同用料；<br/>7 裁片按顺序编号分包，避免大货出现色差现象。<br/>"
            + "二、工艺说明：<br/>9 绣花：图案颜色与工艺倒顺服版，花样不可起拱、浮线、断线、漏线、"
            + "污渍、变形走样，线路过密，线色有误，线头、纸衬需清理干净，底面熨烫带衬，位置参照纸样定位。<br/>"
            + "10 印花:图案需清晰,可有重叠、牙边、粘毛、露底、沙眼、粘手、发臭、龟裂、脱落、掉色、"
            + "异味、脏斑等，位置参照纸样定位。";

    /** 正常商品描述（不应被误杀） */
    private static final String REAL_CONSUMER_DESC =
            "经典真丝衬衫，桑蚕丝面料，垂坠感好不易起皱。"
            + "翻领设计，日常通勤和正式场合都合适。"
            + "洗涤建议：手洗或干洗，阴凉处晾干，避免暴晒。";

    @Test
    @DisplayName("① 线上真实工艺文档必须被判为生产资料")
    void realProcessDocMustBeDetected() {
        assertThat(ProductionContentDetector.looksLikeProductionContent(REAL_PROCESS_DOC)).isTrue();
    }

    @Test
    @DisplayName("② 正常商品描述绝不能被误杀")
    void consumerDescriptionMustNotBeBlocked() {
        assertThat(ProductionContentDetector.looksLikeProductionContent(REAL_CONSUMER_DESC)).isFalse();
    }

    @Test
    @DisplayName("③ 只命中 1 个词不判定（避免「印花工艺」这类真实卖点被误杀）")
    void singleMarkerNotEnough() {
        String text = "本款采用进口面料，经过特殊印染工艺处理，手感柔软舒适，"
                + "版型修身显瘦，适合日常通勤穿着，性价比很高。";
        assertThat(text).contains("印染工艺");
        // 只含"工艺"这种中性词，不含任何工序特征词
        assertThat(ProductionContentDetector.looksLikeProductionContent(text)).isFalse();
    }

    @Test
    @DisplayName("④ 含 HTML 标签也要能识别（线上 description 是富文本）")
    void htmlShouldBeStripped() {
        String html = "<p>缝纫要求：</p><p>裁剪与打版标准按工艺单执行，车缝车位按产线安排；"
                + "缝纫完成后须经过整烫与洗水处理，包装工艺按客户确认样执行。</p>";
        assertThat(ProductionContentDetector.looksLikeProductionContent(html)).isTrue();
    }

    @Test
    @DisplayName("④-b 40 字阈值是有意的：短文本宁可漏判也不误杀")
    void shortHtmlBelowThresholdNotJudged() {
        // 命中 2 个特征词但正文过短 → 不判定。
        // 误判的代价（把真实商品卖点藏起来）远大于漏判的代价。
        String shortHtml = "<p>缝纫要求：裁剪与打版按工艺单执行。</p>";
        assertThat(ProductionContentDetector.looksLikeProductionContent(shortHtml)).isFalse();
    }

    @Test
    @DisplayName("⑤ 过短文本不判定，避免拿「工艺」两个字就定罪")
    void shortTextNotJudged() {
        assertThat(ProductionContentDetector.looksLikeProductionContent("裁剪缝纫")).isFalse();
    }

    @Test
    @DisplayName("⑥ 空值安全")
    void nullAndBlankSafe() {
        assertThat(ProductionContentDetector.looksLikeProductionContent(null)).isFalse();
        assertThat(ProductionContentDetector.looksLikeProductionContent("")).isFalse();
        assertThat(ProductionContentDetector.looksLikeProductionContent("   ")).isFalse();
    }

    @Test
    @DisplayName("⑦ 隐藏原因文案必须说清「只是隐藏、没删数据」")
    void hideReasonExplainsDataIsKept() {
        assertThat(ProductionContentDetector.hideReason())
                .contains("隐藏")
                .contains("内部仍可见");
    }
}