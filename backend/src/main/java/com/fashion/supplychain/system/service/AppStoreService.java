package com.fashion.supplychain.system.service;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.system.entity.AppStore;
import com.fashion.supplychain.system.mapper.AppStoreMapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * 应用商店Service
 */
@Slf4j
@Service
public class AppStoreService extends ServiceImpl<AppStoreMapper, AppStore> {

    @Autowired
    private ObjectMapper objectMapper;

    /**
     * 查询应用列表并解析JSON字段
     */
    public List<AppStore> listWithJson() {
        List<AppStore> appList = list();
        for (AppStore app : appList) {
            fixMojibakeFields(app);
            parseJsonFields(app);
        }
        return appList;
    }

    /**
     * 根据ID查询并解析JSON字段
     */
    public AppStore getByIdWithJson(Long id) {
        AppStore app = getById(id);
        if (app != null) {
            fixMojibakeFields(app);
            parseJsonFields(app);
        }
        return app;
    }

    /**
     * 解析JSON字段
     */
    public void parseJsonFields(AppStore app) {
        try {
            // 解析features JSON
            if (app.getFeatures() != null && !app.getFeatures().isEmpty()) {
                String featuresStr = app.getFeatures().trim();
                List<String> featureList;
                if (featuresStr.startsWith("[")) {
                    featureList = objectMapper.readValue(featuresStr, new TypeReference<List<String>>() {});
                } else {
                    // 兜底：逗号分隔文本格式（历史脏数据）
                    featureList = Arrays.asList(featuresStr.split(","));
                }
                app.setFeatureList(featureList);
            }

            // 解析screenshots JSON
            if (app.getScreenshots() != null && !app.getScreenshots().isEmpty()) {
                String screenshotsStr = app.getScreenshots().trim();
                List<String> screenshotList;
                if (screenshotsStr.startsWith("[")) {
                    screenshotList = objectMapper.readValue(screenshotsStr, new TypeReference<List<String>>() {});
                } else {
                    screenshotList = Arrays.asList(screenshotsStr.split(","));
                }
                app.setScreenshotList(screenshotList);
            }
        } catch (Exception e) {
            log.warn("解析应用JSON字段失败，app_code={}: {}", app.getAppCode(), e.getMessage());
            app.setFeatureList(new ArrayList<>());
            app.setScreenshotList(new ArrayList<>());
        }
    }

    public void fixMojibakeFields(AppStore app) {
        app.setAppName(fixMojibake(app.getAppName()));
        app.setAppDesc(fixMojibake(app.getAppDesc()));
        app.setCategory(fixMojibake(app.getCategory()));
        app.setFeatures(fixMojibake(app.getFeatures()));
    }

    private String fixMojibake(String text) {
        if (text == null || text.isEmpty()) {
            return text;
        }
        if (!looksMojibake(text)) {
            return text;
        }
        try {
            return new String(text.getBytes(StandardCharsets.ISO_8859_1), StandardCharsets.UTF_8);
        } catch (Exception e) {
            return text;
        }
    }

    private boolean looksMojibake(String text) {
        boolean hasCjk = false;
        boolean hasLatin1Ext = false;
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            if (c >= '\u4e00' && c <= '\u9fff') {
                hasCjk = true;
                break;
            }
            if (c >= '\u00c0' && c <= '\u00ff') {
                hasLatin1Ext = true;
            }
        }
        return !hasCjk && hasLatin1Ext;
    }
}
