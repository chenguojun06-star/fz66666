package com.fashion.supplychain.production.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.production.entity.MaterialColorCard;
import com.fashion.supplychain.production.entity.MaterialColorCardItem;
import com.fashion.supplychain.production.helper.MaterialDatabaseLogAppendHelper;
import com.fashion.supplychain.production.orchestration.MaterialColorCardOrchestrator;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 物料色卡管理 API
 * 母卡(MaterialColorCard): 以供应商为维度组织物料资料
 * 子条目(MaterialColorCardItem): 具体的物料资料
 */
@RestController
@RequestMapping("/api/material-color-card")
@PreAuthorize("isAuthenticated()")
public class MaterialColorCardController {

    @Autowired
    private MaterialColorCardOrchestrator orchestrator;

    // D-444：色卡操作此前从不写操作日志——复用物料日志 Helper（模块同为"物料数据库"，
    // appendOperation 只写 t_operation_log 不查实体，传色卡 id 即可）
    @Autowired
    private MaterialDatabaseLogAppendHelper materialDatabaseLogAppendHelper;

    // ==================== 色卡 CRUD ====================

    @GetMapping("/list")
    public Result<IPage<MaterialColorCard>> list(
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String materialType,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize) {
        return Result.success(orchestrator.listCards(keyword, materialType, page, pageSize));
    }

    /** D-445/D-447：多供应商比价（锚定物料主档分级匹配：同款同色/同名同规格/同名/同成分同规格 + 色卡报价/采购成交） */
    @GetMapping("/price-comparison")
    public Result<List<Map<String, Object>>> priceComparison(@RequestParam String materialId) {
        return Result.success(orchestrator.priceComparison(materialId));
    }

    @GetMapping("/{id}")
    public Result<MaterialColorCardOrchestrator.CardWithItems> getDetail(@PathVariable String id) {
        return Result.success(orchestrator.getCardDetail(id));
    }

    /** 按物料ID反查色卡详情（物料列表"查看色卡"入口） */
    @GetMapping("/by-material/{materialId}")
    public Result<MaterialColorCardOrchestrator.CardWithItems> getDetailByMaterialId(@PathVariable String materialId) {
        return Result.success(orchestrator.getCardDetailByMaterialId(materialId));
    }

    @PostMapping
    public Result<String> create(@RequestBody MaterialColorCard card) {
        String id = orchestrator.saveCard(card);
        if (id != null) {
            materialDatabaseLogAppendHelper.appendOperation(id, "新建色卡本",
                    card.getCardName() != null ? card.getCardName() : null);
        }
        return Result.success(id);
    }

    @PutMapping("/{id}")
    public Result<Boolean> update(@PathVariable String id, @RequestBody MaterialColorCard card) {
        if (card != null) card.setId(id);
        Boolean ok = orchestrator.updateCard(card);
        if (Boolean.TRUE.equals(ok)) {
            materialDatabaseLogAppendHelper.appendOperation(id, "编辑色卡本",
                    card.getCardName() != null ? card.getCardName() : null);
        }
        return Result.success(ok);
    }

    @DeleteMapping("/{id}")
    public Result<Boolean> delete(@PathVariable String id) {
        Boolean ok = orchestrator.deleteCard(id);
        if (Boolean.TRUE.equals(ok)) {
            materialDatabaseLogAppendHelper.appendOperation(id, "删除色卡本", null);
        }
        return Result.success(ok);
    }

    // ==================== 子条目 CRUD ====================

    @PostMapping("/{cardId}/items/batch")
    public Result<Boolean> saveItemsBatch(
            @PathVariable String cardId,
            @RequestBody Map<String, List<MaterialColorCardItem>> body) {
        List<MaterialColorCardItem> items = body.get("items");
        Boolean ok = orchestrator.saveItems(cardId, items);
        if (Boolean.TRUE.equals(ok) && items != null) {
            materialDatabaseLogAppendHelper.appendOperation(cardId, "保存颜色明细", items.size() + " 条");
        }
        return Result.success(ok);
    }

    /**
     * 整卡拍照一键识别：多张色卡照片 → 多条颜色条目（布行色号 + 颜色中文名）。
     * 只识别 + 按命名规则拼装 + 与存量去重，不直接写库；
     * 前端合并列表后调 items/batch 落库（命名规则：编号 M-色号，名称 供应商-面料名-色号-颜色）。
     */
    @PostMapping("/{cardId}/recognize-entries")
    public Result<Map<String, Object>> recognizeEntries(
            @PathVariable String cardId,
            @RequestBody(required = false) Map<String, Object> body) {
        List<String> imageUrls = new ArrayList<>();
        if (body != null && body.get("imageUrls") instanceof List<?> list) {
            for (Object o : list) {
                if (o != null && StringUtils.hasText(String.valueOf(o))) {
                    imageUrls.add(String.valueOf(o).trim());
                }
            }
        }
        Map<String, Object> resp = orchestrator.recognizeEntriesFromImages(cardId, imageUrls);
        int added = resp.get("items") instanceof List<?> items ? items.size() : 0;
        if (added > 0) {
            materialDatabaseLogAppendHelper.appendOperation(cardId, "拍照识别色卡", added + " 条颜色");
        }
        return Result.success(resp);
    }

    @PostMapping("/{cardId}/items")
    public Result<String> addItem(@PathVariable String cardId, @RequestBody MaterialColorCardItem item) {
        String itemId = orchestrator.addItem(cardId, item);
        if (itemId != null) {
            materialDatabaseLogAppendHelper.appendOperation(cardId, "新增颜色明细",
                    item.getMaterialName() != null ? item.getMaterialName() : null);
        }
        return Result.success(itemId);
    }

    @PostMapping("/{cardId}/items/from-material/{materialId}")
    public Result<String> addItemFromMaterial(@PathVariable String cardId, @PathVariable String materialId) {
        String itemId = orchestrator.addItemFromMaterial(cardId, materialId);
        if (itemId != null) {
            materialDatabaseLogAppendHelper.appendOperation(cardId, "从物料加入色卡", materialId);
        }
        return Result.success(itemId);
    }

    @PutMapping("/items/{itemId}")
    public Result<Boolean> updateItem(@PathVariable String itemId, @RequestBody MaterialColorCardItem item) {
        Boolean ok = orchestrator.updateItem(itemId, item);
        if (Boolean.TRUE.equals(ok)) {
            materialDatabaseLogAppendHelper.appendOperation(itemId, "更新颜色明细",
                    item.getMaterialName() != null ? item.getMaterialName() : null);
        }
        return Result.success(ok);
    }

    @DeleteMapping("/items/{itemId}")
    public Result<Boolean> deleteItem(@PathVariable String itemId) {
        Boolean ok = orchestrator.deleteItem(itemId);
        if (Boolean.TRUE.equals(ok)) {
            materialDatabaseLogAppendHelper.appendOperation(itemId, "删除颜色明细", null);
        }
        return Result.success(ok);
    }

    // ==================== 批量生成物料 ====================

    @PostMapping("/{cardId}/generate-materials")
    public Result<List<String>> generateMaterials(@PathVariable String cardId) {
        List<String> ids = orchestrator.generateMaterialsFromCard(cardId);
        if (ids != null && !ids.isEmpty()) {
            materialDatabaseLogAppendHelper.appendOperation(cardId, "从色卡生成物料", ids.size() + " 个");
        }
        return Result.success(ids);
    }

    // ==================== 编号生成 ====================

    @GetMapping("/generate-code")
    public Result<String> generateCode() {
        return Result.success(orchestrator.generateCardCode());
    }
}
