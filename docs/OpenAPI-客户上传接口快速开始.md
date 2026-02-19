# OpenAPI 客户上传接口快速开始

## 适用场景
- 你们给客户开通账号（appKey/appSecret）后，客户可直接调用上传接口导入数据。
- 目标是“简单、可批量、失败可定位”。

## 鉴权方式（统一）
- Header 必填：
  - `X-App-Key`: 应用 Key
  - `X-Timestamp`: 当前秒级时间戳
  - `X-Signature`: `HMAC-SHA256(appSecret, timestamp + requestBody)`

## 接口 1：批量上传订单
- 地址：`POST /openapi/v1/order/upload`
- 应用类型：`ORDER_SYNC`
- Body：
```json
{
  "strict": false,
  "orders": [
    {
      "styleNo": "FZ2024001",
      "company": "客户A",
      "quantity": 500,
      "colors": ["黑色"],
      "sizes": ["M"],
      "expectedShipDate": "2026-03-15",
      "remarks": "初始化导入"
    }
  ]
}
```
- 返回重点字段：
  - `total`
  - `successCount`
  - `failedCount`
  - `failedRecords`（含 `index` 与错误原因）

## 接口 2：批量上传面辅料采购
- 地址：`POST /openapi/v1/material/purchase/upload`
- 应用类型：`MATERIAL_SUPPLY`
- Body：
```json
{
  "strict": false,
  "materialPurchases": [
    {
      "orderNo": "PO202602140001",
      "materialCode": "MAT001",
      "materialName": "面料A",
      "materialType": "FABRIC",
      "specifications": "180g",
      "unit": "米",
      "purchaseQuantity": 200,
      "arrivedQuantity": 0,
      "unitPrice": 12.5,
      "supplierName": "供应商A",
      "expectedArrivalDate": "2026-03-01",
      "remark": "初始化导入"
    }
  ]
}
```

## strict 模式说明
- `strict=false`：部分失败不回滚，返回失败明细（推荐客户初次导入使用）。
- `strict=true`：任意一条失败即整批失败（推荐正式批量入库前使用）。

## 客户最简调用流程
1. 你们开通应用并给客户 `appKey/appSecret`。
2. 客户按模板整理数据（先小批量 5-20 条测试）。
3. 先调 `strict=false` 修正错误。
4. 正式导入时再用 `strict=true`。

## 推荐配套模板
- [docs/onboarding-templates/02_orders.csv](docs/onboarding-templates/02_orders.csv)
- [docs/onboarding-templates/03_material_purchase.csv](docs/onboarding-templates/03_material_purchase.csv)
- 本地校验脚本：`python3 scripts/customer_onboarding_validate.py --dir docs/onboarding-templates`
