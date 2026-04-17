package com.fashion.supplychain.production.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.crm.orchestration.ReceivableOrchestrator;
import com.fashion.supplychain.intelligence.orchestration.OrderDecisionCaptureOrchestrator;
import com.fashion.supplychain.intelligence.orchestration.OrderLearningOutcomeOrchestrator;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.ProductionOrderQueryService;
import com.fashion.supplychain.production.service.ProductionOrderScanRecordDomainService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.StyleInfoService;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.NoSuchElementException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.util.StringUtils;

/**
 * 生产订单创建/编辑辅助器 — saveOrUpdateOrder、createOrderFromStyle
 * 从 ProductionOrderOrchestrator 拆分，降低单文件行数
 */
@Service
@Slf4j
public class ProductionOrderCreationHelper {

    @Autowired
    private ProductionOrderService productionOrderService;
    @Autowired
    private MaterialPurchaseService materialPurchaseService;
    @Autowired
    private ProductionOrderScanRecordDomainService scanRecordDomainService;
    @Autowired
    private ProductionOrderOrchestratorHelper helper;
    @Autowired @Lazy
    private ReceivableOrchestrator receivableOrchestrator;
    @Autowired(required = false)
    private OrderDecisionCaptureOrchestrator orderDecisionCaptureOrchestrator;
    @Autowired(required = false)
    private OrderLearningOutcomeOrchestrator orderLearningOutcomeOrchestrator;
    @Autowired
    private StyleInfoService styleInfoService;

    @Transactional(rollbackFor = Exception.class)
    public boolean saveOrUpdateOrder(ProductionOrder productionOrder) {
        if (productionOrder == null) {
            throw new IllegalArgumentException("参数错误");
        }
        boolean isCreate = productionOrder != null && !StringUtils.hasText(productionOrder.getId());
        ProductionOrder existed = null;
        String remarkForLog = null;
        if (!isCreate) {
            String orderId = StringUtils.hasText(productionOrder.getId()) ? productionOrder.getId().trim() : null;
            if (!StringUtils.hasText(orderId)) {
                throw new IllegalArgumentException("参数错误");
            }
            existed = productionOrderService.getById(orderId);
            if (existed == null || existed.getDeleteFlag() == null || existed.getDeleteFlag() != 0) {
                throw new NoSuchElementException("生产订单不存在");
            }
            TenantAssert.assertBelongsToCurrentTenant(existed.getTenantId(), "生产订单");
            String st = helper.safeText(existed.getStatus()).toLowerCase();
            if ("completed".equals(st)) {
                throw new IllegalStateException("订单已完成，无法编辑");
            }
            String operRemark = productionOrder.getOperationRemark();
            remarkForLog = StringUtils.hasText(operRemark) ? operRemark.trim() : "";
            if (!StringUtils.hasText(remarkForLog)) {
                throw new IllegalStateException("请填写操作备注");
            }
        }

        // ✅ 验证人员字段（跟单员、纸样师）是否为系统中的真实用户
        helper.validatePersonnelFields(productionOrder);

        helper.validateUnitPriceSources(productionOrder);

        // 创建订单时检查纸样是否齐全（只警告，不阻止）
        if (isCreate && productionOrder != null && StringUtils.hasText(productionOrder.getStyleId())) {
            helper.checkPatternCompleteWarning(productionOrder.getStyleId());
        }

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

// 使用 TransactionSynchronization 在主事务提交成功后执行，保证 CRM 动作独立，异常不回滚、不影响生产主流程
            if (StringUtils.hasText(productionOrder.getCustomerId()) && productionOrder.getQuotationUnitPrice() != null && productionOrder.getOrderQuantity() != null) {
                TransactionSynchronizationManager.registerSynchronization(
                    new TransactionSynchronization() {
                        @Override
                        public void afterCommit() {
                            try {
                                BigDecimal amount = productionOrder.getQuotationUnitPrice()
                                        .multiply(new BigDecimal(productionOrder.getOrderQuantity()));
                                receivableOrchestrator.generateFromOrder(
                                        productionOrder.getCustomerId(),
                                        productionOrder.getId(),
                                        productionOrder.getOrderNo(),
                                        amount,
                                        productionOrder.getExpectedShipDate(),
                                        "生产订单自动生成应收款"
                                );
                                log.info("CRM 闭环 - 主事务提交后异步/独立生成应收款，订单号: {}", productionOrder.getOrderNo());
                            } catch (Exception e) {
                                log.error("主事务后独立生成应收款失败，已隔离异常，不响主流程: orderId={}", productionOrder.getId(), e);
                            }
                        }
                    }
                );
            }

            if (orderDecisionCaptureOrchestrator != null || orderLearningOutcomeOrchestrator != null) {
                TransactionSynchronizationManager.registerSynchronization(
                    new TransactionSynchronization() {
                        @Override
                        public void afterCommit() {
                            try {
                                if (orderDecisionCaptureOrchestrator != null) {
                                    orderDecisionCaptureOrchestrator.captureByOrderId(productionOrder.getId());
                                }
                                if (orderLearningOutcomeOrchestrator != null) {
                                    orderLearningOutcomeOrchestrator.refreshByOrderId(productionOrder.getId());
                                }
                            } catch (Exception ex) {
                                log.warn("order learning afterCommit sync failed, orderId={}", productionOrder.getId(), ex);
                            }
                        }
                    }
                );
            }

            // PDF自动生成功能已移除
        }

        if (!isCreate && existed != null && StringUtils.hasText(remarkForLog)) {
            try {
                ProductionOrder logOrder = productionOrderService.getById(existed.getId());
                scanRecordDomainService.insertOrderOperationRecord(logOrder != null ? logOrder : existed, "编辑",
                        remarkForLog, LocalDateTime.now());
            } catch (Exception e) {
                log.warn("Failed to log order edit: orderId={}", existed.getId(), e);
            }
        }

        return true;
    }

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> createOrderFromStyle(String styleId, String priceType, String remark) {
        TenantAssert.assertTenantContext(); // 创建订单必须有租户上下文
        // 1. 验证参数
        if (!StringUtils.hasText(styleId)) {
            throw new IllegalArgumentException("样衣ID不能为空");
        }
        if (!StringUtils.hasText(priceType)) {
            throw new IllegalArgumentException("单价类型不能为空");
        }

        // 2. 获取样衣详细信息
        StyleInfo style = styleInfoService.getDetailById(Long.parseLong(styleId.trim()));
        if (style == null) {
            throw new NoSuchElementException("样衣信息不存在：" + styleId);
        }

        // 3. 检查样衣开发状态
        String progressNode = String.valueOf(style.getProgressNode() == null ? "" : style.getProgressNode()).trim();
        if (!"样衣完成".equals(progressNode)) {
            throw new IllegalStateException("样衣开发未完成，当前状态：" + progressNode + "，无法推送到下单管理");
        }

        // 4. 创建订单基本信息（暂时不保存到数据库，等所有数据准备好后一起保存）
        ProductionOrder newOrder = new ProductionOrder();
        newOrder.setStyleId(String.valueOf(style.getId()));
        newOrder.setStyleNo(style.getStyleNo());
        newOrder.setSkc(style.getSkc());
        newOrder.setStyleName(style.getStyleName());
        newOrder.setRemarks(StringUtils.hasText(remark) ? remark.trim() : null);

        // 从样衣同步跟单员和纸样师信息
        String merchandiserFromStyle = style.getOrderType(); // 跟单员存储在orderType字段
        if (StringUtils.hasText(merchandiserFromStyle)) {
            newOrder.setMerchandiser(merchandiserFromStyle.trim());
        }
        String patternMakerFromStyle = style.getSampleSupplier(); // 纸样师存储在sampleSupplier字段
        if (StringUtils.hasText(patternMakerFromStyle)) {
            newOrder.setPatternMaker(patternMakerFromStyle.trim());
        }

        // 记录创建人信息
        String currentUserId = UserContext.userId();
        String currentUsername = UserContext.username();
        if (StringUtils.hasText(currentUserId)) {
            newOrder.setCreatedById(currentUserId);
        }
        if (StringUtils.hasText(currentUsername)) {
            newOrder.setCreatedByName(currentUsername);
        }

        // 设置初始状态
        newOrder.setProductionProgress(0);
        newOrder.setMaterialArrivalRate(0);
        newOrder.setStatus("pending"); // 待生产

        // 5. 保存订单获取ID
        boolean saved = productionOrderService.save(newOrder);
        if (!saved || newOrder.getId() == null) {
            throw new RuntimeException("创建订单失败");
        }

        String newOrderId = newOrder.getId();
        String orderNo = newOrder.getOrderNo(); // 数据库自动生成

        log.info("Created order from style: styleId={}, styleNo={}, orderId={}, orderNo={}",
                styleId, style.getStyleNo(), newOrderId, orderNo);

        // 6. 复制相关数据（BOM、工序、尺寸、附件等）
        try {
            log.info("Order created with styleId={}, data linked via foreign key", styleId);
        } catch (Exception e) {
            log.error("Failed to copy data from style to order: styleId={}, orderId={}",
                    styleId, newOrderId, e);
            // 如果复制失败，删除已创建的订单
            productionOrderService.removeById(newOrderId);
            throw new RuntimeException("复制样衣数据失败：" + e.getMessage(), e);
        }

        // 7. 返回结果
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("id", newOrderId);
        result.put("orderNo", orderNo);
        result.put("styleNo", style.getStyleNo());
        result.put("styleName", style.getStyleName());

        return result;
    }
}
