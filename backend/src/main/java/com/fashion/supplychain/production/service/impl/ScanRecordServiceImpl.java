package com.fashion.supplychain.production.service.impl;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.common.DataPermissionHelper;
import com.fashion.supplychain.common.ParamUtils;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.mapper.ScanRecordMapper;
import com.fashion.supplychain.production.service.ScanRecordService;
import java.time.LocalDateTime;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import lombok.extern.slf4j.Slf4j;

/**
 * 扫码记录Service实现类
 */
@Service
@Slf4j
public class ScanRecordServiceImpl extends ServiceImpl<ScanRecordMapper, ScanRecord> implements ScanRecordService {

        @Override
        public IPage<ScanRecord> queryPage(Map<String, Object> params) {
                Integer page = ParamUtils.getPage(params);
                Integer pageSize = ParamUtils.getPageSize(params);

                // 创建分页对象
                Page<ScanRecord> pageInfo = new Page<>(page, pageSize);

                // 构建查询条件
                String orderNo = (String) params.getOrDefault("orderNo", "");
                String styleNo = (String) params.getOrDefault("styleNo", "");
                String scanType = (String) params.getOrDefault("scanType", "");
                String scanResult = (String) params.getOrDefault("scanResult", "");
                String operatorId = (String) params.getOrDefault("operatorId", "");
                String operatorName = (String) params.getOrDefault("operatorName", "");

                // 构建Lambda查询包装器
                LambdaQueryWrapper<ScanRecord> wrapper = new LambdaQueryWrapper<ScanRecord>()
                                .eq(StringUtils.hasText(orderNo), ScanRecord::getOrderNo, orderNo)
                                .like(StringUtils.hasText(styleNo), ScanRecord::getStyleNo, styleNo)
                                .eq(StringUtils.hasText(scanType), ScanRecord::getScanType, scanType)
                                .eq(StringUtils.hasText(scanResult), ScanRecord::getScanResult, scanResult)
                                .eq(StringUtils.hasText(operatorId), ScanRecord::getOperatorId, operatorId)
                                .like(StringUtils.hasText(operatorName), ScanRecord::getOperatorName, operatorName)
                                .orderByDesc(ScanRecord::getScanTime);

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
                LocalDateTime now = LocalDateTime.now();
                scanRecord.setCreateTime(now);
                scanRecord.setUpdateTime(now);
                return this.save(scanRecord);
        }

        @Override
        public IPage<ScanRecord> queryByOrderId(String orderId, int page, int pageSize) {
                Page<ScanRecord> pageInfo = new Page<>(page, pageSize);
                return baseMapper.selectPage(pageInfo,
                                new LambdaQueryWrapper<ScanRecord>()
                                                .eq(ScanRecord::getOrderId, orderId)
                                                .orderByDesc(ScanRecord::getScanTime));
        }

        @Override
        public IPage<ScanRecord> queryByStyleNo(String styleNo, int page, int pageSize) {
                Page<ScanRecord> pageInfo = new Page<>(page, pageSize);
                return baseMapper.selectPage(pageInfo,
                                new LambdaQueryWrapper<ScanRecord>()
                                                .eq(ScanRecord::getStyleNo, styleNo)
                                                .orderByDesc(ScanRecord::getScanTime));
        }

        @Override
        public Map<String, Object> getPersonalStats(String operatorId, String scanType) {
                return baseMapper.selectPersonalStats(operatorId, scanType);
        }
}
