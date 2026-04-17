package com.fashion.supplychain.production.service.impl;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.common.ParamUtils;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.mapper.ScanRecordMapper;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ScanRecordService;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * 扫码记录Service实现类
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class ScanRecordServiceImpl extends ServiceImpl<ScanRecordMapper, ScanRecord> implements ScanRecordService {

        private ProductionOrderService productionOrderService;

        @Override
        public IPage<ScanRecord> queryPage(Map<String, Object> params) {
                Integer page = ParamUtils.getPage(params);
                Integer pageSize = ParamUtils.getPageSize(params);

                // 创建分页对象
                Page<ScanRecord> pageInfo = new Page<>(page, pageSize);

                // 构建查询条件
                String orderNo = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(params, "orderNo"));
                String styleNo = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(params, "styleNo"));
                String scanType = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(params, "scanType"));
                String scanResult = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(params, "scanResult"));
                String operatorId = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(params, "operatorId"));
                String operatorName = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(params, "operatorName"));
                if (!StringUtils.hasText(operatorName)) {
                        operatorName = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(params, "workerName"));
                }
                String bundleNo = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(params, "bundleNo"));
                Integer bundleNoValue = null;
                if (StringUtils.hasText(bundleNo)) {
                        int parsed = ParamUtils.toIntSafe(bundleNo);
                        if (parsed > 0) {
                                bundleNoValue = parsed;
                        }
                }

                LocalDateTime startTime = ParamUtils.getLocalDateTime(params, "startTime");
                LocalDateTime endTime = ParamUtils.getLocalDateTime(params, "endTime");
                if (startTime != null && endTime != null && endTime.isBefore(startTime)) {
                        LocalDateTime tmp = startTime;
                        startTime = endTime;
                        endTime = tmp;
                }

                // 是否排除已关闭/取消/完成/归档订单的扫码记录
                String excludeClosedOrders = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(params, "excludeClosedOrders"));

                // 构建Lambda查询包装器
                LambdaQueryWrapper<ScanRecord> wrapper = new LambdaQueryWrapper<ScanRecord>()
                                .eq(StringUtils.hasText(orderNo), ScanRecord::getOrderNo, orderNo)
                                .like(StringUtils.hasText(styleNo), ScanRecord::getStyleNo, styleNo)
                                .eq(StringUtils.hasText(scanType), ScanRecord::getScanType, scanType)
                                .eq(StringUtils.hasText(scanResult), ScanRecord::getScanResult, scanResult)
                                .eq(StringUtils.hasText(operatorId), ScanRecord::getOperatorId, operatorId)
                                .like(StringUtils.hasText(operatorName), ScanRecord::getOperatorName, operatorName)
                                .eq(bundleNoValue != null, ScanRecord::getCuttingBundleNo, bundleNoValue)
                                .ge(startTime != null, ScanRecord::getScanTime, startTime)
                                .le(endTime != null, ScanRecord::getScanTime, endTime)
                                .orderByDesc(ScanRecord::getScanTime);

                // 排除已关闭/取消/完成/归档订单的扫码记录
                if ("true".equalsIgnoreCase(excludeClosedOrders)) {
                        wrapper.notInSql(ScanRecord::getOrderId,
                                "SELECT id FROM t_production_order WHERE status IN ('closed', 'cancelled', 'completed', 'archived') OR delete_flag = 1");
                }

                // 工厂账号隔离：限制只能查看本工厂的扫码记录
                String factoryId = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(params, "factoryId"));
                if (StringUtils.hasText(factoryId)) {
                        wrapper.eq(ScanRecord::getFactoryId, factoryId);
                }

                // 外发工厂扫码明细：只查 factory_id 非空的记录（财务中心-扫码明细Tab）
                String externalOnly = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(params, "externalOnly"));
                if ("true".equalsIgnoreCase(externalOnly)) {
                        wrapper.isNotNull(ScanRecord::getFactoryId);
                }

                // 工序名模糊过滤
                String processName = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(params, "processName"));
                if (StringUtils.hasText(processName)) {
                        wrapper.like(ScanRecord::getProcessName, processName);
                }

                // 如果没有指定operatorId，根据数据权限添加过滤条件
                if (!StringUtils.hasText(operatorId)) {
                        applyDataPermissionFilter(wrapper);
                }

                return baseMapper.selectPage(pageInfo, wrapper);
        }

        /**
         * 根据当前用户角色应用数据权限过滤
         * - 管理员: 可查看所有数据
         * - 组长/主管: 可查看团队数据
         * - 普通工人: 只能查看自己的数据
         */
        private void applyDataPermissionFilter(LambdaQueryWrapper<ScanRecord> wrapper) {
                // 外发工厂账号：factoryId 已在调用处添加过滤，直接放行（可查看本工厂全部数据）
                String ctxFactoryId = UserContext.factoryId();
                if (StringUtils.hasText(ctxFactoryId)) {
                        log.debug("数据权限: 外发工厂账号 factoryId={}, 跳过个人范围过滤", ctxFactoryId);
                        return;
                }
                String dataScope = UserContext.getDataScope();

                switch (dataScope) {
                        case "all":
                                // 管理员看全部，不添加过滤
                                log.debug("数据权限: 管理员, 可查看全部数据");
                                break;
                        case "team":
                                // 组长看团队数据 (暂时同管理员)
                                log.debug("数据权限: 组长, 可查看团队数据");
                                break;
                        case "own":
                        default:
                                // 普通工人只看自己
                                String currentUserId = UserContext.userId();
                                String currentUsername = UserContext.username();
                                log.debug("数据权限: 工人, 仅查看自己数据, userId={}, username={}",
                                                currentUserId, currentUsername);

                                if (StringUtils.hasText(currentUserId)) {
                                        wrapper.eq(ScanRecord::getOperatorId, currentUserId);
                                } else if (StringUtils.hasText(currentUsername)) {
                                        wrapper.eq(ScanRecord::getOperatorName, currentUsername);
                                } else {
                                        // 没有用户信息，不返回数据
                                        wrapper.eq(ScanRecord::getId, -1);
                                }
                                break;
                }
        }

        @Override
        public boolean saveScanRecord(ScanRecord scanRecord) {
                ensureTenantIdForSave(scanRecord);
                LocalDateTime now = LocalDateTime.now();
                scanRecord.setCreateTime(now);
                scanRecord.setUpdateTime(now);
                return this.save(scanRecord);
        }

        private void ensureTenantIdForSave(ScanRecord scanRecord) {
                if (scanRecord == null || scanRecord.getTenantId() != null) {
                        return;
                }

                Long tenantId = UserContext.tenantId();
                if (tenantId == null) {
                        tenantId = resolveTenantIdFromOrder(scanRecord);
                }

                if (tenantId == null) {
                        throw new IllegalStateException("扫码记录缺少 tenantId，已拒绝写入");
                }

                scanRecord.setTenantId(tenantId);
        }

        private Long resolveTenantIdFromOrder(ScanRecord scanRecord) {
                if (productionOrderService == null || scanRecord == null) {
                        return null;
                }

                String orderId = scanRecord.getOrderId();
                if (StringUtils.hasText(orderId)) {
                        try {
                                ProductionOrder order = productionOrderService.getById(orderId.trim());
                                if (order != null) {
                                        return order.getTenantId();
                                }
                        } catch (Exception e) {
                                log.warn("根据 orderId 反查租户失败: orderId={}", orderId, e);
                        }
                }

                String orderNo = scanRecord.getOrderNo();
                if (StringUtils.hasText(orderNo)) {
                        try {
                                ProductionOrder order = productionOrderService.getByOrderNo(orderNo.trim());
                                if (order != null) {
                                        return order.getTenantId();
                                }
                        } catch (Exception e) {
                                log.warn("根据 orderNo 反查租户失败: orderNo={}", orderNo, e);
                        }
                }
                return null;
        }

        @Override
        public IPage<ScanRecord> queryByOrderId(String orderId, int page, int pageSize) {
                Page<ScanRecord> pageInfo = new Page<>(page, pageSize);
                LambdaQueryWrapper<ScanRecord> wrapper = new LambdaQueryWrapper<ScanRecord>()
                                .eq(ScanRecord::getOrderId, orderId)
                                .orderByDesc(ScanRecord::getScanTime);
                // 不在此处按 factory_id 过滤：小程序/历史扫码记录的 factory_id 字段可能为 null，
                // 按 factory_id 过滤会导致外发工厂账号进度球查询返回 0 条。
                // orderId 本身已足够限定范围（工厂账号只能请求本厂订单的 orderId，
                // 订单列表上层已做工厂级隔离），此处无需额外过滤。
                applyDataPermissionFilter(wrapper);
                return baseMapper.selectPage(pageInfo, wrapper);
        }

        @Override
        public IPage<ScanRecord> queryByStyleNo(String styleNo, int page, int pageSize) {
                Page<ScanRecord> pageInfo = new Page<>(page, pageSize);
                LambdaQueryWrapper<ScanRecord> wrapper = new LambdaQueryWrapper<ScanRecord>()
                                .eq(ScanRecord::getStyleNo, styleNo)
                                .orderByDesc(ScanRecord::getScanTime);
                // 同 queryByOrderId：不按 factory_id 过滤，历史记录该字段可能为 null。
                applyDataPermissionFilter(wrapper);
                return baseMapper.selectPage(pageInfo, wrapper);
        }

        @Override
        public Map<String, Object> getPersonalStats(String operatorId, String scanType, String period) {
                return baseMapper.selectPersonalStats(operatorId, scanType, period, com.fashion.supplychain.common.UserContext.tenantId());
        }

        @Override
        public int deleteByOrderId(String orderId) {
                if (orderId == null || orderId.trim().isEmpty()) {
                        return 0;
                }
                LambdaQueryWrapper<ScanRecord> wrapper = new LambdaQueryWrapper<ScanRecord>()
                                .eq(ScanRecord::getOrderId, orderId.trim());
                Long tid = com.fashion.supplychain.common.UserContext.tenantId();
                if (tid != null) wrapper.eq(ScanRecord::getTenantId, tid);
                return baseMapper.delete(wrapper);
        }

        @Override
        public int deleteByOrderNo(String orderNo) {
                if (orderNo == null || orderNo.trim().isEmpty()) {
                        return 0;
                }
                LambdaQueryWrapper<ScanRecord> wrapper = new LambdaQueryWrapper<ScanRecord>()
                                .eq(ScanRecord::getOrderNo, orderNo.trim());
                Long tid = com.fashion.supplychain.common.UserContext.tenantId();
                if (tid != null) wrapper.eq(ScanRecord::getTenantId, tid);
                return baseMapper.delete(wrapper);
        }

        @Override
        public List<Map<String, Object>> getScanStatsByOrder(String orderNo) {
                if (!StringUtils.hasText(orderNo)) {
                        return java.util.Collections.emptyList();
                }
                QueryWrapper<ScanRecord> wrapper = new QueryWrapper<ScanRecord>()
                                .select("color", "size", "count(*) as count")
                                .eq("order_no", orderNo.trim())
                                .eq("scan_result", "success")
                                .groupBy("color", "size");
                // 工厂隔离
                String ctxFactoryId = UserContext.factoryId();
                if (StringUtils.hasText(ctxFactoryId)) {
                        wrapper.eq("factory_id", ctxFactoryId);
                }
                return baseMapper.selectMaps(wrapper);
        }

        @Override
        public List<ScanRecord> listByCondition(String orderId, String cuttingBundleId, String scanType, String scanResult, String excludeProcessCode) {
                LambdaQueryWrapper<ScanRecord> wrapper = new LambdaQueryWrapper<ScanRecord>()
                        .eq(StringUtils.hasText(orderId), ScanRecord::getOrderId, orderId)
                        .eq(StringUtils.hasText(cuttingBundleId), ScanRecord::getCuttingBundleId, cuttingBundleId)
                        .eq(StringUtils.hasText(scanType), ScanRecord::getScanType, scanType)
                        .eq(StringUtils.hasText(scanResult), ScanRecord::getScanResult, scanResult)
                        .ne(StringUtils.hasText(excludeProcessCode), ScanRecord::getProcessCode, excludeProcessCode)
                        .orderByDesc(ScanRecord::getScanTime)
                        .orderByDesc(ScanRecord::getCreateTime);
                // 工厂隔离
                String ctxFactoryId = UserContext.factoryId();
                if (StringUtils.hasText(ctxFactoryId)) {
                        wrapper.eq(ScanRecord::getFactoryId, ctxFactoryId);
                }
                return baseMapper.selectList(wrapper);
        }

        @Override
        public List<ScanRecord> listQualityWarehousingRecords(String orderId, String cuttingBundleId) {
                LambdaQueryWrapper<ScanRecord> wrapper = new LambdaQueryWrapper<ScanRecord>()
                        .eq(StringUtils.hasText(orderId), ScanRecord::getOrderId, orderId)
                        .eq(StringUtils.hasText(cuttingBundleId), ScanRecord::getCuttingBundleId, cuttingBundleId)
                        .eq(ScanRecord::getProcessCode, "quality_warehousing")
                        .eq(ScanRecord::getScanResult, "success")
                        .orderByDesc(ScanRecord::getScanTime)
                        .orderByDesc(ScanRecord::getCreateTime);
                // 工厂隔离
                String ctxFactoryId = UserContext.factoryId();
                if (StringUtils.hasText(ctxFactoryId)) {
                        wrapper.eq(ScanRecord::getFactoryId, ctxFactoryId);
                }
                return baseMapper.selectList(wrapper);
        }

        @Override
        public boolean batchUpdateRecords(List<ScanRecord> records) {
                if (records == null || records.isEmpty()) {
                        return true;
                }
                return this.updateBatchById(records);
        }

        @Override
        public Map<String, Object> getBundlePendingStats() {
                return baseMapper.selectBundlePendingStats(com.fashion.supplychain.common.UserContext.tenantId());
        }
}
