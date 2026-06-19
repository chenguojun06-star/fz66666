package com.fashion.supplychain.style.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.style.entity.StyleSizePrice;
import com.fashion.supplychain.style.service.StyleSizePriceService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * 款式多码单价编排层
 *
 * <p>负责批量保存、删除多码单价等数据库写操作。
 * 所有写操作加 @Transactional(rollbackFor = Exception.class)。
 */
@Slf4j
@Service
public class StyleSizePriceOrchestrator {

    @Autowired
    private StyleSizePriceService styleSizePriceService;

    /**
     * 批量保存多码单价（先删除旧记录再插入新记录，原子操作）
     *
     * @param list 新的多码单价记录列表
     * @return true 成功，false 失败（列表为空）
     */
    @Transactional(rollbackFor = Exception.class)
    public boolean batchSave(List<StyleSizePrice> list) {
        if (list == null || list.isEmpty()) {
            return false;
        }
        Long styleId = list.get(0).getStyleId();
        if (styleId == null) {
            throw new IllegalArgumentException("styleId不能为空");
        }
        Long tid = UserContext.tenantId();
        LambdaQueryWrapper<StyleSizePrice> qw = new LambdaQueryWrapper<>();
        qw.eq(StyleSizePrice::getStyleId, styleId);
        qw.eq(StyleSizePrice::getTenantId, tid);
        styleSizePriceService.remove(qw);
        boolean success = styleSizePriceService.saveBatch(list);
        if (success) {
            log.info("[StyleSizePriceOrchestrator] 多码单价已批量保存: styleId={}, count={}",
                    styleId, list.size());
        }
        return success;
    }

    /**
     * 删除多码单价
     *
     * @param id 记录ID
     * @return true 成功，false 失败
     */
    @Transactional(rollbackFor = Exception.class)
    public boolean delete(String id) {
        if (id == null || id.isBlank()) {
            return false;
        }
        boolean success = styleSizePriceService.removeById(id);
        if (success) {
            log.info("[StyleSizePriceOrchestrator] 多码单价记录已删除: id={}", id);
        }
        return success;
    }

    /**
     * 根据款号ID查询多码单价列表
     */
    public List<StyleSizePrice> listByStyleId(Long styleId) {
        if (styleId == null) {
            return java.util.Collections.emptyList();
        }
        TenantAssert.assertTenantContext();
        Long tid = UserContext.tenantId();
        LambdaQueryWrapper<StyleSizePrice> qw = new LambdaQueryWrapper<>();
        qw.eq(StyleSizePrice::getStyleId, styleId);
        qw.eq(StyleSizePrice::getTenantId, tid);
        qw.orderByAsc(StyleSizePrice::getProcessCode, StyleSizePrice::getSize);
        return styleSizePriceService.list(qw);
    }
}
