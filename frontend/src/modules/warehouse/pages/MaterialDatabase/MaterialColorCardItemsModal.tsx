import React, { useState } from 'react';
import { App, Button, Card, Col, Image, Input, InputNumber, Popconfirm, Row, Select, Space, Tag } from 'antd';
import { AppstoreAddOutlined, PlusOutlined } from '@ant-design/icons';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import SideDrawer from '@/components/common/SideDrawer';
import type { MaterialColorCardItem } from './types';
import { MATERIAL_TYPE_OPTIONS } from './types';
import { colorNameToHex } from './MaterialColorItemsModal';

// ===== 物料色卡子物料管理（D-444：弹窗统一为侧滑抽屉 + 批量单价处理 + 无图色块） =====
interface MaterialColorCardItemsModalProps {
  open: boolean;
  currentCardName: string;
  currentItems: MaterialColorCardItem[];
  onCancel: () => void;
  onSave: () => void;
  addEmptyCardItem: () => void;
  updateCardItem: (idx: number, field: keyof MaterialColorCardItem, value: any) => void;
  removeCardItem: (idx: number) => void;
  uploadCardImage: (file: File) => Promise<string>;
}

const MaterialColorCardItemsModal: React.FC<MaterialColorCardItemsModalProps> = ({
  open, currentCardName, currentItems,
  onCancel, onSave, addEmptyCardItem, updateCardItem, removeCardItem, uploadCardImage,
}) => {
  const { message } = App.useApp();
  const [unifiedPrice, setUnifiedPrice] = useState<number | null>(null);

  // D-444：批量单价处理——一个价应用到全部明细（与出库统一单价同款交互）
  const handleApplyUnifiedPrice = () => {
    if (unifiedPrice == null || unifiedPrice <= 0) { message.warning('请先输入统一单价'); return; }
    if (currentItems.length === 0) { message.warning('暂无物料明细'); return; }
    currentItems.forEach((_, idx) => updateCardItem(idx, 'unitPrice', unifiedPrice));
    message.success(`已将单价 ${unifiedPrice} 元应用到全部 ${currentItems.length} 条明细`);
  };

  const handleUploadImage = async (idx: number) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    const file: File | undefined = await new Promise((resolve) => {
      input.onchange = (ev: any) => resolve(ev.target.files?.[0]);
      input.click();
    });
    if (!file) return; // 用户取消选择
    try {
      const url = await uploadCardImage(file);
      updateCardItem(idx, 'image', url);
    } catch (e) {
      console.error('[MaterialDatabase] 上传色卡图片失败:', e);
      message.error('上传图片失败');
    }
  };

  return (
    <SideDrawer
      title={<Space><AppstoreAddOutlined /> {currentCardName} - 物料管理</Space>}
      open={open}
      onClose={onCancel}
      width={960}
      footer={[
        <Button key="close" onClick={onCancel}>关闭</Button>,
        <Button key="save" type="primary" onClick={onSave}>保存全部</Button>,
      ]}
    >
      <Space wrap style={{ marginBottom: 12 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={addEmptyCardItem}>+ 添加物料</Button>
        {/* D-444：批量单价处理 */}
        <Space.Compact>
          <InputNumber style={{ width: 130 }} min={0} precision={2} value={unifiedPrice} onChange={(v) => setUnifiedPrice(v)} placeholder="统一单价" />
          <Button onClick={handleApplyUnifiedPrice}>单价应用到全部</Button>
        </Space.Compact>
        <span style={{ color: 'var(--color-text-tertiary)' }}>共 {currentItems.length} 条</span>
      </Space>
      <div className="u-d-flex u-fd-column u-gap-8" style={{ maxHeight: 'calc(100vh - 240px)', overflowY: 'auto' }}>
        {currentItems.length === 0 && (
          <div className="u-ta-center" style={{ padding: 40, color: 'var(--color-text-tertiary)' }}>暂无物料，点击"添加物料"开始添加</div>
        )}
        {currentItems.map((item, idx) => {
          const swatch = colorNameToHex(item.color);
          return (
            <Card key={idx} size="small" style={{ border: '1px solid var(--color-border)' }}>
              <Row gutter={[8, 8]} align="middle">
                <Col xs={24} sm={1}>
                  <Tag color="blue">#{idx + 1}</Tag>
                </Col>
                <Col xs={24} sm={2}>
                  {/* D-444：无图颜色 → 按色名生成色块；有图显示图片 */}
                  {item.image ? (
                    <Image src={getFullAuthedFileUrl(item.image)} width={34} height={34} style={{ objectFit: 'cover', borderRadius: 6 }} preview />
                  ) : (
                    <div
                      title={item.color ? `${item.color}（无图片，按色名生成色块）` : ''}
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 6,
                        background: swatch ?? 'var(--color-bg-subtle)',
                        border: '1px solid rgba(0,0,0,0.12)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 12,
                        color: '#ffffff',
                      }}
                    >
                      {(item.color || '无').slice(0, 1)}
                    </div>
                  )}
                </Col>
                <Col xs={24} sm={3}>
                  <Input placeholder="物料编号" value={item.materialCode || ''}
                    onChange={(e) => updateCardItem(idx, 'materialCode', e.target.value)} size="small" />
                </Col>
                <Col xs={24} sm={4}>
                  <Input placeholder="物料名称*" value={item.materialName || ''}
                    onChange={(e) => updateCardItem(idx, 'materialName', e.target.value)} size="small" />
                </Col>
                <Col xs={24} sm={3}>
                  <Input placeholder="颜色" value={item.color || ''}
                    onChange={(e) => updateCardItem(idx, 'color', e.target.value)} size="small" />
                </Col>
                <Col xs={24} sm={3}>
                  <InputNumber placeholder="单价" value={item.unitPrice}
                    onChange={(v) => updateCardItem(idx, 'unitPrice', v)}
                    min={0} step={0.01} style={{ width: '100%' }} size="small" />
                </Col>
                <Col xs={24} sm={3}>
                  <Select placeholder="物料类型" value={item.materialType || undefined}
                    onChange={(v) => updateCardItem(idx, 'materialType', v)} size="small" style={{ width: '100%' }}>
                    {MATERIAL_TYPE_OPTIONS.map((o) => (
                      <Select.Option key={o.value} value={o.value}>{o.label}</Select.Option>
                    ))}
                  </Select>
                </Col>
                <Col xs={24} sm={3}>
                  <Button size="small" icon={<PlusOutlined />} onClick={() => handleUploadImage(idx)}>传图</Button>
                </Col>
                <Col xs={24} sm={2}>
                  <Popconfirm title="确定删除吗？" onConfirm={() => removeCardItem(idx)} okText="确定" cancelText="取消">
                    <Button type="link" danger size="small">删除</Button>
                  </Popconfirm>
                </Col>
              </Row>
            </Card>
          );
        })}
      </div>
    </SideDrawer>
  );
};

MaterialColorCardItemsModal.displayName = 'MaterialColorCardItemsModal';

export default MaterialColorCardItemsModal;
