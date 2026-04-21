package com.fashion.supplychain.intelligence.helper;

import java.util.*;

public final class StepWizardBuilder {

    private StepWizardBuilder() {}

    public static Map<String, Object> build(String wizardType, String title, String desc, String icon, String submitLabel, String submitCommand, List<Map<String, Object>> steps) {
        Map<String, Object> wizard = new LinkedHashMap<>();
        wizard.put("wizardType", wizardType);
        wizard.put("title", title);
        wizard.put("desc", desc);
        wizard.put("icon", icon);
        wizard.put("submitLabel", submitLabel);
        wizard.put("submitCommand", submitCommand);
        wizard.put("steps", steps);
        return wizard;
    }

    @SafeVarargs
    public static List<Map<String, Object>> steps(Map<String, Object>... steps) {
        return Arrays.asList(steps);
    }

    @SafeVarargs
    public static Map<String, Object> step(String stepKey, String title, String desc, Map<String, Object>... fields) {
        Map<String, Object> s = new LinkedHashMap<>();
        s.put("stepKey", stepKey);
        s.put("title", title);
        s.put("desc", desc);
        s.put("fields", Arrays.asList(fields));
        return s;
    }

    @SafeVarargs
    public static Map<String, Object> selectField(String key, String label, boolean required, Map<String, String>... options) {
        Map<String, Object> f = new LinkedHashMap<>();
        f.put("key", key);
        f.put("label", label);
        f.put("inputType", "select");
        f.put("required", required);
        List<Map<String, String>> opts = new ArrayList<>();
        for (Map<String, String> o : options) opts.add(o);
        f.put("options", opts);
        return f;
    }

    @SafeVarargs
    public static Map<String, Object> multiSelectField(String key, String label, boolean required, Map<String, String>... options) {
        Map<String, Object> f = new LinkedHashMap<>();
        f.put("key", key);
        f.put("label", label);
        f.put("inputType", "multi_select");
        f.put("required", required);
        List<Map<String, String>> opts = new ArrayList<>();
        for (Map<String, String> o : options) opts.add(o);
        f.put("options", opts);
        return f;
    }

    public static Map<String, Object> textField(String key, String label, boolean required, String placeholder) {
        Map<String, Object> f = new LinkedHashMap<>();
        f.put("key", key);
        f.put("label", label);
        f.put("inputType", "text");
        f.put("required", required);
        f.put("placeholder", placeholder);
        return f;
    }

    public static Map<String, Object> numberField(String key, String label, boolean required, String placeholder, Integer min) {
        Map<String, Object> f = new LinkedHashMap<>();
        f.put("key", key);
        f.put("label", label);
        f.put("inputType", "number");
        f.put("required", required);
        f.put("placeholder", placeholder);
        if (min != null) f.put("min", min);
        return f;
    }

    public static Map<String, Object> dateField(String key, String label, boolean required) {
        Map<String, Object> f = new LinkedHashMap<>();
        f.put("key", key);
        f.put("label", label);
        f.put("inputType", "date");
        f.put("required", required);
        return f;
    }

    public static Map<String, String> opt(String label, String value) {
        return Map.of("label", label, "value", value);
    }

    public static Map<String, String> opt(String label, String value, String desc, String icon) {
        Map<String, String> m = new LinkedHashMap<>();
        m.put("label", label);
        m.put("value", value);
        m.put("desc", desc);
        m.put("icon", icon);
        return m;
    }

    public static Map<String, Object> wrapResult(String error, boolean needMoreInfo, List<String> missingFields, String question, Map<String, Object> stepWizard) throws Exception {
        Map<String, Object> result = new HashMap<>();
        result.put("error", error);
        result.put("needMoreInfo", needMoreInfo);
        result.put("missingFields", missingFields);
        result.put("question", question);
        result.put("stepWizard", stepWizard);
        return result;
    }
}
