package com.fashion.supplychain.production.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.production.entity.MaterialColorCard;
import com.fashion.supplychain.production.entity.MaterialColorCardItem;
import com.fashion.supplychain.production.orchestration.MaterialColorCardOrchestrator;
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

    // ==================== 色卡 CRUD ====================

    @GetMapping("/list")
    public Result<IPage<MaterialColorCard>> list(
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String materialType,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize) {
        return Result.success(orchestrator.listCards(keyword, materialType, page, pageSize));
    }

    @GetMapping("/{id}")
    public Result<MaterialColorCardOrchestrator.CardWithItems> getDetail(@PathVariable String id) {
        return Result.success(orchestrator.getCardDetail(id));
    }

    @PostMapping
    public Result<String> create(@RequestBody MaterialColorCard card) {
        return Result.success(orchestrator.saveCard(card));
    }

    @PutMapping
    public Result<Boolean> update(@RequestBody MaterialColorCard card) {
        return Result.success(orchestrator.updateCard(card));
    }

    @DeleteMapping("/{id}")
    public Result<Boolean> delete(@PathVariable String id) {
        return Result.success(orchestrator.deleteCard(id));
    }

    // ==================== 子条目 CRUD ====================

    @PostMapping("/{cardId}/items/batch")
    public Result<Boolean> saveItemsBatch(
            @PathVariable String cardId,
            @RequestBody Map<String, List<MaterialColorCardItem>> body) {
        List<MaterialColorCardItem> items = body.get("items");
        return Result.success(orchestrator.saveItems(cardId, items));
    }

    @PostMapping("/{cardId}/items")
    public Result<String> addItem(@PathVariable String cardId, @RequestBody MaterialColorCardItem item) {
        return Result.success(orchestrator.addItem(cardId, item));
    }

    @PostMapping("/{cardId}/items/from-material/{materialId}")
    public Result<String> addItemFromMaterial(@PathVariable String cardId, @PathVariable String materialId) {
        return Result.success(orchestrator.addItemFromMaterial(cardId, materialId));
    }

    @PutMapping("/items/{itemId}")
    public Result<Boolean> updateItem(@PathVariable String itemId, @RequestBody MaterialColorCardItem item) {
        return Result.success(orchestrator.updateItem(itemId, item));
    }

    @DeleteMapping("/items/{itemId}")
    public Result<Boolean> deleteItem(@PathVariable String itemId) {
        return Result.success(orchestrator.deleteItem(itemId));
    }

    // ==================== 批量生成物料 ====================

    @PostMapping("/{cardId}/generate-materials")
    public Result<List<String>> generateMaterials(@PathVariable String cardId) {
        return Result.success(orchestrator.generateMaterialsFromCard(cardId));
    }

    // ==================== 编号生成 ====================

    @GetMapping("/generate-code")
    public Result<String> generateCode() {
        return Result.success(orchestrator.generateCardCode());
    }
}
