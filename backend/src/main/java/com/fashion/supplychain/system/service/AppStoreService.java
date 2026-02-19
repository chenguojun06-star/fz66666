package com.fashion.supplychain.system.service;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.system.entity.AppStore;
import com.fashion.supplychain.system.mapper.AppStoreMapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
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
                List<String> featureList = objectMapper.readValue(
                    app.getFeatures(),
                    new TypeReference<List<String>>() {}
                );
                app.setFeatureList(featureList);
            }

            // 解析screenshots JSON
            if (app.getScreenshots() != null && !app.getScreenshots().isEmpty()) {
                List<String> screenshotList = objectMapper.readValue(
                    app.getScreenshots(),
                    new TypeReference<List<String>>() {}
                );
                app.setScreenshotList(screenshotList);
            }
        } catch (Exception e) {
            log.error("解析应用JSON字段失败", e);
            app.setFeatureList(new ArrayList<>());
            app.setScreenshotList(new ArrayList<>());
        }
    }
}
