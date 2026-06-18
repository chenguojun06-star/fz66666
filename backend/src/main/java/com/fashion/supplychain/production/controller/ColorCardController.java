package com.fashion.supplychain.production.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.production.entity.ColorCard;
import com.fashion.supplychain.production.entity.ColorCardItem;
import com.fashion.supplychain.production.orchestration.ColorCardOrchestrator;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
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
 * 色卡本管理 API —— 母子关系色卡
 * 母卡: 共享基础信息(供应商、幅宽、规格、成分等)
 * 子卡: 具体颜色条目(颜色编号、颜色名称、单价、图片)
 */
@RestController
@RequestMapping("/api/color-card")
@PreAuthorize("isAuthenticated()")
public class ColorCardController {

    @Autowired
    private ColorCardOrchestrator colorCardOrchestrator;

    // ==================== 色卡本 CRUD ====================

    @GetMapping("/list")
    public Result<IPage<ColorCard>> list(
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String materialType,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize) {
        return Result.success(colorCardOrchestrator.listCards(keyword, materialType, page, pageSize));
    }

    @GetMapping("/{id}")
    public Result<ColorCardOrchestrator.ColorCardWithItems> getDetail(@PathVariable String id) {
        return Result.success(colorCardOrchestrator.getCardDetail(id));
    }

    @PostMapping
    public Result<String> create(@RequestBody ColorCard card) {
        return Result.success(colorCardOrchestrator.saveCard(card));
    }

    @PutMapping
    public Result<Boolean> update(@RequestBody ColorCard card) {
        return Result.success(colorCardOrchestrator.updateCard(card));
    }

    @DeleteMapping("/{id}")
    public Result<Boolean> delete(@PathVariable String id) {
        return Result.success(colorCardOrchestrator.deleteCard(id));
    }

    // ==================== 颜色条目 CRUD ====================

    @PostMapping("/{cardId}/items/batch")
    public Result<Boolean> saveItemsBatch(
            @PathVariable String cardId,
            @RequestBody Map<String, List<ColorCardItem>> body) {
        List<ColorCardItem> items = body.get("items");
        return Result.success(colorCardOrchestrator.saveItems(cardId, items));
    }

    @PostMapping("/{cardId}/items")
    public Result<String> addItem(@PathVariable String cardId, @RequestBody ColorCardItem item) {
        return Result.success(colorCardOrchestrator.addItem(cardId, item));
    }

    @PutMapping("/items/{itemId}")
    public Result<Boolean> updateItem(@PathVariable String itemId, @RequestBody ColorCardItem item) {
        return Result.success(colorCardOrchestrator.updateItem(itemId, item));
    }

    @DeleteMapping("/items/{itemId}")
    public Result<Boolean> deleteItem(@PathVariable String itemId) {
        return Result.success(colorCardOrchestrator.deleteItem(itemId));
    }

    // ==================== 批量生成物料 ====================

    @PostMapping("/{cardId}/generate-materials")
    public Result<List<String>> generateMaterials(@PathVariable String cardId) {
        return Result.success(colorCardOrchestrator.generateMaterialsFromCard(cardId));
    }

    // ==================== 色卡本物料查询 ====================

    /**
     * 根据物料ID查询色卡本详情及全部颜色条目（一本色卡 = 一条物料，颜色为子属性）
     */
    @GetMapping("/by-material/{materialId}")
    public Result<ColorCardOrchestrator.ColorCardWithItems> getCardByMaterialId(@PathVariable String materialId) {
        return Result.success(colorCardOrchestrator.getCardDetailByMaterialId(materialId));
    }
}
