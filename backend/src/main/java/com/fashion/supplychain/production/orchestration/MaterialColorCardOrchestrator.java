package com.fashion.supplychain.production.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.orchestration.IntelligenceInferenceOrchestrator;
import com.fashion.supplychain.production.dto.MaterialColorCardRecognitionResult;
import com.fashion.supplychain.production.entity.MaterialColorCard;
import com.fashion.supplychain.production.entity.MaterialColorCardItem;
import com.fashion.supplychain.production.entity.MaterialDatabase;
import com.fashion.supplychain.production.entity.MaterialPurchase;
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
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Set;
import java.util.UUID;
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

    /** D-454：整卡多色识别输出配额（实测 42 个条目 reasoning+正文需约 3200 tokens，留足余量） */
    private static final int VISION_ENTRIES_MAX_TOKENS = 8192;

    @Autowired
    private MaterialColorCardMapper cardMapper;

    @Autowired
    private MaterialColorCardItemMapper itemMapper;

    @Autowired
    private MaterialDatabaseService materialDatabaseService;

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

    /** 按物料ID反查色卡详情（物料由色卡生成时回写了 materialId 关联） */
    public CardWithItems getCardDetailByMaterialId(String materialId) {
        if (!StringUtils.hasText(materialId)) throw new IllegalArgumentException("materialId不能为空");
        Long tenantId = UserContext.tenantId();
        List<MaterialColorCardItem> matches = itemMapper.selectList(
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<MaterialColorCardItem>()
                        .eq(MaterialColorCardItem::getMaterialId, materialId.trim())
                        .eq(MaterialColorCardItem::getTenantId, tenantId)
                        .and(w -> w.isNull(MaterialColorCardItem::getDeleteFlag).or().eq(MaterialColorCardItem::getDeleteFlag, 0))
                        .orderByDesc(MaterialColorCardItem::getUpdateTime)
                        .last("LIMIT 1"));
        if (matches == null || matches.isEmpty()) {
            throw new NoSuchElementException("该物料未关联色卡");
        }
        MaterialColorCard card = getCardById(matches.get(0).getMaterialColorCardId());
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
        // D-363d：逻辑删除空操作修复
        cardMapper.deleteById(current.getId());
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
    @Transactional(rollbackFor = Exception.class)
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
        // D-363d：逻辑删除空操作修复
        itemMapper.deleteById(itemId);

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

    // ==================== 整卡拍照：多色号条目一键识别 ====================

    /**
     * 整卡拍照识别：一张/多张色卡照片 → 多个颜色条目（布行色号 + 颜色中文名）。
     *
     * 命名规则（与业务约定，所有字段前端仍可手动编辑）：
     *   物料编号 = 类型抬头（面料 M / 里料 L / 辅料 F）+ "-" + 布行色号，如 M-A01；
     *              色号缺失时用 M-01 顺序号；卡内编号冲突自动追加 -2/-3 保证唯一。
     *   物料名称 = 供应商(布行抬头)-面料名(内部抬头)-色号原文-颜色中文名（缺啥跳啥），如 经典时尚-真丝双绉-A01-红色。
     *
     * 本方法只做识别 + 拼装 + 与存量条目去重，不写库；
     * 前端"一键生成"拿到结果后合并列表调 items/batch 落库（事务短，避免长事务包住慢速视觉调用）。
     */
    public Map<String, Object> recognizeEntriesFromImages(String cardId, List<String> imageUrls) {
        MaterialColorCard card = getCardById(cardId);
        Map<String, Object> result = new LinkedHashMap<>();
        List<MaterialColorCardItem> newItems = new ArrayList<>();
        List<String> failedImages = new ArrayList<>();
        int duplicated = 0;

        if (imageUrls == null || imageUrls.isEmpty()) {
            throw new IllegalArgumentException("请先上传色卡照片");
        }

        // 存量条目：去重基线 + 编号唯一基线（限定本租户本卡）
        List<MaterialColorCardItem> existing = itemMapper.selectByCardId(cardId, card.getTenantId());
        Set<String> existKeys = new HashSet<>();
        Set<String> usedCodes = new HashSet<>();
        for (MaterialColorCardItem it : existing) {
            existKeys.add(dedupKey(it.getColor(), extractColorCodeFromMaterialCode(it.getMaterialCode())));
            if (StringUtils.hasText(it.getMaterialCode())) {
                usedCodes.add(it.getMaterialCode().trim().toUpperCase());
            }
        }
        Set<String> batchKeys = new HashSet<>();
        int autoSeq = existing.size();

        for (String rawUrl : imageUrls) {
            if (!StringUtils.hasText(rawUrl)) continue;
            String imageUrl = rawUrl.trim();
            try {
                String aiRaw;
                if (inferenceOrchestrator != null && inferenceOrchestrator.isVisionEnabled()) {
                    // D-454：推理模型思考+大 JSON 输出，默认配额会 content 为空，整卡识别给 8192
                    aiRaw = inferenceOrchestrator.chatWithVision(imageUrl, buildColorCardEntriesPrompt(),
                            VISION_ENTRIES_MAX_TOKENS);
                } else {
                    log.warn("[ColorCardEntries] 视觉识别未配置");
                    failedImages.add(imageUrl);
                    continue;
                }
                JsonNode root = parseJsonObject(aiRaw);
                if (root == null) {
                    log.warn("[ColorCardEntries] AI 返回无法解析为JSON imageUrl={} rawHead={}",
                            imageUrl, aiRaw == null ? "<null>"
                                    : aiRaw.substring(0, Math.min(200, aiRaw.length())));
                    failedImages.add(imageUrl);
                    continue;
                }
                String sharedName = textAt(root, "materialName");
                String sharedType = normalizeType(textAt(root, "materialType"), card.getMaterialType());
                String sharedWidth = textAt(root, "fabricWidth");
                String sharedWeight = textAt(root, "fabricWeight");
                String sharedComposition = textAt(root, "fabricComposition");
                String sharedUnit = textAt(root, "unit");

                JsonNode entries = root.get("entries");
                if (entries == null || !entries.isArray() || entries.isEmpty()) {
                    log.warn("[ColorCardEntries] entries 为空 imageUrl={} rawHead={}",
                            imageUrl, aiRaw.substring(0, Math.min(200, aiRaw.length())));
                    failedImages.add(imageUrl);
                    continue;
                }
                for (JsonNode en : entries) {
                    String colorName = textAt(en, "colorName");
                    String colorCodeRaw = textAt(en, "colorCode");
                    if (!StringUtils.hasText(colorName) && !StringUtils.hasText(colorCodeRaw)) continue;

                    String entryMaterialName = StringUtils.hasText(textAt(en, "materialName"))
                            ? textAt(en, "materialName") : sharedName;
                    String codePart = sanitizeCodePart(colorCodeRaw);
                    String key = dedupKey(colorName, codePart);
                    if (existKeys.contains(key) || batchKeys.contains(key)) {
                        duplicated++;
                        continue;
                    }
                    batchKeys.add(key);

                    String prefix = typePrefix(sharedType);
                    if (!StringUtils.hasText(codePart)) codePart = String.format("%02d", ++autoSeq);
                    String code = uniqueCode(prefix + "-" + codePart, usedCodes);

                    MaterialColorCardItem item = new MaterialColorCardItem();
                    item.setMaterialCode(code);
                    // 名称 = 供应商(布行抬头)-面料名(内部抬头)-色号-颜色，如 经典时尚-真丝双绉-A01-红色
                    item.setMaterialName(joinParts(card.getSupplierName(), entryMaterialName, colorCodeRaw, colorName));
                    item.setMaterialType(sharedType);
                    item.setColor(colorName);
                    item.setFabricWidth(sharedWidth);
                    item.setFabricWeight(sharedWeight);
                    item.setFabricComposition(sharedComposition);
                    item.setUnit(sharedUnit);
                    item.setImage(imageUrl);
                    BigDecimal price = parsePriceNode(en.get("unitPrice"));
                    if (price != null) item.setUnitPrice(price);
                    item.setRemark("AI拍照识别生成，请核对");
                    newItems.add(item);
                }
            } catch (Exception e) {
                log.warn("[ColorCardEntries] 识别失败 imageUrl={} err={}", imageUrl, e.getMessage());
                failedImages.add(imageUrl);
            }
        }

        result.put("items", newItems);
        result.put("added", newItems.size());
        result.put("duplicated", duplicated);
        result.put("failedImages", failedImages);
        // D-454：把视觉侧真实失败原因（如思考token耗尽配额）带给前端，不再笼统提示"图片不清晰"
        if (!failedImages.isEmpty() && inferenceOrchestrator != null
                && StringUtils.hasText(inferenceOrchestrator.getLastVisionError())) {
            result.put("visionError", inferenceOrchestrator.getLastVisionError());
        }
        log.info("[ColorCardEntries] cardId={} added={} duplicated={} failed={}",
                cardId, newItems.size(), duplicated, failedImages.size());
        return result;
    }

    /** 存量条目去重：从 M-A01 / F-21-2 这类编号中还原布行色号部分（剥类型抬头与冲突尾缀） */
    private String extractColorCodeFromMaterialCode(String materialCode) {
        if (!StringUtils.hasText(materialCode)) return "";
        String s = materialCode.trim().toUpperCase().replaceFirst("^[MLF]-", "");
        s = s.replaceFirst("-\\d{1,2}$", "");
        return sanitizeCodePart(s);
    }

    /**
     * 整卡多色条目录入提示词（D-454 实测迭代版）。
     * 实测样本：一页色卡按竖列排布波浪边布样，每块旁是旋转90°的竖排"色号 NN"小字，且卡上无颜色名。
     * 旧提示词未说明版式，模型漏读竖排字、误判"无颜色名标签"，故按本版式明确引导（2026-09-17 实测 41/42 准确）。
     */
    private String buildColorCardEntriesPrompt() {
        return "你是一名面料布行色卡识别专家。图片是布行色卡本/吊牌的实拍图，请仔细观察版式：\n"
                + "1) 图中通常是一页或多页色卡，每页按【竖列】排布多块布料小样（边缘呈锯齿/波浪形），每列从上到下一个颜色；\n"
                + "2) 每个小样左侧或右侧的小字是【旋转了90度的竖排文字】，格式为“色号”加编号（纯数字如 84、105，"
                + "或 A01、21#、M-12、8826 等）。请歪头逐个准确抄录编号，不得编造：确实看不清的编号 colorCode 留空；\n"
                + "3) 卡片上通常【没有印刷颜色名称】，colorName 由你直接观察布料颜色，用简洁准确的中文填写"
                + "（如：黑色、深灰、米白、宝蓝、酒红、姜黄、墨绿、豆沙粉、湖蓝、橘棕）；\n"
                + "4) 一张图可能有两页、三四十个颜色，必须全部识别不得遗漏；特别注意【最右一列和最下面一块】容易因拍摄裁切漏掉；\n"
                + "5) 自检：若色号为连续数字，返回前核对是否有跳号，发现跳号必须回到图片对应位置重新找一遍；\n"
                + "6) 排序：先左页后右页，每页从左到右分列，每列从上到下。\n"
                + "严格只返回一个合法 JSON 对象，不要输出解释文字或 markdown 代码块：\n"
                + "{\n"
                + "  \"materialName\": \"整卡通用的面料名称（如 真丝双绉），没有就留空\",\n"
                + "  \"materialType\": \"fabric 或 lining 或 accessory\",\n"
                + "  \"fabricWidth\": \"整卡通用幅宽，没有留空\",\n"
                + "  \"fabricWeight\": \"整卡通用克重，没有留空\",\n"
                + "  \"fabricComposition\": \"整卡通用成分，没有留空\",\n"
                + "  \"unit\": \"默认单位，如 米\",\n"
                + "  \"entries\": [\n"
                + "    {\"colorName\": \"该小样颜色的中文名\", \"colorCode\": \"竖排色号原文，如 84\", \"unitPrice\": 0, \"materialName\": \"\"}\n"
                + "  ]\n"
                + "}\n"
                + "某色块面料名与整卡通用名不同时才在该 entry 的 materialName 填写，否则留空；"
                + "找不到的字段一律留空，unitPrice 没有就给 0。";
    }

    private JsonNode parseJsonObject(String aiRaw) {
        String jsonStr = extractJson(aiRaw);
        if (!StringUtils.hasText(jsonStr)) return null;
        try {
            return jsonMapper.readTree(jsonStr);
        } catch (Exception e) {
            log.warn("[ColorCardEntries] 解析AI结果失败: {}", e.getMessage());
            return null;
        }
    }

    /** 兼容 AI 返回纯字符串或 {"textValue": "..."} 两种形态 */
    private String textAt(JsonNode node, String key) {
        if (node == null || !node.has(key)) return null;
        JsonNode n = node.get(key);
        if (n == null || n.isNull()) return null;
        if (n.isObject()) {
            if (n.has("textValue") && !n.get("textValue").isNull()) {
                String v = n.get("textValue").asText();
                return v == null ? null : v.trim();
            }
            return null;
        }
        String s = n.asText();
        return s == null ? null : s.trim();
    }

    private String normalizeType(String raw, String fallback) {
        String t = raw == null ? "" : raw.trim().toLowerCase();
        if (t.contains("lining") || t.contains("里")) return "lining";
        if (t.contains("access") || t.contains("辅")) return "accessory";
        if (t.equals("fabric") || t.contains("面")) return "fabric";
        if ("lining".equals(fallback) || "accessory".equals(fallback)) return fallback;
        return "fabric";
    }

    /** 类型抬头：面料 M / 里料 L / 辅料 F */
    private String typePrefix(String type) {
        return "lining".equals(type) ? "L" : "accessory".equals(type) ? "F" : "M";
    }

    /** 色号规范化：仅保留大写字母数字（编号里不能含 #、空格等） */
    private String sanitizeCodePart(String code) {
        if (!StringUtils.hasText(code)) return "";
        return code.trim().toUpperCase().replaceAll("[^A-Z0-9]", "");
    }

    /** 卡内编号唯一：冲突时追加 -2/-3... */
    private String uniqueCode(String base, Set<String> used) {
        String up = base.toUpperCase();
        if (used.add(up)) return up;
        for (int i = 2; i < 1000; i++) {
            String candidate = up + "-" + i;
            if (used.add(candidate)) return candidate;
        }
        return up + "-" + (System.currentTimeMillis() % 100000);
    }

    private String dedupKey(String colorName, String codePart) {
        String c = colorName == null ? "" : colorName.trim();
        return (StringUtils.hasText(codePart) ? codePart.toUpperCase() : "") + "|" + c;
    }

    /** 名称拼接：面料名-色号原文-颜色中文名，缺啥跳啥 */
    private String joinParts(String... parts) {
        StringBuilder sb = new StringBuilder();
        for (String p : parts) {
            if (!StringUtils.hasText(p)) continue;
            if (sb.length() > 0) sb.append("-");
            sb.append(p.trim());
        }
        return sb.length() > 0 ? sb.toString() : "未命名色卡颜色";
    }

    /** 单价格式兼容：数值 / 文本 / {numberValue,textValue} */
    private BigDecimal parsePriceNode(JsonNode node) {
        if (node == null || node.isNull()) return null;
        try {
            if (node.isObject()) {
                if (node.has("numberValue") && !node.get("numberValue").isNull()) {
                    return new BigDecimal(node.get("numberValue").asText());
                }
                if (node.has("textValue") && !node.get("textValue").isNull()) {
                    String digits = node.get("textValue").asText().replaceAll("[^\\d.]", "");
                    return StringUtils.hasText(digits) ? new BigDecimal(digits) : null;
                }
                return null;
            }
            if (node.isNumber()) return node.decimalValue();
            String digits = node.asText().replaceAll("[^\\d.]", "");
            return StringUtils.hasText(digits) ? new BigDecimal(digits) : null;
        } catch (Exception e) {
            return null;
        }
    }

    // ==================== 物料库联动 ====================

    /**
     * 从现有物料库中选择物料添加到色卡（不生成新物料）
     */
    @Transactional(rollbackFor = Exception.class)
    public String addItemFromMaterial(String cardId, String materialId) {
        MaterialColorCard card = getCardById(cardId);
        if (!StringUtils.hasText(materialId)) throw new IllegalArgumentException("materialId不能为空");
        // P1 多租户隔离：用 lambdaQuery 带 tenantId 替代 getById（前置校验）
        Long tenantId = UserContext.tenantId();
        MaterialDatabase md = materialDatabaseService.lambdaQuery()
                .eq(MaterialDatabase::getId, materialId.trim())
                .eq(MaterialDatabase::getTenantId, tenantId)
                .one();
        if (md == null) throw new NoSuchElementException("物料不存在或不属于当前租户");
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
        return generateMaterialsFromCard(cardId, null);
    }

    /**
     * D-448：从色卡批量生成物料，支持「内部抬头」命名——
     * header 有值时物料名称 = 内部抬头 + 颜色 + 颜色编号（如"东方制衣深桃粉色210"）；
     * 无 header 时保持原行为（沿用条目物料名称）。
     */
    @Transactional(rollbackFor = Exception.class)
    public List<String> generateMaterialsFromCard(String cardId, String header) {
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
            if (StringUtils.hasText(header)) {
                md.setMaterialName(header
                        + (StringUtils.hasText(item.getColor()) ? item.getColor() : "")
                        + (StringUtils.hasText(item.getMaterialCode()) ? item.getMaterialCode() : ""));
            } else {
                md.setMaterialName(item.getMaterialName());
            }
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
     *
     * 并发防御策略：
     * 1. 先查询是否存在（FOR UPDATE 行锁）
     * 2. 不存在则尝试插入（依赖数据库唯一约束 uk_factory_name_tenant_supplier_type）
     * 3. 插入失败（DuplicateKeyException）则再次查询获取已创建的供应商
     */
    private void syncSupplierToFactory(MaterialColorCard card) {
        if (!StringUtils.hasText(card.getSupplierName())) return;
        if (StringUtils.hasText(card.getSupplierId())) return;

        Long tenantId = card.getTenantId() != null ? card.getTenantId() : UserContext.tenantId();

        // 1. 先查询是否存在（FOR UPDATE 行锁，防止并发查询返回null）
        Factory existing = factoryMapper.selectOne(
            new LambdaQueryWrapper<Factory>()
                .eq(Factory::getFactoryName, card.getSupplierName().trim())
                .eq(Factory::getTenantId, tenantId)
                .eq(Factory::getSupplierType, "MATERIAL")
                .and(w -> w.isNull(Factory::getDeleteFlag).or().eq(Factory::getDeleteFlag, 0))
                .last("LIMIT 1 FOR UPDATE")
        );

        if (existing != null) {
            card.setSupplierId(existing.getId());
            if (!StringUtils.hasText(card.getSupplierContactPerson()) && StringUtils.hasText(existing.getContactPerson())) {
                card.setSupplierContactPerson(existing.getContactPerson());
            }
            if (!StringUtils.hasText(card.getSupplierContactPhone()) && StringUtils.hasText(existing.getContactPhone())) {
                card.setSupplierContactPhone(existing.getContactPhone());
            }
            return;
        }

        // 2. 不存在，尝试插入（依赖数据库唯一约束防止并发重复插入）
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

        try {
            factoryMapper.insert(newFactory);
            card.setSupplierId(newFactory.getId());
        } catch (org.springframework.dao.DuplicateKeyException e) {
            // 3. 并发插入失败（唯一约束冲突），再次查询获取已创建的供应商
            log.warn("并发创建供应商冲突，重新查询已存在的供应商: name={}, tenantId={}",
                card.getSupplierName().trim(), tenantId);
            Factory afterInsert = factoryMapper.selectOne(
                new LambdaQueryWrapper<Factory>()
                    .eq(Factory::getFactoryName, card.getSupplierName().trim())
                    .eq(Factory::getTenantId, tenantId)
                    .eq(Factory::getSupplierType, "MATERIAL")
                    .and(w -> w.isNull(Factory::getDeleteFlag).or().eq(Factory::getDeleteFlag, 0))
                    .last("LIMIT 1")
            );
            if (afterInsert != null) {
                card.setSupplierId(afterInsert.getId());
            } else {
                // 极端情况：唯一约束冲突但查询不到，抛出异常（不应发生）
                throw new IllegalStateException("供应商创建失败：并发冲突后查询不到记录");
            }
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
                } catch (NumberFormatException e) {
                    log.warn("[MaterialColorCard] 解析色卡编号序号失败: {}", e.getMessage());
                }
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

    // ==================== D-445/D-447：多供应商比价（锚定物料主档 + 分级匹配依据） ====================

    @org.springframework.beans.factory.annotation.Autowired
    private com.fashion.supplychain.production.mapper.MaterialPurchaseMapper materialPurchaseMapper;

    private static final java.util.Set<String> COLOR_WORDS = java.util.Set.of(
            "白色", "米白", "本白", "黑色", "灰色", "深灰", "浅灰", "红色", "大红", "枣红", "酒红", "粉色", "粉红", "豆沙粉",
            "橙色", "橘色", "姜黄", "黄色", "米黄", "杏色", "绿色", "浅绿", "深绿", "草绿", "军绿", "墨绿", "豆绿", "苹果绿", "青绿", "薄荷绿",
            "蓝色", "浅蓝", "深蓝", "藏青", "宝蓝", "天蓝", "雾霾蓝", "紫色", "浅紫", "深紫", "香芋紫",
            "棕色", "咖啡", "卡其", "驼色", "焦糖", "褐色", "金色", "银色", "香槟金", "银灰");

    /** 规范化物料名：去前缀编码/颜色词/分隔符，只留面料本体词（"应承-丝绒真丝-黑色" → "丝绒真丝"） */
    private String normalizeMaterialName(String name) {
        if (name == null) return "";
        String n = name.trim();
        n = n.replaceAll("^[A-Za-z]{1,4}(?=[\\u4e00-\\u9fa5])", "");
        n = n.replaceAll("^[^\\u4e00-\\u9fa5A-Za-z]*", "");
        for (String c : COLOR_WORDS) n = n.replace(c, "");
        n = n.replace("-", "").replace("—", "").replaceAll("\\s+", "").toLowerCase();
        return n;
    }

    /** 匹配依据分级：同款同色 > 同名同规格 > 同名 > 同成分同规格；否则 null（不可比，不进结果） */
    private String matchBasis(MaterialDatabase a, MaterialDatabase b, String aNorm) {
        boolean sameColor = StringUtils.hasText(a.getColor()) && a.getColor().equals(b.getColor());
        boolean sameSpec = StringUtils.hasText(a.getSpecifications()) && a.getSpecifications().equals(b.getSpecifications());
        boolean sameComp = StringUtils.hasText(a.getFabricComposition()) && a.getFabricComposition().equals(b.getFabricComposition());
        boolean sameStyle = StringUtils.hasText(a.getStyleNo()) && a.getStyleNo().equals(b.getStyleNo());
        boolean sameNormName = StringUtils.hasText(aNorm) && aNorm.equals(normalizeMaterialName(b.getMaterialName()));
        if (sameStyle && sameColor) return "同款同色";
        if (sameNormName && sameSpec) return "同名同规格";
        if (sameNormName) return "同名";
        if (sameComp && sameSpec) return "同成分同规格";
        return null;
    }

    private void addComparisonRow(List<Map<String, Object>> result, String source, String basis, String supplier,
                                  String materialName, String color, String spec, BigDecimal unitPrice,
                                  BigDecimal quantity, String refNo, String refMaterialId) {
        Map<String, Object> row = new HashMap<>();
        row.put("source", source);
        row.put("matchBasis", basis);
        row.put("supplierName", supplier);
        row.put("materialName", materialName);
        row.put("color", color);
        row.put("specifications", spec);
        row.put("unitPrice", unitPrice);
        row.put("quantity", quantity);
        row.put("refNo", refNo);
        row.put("materialId", refMaterialId);
        result.add(row);
    }

    /**
     * 多供应商比价 v2：锚定所选物料主档，寻找"同一种面料"的其他供应商行（匹配依据分级标注），
     * 再聚合各行的主档报价 / 采购成交记录 / 色卡报价。锚点自身采购史作为基线一并返回。
     */
    public List<Map<String, Object>> priceComparison(String materialId) {
        List<Map<String, Object>> result = new ArrayList<>();
        MaterialDatabase anchor = materialDatabaseService.getById(materialId);
        if (anchor == null) return result;

        String anchorNorm = normalizeMaterialName(anchor.getMaterialName());
        String core = anchorNorm.length() >= 2 ? anchorNorm.substring(0, Math.min(4, anchorNorm.length())) : "";

        Set<String> seenIds = new HashSet<>();
        List<MaterialDatabase> candidates = new ArrayList<>();
        if (StringUtils.hasText(anchor.getStyleNo())) {
            for (MaterialDatabase m : materialDatabaseService.list(new LambdaQueryWrapper<MaterialDatabase>()
                    .eq(MaterialDatabase::getStyleNo, anchor.getStyleNo()).last("LIMIT 100"))) {
                if (m.getId() != null && seenIds.add(m.getId())) candidates.add(m);
            }
        }
        if (StringUtils.hasText(core)) {
            for (MaterialDatabase m : materialDatabaseService.list(new LambdaQueryWrapper<MaterialDatabase>()
                    .like(MaterialDatabase::getMaterialName, core).last("LIMIT 100"))) {
                if (m.getId() != null && seenIds.add(m.getId())) candidates.add(m);
            }
        }
        if (StringUtils.hasText(anchor.getFabricComposition()) && StringUtils.hasText(anchor.getSpecifications())) {
            for (MaterialDatabase m : materialDatabaseService.list(new LambdaQueryWrapper<MaterialDatabase>()
                    .eq(MaterialDatabase::getFabricComposition, anchor.getFabricComposition())
                    .eq(MaterialDatabase::getSpecifications, anchor.getSpecifications())
                    .last("LIMIT 100"))) {
                if (m.getId() != null && seenIds.add(m.getId())) candidates.add(m);
            }
        }

        for (MaterialDatabase m : candidates) {
            if (m.getId() == null || m.getId().equals(materialId)) continue;
            String basis = matchBasis(anchor, m, anchorNorm);
            if (basis == null) continue;
            if (m.getUnitPrice() != null) {
                addComparisonRow(result, "主档报价", basis, m.getSupplierName(), m.getMaterialName(), m.getColor(), m.getSpecifications(), m.getUnitPrice(), null, null, m.getId());
            }
            for (MaterialPurchase p : materialPurchaseMapper.selectList(new LambdaQueryWrapper<MaterialPurchase>()
                    .eq(MaterialPurchase::getMaterialId, m.getId())
                    .isNotNull(MaterialPurchase::getUnitPrice).last("LIMIT 20"))) {
                addComparisonRow(result, "采购成交", basis, p.getSupplierName(), p.getMaterialName(), anchor.getColor(), p.getSpecifications(), p.getUnitPrice(), p.getPurchaseQuantity(), p.getPurchaseNo(), m.getId());
            }
            for (MaterialColorCardItem it : itemMapper.selectList(new LambdaQueryWrapper<MaterialColorCardItem>()
                    .eq(MaterialColorCardItem::getMaterialId, m.getId())
                    .isNotNull(MaterialColorCardItem::getUnitPrice).last("LIMIT 20"))) {
                addComparisonRow(result, "色卡报价", basis, m.getSupplierName(), it.getMaterialName(), it.getColor(), it.getSpecifications(), it.getUnitPrice(), null, null, m.getId());
            }
        }

        // 锚点自身：主档价 + 采购史（基线）
        if (anchor.getUnitPrice() != null) {
            addComparisonRow(result, "主档报价", "本物料", anchor.getSupplierName(), anchor.getMaterialName(), anchor.getColor(), anchor.getSpecifications(), anchor.getUnitPrice(), null, null, anchor.getId());
        }
        for (MaterialPurchase p : materialPurchaseMapper.selectList(new LambdaQueryWrapper<MaterialPurchase>()
                .eq(MaterialPurchase::getMaterialId, materialId)
                .isNotNull(MaterialPurchase::getUnitPrice).last("LIMIT 20"))) {
            addComparisonRow(result, "采购成交", "本物料", p.getSupplierName() != null ? p.getSupplierName() : anchor.getSupplierName(), p.getMaterialName(), anchor.getColor(), p.getSpecifications(), p.getUnitPrice(), p.getPurchaseQuantity(), p.getPurchaseNo(), materialId);
        }

        java.util.Map<String, Integer> basisOrder = java.util.Map.of(
                "本物料", -1, "同款同色", 0, "同名同规格", 1, "同名", 2, "同成分同规格", 3);
        result.sort((a, b) -> {
            int byBasis = basisOrder.getOrDefault((String) a.get("matchBasis"), 9) - basisOrder.getOrDefault((String) b.get("matchBasis"), 9);
            if (byBasis != 0) return byBasis;
            BigDecimal pa = (BigDecimal) a.get("unitPrice");
            BigDecimal pb = (BigDecimal) b.get("unitPrice");
            if (pa == null && pb == null) return 0;
            if (pa == null) return 1;
            if (pb == null) return -1;
            return pa.compareTo(pb);
        });
        return result;
    }
}
