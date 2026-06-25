package com.fashion.supplychain.intelligence.service;

import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.Map;

/**
 * 外部数据服务
 *
 * <p>P2升级：接入外部数据（面料价格、汇率、天气等）用于供应链风险监控</p>
 *
 * @author xiaoyun
 * @since 2026-06-24
 */
@Slf4j
@Service
public class ExternalDataService {

    // ══════════════════════════════════════════════════════════════════════════
    // 面料价格指数
    // 数据来源：广州国际轻纺城 / 中国面料价格指数
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * 获取面料价格指数
     *
     * @param fabricType 面料类型（棉布/丝绸/化纤/羊毛等）
     * @return 价格指数（基准100）
     */
    public FabricPriceData getFabricPrice(String fabricType) {
        FabricPriceData data = new FabricPriceData();
        data.setFabricType(fabricType);
        data.setPriceIndex(100.0 + Math.random() * 20 - 10);  // 模拟数据：90-110波动
        data.setTrend(Math.random() > 0.5 ? "UP" : "DOWN");
        data.setUpdateDate(LocalDate.now());

        // ══════════════════════════════════════════════════════════════════════════
        // 【待接入】真实数据源
        // 方案1：中国布料价格指数 API
        //   GET https://api.fabric-price.cn/v1/index?type={fabricType}
        // 方案2：阿里巴巴布料批发价
        //   GET https://price.1688.com/api/fabric?keywords={fabricType}
        // 方案3：自建数据采集（爬虫）
        // ══════════════════════════════════════════════════════════════════════════

        log.debug("[ExternalData] 获取面料价格，type={}, index={}", fabricType, data.getPriceIndex());
        return data;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 汇率数据
    // 数据来源：阿里云汇率 API / 腾讯汇率 API
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * 获取汇率数据
     *
     * @param currencyPair 货币对（USD/CNY, EUR/CNY等）
     * @return 汇率
     */
    public ExchangeRateData getExchangeRate(String currencyPair) {
        ExchangeRateData data = new ExchangeRateData();
        data.setCurrencyPair(currencyPair);

        // 模拟数据
        double baseRate = currencyPair.contains("USD") ? 7.2 : currencyPair.contains("EUR") ? 7.8 : 1.0;
        data.setRate(baseRate + Math.random() * 0.1 - 0.05);
        data.setTrend(Math.random() > 0.5 ? "UP" : "DOWN");
        data.setUpdateDate(LocalDate.now());

        // ══════════════════════════════════════════════════════════════════════════
        // 【待接入】真实数据源
        // 方案1：阿里云汇率 API
        //   GET https://finance-api.alipay.com/rate?from={fromCurrency}&to={toCurrency}
        // 方案2：腾讯汇率 API
        //   GET https://api.currencylayer.com/latest?access_key={key}&source={source}&currencies={target}
        // ══════════════════════════════════════════════════════════════════════════

        log.debug("[ExternalData] 获取汇率，pair={}, rate={}", currencyPair, data.getRate());
        return data;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 天气数据
    // 数据来源：高德天气 API / 和风天气 API
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * 获取指定地区的天气预报
     *
     * @param location 地区（城市名或经纬度）
     * @param days 预报天数
     * @return 天气预报数据
     */
    public WeatherData getWeatherForecast(String location, int days) {
        WeatherData data = new WeatherData();
        data.setLocation(location);
        data.setDays(days);

        // 模拟天气数据
        String[] weathers = {"晴", "多云", "阴", "小雨", "中雨", "雷阵雨"};
        String weather = weathers[(int) (Math.random() * weathers.length)];
        int temp = 25 + (int) (Math.random() * 10);
        data.setWeather(weather);
        data.setTemperature(temp);
        data.setRainfallRisk(Math.random() > 0.7 ? "HIGH" : Math.random() > 0.4 ? "MEDIUM" : "LOW");
        data.setUpdateDate(LocalDate.now());

        // ══════════════════════════════════════════════════════════════════════════
        // 【待接入】真实数据源
        // 方案1：高德天气 API
        //   GET https://restapi.amap.com/v3/weather/weatherInfo?city={city}&key={key}
        // 方案2：和风天气 API
        //   GET https://devapi.qweather.com/v7/weather/forecast?location={location}&key={key}
        // ══════════════════════════════════════════════════════════════════════════

        log.debug("[ExternalData] 获取天气预报，location={}, weather={}, temp={}°C", location, weather, temp);
        return data;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 供应链风险数据
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * 评估供应链风险等级
     *
     * @param supplierLocation 供应商所在地
     * @param materialType 物料类型
     * @return 风险评估
     */
    public SupplyChainRiskAssessment assessSupplyRisk(String supplierLocation, String materialType) {
        SupplyChainRiskAssessment assessment = new SupplyChainRiskAssessment();
        assessment.setSupplierLocation(supplierLocation);
        assessment.setMaterialType(materialType);

        // 综合评估（模拟）
        double weatherRisk = Math.random() * 30;  // 天气风险
        double politicalRisk = Math.random() * 20;  // 政策风险
        double logisticsRisk = Math.random() * 25;  // 物流风险
        double priceRisk = Math.random() * 25;  // 价格波动风险

        double totalRisk = weatherRisk + politicalRisk + logisticsRisk + priceRisk;
        assessment.setTotalRiskScore(totalRisk);

        if (totalRisk > 60) {
            assessment.setRiskLevel("HIGH");
        } else if (totalRisk > 35) {
            assessment.setRiskLevel("MEDIUM");
        } else {
            assessment.setRiskLevel("LOW");
        }

        assessment.setWeatherRisk(weatherRisk);
        assessment.setPoliticalRisk(politicalRisk);
        assessment.setLogisticsRisk(logisticsRisk);
        assessment.setPriceRisk(priceRisk);

        assessment.setRecommendations(generateRecommendations(assessment));
        assessment.setUpdateDate(LocalDate.now());

        // ══════════════════════════════════════════════════════════════════════════
        // 【待接入】真实风险数据
        // 方案1：舆情监控（百度舆情 API）
        //   GET https://sentiment.baidu.com/api/v3/news?keyword={supplier}&key={key}
        // 方案2：海关政策（海关总署 API）
        //   GET https://api.china-customs.gov.cn/policy?type={materialType}
        // 方案3：物流追踪（菜鸟物流 API）
        //   GET https://api.cainiao.com/logistics?supplier={supplier}
        // ══════════════════════════════════════════════════════════════════════════

        log.info("[ExternalData] 供应链风险评估，location={}, material={}, riskLevel={}, score={}",
                supplierLocation, materialType, assessment.getRiskLevel(), totalRisk);
        return assessment;
    }

    private String generateRecommendations(SupplyChainRiskAssessment assessment) {
        StringBuilder sb = new StringBuilder();
        if (assessment.getWeatherRisk() > 20) {
            sb.append("⚠️ 天气风险较高，建议提前备货。");
        }
        if (assessment.getPoliticalRisk() > 15) {
            sb.append("⚠️ 政策风险，建议关注海关动态。");
        }
        if (assessment.getLogisticsRisk() > 20) {
            sb.append("⚠️ 物流风险，建议更换物流商或提前发货。");
        }
        if (assessment.getPriceRisk() > 20) {
            sb.append("⚠️ 价格波动，建议锁定采购价。");
        }
        if (sb.length() == 0) {
            sb.append("✅ 当前供应链风险可控。");
        }
        return sb.toString();
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 数据类
    // ══════════════════════════════════════════════════════════════════════════

    @Data
    public static class FabricPriceData {
        private String fabricType;
        private double priceIndex;  // 基准100
        private String trend;  // UP/DOWN
        private LocalDate updateDate;
    }

    @Data
    public static class ExchangeRateData {
        private String currencyPair;
        private double rate;
        private String trend;  // UP/DOWN
        private LocalDate updateDate;
    }

    @Data
    public static class WeatherData {
        private String location;
        private int days;
        private String weather;
        private int temperature;
        private String rainfallRisk;  // HIGH/MEDIUM/LOW
        private LocalDate updateDate;
    }

    @Data
    public static class SupplyChainRiskAssessment {
        private String supplierLocation;
        private String materialType;
        private String riskLevel;  // HIGH/MEDIUM/LOW
        private double totalRiskScore;
        private double weatherRisk;
        private double politicalRisk;
        private double logisticsRisk;
        private double priceRisk;
        private String recommendations;
        private LocalDate updateDate;
    }
}
