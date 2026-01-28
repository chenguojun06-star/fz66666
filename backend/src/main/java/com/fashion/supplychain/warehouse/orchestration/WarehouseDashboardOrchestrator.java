package com.fashion.supplychain.warehouse.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.production.entity.MaterialDatabase;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.ProductWarehousing;
import com.fashion.supplychain.production.mapper.MaterialDatabaseMapper;
import com.fashion.supplychain.production.mapper.MaterialPurchaseMapper;
import com.fashion.supplychain.production.mapper.ProductWarehousingMapper;
import com.fashion.supplychain.warehouse.dto.*;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

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

    /**
     * 获取仓库统计数据
     */
    public WarehouseStatsDTO getWarehouseStats() {
        WarehouseStatsDTO stats = new WarehouseStatsDTO();

        // 1. 物料种类数（从物料数据库统计）
        Long materialCount = materialDatabaseMapper.selectCount(new QueryWrapper<>());
        stats.setMaterialCount(materialCount.intValue());

        // 2. 成品总数（从质检入库统计）
        Integer finishedCount = productWarehousingMapper.selectTotalQuantity();
        stats.setFinishedCount(finishedCount != null ? finishedCount : 0);

        // 3. 低库存预警数（暂时模拟，待实现库存表）
        stats.setLowStockCount(8);

        // 4. 库存总值（模拟）
        stats.setTotalValue(new BigDecimal("1289500.00"));

        // 5. 今日入库次数（物料采购到货 + 质检入库）
        LocalDate today = LocalDate.now();
        Integer materialInbound = materialPurchaseMapper.selectTodayArrivalCount(today);
        Integer productInbound = productWarehousingMapper.selectTodayInboundCount(today);
        stats.setTodayInbound((materialInbound != null ? materialInbound : 0) +
                             (productInbound != null ? productInbound : 0));

        // 6. 今日出库次数（暂时返回0，待完善出库记录表）
        stats.setTodayOutbound(0);

        return stats;
    }

    /**
     * 获取低库存预警列表（模拟数据，待实现库存表）
     */
    public List<LowStockItemDTO> getLowStockItems() {
        List<LowStockItemDTO> result = new ArrayList<>();

        // 模拟数据
        String[] codes = {"F001", "F003", "A002", "A005"};
        String[] names = {"纯棉面料", "涤纶面料", "拉链5#", "纽扣12mm"};
        int[] availables = {800, 450, 180, 3500};
        int[] safeties = {1000, 800, 500, 5000};
        String[] units = {"米", "米", "条", "颗"};

        for (int i = 0; i < codes.length; i++) {
            LowStockItemDTO dto = new LowStockItemDTO();
            dto.setId(String.valueOf(i + 1));
            dto.setMaterialCode(codes[i]);
            dto.setMaterialName(names[i]);
            dto.setAvailableQty(availables[i]);
            dto.setSafetyStock(safeties[i]);
            dto.setUnit(units[i]);
            dto.setShortage(safeties[i] - availables[i]);
            result.add(dto);
        }

        return result;
    }

    /**
     * 获取今日出入库操作记录
     */
    public List<RecentOperationDTO> getRecentOperations() {
        List<RecentOperationDTO> operations = new ArrayList<>();
        LocalDate today = LocalDate.now();

        // 1. 获取今日物料入库记录
        List<MaterialPurchase> todayArrivals = materialPurchaseMapper.selectTodayArrivals(today);
        for (MaterialPurchase purchase : todayArrivals) {
            RecentOperationDTO dto = new RecentOperationDTO();
            dto.setId(purchase.getId().toString());
            dto.setType("inbound");
            dto.setMaterialName(purchase.getMaterialName());
            dto.setQuantity(purchase.getPurchaseQuantity());
            dto.setOperator(purchase.getReceiverName() != null ? purchase.getReceiverName() : "系统");
            dto.setTime(formatTime(purchase.getActualArrivalDate()));
            operations.add(dto);
        }

        // 2. 获取今日成品入库记录
        List<ProductWarehousing> todayProducts = productWarehousingMapper.selectTodayInbound(today);
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

        // 3. 按时间倒序排序，取最新10条
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
        List<TrendDataPointDTO> data = new ArrayList<>();
        LocalDate today = LocalDate.now();

        // 从数据库查询今日每小时的出入库数据
        List<Map<String, Object>> inboundList = productWarehousingMapper.selectTodayInboundByHour(today);
        Map<Integer, Integer> inboundByHour = new HashMap<>();
        for (Map<String, Object> row : inboundList) {
            Integer hour = ((Number) row.get("hour")).intValue();
            Integer count = ((Number) row.get("count")).intValue();
            inboundByHour.put(hour, count);
        }

        Map<Integer, Integer> outboundByHour = new HashMap<>(); // TODO: 待实现出库表

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

        // 查询最近7天的数据
        List<Map<String, Object>> inboundList = productWarehousingMapper.selectLast7DaysInbound(today);
        Map<LocalDate, Integer> inboundByDate = new HashMap<>();
        for (Map<String, Object> row : inboundList) {
            LocalDate date = LocalDate.parse(row.get("date").toString());
            Integer count = ((Number) row.get("count")).intValue();
            inboundByDate.put(date, count);
        }
        Map<LocalDate, Integer> outboundByDate = new HashMap<>(); // TODO: 待实现

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

        // 查询最近30天的数据
        List<Map<String, Object>> inboundList = productWarehousingMapper.selectLast30DaysInbound(today);
        Map<Integer, Integer> inboundByDay = new HashMap<>();
        for (Map<String, Object> row : inboundList) {
            Integer day = ((Number) row.get("day")).intValue();
            Integer count = ((Number) row.get("count")).intValue();
            inboundByDay.put(day, count);
        }
        Map<Integer, Integer> outboundByDay = new HashMap<>(); // TODO: 待实现

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

        // 查询今年12个月的数据
        List<Map<String, Object>> inboundList = productWarehousingMapper.selectYearInboundByMonth(currentYear);
        Map<Integer, Integer> inboundByMonth = new HashMap<>();
        for (Map<String, Object> row : inboundList) {
            Integer month = ((Number) row.get("month")).intValue();
            Integer count = ((Number) row.get("count")).intValue();
            inboundByMonth.put(month, count);
        }
        Map<Integer, Integer> outboundByMonth = new HashMap<>(); // TODO: 待实现

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
     * 格式化时间为 HH:mm
     */
    private String formatTime(LocalDateTime dateTime) {
        if (dateTime == null) {
            return LocalDateTime.now().format(DateTimeFormatter.ofPattern("HH:mm"));
        }
        return dateTime.format(DateTimeFormatter.ofPattern("HH:mm"));
    }

    /**
     * 格式化日期为 HH:mm
     */
    private String formatTime(LocalDate date) {
        if (date == null) {
            return "00:00";
        }
        return "10:00"; // 默认时间
    }
}
