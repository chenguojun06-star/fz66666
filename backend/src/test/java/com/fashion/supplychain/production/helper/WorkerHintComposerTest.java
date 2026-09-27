package com.fashion.supplychain.production.helper;

import com.fashion.supplychain.style.entity.SecondaryProcess;
import com.fashion.supplychain.style.entity.StyleInfo;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/**
 * D-590 工人提示重构回归测试：
 * 针号误抓（贴进备注的工艺单行号"5 针织面料"被当成"5 针"）+ 针距提取 + 面料驱动针号/针具/注意点。
 */
class WorkerHintComposerTest {

    /** 生产实锤案例：BR26X1S1140A 备注贴了带行号的大货工艺制造单，曾误抓出"5 针" */
    private static final String PASTED_PROCESS_SHEET =
            "<div>4 裁剪前需松布和缩水，确认布号、正反面及验布；</div>"
            + "<div>5 针织面料需松布24小时后可裁剪，拉布经纬纱向要求经直纬平；</div>"
            + "<div>13 用线及针距要求：全件用402#配色PP线，不可有跳线、浮线、断线疵点 .针距：3cm14针</div>";

    private StyleInfo style(String description) {
        StyleInfo si = new StyleInfo();
        si.setDescription(description);
        return si;
    }

    @Test
    void 工艺单行号加针织首字不再误抓为针号() {
        Map<String, Object> info = WorkerHintComposer.compose(style(PASTED_PROCESS_SHEET), new ArrayList<>());
        Object needleHint = info.get("needleHint");
        assertTrue(needleHint == null || !String.valueOf(needleHint).startsWith("5 针"),
                "行号+『针织』首字不得被当成针号，实际=" + needleHint);
    }

    @Test
    void 备注中的针距被提取且不会冒充针号() {
        Map<String, Object> info = WorkerHintComposer.compose(style(PASTED_PROCESS_SHEET), new ArrayList<>());
        assertEquals("针距 3cm·14针（样衣工艺备注）", info.get("stitchHint"));
        assertNull(info.get("needleHint"), "针距里的『14针』没有号字，不能当针号");
    }

    @Test
    void 明确写11号针时直接采用人工备注() {
        Map<String, Object> info = WorkerHintComposer.compose(style("全件用11号针车缝"), new ArrayList<>());
        assertEquals("11号针（样衣工艺备注）", info.get("needleHint"));
    }

    @Test
    void 中文数字针号归一为阿拉伯数字() {
        Map<String, Object> info = WorkerHintComposer.compose(style("用九号针，针眼要小"), new ArrayList<>());
        assertEquals("9号针（样衣工艺备注）", info.get("needleHint"));
    }

    @Test
    void 实际面料成分优先驱动针号针具注意点() {
        StyleInfo si = style(null);
        si.setFabricComposition("100%桑蚕丝");
        Map<String, Object> info = WorkerHintComposer.compose(si, new ArrayList<>());
        assertEquals("9号针（AI 推荐·薄/娇贵面料）", info.get("needleHint"));
        assertEquals("细针（针眼小不留印）", info.get("needleTool"));
        List<?> tips = (List<?>) info.get("fabricTips");
        assertNotNull(tips);
        assertFalse(tips.isEmpty());
    }

    @Test
    void 面料成分缺失时按AI视觉识别兜底() {
        StyleInfo si = style(null);
        si.setFabricComposition(null);
        si.setVisionRaw("大类：长袖V领套头衬衫/罩衫。里布/衬布/挂面：领口挂面/贴边，无全里。");
        Map<String, Object> info = WorkerHintComposer.compose(si, new ArrayList<>());
        assertTrue(String.valueOf(info.get("needleHint")).startsWith("9号针"),
                "真丝类视觉描述应命中薄面料9号针，实际=" + info.get("needleHint"));
    }

    @Test
    void 弹力面料推荐球头针() {
        StyleInfo si = style(null);
        si.setFabricComposition("95%棉 5%氨纶");
        Map<String, Object> info = WorkerHintComposer.compose(si, new ArrayList<>());
        assertEquals("11号针（AI 推荐·弹力/针织面料）", info.get("needleHint"));
        assertEquals("球头针（圆头针尖）", info.get("needleTool"));
    }

    @Test
    void 二次工艺照常透传() {
        SecondaryProcess sp = new SecondaryProcess();
        sp.setProcessName("绣花");
        List<SecondaryProcess> procs = new ArrayList<>();
        procs.add(sp);
        Map<String, Object> info = WorkerHintComposer.compose(style("含绣花，11号针"), procs);
        assertEquals("绣花", info.get("secondaryProcessHint"));
    }
}
