package com.fashion.supplychain.production.service.helper;

import com.fashion.supplychain.common.constant.MaterialConstants;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.style.entity.StyleAttachment;
import org.springframework.util.StringUtils;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import lombok.extern.slf4j.Slf4j;

@Slf4j
public class MaterialPurchaseHelper {

    private static final Pattern RECEIVER_REMARK_TIME = Pattern
            .compile("(\\d{4}-\\d{2}-\\d{2}\\s+\\d{2}:\\d{2}(?::\\d{2})?)");

    public static String resolveMaterialId(MaterialPurchase purchase) {
        if (purchase == null) {
            return null;
        }
        String existing = purchase.getMaterialId();
        if (StringUtils.hasText(existing)) {
            return existing.trim();
        }

        String styleId = StringUtils.hasText(purchase.getStyleId()) ? purchase.getStyleId().trim() : "";
        String type = StringUtils.hasText(purchase.getMaterialType()) ? purchase.getMaterialType().trim().toLowerCase()
                : "";
        String code = StringUtils.hasText(purchase.getMaterialCode()) ? purchase.getMaterialCode().trim() : "";
        String name = StringUtils.hasText(purchase.getMaterialName()) ? purchase.getMaterialName().trim() : "";
        String spec = StringUtils.hasText(purchase.getSpecifications()) ? purchase.getSpecifications().trim() : "";
        String unit = StringUtils.hasText(purchase.getUnit()) ? purchase.getUnit().trim() : "";

        String key = String.join("|", styleId, type, code, name, spec, unit);
        if (!StringUtils.hasText(key.replace("|", "").trim())) {
            return null;
        }
        return UUID.nameUUIDFromBytes(key.getBytes(StandardCharsets.UTF_8)).toString();
    }

    public static String normalizeMatchKey(String v) {
        return v == null ? "" : v.trim().replaceAll("\\s+", " ").toLowerCase();
    }

    public static List<String> splitOptions(String value) {
        if (!StringUtils.hasText(value)) {
            return List.of();
        }
        String[] parts = value.split("[,/，、\\s]+");
        List<String> out = new ArrayList<>();
        for (String p : parts) {
            String n = normalizeMatchKey(p);
            if (StringUtils.hasText(n)) {
                out.add(n);
            }
        }
        return out;
    }

    public static String normalizeMaterialType(String raw) {
        String type = raw == null ? "" : raw.trim();
        if (!StringUtils.hasText(type)) {
            return MaterialConstants.TYPE_FABRIC;
        }

        if (MaterialConstants.TYPE_FABRIC_CN.equals(type))
            return MaterialConstants.TYPE_FABRIC;
        if (MaterialConstants.TYPE_LINING_CN.equals(type))
            return MaterialConstants.TYPE_LINING;
        if (MaterialConstants.TYPE_ACCESSORY_CN.equals(type))
            return MaterialConstants.TYPE_ACCESSORY;

        if (type.startsWith(MaterialConstants.TYPE_FABRIC_CN) && type.length() > 2) {
            return MaterialConstants.TYPE_FABRIC + type.substring(2).trim();
        }
        if (type.startsWith(MaterialConstants.TYPE_LINING_CN) && type.length() > 2) {
            return MaterialConstants.TYPE_LINING + type.substring(2).trim();
        }
        if (type.startsWith(MaterialConstants.TYPE_ACCESSORY_CN) && type.length() > 2) {
            return MaterialConstants.TYPE_ACCESSORY + type.substring(2).trim();
        }

        return type;
    }

    public static Set<String> intersectOrNull(Set<String> source, Set<String> allowed) {
        if (source == null) {
            return null;
        }
        if (allowed == null || allowed.isEmpty()) {
            return null;
        }
        Set<String> next = new HashSet<>();
        for (String v : source) {
            if (allowed.contains(v)) {
                next.add(v);
            }
        }
        return next.isEmpty() ? null : next;
    }

    public static boolean repairReceiverFromRemark(MaterialPurchase record) {
        if (record == null) {
            return false;
        }
        boolean needName = !StringUtils.hasText(record.getReceiverName());
        boolean needTime = record.getReceivedTime() == null;
        if (!needName && !needTime) {
            return false;
        }

        String remark = record.getRemark();
        if (!StringUtils.hasText(remark)) {
            return false;
        }

        String[] parts = remark.split("[；;]");
        for (String p : parts) {
            if (!StringUtils.hasText(p)) {
                continue;
            }
            String t = p.trim();
            if (!(t.startsWith("领取人") || t.startsWith("收货人") || t.startsWith("领料人"))) {
                continue;
            }

            int idx = t.indexOf('：');
            if (idx < 0) {
                idx = t.indexOf(':');
            }
            if (idx < 0 || idx >= t.length() - 1) {
                continue;
            }
            String payload = t.substring(idx + 1).trim();
            if (!StringUtils.hasText(payload)) {
                continue;
            }

            Matcher m = RECEIVER_REMARK_TIME.matcher(payload);
            String name = null;
            String timeRaw = null;
            if (m.find()) {
                timeRaw = m.group(1);
                String before = payload.substring(0, m.start()).trim();
                if (StringUtils.hasText(before)) {
                    name = before;
                }
            } else {
                String[] tokens = payload.split("\\s+");
                if (tokens.length > 0 && StringUtils.hasText(tokens[0])) {
                    name = tokens[0].trim();
                }
            }

            LocalDateTime time = tryParseRemarkTime(timeRaw);
            boolean changed = false;
            String nameTrimmed = name == null ? null : name.trim();
            if (needName && StringUtils.hasText(nameTrimmed)) {
                record.setReceiverName(nameTrimmed);
                changed = true;
                needName = false;
            }
            if (needTime && time != null) {
                record.setReceivedTime(time);
                changed = true;
                needTime = false;
            }
            if (changed) {
                return true;
            }
        }
        return false;
    }

    public static LocalDateTime tryParseRemarkTime(String raw) {
        if (!StringUtils.hasText(raw)) {
            return null;
        }
        String s = raw.trim();
        try {
            if (s.length() >= MaterialConstants.DATE_LENGTH_FULL) {
                return LocalDateTime.parse(s.substring(0, MaterialConstants.DATE_LENGTH_FULL),
                        DateTimeFormatter.ofPattern(MaterialConstants.DATE_FORMAT_FULL));
            }
        } catch (Exception e) {
            log.warn("Failed to parse remark time with seconds: raw={}", raw, e);
        }
        try {
            if (s.length() >= MaterialConstants.DATE_LENGTH_MINUTE) {
                return LocalDateTime.parse(s.substring(0, MaterialConstants.DATE_LENGTH_MINUTE),
                        DateTimeFormatter.ofPattern(MaterialConstants.DATE_FORMAT_MINUTE));
            }
        } catch (Exception e) {
            log.warn("Failed to parse remark time with minutes: raw={}", raw, e);
        }
        return null;
    }

    public static int calcArrivedCompleteThreshold(int purchaseQty) {
        if (purchaseQty <= 0) {
            return 0;
        }
        return purchaseQty;
    }

    public static String resolveStatusByArrived(String previousStatus, int arrivedQty, int purchaseQty) {
        String prev = previousStatus == null ? "" : previousStatus.trim();
        if (arrivedQty <= 0) {
            return MaterialConstants.STATUS_RECEIVED.equals(prev) ? MaterialConstants.STATUS_RECEIVED
                    : MaterialConstants.STATUS_PENDING;
        }
        int threshold = calcArrivedCompleteThreshold(purchaseQty);
        if (threshold <= 0) {
            return MaterialConstants.STATUS_COMPLETED;
        }
        if (arrivedQty < threshold) {
            return MaterialConstants.STATUS_PARTIAL;
        }
        return MaterialConstants.STATUS_COMPLETED;
    }

    public static boolean looksLikeImage(StyleAttachment a) {
        String t = a.getFileType() == null ? "" : a.getFileType().toLowerCase();
        if (t.contains("image")) {
            return true;
        }
        String name = a.getFileName() == null ? "" : a.getFileName().toLowerCase();
        String url = a.getFileUrl() == null ? "" : a.getFileUrl().toLowerCase();
        return name.endsWith(".jpg")
                || name.endsWith(".jpeg")
                || name.endsWith(".png")
                || name.endsWith(".gif")
                || name.endsWith(".webp")
                || name.endsWith(".bmp")
                || url.contains(".jpg")
                || url.contains(".jpeg")
                || url.contains(".png")
                || url.contains(".gif")
                || url.contains(".webp")
                || url.contains(".bmp");
    }
}
