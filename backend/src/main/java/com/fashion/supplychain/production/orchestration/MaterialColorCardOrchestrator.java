package com.fashion.supplychain.production.orchestration;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.MaterialColorCard;
import com.fashion.supplychain.production.entity.MaterialColorCardItem;
import com.fashion.supplychain.production.entity.MaterialDatabase;
import com.fashion.supplychain.production.mapper.MaterialColorCardItemMapper;
import com.fashion.supplychain.production.mapper.MaterialColorCardMapper;
import com.fashion.supplychain.production.service.MaterialDatabaseService;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.UUID;
import com.fashion.supplychain.production.dto.MaterialColorCardRecognitionResult;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

/**
 * 物料色卡 Orchestrator - 母子关系色卡管理
 *
 * 母卡(MaterialColorCard): 以供应商为维度组织物料资料（一张母卡 = 一家供应商）
 * 子条目(MaterialColorCardItem): 具体的物料资料
 *
 * 关键业务:
 * 1) 物料色卡 CRUD
 * 2) 子物料条目 CRUD (按母卡)
 * 3) 从现有物料库添加条目 / 从色卡条目生成物料到物料库
 */
@Slf4j
@Service
public class MaterialColorCardOrchestrator {

    @Autowired
    private MaterialColorCardMapper cardMapper;

    @Autowired
    private MaterialColorCardItemMapper itemMapper;

    @Autowired
    private MaterialDatabaseService materialDatabaseService;

    // ==================== 色卡 CRUD ====================

    /** 物料色卡分页列表 */
    public IPage<MaterialColorCard> listCards(String keyword, String materialType, int page, int pageSize) {
        Long tenantId = UserContext.tenantId();
        int offset = (page - 1) * pageSize;
        List<MaterialColorCard> records = cardMapper.selectByQuery(tenantId, keyword, materialType, offset, pageSize);
        long total = cardMapper.countByQuery(tenantId, keyword, materialType);
        Page<MaterialColorCard> pageResult = new Page<>(page, pageSize, total);
        pageResult.setRecords(records);
        return pageResult;
    }

    /** 获取单个色卡详情 */
    public MaterialColorCard getCardById(String id) {
        if (!StringUtils.hasText(id)) throw new IllegalArgumentException("id不能为空");
        Long tenantId = UserContext.tenantId();
        MaterialColorCard card = cardMapper.selectById(id.trim());
        if (card == null || (card.getDeleteFlag() != null && card.getDeleteFlag() == 1)
                || !tenantId.equals(card.getTenantId())) {
            throw new NoSuchElementException("物料色卡不存在");
        }
        return card;
    }

    /** 获取色卡 + 其下所有子物料条目 */
    public CardWithItems getCardDetail(String id) {
        MaterialColorCard card = getCardById(id);
        List<MaterialColorCardItem> items = itemMapper.selectByCardId(card.getId(), card.getTenantId());
        CardWithItems result = new CardWithItems();
        result.setCard(card);
        result.setItems(items);
        return result;
    }

    /** 创建色卡 */
    @Transactional(rollbackFor = Exception.class)
    public String saveCard(MaterialColorCard card) {
        if (card == null) throw new IllegalArgumentException("参数为空");
        if (!StringUtils.hasText(card.getCardCode())) {
            card.setCardCode(generateCardCode());
        } else {
            card.setCardCode(card.getCardCode().trim());
        }
        if (!StringUtils.hasText(card.getCardName())) {
            throw new IllegalArgumentException("色卡名称不能为空");
        }
        Long tenantId = UserContext.tenantId();

        // 检查编码是否重复
        long dup = cardMapper.selectCount(
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<MaterialColorCard>()
                        .eq(MaterialColorCard::getCardCode, card.getCardCode())
                        .eq(MaterialColorCard::getTenantId, tenantId)
                        .and(w -> w.isNull(MaterialColorCard::getDeleteFlag).or().eq(MaterialColorCard::getDeleteFlag, 0)));
        if (dup > 0) {
            throw new IllegalStateException("色卡编号已存在");
        }

        LocalDateTime now = LocalDateTime.now();
        card.setId(UUID.randomUUID().toString().replace("-", ""));
        card.setTenantId(tenantId);
        card.setCreateTime(now);
        card.setUpdateTime(now);
        card.setDeleteFlag(0);
        if (!StringUtils.hasText(card.getStatus())) card.setStatus("pending");
        if (!StringUtils.hasText(card.getMaterialType())) card.setMaterialType("fabric");
        if (card.getMaterialCount() == null) card.setMaterialCount(0);

        int rows = cardMapper.insert(card);
        if (rows <= 0) throw new IllegalStateException("保存失败");
        return card.getId();
    }

    /** 更新色卡 */
    @Transactional(rollbackFor = Exception.class)
    public boolean updateCard(MaterialColorCard card) {
        if (card == null || !StringUtils.hasText(card.getId())) {
            throw new IllegalArgumentException("id不能为空");
        }
        MaterialColorCard current = getCardById(card.getId());
        card.setTenantId(current.getTenantId());
        card.setDeleteFlag(current.getDeleteFlag());
        card.setCreateTime(current.getCreateTime());
        card.setUpdateTime(LocalDateTime.now());
        if (!StringUtils.hasText(card.getCardCode())) card.setCardCode(current.getCardCode());
        if (!StringUtils.hasText(card.getCardName())) card.setCardName(current.getCardName());
        if (!StringUtils.hasText(card.getMaterialType())) card.setMaterialType(current.getMaterialType());
        if (!StringUtils.hasText(card.getStatus())) card.setStatus(current.getStatus());

        int rows = cardMapper.updateById(card);
        if (rows <= 0) throw new IllegalStateException("保存失败");
        return true;
    }

    /** 删除色卡 */
    @Transactional(rollbackFor = Exception.class)
    public boolean deleteCard(String id) {
        if (!StringUtils.hasText(id)) throw new IllegalArgumentException("id不能为空");
        MaterialColorCard current = getCardById(id.trim());
        // 软删除色卡
        MaterialColorCard patch = new MaterialColorCard();
        patch.setId(current.getId());
        patch.setDeleteFlag(1);
        patch.setUpdateTime(LocalDateTime.now());
        cardMapper.updateById(patch);
        // 软删除全部子条目
        itemMapper.deleteByCardIdAndTenantId(current.getId(), current.getTenantId());
        return true;
    }

    // ==================== 子条目 CRUD ====================

    /** 为色卡批量保存子条目（覆盖式更新） */
    @Transactional(rollbackFor = Exception.class)
    public boolean saveItems(String cardId, List<MaterialColorCardItem> items) {
        MaterialColorCard card = getCardById(cardId);
        if (items == null) items = new ArrayList<>();

        // 先软删除原有条目
        itemMapper.deleteByCardIdAndTenantId(cardId, card.getTenantId());

        // 新增
        int sortIdx = 0;
        for (MaterialColorCardItem item : items) {
            item.setId(UUID.randomUUID().toString().replace("-", ""));
            item.setMaterialColorCardId(cardId);
            item.setTenantId(card.getTenantId());
            item.setDeleteFlag(0);
            item.setSortOrder(sortIdx++);
            item.setCreateTime(LocalDateTime.now());
            item.setUpdateTime(LocalDateTime.now());
            if (!StringUtils.hasText(item.getMaterialCode())) {
                item.setMaterialCode("M" + String.format("%03d", sortIdx));
            }
            itemMapper.insert(item);
        }

        // 更新色卡物料数量
        MaterialColorCard patch = new MaterialColorCard();
        patch.setId(cardId);
        patch.setMaterialCount(items.size());
        patch.setUpdateTime(LocalDateTime.now());
        cardMapper.updateById(patch);
        return true;
    }

    /** 新增单个子条目 */
    @Transactional(rollbackFor = Exception.class)
    public String addItem(String cardId, MaterialColorCardItem item) {
        MaterialColorCard card = getCardById(cardId);
        if (item == null) throw new IllegalArgumentException("参数为空");
        if (!StringUtils.hasText(item.getMaterialName())) {
            throw new IllegalArgumentException("物料名称不能为空");
        }

        item.setId(UUID.randomUUID().toString().replace("-", ""));
        item.setMaterialColorCardId(cardId);
        item.setTenantId(card.getTenantId());
        item.setDeleteFlag(0);
        item.setCreateTime(LocalDateTime.now());
        item.setUpdateTime(LocalDateTime.now());
        if (!StringUtils.hasText(item.getMaterialCode())) {
            item.setMaterialCode("M" + String.format("%03d", System.currentTimeMillis() % 1000));
        }
        if (item.getSortOrder() == null) item.setSortOrder(0);

        itemMapper.insert(item);

        // 更新物料数量
        long count = itemMapper.selectCount(
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<MaterialColorCardItem>()
                        .eq(MaterialColorCardItem::getMaterialColorCardId, cardId)
                        .eq(MaterialColorCardItem::getTenantId, card.getTenantId())
                        .and(w -> w.isNull(MaterialColorCardItem::getDeleteFlag).or().eq(MaterialColorCardItem::getDeleteFlag, 0)));
        MaterialColorCard patch = new MaterialColorCard();
        patch.setId(cardId);
        patch.setMaterialCount((int) count);
        patch.setUpdateTime(LocalDateTime.now());
        cardMapper.updateById(patch);
        return item.getId();
    }

    /** 更新单个子条目 */
    public boolean updateItem(String itemId, MaterialColorCardItem item) {
        if (!StringUtils.hasText(itemId)) throw new IllegalArgumentException("id不能为空");
        MaterialColorCardItem current = itemMapper.selectById(itemId.trim());
        if (current == null || (current.getDeleteFlag() != null && current.getDeleteFlag() != 0)) {
            throw new NoSuchElementException("物料条目不存在");
        }
        if (!UserContext.tenantId().equals(current.getTenantId())) {
            throw new IllegalStateException("无权限");
        }
        item.setId(itemId);
        item.setMaterialColorCardId(current.getMaterialColorCardId());
        item.setTenantId(current.getTenantId());
        item.setDeleteFlag(current.getDeleteFlag());
        item.setCreateTime(current.getCreateTime());
        item.setUpdateTime(LocalDateTime.now());
        int rows = itemMapper.updateById(item);
        return rows > 0;
    }

    /** 删除单个子条目 */
    @Transactional(rollbackFor = Exception.class)
    public boolean deleteItem(String itemId) {
        if (!StringUtils.hasText(itemId)) throw new IllegalArgumentException("id不能为空");
        MaterialColorCardItem current = itemMapper.selectById(itemId.trim());
        if (current == null || (current.getDeleteFlag() != null && current.getDeleteFlag() != 0)) {
            log.warn("[MATERIAL-ITEM-DELETE] id={} already deleted", itemId);
            return true;
        }
        MaterialColorCardItem patch = new MaterialColorCardItem();
        patch.setId(itemId);
        patch.setDeleteFlag(1);
        patch.setUpdateTime(LocalDateTime.now());
        itemMapper.updateById(patch);

        // 更新数量
        long count = itemMapper.selectCount(
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<MaterialColorCardItem>()
                        .eq(MaterialColorCardItem::getMaterialColorCardId, current.getMaterialColorCardId())
                        .eq(MaterialColorCardItem::getTenantId, current.getTenantId())
                        .and(w -> w.isNull(MaterialColorCardItem::getDeleteFlag).or().eq(MaterialColorCardItem::getDeleteFlag, 0)));
        MaterialColorCard cardPatch = new MaterialColorCard();
        cardPatch.setId(current.getMaterialColorCardId());
        cardPatch.setMaterialCount((int) count);
        cardPatch.setUpdateTime(LocalDateTime.now());
        cardMapper.updateById(cardPatch);
        return true;
    }

    // ==================== 视觉识别 ====================

    /**
     * 拍照识别物料色卡信息
     * 入参：已上传的图片 URL
     * 返回：物料各字段识别结果（含置信度），由前端自动填充表单并让用户确认
     *
     * 注意：该功能依赖视觉 AI 服务（如 Qdrant/工厂画像视觉识别）。
     * 如果未启用或识别失败，返回含 errorMessage 的结果，前端展示"请手动输入"。
     */
    public MaterialColorCardRecognitionResult recognizeFromImage(String imageUrl) {
        MaterialColorCardRecognitionResult result = new MaterialColorCardRecognitionResult();
        result.setImageUrl(imageUrl);
        result.setSuccess(false);
        result.setErrorMessage("视觉识别模块未启用，请手动输入");
        log.info("[MATERIAL-COLOR-CARD-RECOGNIZE] imageUrl={} — 视觉识别未配置，返回手动输入提示", imageUrl);
        return result;
    }

    // ==================== 物料库联动 ====================

    /**
     * 从现有物料库中选择物料添加到色卡（不生成新物料）
     */
    @Transactional(rollbackFor = Exception.class)
    public String addItemFromMaterial(String cardId, String materialId) {
        MaterialColorCard card = getCardById(cardId);
        if (!StringUtils.hasText(materialId)) throw new IllegalArgumentException("materialId不能为空");
        MaterialDatabase md = materialDatabaseService.getById(materialId.trim());
        if (md == null) throw new NoSuchElementException("物料不存在");
        if (!card.getTenantId().equals(md.getTenantId())) throw new IllegalStateException("无权限");

        MaterialColorCardItem item = new MaterialColorCardItem();
        item.setId(UUID.randomUUID().toString().replace("-", ""));
        item.setMaterialColorCardId(cardId);
        item.setTenantId(card.getTenantId());
        item.setMaterialId(md.getId());
        item.setMaterialCode(md.getMaterialCode());
        item.setMaterialName(md.getMaterialName());
        item.setMaterialType(md.getMaterialType());
        item.setColor(md.getColor());
        item.setFabricWidth(md.getFabricWidth());
        item.setFabricWeight(md.getFabricWeight());
        item.setFabricComposition(md.getFabricComposition());
        item.setSpecifications(md.getSpecifications());
        item.setUnit(md.getUnit());
        item.setUnitPrice(md.getUnitPrice());
        item.setImage(md.getImage());
        item.setRemark(md.getRemark());
        item.setSortOrder(0);
        item.setDeleteFlag(0);
        item.setCreateTime(LocalDateTime.now());
        item.setUpdateTime(LocalDateTime.now());
        itemMapper.insert(item);

        // 更新数量
        long count = itemMapper.selectCount(
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<MaterialColorCardItem>()
                        .eq(MaterialColorCardItem::getMaterialColorCardId, cardId)
                        .eq(MaterialColorCardItem::getTenantId, card.getTenantId())
                        .and(w -> w.isNull(MaterialColorCardItem::getDeleteFlag).or().eq(MaterialColorCardItem::getDeleteFlag, 0)));
        MaterialColorCard patch = new MaterialColorCard();
        patch.setId(cardId);
        patch.setMaterialCount((int) count);
        patch.setUpdateTime(LocalDateTime.now());
        cardMapper.updateById(patch);

        return item.getId();
    }

    /**
     * 将色卡下的所有子条目生成到物料库（t_material_database）
     * 已关联 material_id 的不重复生成
     */
    @Transactional(rollbackFor = Exception.class)
    public List<String> generateMaterialsFromCard(String cardId) {
        MaterialColorCard card = getCardById(cardId);
        List<MaterialColorCardItem> items = itemMapper.selectByCardId(cardId, card.getTenantId());
        if (items == null || items.isEmpty()) {
            throw new IllegalStateException("色卡下暂无物料条目，请先添加物料");
        }

        List<String> generatedIds = new ArrayList<>();
        for (MaterialColorCardItem item : items) {
            // 已关联物料的不再重复生成
            if (StringUtils.hasText(item.getMaterialId())) {
                generatedIds.add(item.getMaterialId());
                continue;
            }

            MaterialDatabase md = new MaterialDatabase();
            md.setId(UUID.randomUUID().toString().replace("-", ""));
            md.setMaterialCode(StringUtils.hasText(item.getMaterialCode())
                    ? item.getMaterialCode()
                    : materialDatabaseService.generateMaterialCode(item.getMaterialType()));
            md.setMaterialName(item.getMaterialName());
            md.setMaterialType(item.getMaterialType());
            md.setColor(item.getColor());
            md.setFabricWidth(item.getFabricWidth());
            md.setFabricWeight(item.getFabricWeight());
            md.setFabricComposition(item.getFabricComposition());
            md.setSpecifications(item.getSpecifications());
            md.setUnit(item.getUnit());
            md.setSupplierId(card.getSupplierId());
            md.setSupplierName(card.getSupplierName());
            md.setSupplierContactPerson(card.getSupplierContactPerson());
            md.setSupplierContactPhone(card.getSupplierContactPhone());
            md.setUnitPrice(item.getUnitPrice());
            md.setImage(item.getImage());
            md.setRemark(item.getRemark());
            md.setStatus("pending");
            md.setTenantId(card.getTenantId());
            md.setDeleteFlag(0);
            md.setCreateTime(LocalDateTime.now());
            md.setUpdateTime(LocalDateTime.now());
            materialDatabaseService.save(md);

            // 回写 materialId 关联
            item.setMaterialId(md.getId());
            item.setUpdateTime(LocalDateTime.now());
            itemMapper.updateById(item);

            generatedIds.add(md.getId());
        }

        log.info("[MATERIAL-COLOR-CARD-GENERATE] cardId={} 生成了 {} 条物料", cardId, generatedIds.size());
        return generatedIds;
    }

    // ==================== 辅助 ====================

    /** 生成色卡编号（格式：MCC + 年月日 + 序号） */
    public String generateCardCode() {
        Long tenantId = UserContext.tenantId();
        String today = java.time.LocalDate.now().toString().replace("-", "");
        List<MaterialColorCard> todayCards = cardMapper.selectByQuery(tenantId, null, null, 0, 1000);
        int maxSeq = 0;
        for (MaterialColorCard card : todayCards) {
            String code = card.getCardCode();
            if (code != null && code.startsWith("MCC" + today)) {
                try {
                    int seq = Integer.parseInt(code.substring(("MCC" + today).length()));
                    if (seq > maxSeq) maxSeq = seq;
                } catch (NumberFormatException ignored) {}
            }
        }
        return "MCC" + today + String.format("%02d", maxSeq + 1);
    }

    /** 内部返回 DTO: 色卡 + 子条目列表 */
    public static class CardWithItems {
        private MaterialColorCard card;
        private List<MaterialColorCardItem> items;

        public MaterialColorCard getCard() { return card; }
        public void setCard(MaterialColorCard card) { this.card = card; }
        public List<MaterialColorCardItem> getItems() { return items; }
        public void setItems(List<MaterialColorCardItem> items) { this.items = items; }
    }
}
