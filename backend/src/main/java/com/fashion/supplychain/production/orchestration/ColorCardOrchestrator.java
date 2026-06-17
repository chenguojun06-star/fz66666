package com.fashion.supplychain.production.orchestration;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.ColorCard;
import com.fashion.supplychain.production.entity.ColorCardItem;
import com.fashion.supplychain.production.entity.MaterialDatabase;
import com.fashion.supplychain.production.mapper.ColorCardItemMapper;
import com.fashion.supplychain.production.mapper.ColorCardMapper;
import com.fashion.supplychain.production.mapper.MaterialDatabaseMapper;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

/**
 * 色卡本 Orchestrator —— 母子关系色卡管理
 *
 * 母卡(ColorCard): 整本色卡共享的基础信息(供应商、幅宽、规格、成分等)
 * 子卡(ColorCardItem): 具体颜色条目(颜色编号、颜色名称、单价、图片)
 *
 * 关键业务:
 * 1) 色卡本 CRUD
 * 2) 颜色条目 CRUD (按色卡本)
 * 3) 从色卡本批量生成物料(到 t_material_database)
 */
@Slf4j
@Service
public class ColorCardOrchestrator {

    @Autowired
    private ColorCardMapper colorCardMapper;

    @Autowired
    private ColorCardItemMapper colorCardItemMapper;

    @Autowired
    private MaterialDatabaseMapper materialDatabaseMapper;

    // ==================== 色卡本 CRUD ====================

    /** 色卡本分页列表 */
    public IPage<ColorCard> listCards(String keyword, String materialType, int page, int pageSize) {
        Long tenantId = UserContext.tenantId();
        int offset = (page - 1) * pageSize;
        List<ColorCard> records = colorCardMapper.selectByQuery(tenantId, keyword, materialType, offset, pageSize);
        long total = colorCardMapper.countByQuery(tenantId, keyword, materialType);
        Page<ColorCard> pageResult = new Page<>(page, pageSize, total);
        pageResult.setRecords(records);
        return pageResult;
    }

    /** 获取单个色卡本详情 */
    public ColorCard getCardById(String id) {
        if (!StringUtils.hasText(id)) {
            throw new IllegalArgumentException("id不能为空");
        }
        Long tenantId = UserContext.tenantId();
        ColorCard card = colorCardMapper.selectById(id.trim());
        if (card == null || (card.getDeleteFlag() != null && card.getDeleteFlag() == 1)
                || !tenantId.equals(card.getTenantId())) {
            throw new NoSuchElementException("色卡本不存在");
        }
        return card;
    }

    /** 获取色卡本 + 其下所有颜色条目 */
    public ColorCardWithItems getCardDetail(String id) {
        ColorCard card = getCardById(id);
        List<ColorCardItem> items = colorCardItemMapper.selectByCardId(card.getId());
        ColorCardWithItems result = new ColorCardWithItems();
        result.setCard(card);
        result.setItems(items);
        return result;
    }

    /** 创建色卡本 */
    @Transactional(rollbackFor = Exception.class)
    public String saveCard(ColorCard card) {
        if (card == null) throw new IllegalArgumentException("参数为空");
        if (!StringUtils.hasText(card.getColorCardCode())) {
            card.setColorCardCode(generateCardCode());
        } else {
            card.setColorCardCode(card.getColorCardCode().trim());
        }
        if (!StringUtils.hasText(card.getColorCardName())) {
            throw new IllegalArgumentException("色卡本名称不能为空");
        }
        Long tenantId = UserContext.tenantId();

        // 检查编码是否重复
        long dup = colorCardMapper.selectCount(
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<ColorCard>()
                        .eq(ColorCard::getColorCardCode, card.getColorCardCode())
                        .eq(ColorCard::getTenantId, tenantId)
                        .and(w -> w.isNull(ColorCard::getDeleteFlag).or().eq(ColorCard::getDeleteFlag, 0)));
        if (dup > 0) {
            throw new IllegalStateException("色卡本编号已存在");
        }

        LocalDateTime now = LocalDateTime.now();
        card.setId(UUID.randomUUID().toString().replace("-", ""));
        card.setTenantId(tenantId);
        card.setCreateTime(now);
        card.setUpdateTime(now);
        card.setDeleteFlag(0);
        if (!StringUtils.hasText(card.getStatus())) card.setStatus("pending");
        if (!StringUtils.hasText(card.getMaterialType())) card.setMaterialType("fabric");
        if (card.getColorCount() == null) card.setColorCount(0);

        int rows = colorCardMapper.insert(card);
        if (rows <= 0) throw new IllegalStateException("保存失败");
        return card.getId();
    }

    /** 更新色卡本 */
    @Transactional(rollbackFor = Exception.class)
    public boolean updateCard(ColorCard card) {
        if (card == null || !StringUtils.hasText(card.getId())) {
            throw new IllegalArgumentException("id不能为空");
        }
        ColorCard current = getCardById(card.getId());
        // 保留关键字段
        card.setTenantId(current.getTenantId());
        card.setDeleteFlag(current.getDeleteFlag());
        card.setCreateTime(current.getCreateTime());
        card.setUpdateTime(LocalDateTime.now());
        if (!StringUtils.hasText(card.getColorCardCode())) card.setColorCardCode(current.getColorCardCode());
        if (!StringUtils.hasText(card.getColorCardName())) card.setColorCardName(current.getColorCardName());
        if (!StringUtils.hasText(card.getMaterialType())) card.setMaterialType(current.getMaterialType());
        if (!StringUtils.hasText(card.getStatus())) card.setStatus(current.getStatus());

        int rows = colorCardMapper.updateById(card);
        if (rows <= 0) throw new IllegalStateException("保存失败");
        return true;
    }

    /** 删除色卡本 */
    @Transactional(rollbackFor = Exception.class)
    public boolean deleteCard(String id) {
        if (!StringUtils.hasText(id)) throw new IllegalArgumentException("id不能为空");
        ColorCard current = colorCardMapper.selectById(id.trim());
        if (current == null || (current.getDeleteFlag() != null && current.getDeleteFlag() != 0)) {
            log.warn("[COLOR-CARD-DELETE] id={} already deleted", id);
            return true;
        }
        // 软删除色卡本
        ColorCard patch = new ColorCard();
        patch.setId(current.getId());
        patch.setDeleteFlag(1);
        patch.setUpdateTime(LocalDateTime.now());
        colorCardMapper.updateById(patch);
        // 软删除全部颜色条目
        colorCardItemMapper.deleteByCardId(current.getId());
        return true;
    }

    // ==================== 颜色条目 CRUD ====================

    /** 为色卡本新增/更新一批颜色条目(覆盖式更新) */
    @Transactional(rollbackFor = Exception.class)
    public boolean saveItems(String cardId, List<ColorCardItem> items) {
        ColorCard card = getCardById(cardId);
        if (items == null) items = new ArrayList<>();

        // 先软删除原有条目
        colorCardItemMapper.deleteByCardId(cardId);

        // 新增
        int sortIdx = 0;
        for (ColorCardItem item : items) {
            item.setId(UUID.randomUUID().toString().replace("-", ""));
            item.setColorCardId(cardId);
            item.setTenantId(card.getTenantId());
            item.setDeleteFlag(0);
            item.setSortOrder(sortIdx++);
            item.setCreateTime(LocalDateTime.now());
            item.setUpdateTime(LocalDateTime.now());
            if (!StringUtils.hasText(item.getColorNo())) {
                item.setColorNo("C" + String.format("%03d", sortIdx));
            }
            colorCardItemMapper.insert(item);
        }

        // 更新色卡本颜色数量
        ColorCard patch = new ColorCard();
        patch.setId(cardId);
        patch.setColorCount(items.size());
        patch.setUpdateTime(LocalDateTime.now());
        colorCardMapper.updateById(patch);
        return true;
    }

    /** 新增单个颜色条目 */
    @Transactional(rollbackFor = Exception.class)
    public String addItem(String cardId, ColorCardItem item) {
        ColorCard card = getCardById(cardId);
        if (item == null) throw new IllegalArgumentException("参数为空");
        if (!StringUtils.hasText(item.getColorNo()) && !StringUtils.hasText(item.getColorName())) {
            throw new IllegalArgumentException("颜色编号或名称不能为空");
        }

        item.setId(UUID.randomUUID().toString().replace("-", ""));
        item.setColorCardId(cardId);
        item.setTenantId(card.getTenantId());
        item.setDeleteFlag(0);
        item.setCreateTime(LocalDateTime.now());
        item.setUpdateTime(LocalDateTime.now());
        if (!StringUtils.hasText(item.getColorNo())) {
            item.setColorNo("C" + String.format("%03d", System.currentTimeMillis() % 1000));
        }
        if (item.getSortOrder() == null) item.setSortOrder(0);

        colorCardItemMapper.insert(item);

        // 更新颜色数量
        long count = colorCardItemMapper.selectCount(
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<ColorCardItem>()
                        .eq(ColorCardItem::getColorCardId, cardId)
                        .and(w -> w.isNull(ColorCardItem::getDeleteFlag).or().eq(ColorCardItem::getDeleteFlag, 0)));
        ColorCard patch = new ColorCard();
        patch.setId(cardId);
        patch.setColorCount((int) count);
        patch.setUpdateTime(LocalDateTime.now());
        colorCardMapper.updateById(patch);
        return item.getId();
    }

    /** 更新单个颜色条目 */
    public boolean updateItem(String itemId, ColorCardItem item) {
        if (!StringUtils.hasText(itemId)) throw new IllegalArgumentException("id不能为空");
        ColorCardItem current = colorCardItemMapper.selectById(itemId.trim());
        if (current == null || (current.getDeleteFlag() != null && current.getDeleteFlag() != 0)) {
            throw new NoSuchElementException("颜色条目不存在");
        }
        if (!UserContext.tenantId().equals(current.getTenantId())) {
            throw new IllegalStateException("无权限");
        }
        item.setId(itemId);
        item.setColorCardId(current.getColorCardId());
        item.setTenantId(current.getTenantId());
        item.setDeleteFlag(current.getDeleteFlag());
        item.setCreateTime(current.getCreateTime());
        item.setUpdateTime(LocalDateTime.now());
        int rows = colorCardItemMapper.updateById(item);
        return rows > 0;
    }

    /** 删除单个颜色条目 */
    @Transactional(rollbackFor = Exception.class)
    public boolean deleteItem(String itemId) {
        if (!StringUtils.hasText(itemId)) throw new IllegalArgumentException("id不能为空");
        ColorCardItem current = colorCardItemMapper.selectById(itemId.trim());
        if (current == null || (current.getDeleteFlag() != null && current.getDeleteFlag() != 0)) {
            log.warn("[COLOR-ITEM-DELETE] id={} already deleted", itemId);
            return true;
        }
        ColorCardItem patch = new ColorCardItem();
        patch.setId(itemId);
        patch.setDeleteFlag(1);
        patch.setUpdateTime(LocalDateTime.now());
        colorCardItemMapper.updateById(patch);

        // 更新色卡本颜色数量
        long count = colorCardItemMapper.selectCount(
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<ColorCardItem>()
                        .eq(ColorCardItem::getColorCardId, current.getColorCardId())
                        .and(w -> w.isNull(ColorCardItem::getDeleteFlag).or().eq(ColorCardItem::getDeleteFlag, 0)));
        ColorCard cardPatch = new ColorCard();
        cardPatch.setId(current.getColorCardId());
        cardPatch.setColorCount((int) count);
        cardPatch.setUpdateTime(LocalDateTime.now());
        colorCardMapper.updateById(cardPatch);
        return true;
    }

    // ==================== 批量生成物料 ====================

    /**
     * 将色卡本下所有颜色条目批量生成到 t_material_database
     * 每条颜色条目 → 一条物料记录
     */
    @Transactional(rollbackFor = Exception.class)
    public List<String> generateMaterialsFromCard(String cardId) {
        ColorCard card = getCardById(cardId);
        List<ColorCardItem> items = colorCardItemMapper.selectByCardId(cardId);
        if (items == null || items.isEmpty()) {
            throw new IllegalStateException("色卡本下暂无颜色条目");
        }

        List<String> generatedIds = new ArrayList<>();
        LocalDateTime now = LocalDateTime.now();
        int seq = 1;
        for (ColorCardItem item : items) {
            MaterialDatabase md = new MaterialDatabase();
            md.setId(UUID.randomUUID().toString().replace("-", ""));
            md.setMaterialCode(card.getColorCardCode() + "-" + item.getColorNo());
            md.setMaterialName(StringUtils.hasText(item.getColorName())
                    ? card.getColorCardName() + " " + item.getColorName()
                    : card.getColorCardName() + " " + item.getColorNo());
            md.setMaterialType(card.getMaterialType());
            md.setColor(StringUtils.hasText(item.getColorName()) ? item.getColorName() : item.getColorNo());
            md.setFabricWidth(card.getFabricWidth());
            md.setFabricWeight(card.getFabricWeight());
            md.setFabricComposition(card.getFabricComposition());
            md.setSpecifications(card.getSpecifications());
            md.setUnit(card.getUnit());
            md.setSupplierId(card.getSupplierId());
            md.setSupplierName(card.getSupplierName());
            md.setSupplierContactPerson(card.getSupplierContactPerson());
            md.setSupplierContactPhone(card.getSupplierContactPhone());
            md.setUnitPrice(item.getUnitPrice());
            md.setImage(item.getImage());
            md.setRemark(StringUtils.hasText(item.getRemark()) ? item.getRemark() : card.getRemark());
            md.setStatus("pending");
            md.setTenantId(card.getTenantId());
            md.setDeleteFlag(0);
            md.setCreateTime(now);
            md.setUpdateTime(now);
            materialDatabaseMapper.insert(md);
            generatedIds.add(md.getId());
            seq++;
        }
        log.info("[COLOR-CARD-GENERATE] cardId={}, generated={} materials", cardId, generatedIds.size());
        return generatedIds;
    }

    // ==================== 辅助 ====================

    private String generateCardCode() {
        long ts = System.currentTimeMillis();
        return "CC" + String.valueOf(ts).substring(5);
    }

    /** 内部返回 DTO: 色卡本 + 颜色条目列表 */
    public static class ColorCardWithItems {
        private ColorCard card;
        private List<ColorCardItem> items;

        public ColorCard getCard() { return card; }
        public void setCard(ColorCard card) { this.card = card; }
        public List<ColorCardItem> getItems() { return items; }
        public void setItems(List<ColorCardItem> items) { this.items = items; }
    }
}
