package com.fashion.supplychain.system.orchestration;

import com.fashion.supplychain.common.BusinessException;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.system.entity.FactoryWorker;
import com.fashion.supplychain.system.service.FactoryWorkerService;
import java.time.LocalDateTime;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

/**
 * 外发工厂工人管理 Orchestrator。
 * <p>负责工人数据的创建、更新、保存等写操作统一收口到此处，通过 @Transactional 提供事务保护。
 * 所有写操作入口均调用 {@link TenantAssert#assertTenantContext()} 确保租户上下文有效。
 */
@Service
public class FactoryWorkerOrchestrator {

    @Autowired
    private FactoryWorkerService factoryWorkerService;

    /**
     * 新增工人。
     * <p>自动绑定当前用户的 tenantId 和 factoryId（如果是外发工厂账号登录）。
     */
    @Transactional(rollbackFor = Exception.class)
    public FactoryWorker create(FactoryWorker worker) {
        TenantAssert.assertTenantContext();
        String ctxFactoryId = UserContext.factoryId();
        if (StringUtils.hasText(ctxFactoryId)) {
            worker.setFactoryId(ctxFactoryId);
        } else if (!StringUtils.hasText(worker.getFactoryId())) {
            throw new BusinessException("请指定所属工厂");
        }
        if (worker.getTenantId() == null) {
            worker.setTenantId(UserContext.tenantId());
        }
        if (worker.getStatus() == null) {
            worker.setStatus("active");
        }
        if (worker.getDeleteFlag() == null) {
            worker.setDeleteFlag(0);
        }
        worker.setCreateTime(LocalDateTime.now());
        worker.setUpdateTime(LocalDateTime.now());
        boolean saved = factoryWorkerService.save(worker);
        if (!saved) {
            throw new BusinessException("创建工人失败");
        }
        return worker;
    }

    /**
     * 更新工人信息。
     */
    @Transactional(rollbackFor = Exception.class)
    public boolean update(String id, FactoryWorker worker) {
        TenantAssert.assertTenantContext();
        worker.setId(id);
        worker.setUpdateTime(LocalDateTime.now());
        return factoryWorkerService.updateById(worker);
    }

    /**
     * 保存或更新工人（兼容旧接口）。
     *
     * @deprecated 建议使用 {@link #create(FactoryWorker)} 或 {@link #update(String, FactoryWorker)}
     */
    @Deprecated
    @Transactional(rollbackFor = Exception.class)
    public boolean save(FactoryWorker worker) {
        TenantAssert.assertTenantContext();
        String ctxFactoryId = UserContext.factoryId();
        if (StringUtils.hasText(ctxFactoryId)) {
            worker.setFactoryId(ctxFactoryId);
        } else if (!StringUtils.hasText(worker.getFactoryId())) {
            throw new BusinessException("请指定所属工厂");
        }
        if (worker.getTenantId() == null) {
            worker.setTenantId(UserContext.tenantId());
        }
        if (worker.getStatus() == null) {
            worker.setStatus("active");
        }
        if (worker.getDeleteFlag() == null) {
            worker.setDeleteFlag(0);
        }
        if (worker.getId() == null) {
            worker.setCreateTime(LocalDateTime.now());
        }
        worker.setUpdateTime(LocalDateTime.now());
        return factoryWorkerService.saveOrUpdate(worker);
    }

    /**
     * 软删除工人。
     * <p>外发工厂账号仅能删除自己工厂的工人。
     */
    @Transactional(rollbackFor = Exception.class)
    public boolean delete(String id) {
        TenantAssert.assertTenantContext();
        String ctxFactoryId = UserContext.factoryId();
        if (StringUtils.hasText(ctxFactoryId)) {
            FactoryWorker existing = factoryWorkerService.getById(id);
            if (existing == null || !ctxFactoryId.equals(existing.getFactoryId())) {
                throw new BusinessException("无权删除其他工厂的工人");
            }
        }
        return factoryWorkerService.removeById(id);
    }
}
