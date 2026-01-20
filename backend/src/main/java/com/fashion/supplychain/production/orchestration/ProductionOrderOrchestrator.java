package com.fashion.supplychain.production.orchestration;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.google.zxing.BarcodeFormat;
import com.google.zxing.WriterException;
import com.google.zxing.client.j2se.MatrixToImageWriter;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.QRCodeWriter;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderQueryService;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ProductionOrderScanRecordDomainService;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.entity.StyleSize;
import com.fashion.supplychain.style.orchestration.StyleAttachmentOrchestrator;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.style.service.StyleSizeService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.openhtmltopdf.pdfboxout.PdfRendererBuilder;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.math.BigDecimal;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.text.Collator;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Locale;
import javax.imageio.ImageIO;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
@Slf4j
public class ProductionOrderOrchestrator {

    public static final String CLOSE_SOURCE_MY_ORDERS = "myOrders";
    public static final String CLOSE_SOURCE_PRODUCTION_PROGRESS = "productionProgress";

    // 尺码排序解析用正则预编译：避免在比较过程中重复编译，降低开销
    private static final java.util.regex.Pattern PATTERN_NUMERIC_SIZE = java.util.regex.Pattern
            .compile("^\\d+(\\.\\d+)?$");

    private static final java.util.regex.Pattern PATTERN_NUM_XL = java.util.regex.Pattern.compile("^(\\d+)XL$");

    private static final java.util.regex.Pattern PATTERN_XS = java.util.regex.Pattern.compile("^(X{0,4})S$");

    private static final java.util.regex.Pattern PATTERN_XL = java.util.regex.Pattern.compile("^(X{1,4})L$");

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private ProductionOrderQueryService productionOrderQueryService;

    @Autowired
    private MaterialPurchaseService materialPurchaseService;

    @Autowired
    private ProductionOrderProgressOrchestrationService progressOrchestrationService;

    @Autowired
    private ProductionOrderFinanceOrchestrationService financeOrchestrationService;

    @Autowired
    private ProductionOrderFlowOrchestrationService flowOrchestrationService;

    @Autowired
    private ProductionOrderScanRecordDomainService scanRecordDomainService;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private StyleInfoService styleInfoService;

    @Autowired
    private StyleSizeService styleSizeService;

    @Autowired
    private StyleAttachmentOrchestrator styleAttachmentOrchestrator;

    @Value("${fashion.upload-path}")
    private String uploadPath;

    public IPage<ProductionOrder> queryPage(Map<String, Object> params) {
        return productionOrderQueryService.queryPage(params);
    }

    public ProductionOrder getDetailById(String id) {
        String oid = StringUtils.hasText(id) ? id.trim() : null;
        if (!StringUtils.hasText(oid)) {
            throw new IllegalArgumentException("参数错误");
        }
        ProductionOrder order = productionOrderQueryService.getDetailById(oid);
        if (order == null) {
            throw new NoSuchElementException("生产订单不存在");
        }
        return order;
    }

    public boolean saveOrUpdateOrder(ProductionOrder productionOrder) {
        boolean isCreate = productionOrder != null && !StringUtils.hasText(productionOrder.getId());
        validateUnitPriceSources(productionOrder);
        boolean ok = productionOrderService.saveOrUpdateOrder(productionOrder);
        if (!ok) {
            throw new IllegalStateException("操作失败");
        }

        if (isCreate && productionOrder != null && StringUtils.hasText(productionOrder.getId())) {
            try {
                materialPurchaseService.generateDemandByOrderId(productionOrder.getId().trim(), false);
            } catch (Exception e) {
                String msg = e == null ? null : e.getMessage();
                if (msg == null || !msg.contains("已生成采购需求")) {
                    log.warn("Failed to generate material demand after order create: orderId={}",
                            productionOrder.getId(),
                            e);
                    scanRecordDomainService.insertOrchestrationFailure(
                            productionOrder,
                            "generateMaterialDemand",
                            msg == null ? "generateMaterialDemand failed" : ("generateMaterialDemand failed: " + msg),
                            LocalDateTime.now());
                }
            }

            try {
                generateWorkorderAttachmentOnCreate(productionOrder);
            } catch (Exception e) {
                String msg = e == null ? null : e.getMessage();
                log.warn("Failed to generate workorder after order create: orderId={}", productionOrder.getId(), e);
                scanRecordDomainService.insertOrchestrationFailure(
                        productionOrder,
                        "generateWorkorder",
                        msg == null ? "generateWorkorder failed" : ("generateWorkorder failed: " + msg),
                        LocalDateTime.now());
            }
        }

        return true;
    }

    private void validateUnitPriceSources(ProductionOrder productionOrder) {
        if (productionOrder == null) {
            throw new IllegalArgumentException("参数错误");
        }
        String details = safeText(productionOrder.getOrderDetails());
        if (!StringUtils.hasText(details)) {
            throw new IllegalStateException("订单明细缺少物料价格来源信息");
        }
        List<Map<String, Object>> lines = resolveOrderLines(details);
        if (lines == null || lines.isEmpty()) {
            throw new IllegalStateException("订单明细缺少物料价格来源信息");
        }
        for (Map<String, Object> r : lines) {
            if (r == null || r.isEmpty()) {
                continue;
            }
            String source = pickFirstText(r, "materialPriceSource", "material_price_source", "materialPrice来源", "物料价格来源");
            String acquiredAt = pickFirstText(r, "materialPriceAcquiredAt", "material_price_acquired_at", "materialPriceTime", "物料价格获取时间");
            String version = pickFirstText(r, "materialPriceVersion", "material_price_version", "materialPriceVer", "物料价格版本");
            if (!StringUtils.hasText(source) || !"物料采购系统".equals(source.trim())) {
                throw new IllegalStateException("物料价格来源必须为物料采购系统");
            }
            if (!StringUtils.hasText(acquiredAt)) {
                throw new IllegalStateException("物料价格获取时间不能为空");
            }
            if (!StringUtils.hasText(version)) {
                throw new IllegalStateException("物料价格版本不能为空");
            }
        }
    }

    private List<Map<String, Object>> resolveOrderLines(String details) {
        if (!StringUtils.hasText(details)) {
            return List.of();
        }
        try {
            List<Map<String, Object>> list = objectMapper.readValue(details,
                    new TypeReference<List<Map<String, Object>>>() {
                    });
            if (list != null) {
                return list;
            }
        } catch (Exception ignore) {
        }
        try {
            Map<String, Object> obj = objectMapper.readValue(details, new TypeReference<Map<String, Object>>() {
            });
            Object lines = obj == null ? null
                    : (obj.get("lines") != null ? obj.get("lines")
                            : (obj.get("items") != null ? obj.get("items")
                                    : (obj.get("details") != null ? obj.get("details") : obj.get("list"))));
            if (lines instanceof List) {
                @SuppressWarnings("unchecked")
                List<Map<String, Object>> cast = (List<Map<String, Object>>) lines;
                return cast;
            }
        } catch (Exception ignore) {
        }
        return List.of();
    }

    private String pickFirstText(Map<String, Object> row, String... keys) {
        if (row == null || keys == null) {
            return "";
        }
        for (String k : keys) {
            if (!StringUtils.hasText(k)) {
                continue;
            }
            if (row.containsKey(k)) {
                return safeText(row.get(k));
            }
        }
        return "";
    }

    private void generateWorkorderAttachmentOnCreate(ProductionOrder order) {
        if (order == null || !StringUtils.hasText(order.getId())) {
            return;
        }
        Long styleId = parseLong(order.getStyleId());
        if (styleId == null) {
            return;
        }

        StyleInfo style = styleInfoService.getById(styleId);
        if (style == null) {
            throw new NoSuchElementException("款号不存在");
        }

        List<StyleSize> sizeList = styleSizeService.listByStyleId(styleId);
        LinkedHashMap<String, Integer> sizeQty = parseOrderSizeQty(order);

        String orderNo = safeText(order.getOrderNo());
        String styleNo = safeText(style.getStyleNo());
        String base = "生产制单";
        if (StringUtils.hasText(orderNo)) {
            base += "-" + orderNo;
        }
        if (StringUtils.hasText(styleNo)) {
            base += "-" + styleNo;
        }

        // 下单后自动生成“生产制单”PDF，并作为款号附件保存（用于现场打印/扫码）
        String html = buildOrderWorkorderHtml(order, style, sizeList, sizeQty);
        byte[] pdf = renderPdfFromHtml(html);
        String fileName = sanitizeFilename(base) + ".pdf";
        styleAttachmentOrchestrator.saveGenerated(pdf, fileName, String.valueOf(styleId), "workorder",
                "application/pdf");
    }

    private LinkedHashMap<String, Integer> parseOrderSizeQty(ProductionOrder order) {
        LinkedHashMap<String, Integer> map = new LinkedHashMap<>();
        for (String s : splitCsv(safeText(order == null ? null : order.getSize()))) {
            if (!map.containsKey(s)) {
                map.put(s, 0);
            }
        }

        String details = safeText(order == null ? null : order.getOrderDetails());
        if (!StringUtils.hasText(details)) {
            return map;
        }

        List<Map<String, Object>> rows = null;
        try {
            rows = objectMapper.readValue(details, new TypeReference<List<Map<String, Object>>>() {
            });
        } catch (Exception ignore) {
        }

        if (rows == null) {
            try {
                Map<String, Object> obj = objectMapper.readValue(details, new TypeReference<Map<String, Object>>() {
                });
                Object lines = obj == null ? null
                        : (obj.get("orderLines") != null ? obj.get("orderLines")
                                : (obj.get("lines") != null ? obj.get("lines") : obj.get("items")));
                if (lines instanceof List) {
                    @SuppressWarnings("unchecked")
                    List<Map<String, Object>> cast = (List<Map<String, Object>>) lines;
                    rows = cast;
                } else {
                    Object sizeQty = obj == null ? null : obj.get("sizeQty");
                    if (sizeQty instanceof Map) {
                        @SuppressWarnings("unchecked")
                        Map<String, Object> sq = (Map<String, Object>) sizeQty;
                        for (Map.Entry<String, Object> e : sq.entrySet()) {
                            String size = safeText(e == null ? null : e.getKey());
                            int qty = toInt(e == null ? null : e.getValue());
                            if (!StringUtils.hasText(size)) {
                                continue;
                            }
                            map.putIfAbsent(size, 0);
                            map.put(size, map.get(size) + Math.max(0, qty));
                        }
                        return map;
                    }

                    if (obj != null) {
                        for (Map.Entry<String, Object> e : obj.entrySet()) {
                            String size = safeText(e == null ? null : e.getKey());
                            if (!StringUtils.hasText(size)) {
                                continue;
                            }
                            int qty = toInt(e == null ? null : e.getValue());
                            if (qty <= 0) {
                                continue;
                            }
                            map.putIfAbsent(size, 0);
                            map.put(size, map.get(size) + Math.max(0, qty));
                        }
                        return map;
                    }
                }
            } catch (Exception ignore) {
            }
        }

        if (rows != null) {
            for (Map<String, Object> r : rows) {
                String size = safeText(r == null ? null : r.get("size"));
                if (!StringUtils.hasText(size)) {
                    continue;
                }
                int qty = toInt(r == null ? null : r.get("quantity"));
                map.putIfAbsent(size, 0);
                map.put(size, map.get(size) + Math.max(0, qty));
            }
        }

        return map;
    }

    private String buildOrderWorkorderHtml(ProductionOrder order, StyleInfo style, List<StyleSize> sizeList,
            LinkedHashMap<String, Integer> sizeQty) {
        String styleNo = safeText(style == null ? null : style.getStyleNo());
        String styleName = safeText(style == null ? null : style.getStyleName());
        String cover = safeText(style == null ? null : style.getCover());
        String coverSrc = resolveCoverSrc(cover);

        String orderNo = safeText(order == null ? null : order.getOrderNo());
        String color = safeText(order == null ? null : order.getColor());
        String qrValue = safeText(order == null ? null : order.getQrCode());
        String qrUrl = buildQrPngDataUri(qrValue);
        if (!StringUtils.hasText(qrUrl) && StringUtils.hasText(qrValue)) {
            qrUrl = "https://api.qrserver.com/v1/create-qr-code/?size=220x220&data="
                    + URLEncoder.encode(qrValue, StandardCharsets.UTF_8);
        }

        String orderSizeTable = buildOrderSizeTable(sizeQty,
                order == null ? null : order.getOrderQuantity());
        String productionReqTable = buildProductionReqTable(style == null ? null : style.getDescription(), 15);
        String sizeTable = buildStyleSizeTable(sizeList);

        return "<!DOCTYPE html>"
                + "<html lang=\"zh-CN\">"
                + "<head>"
                + "<meta charset=\"utf-8\" />"
                + "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />"
                + "<title>生产制单-" + escapeHtml(styleNo) + "-" + escapeHtml(orderNo) + "</title>"
                + "<style>"
                + "@page{margin:10mm;}"
                + "body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'PingFang SC','Hiragino Sans GB','Microsoft YaHei',Arial,sans-serif;color:#111;}"
                + ".page{max-width:980px;margin:0 auto;}"
                + ".header-table{width:100%;border-collapse:collapse;table-layout:fixed;}"
                + ".header-table td{border:0;padding:0;vertical-align:top;}"
                + ".header-cover{width:200px;padding-right:16px;}"
                + ".header-main{padding-right:16px;}"
                + ".header-qr{width:240px;}"
                + ".cover{width:200px;height:200px;object-fit:cover;border-radius:10px;border:1px solid rgba(0,0,0,0.08);background:#fff;}"
                + ".qr{width:220px;height:220px;border-radius:10px;border:1px solid rgba(0,0,0,0.08);background:#fff;display:flex;align-items:center;justify-content:center;}"
                + ".h1{font-size:22px;font-weight:700;margin:0 0 8px;}"
                + ".meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px 16px;}"
                + ".meta div{font-size:13px;color:rgba(0,0,0,0.85);}"
                + ".muted{color:rgba(0,0,0,0.55);}"
                + ".section{margin-top:18px;}"
                + ".section-title{font-weight:700;font-size:14px;margin-bottom:8px;}"
                + "table{width:100%;border-collapse:collapse;font-size:12px;table-layout:fixed;}"
                + "th,td{border:1px solid rgba(0,0,0,0.10);padding:6px 8px;vertical-align:top;overflow-wrap:anywhere;word-break:break-word;}"
                + "th{background:rgba(0,0,0,0.03);text-align:left;}"
                + ".no{width:56px;text-align:center;}"
                + ".req{white-space:pre-wrap;}"
                + ".size-qty th,.size-qty td{text-align:center;}"
                + ".size-qty .row-head{text-align:left;width:72px;}"
                + ".size-qty .total-cell{text-align:right;width:140px;}"
                + "@media print{.page{max-width:none;}}"
                + "</style>"
                + "</head>"
                + "<body>"
                + "<div class=\"page\">"
                + "<table class=\"header-table\"><tr>"
                + "<td class=\"header-cover\">"
                + (StringUtils.hasText(coverSrc)
                        ? ("<img class=\"cover\" src=\"" + escapeHtml(coverSrc)
                                + "\" onerror=\"this.style.display='none'\" />")
                        : "")
                + "</td>"
                + "<td class=\"header-main\">"
                + "<div class=\"h1\">生产制单</div>"
                + "<div class=\"meta\">"
                + "<div>订单号：" + escapeHtml(orderNo) + "</div>"
                + "<div>款号：" + escapeHtml(styleNo) + "</div>"
                + "<div>款名：" + escapeHtml(styleName) + "</div>"
                + "<div>颜色：" + escapeHtml(color) + "</div>"
                + "</div>"
                + "</td>"
                + "<td class=\"header-qr\">"
                + (StringUtils.hasText(qrUrl)
                        ? ("<div class=\"qr\"><img alt=\"qr\" src=\"" + escapeHtml(qrUrl)
                                + "\" style=\"width:200px;height:200px\" onerror=\"this.style.display='none'\" /></div>"
                                + "<div class=\"muted\" style=\"font-size:12px;margin-top:6px;word-break:break-all\">"
                                + escapeHtml(qrValue) + "</div>")
                        : "")
                + "</td>"
                + "</tr></table>"

                + "<div class=\"section\">"
                + "<div class=\"section-title\">订单码数</div>"
                + orderSizeTable
                + "</div>"

                + "<div class=\"section\">"
                + "<div class=\"section-title\">生产要求</div>"
                + productionReqTable
                + "</div>"

                + "<div class=\"section\">"
                + "<div class=\"section-title\">码数信息</div>"
                + sizeTable
                + "</div>"

                + "</div>"
                + "</body>"
                + "</html>";
    }

    private byte[] renderPdfFromHtml(String html) {
        String content = html == null ? "" : html;
        ByteArrayOutputStream out = new ByteArrayOutputStream(64 * 1024);
        try {
            PdfRendererBuilder builder = new PdfRendererBuilder();
            builder.useFastMode();
            registerPdfFonts(builder);
            builder.withHtmlContent(content, null);
            builder.toStream(out);
            builder.run();
            return out.toByteArray();
        } catch (Exception e) {
            String msg = e == null ? null : e.getMessage();
            if (!StringUtils.hasText(msg)) {
                msg = "PDF生成失败";
            } else {
                msg = "PDF生成失败: " + msg;
            }
            throw new IllegalStateException(msg, e);
        }
    }

    private void registerPdfFonts(PdfRendererBuilder builder) {
        if (builder == null) {
            return;
        }

        List<String> candidates = List.of(
                "/System/Library/Fonts/PingFang.ttc",
                "/System/Library/Fonts/STHeiti Medium.ttc",
                "/Library/Fonts/Microsoft YaHei.ttf",
                "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc",
                "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
                "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
                "/usr/share/fonts/opentype/noto/NotoSansCJKsc-Regular.otf",
                "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
                "/usr/share/fonts/truetype/noto/NotoSansCJKsc-Regular.otf");

        for (String p : candidates) {
            if (!StringUtils.hasText(p)) {
                continue;
            }
            File f = new File(p.trim());
            if (!f.exists() || !f.isFile()) {
                continue;
            }
            try {
                builder.useFont(f, "PingFang SC");
                builder.useFont(f, "Microsoft YaHei");
                builder.useFont(f, "Noto Sans CJK SC");
                builder.useFont(f, "WenQuanYi Micro Hei");
                break;
            } catch (Exception ignore) {
            }
        }
    }

    private String resolveCoverSrc(String coverUrl) {
        String v = safeText(coverUrl);
        if (!StringUtils.hasText(v)) {
            return "";
        }
        if (v.startsWith("data:")) {
            return v;
        }
        String data = dataUriFromDownloadUrl(v);
        return StringUtils.hasText(data) ? data : v;
    }

    private String dataUriFromDownloadUrl(String url) {
        String u = safeText(url);
        if (!StringUtils.hasText(u)) {
            return "";
        }
        String prefix = "/api/common/download/";
        int idx = u.indexOf(prefix);
        if (idx < 0) {
            return "";
        }
        String fileName = u.substring(idx + prefix.length()).trim();
        if (!StringUtils.hasText(fileName) || fileName.contains("..") || fileName.contains("/")
                || fileName.contains("\\")) {
            return "";
        }
        if (!StringUtils.hasText(uploadPath)) {
            return "";
        }
        try {
            Path baseDir = Path.of(uploadPath).toAbsolutePath().normalize();
            Path filePath = baseDir.resolve(fileName).normalize();
            if (!filePath.startsWith(baseDir) || !Files.exists(filePath) || !Files.isRegularFile(filePath)) {
                return "";
            }

            byte[] bytes = Files.readAllBytes(filePath);
            if (bytes.length == 0) {
                return "";
            }
            String contentType = null;
            try {
                contentType = Files.probeContentType(filePath);
            } catch (Exception ignore) {
            }
            String ct = null;
            if (contentType != null) {
                String trimmed = contentType.trim();
                if (!trimmed.isEmpty()) {
                    ct = trimmed;
                }
            }
            if (!StringUtils.hasText(ct)) {
                ct = guessImageContentType(fileName);
            }
            if (!StringUtils.hasText(ct)) {
                ct = "application/octet-stream";
            }
            String b64 = Base64.getEncoder().encodeToString(bytes);
            return "data:" + ct + ";base64," + b64;
        } catch (Exception e) {
            return "";
        }
    }

    private String guessImageContentType(String fileName) {
        String n = safeText(fileName).toLowerCase();
        if (n.endsWith(".png")) {
            return "image/png";
        }
        if (n.endsWith(".jpg") || n.endsWith(".jpeg")) {
            return "image/jpeg";
        }
        if (n.endsWith(".gif")) {
            return "image/gif";
        }
        if (n.endsWith(".webp")) {
            return "image/webp";
        }
        if (n.endsWith(".bmp")) {
            return "image/bmp";
        }
        return null;
    }

    private String buildQrPngDataUri(String text) {
        String v = safeText(text);
        if (!StringUtils.hasText(v)) {
            return "";
        }
        try {
            BitMatrix matrix = new QRCodeWriter().encode(v, BarcodeFormat.QR_CODE, 220, 220);
            BufferedImage image = MatrixToImageWriter.toBufferedImage(matrix);
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            ImageIO.write(image, "png", out);
            String b64 = Base64.getEncoder().encodeToString(out.toByteArray());
            return "data:image/png;base64," + b64;
        } catch (WriterException e) {
            return "";
        } catch (Exception e) {
            return "";
        }
    }

    private String buildOrderSizeTable(LinkedHashMap<String, Integer> sizeQty, Integer totalQty) {
        if (sizeQty == null || sizeQty.isEmpty()) {
            int total = totalQty == null ? 0 : Math.max(0, totalQty);
            return "<div class=\"muted\">-</div>"
                    + (total > 0 ? ("<div class=\"muted\" style=\"margin-top:6px\">总下单数：" + total + "</div>") : "");
        }

        int sum = 0;
        StringBuilder head = new StringBuilder();
        StringBuilder qtyRow = new StringBuilder();
        for (Map.Entry<String, Integer> e : sizeQty.entrySet()) {
            String s = safeText(e == null ? null : e.getKey());
            int q = e == null ? 0 : (e.getValue() == null ? 0 : e.getValue());
            q = Math.max(0, q);
            sum += q;
            head.append("<th>").append(escapeHtml(s)).append("</th>");
            qtyRow.append("<td>").append(q).append("</td>");
        }
        int total = totalQty == null ? 0 : Math.max(0, totalQty);
        int finalTotal = total > 0 ? total : sum;

        return "<table class=\"size-qty\">"
                + "<tr><th class=\"row-head\">码数</th>" + head + "<th class=\"total-cell\"></th></tr>"
                + "<tr><th class=\"row-head\">下单数</th>" + qtyRow + "<th class=\"total-cell\">总下单数：" + finalTotal
                + "</th></tr>"
                + "</table>";
    }

    private String buildProductionReqTable(String description, int fixedCount) {
        List<String> lines = normalizeProductionReqLines(description, fixedCount);
        StringBuilder sb = new StringBuilder();
        sb.append("<table><thead><tr><th class=\"no\">序号</th><th>内容</th></tr></thead><tbody>");
        for (int i = 0; i < lines.size(); i++) {
            sb.append("<tr><td class=\"no\">").append(i + 1).append("</td><td class=\"req\">")
                    .append(escapeHtml(lines.get(i))).append("</td></tr>");
        }
        sb.append("</tbody></table>");
        return sb.toString();
    }

    private List<String> normalizeProductionReqLines(String description, int fixedCount) {
        String raw = description == null ? "" : description;
        String[] parts = raw.split("\\r?\\n");
        List<String> cleaned = new ArrayList<>();
        for (String p : parts) {
            String t = p == null ? "" : p;
            t = t.replaceAll("^\\s*\\d+\\s*[.、)）-]?\\s*", "").trim();
            if (!t.isEmpty()) {
                cleaned.add(t);
            }
        }
        int n = Math.max(0, fixedCount);
        List<String> out = new ArrayList<>(n);
        for (int i = 0; i < n; i++) {
            out.add(i < cleaned.size() ? cleaned.get(i) : "");
        }
        return out;
    }

    private String buildStyleSizeTable(List<StyleSize> sizeList) {
        if (sizeList == null || sizeList.isEmpty()) {
            return "<div class=\"muted\">-</div>";
        }

        LinkedHashSet<String> sizeNames = new LinkedHashSet<>();
        LinkedHashSet<String> partNames = new LinkedHashSet<>();
        LinkedHashMap<String, String> partMethod = new LinkedHashMap<>();
        LinkedHashMap<String, StyleSize> cellMap = new LinkedHashMap<>();

        for (StyleSize r : sizeList) {
            if (r == null) {
                continue;
            }
            String sizeName = safeText(r.getSizeName());
            String partName = safeText(r.getPartName());
            if (StringUtils.hasText(sizeName)) {
                sizeNames.add(sizeName);
            }
            if (StringUtils.hasText(partName)) {
                partNames.add(partName);
                if (!partMethod.containsKey(partName)) {
                    String mm = safeText(r.getMeasureMethod());
                    partMethod.put(partName, mm);
                }
            }
            if (StringUtils.hasText(sizeName) && StringUtils.hasText(partName)) {
                cellMap.put(partName + "__" + sizeName, r);
            }
        }

        List<String> sortedSizes = new ArrayList<>(sizeNames);
        Collections.sort(sortedSizes, this::compareSizeAsc);

        StringBuilder header = new StringBuilder();
        header.append("<tr><th style=\"width:140px\">部位(cm)</th><th style=\"width:120px\">度量方式</th>");
        for (String s : sortedSizes) {
            header.append("<th>").append(escapeHtml(s)).append("</th>");
        }
        header.append("</tr>");

        StringBuilder rows = new StringBuilder();
        for (String part : partNames) {
            rows.append("<tr><td>").append(escapeHtml(part)).append("</td><td>")
                    .append(escapeHtml(safeText(partMethod.get(part)))).append("</td>");
            for (String size : sortedSizes) {
                StyleSize cell = cellMap.get(part + "__" + size);
                String v = "";
                if (cell != null && cell.getStandardValue() != null) {
                    v = cell.getStandardValue().stripTrailingZeros().toPlainString();
                    if (cell.getTolerance() != null && cell.getTolerance().compareTo(BigDecimal.ZERO) != 0) {
                        v += " ±" + cell.getTolerance().stripTrailingZeros().toPlainString();
                    }
                }
                rows.append("<td>").append(escapeHtml(v)).append("</td>");
            }
            rows.append("</tr>");
        }

        return "<table><thead>" + header + "</thead><tbody>" + rows + "</tbody></table>";
    }

    private int compareSizeAsc(String a, String b) {
        SizeKey ka = parseSizeKey(a);
        SizeKey kb = parseSizeKey(b);
        if (ka.rank != kb.rank) {
            return Integer.compare(ka.rank, kb.rank);
        }
        if (Double.compare(ka.num, kb.num) != 0) {
            return Double.compare(ka.num, kb.num);
        }
        Collator collator = Collator.getInstance(Locale.SIMPLIFIED_CHINESE);
        return collator.compare(ka.raw, kb.raw);
    }

    private SizeKey parseSizeKey(String input) {
        String raw = safeText(input);
        String upper = raw.toUpperCase(Locale.ROOT);
        if (!StringUtils.hasText(upper) || "-".equals(upper)) {
            return new SizeKey(9999, 0, upper);
        }
        if ("均码".equals(upper) || "ONE SIZE".equals(upper) || "ONESIZE".equals(upper)) {
            return new SizeKey(55, 0, upper);
        }
        if (PATTERN_NUMERIC_SIZE.matcher(upper).matches()) {
            try {
                return new SizeKey(0, Double.parseDouble(upper), upper);
            } catch (Exception ignore) {
                return new SizeKey(0, 0, upper);
            }
        }
        java.util.regex.Matcher mNumXL = PATTERN_NUM_XL.matcher(upper);
        if (mNumXL.matches()) {
            try {
                int n = Integer.parseInt(mNumXL.group(1));
                return new SizeKey(70 + Math.max(0, n - 1) * 10, 0, upper);
            } catch (Exception ignore) {
                return new SizeKey(70, 0, upper);
            }
        }
        java.util.regex.Matcher mXS = PATTERN_XS.matcher(upper);
        if (mXS.matches()) {
            int len = mXS.group(1) == null ? 0 : mXS.group(1).length();
            return new SizeKey(40 - len * 10, 0, upper);
        }
        if ("S".equals(upper)) {
            return new SizeKey(40, 0, upper);
        }
        if ("M".equals(upper)) {
            return new SizeKey(50, 0, upper);
        }
        java.util.regex.Matcher mXL = PATTERN_XL.matcher(upper);
        if (mXL.matches()) {
            int len = mXL.group(1) == null ? 0 : mXL.group(1).length();
            return new SizeKey(60 + len * 10, 0, upper);
        }
        if ("L".equals(upper)) {
            return new SizeKey(60, 0, upper);
        }
        if ("XL".equals(upper)) {
            return new SizeKey(70, 0, upper);
        }
        if ("XXL".equals(upper)) {
            return new SizeKey(80, 0, upper);
        }
        if ("XXXL".equals(upper)) {
            return new SizeKey(90, 0, upper);
        }
        return new SizeKey(5000, 0, upper);
    }

    private static class SizeKey {
        private final int rank;
        private final double num;
        private final String raw;

        private SizeKey(int rank, double num, String raw) {
            this.rank = rank;
            this.num = num;
            this.raw = raw == null ? "" : raw;
        }
    }

    private List<String> splitCsv(String text) {
        List<String> out = new ArrayList<>();
        if (!StringUtils.hasText(text)) {
            return out;
        }
        for (String p : text.split(",")) {
            String s = safeText(p);
            if (StringUtils.hasText(s)) {
                out.add(s);
            }
        }
        return out;
    }

    private int toInt(Object v) {
        if (v == null) {
            return 0;
        }
        if (v instanceof Number number) {
            return number.intValue();
        }
        try {
            return Integer.parseInt(String.valueOf(v).trim());
        } catch (Exception e) {
            return 0;
        }
    }

    private Long parseLong(String v) {
        if (!StringUtils.hasText(v)) {
            return null;
        }
        try {
            return Long.valueOf(v.trim());
        } catch (Exception e) {
            return null;
        }
    }

    private String safeText(Object v) {
        String s = v == null ? "" : String.valueOf(v);
        String t = s.trim();
        return t;
    }

    private String sanitizeFilename(String v) {
        String s = safeText(v);
        if (!StringUtils.hasText(s)) {
            return "file";
        }
        return s.replaceAll("[\\\\/\\:\\*\\?\\\"\\<\\>\\|]", "_");
    }

    private String escapeHtml(String v) {
        if (v == null) {
            return "";
        }
        String s = v;
        s = s.replace("&", "&amp;");
        s = s.replace("<", "&lt;");
        s = s.replace(">", "&gt;");
        s = s.replace("\"", "&quot;");
        s = s.replace("'", "&#39;");
        return s;
    }

    public boolean deleteById(String id) {
        String oid = StringUtils.hasText(id) ? id.trim() : null;
        if (!StringUtils.hasText(oid)) {
            throw new IllegalArgumentException("参数错误");
        }
        ProductionOrder existed = productionOrderService.getById(oid);
        if (existed == null || existed.getDeleteFlag() == null || existed.getDeleteFlag() != 0) {
            throw new NoSuchElementException("生产订单不存在");
        }
        boolean ok = productionOrderService.deleteById(oid);
        if (!ok) {
            throw new IllegalStateException("删除失败");
        }
        return true;
    }

    public int recomputeProgressByStyleNo(String styleNo) {
        return progressOrchestrationService.recomputeProgressByStyleNo(styleNo);
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean updateProductionProgress(String id, Integer progress, String rollbackRemark,
            String rollbackToProcessName) {
        return progressOrchestrationService.updateProductionProgress(id, progress, rollbackRemark,
                rollbackToProcessName);
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean updateMaterialArrivalRate(String id, Integer rate) {
        return progressOrchestrationService.updateMaterialArrivalRate(id, rate);
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean completeProduction(String id, BigDecimal tolerancePercent) {
        return financeOrchestrationService.completeProduction(id, tolerancePercent);
    }

    @Transactional(rollbackFor = Exception.class)
    public ProductionOrder closeOrder(String id, String sourceModule) {
        String src = StringUtils.hasText(sourceModule) ? sourceModule.trim() : null;
        if (!StringUtils.hasText(src)) {
            throw new AccessDeniedException("仅允许在指定模块关单");
        }
        if (!CLOSE_SOURCE_MY_ORDERS.equals(src) && !CLOSE_SOURCE_PRODUCTION_PROGRESS.equals(src)) {
            throw new AccessDeniedException("仅允许在我的订单或生产进度关单");
        }
        return financeOrchestrationService.closeOrder(id);
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean autoCloseOrderIfEligible(String id) {
        return financeOrchestrationService.autoCloseOrderIfEligible(id);
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean ensureFinanceRecordsForOrder(String orderId) {
        return financeOrchestrationService.ensureFinanceRecordsForOrder(orderId);
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean ensureShipmentReconciliationForOrder(String orderId) {
        return financeOrchestrationService.ensureShipmentReconciliationForOrder(orderId);
    }

    @Transactional(rollbackFor = Exception.class)
    public int backfillFinanceRecords() {
        return financeOrchestrationService.backfillFinanceRecords();
    }

    public ProductionOrderFlowOrchestrationService.OrderFlowResponse getOrderFlow(String orderId) {
        return flowOrchestrationService.getOrderFlow(orderId);
    }

    @Transactional(rollbackFor = Exception.class)
    public ProductionOrder lockProgressWorkflow(String id, String workflowJson) {
        if (!UserContext.isSupervisorOrAbove()) {
            throw new AccessDeniedException("无权限操作进度节点");
        }

        String oid = StringUtils.hasText(id) ? id.trim() : null;
        if (!StringUtils.hasText(oid)) {
            throw new IllegalArgumentException("参数错误");
        }

        ProductionOrder existed = productionOrderService.getById(oid);
        if (existed == null || existed.getDeleteFlag() == null || existed.getDeleteFlag() != 0) {
            throw new NoSuchElementException("生产订单不存在");
        }

        String st = existed.getStatus() == null ? "" : existed.getStatus().trim();
        if ("completed".equalsIgnoreCase(st)) {
            throw new IllegalStateException("订单已完成，无法操作");
        }

        Integer locked = existed.getProgressWorkflowLocked();
        if (locked != null && locked == 1) {
            throw new IllegalStateException("流程已锁定");
        }

        String text = StringUtils.hasText(workflowJson) ? workflowJson.trim() : null;
        if (!StringUtils.hasText(text)) {
            throw new IllegalArgumentException("workflowJson不能为空");
        }

        String normalized = normalizeProgressWorkflowJson(text);
        if (!StringUtils.hasText(normalized)) {
            throw new IllegalStateException("流程内容为空或不合法");
        }

        LocalDateTime now = LocalDateTime.now();
        UserContext ctx = UserContext.get();
        String uid = ctx == null ? null : ctx.getUserId();
        String uname = ctx == null ? null : ctx.getUsername();

        String uidTrim = uid == null ? null : uid.trim();
        uidTrim = StringUtils.hasText(uidTrim) ? uidTrim : null;
        String unameTrim = uname == null ? null : uname.trim();
        unameTrim = StringUtils.hasText(unameTrim) ? unameTrim : null;

        boolean ok = productionOrderService.lambdaUpdate()
                .eq(ProductionOrder::getId, oid)
                .set(ProductionOrder::getProgressWorkflowJson, normalized)
                .set(ProductionOrder::getProgressWorkflowLocked, 1)
                .set(ProductionOrder::getProgressWorkflowLockedAt, now)
                .set(ProductionOrder::getProgressWorkflowLockedBy, uidTrim)
                .set(ProductionOrder::getProgressWorkflowLockedByName, unameTrim)
                .set(ProductionOrder::getUpdateTime, now)
                .update();
        if (!ok) {
            throw new IllegalStateException("保存失败");
        }

        return getDetailById(oid);
    }

    @Transactional(rollbackFor = Exception.class)
    public ProductionOrder rollbackProgressWorkflow(String id) {
        if (!UserContext.isTopAdmin()) {
            throw new AccessDeniedException("无权限操作");
        }

        String oid = StringUtils.hasText(id) ? id.trim() : null;
        if (!StringUtils.hasText(oid)) {
            throw new IllegalArgumentException("参数错误");
        }

        ProductionOrder existed = productionOrderService.getById(oid);
        if (existed == null || existed.getDeleteFlag() == null || existed.getDeleteFlag() != 0) {
            throw new NoSuchElementException("生产订单不存在");
        }

        LocalDateTime now = LocalDateTime.now();
        boolean ok = productionOrderService.lambdaUpdate()
                .eq(ProductionOrder::getId, oid)
                .set(ProductionOrder::getProgressWorkflowLocked, 0)
                .set(ProductionOrder::getProgressWorkflowLockedAt, null)
                .set(ProductionOrder::getProgressWorkflowLockedBy, null)
                .set(ProductionOrder::getProgressWorkflowLockedByName, null)
                .set(ProductionOrder::getUpdateTime, now)
                .update();
        if (!ok) {
            throw new IllegalStateException("退回失败");
        }

        return getDetailById(oid);
    }

    private String normalizeProgressWorkflowJson(String raw) {
        String text = StringUtils.hasText(raw) ? raw.trim() : null;
        if (!StringUtils.hasText(text)) {
            return null;
        }

        try {
            com.fasterxml.jackson.databind.JsonNode root = objectMapper.readTree(text);
            com.fasterxml.jackson.databind.JsonNode arr = root == null ? null : root.get("nodes");
            if (arr == null || !arr.isArray()) {
                return null;
            }

            List<Map<String, Object>> outNodes = new ArrayList<>();
            LinkedHashSet<String> seen = new LinkedHashSet<>();
            for (com.fasterxml.jackson.databind.JsonNode n : arr) {
                if (n == null) {
                    continue;
                }
                String name = n.hasNonNull("name") ? n.get("name").asText("") : "";
                name = StringUtils.hasText(name) ? name.trim() : "";
                if (!StringUtils.hasText(name)) {
                    continue;
                }
                String id = n.hasNonNull("id") ? n.get("id").asText("") : "";
                id = StringUtils.hasText(id) ? id.trim() : name;

                String idLower = id.trim().toLowerCase();
                if ("shipment".equals(idLower) || "出货".equals(name) || "发货".equals(name) || "发运".equals(name)) {
                    continue;
                }

                if (!seen.add(name)) {
                    continue;
                }

                java.math.BigDecimal unitPrice = java.math.BigDecimal.ZERO;
                if (n.hasNonNull("unitPrice")) {
                    com.fasterxml.jackson.databind.JsonNode v = n.get("unitPrice");
                    if (v != null) {
                        if (v.isNumber()) {
                            unitPrice = v.decimalValue();
                        } else {
                            try {
                                unitPrice = new java.math.BigDecimal(v.asText("0").trim());
                            } catch (Exception ignore) {
                                unitPrice = java.math.BigDecimal.ZERO;
                            }
                        }
                    }
                }
                if (unitPrice == null || unitPrice.compareTo(java.math.BigDecimal.ZERO) < 0) {
                    unitPrice = java.math.BigDecimal.ZERO;
                }

                outNodes.add(Map.of(
                        "id", id,
                        "name", name,
                        "unitPrice", unitPrice));
            }

            if (outNodes.isEmpty()) {
                return null;
            }

            return objectMapper.writeValueAsString(Map.of("nodes", outNodes));
        } catch (Exception e) {
            return null;
        }
    }
}
