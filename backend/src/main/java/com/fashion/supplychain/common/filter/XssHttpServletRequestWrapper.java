package com.fashion.supplychain.common.filter;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import org.springframework.web.util.HtmlUtils;

import java.util.HashMap;
import java.util.Map;

public class XssHttpServletRequestWrapper extends HttpServletRequestWrapper {

    public XssHttpServletRequestWrapper(HttpServletRequest request) {
        super(request);
    }

    @Override
    public String getParameter(String name) {
        String value = super.getParameter(name);
        return sanitize(value);
    }

    @Override
    public String[] getParameterValues(String name) {
        String[] values = super.getParameterValues(name);
        if (values == null) return null;
        String[] sanitized = new String[values.length];
        for (int i = 0; i < values.length; i++) {
            sanitized[i] = sanitize(values[i]);
        }
        return sanitized;
    }

    @Override
    public Map<String, String[]> getParameterMap() {
        Map<String, String[]> original = super.getParameterMap();
        Map<String, String[]> sanitized = new HashMap<>();
        for (Map.Entry<String, String[]> entry : original.entrySet()) {
            String[] values = entry.getValue();
            String[] clean = new String[values.length];
            for (int i = 0; i < values.length; i++) {
                clean[i] = sanitize(values[i]);
            }
            sanitized.put(entry.getKey(), clean);
        }
        return sanitized;
    }

    @Override
    public String getHeader(String name) {
        String value = super.getHeader(name);
        if (name != null && (name.equalsIgnoreCase("referer")
                || name.equalsIgnoreCase("origin")
                || name.equalsIgnoreCase("x-request-id"))) {
            return value;
        }
        return sanitize(value);
    }

    static String sanitize(String value) {
        if (value == null || value.isEmpty()) return value;
        if (!containsXssPattern(value)) return value;
        return HtmlUtils.htmlEscape(value, "UTF-8");
    }

    static boolean containsXssPattern(String value) {
        String lower = value.toLowerCase();
        return lower.contains("<script") || lower.contains("javascript:")
                || lower.contains("onerror=") || lower.contains("onload=")
                || lower.contains("onclick=") || lower.contains("onmouseover=")
                || lower.contains("<iframe") || lower.contains("<object")
                || lower.contains("<embed") || lower.contains("expression(")
                || lower.contains("vbscript:") || lower.contains("data:text/html");
    }
}
