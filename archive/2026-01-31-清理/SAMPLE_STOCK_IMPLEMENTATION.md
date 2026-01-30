# 样衣库存管理前端实现指南 (Sample Stock Frontend Guide)

> **目标**: 实现样衣的入库、查询、借出和归还功能。
> **状态**: 后端API已就绪，需前端对接。

---

## 1. 页面结构

建议在 `src/modules/warehouse/pages/SampleStock` 目录下创建以下文件：

*   `index.tsx`: 主页面（列表 + 搜索栏）
*   `components/StockTable.tsx`: 库存列表表格
*   `components/InboundModal.tsx`: 入库弹窗（新增/补充库存）
*   `components/LoanModal.tsx`: 借出弹窗
*   `components/ReturnModal.tsx`: 归还弹窗
*   `components/LoanHistoryDrawer.tsx`: 借还记录抽屉

---

## 2. 接口定义

所有接口均位于 `/api/stock/sample`：

### 2.1 分页查询
*   **URL**: `GET /api/stock/sample/page`
*   **Params**: `page`, `pageSize`, `styleNo` (模糊), `sampleType` (development/pre_production/shipment/sales)
*   **Response**: `IPage<SampleStock>`

### 2.2 样衣入库
*   **URL**: `POST /api/stock/sample/inbound`
*   **Body**:
    ```json
    {
      "styleNo": "STYLE001",
      "styleName": "Test Style",
      "color": "Red",
      "size": "M",
      "sampleType": "development",
      "quantity": 5,
      "location": "A-01",
      "imageUrl": "..."
    }
    ```
*   **逻辑**: 如果存在（款号+颜色+尺码+类型）则增加库存，否则创建新记录。

### 2.3 借出样衣
*   **URL**: `POST /api/stock/sample/loan`
*   **Body**:
    ```json
    {
      "sampleStockId": "stock_id_...",
      "borrower": "Zhang San",
      "borrowerId": "user_001",
      "quantity": 1,
      "expectedReturnDate": "2026-02-10 12:00:00",
      "remark": "For photoshoot"
    }
    ```

### 2.4 归还样衣
*   **URL**: `POST /api/stock/sample/return`
*   **Body**:
    ```json
    {
      "loanId": "loan_id_...",
      "returnQuantity": 1,
      "remark": "Returned in good condition"
    }
    ```

### 2.5 查询借还记录
*   **URL**: `GET /api/stock/sample/loan/list`
*   **Params**: `sampleStockId`
*   **Response**: `List<SampleLoan>`

---

## 3. 开发步骤

1.  **定义类型**: 在 `src/types` 或模块内定义 `SampleStock` 和 `SampleLoan` 接口。
2.  **创建列表页**: 使用 `useTablePagination` 和 `Table` 组件展示库存。
3.  **实现入库**: 创建表单弹窗，调用 `inbound` 接口。注意支持图片上传（可选）。
4.  **实现借出**: 在表格操作列添加“借出”按钮，弹窗输入借用人和数量。
5.  **实现记录与归还**:
    *   在表格操作列添加“记录”按钮，打开 Drawer 展示该样衣的所有借还记录。
    *   在 Drawer 的列表中，对于状态为 `borrowed` 的记录，显示“归还”按钮。
    *   点击“归还”，弹出确认框或简单表单（确认数量和备注），调用 `return` 接口。

---

## 4. 注意事项

*   **权限**: 建议仅仓库管理员可执行入库和归还操作。借出操作可开放给更多人，或由管理员代为操作。
*   **校验**: 借出数量不能超过（总库存 - 已借出数量）。
*   **状态显示**: 在列表页显示“在库/总数” (例如: 3/5)，其中 3 = total - loaned。
