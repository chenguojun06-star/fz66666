package com.fashion.supplychain.finance.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.constant.OrderStatusConstants;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.finance.entity.DeductionItem;
import com.fashion.supplychain.finance.entity.FinishedProductSettlement;
import com.fashion.supplychain.finance.entity.FinishedSettlementApprovalStatus;
import com.fashion.supplychain.finance.entity.ShipmentReconciliation;
import com.fashion.supplychain.finance.mapper.DeductionItemMapper;
import com.fashion.supplychain.finance.service.FinishedProductSettlementExportService;
import com.fashion.supplychain.finance.service.FinishedProductSettlementService;
import com.fashion.supplychain.finance.service.FinishedSettlementApprovalStatusService;
import com.fashion.supplychain.finance.service.ShipmentReconciliationService;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.mapper.ProductionOrderMapper;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.util.OrderPricingSnapshotUtils;
import com.fashion.supplychain.system.entity.Factory;
import com.fashion.supplychain.system.service.FactoryService;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.lang3.StringUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 成品结算编排层
 *
 * <p>负责结算单的取消、审批等写操作，以及结算列表/详情/导出/工厂汇总/财务看板等读侧聚合。
 * 所有写操作加 @Transactional(rollbackFor = Exception.class)。
 *
 * <p>D-652：原 FinishedProductSettlementController 直接注入 6 个 Service + 2 个 Mapper
 * （违反 ArchUnit 规则6 与规则1），其全部业务逻辑已下沉到本类。
 */
@Slf4j
@Service
public class SettlementOrchestrator {

    @Autowired
    private FinishedProductSettlementService settlementService;

    @Autowired
    private FinishedSettlementApprovalStatusService approvalStatusService;

    /** D-652：成品结算 Excel 导出（仅本类使用） */
    @Autowired
    private FinishedProductSettlementExportService exportService;

    @Autowired
    private FactoryService factoryService;

    @Autowired
    private ProductionOrderService productionOrderService;

    /** D-652：扣款/补款聚合（D-134） */
    @Autowired
    private ShipmentReconciliationService shipmentReconciliationService;

    /** 绕过租户拦截器查询订单，用于超管跨租户查看成品结算 */
    @Autowired
    private ProductionOrderMapper productionOrderMapper;

    /** D-134：工厂汇总聚合扣款/补款，终审推送金额 = 加工费 − 扣款 + 补款 */
    @Autowired
    private DeductionItemMapper deductionItemMapper;

    /**
     * 取消成品结算单
     *
     * <p>将状态设置为 "cancelled"，并更新 updateTime。
     * 注意：已取消的结算单不可再次取消。
     *
     * @param orderId 结算单orderId（主键）
     * @return true 成功，false 失败（不存在或已取消）
     */
    @Transactional(rollbackFor = Exception.class)
    public boolean cancelSettlement(String orderId) {
        if (orderId == null || orderId.isBlank()) {
            return false;
        }
        // P0 修复（铁律4 多租户隔离）：必须按 tenantId 过滤查询，禁止 getById 绕过租户校验
        Long tenantId = TenantAssert.requireTenantId();
        FinishedProductSettlement settlement = settlementService.lambdaQuery()
                .eq(FinishedProductSettlement::getOrderId, orderId.trim())
                .eq(FinishedProductSettlement::getTenantId, tenantId)
                .one();
        if (settlement == null) {
            return false;
        }
        String currentStatus = settlement.getStatus();
        if ("cancelled".equalsIgnoreCase(currentStatus) || "CANCELLED".equals(currentStatus)) {
            return false;
        }

        doCancel(settlement);
        log.info("[SettlementOrchestrator] 成品结算单已取消: orderId={}", orderId);
        return true;
    }

    /**
     * 审批核实成品结算单
     *
     * <p>P0 修复（铁律4 多租户隔离）：tenantId 强制从 UserContext 获取，
     * 禁止外部传入绕过租户上下文。
     *
     * @param orderId  结算单orderId（主键）
     * @param userId   审核人用户ID
     * @param username 审核人用户名
     * @return true 成功，false 失败
     */
    @Transactional(rollbackFor = Exception.class)
    public boolean markApproved(String orderId, String userId, String username) {
        if (orderId == null || orderId.isBlank()) {
            return false;
        }
        // P0 修复：强制从 UserContext 获取 tenantId，禁止外部传入
        Long tenantId = TenantAssert.requireTenantId();
        // P0 修复：必须按 tenantId 过滤查询
        FinishedProductSettlement settlement = settlementService.lambdaQuery()
                .eq(FinishedProductSettlement::getOrderId, orderId)
                .eq(FinishedProductSettlement::getTenantId, tenantId)
                .one();
        if (settlement == null) {
            return false;
        }
        Integer warehousedQty = settlement.getWarehousedQuantity();
        if (warehousedQty == null || warehousedQty <= 0) {
            return false;
        }
        doMarkApproved(orderId, tenantId, userId, username);
        return true;
    }

    // ==================== D-652：FinishedProductSettlementController 下沉 ====================
    // 原 Controller 直接注入 6 个 Service（FinishedProductSettlementService /
    // FinishedProductSettlementExportService / FinishedSettlementApprovalStatusService /
    // FactoryService / ProductionOrderService / ShipmentReconciliationService）+ 2 个 Mapper
    // （ProductionOrderMapper / DeductionItemMapper）。本编排器**本已持有**其中 2 个
    // （settlementService / approvalStatusService），新增 6 个依赖。
    //
    // ⚠️ 事务注意：本类已存在 @Transactional 的 cancelSettlement / markApproved。把 Controller
    // 逻辑搬进来后，若新方法**直接自调用**这两个方法，Spring AOP 代理不生效 → 事务失效。
    // 因此把「纯写」部分提成私有方法 doCancel / doMarkApproved（不需要 @Transactional，
    // 由外层公开方法的事务覆盖），公开方法 doCancel/markApproved 与新的 *Checked/approveOne
    // 共用同一段写逻辑，零重复且事务语义不变。

    /** 结算单取消的纯写逻辑（调用方必须处于事务中） */
    private void doCancel(FinishedProductSettlement settlement) {
        FinishedProductSettlement patch = new FinishedProductSettlement();
        patch.setOrderId(settlement.getOrderId());
        patch.setStatus("cancelled");
        patch.setUpdateTime(LocalDateTime.now());
        settlementService.updateById(patch);
    }

    /** 结算单审批的纯写逻辑（调用方必须处于事务中） */
    private void doMarkApproved(String orderId, Long tenantId, String userId, String username) {
        approvalStatusService.markApproved(orderId, tenantId, userId, username);
        log.info("[SettlementOrchestrator] 结算单已审批: orderId={}, tenantId={}", orderId, tenantId);
    }

    /**
     * 分页查询成品结算列表（含工厂/订单富化与审批状态回填）。
     * <p>订单范围过滤命中空集时直接返回空 Page（与下沉前 Controller 的短路行为一致）。
     */
    public Page<FinishedProductSettlement> pageSettlements(
            int page, int pageSize, String orderNo, String styleNo, String status,
            String parentOrgUnitId, String factoryType, String startDate, String endDate, String factoryId) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        Page<FinishedProductSettlement> pageObj = new Page<>(page, pageSize);
        LambdaQueryWrapper<FinishedProductSettlement> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(FinishedProductSettlement::getTenantId, tenantId);

        // 订单号模糊查询
        if (StringUtils.isNotBlank(orderNo)) {
            wrapper.like(FinishedProductSettlement::getOrderNo, orderNo);
        }

        // 款号模糊查询
        if (StringUtils.isNotBlank(styleNo)) {
            wrapper.like(FinishedProductSettlement::getStyleNo, styleNo);
        }

        // 订单状态筛选
        if (StringUtils.isNotBlank(status)) {
            wrapper.eq(FinishedProductSettlement::getStatus, status);
        }

        // 始终排除已取消/报废/逻辑删除的订单（不参与结算）
        wrapper.notIn(FinishedProductSettlement::getStatus, OrderStatusConstants.CANCELLED, OrderStatusConstants.DELETED, OrderStatusConstants.SCRAPPED, OrderStatusConstants.ARCHIVED);

        // 日期范围筛选
        if (StringUtils.isNotBlank(startDate)) {
            LocalDateTime startDateTime = LocalDate.parse(startDate).atStartOfDay();
            wrapper.ge(FinishedProductSettlement::getCreateTime, startDateTime);
        }
        if (StringUtils.isNotBlank(endDate)) {
            LocalDateTime endDateTime = LocalDate.parse(endDate).atTime(LocalTime.MAX);
            wrapper.le(FinishedProductSettlement::getCreateTime, endDateTime);
        }

        // 外发工厂账号强制只看自己工厂数据；租户管理员可按 factoryId 筛选
        String ctxFactoryId = UserContext.factoryId();
        if (StringUtils.isNotBlank(ctxFactoryId)) {
            wrapper.eq(FinishedProductSettlement::getFactoryId, ctxFactoryId);
        } else if (StringUtils.isNotBlank(factoryId)) {
            wrapper.eq(FinishedProductSettlement::getFactoryId, factoryId);
        }

        if (!applyOrderScopeFilter(wrapper, parentOrgUnitId, factoryType)) {
            return new Page<>(page, pageSize, 0);
        }

        // 按创建时间倒序
        wrapper.orderByDesc(FinishedProductSettlement::getCreateTime);

        Page<FinishedProductSettlement> result = settlementService.page(pageObj, wrapper);
        enrichSettlementRecords(result.getRecords());
        return result;
    }

    /**
     * 按订单号取结算详情（含富化）。
     * <p>返回 {@code null} 表示「不存在」或「外发工厂账号越权查看他厂结算单」——
     * 两种情况在下沉前都返回同一句文案「未找到该订单的结算数据」。
     */
    public FinishedProductSettlement getDetailByOrderNoOrNull(String orderNo) {
        TenantAssert.assertTenantContext();
        LambdaQueryWrapper<FinishedProductSettlement> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(FinishedProductSettlement::getOrderNo, orderNo);
        wrapper.eq(FinishedProductSettlement::getTenantId, UserContext.tenantId());
        FinishedProductSettlement settlement = settlementService.getOne(wrapper);

        if (settlement == null) {
            return null;
        }
        // 外发工厂账号只能查看自己工厂的结算单
        String ctxFactoryId = UserContext.factoryId();
        if (StringUtils.isNotBlank(ctxFactoryId) && !ctxFactoryId.equals(settlement.getFactoryId())) {
            return null;
        }
        enrichSettlementRecords(Collections.singletonList(settlement));
        return settlement;
    }

    /**
     * 导出成品结算数据（Excel 字节流，上限 5000 条）。
     * <p>{@code IOException} 由 Controller 的 {@code throws} 透传给 Spring MVC 处理
     * （与下沉前 Controller 直接声明 {@code throws IOException} 行为一致）。
     */
    public byte[] exportToExcelBytes(
            String orderNo, String styleNo, String status,
            String parentOrgUnitId, String factoryType, String startDate, String endDate) throws IOException {
        // 构建查询条件
        LambdaQueryWrapper<FinishedProductSettlement> wrapper = new LambdaQueryWrapper<>();

        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        wrapper.eq(FinishedProductSettlement::getTenantId, tenantId);

        if (StringUtils.isNotBlank(orderNo)) {
            wrapper.like(FinishedProductSettlement::getOrderNo, orderNo);
        }
        if (StringUtils.isNotBlank(styleNo)) {
            wrapper.like(FinishedProductSettlement::getStyleNo, styleNo);
        }
        if (StringUtils.isNotBlank(status)) {
            wrapper.eq(FinishedProductSettlement::getStatus, status);
        }
        // 排除已取消/报废的订单
        wrapper.notIn(FinishedProductSettlement::getStatus, OrderStatusConstants.CANCELLED, OrderStatusConstants.DELETED, OrderStatusConstants.SCRAPPED, OrderStatusConstants.ARCHIVED);
        if (StringUtils.isNotBlank(startDate)) {
            LocalDateTime startDateTime = LocalDate.parse(startDate).atStartOfDay();
            wrapper.ge(FinishedProductSettlement::getCreateTime, startDateTime);
        }
        if (StringUtils.isNotBlank(endDate)) {
            LocalDateTime endDateTime = LocalDate.parse(endDate).atTime(LocalTime.MAX);
            wrapper.le(FinishedProductSettlement::getCreateTime, endDateTime);
        }

        // 外发工厂账号强制只导出自己工厂数据
        String ctxFactoryIdExport = UserContext.factoryId();
        if (StringUtils.isNotBlank(ctxFactoryIdExport)) {
            wrapper.eq(FinishedProductSettlement::getFactoryId, ctxFactoryIdExport);
        }

        if (!applyOrderScopeFilter(wrapper, parentOrgUnitId, factoryType)) {
            wrapper.in(FinishedProductSettlement::getOrderId, Collections.singletonList("__NO_MATCH__"));
        }

        wrapper.orderByDesc(FinishedProductSettlement::getCreateTime);
        wrapper.last("LIMIT 5000");

        List<FinishedProductSettlement> data = settlementService.list(wrapper);
        enrichSettlementRecords(data);
        return exportService.exportToExcel(data);
    }

    /**
     * 审批单条成品结算（{@code /approve} 与 {@code /batch-approve} 共用，保证校验规则完全一致，
     * 避免出现"批量能过、单条过不了"的偏差）。
     *
     * @return null 表示成功；否则返回失败原因
     */
    @Transactional(rollbackFor = Exception.class)
    public String approveOne(String id) {
        // 查询结算记录
        FinishedProductSettlement settlement = settlementService.getById(id);
        if (settlement == null) {
            return "未找到该订单的结算数据";
        }
        TenantAssert.assertBelongsToCurrentTenant(settlement.getTenantId(), "结算单");

        // 内部工厂结算单通过工资结算审核，禁止在成品结算页重复审核
        // factoryType 是 @TableField(exist=false)，getById 不会填充，需从关联数据推断
        String resolvedFactoryType = null;
        if (StringUtils.isNotBlank(settlement.getFactoryId())) {
            Factory factory = factoryService.getById(settlement.getFactoryId());
            if (factory != null) {
                resolvedFactoryType = factory.getFactoryType();
            }
        }
        if (resolvedFactoryType == null && StringUtils.isNotBlank(settlement.getOrderId())) {
            ProductionOrder order = productionOrderService.getById(settlement.getOrderId());
            if (order != null) {
                resolvedFactoryType = order.getFactoryType();
            }
        }
        if ("INTERNAL".equals(resolvedFactoryType)) {
            return "内部工厂订单请在「工资结算」中审核";
        }

        Integer warehousedQty = settlement.getWarehousedQuantity();
        if (warehousedQty == null || warehousedQty <= 0) {
            return "该订单无入库数量，无法审核";
        }

        Long tenantId = settlement.getTenantId();
        if (tenantId == null) {
            tenantId = UserContext.tenantId();
        }
        // P0 修复（铁律4 多租户隔离）：markApproved 内部强制从 UserContext 取 tenantId
        // 这里仅做权限校验，确保当前用户有权操作该租户的结算单
        TenantAssert.assertBelongsToCurrentTenant(tenantId, "成品结算单");

        // 直接复用私有写逻辑（而非自调用 markApproved —— 同类自调用会使 @Transactional 失效）
        doMarkApproved(id, tenantId, UserContext.userId(), UserContext.username());
        return null;
    }

    /**
     * 取结算单的审批状态（未审批时返回 PENDING）。
     */
    public String getApprovalStatusOf(String id, Long tenantId) {
        return approvalStatusService.getApprovalStatus(id, tenantId);
    }

    /**
     * 工厂订单汇总：按工厂聚合结算数据（订单数/总件数/总金额/扣款补款净额等）。
     * <p>只统计已审批（approval_status 已标记）的订单，且剔除内部工厂。
     */
    public List<Map<String, Object>> factorySummary(
            String factoryName, String status, String startDate, String endDate, String factoryType) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        LambdaQueryWrapper<FinishedProductSettlement> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(FinishedProductSettlement::getTenantId, tenantId);

        if (StringUtils.isNotBlank(factoryName)) {
            wrapper.like(FinishedProductSettlement::getFactoryName, factoryName);
        }
        if (StringUtils.isNotBlank(status)) {
            wrapper.eq(FinishedProductSettlement::getStatus, status);
        }
        wrapper.notIn(FinishedProductSettlement::getStatus, OrderStatusConstants.CANCELLED, OrderStatusConstants.DELETED, OrderStatusConstants.SCRAPPED, OrderStatusConstants.ARCHIVED);
        if (StringUtils.isNotBlank(startDate)) {
            wrapper.ge(FinishedProductSettlement::getCreateTime,
                    LocalDate.parse(startDate).atStartOfDay());
        }
        if (StringUtils.isNotBlank(endDate)) {
            wrapper.le(FinishedProductSettlement::getCreateTime,
                    LocalDate.parse(endDate).atTime(LocalTime.MAX));
        }

        String effectiveFactoryType = StringUtils.isNotBlank(factoryType) ? factoryType : "EXTERNAL";
        if (!applyOrderScopeFilter(wrapper, null, effectiveFactoryType)) {
            return Collections.emptyList();
        }

        String ctxFactoryIdSummary = UserContext.factoryId();
        if (StringUtils.isNotBlank(ctxFactoryIdSummary)) {
            wrapper.eq(FinishedProductSettlement::getFactoryId, ctxFactoryIdSummary);
        }

        wrapper.orderByDesc(FinishedProductSettlement::getCreateTime);
        wrapper.last("LIMIT 5000");
        List<FinishedProductSettlement> allData = settlementService.list(wrapper);

        Set<String> approvedSettlementIds = approvalStatusService.getApprovedIds(tenantId);

        Map<String, Map<String, Object>> grouped = new LinkedHashMap<>();
        for (FinishedProductSettlement item : allData) {
            boolean isApproved = StringUtils.isNotBlank(item.getOrderId())
                    && approvedSettlementIds.contains(item.getOrderId());
            if (!isApproved) {
                continue;
            }

            String fName = StringUtils.isNotBlank(item.getFactoryName())
                    ? item.getFactoryName() : "未分配工厂";
            String fId = item.getFactoryId() != null ? item.getFactoryId() : "";

            grouped.computeIfAbsent(fName, k -> {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("factoryId", fId);
                m.put("factoryName", k);
                m.put("orderCount", 0);
                m.put("totalOrderQuantity", 0);
                m.put("totalWarehousedQuantity", 0);
                m.put("totalDefectQuantity", 0);
                m.put("totalMaterialCost", BigDecimal.ZERO);
                m.put("totalProductionCost", BigDecimal.ZERO);
                m.put("totalAmount", BigDecimal.ZERO);
                m.put("totalProfit", BigDecimal.ZERO);
                m.put("orderNos", new ArrayList<String>());
                m.put("approvedOrderNos", new ArrayList<String>());
                return m;
            });

            Map<String, Object> row = grouped.get(fName);
            row.put("orderCount", (int) row.get("orderCount") + 1);
            row.put("totalOrderQuantity",
                    (int) row.get("totalOrderQuantity") + (item.getOrderQuantity() != null ? item.getOrderQuantity() : 0));
            row.put("totalWarehousedQuantity",
                    (int) row.get("totalWarehousedQuantity") + (item.getWarehousedQuantity() != null ? item.getWarehousedQuantity() : 0));
            row.put("totalDefectQuantity",
                    (int) row.get("totalDefectQuantity") + (item.getDefectQuantity() != null ? item.getDefectQuantity() : 0));
            row.put("totalMaterialCost",
                    ((BigDecimal) row.get("totalMaterialCost")).add(
                            item.getMaterialCost() != null ? item.getMaterialCost() : BigDecimal.ZERO));
            row.put("totalProductionCost",
                    ((BigDecimal) row.get("totalProductionCost")).add(
                            item.getProductionCost() != null ? item.getProductionCost() : BigDecimal.ZERO));
            row.put("totalAmount",
                    ((BigDecimal) row.get("totalAmount")).add(
                            item.getTotalAmount() != null ? item.getTotalAmount() : BigDecimal.ZERO));
            row.put("totalProfit",
                    ((BigDecimal) row.get("totalProfit")).add(
                            item.getProfit() != null ? item.getProfit() : BigDecimal.ZERO));
            @SuppressWarnings("unchecked")
            List<String> orderNos = (List<String>) row.get("orderNos");
            if (StringUtils.isNotBlank(item.getOrderNo())) {
                orderNos.add(item.getOrderNo());
            }
            @SuppressWarnings("unchecked")
            List<String> approvedNos = (List<String>) row.get("approvedOrderNos");
            if (StringUtils.isNotBlank(item.getOrderNo())) {
                approvedNos.add(item.getOrderNo());
            }
        }

        // D-134：聚合各工厂已审批订单的扣款/补款，终审推送金额 = 加工费 − 扣款 + 补款
        fillDeductionTotals(grouped);

        // 批量查询工厂类型：factoryType（INTERNAL=本厂内部/EXTERNAL=外部工厂）
        Set<String> factoryIds = new HashSet<>();
        Set<String> orderIds = new HashSet<>();
        for (Map<String, Object> row : grouped.values()) {
            String fId = (String) row.get("factoryId");
            if (StringUtils.isNotBlank(fId)) factoryIds.add(fId);
        }
        for (FinishedProductSettlement item : allData) {
            if (item != null && StringUtils.isNotBlank(item.getOrderId())) {
                orderIds.add(item.getOrderId());
            }
        }

        Map<String, ProductionOrder> orderMap = new HashMap<>();
        if (!orderIds.isEmpty()) {
            productionOrderService.listByIds(orderIds).forEach(order -> orderMap.put(order.getId(), order));
        }

        // 批量加载外发工厂实体（供 factoryType / parentOrgUnitName 查询）
        Map<String, Factory> factoryMap = factoryIds.isEmpty() ? Collections.emptyMap() :
                factoryService.listByIds(factoryIds).stream()
                        .filter(f -> StringUtils.isNotBlank(f.getId()))
                        .collect(Collectors.toMap(Factory::getId, f -> f, (a, b) -> a));

        for (Map<String, Object> row : grouped.values()) {
            String fId = (String) row.get("factoryId");
            Factory factory = StringUtils.isNotBlank(fId) ? factoryMap.get(fId) : null;

            // 优先从工厂实体取 factoryType；factoryId 为空（INTERNAL 模式）时从关联订单推断
            String resolvedType = null;
            if (factory != null && StringUtils.isNotBlank(factory.getFactoryType())) {
                resolvedType = factory.getFactoryType();
            } else if (StringUtils.isBlank(fId)) {
                // INTERNAL 订单：factory_id 为空，从 orderMap 中按 orderNo 匹配推断
                @SuppressWarnings("unchecked")
                List<String> rowOrderNos = (List<String>) row.get("orderNos");
                if (rowOrderNos != null) {
                    for (ProductionOrder order : orderMap.values()) {
                        if (rowOrderNos.contains(order.getOrderNo())
                                && StringUtils.isNotBlank(order.getFactoryType())) {
                            resolvedType = order.getFactoryType();
                            break;
                        }
                    }
                }
            }
            row.put("factoryType", resolvedType != null ? resolvedType : "EXTERNAL");
            row.put("parentOrgUnitName", factory != null ? factory.getParentOrgUnitName() : null);
            row.put("orgPath", resolveOrgPathForFactory(row, allData, orderMap));
        }

        grouped.values().removeIf(row -> "INTERNAL".equals(row.get("factoryType")));

        return new ArrayList<>(grouped.values());
    }

    /**
     * 取消成品结算单（含参数/存在性/租户/状态四重校验）。
     *
     * @return null 表示成功；否则返回失败原因（文案与下沉前 Controller 完全一致）
     */
    @Transactional(rollbackFor = Exception.class)
    public String cancelSettlementChecked(String id) {
        if (StringUtils.isBlank(id)) {
            return "结算单ID不能为空";
        }
        FinishedProductSettlement settlement = settlementService.getById(id.trim());
        if (settlement == null) {
            return "未找到该结算单";
        }
        TenantAssert.assertBelongsToCurrentTenant(settlement.getTenantId(), "结算单");

        if (OrderStatusConstants.CANCELLED.equalsIgnoreCase(settlement.getStatus())) {
            return "该结算单已取消，无需重复操作";
        }

        doCancel(settlement);
        log.info("[SettlementOrchestrator] 成品结算单已取消: orderId={}", id);
        return null;
    }

    /**
     * 财务看板汇总数据（统计卡片 / 按月趋势 / 工厂排名），只统计已审批数据。
     */
    public Map<String, Object> dashboardSummary(String startDate, String endDate, String dimension) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        LocalDateTime startDateTime = StringUtils.isNotBlank(startDate)
                ? LocalDate.parse(startDate).atStartOfDay()
                : LocalDate.now().withDayOfYear(1).atStartOfDay();
        LocalDateTime endDateTime = StringUtils.isNotBlank(endDate)
                ? LocalDate.parse(endDate).atTime(LocalTime.MAX)
                : LocalDate.now().atTime(LocalTime.MAX);

        LambdaQueryWrapper<FinishedProductSettlement> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(FinishedProductSettlement::getTenantId, tenantId);
        wrapper.ge(FinishedProductSettlement::getCreateTime, startDateTime);
        wrapper.le(FinishedProductSettlement::getCreateTime, endDateTime);
        wrapper.notIn(FinishedProductSettlement::getStatus,
                OrderStatusConstants.CANCELLED, OrderStatusConstants.DELETED, OrderStatusConstants.SCRAPPED, OrderStatusConstants.ARCHIVED);

        // 外发工厂账号强制只看自己工厂数据
        String ctxFactoryId = UserContext.factoryId();
        if (StringUtils.isNotBlank(ctxFactoryId)) {
            wrapper.eq(FinishedProductSettlement::getFactoryId, ctxFactoryId);
        }

        List<FinishedProductSettlement> allData = settlementService.list(wrapper);
        enrichSettlementRecords(allData);

        Set<String> approvedSettlementIds = approvalStatusService.getApprovedIds(tenantId);

        // 只统计已审批的数据
        List<FinishedProductSettlement> approvedData = allData.stream()
                .filter(item -> StringUtils.isNotBlank(item.getOrderId())
                        && approvedSettlementIds.contains(item.getOrderId()))
                .collect(Collectors.toList());

        // 统计卡片数据
        BigDecimal totalAmount = approvedData.stream()
                .map(item -> item.getTotalAmount() != null ? item.getTotalAmount() : BigDecimal.ZERO)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        int totalWarehoused = approvedData.stream()
                .mapToInt(item -> item.getWarehousedQuantity() != null ? item.getWarehousedQuantity() : 0)
                .sum();
        int totalOrderCount = approvedData.size();

        BigDecimal totalProfit = approvedData.stream()
                .map(item -> item.getProfit() != null ? item.getProfit() : BigDecimal.ZERO)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal avgProfitRate = totalAmount.compareTo(BigDecimal.ZERO) > 0
                ? totalProfit.multiply(BigDecimal.valueOf(100)).divide(totalAmount, 2, RoundingMode.HALF_UP)
                : BigDecimal.ZERO;

        // 计算完成率（有入库数量的订单 / 总订单）
        long completedCount = approvedData.stream()
                .filter(item -> item.getWarehousedQuantity() != null && item.getWarehousedQuantity() > 0)
                .count();
        BigDecimal completionRate = totalOrderCount > 0
                ? BigDecimal.valueOf(completedCount * 100).divide(BigDecimal.valueOf(totalOrderCount), 2, RoundingMode.HALF_UP)
                : BigDecimal.ZERO;

        // 日金额（按天平均）
        long days = java.time.temporal.ChronoUnit.DAYS.between(
                startDateTime.toLocalDate(), endDateTime.toLocalDate()) + 1;
        BigDecimal dailyAmount = days > 0
                ? totalAmount.divide(BigDecimal.valueOf(days), 2, RoundingMode.HALF_UP)
                : BigDecimal.ZERO;

        // 趋势数据：按月分组
        Map<String, List<FinishedProductSettlement>> monthGroups = approvedData.stream()
                .filter(item -> item.getCreateTime() != null)
                .collect(Collectors.groupingBy(
                        item -> item.getCreateTime().format(DateTimeFormatter.ofPattern("yyyy-MM"))
                ));

        List<Map<String, Object>> trend = new ArrayList<>();
        List<String> sortedMonths = new ArrayList<>(monthGroups.keySet());
        Collections.sort(sortedMonths);
        for (String month : sortedMonths) {
            List<FinishedProductSettlement> monthData = monthGroups.get(month);
            BigDecimal value = "amount".equals(dimension)
                    ? monthData.stream()
                            .map(item -> item.getTotalAmount() != null ? item.getTotalAmount() : BigDecimal.ZERO)
                            .reduce(BigDecimal.ZERO, BigDecimal::add)
                    : BigDecimal.valueOf(monthData.stream()
                            .mapToInt(item -> item.getWarehousedQuantity() != null ? item.getWarehousedQuantity() : 0)
                            .sum());
            Map<String, Object> trendItem = new LinkedHashMap<>();
            trendItem.put("month", month);
            trendItem.put("value", value.doubleValue());
            trendItem.put("type", "amount".equals(dimension) ? "金额" : "数量");
            trend.add(trendItem);
        }

        // 排名数据：按工厂分组
        Map<String, List<FinishedProductSettlement>> factoryGroups = approvedData.stream()
                .collect(Collectors.groupingBy(
                        item -> StringUtils.isNotBlank(item.getFactoryName()) ? item.getFactoryName() : "未分配工厂"
                ));

        List<Map<String, Object>> factoryRankList = new ArrayList<>();
        for (Map.Entry<String, List<FinishedProductSettlement>> entry : factoryGroups.entrySet()) {
            BigDecimal value = "amount".equals(dimension)
                    ? entry.getValue().stream()
                            .map(item -> item.getTotalAmount() != null ? item.getTotalAmount() : BigDecimal.ZERO)
                            .reduce(BigDecimal.ZERO, BigDecimal::add)
                    : BigDecimal.valueOf(entry.getValue().stream()
                            .mapToInt(item -> item.getWarehousedQuantity() != null ? item.getWarehousedQuantity() : 0)
                            .sum());
            Map<String, Object> rankItem = new LinkedHashMap<>();
            rankItem.put("name", entry.getKey());
            rankItem.put("value", value.doubleValue());
            factoryRankList.add(rankItem);
        }
        factoryRankList.sort((a, b) -> Double.compare((double) b.get("value"), (double) a.get("value")));
        for (int i = 0; i < factoryRankList.size(); i++) {
            factoryRankList.get(i).put("rank", i + 1);
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("totalAmount", totalAmount.doubleValue());
        result.put("totalAmountChange", 0);      // 周同比暂不支持
        result.put("totalAmountDayChange", 0);   // 日同比暂不支持
        result.put("dailyAmount", dailyAmount.doubleValue());
        result.put("warehousedCount", totalWarehoused);
        result.put("warehousedDayCount", days > 0 ? totalWarehoused / days : 0);
        result.put("orderCount", totalOrderCount);
        result.put("completionRate", completionRate.doubleValue());
        result.put("profitRate", avgProfitRate.doubleValue());
        result.put("profitRateChange", 0);
        result.put("profitRateDayChange", 0);
        result.put("trend", trend);
        result.put("rank", factoryRankList);

        return result;
    }

    private boolean applyOrderScopeFilter(LambdaQueryWrapper<FinishedProductSettlement> wrapper,
            String parentOrgUnitId,
            String factoryType) {
        if (StringUtils.isBlank(parentOrgUnitId) && StringUtils.isBlank(factoryType)) {
            return true;
        }

        LambdaQueryWrapper<ProductionOrder> orderWrapper = new LambdaQueryWrapper<ProductionOrder>()
                .select(ProductionOrder::getId)
                .eq(StringUtils.isNotBlank(parentOrgUnitId), ProductionOrder::getParentOrgUnitId, parentOrgUnitId)
                .and(w -> w.isNull(ProductionOrder::getDeleteFlag).or().eq(ProductionOrder::getDeleteFlag, 0));

        // 内部/外发工厂判断逻辑（2026-08-02 修复）：
        // 之前 INTERNAL 匹配 NULL/空/INTERNAL 导致外发订单（factoryType 为空）被错误归入内部；
        // EXTERNAL 精确匹配导致 factoryType 为空的外发订单查不到。
        // 修复：结合 factoryId 判断 —— factoryId 为空 = 本厂内部；factoryId 不为空 = 外发工厂
        if ("INTERNAL".equals(factoryType)) {
            orderWrapper.and(w -> w.eq(ProductionOrder::getFactoryType, "INTERNAL")
                    .or(w2 -> w2.isNull(ProductionOrder::getFactoryType)
                            .and(w3 -> w3.isNull(ProductionOrder::getFactoryId)
                                    .or().eq(ProductionOrder::getFactoryId, ""))));
        } else if ("EXTERNAL".equals(factoryType)) {
            orderWrapper.and(w -> w.eq(ProductionOrder::getFactoryType, "EXTERNAL")
                    .or(w2 -> w2.and(w3 -> w3.isNull(ProductionOrder::getFactoryType)
                            .or().eq(ProductionOrder::getFactoryType, ""))
                            .isNotNull(ProductionOrder::getFactoryId)
                            .ne(ProductionOrder::getFactoryId, "")));
        } else if (StringUtils.isNotBlank(factoryType)) {
            orderWrapper.eq(ProductionOrder::getFactoryType, factoryType);
        }

        // 使用 @InterceptorIgnore 方法绕过 TenantInterceptor，避免超管（tenantId=null）被注入
        // AND tenant_id IS NULL 而导致查不到任何业务订单。租户隔离由 orderWrapper 中
        // 的 eq(TenantId, tenantId) 条件（普通用户分支）保证；超管有权看所有租户数据。
        Long tenantId = UserContext.tenantId();
        if (tenantId != null) {
            orderWrapper.eq(ProductionOrder::getTenantId, tenantId);
        }
        List<String> orderIds = productionOrderMapper.listForFinanceScope(orderWrapper).stream()
                .map(ProductionOrder::getId)
                .filter(StringUtils::isNotBlank)
                .collect(Collectors.toList());

        if (orderIds.isEmpty()) {
            return false;
        }
        wrapper.in(FinishedProductSettlement::getOrderId, orderIds);
        return true;
    }

    private void enrichSettlementRecords(List<FinishedProductSettlement> records) {
        if (records == null || records.isEmpty()) {
            return;
        }

        Long tenantId = UserContext.tenantId();
        Set<String> approvedIds = approvalStatusService.getApprovedIds(tenantId);

        Set<String> orderIds = records.stream()
                .map(FinishedProductSettlement::getOrderId)
                .filter(StringUtils::isNotBlank)
                .collect(Collectors.toSet());
        Map<String, ProductionOrder> orderMap = new HashMap<>();
        if (!orderIds.isEmpty()) {
            productionOrderService.listByIds(orderIds).forEach(order -> orderMap.put(order.getId(), order));
        }

        Set<String> factoryIds = records.stream()
                .map(FinishedProductSettlement::getFactoryId)
                .filter(StringUtils::isNotBlank)
                .collect(Collectors.toSet());
        Map<String, Factory> factoryMap = new HashMap<>();
        if (!factoryIds.isEmpty()) {
            factoryService.listByIds(factoryIds).forEach(factory -> factoryMap.put(factory.getId(), factory));
        }

        for (FinishedProductSettlement record : records) {
            ProductionOrder order = orderMap.get(record.getOrderId());
            Factory factory = factoryMap.get(record.getFactoryId());
            // factoryType 回填：优先取订单 factoryType，其次取 Factory 表 factoryType，
            // 都为空时根据 factoryId 推断（有 factoryId = EXTERNAL，无 = INTERNAL）
            String resolvedFactoryType = StringUtils.isNotBlank(order != null ? order.getFactoryType() : null)
                    ? order.getFactoryType()
                    : (factory != null ? factory.getFactoryType() : null);
            if (!StringUtils.isNotBlank(resolvedFactoryType)) {
                String fid = order != null ? order.getFactoryId() : null;
                resolvedFactoryType = StringUtils.isNotBlank(fid) ? "EXTERNAL" : "INTERNAL";
            }
            record.setFactoryType(resolvedFactoryType);
            record.setParentOrgUnitId(StringUtils.isNotBlank(order != null ? order.getParentOrgUnitId() : null)
                ? order.getParentOrgUnitId()
                : factory != null ? factory.getParentOrgUnitId() : null);
            record.setParentOrgUnitName(StringUtils.isNotBlank(order != null ? order.getParentOrgUnitName() : null)
                    ? order.getParentOrgUnitName()
                    : factory != null ? factory.getParentOrgUnitName() : null);
            record.setOrgPath(StringUtils.isNotBlank(order != null ? order.getOrgPath() : null)
                    ? order.getOrgPath()
                    : factory != null ? factory.getOrgPath() : null);
            record.setApprovalStatus(approvedIds.contains(record.getOrderId()) ? "APPROVED" : "PENDING");
            applyLockedOrderPrice(record, order);
        }
    }

    /**
     * D-134/D-136：按工厂聚合扣款/补款，并附带抵扣清单（前端勾选用）。
     * <ul>
     *   <li>只统计 settle_flag=0（未抵扣）的扣款项；已抵扣的不再出现（防重复扣）</li>
     *   <li>已审批订单的扣款 → 计入本组 totalDeduction/totalSupplement</li>
     *   <li>已支付订单（审批 paid）名下未抵扣的扣款 → 作为"上期结转"并入同厂组的抵扣清单（滚存）</li>
     *   <li>SUPPLEMENT 类型为补款（加项），其余为扣款（减项）</li>
     *   <li>聚合失败不阻断汇总主流程，前端回退按 totalAmount 推送</li>
     * </ul>
     */
    private void fillDeductionTotals(Map<String, Map<String, Object>> grouped) {
        if (grouped == null || grouped.isEmpty()) {
            return;
        }
        try {
            Long tenantId = UserContext.tenantId();
            // 1. 已审批订单号 → 工厂组
            Map<String, Map<String, Object>> approvedOrderByNo = new HashMap<>();
            for (Map<String, Object> row : grouped.values()) {
                @SuppressWarnings("unchecked")
                List<String> nos = (List<String>) row.get("approvedOrderNos");
                if (nos != null) {
                    for (String no : nos) {
                        if (StringUtils.isNotBlank(no)) {
                            approvedOrderByNo.put(no, row);
                        }
                    }
                }
            }
            // 2. 已支付订单（审批 paid）→ 结转扣款的归属
            List<FinishedSettlementApprovalStatus> paidApprovals = approvalStatusService.lambdaQuery()
                    .eq(FinishedSettlementApprovalStatus::getTenantId, tenantId)
                    .eq(FinishedSettlementApprovalStatus::getStatus, "paid")
                    .list();
            Set<String> paidOrderIds = paidApprovals == null ? Collections.emptySet() :
                    paidApprovals.stream()
                            .map(FinishedSettlementApprovalStatus::getSettlementId)
                            .filter(StringUtils::isNotBlank)
                            .collect(Collectors.toSet());
            Map<String, ProductionOrder> paidOrders = Collections.emptyMap();
            if (!paidOrderIds.isEmpty()) {
                paidOrders = productionOrderService.listByIds(paidOrderIds).stream()
                        .filter(o -> o != null && StringUtils.isNotBlank(o.getOrderNo()))
                        .collect(Collectors.toMap(ProductionOrder::getId, o -> o, (a, b) -> a));
            }
            if (approvedOrderByNo.isEmpty() && paidOrders.isEmpty()) {
                return;
            }
            // 3. 订单号 → 对账单（覆盖已审批+已支付的订单号）
            Set<String> allOrderNos = new HashSet<>(approvedOrderByNo.keySet());
            paidOrders.values().forEach(o -> allOrderNos.add(o.getOrderNo()));
            if (allOrderNos.isEmpty()) {
                return;
            }
            List<ShipmentReconciliation> recons =
                    shipmentReconciliationService.lambdaQuery()
                            .eq(ShipmentReconciliation::getTenantId, tenantId)
                            .in(ShipmentReconciliation::getOrderNo, allOrderNos)
                            .list();
            if (recons == null || recons.isEmpty()) {
                return;
            }
            Map<String, String> reconIdToOrderNo = new HashMap<>();
            for (ShipmentReconciliation r : recons) {
                if (StringUtils.isNotBlank(r.getId()) && StringUtils.isNotBlank(r.getOrderNo())) {
                    reconIdToOrderNo.put(r.getId(), r.getOrderNo());
                }
            }
            if (reconIdToOrderNo.isEmpty()) {
                return;
            }
            // 4. 拉取未抵扣的扣款项
            List<DeductionItem> items =
                    deductionItemMapper.selectList(new LambdaQueryWrapper<DeductionItem>()
                            .eq(DeductionItem::getTenantId, tenantId)
                            .and(w -> w.eq(DeductionItem::getSettleFlag, 0)
                                    .or().isNull(DeductionItem::getSettleFlag))
                            .in(DeductionItem::getReconciliationId, reconIdToOrderNo.keySet()));
            // 5. 归组：已审批订单→本组扣补；已支付订单→同厂组"上期结转"
            for (DeductionItem di : items) {
                if (di == null || di.getDeductionAmount() == null || StringUtils.isBlank(di.getReconciliationId())) {
                    continue;
                }
                String orderNo = reconIdToOrderNo.get(di.getReconciliationId());
                if (StringUtils.isBlank(orderNo)) {
                    continue;
                }
                boolean isSupplement = "SUPPLEMENT".equals(di.getDeductionType());
                Map<String, Object> row = approvedOrderByNo.get(orderNo);
                boolean carryOver = false;
                if (row == null) {
                    // 不在已审批组：若是已支付订单的扣款 → 结转到同厂组
                    ProductionOrder paidOrder = null;
                    for (ProductionOrder o : paidOrders.values()) {
                        if (orderNo.equals(o.getOrderNo())) {
                            paidOrder = o;
                            break;
                        }
                    }
                    if (paidOrder == null || StringUtils.isBlank(paidOrder.getFactoryName())) {
                        continue;
                    }
                    row = grouped.get(paidOrder.getFactoryName());
                    if (row == null) {
                        continue;
                    }
                    carryOver = true;
                }
                BigDecimal amt = di.getDeductionAmount();
                if (isSupplement) {
                    row.put("totalSupplement", ((BigDecimal) row.getOrDefault("totalSupplement", BigDecimal.ZERO)).add(amt));
                } else {
                    row.put("totalDeduction", ((BigDecimal) row.getOrDefault("totalDeduction", BigDecimal.ZERO)).add(amt));
                }
                @SuppressWarnings("unchecked")
                List<Map<String, Object>> itemRows = (List<Map<String, Object>>) row.get("deductionItems");
                if (itemRows == null) {
                    itemRows = new ArrayList<>();
                    row.put("deductionItems", itemRows);
                }
                Map<String, Object> itemRow = new HashMap<>();
                itemRow.put("id", di.getId());
                itemRow.put("deductionType", di.getDeductionType());
                itemRow.put("description", di.getDescription());
                itemRow.put("amount", amt);
                itemRow.put("isSupplement", isSupplement);
                itemRow.put("orderNo", orderNo);
                itemRow.put("carryOver", carryOver);
                itemRows.add(itemRow);
            }
            // 6. 净额 = 加工费 − 扣款(含结转) + 补款
            for (Map<String, Object> row : grouped.values()) {
                BigDecimal total = (BigDecimal) row.getOrDefault("totalAmount", BigDecimal.ZERO);
                BigDecimal ded = (BigDecimal) row.getOrDefault("totalDeduction", BigDecimal.ZERO);
                BigDecimal sup = (BigDecimal) row.getOrDefault("totalSupplement", BigDecimal.ZERO);
                row.put("netAmount", total.subtract(ded).add(sup).setScale(2, RoundingMode.HALF_UP));
            }
        } catch (Exception e) {
            log.warn("[FactorySummary] 扣款/补款聚合失败，回退按加工费推送: {}", e.getMessage());
        }
    }

    private void applyLockedOrderPrice(FinishedProductSettlement record, ProductionOrder order) {
        if (record == null || order == null) {
            return;
        }
        BigDecimal lockedUnitPrice = OrderPricingSnapshotUtils.resolveLockedOrderUnitPrice(
                order.getFactoryUnitPrice(),
                order.getOrderDetails());
        if (lockedUnitPrice.compareTo(BigDecimal.ZERO) <= 0) {
            return;
        }
        int warehousedQty = record.getWarehousedQuantity() != null ? record.getWarehousedQuantity() : 0;
        if (warehousedQty <= 0) {
            record.setStyleFinalPrice(lockedUnitPrice.setScale(2, RoundingMode.HALF_UP));
            record.setTotalAmount(BigDecimal.ZERO);
            record.setProfit(BigDecimal.ZERO);
            record.setProfitMargin(BigDecimal.ZERO);
            return;
        }
        BigDecimal totalAmount = lockedUnitPrice.multiply(BigDecimal.valueOf(warehousedQty)).setScale(2, RoundingMode.HALF_UP);
        BigDecimal materialCost = record.getMaterialCost() == null ? BigDecimal.ZERO : record.getMaterialCost();
        BigDecimal productionCost = record.getProductionCost() == null ? BigDecimal.ZERO : record.getProductionCost();
        BigDecimal defectLoss = record.getDefectLoss() == null ? BigDecimal.ZERO : record.getDefectLoss();
        BigDecimal totalCost = materialCost.add(productionCost).add(defectLoss).setScale(2, RoundingMode.HALF_UP);
        BigDecimal profit = totalAmount.subtract(totalCost).setScale(2, RoundingMode.HALF_UP);
        BigDecimal margin = totalAmount.compareTo(BigDecimal.ZERO) > 0
                ? profit.multiply(BigDecimal.valueOf(100)).divide(totalAmount, 2, RoundingMode.HALF_UP)
                : BigDecimal.ZERO;
        record.setStyleFinalPrice(lockedUnitPrice.setScale(2, RoundingMode.HALF_UP));
        record.setTotalAmount(totalAmount);
        record.setProfit(profit);
        record.setProfitMargin(margin);
    }

    private String resolveOrgPathForFactory(Map<String, Object> row, List<FinishedProductSettlement> allData,
            Map<String, ProductionOrder> orderMap) {
        @SuppressWarnings("unchecked")
        List<String> orderNos = (List<String>) row.get("orderNos");
        if (orderNos == null || orderNos.isEmpty()) {
            return null;
        }
        for (FinishedProductSettlement item : allData) {
            if (item == null || !orderNos.contains(item.getOrderNo())) {
                continue;
            }
            ProductionOrder order = orderMap.get(item.getOrderId());
            if (order == null) {
                continue;
            }
            if (StringUtils.isBlank((String) row.get("parentOrgUnitName")) && StringUtils.isNotBlank(order.getParentOrgUnitName())) {
                row.put("parentOrgUnitName", order.getParentOrgUnitName());
            }
            if (StringUtils.isNotBlank(order.getOrgPath())) {
                return order.getOrgPath();
            }
        }
        return null;
    }
}
