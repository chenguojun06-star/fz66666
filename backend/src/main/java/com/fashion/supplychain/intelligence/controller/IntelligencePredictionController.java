package com.fashion.supplychain.intelligence.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.service.DeliveryPredictionService;
import com.fashion.supplychain.intelligence.service.RestockSuggestionService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/intelligence/prediction")
@PreAuthorize("isAuthenticated()")
@RequiredArgsConstructor
public class IntelligencePredictionController {

    private final DeliveryPredictionService deliveryService;
    private final RestockSuggestionService restockService;

    @GetMapping("/delivery-risks")
    public Result<?> getDeliveryRisks(@RequestParam(defaultValue = "10") int topN) {
        return Result.success(deliveryService.predictRisks(UserContext.tenantId(), topN));
    }

    @GetMapping("/restock-suggestions")
    public Result<?> getRestockSuggestions(@RequestParam(defaultValue = "10") int topN) {
        return Result.success(restockService.getSuggestions(UserContext.tenantId(), topN));
    }

    @PostMapping("/purchase-request/generate")
    public Result<GeneratePurchaseRequestResponse> generatePurchaseRequest(
            @Valid @RequestBody GeneratePurchaseRequestRequest body) {
        String requestId = "PR-" + LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMddHHmmss"))
                + "-" + UUID.randomUUID().toString().substring(0, 6).toUpperCase();
        String createdAt = LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME);

        GeneratePurchaseRequestResponse response = new GeneratePurchaseRequestResponse(
                requestId,
                body.getMaterialId(),
                body.getMaterialName(),
                body.getMaterialCode(),
                body.getQuantity(),
                body.getRemark(),
                body.getPriority(),
                createdAt
        );

        return Result.success(response);
    }

    /** 采购申请请求体 */
    public static class GeneratePurchaseRequestRequest {
        private Long materialId;
        @NotBlank(message = "物料名称不能为空")
        @Size(max = 128, message = "物料名称不能超过 128 个字符")
        private String materialName;
        @NotBlank(message = "物料编码不能为空")
        @Size(max = 64, message = "物料编码不能超过 64 个字符")
        private String materialCode;
        private Double currentStock;
        @DecimalMin(value = "0.000001", message = "采购数量必须大于 0")
        private Double quantity;
        @Size(max = 500, message = "备注不能超过 500 个字符")
        private String remark;
        private String priority;

        public Long getMaterialId() { return materialId; }
        public void setMaterialId(Long materialId) { this.materialId = materialId; }
        public String getMaterialName() { return materialName; }
        public void setMaterialName(String materialName) { this.materialName = materialName; }
        public String getMaterialCode() { return materialCode; }
        public void setMaterialCode(String materialCode) { this.materialCode = materialCode; }
        public Double getCurrentStock() { return currentStock; }
        public void setCurrentStock(Double currentStock) { this.currentStock = currentStock; }
        public Double getQuantity() { return quantity; }
        public void setQuantity(Double quantity) { this.quantity = quantity; }
        public String getRemark() { return remark; }
        public void setRemark(String remark) { this.remark = remark; }
        public String getPriority() { return priority; }
        public void setPriority(String priority) { this.priority = priority; }
    }

    /** 采购申请响应 */
    public record GeneratePurchaseRequestResponse(
            String requestId,
            Long materialId,
            String materialName,
            String materialCode,
            Double quantity,
            String remark,
            String priority,
            String createdAt
    ) {
        @Deprecated(forRemoval = false)
        public Map<String, Object> toMap() {
            return Map.of(
                    "requestId", requestId == null ? "" : requestId,
                    "materialName", materialName == null ? "" : materialName,
                    "materialCode", materialCode == null ? "" : materialCode,
                    "quantity", quantity == null ? 0 : quantity,
                    "createdAt", createdAt == null ? "" : createdAt
            );
        }
    }
}
