import React from 'react';
import { Card, Col, Modal, Row } from 'antd';

// ===== 色卡本颜色详情弹窗（从 index.tsx 抽取） =====
interface ColorItemEntry {
  id?: string | number;
  colorNo?: string;
  colorName?: string;
  unitPrice?: number | null;
  remark?: string;
}

interface ColorItemsData {
  card?: {
    colorCardName?: string;
    colorCardCode?: string;
  };
  items?: ColorItemEntry[];
}

interface MaterialColorItemsModalProps {
  open: boolean;
  loading: boolean;
  data: ColorItemsData | null;
  onCancel: () => void;
}

const MaterialColorItemsModal: React.FC<MaterialColorItemsModalProps> = ({
  open, loading, data, onCancel,
}) => {
  return (
    <Modal
      title={
        data?.card?.colorCardName
          ? `色卡本 "${data.card.colorCardName}" - 颜色详情`
          : '色卡本颜色详情'
      }
      open={open}
      onCancel={onCancel}
      footer={null}
      width={720}
    >
      {loading && <div style={{ textAlign: 'center', padding: 20, color: 'var(--color-text-secondary)' }}>加载中...</div>}
      {!loading && data?.card && (
        <>
          <div style={{ marginBottom: 16, color: 'var(--color-text-secondary)', fontSize: 13 }}>
            色卡本编号：{data.card.colorCardCode || '-'} · 共 {Array.isArray(data.items) ? data.items.length : 0} 种颜色
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Array.isArray(data.items) && data.items.map((item: ColorItemEntry, idx: number) => (
              <Card key={item.id || idx} size="small" style={{ border: '1px solid var(--color-border)' }}>
                <Row gutter={12} align="middle">
                  <Col xs={24} sm={2} style={{ fontWeight: 600, color: 'var(--color-primary)' }}>#{idx + 1}</Col>
                  <Col xs={24} sm={5}>颜色编号：{item.colorNo || '-'}</Col>
                  <Col xs={24} sm={5}>颜色名称：{item.colorName || '-'}</Col>
                  <Col xs={24} sm={6}>
                    {item.unitPrice != null && item.unitPrice !== undefined ? `单价：${item.unitPrice} 元` : '-'}
                  </Col>
                  <Col xs={24} sm={6} style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}>
                    {item.remark || ''}
                  </Col>
                </Row>
              </Card>
            ))}
            {Array.isArray(data.items) && data.items.length === 0 && (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-tertiary)' }}>暂无颜色信息</div>
            )}
          </div>
        </>
      )}
    </Modal>
  );
};

MaterialColorItemsModal.displayName = 'MaterialColorItemsModal';

export default MaterialColorItemsModal;
