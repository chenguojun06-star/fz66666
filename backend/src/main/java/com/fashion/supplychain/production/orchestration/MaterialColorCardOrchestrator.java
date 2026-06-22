package com.fashion.supplychain.production.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.CosService;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.orchestration.IntelligenceInferenceOrchestrator;
import com.fashion.supplychain.production.dto.MaterialColorCardRecognitionResult;
import com.fashion.supplychain.production.entity.MaterialColorCard;
import com.fashion.supplychain.production.entity.MaterialColorCardItem;
import com.fashion.supplychain.production.entity.MaterialDatabase;
import com.fashion.supplychain.production.mapper.MaterialColorCardItemMapper;
import com.fashion.supplychain.production.mapper.MaterialColorCardMapper;
import com.fashion.supplychain.production.service.MaterialDatabaseService;
import com.fashion.supplychain.system.entity.Factory;
import com.fashion.supplychain.system.mapper.FactoryMapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
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

    @Autowired
    private CosService cosService;

    @Autowired
    private IntelligenceInferenceOrchestrator inferenceOrchestrator;

    @Autowired
    private FactoryMapper factoryMapper;

    private static final ObjectMapper jsonMapper = new ObjectMapper();

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

        // 自动同步供应商到工厂管理（面料供应商）
        syncSupplierToFactory(card);
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

        // 自动同步供应商到工厂管理（当 supplierName 变更时）
        syncSupplierToFactory(card);

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
     */
    public MaterialColorCardRecognitionResult recognizeFromImage(String imageUrl) {
        MaterialColorCardRecognitionResult result = new MaterialColorCardRecognitionResult();
        result.setImageUrl(imageUrl);
        if (!StringUtils.hasText(imageUrl)) {
            result.setErrorMessage("图片地址为空，请先上传图片");
            return result;
        }

        // 1. 调用 Agnes Vision 视觉识别（图片内容真正被读取）
        String aiRaw;
        try {
            if (inferenceOrchestrator != null && inferenceOrchestrator.isVisionEnabled()) {
                String visionPrompt = buildColorCardSystemPrompt()
                        + "\n请仔细阅读这张物料色卡/面料吊牌图片，按下方 JSON 格式返回识别结果。";
                aiRaw = inferenceOrchestrator.chatWithVision(imageUrl, visionPrompt);
                log.info("[ColorCardRecognize] Vision识别完成, 结果长度={}",
                        aiRaw == null ? 0 : aiRaw.length());
            } else {
                // 降级：文本模式（效果有限，但仍可返回提示）
                log.warn("[ColorCardRecognize] Agnes Vision 未配置或不可用");
                result.setErrorMessage("视觉识别未配置，请手动输入信息");
                return result;
            }
        } catch (Exception e) {
            log.warn("[ColorCardRecognize] AI调用异常: {}", e.getMessage());
            result.setErrorMessage("识别服务暂时不可用，请稍后重试或手动输入");
            return result;
        }

        // 2. 解析 AI 返回的 JSON 为结构化结果
        parseAiResultToFields(aiRaw, result);

        if (!result.isSuccess()) {
            result.setErrorMessage("未能从图片中识别出物料信息，请换一张清晰的图片或手动输入");
        }
        log.info("[ColorCardRecognize] 完成 success={} overallConfidence={}",
                result.isSuccess(), result.getOverallConfidence());
        return result;
    }

    /** 色卡识别系统提示词（中文，明确字段含义 + JSON 模板） */
    private String buildColorCardSystemPrompt() {
        return "你是一名面料行业专家，负责识别物料色卡/吊牌信息。"
                + "请从图片中提取以下字段，按如下 JSON 格式严格返回（不要输出额外文字或 markdown 代码块）：\n"
                + "{\n"
                + "  \"overallConfidence\": 0-100（整体识别置信度）,\n"
                + "  \"aiHint\": \"可疑/不确定字段的提示（可空）\",\n"
                + "  \"materialName\": {\"textValue\": \"物料名称（如 60支全棉贡缎）\", \"confidence\": 0-100, \"rawText\": \"\"},\n"
                + "  \"materialType\": {\"textValue\": \"只允许 fabric/里料 或 lining/辅料 或 accessory 之一\", \"confidence\": 0-100, \"rawText\": \"\"},\n"
                + "  \"color\": {\"textValue\": \"颜色名称或编号（如 米白 / 21#）\", \"confidence\": 0-100, \"rawText\": \"\"},\n"
                + "  \"fabricWidth\": {\"textValue\": \"幅宽，含单位（如 150cm 或 58\\\"）\", \"confidence\": 0-100, \"rawText\": \"\"},\n"
                + "  \"fabricWeight\": {\"textValue\": \"克重，含单位（如 210gsm）\", \"confidence\": 0-100, \"rawText\": \"\"},\n"
                + "  \"fabricComposition\": {\"textValue\": \"成分含量（如 100%棉 或 70%棉 30%涤）\", \"confidence\": 0-100, \"rawText\": \"\"},\n"
                + "  \"specifications\": {\"textValue\": \"规格/门幅（如 150cm*200cm）\", \"confidence\": 0-100, \"rawText\": \"\"},\n"
                + "  \"unit\": {\"textValue\": \"单位（如 米/m/码/公斤/片）\", \"confidence\": 0-100, \"rawText\": \"\"},\n"
                + "  \"supplierName\": {\"textValue\": \"供应商/厂家名称\", \"confidence\": 0-100, \"rawText\": \"\"},\n"
                + "  \"unitPrice\": {\"numberValue\": 数值, \"textValue\": \"原始金额文本\", \"confidence\": 0-100, \"rawText\": \"\"},\n"
                + "  \"styleNo\": {\"textValue\": \"款号/批次号\", \"confidence\": 0-100, \"rawText\": \"\"},\n"
                + "  \"description\": {\"textValue\": \"其他描述或备注\", \"confidence\": 0-100, \"rawText\": \"\"}\n"
                + "}\n"
                + "规则：\n"
                + "1) 图片中找不到的字段不要瞎填，直接返回空字符串，confidence=0\n"
                + "2) materialType 必须是 fabric / lining / accessory 三个英文值之一\n"
                + "3) 单位统一写成中文常用表达（米、公斤、码、片等）\n"
                + "4) 数值字段请同时提供 numberValue（数值）和 textValue（原始文本）\n"
                + "5) 只返回一个合法的 JSON 对象，不要任何解释文字和代码块标签。";
    }

    /** 把 AI 返回的文本解析成结构化的识别结果字段 */
    private void parseAiResultToFields(String aiRaw, MaterialColorCardRecognitionResult result) {
        if (!StringUtils.hasText(aiRaw)) {
            return;
        }

        // 尝试提取 JSON：去掉可能的 ```json ``` 代码块
        String jsonStr = extractJson(aiRaw);
        if (!StringUtils.hasText(jsonStr)) {
            return;
        }

        try {
            JsonNode root = jsonMapper.readTree(jsonStr);
            if (root.has("overallConfidence")) {
                result.setOverallConfidence(root.get("overallConfidence").asInt());
            }
            if (root.has("aiHint") && !root.get("aiHint").isNull()) {
                result.setAiHint(root.get("aiHint").asText());
            }

            Map<String, String> textKeys = new HashMap<>();
            textKeys.put("materialName", "materialName");
            textKeys.put("materialType", "materialType");
            textKeys.put("color", "color");
            textKeys.put("fabricWidth", "fabricWidth");
            textKeys.put("fabricWeight", "fabricWeight");
            textKeys.put("fabricComposition", "fabricComposition");
            textKeys.put("specifications", "specifications");
            textKeys.put("unit", "unit");
            textKeys.put("supplierName", "supplierName");
            textKeys.put("styleNo", "styleNo");
            textKeys.put("description", "description");

            for (Map.Entry<String, String> entry : textKeys.entrySet()) {
                String key = entry.getKey();
                String fieldName = entry.getValue();
                if (root.has(key)) {
                    JsonNode node = root.get(key);
                    if (node.isObject() && node.has("textValue")) {
                        String textValue = node.get("textValue").asText();
                        int confidence = node.has("confidence") ? node.get("confidence").asInt() : 50;
                        String rawText = node.has("rawText") ? node.get("rawText").asText() : textValue;
                        if (StringUtils.hasText(textValue)) {
                            MaterialColorCardRecognitionResult.FieldValue fv =
                                    MaterialColorCardRecognitionResult.FieldValue.ofText(textValue, confidence, rawText);
                            setFieldValue(result, fieldName, fv);
                        }
                    }
                }
            }

            // 数值字段：unitPrice
            if (root.has("unitPrice")) {
                JsonNode node = root.get("unitPrice");
                if (node.isObject()) {
                    try {
                        int confidence = node.has("confidence") ? node.get("confidence").asInt() : 50;
                        String rawText = node.has("rawText") ? node.get("rawText").asText() : "";
                        String textValue = node.has("textValue") ? node.get("textValue").asText() : rawText;
                        BigDecimal numberValue = node.has("numberValue") && !node.get("numberValue").isNull()
                                ? new BigDecimal(node.get("numberValue").asText())
                                : null;
                        if (numberValue != null || StringUtils.hasText(textValue)) {
                            MaterialColorCardRecognitionResult.FieldValue fv =
                                    new MaterialColorCardRecognitionResult.FieldValue();
                            fv.setTextValue(textValue);
                            fv.setNumberValue(numberValue);
                            fv.setConfidence(confidence);
                            fv.setRawText(rawText);
                            result.setUnitPrice(fv);
                        }
                    } catch (NumberFormatException ignored) {
                        // 忽略异常，unitPrice 没识别到就留空
                    }
                }
            }

            // 至少识别到一个非空字段视为成功
            boolean hasAny = result.getMaterialName() != null
                    || result.getMaterialType() != null
                    || result.getColor() != null
                    || result.getFabricWidth() != null
                    || result.getFabricWeight() != null
                    || result.getFabricComposition() != null
                    || result.getSpecifications() != null
                    || result.getUnit() != null
                    || result.getSupplierName() != null
                    || result.getUnitPrice() != null
                    || result.getStyleNo() != null
                    || result.getDescription() != null;
            result.setSuccess(hasAny);
        } catch (Exception e) {
            log.warn("[ColorCardRecognize] 解析AI结果失败: {}", e.getMessage());
        }
    }

    /** 按字段名反射设置结果对象 */
    private static void setFieldValue(MaterialColorCardRecognitionResult result, String fieldName,
                                      MaterialColorCardRecognitionResult.FieldValue fv) {
        try {
            String setter = "set" + Character.toUpperCase(fieldName.charAt(0)) + fieldName.substring(1);
            java.lang.reflect.Method m = MaterialColorCardRecognitionResult.class.getMethod(
                    setter, MaterialColorCardRecognitionResult.FieldValue.class);
            m.invoke(result, fv);
        } catch (Exception e) {
            log.warn("[ColorCardRecognize] 无法设置字段 {}: {}", fieldName, e.getMessage());
        }
    }

    /** 从 AI 文本中提取 JSON 部分（去掉 ```json 包裹） */
    private static String extractJson(String text) {
        if (text == null) return null;
        String cleaned = text.trim();

        int start = cleaned.indexOf('{');
        int end = cleaned.lastIndexOf('}');
        if (start >= 0 && end > start) {
            return cleaned.substring(start, end + 1);
        }
        return null;
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

    /**
     * 自动同步供应商到工厂管理表
     * 当 supplierName 存在但 supplierId 为空时，查找或创建 t_factory 记录
     */
    private void syncSupplierToFactory(MaterialColorCard card) {
        if (!StringUtils.hasText(card.getSupplierName())) return;
        if (StringUtils.hasText(card.getSupplierId())) return;

        Long tenantId = card.getTenantId() != null ? card.getTenantId() : UserContext.tenantId();

        // 查找是否已存在同名供应商
        Factory existing = factoryMapper.selectOne(
            new LambdaQueryWrapper<Factory>()
                .eq(Factory::getFactoryName, card.getSupplierName().trim())
                .eq(Factory::getTenantId, tenantId)
                .eq(Factory::getSupplierType, "MATERIAL")
                .and(w -> w.isNull(Factory::getDeleteFlag).or().eq(Factory::getDeleteFlag, 0))
                .last("LIMIT 1")
        );

        if (existing != null) {
            // 已存在，回写 supplierId 和联系信息
            card.setSupplierId(existing.getId());
            if (!StringUtils.hasText(card.getSupplierContactPerson()) && StringUtils.hasText(existing.getContactPerson())) {
                card.setSupplierContactPerson(existing.getContactPerson());
            }
            if (!StringUtils.hasText(card.getSupplierContactPhone()) && StringUtils.hasText(existing.getContactPhone())) {
                card.setSupplierContactPhone(existing.getContactPhone());
            }
        } else {
            // 不存在，自动创建（带并发防御：插入后再次查询，防止重复创建）
            Factory newFactory = new Factory();
            newFactory.setId(null);
            newFactory.setFactoryName(card.getSupplierName().trim());
            newFactory.setFactoryCode("AUTO_" + System.currentTimeMillis());
            newFactory.setTenantId(tenantId);
            newFactory.setSupplierType("MATERIAL");
            newFactory.setFactoryType("EXTERNAL");
            newFactory.setContactPerson(card.getSupplierContactPerson());
            newFactory.setContactPhone(card.getSupplierContactPhone());
            newFactory.setStatus("active");
            newFactory.setDeleteFlag(0);
            newFactory.setCreateTime(LocalDateTime.now());
            newFactory.setUpdateTime(LocalDateTime.now());
            factoryMapper.insert(newFactory);

            // 并发防御：插入后再次查询，确保不会重复创建
            Factory afterInsert = factoryMapper.selectOne(
                new LambdaQueryWrapper<Factory>()
                    .eq(Factory::getFactoryName, card.getSupplierName().trim())
                    .eq(Factory::getTenantId, tenantId)
                    .eq(Factory::getSupplierType, "MATERIAL")
                    .and(w -> w.isNull(Factory::getDeleteFlag).or().eq(Factory::getDeleteFlag, 0))
                    .last("LIMIT 1")
            );
            card.setSupplierId(afterInsert != null ? afterInsert.getId() : newFactory.getId());
        }
    }

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
