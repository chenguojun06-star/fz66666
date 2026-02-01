package com.fashion.supplychain.logistics.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.logistics.dto.CreateExpressOrderRequest;
import com.fashion.supplychain.logistics.dto.ExpressOrderDTO;
import com.fashion.supplychain.logistics.dto.LogisticsQueryRequest;
import com.fashion.supplychain.logistics.dto.LogisticsTrackDTO;
import com.fashion.supplychain.logistics.entity.ExpressOrder;
import com.fashion.supplychain.logistics.enums.LogisticsStatusEnum;
import com.fashion.supplychain.logistics.mapper.ExpressOrderMapper;
import com.fashion.supplychain.logistics.mapper.LogisticsTrackMapper;
import com.fashion.supplychain.logistics.service.LogisticsService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

/**
 * 物流服务实现类
 * 预留用于物流管理核心业务实现
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class LogisticsServiceImpl implements LogisticsService {

    private final ExpressOrderMapper expressOrderMapper;
    private final LogisticsTrackMapper logisticsTrackMapper;

    @Override
    public Result<ExpressOrderDTO> createExpressOrder(CreateExpressOrderRequest request) {
        log.info("[预留接口] 创建快递单: {}", request.getTrackingNo());

        // 检查快递单号是否已存在
        LambdaQueryWrapper<ExpressOrder> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(ExpressOrder::getTrackingNo, request.getTrackingNo());
        wrapper.eq(ExpressOrder::getDeleteFlag, 0);
        if (expressOrderMapper.selectCount(wrapper) > 0) {
            return Result.fail("快递单号已存在");
        }

        ExpressOrder entity = new ExpressOrder();
        BeanUtils.copyProperties(request, entity);
        entity.setLogisticsStatus(LogisticsStatusEnum.PENDING);
        entity.setShipTime(LocalDateTime.now());
        entity.setShipperId(UserContext.userId());
        entity.setShipperName(UserContext.username());

        expressOrderMapper.insert(entity);

        ExpressOrderDTO dto = convertToDTO(entity);
        return Result.success(dto);
    }

    @Override
    public Result<ExpressOrderDTO> updateExpressOrder(String id, CreateExpressOrderRequest request) {
        log.info("[预留接口] 更新快递单: {}", id);

        ExpressOrder entity = expressOrderMapper.selectById(id);
        if (entity == null) {
            return Result.fail("快递单不存在");
        }

        BeanUtils.copyProperties(request, entity);
        entity.setId(id);
        expressOrderMapper.updateById(entity);

        return Result.success(convertToDTO(entity));
    }

    @Override
    public Result<Void> deleteExpressOrder(String id) {
        log.info("[预留接口] 删除快递单: {}", id);
        expressOrderMapper.deleteById(id);
        return Result.success();
    }

    @Override
    public Result<ExpressOrderDTO> getExpressOrderDetail(String id) {
        log.info("[预留接口] 获取快递单详情: {}", id);

        ExpressOrder entity = expressOrderMapper.selectById(id);
        if (entity == null) {
            return Result.fail("快递单不存在");
        }

        return Result.success(convertToDTO(entity));
    }

    @Override
    public Result<ExpressOrderDTO> getExpressOrderByTrackingNo(String trackingNo) {
        log.info("[预留接口] 根据快递单号查询: {}", trackingNo);

        LambdaQueryWrapper<ExpressOrder> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(ExpressOrder::getTrackingNo, trackingNo);
        wrapper.eq(ExpressOrder::getDeleteFlag, 0);

        ExpressOrder entity = expressOrderMapper.selectOne(wrapper);
        if (entity == null) {
            return Result.fail("快递单不存在");
        }

        return Result.success(convertToDTO(entity));
    }

    @Override
    public Result<Page<ExpressOrderDTO>> queryExpressOrderPage(LogisticsQueryRequest request) {
        log.info("[预留接口] 分页查询快递单列表");

        Page<ExpressOrder> page = new Page<>(request.getPageNum(), request.getPageSize());
        LambdaQueryWrapper<ExpressOrder> wrapper = buildQueryWrapper(request);

        Page<ExpressOrder> resultPage = expressOrderMapper.selectPage(page, wrapper);

        List<ExpressOrderDTO> dtoList = resultPage.getRecords().stream()
                .map(this::convertToDTO)
                .collect(Collectors.toList());

        Page<ExpressOrderDTO> dtoPage = new Page<>();
        BeanUtils.copyProperties(resultPage, dtoPage);
        dtoPage.setRecords(dtoList);

        return Result.success(dtoPage);
    }

    @Override
    public Result<List<ExpressOrderDTO>> queryExpressOrderList(LogisticsQueryRequest request) {
        log.info("[预留接口] 查询快递单列表");

        LambdaQueryWrapper<ExpressOrder> wrapper = buildQueryWrapper(request);
        List<ExpressOrder> list = expressOrderMapper.selectList(wrapper);

        List<ExpressOrderDTO> dtoList = list.stream()
                .map(this::convertToDTO)
                .collect(Collectors.toList());

        return Result.success(dtoList);
    }

    @Override
    public Result<Void> updateLogisticsStatus(String id, Integer status) {
        log.info("[预留接口] 更新物流状态: {}, status: {}", id, status);

        ExpressOrder entity = expressOrderMapper.selectById(id);
        if (entity == null) {
            return Result.fail("快递单不存在");
        }

        LogisticsStatusEnum statusEnum = LogisticsStatusEnum.getByCode(status);
        if (statusEnum == null) {
            return Result.fail("无效的状态码");
        }

        entity.setLogisticsStatus(statusEnum);
        entity.setTrackUpdateTime(LocalDateTime.now());

        if (statusEnum == LogisticsStatusEnum.DELIVERED) {
            entity.setActualSignTime(LocalDateTime.now());
        }

        expressOrderMapper.updateById(entity);
        return Result.success();
    }

    @Override
    public Result<Void> syncLogisticsTrack(String id) {
        log.info("[预留接口] 同步物流轨迹: {}", id);
        // TODO: 接入快递100/菜鸟等物流API
        return Result.success();
    }

    @Override
    public Result<Void> batchSyncLogisticsTrack(List<String> ids) {
        log.info("[预留接口] 批量同步物流轨迹: {}", ids);
        // TODO: 批量接入物流API
        return Result.success();
    }

    @Override
    public Result<List<LogisticsTrackDTO>> getLogisticsTrack(String expressOrderId) {
        log.info("[预留接口] 获取物流轨迹: {}", expressOrderId);
        // TODO: 查询物流轨迹明细
        return Result.success(new ArrayList<>());
    }

    @Override
    public Result<List<ExpressOrderDTO>> getExpressOrdersByOrderId(String orderId) {
        log.info("[预留接口] 根据订单ID查询快递单: {}", orderId);

        LambdaQueryWrapper<ExpressOrder> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(ExpressOrder::getOrderId, orderId);
        wrapper.eq(ExpressOrder::getDeleteFlag, 0);
        wrapper.orderByDesc(ExpressOrder::getCreateTime);

        List<ExpressOrder> list = expressOrderMapper.selectList(wrapper);
        List<ExpressOrderDTO> dtoList = list.stream()
                .map(this::convertToDTO)
                .collect(Collectors.toList());

        return Result.success(dtoList);
    }

    @Override
    public Result<Void> confirmSign(String id, String signPerson) {
        log.info("[预留接口] 签收确认: {}, signPerson: {}", id, signPerson);

        ExpressOrder entity = expressOrderMapper.selectById(id);
        if (entity == null) {
            return Result.fail("快递单不存在");
        }

        entity.setLogisticsStatus(LogisticsStatusEnum.DELIVERED);
        entity.setActualSignTime(LocalDateTime.now());
        entity.setSignPerson(signPerson);
        entity.setTrackUpdateTime(LocalDateTime.now());

        expressOrderMapper.updateById(entity);
        return Result.success();
    }

    @Override
    public Result<List<ExpressOrderDTO>> getPendingSyncList() {
        log.info("[预留接口] 获取待同步的快递单列表");

        LambdaQueryWrapper<ExpressOrder> wrapper = new LambdaQueryWrapper<>();
        wrapper.ne(ExpressOrder::getLogisticsStatus, LogisticsStatusEnum.DELIVERED);
        wrapper.eq(ExpressOrder::getDeleteFlag, 0);
        wrapper.and(w -> w.isNull(ExpressOrder::getTrackUpdateTime)
                .or().lt(ExpressOrder::getTrackUpdateTime, LocalDateTime.now().minusHours(2)));

        List<ExpressOrder> list = expressOrderMapper.selectList(wrapper);
        List<ExpressOrderDTO> dtoList = list.stream()
                .map(this::convertToDTO)
                .collect(Collectors.toList());

        return Result.success(dtoList);
    }

    @Override
    public void autoSyncAllPendingTracks() {
        log.info("[预留接口] 自动同步所有待更新物流");
        // TODO: 定时任务调用，批量同步物流轨迹
    }

    private LambdaQueryWrapper<ExpressOrder> buildQueryWrapper(LogisticsQueryRequest request) {
        LambdaQueryWrapper<ExpressOrder> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(ExpressOrder::getDeleteFlag, 0);

        if (request.getTrackingNo() != null && !request.getTrackingNo().isEmpty()) {
            wrapper.like(ExpressOrder::getTrackingNo, request.getTrackingNo());
        }
        if (request.getExpressCompany() != null) {
            wrapper.eq(ExpressOrder::getExpressCompany, request.getExpressCompany());
        }
        if (request.getLogisticsStatus() != null) {
            wrapper.eq(ExpressOrder::getLogisticsStatus, request.getLogisticsStatus());
        }
        if (request.getOrderNo() != null && !request.getOrderNo().isEmpty()) {
            wrapper.like(ExpressOrder::getOrderNo, request.getOrderNo());
        }
        if (request.getStyleNo() != null && !request.getStyleNo().isEmpty()) {
            wrapper.like(ExpressOrder::getStyleNo, request.getStyleNo());
        }
        if (request.getReceiverName() != null && !request.getReceiverName().isEmpty()) {
            wrapper.like(ExpressOrder::getReceiverName, request.getReceiverName());
        }
        if (request.getReceiverPhone() != null && !request.getReceiverPhone().isEmpty()) {
            wrapper.like(ExpressOrder::getReceiverPhone, request.getReceiverPhone());
        }
        if (request.getShipTimeStart() != null) {
            wrapper.ge(ExpressOrder::getShipTime, request.getShipTimeStart());
        }
        if (request.getShipTimeEnd() != null) {
            wrapper.le(ExpressOrder::getShipTime, request.getShipTimeEnd());
        }
        if (request.getPlatformOrderNo() != null && !request.getPlatformOrderNo().isEmpty()) {
            wrapper.like(ExpressOrder::getPlatformOrderNo, request.getPlatformOrderNo());
        }
        if (request.getPlatformCode() != null && !request.getPlatformCode().isEmpty()) {
            wrapper.eq(ExpressOrder::getPlatformCode, request.getPlatformCode());
        }

        wrapper.orderByDesc(ExpressOrder::getCreateTime);
        return wrapper;
    }

    private ExpressOrderDTO convertToDTO(ExpressOrder entity) {
        ExpressOrderDTO dto = new ExpressOrderDTO();
        BeanUtils.copyProperties(entity, dto);

        if (entity.getExpressCompany() != null) {
            dto.setExpressCompanyName(entity.getExpressCompany().getName());
        }
        if (entity.getLogisticsStatus() != null) {
            dto.setLogisticsStatusDesc(entity.getLogisticsStatus().getDesc());
        }

        // 拼接完整地址
        StringBuilder fullAddress = new StringBuilder();
        if (entity.getReceiverProvince() != null) {
            fullAddress.append(entity.getReceiverProvince());
        }
        if (entity.getReceiverCity() != null) {
            fullAddress.append(entity.getReceiverCity());
        }
        if (entity.getReceiverDistrict() != null) {
            fullAddress.append(entity.getReceiverDistrict());
        }
        if (entity.getReceiverAddress() != null) {
            fullAddress.append(entity.getReceiverAddress());
        }
        dto.setReceiverFullAddress(fullAddress.toString());

        return dto;
    }
}
