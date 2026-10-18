package com.fashion.supplychain.finance;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * D-814：发票口径守护 —— 「内部开票台账」不能被说成「已开具真实发票」。
 *
 * <p><b>为什么要有这个测试</b>：核实发现本系统**不连接税局/税控盘**，
 * {@code issue()} 只是把状态从 DRAFT 改成 ISSUED，{@code invoiceNo} 由本系统生成。
 * 但前端按钮叫「开票」、统计卡叫「已开票额」，组合起来会让人以为发票真开出去了 ——
 * 而这张记录**不能作为报销或入账凭证**。一旦有人为了「文案更好看」把它改回
 * 「已开票」，没有任何门控会拦，商家就会拿着它去报销。
 *
 * <p>这类「措辞即业务语义」的约束只能靠测试钉住：它不违反任何静态检查，
 * 运行时也没有任何异常，只有肉眼和后果能发现。
 */
class InvoiceWordingGuardTest {

    private static final Path FRONTEND_INVOICE_TAB =
            // 测试的工作目录是 backend/，前端在同级上一层的 frontend/
            Paths.get("..", "frontend", "src", "modules", "finance", "pages", "TaxExport", "InvoiceTab.tsx");

    private static String readInvoiceTab() throws IOException {
        return Files.readString(FRONTEND_INVOICE_TAB, StandardCharsets.UTF_8);
    }

    @Test
    @DisplayName("页面必须醒目标注「不连接税局、不能作为报销凭证」")
    void pageWarnsAboutNotBeingRealTaxInvoice() throws IOException {
        String s = readInvoiceTab();

        assertTrue(s.contains("不连接税局"), "必须明说未接入税局");
        assertTrue(s.contains("不能作为报销") || s.contains("不能作为报销或入账凭证"),
                "必须明说不能作为报销/入账凭证");
        // 说明要放在 Alert 里，不能只藏在卡片说明文字里
        assertTrue(s.contains("<Alert") && s.contains("type=\"warning\""),
                "免责说明要用醒目的 warning Alert，不是 info、也不是藏在说明文字里");
    }

    @Test
    @DisplayName("按钮与统计卡不得再用「开票额/已开票」这类像真实发票的措辞")
    void noMisleadingInvoiceWording() throws IOException {
        String s = readInvoiceTab();

        for (String forbidden : new String[]{"本月开票额", "累计开票额", "title=\"已开票\""}) {
            assertFalse(s.contains(forbidden), "发现会误导的措辞：" + forbidden);
        }
        // 替代措辞必须在位，说明是「标记」而不是「开具」
        assertTrue(s.contains("标记已开票"), "按钮应表述为「标记已开票」");
        assertTrue(s.contains("台账已标记"), "统计卡应表述为「台账已标记」");
    }

    @Test
    @DisplayName("markdown 星号不会被 antd 渲染，必须用真正的强调元素")
    void noMarkdownAsteriskInAlertText() throws IOException {
        String s = readInvoiceTab();
        int alert = s.indexOf("<Alert");
        assertTrue(alert > 0, "应有警示 Alert");
        int end = s.indexOf("/>", alert);
        String block = s.substring(alert, end > 0 ? end : s.length());

        assertFalse(block.contains("**"),
                "antd 文案里的 ** 会原样显示给用户（页面上会出现星号），要用 <Text strong> 之类");
    }

    @Test
    @DisplayName("后端编排器必须写明这是内部台账、票号非税局下发")
    void backendOrchestratorDocumentsTheLimitation() throws IOException {
        Path p = Paths.get("src", "main", "java", "com", "fashion", "supplychain",
                "finance", "orchestration", "InvoiceOrchestrator.java");
        String s = Files.readString(p, StandardCharsets.UTF_8);

        assertTrue(s.contains("不连接税局"), "后端必须写明未接入税局");
        assertTrue(s.contains("不是税局下发") || s.contains("不是税局下发的发票号码"),
                "必须写明票号不是税局下发的");
        assertTrue(s.contains("不能作为报销"), "必须写明不能作为报销凭证");
    }
}