import React from 'react';
import { Card, Col, Row } from 'antd';
import SideDrawer from '@/components/common/SideDrawer';

// ===== 供应商色卡颜色详情（D-444：弹窗统一为侧滑抽屉；无图颜色按名称生成色块） =====
interface ColorItemEntry {
  id?: string | number;
  materialName?: string;
  color?: string;
  unitPrice?: number | null;
  remark?: string;
}

interface ColorItemsData {
  card?: {
    cardName?: string;
    cardCode?: string;
  };
  items?: ColorItemEntry[];
}

interface MaterialColorItemsModalProps {
  open: boolean;
  loading: boolean;
  data: ColorItemsData | null;
  onCancel: () => void;
}

/** D-444：常见色名 → 色值映射（无图时生成色块填充图片区） */
const COLOR_NAME_HEX: Record<string, string> = {
  白色: '#ffffff', 米白: '#f5f0e6', 米色: '#f5f0e6', 本白: '#f2f0eb',
  黑色: '#1d1d1f', 灰色: '#9e9e9e', 深灰: '#555555', 浅灰: '#c7c7c7',
  红色: '#e53935', 大红: '#c62828', 枣红: '#8b1e2d', 酒红: '#7b2331', 粉红: '#f48fb1', 粉色: '#f48fb1', 豆沙粉: '#d8a0a6',
  橙色: '#fb8c00', 橘色: '#fb8c00', 姜黄: '#e0a010', 黄色: '#fdd835', 米黄: '#f0e0b6', 杏色: '#fbe8d3',
  绿色: '#43a047', 浅绿: '#a5d6a7', 深绿: '#1b5e20', 草绿: '#7cb342', 军绿: '#556b2f', 墨绿: '#004d40', 豆绿: '#a2c08a', 苹果绿: '#8bc34a', 青绿: '#26a69a', 薄荷绿: '#a7e8d0',
  蓝色: '#1e88e5', 浅蓝: '#90caf9', 深蓝: '#1565c0', 藏青: '#1a2a52', 宝蓝: '#283593', 天蓝: '#81d4fa', 雾霾蓝: '#8fa8c8', 克莱因蓝: '#002fa7',
  紫色: '#7e57c2', 浅紫: '#b39ddb', 深紫: '#4527a0', 香芋紫: '#b9a0c9',
  棕色: '#795548', 咖啡: '#6d4c41', 卡其: '#bda57a', 驼色: '#c19a6b', 焦糖: '#a3652c', 褐色: '#795548',
  银灰: '#c0c0c8', 金色: '#d4af37', 银色: '#c0c0c0', 香槟金: '#d8c29d',
};

/** D-444：色名 → 色值：精确匹配 → 包含匹配 → 名称哈希兜底生成稳定色（供色卡相关组件共用） */
export function colorNameToHex(name?: string): string | null {
  const n = String(name || '').trim();
  if (!n) return null;
  if (COLOR_NAME_HEX[n]) return COLOR_NAME_HEX[n];
  for (const [k, v] of Object.entries(COLOR_NAME_HEX)) {
    if (n.includes(k)) return v;
  }
  // 哈希兜底：同名永远同色（低饱和马卡龙区，不会刺眼）
  let hash = 0;
  for (let i = 0; i < n.length; i++) hash = (hash * 31 + n.charCodeAt(i)) >>> 0;
  const hue = hash % 360;
  return `hsl(${hue}, 42%, 68%)`;
}

const MaterialColorItemsModal: React.FC<MaterialColorItemsModalProps> = ({
  open, loading, data, onCancel,
}) => {
  return (
    <SideDrawer
      title={
        data?.card?.cardName
          ? `供应商色卡 "${data.card.cardName}" - 颜色详情`
          : '供应商色卡颜色详情'
      }
      open={open}
      onClose={onCancel}
      width="85%"
    >
      {loading && <div className="u-ta-center" style={{ padding: 20, color: 'var(--color-text-secondary)' }}>加载中...</div>}
      {!loading && data?.card && (
        <>
          <div className="u-mb-16 u-fs-13" style={{ color: 'var(--color-text-secondary)' }}>
            色卡编号：{data.card.cardCode || '-'} · 共 {Array.isArray(data.items) ? data.items.length : 0} 种颜色
          </div>
          <div className="u-d-flex u-fd-column u-gap-8">
            {Array.isArray(data.items) && data.items.map((item: ColorItemEntry, idx: number) => {
              const swatch = colorNameToHex(item.color);
              return (
                <Card key={item.id || idx} size="small" style={{ border: '1px solid var(--color-border)' }}>
                  <Row gutter={12} align="middle">
                    <Col xs={24} sm={2} style={{ fontWeight: 600, color: 'var(--color-primary)' }}>#{idx + 1}</Col>
                    <Col xs={24} sm={2}>
                      {/* D-444：无图颜色 → 按色名生成色块 */}
                      <div
                        title={item.color || ''}
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: 6,
                          background: swatch ?? 'var(--color-bg-subtle)',
                          border: '1px solid rgba(0,0,0,0.12)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 13,
                          color: swatch && ['#ffffff', '#f5f0e6', '#f2f0eb', '#fbe8d3', '#f0e0b6', '#a7e8d0', '#d8c29d', '#c0c0c8', '#f48fb1', '#90caf9', '#81d4fa', '#b39ddb', '#a5d6a7', '#c7c7c7'].includes(swatch) ? '#1d1d1f' : '#ffffff',
                        }}
                      >
                        {(item.color || '?').slice(0, 1)}
                      </div>
                    </Col>
                    <Col xs={24} sm={4}>颜色：{item.color || '-'}</Col>
                    <Col xs={24} sm={5}>物料：{item.materialName || '-'}</Col>
                    <Col xs={24} sm={5}>
                      {item.unitPrice != null && item.unitPrice !== undefined ? `单价：${item.unitPrice} 元` : '-'}
                    </Col>
                    <Col xs={24} sm={6} style={{ color: 'var(--color-text-tertiary)', fontSize: 13 }}>
                      {item.remark || ''}
                    </Col>
                  </Row>
                </Card>
              );
            })}
            {Array.isArray(data.items) && data.items.length === 0 && (
              <div className="u-ta-center" style={{ padding: 40, color: 'var(--color-text-tertiary)' }}>暂无颜色信息</div>
            )}
          </div>
        </>
      )}
    </SideDrawer>
  );
};

MaterialColorItemsModal.displayName = 'MaterialColorItemsModal';

export default MaterialColorItemsModal;
