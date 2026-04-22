package com.fashion.supplychain.warehouse.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.ProductWarehousing;
import com.fashion.supplychain.production.entity.MaterialStock;
import com.fashion.supplychain.production.entity.MaterialDatabase;
import com.fashion.supplychain.production.mapper.MaterialDatabaseMapper;
import com.fashion.supplychain.production.mapper.MaterialPurchaseMapper;
import com.fashion.supplychain.production.mapper.ProductWarehousingMapper;
import com.fashion.supplychain.production.mapper.MaterialStockMapper;
import com.fashion.supplychain.production.mapper.ProductOutstockMapper;
import com.fashion.supplychain.production.entity.ProductOutstock;
import com.fashion.supplychain.production.entity.MaterialOutboundLog;
import com.fashion.supplychain.production.mapper.MaterialOutboundLogMapper;
import com.fashion.supplychain.warehouse.dto.*;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import com.fashion.supplychain.common.UserContext;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 仓库数据看板编排器
 */
@Slf4j
@Service
public class WarehouseDashboardOrchestrator {

    @Autowired
    private MaterialDatabaseMapper materialDatabaseMapper;

    @Autowired
    private MaterialPurchaseMapper materialPurchaseMapper;

    @Autowired
    private ProductWarehousingMapper productWarehousingMapper;

    @Autowired
    private MaterialStockMapper materialStockMapper;

    @Autowired
    private ProductOutstockMapper productOutstockMapper;

    @Autowired
    private MaterialOutboundLogMapper materialOutboundLogMapper;

    /**
     * 获取仓库统计数据
     */
    public WarehouseStatsDTO getWarehouseStats() {
        Long tid = UserContext.tenantId();
        if (tid == null) log.warn("[租户隔离] 仓库仪表板查询租户上下文为空");
        WarehouseStatsDTO stats = new WarehouseStatsDTO();

        Long materialCount = materialDatabaseMapper.selectCount(
            new QueryWrapper<MaterialDatabase>().eq("tenant_id", tid));
        stats.setMaterialCount(materialCount.intValue());

        // 2. 成品总数（从质检入库统计）
        Integer finishedCount = productWarehousingMapper.selectTotalQuantity(tid);
        stats.setFinishedCount(finishedCount != null ? finishedCount : 0);

        // 3. 低库存预警数（从面辅料库存表查询：库存量 < 安全库存）
        try {
            Long lowStockCount = materialStockMapper.selectCount(
                new QueryWrapper<MaterialStock>()
                    .apply("(delete_flag IS NULL OR delete_flag = 0)")
                    .apply("quantity < COALESCE(safety_stock, 100)")
                    .eq("tenant_id", tid)
            );
            stats.setLowStockCount(lowStockCount != null ? lowStockCount.intValue() : 0);
        } catch (Exception e) {
            log.warn("查询低库存预警数失败: {}", e.getMessage());
            stats.setLowStockCount(0);
        }

        // 4. 库存总值（从面辅料库存表汇总）
        try {
            List<Map<String, Object>> totalValueRows = materialStockMapper.selectMaps(
                new QueryWrapper<MaterialStock>()
                    .select("COALESCE(SUM(total_value), 0) as sumValue")
                    .apply("(delete_flag IS NULL OR delete_flag = 0)")
                    .eq("tenant_id", tid)
            );
            if (totalValueRows != null && !totalValueRows.isEmpty()) {
                Object sv = totalValueRows.get(0).get("sumValue");
                stats.setTotalValue(sv != null ? new BigDecimal(sv.toString()) : BigDecimal.ZERO);
            } else {
                stats.setTotalValue(BigDecimal.ZERO);
            }
        } catch (Exception e) {
            log.warn("查询库存总值失败: {}", e.getMessage());
            stats.setTotalValue(BigDecimal.ZERO);
        }

        // 5. 今日入库次数（物料采购到货 + 质检入库）
        LocalDate today = LocalDate.now();
        Integer materialInbound = materialPurchaseMapper.selectTodayArrivalCount(today, tid);
        Integer productInbound = productWarehousingMapper.selectTodayInboundCount(today, tid);
        stats.setTodayInbound((materialInbound != null ? materialInbound : 0) +
                             (productInbound != null ? productInbound : 0));

        // 6. 今日出库次数（成品出库 + 面辅料出库）
        int todayOutboundTotal = 0;
        try {
            Long outstockCount = productOutstockMapper.selectCount(
                new QueryWrapper<ProductOutstock>()
                    .apply("DATE(create_time) = {0}", today)
                    .apply("(delete_flag IS NULL OR delete_flag = 0)")
                    .eq("tenant_id", tid)
            );
            todayOutboundTotal += (outstockCount != null ? outstockCount.intValue() : 0);
        } catch (Exception e) {
            log.warn("查询今日成品出库次数失败: {}", e.getMessage());
        }
        try {
            Integer materialOutboundCount = materialOutboundLogMapper.selectTodayOutboundCount(today, tid);
            todayOutboundTotal += (materialOutboundCount != null ? materialOutboundCount : 0);
        } catch (Exception e) {
            log.warn("查询今日面辅料出库次数失败: {}", e.getMessage());
        }
        stats.setTodayOutbound(todayOutboundTotal);

        return stats;
    }

    /**
     * 获取低库存预警列表（从面辅料库存表查询真实数据）
     */
    public List<LowStockItemDTO> getLowStockItems() {
        Long tid = UserContext.tenantId();
        List<LowStockItemDTO> result = new ArrayList<>();

        try {
            List<MaterialStock> lowStocks = materialStockMapper.selectList(
                new QueryWrapper<MaterialStock>()
                    .apply("(delete_flag IS NULL OR delete_flag = 0)")
                    .apply("quantity < COALESCE(safety_stock, 100)")
                    .eq("tenant_id", tid)
                    .orderByAsc("quantity")
                    .last("LIMIT 20")
            );
            if (lowStocks != null) {
                for (MaterialStock stock : lowStocks) {
                    LowStockItemDTO dto = new LowStockItemDTO();
                    dto.setId(stock.getId());
                    dto.setMaterialCode(stock.getMaterialCode());
                    dto.setMaterialName(stock.getMaterialName());
                    dto.setAvailableQty(stock.getQuantity() != null ? stock.getQuantity() : 0);
                    dto.setSafetyStock(stock.getSafetyStock() != null ? stock.getSafetyStock() : 100);
                    dto.setUnit(stock.getUnit());
                    dto.setShortage(dto.getSafetyStock() - dto.getAvailableQty());
                    result.add(dto);
                }
            }
        } catch (Exception e) {
            log.warn("查询低库存预警列表失败: {}", e.getMessage());
        }

        return result;
    }

    /**
     * 获取今日出入库操作记录
     */
    public List<RecentOperationDTO> getRecentOperations() {
        Long tid = UserContext.tenantId();
        List<RecentOperationDTO> operations = new ArrayList<>();
        LocalDate today = LocalDate.now();

        // 1. 获取今日物料入库记录
        List<MaterialPurchase> todayArrivals = materialPurchaseMapper.selectTodayArrivals(today, tid);
        for (MaterialPurchase purchase : todayArrivals) {
            RecentOperationDTO dto = new RecentOperationDTO();
            dto.setId(purchase.getId().toString());
            dto.setType("inbound");
            dto.setMaterialName(purchase.getMaterialName());
            dto.setQuantity(purchase.getPurchaseQuantity() != null ? purchase.getPurchaseQuantity().intValue() : null);
            dto.setOperator(purchase.getReceiverName() != null ? purchase.getReceiverName() : "系统");
            dto.setTime(formatTime(purchase.getActualArrivalDate()));
            operations.add(dto);
        }

        // 2. 获取今日成品入库记录
        List<ProductWarehousing> todayProducts = productWarehousingMapper.selectTodayInbound(today, tid);
        for (ProductWarehousing warehousing : todayProducts) {
            RecentOperationDTO dto = new RecentOperationDTO();
            dto.setId(warehousing.getId().toString());
            dto.setType("inbound");
            dto.setMaterialName("成品-" + warehousing.getOrderNo());
            dto.setQuantity(warehousing.getQualifiedQuantity());
            dto.setOperator(warehousing.getWarehousingOperatorName() != null ? warehousing.getWarehousingOperatorName() : "质检员");
            dto.setTime(formatTime(warehousing.getWarehousingEndTime()));
            operations.add(dto);
        }

        // 3. 获取今日面辅料出库记录
        try {
            List<MaterialOutboundLog> todayOutbounds = materialOutboundLogMapper.selectTodayOutbounds(today, tid);
            for (MaterialOutboundLog outboundRecord : todayOutbounds) {
                RecentOperationDTO dto = new RecentOperationDTO();
                dto.setId(outboundRecord.getId());
                dto.setType("outbound");
                dto.setMaterialName(outboundRecord.getMaterialName());
                dto.setQuantity(outboundRecord.getQuantity());
                dto.setOperator(outboundRecord.getOperatorName() != null ? outboundRecord.getOperatorName() : "仓管");
                LocalDateTime t = outboundRecord.getOutboundTime() != null ? outboundRecord.getOutboundTime() : outboundRecord.getCreateTime();
                dto.setTime(formatTime(t));
                operations.add(dto);
            }
        } catch (Exception e) {
            log.warn("查询今日面辅料出库记录失败: {}", e.getMessage());
        }

        // 4. 获取今日成品出库记录
        try {
            List<ProductOutstock> todayOutstock = productOutstockMapper.selectList(
                new QueryWrapper<ProductOutstock>()
                    .apply("DATE(create_time) = {0}", today)
                    .apply("(delete_flag IS NULL OR delete_flag = 0)")
                    .eq("tenant_id", tid)
                    .orderByDesc("create_time")
                    .last("LIMIT 20")
            );
            for (ProductOutstock outstock : todayOutstock) {
                RecentOperationDTO dto = new RecentOperationDTO();
                dto.setId(outstock.getId() != null ? outstock.getId() : "");
                dto.setType("outbound");
                dto.setMaterialName("成品出库-" + (outstock.getOrderNo() != null ? outstock.getOrderNo() : ""));
                dto.setQuantity(outstock.getOutstockQuantity());
                dto.setOperator(outstock.getOperatorName() != null ? outstock.getOperatorName() : "仓管");
                dto.setTime(formatTime(outstock.getCreateTime()));
                operations.add(dto);
            }
        } catch (Exception e) {
            log.warn("查询今日成品出库记录失败: {}", e.getMessage());
        }

        // 5. 按时间倒序排序，取最新10条
        operations.sort((a, b) -> b.getTime().compareTo(a.getTime()));
        return operations.stream().limit(10).collect(Collectors.toList());
    }

    /**
     * 获取趋势数据
     */
    public List<TrendDataPointDTO> getTrendData(String range, String type) {
        List<TrendDataPointDTO> trendData = new ArrayList<>();

        switch (range) {
            case "day":
                trendData = generateDayTrend(type);
                break;
            case "week":
                trendData = generateWeekTrend(type);
                break;
            case "month":
                trendData = generateMonthTrend(type);
                break;
            case "year":
                trendData = generateYearTrend(type);
                break;
            default:
                trendData = generateDayTrend(type);
        }

        return trendData;
    }

    /**
     * 生成日趋势（24小时）
     */
    private List<TrendDataPointDTO> generateDayTrend(String type) {
        Long tid = UserContext.tenantId();
        List<TrendDataPointDTO> data = new ArrayList<>();
        LocalDate today = LocalDate.now();

        Map<Integer, Integer> inboundByHour = new HashMap<>();

        // 根据类型查询不同的数据源
        if ("finished".equals(type)) {
            // 成品入库
            List<Map<String, Object>> inboundList = productWarehousingMapper.selectTodayInboundByHour(today, tid);
            for (Map<String, Object> row : inboundList) {
                Integer hour = ((Number) row.get("hour")).intValue();
                Integer count = ((Number) row.get("count")).intValue();
                inboundByHour.put(hour, count);
            }
        } else {
            // 物料入库（面料或辅料）- t_material_purchase.material_type 存英文 'fabric'/'accessory'
            List<Map<String, Object>> inboundList = materialPurchaseMapper.selectTodayInboundByHourAndType(today, type, tid);
            for (Map<String, Object> row : inboundList) {
                Integer hour = ((Number) row.get("hour")).intValue();
                Integer count = ((Number) row.get("count")).intValue();
                inboundByHour.put(hour, count);
            }
        }

        Map<Integer, Integer> outboundByHour = new HashMap<>();
        try {
            if ("finished".equals(type)) {
                // 成品出库（t_product_outstock）
                List<Map<String, Object>> outboundList = productOutstockMapper.selectMaps(
                    new QueryWrapper<ProductOutstock>()
                        .select("HOUR(create_time) as hour, COUNT(*) as count")
                        .apply("DATE(create_time) = {0}", today)
                        .apply("(delete_flag IS NULL OR delete_flag = 0)")
                        .eq("tenant_id", tid)
                        .groupBy("HOUR(create_time)")
                );
                for (Map<String, Object> row : outboundList) {
                    Integer hour = ((Number) row.get("hour")).intValue();
                    Integer count = ((Number) row.get("count")).intValue();
                    outboundByHour.put(hour, count);
                }
            } else {
                // 面辅料出库（t_material_outbound_log）按类型过滤 - t_material_stock.material_type 存英文 'fabric'/'accessory'
                List<Map<String, Object>> materialOutList = materialOutboundLogMapper.selectTodayOutboundByHourAndType(today, type, tid);
                for (Map<String, Object> row : materialOutList) {
                    Integer hour = ((Number) row.get("hour")).intValue();
                    Integer count = ((Number) row.get("count")).intValue();
                    outboundByHour.put(hour, count);
                }
            }
        } catch (Exception e) {
            log.warn("查询日出库趋势失败: {}", e.getMessage());
        }

        for (int hour = 0; hour < 24; hour++) {
            // 入库数据点
            TrendDataPointDTO inboundPoint = new TrendDataPointDTO();
            inboundPoint.setDate(hour + ":00");
            inboundPoint.setValue(inboundByHour.getOrDefault(hour, 0));
            inboundPoint.setType("入库");
            data.add(inboundPoint);

            // 出库数据点
            TrendDataPointDTO outboundPoint = new TrendDataPointDTO();
            outboundPoint.setDate(hour + ":00");
            outboundPoint.setValue(outboundByHour.getOrDefault(hour, 0));
            outboundPoint.setType("出库");
            data.add(outboundPoint);
        }

        return data;
    }

    /**
     * 生成周趋势（7天）
     */
    private List<TrendDataPointDTO> generateWeekTrend(String type) {
        List<TrendDataPointDTO> data = new ArrayList<>();
        String[] weekDays = {"周一", "周二", "周三", "周四", "周五", "周六", "周日"};
        LocalDate today = LocalDate.now();
        LocalDate startDate = today.minusDays(6);
        Long tid = UserContext.tenantId();

        Map<LocalDate, Integer> inboundByDate = new HashMap<>();

        // 根据类型查询不同的数据源
        if ("finished".equals(type)) {
            List<Map<String, Object>> inboundList = productWarehousingMapper.selectLast7DaysInbound(today, tid);
            for (Map<String, Object> row : inboundList) {
                LocalDate date = LocalDate.parse(row.get("date").toString());
                Integer count = ((Number) row.get("count")).intValue();
                inboundByDate.put(date, count);
            }
        } else {
            List<Map<String, Object>> inboundList = materialPurchaseMapper.selectLast7DaysInboundByType(startDate, today, type, tid);
            for (Map<String, Object> row : inboundList) {
                LocalDate date = LocalDate.parse(row.get("date").toString());
                Integer count = ((Number) row.get("count")).intValue();
                inboundByDate.put(date, count);
            }
        }

        Map<LocalDate, Integer> outboundByDate = new HashMap<>();
        try {
            if ("finished".equals(type)) {
                // 成品出库（t_product_outstock）
                List<Map<String, Object>> outboundList = productOutstockMapper.selectMaps(
                    new QueryWrapper<ProductOutstock>()
                        .select("DATE(create_time) as date, COUNT(*) as count")
                        .apply("DATE(create_time) BETWEEN {0} AND {1}", startDate, today)
                        .apply("(delete_flag IS NULL OR delete_flag = 0)")
                        .eq("tenant_id", tid)
                        .groupBy("DATE(create_time)")
                );
                for (Map<String, Object> row : outboundList) {
                    LocalDate date = LocalDate.parse(row.get("date").toString());
                    Integer count = ((Number) row.get("count")).intValue();
                    outboundByDate.put(date, count);
                }
            } else {
                // 面辅料出库（t_material_outbound_log）按类型过滤
                List<Map<String, Object>> materialOutList = materialOutboundLogMapper.selectLast7DaysOutboundByType(startDate, today, type, tid);
                for (Map<String, Object> row : materialOutList) {
                    LocalDate date = LocalDate.parse(row.get("date").toString());
                    Integer count = ((Number) row.get("count")).intValue();
                    outboundByDate.put(date, count);
                }
            }
        } catch (Exception e) {
            log.warn("查询周出库趋势失败: {}", e.getMessage());
        }

        for (int i = 6; i >= 0; i--) {
            LocalDate date = today.minusDays(i);
            int dayOfWeek = date.getDayOfWeek().getValue() - 1; // 0=周一, 6=周日

            // 入库
            TrendDataPointDTO inboundPoint = new TrendDataPointDTO();
            inboundPoint.setDate(weekDays[dayOfWeek]);
            inboundPoint.setValue(inboundByDate.getOrDefault(date, 0));
            inboundPoint.setType("入库");
            data.add(inboundPoint);

            // 出库
            TrendDataPointDTO outboundPoint = new TrendDataPointDTO();
            outboundPoint.setDate(weekDays[dayOfWeek]);
            outboundPoint.setValue(outboundByDate.getOrDefault(date, 0));
            outboundPoint.setType("出库");
            data.add(outboundPoint);
        }

        return data;
    }

    /**
     * 生成月趋势（30天）
     */
    private List<TrendDataPointDTO> generateMonthTrend(String type) {
        List<TrendDataPointDTO> data = new ArrayList<>();
        LocalDate today = LocalDate.now();
        LocalDate startDate = today.minusDays(29);
        Long tid = UserContext.tenantId();

        Map<Integer, Integer> inboundByDay = new HashMap<>();

        // 根据类型查询不同的数据源
        if ("finished".equals(type)) {
            List<Map<String, Object>> inboundList = productWarehousingMapper.selectLast30DaysInbound(today, tid);
            for (Map<String, Object> row : inboundList) {
                Integer day = ((Number) row.get("day")).intValue();
                Integer count = ((Number) row.get("count")).intValue();
                inboundByDay.put(day, count);
            }
        } else {
            List<Map<String, Object>> inboundList = materialPurchaseMapper.selectLast30DaysInboundByType(startDate, today, type, tid);
            for (Map<String, Object> row : inboundList) {
                Integer day = ((Number) row.get("day")).intValue();
                Integer count = ((Number) row.get("count")).intValue();
                inboundByDay.put(day, count);
            }
        }

        Map<Integer, Integer> outboundByDay = new HashMap<>();
        try {
            if ("finished".equals(type)) {
                // 成品出库（t_product_outstock）
                List<Map<String, Object>> outboundList = productOutstockMapper.selectMaps(
                    new QueryWrapper<ProductOutstock>()
                        .select("DAY(create_time) as day, COUNT(*) as count")
                        .apply("DATE(create_time) BETWEEN {0} AND {1}", startDate, today)
                        .apply("(delete_flag IS NULL OR delete_flag = 0)")
                        .eq("tenant_id", tid)
                        .groupBy("DAY(create_time)")
                );
                for (Map<String, Object> row : outboundList) {
                    Integer day = ((Number) row.get("day")).intValue();
                    Integer count = ((Number) row.get("count")).intValue();
                    outboundByDay.put(day, count);
                }
            } else {
                // 面辅料出库（t_material_outbound_log）按类型过滤
                List<Map<String, Object>> materialOutList = materialOutboundLogMapper.selectLast30DaysOutboundByType(startDate, today, type, tid);
                for (Map<String, Object> row : materialOutList) {
                    Integer day = ((Number) row.get("day")).intValue();
                    Integer count = ((Number) row.get("count")).intValue();
                    outboundByDay.put(day, count);
                }
            }
        } catch (Exception e) {
            log.warn("查询月出库趋势失败: {}", e.getMessage());
        }

        for (int day = 1; day <= 30; day++) {
            // 入库
            TrendDataPointDTO inboundPoint = new TrendDataPointDTO();
            inboundPoint.setDate(day + "日");
            inboundPoint.setValue(inboundByDay.getOrDefault(day, 0));
            inboundPoint.setType("入库");
            data.add(inboundPoint);

            // 出库
            TrendDataPointDTO outboundPoint = new TrendDataPointDTO();
            outboundPoint.setDate(day + "日");
            outboundPoint.setValue(outboundByDay.getOrDefault(day, 0));
            outboundPoint.setType("出库");
            data.add(outboundPoint);
        }

        return data;
    }

    /**
     * 生成年趋势（12个月）
     */
    private List<TrendDataPointDTO> generateYearTrend(String type) {
        List<TrendDataPointDTO> data = new ArrayList<>();
        int currentYear = LocalDate.now().getYear();
        Long tid = UserContext.tenantId();

        Map<Integer, Integer> inboundByMonth = new HashMap<>();

        // 根据类型查询不同的数据源
        if ("finished".equals(type)) {
            List<Map<String, Object>> inboundList = productWarehousingMapper.selectYearInboundByMonth(currentYear, tid);
            for (Map<String, Object> row : inboundList) {
                Integer month = ((Number) row.get("month")).intValue();
                Integer count = ((Number) row.get("count")).intValue();
                inboundByMonth.put(month, count);
            }
        } else {
            List<Map<String, Object>> inboundList = materialPurchaseMapper.selectYearInboundByMonthAndType(currentYear, type, tid);
            for (Map<String, Object> row : inboundList) {
                Integer month = ((Number) row.get("month")).intValue();
                Integer count = ((Number) row.get("count")).intValue();
                inboundByMonth.put(month, count);
            }
        }

        Map<Integer, Integer> outboundByMonth = new HashMap<>();
        try {
            if ("finished".equals(type)) {
                // 成品出库（t_product_outstock）
                List<Map<String, Object>> outboundList = productOutstockMapper.selectMaps(
                    new QueryWrapper<ProductOutstock>()
                        .select("MONTH(create_time) as month, COUNT(*) as count")
                        .apply("YEAR(create_time) = {0}", currentYear)
                        .apply("(delete_flag IS NULL OR delete_flag = 0)")
                        .eq("tenant_id", tid)
                        .groupBy("MONTH(create_time)")
                );
                for (Map<String, Object> row : outboundList) {
                    Integer month = ((Number) row.get("month")).intValue();
                    Integer count = ((Number) row.get("count")).intValue();
                    outboundByMonth.put(month, count);
                }
            } else {
                // 面辅料出库（t_material_outbound_log）按类型过滤
                List<Map<String, Object>> materialOutList = materialOutboundLogMapper.selectYearOutboundByMonthAndType(currentYear, type, tid);
                for (Map<String, Object> row : materialOutList) {
                    Integer month = ((Number) row.get("month")).intValue();
                    Integer count = ((Number) row.get("count")).intValue();
                    outboundByMonth.put(month, count);
                }
            }
        } catch (Exception e) {
            log.warn("查询年出库趋势失败: {}", e.getMessage());
        }

        for (int month = 1; month <= 12; month++) {
            // 入库
            TrendDataPointDTO inboundPoint = new TrendDataPointDTO();
            inboundPoint.setDate(month + "月");
            inboundPoint.setValue(inboundByMonth.getOrDefault(month, 0));
            inboundPoint.setType("入库");
            data.add(inboundPoint);

            // 出库
            TrendDataPointDTO outboundPoint = new TrendDataPointDTO();
            outboundPoint.setDate(month + "月");
            outboundPoint.setValue(outboundByMonth.getOrDefault(month, 0));
            outboundPoint.setType("出库");
            data.add(outboundPoint);
        }

        return data;
    }

    /**
     * 格式化时间为 MM-dd HH:mm
     */
    private String formatTime(LocalDateTime dateTime) {
        if (dateTime == null) {
            return LocalDateTime.now().format(DateTimeFormatter.ofPattern("MM-dd HH:mm"));
        }
        return dateTime.format(DateTimeFormatter.ofPattern("MM-dd HH:mm"));
    }
}
