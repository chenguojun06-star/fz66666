# 仓库库位贴打印功能实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在仓库地图页面添加库位贴打印功能，支持批量勾选库位、自由设定尺寸、自动排版打印、二维码扫码查看库存。

**Architecture:** 前端在 WarehouseLocationMap 页面新增勾选模式和打印弹窗，使用 qrcode 库生成二维码，safePrint 打印；小程序新增库位扫码页面。

**Tech Stack:** React, TypeScript, qrcode 库, Ant Design, safePrint 工具函数

---

## 文件结构

| 文件 | 负责内容 |
|------|---------|
| `frontend/src/modules/warehouse/pages/WarehouseLocationMap/index.tsx` | 新增勾选状态、打印按钮、打印弹窗调用 |
| `frontend/src/modules/warehouse/pages/WarehouseLocationMap/LocationLabelPrintModal.tsx` | 新建打印弹窗组件（尺寸设置、预览、生成HTML、打印） |
| `frontend/src/modules/warehouse/pages/WarehouseLocationMap/WarehouseLocationMap.css` | 新增勾选样式、打印按钮样式 |
| `miniprogram/pages/warehouse/location-scan/index.js` | 新建库位扫码页面逻辑 |
| `miniprogram/pages/warehouse/location-scan/index.wxml` | 新建库位扫码页面模板 |
| `miniprogram/pages/warehouse/location-scan/index.wxss` | 新建库位扫码页面样式 |
| `miniprogram/app.json` | 注册新页面 |

---

### Task 1: 前端 - 新增勾选状态和打印按钮

**Files:**
- Modify: `frontend/src/modules/warehouse/pages/WarehouseLocationMap/index.tsx`

- [ ] **Step 1: 添加勾选状态和打印按钮**

在 `WarehouseLocationMap/index.tsx` 中添加：

```typescript
// 在组件顶部添加新状态
const [selectMode, setSelectMode] = useState(false);
const [selectedLocationIds, setSelectedLocationIds] = useState<Set<string>>(new Set());

// 在库位卡片区域添加勾选逻辑
// 在 wlm-zone-tab-actions 区域添加"批量打印"按钮
```

修改 `filteredLocations` 渲染部分，添加 Checkbox：

```tsx
<div className="wlm-location-grid">
  {filteredLocations.map(location => {
    const status = getLocationStatus(location);
    const isSelected = selectedLocationIds.has(location.id);
    return (
      <Tooltip key={location.id} ...>
        <div className={`wlm-location-card ${status} ${isSelected ? 'selected' : ''}`} ...>
          {selectMode && (
            <Checkbox
              className="wlm-location-checkbox"
              checked={isSelected}
              onChange={(e) => {
                const newSet = new Set(selectedLocationIds);
                if (e.target.checked) newSet.add(location.id);
                else newSet.delete(location.id);
                setSelectedLocationIds(newSet);
              }}
            />
          )}
          {/* 原有内容 */}
        </div>
      </Tooltip>
    );
  })}
</div>
```

在 `wlm-zone-tab-actions` 区域添加按钮：

```tsx
<div className="wlm-zone-tab-actions">
  <Button
    type="link"
    size="small"
    icon={<AppstoreOutlined />}
    onClick={() => setSelectMode(!selectMode)}
  >
    {selectMode ? '取消勾选' : '批量勾选'}
  </Button>
  {selectMode && selectedLocationIds.size > 0 && (
    <Button
      type="primary"
      size="small"
      icon={<PrinterOutlined />}
      onClick={() => setPrintModalOpen(true)}
    >
      打印库位贴 ({selectedLocationIds.size})
    </Button>
  )}
  {/* 原有的新增库位、批量初始化按钮 */}
</div>
```

添加打印弹窗状态：

```typescript
const [printModalOpen, setPrintModalOpen] = useState(false);
```

- [ ] **Step 2: 添加 CSS 样式**

在 `WarehouseLocationMap.css` 中添加：

```css
.wlm-location-card.selected {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px rgba(45, 127, 249, 0.2);
}

.wlm-location-checkbox {
  position: absolute;
  top: 4px;
  left: 4px;
  z-index: 10;
}

.wlm-location-card {
  position: relative;
}
```

- [ ] **Step 3: 验证 TypeScript 编译**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors

---

### Task 2: 前端 - 新建打印弹窗组件

**Files:**
- Create: `frontend/src/modules/warehouse/pages/WarehouseLocationMap/LocationLabelPrintModal.tsx`

- [ ] **Step 1: 创建打印弹窗组件**

```tsx
import React, { useState, useMemo, useCallback } from 'react';
import { Button, InputNumber, Space, Spin, Alert, Radio } from 'antd';
import { PrinterOutlined } from '@ant-design/icons';
import QRCode from 'qrcode';
import ResizableModal from '@/components/common/ResizableModal';
import { safePrint } from '@/utils/safePrint';

interface LocationItem {
  id: string;
  locationCode: string;
  locationName: string;
  zoneName: string;
  warehouseType: string;
  areaId: string;
}

interface Props {
  open: boolean;
  locations: LocationItem[];
  areaName: string;
  onClose: () => void;
}

const PRESET_SIZES = [
  { label: '50×30mm', width: 50, height: 30 },
  { label: '80×50mm', width: 80, height: 50 },
  { label: '100×70mm', width: 100, height: 70 },
];

// A4 有效打印区域（考虑边距）
const A4_WIDTH = 190;
const A4_HEIGHT = 277;

const LocationLabelPrintModal: React.FC<Props> = ({
  open,
  locations,
  areaName,
  onClose,
}) => {
  const [width, setWidth] = useState(50);
  const [height, setHeight] = useState(30);
  const [loading, setLoading] = useState(false);

  const layout = useMemo(() => {
    const cols = Math.floor(A4_WIDTH / width);
    const rows = Math.floor(A4_HEIGHT / height);
    const perPage = cols * rows;
    const totalPages = Math.ceil(locations.length / perPage);
    return { cols, rows, perPage, totalPages };
  }, [width, height, locations.length]);

  const handlePrint = useCallback(async () => {
    if (locations.length === 0) return;
    setLoading(true);

    try {
      // 生成二维码
      const qrSize = Math.min(width, height) * 0.4; // 二维码占标签 40%
      const qrPx = Math.round(qrSize * 10); // 转换为像素（假设 10px/mm）
      
      const qrUrls: string[] = [];
      for (const loc of locations) {
        const qrContent = `LOC:${loc.locationCode}`;
        const url = await QRCode.toDataURL(qrContent, {
          width: qrPx,
          margin: 0,
          errorCorrectionLevel: 'M',
        });
        qrUrls.push(url);
      }

      // 构建打印 HTML
      const html = buildPrintHtml(locations, qrUrls, areaName, width, height, layout);
      safePrint(html);
    } catch (err) {
      console.error('[LocationLabelPrint] 打印失败:', err);
    } finally {
      setLoading(false);
    }
  }, [locations, areaName, width, height, layout]);

  return (
    <ResizableModal
      title="打印库位贴"
      open={open}
      onCancel={onClose}
      width="40vw"
      footer={[
        <Button key="close" onClick={onClose}>
          关闭
        </Button>,
        <Button
          key="print"
          type="primary"
          icon={<PrinterOutlined />}
          loading={loading}
          disabled={locations.length === 0}
          onClick={() => void handlePrint()}
        >
          确认打印
        </Button>,
      ]}
    >
      <div style={{ padding: '16px 0' }}>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 500, marginBottom: 8 }}>标签尺寸</div>
          <Space wrap align="center">
            <span style={{ color: '#555' }}>宽度</span>
            <InputNumber
              min={20}
              max={200}
              value={width}
              onChange={(v) => setWidth(v ?? 50)}
              suffix="mm"
              style={{ width: 100 }}
            />
            <span style={{ color: '#555' }}>高度</span>
            <InputNumber
              min={20}
              max={200}
              value={height}
              onChange={(v) => setHeight(v ?? 30)}
              suffix="mm"
              style={{ width: 100 }}
            />
          </Space>
          <div style={{ marginTop: 8 }}>
            <Radio.Group
              value={`${width}x${height}`}
              onChange={(e) => {
                const preset = PRESET_SIZES.find((p) => `${p.width}x${p.height}` === e.target.value);
                if (preset) {
                  setWidth(preset.width);
                  setHeight(preset.height);
                }
              }}
              size="small"
            >
              {PRESET_SIZES.map((p) => (
                <Radio.Button key={`${p.width}x${p.height}`} value={`${p.width}x${p.height}`}>
                  {p.label}
                </Radio.Button>
              ))}
            </Radio.Group>
          </div>
        </div>

        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message={
            <span>
              已选择 <strong>{locations.length}</strong> 个库位，
              每页可放 <strong>{layout.perPage}</strong> 张标签，
              共需 <strong>{layout.totalPages}</strong> 页
            </span>
          }
        />

        <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: 16, background: 'var(--color-bg-subtle)' }}>
          <div style={{ fontWeight: 500, marginBottom: 8 }}>预览效果</div>
          <div
            style={{
              width: `${width * 2}px`,
              height: `${height * 2}px`,
              border: '1px solid #333',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '4px',
              background: '#fff',
            }}
          >
            <div style={{ fontSize: 10, fontWeight: 600, marginBottom: 2 }}>{areaName}</div>
            <div style={{ fontSize: 9, color: '#666', marginBottom: 2 }}>A区-合格品</div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>A-01-1-1</div>
            <div style={{ width: 32, height: 32, background: '#f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8 }}>
              [二维码]
            </div>
          </div>
        </div>
      </div>
    </ResizableModal>
  );
};

function buildPrintHtml(
  locations: LocationItem[],
  qrUrls: string[],
  areaName: string,
  width: number,
  height: number,
  layout: { cols: number; rows: number; perPage: number; totalPages: number },
): string {
  const qrMm = Math.min(width, height) * 0.35;
  const fontSize = height >= 50 ? 12 : height >= 30 ? 10 : 8;

  // 按页面分组标签
  const pages: string[] = [];
  for (let pageIdx = 0; pageIdx < layout.totalPages; pageIdx++) {
    const start = pageIdx * layout.perPage;
    const end = Math.min(start + layout.perPage, locations.length);
    const pageLocations = locations.slice(start, end);

    const labelsHtml = pageLocations.map((loc, idx) => {
      const qrUrl = qrUrls[start + idx];
      return `
        <div class="label" style="width:${width}mm;height:${height}mm;">
          <div class="label-content">
            <div class="warehouse-name">${areaName}</div>
            <div class="zone-name">${loc.zoneName || '-'}</div>
            <div class="location-code">${loc.locationCode}</div>
            <div class="qr-container">
              <img src="${qrUrl}" style="width:${qrMm}mm;height:${qrMm}mm;" />
            </div>
          </div>
        </div>
      `;
    }).join('\n');

    pages.push(`
      <div class="page">
        ${labelsHtml}
      </div>
    `);
  }

  return `
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
      <meta charset="UTF-8">
      <title>库位贴打印</title>
      <style>
        @page { size: A4; margin: 10mm; }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: "PingFang SC", "Microsoft YaHei", "Noto Sans SC", system-ui, sans-serif; color: #000; background: #fff; }
        .page { width: 190mm; height: 277mm; display: grid; grid-template-columns: repeat(${layout.cols}, ${width}mm); grid-template-rows: repeat(${layout.rows}, ${height}mm); gap: 0; page-break-after: always; }
        .page:last-child { page-break-after: auto; }
        .label { border: 0.5pt solid #333; display: flex; align-items: center; justify-content: center; padding: 1mm; }
        .label-content { display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%; height: 100%; }
        .warehouse-name { font-size: ${fontSize - 2}pt; color: #666; margin-bottom: 0.5mm; }
        .zone-name { font-size: ${fontSize - 1}pt; color: #888; margin-bottom: 0.5mm; }
        .location-code { font-size: ${fontSize + 2}pt; font-weight: 700; margin-bottom: 1mm; }
        .qr-container { display: flex; align-items: center; justify-content: center; }
        @media print { body { background: #fff; } }
      </style>
    </head>
    <body>
      ${pages.join('\n')}
    </body>
    </html>
  `;
}

export default LocationLabelPrintModal;
```

- [ ] **Step 2: 在主页面引入打印弹窗**

在 `WarehouseLocationMap/index.tsx` 中：

```tsx
// 添加 import
import LocationLabelPrintModal from './LocationLabelPrintModal';

// 在组件末尾添加弹窗
<LocationLabelPrintModal
  open={printModalOpen}
  locations={locations.filter(l => selectedLocationIds.has(l.id))}
  areaName={selectedArea?.areaName || ''}
  onClose={() => setPrintModalOpen(false)}
/>
```

- [ ] **Step 3: 验证 TypeScript 编译**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors

---

### Task 3: 前端 - 支持扫码跳转定位

**Files:**
- Modify: `frontend/src/modules/warehouse/pages/WarehouseLocationMap/index.tsx`

- [ ] **Step 1: 添加 URL 参数解析和自动定位**

```tsx
import { useSearchParams } from 'react-router-dom';

// 在组件顶部
const [searchParams] = useSearchParams();
const locationCodeFromUrl = searchParams.get('locationCode');

// 在 useEffect 中处理 URL 参数
useEffect(() => {
  if (locationCodeFromUrl && locations.length > 0) {
    const targetLocation = locations.find(l => l.locationCode === locationCodeFromUrl);
    if (targetLocation) {
      // 自动定位到该库位所在的区域和库区
      setSelectedZoneName(targetLocation.zoneName || '');
      // 自动弹出详情
      handleLocationClick(targetLocation);
    }
  }
}, [locationCodeFromUrl, locations]);
```

- [ ] **Step 2: 验证 TypeScript 编译**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors

---

### Task 4: 小程序 - 新建库位扫码页面

**Files:**
- Create: `miniprogram/pages/warehouse/location-scan/index.js`
- Create: `miniprogram/pages/warehouse/location-scan/index.wxml`
- Create: `miniprogram/pages/warehouse/location-scan/index.wxss`
- Modify: `miniprogram/app.json`

- [ ] **Step 1: 创建页面逻辑文件**

```javascript
// miniprogram/pages/warehouse/location-scan/index.js
const app = getApp();
const api = require('../../../utils/api');

Page({
  data: {
    loading: false,
    locationCode: '',
    locationInfo: null,
    items: [],
    error: '',
  },

  onLoad(options) {
    // 从扫码结果获取库位编码
    const scanResult = options.q || options.result || '';
    if (scanResult.startsWith('LOC:')) {
      const locationCode = scanResult.substring(4);
      this.setData({ locationCode });
      this.loadLocationItems(locationCode);
    } else {
      this.setData({ error: '无效的库位二维码' });
    }
  },

  async loadLocationItems(locationCode) {
    this.setData({ loading: true, error: '' });
    try {
      const res = await api.get('/warehouse/location/items', { locationCode });
      const data = res?.data?.data || res?.data || {};
      this.setData({
        locationInfo: {
          locationCode: data.locationCode || locationCode,
          locationName: data.locationName || '',
          zoneName: data.zoneName || '',
          warehouseTypeLabel: data.warehouseTypeLabel || '',
          capacity: data.capacity || 0,
          usedCapacity: data.usedCapacity || 0,
        },
        items: data.items || [],
        loading: false,
      });
    } catch (err) {
      this.setData({
        error: err?.message || '加载库位库存失败',
        loading: false,
      });
    }
  },

  onRetry() {
    if (this.data.locationCode) {
      this.loadLocationItems(this.data.locationCode);
    }
  },
});
```

- [ ] **Step 2: 创建页面模板文件**

```xml
<!-- miniprogram/pages/warehouse/location-scan/index.wxml -->
<view class="location-scan-page">
  <view class="header">
    <view class="location-code">{{locationInfo.locationCode || locationCode}}</view>
    <view class="zone-name" wx:if="{{locationInfo.zoneName}}">{{locationInfo.zoneName}}</view>
  </view>

  <view wx:if="{{loading}}" class="loading-container">
    <text>加载中...</text>
  </view>

  <view wx:if="{{error}}" class="error-container">
    <text>{{error}}</text>
    <button size="mini" bindtap="onRetry">重试</button>
  </view>

  <view wx:if="{{!loading && !error && locationInfo}}" class="info-card">
    <view class="info-row">
      <text class="label">仓库名称</text>
      <text class="value">{{locationInfo.warehouseTypeLabel}}</text>
    </view>
    <view class="info-row">
      <text class="label">库位名称</text>
      <text class="value">{{locationInfo.locationName || '-'}}</text>
    </view>
    <view class="info-row">
      <text class="label">容量</text>
      <text class="value">{{locationInfo.usedCapacity}}/{{locationInfo.capacity || '∞'}}</text>
    </view>
  </view>

  <view wx:if="{{!loading && !error && items.length > 0}}" class="items-list">
    <view class="list-header">
      <text>库存明细</text>
      <text class="count">{{items.length}} 件</text>
    </view>
    <view class="item-row" wx:for="{{items}}" wx:key="skuCode">
      <view class="item-main">
        <text class="style-no">{{item.styleNo || '-'}}</text>
        <view class="tags">
          <text class="tag color">{{item.color || '-'}}</text>
          <text class="tag size">{{item.size || '-'}}</text>
        </view>
      </view>
      <view class="item-qty">
        <text class="qty">{{item.stockQuantity}}</text>
      </view>
    </view>
  </view>

  <view wx:if="{{!loading && !error && items.length === 0}}" class="empty-container">
    <text>该库位暂无库存</text>
  </view>
</view>
```

- [ ] **Step 3: 创建页面样式文件**

```css
/* miniprogram/pages/warehouse/location-scan/index.wxss */
.location-scan-page {
  padding: 16px;
  background: #f5f5f5;
  min-height: 100vh;
}

.header {
  background: #fff;
  padding: 16px;
  border-radius: 8px;
  margin-bottom: 12px;
  text-align: center;
}

.location-code {
  font-size: 24px;
  font-weight: 700;
  color: #1677ff;
}

.zone-name {
  font-size: 14px;
  color: #666;
  margin-top: 4px;
}

.loading-container,
.error-container,
.empty-container {
  text-align: center;
  padding: 40px 16px;
  color: #999;
}

.error-container button {
  margin-top: 12px;
}

.info-card {
  background: #fff;
  padding: 12px 16px;
  border-radius: 8px;
  margin-bottom: 12px;
}

.info-row {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
}

.info-row .label {
  color: #666;
  font-size: 14px;
}

.info-row .value {
  color: #333;
  font-size: 14px;
  font-weight: 500;
}

.items-list {
  background: #fff;
  border-radius: 8px;
}

.list-header {
  padding: 12px 16px;
  border-bottom: 1px solid #f0f0f0;
  display: flex;
  justify-content: space-between;
}

.list-header text:first-child {
  font-weight: 500;
  color: #333;
}

.list-header .count {
  color: #1677ff;
  font-size: 14px;
}

.item-row {
  padding: 12px 16px;
  border-bottom: 1px solid #f0f0f0;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.item-row:last-child {
  border-bottom: none;
}

.item-main {
  flex: 1;
}

.style-no {
  font-size: 14px;
  font-weight: 500;
  color: #333;
}

.tags {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}

.tag {
  font-size: 12px;
  padding: 2px 6px;
  border-radius: 4px;
}

.tag.color {
  background: #e6f7ff;
  color: #1890ff;
}

.tag.size {
  background: #f0f0f0;
  color: #666;
}

.item-qty .qty {
  font-size: 16px;
  font-weight: 700;
  color: #52c41a;
}
```

- [ ] **Step 4: 在 app.json 注册页面**

在 `miniprogram/app.json` 的 `pages` 数组中添加：

```json
"pages/warehouse/location-scan/index"
```

- [ ] **Step 5: 配置扫码跳转**

在 `miniprogram/app.json` 中添加扫码配置（如果已有则更新）：

```json
"scanQrCode": {
  "pages": [
    {
      "pattern": "LOC:*",
      "page": "pages/warehouse/location-scan/index"
    }
  ]
}
```

---

### Task 5: 验证和提交

- [ ] **Step 1: 前端 TypeScript 编译验证**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 2: 后端编译验证**

Run: `cd backend && mvn clean compile -q`
Expected: BUILD SUCCESS

- [ ] **Step 3: 提交代码**

```bash
git add frontend/src/modules/warehouse/pages/WarehouseLocationMap/index.tsx frontend/src/modules/warehouse/pages/WarehouseLocationMap/LocationLabelPrintModal.tsx frontend/src/modules/warehouse/pages/WarehouseLocationMap/WarehouseLocationMap.css miniprogram/pages/warehouse/location-scan/ miniprogram/app.json docs/superpowers/specs/2026-06-03-warehouse-location-label-print-design.md docs/superpowers/plans/2026-06-03-warehouse-location-label-print.md
git commit -m "feat(warehouse): 添加库位贴打印功能

- 支持批量勾选库位打印
- 支持自由设定标签尺寸（预设50×30/80×50/100×70mm）
- 自动排版计算每页标签数量
- 二维码扫码跳转查看库位库存（PC端和小程序）
- 新增小程序库位扫码页面"
```

---

## 验证清单

- [ ] 前端勾选功能正常
- [ ] 打印弹窗尺寸输入正常
- [ ] 打印排版计算正确
- [ ] 二维码生成正确
- [ ] PC端扫码跳转正常
- [ ] 小程序扫码显示库存正常
- [ ] TypeScript 编译无错误
- [ ] 后端编译无错误