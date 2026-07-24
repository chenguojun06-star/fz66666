import React from 'react';
import { App, Button, Card, Col, Image, Input, InputNumber, Modal, Popconfirm, Row, Select, Space, Tag } from 'antd';
import { AppstoreAddOutlined, PlusOutlined } from '@ant-design/icons';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import type { MaterialColorCardItem } from './types';
import { MATERIAL_TYPE_OPTIONS } from './types';

// ===== 物料色卡子物料管理弹窗（从 index.tsx 抽取） =====
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

  const handleUploadImage = async (idx: number) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    const file: File = await new Promise((resolve) => {
      input.onchange = (ev: any) => resolve(ev.target.files[0]);
      input.click();
    });
    try {
      const url = await uploadCardImage(file);
      updateCardItem(idx, 'image', url);
    } catch (e) {
      console.error('[MaterialDatabase] 上传色卡图片失败:', e);
      message.error('上传图片失败');
    }
  };

  return (
    <Modal
      title={<Space><AppstoreAddOutlined /> {currentCardName} - 物料管理</Space>}
      open={open}
      onCancel={onCancel}
      width={960}
      footer={[
        <Button key="close" onClick={onCancel}>关闭</Button>,
        <Button key="save" type="primary" onClick={onSave}>保存全部</Button>,
      ]}
    >
      <Space style={{ marginBottom: 12 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={addEmptyCardItem}>+ 添加物料</Button>
        <span style={{ color: '#888' }}>共 {currentItems.length} 条</span>
      </Space>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 480, overflowY: 'auto' }}>
        {currentItems.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>暂无物料，点击"添加物料"开始添加</div>
        )}
        {currentItems.map((item, idx) => (
          <Card key={idx} size="small" style={{ border: '1px solid #eee' }}>
            <Row gutter={[8, 8]} align="middle">
              <Col xs={24} sm={1}>
                <Tag color="blue">#{idx + 1}</Tag>
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
              <Col xs={24} sm={5}>
                <Space.Compact>
                  <Button size="small" icon={<PlusOutlined />} onClick={() => handleUploadImage(idx)}>上传图片</Button>
                  {item.image && (
                    <Image src={getFullAuthedFileUrl(item.image)} width={32} height={32} style={{ objectFit: 'cover' }} preview />
                  )}
                </Space.Compact>
              </Col>
              <Col xs={24} sm={2}>
                <Popconfirm title="确定删除吗？" onConfirm={() => removeCardItem(idx)} okText="确定" cancelText="取消">
                  <Button type="link" danger size="small">删除</Button>
                </Popconfirm>
              </Col>
            </Row>
          </Card>
        ))}
      </div>
    </Modal>
  );
};

MaterialColorCardItemsModal.displayName = 'MaterialColorCardItemsModal';

export default MaterialColorCardItemsModal;
