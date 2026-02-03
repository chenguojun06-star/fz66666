# 全站代码质量审查报告

**审查日期**: 2026-02-03
**审查范围**: 前端 + 后端
**审查工具**: 自动化脚本

---

## 📊 审查概览


### 1. 代码重复问题

#### 前端重复代码
```
发现相似组件名: 9 个
超大文件(>1000行): 11 个
```

#### 后端重复代码
```
/Users/guojunmini4/Documents/服装66666/backend/src/main/java/com/fashion/supplychain/config/DataInitializer.java 2624
/Users/guojunmini4/Documents/服装66666/backend/src/main/java/com/fashion/supplychain/production/orchestration/ScanRecordOrchestrator.java 1891
/Users/guojunmini4/Documents/服装66666/backend/src/main/java/com/fashion/supplychain/production/service/ProductionOrderQueryService.java 1738
/Users/guojunmini4/Documents/服装66666/backend/src/main/java/com/fashion/supplychain/style/orchestration/StyleInfoOrchestrator.java 1114
/Users/guojunmini4/Documents/服装66666/backend/src/main/java/com/fashion/supplychain/production/service/impl/ProductWarehousingServiceImpl.java 1101
/Users/guojunmini4/Documents/服装66666/backend/src/main/java/com/fashion/supplychain/production/service/impl/MaterialPurchaseServiceImpl.java 1074
/Users/guojunmini4/Documents/服装66666/backend/src/main/java/com/fashion/supplychain/production/orchestration/ProductionOrderOrchestrator.java 1046
- Finding files
Processed 283 files (1.6s) (61 warnings)

✔ No circular dependency found!

npm notice
npm notice New minor version of npm available! 11.7.0 -> 11.8.0
npm notice Changelog: https://github.com/npm/cli/releases/tag/v11.8.0
npm notice To update run: npm install -g npm@11.8.0
npm notice
/Users/guojunmini4/Documents/服装66666/frontend/src/components/common/NodeDetailModal.tsx:     1171 行
/Users/guojunmini4/Documents/服装66666/frontend/src/modules/basic/pages/StyleInfo/components/StyleBomTab.tsx:     1742 行
/Users/guojunmini4/Documents/服装66666/frontend/src/modules/basic/pages/TemplateCenter/index.tsx:     1694 行
/Users/guojunmini4/Documents/服装66666/frontend/src/modules/basic/pages/OrderManagement/index.tsx:     1785 行
/Users/guojunmini4/Documents/服装66666/frontend/src/modules/system/pages/System/UserList/index.tsx:     1079 行
/Users/guojunmini4/Documents/服装66666/frontend/src/modules/production/pages/Production/MaterialPurchase/index.tsx:     1336 行
/Users/guojunmini4/Documents/服装66666/frontend/src/modules/production/pages/Production/PatternProduction/index.tsx:     1204 行
/Users/guojunmini4/Documents/服装66666/frontend/src/modules/production/pages/Production/ProgressDetail/index.tsx:     1781 行
/Users/guojunmini4/Documents/服装66666/frontend/src/modules/warehouse/pages/MaterialInventory/index.tsx:     1359 行
console.log 残留: 0 处
/Users/guojunmini4/Documents/服装66666/backend/src/main/java/com/fashion/supplychain/config/DataInitializer.java:203-391:188 lines
/Users/guojunmini4/Documents/服装66666/backend/src/main/java/com/fashion/supplychain/config/DataInitializer.java:203-393:190 lines
/Users/guojunmini4/Documents/服装66666/backend/src/main/java/com/fashion/supplychain/config/DataInitializer.java:203-397:194 lines
/Users/guojunmini4/Documents/服装66666/backend/src/main/java/com/fashion/supplychain/config/DataInitializer.java:203-399:196 lines
/Users/guojunmini4/Documents/服装66666/backend/src/main/java/com/fashion/supplychain/config/DataInitializer.java:203-403:200 lines
/Users/guojunmini4/Documents/服装66666/backend/src/main/java/com/fashion/supplychain/config/DataInitializer.java:203-405:202 lines
/Users/guojunmini4/Documents/服装66666/backend/src/main/java/com/fashion/supplychain/config/DataInitializer.java:203-406:203 lines
/Users/guojunmini4/Documents/服装66666/backend/src/main/java/com/fashion/supplychain/config/DataInitializer.java:581-692:111 lines
/Users/guojunmini4/Documents/服装66666/backend/src/main/java/com/fashion/supplychain/config/DataInitializer.java:581-694:113 lines
/Users/guojunmini4/Documents/服装66666/backend/src/main/java/com/fashion/supplychain/config/DataInitializer.java:581-698:117 lines
