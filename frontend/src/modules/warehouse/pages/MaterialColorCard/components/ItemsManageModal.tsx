import React from 'react';
import {
  Modal, Button, Space, Tag, Row, Col, Input, InputNumber, Card, Image,
  message as antdMessage,
} from 'antd';
import { AppstoreAddOutlined, PlusOutlined } from '@ant-design/icons';
import api from '@/utils/api';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import type { MaterialColorCard, MaterialColorCardItem } from '../types';

interface Props {
  visible: boolean;
  onCancel: () => void;
  onSave: () => void;
  currentCardName: string;
  currentItems: MaterialColorCardItem[];
  colorDetailParent: MaterialColorCard | null;
  onAddEmptyItem: () => void;
  onUpdateItem: (idx: number, field: keyof MaterialColorCardItem, value: any) => void;
  onRemoveItem: (idx: number) => void;
  onOpenColorDetail: (card: MaterialColorCard, item: MaterialColorCardItem) => void;
}

const ItemsManageModal: React.FC<Props> = ({
  visible, onCancel, onSave, currentCardName, currentItems,
  colorDetailParent, onAddEmptyItem, onUpdateItem, onRemoveItem, onOpenColorDetail,
}) => {
  return (
    <Modal
      title={<Space><AppstoreAddOutlined /> {currentCardName} - 物料管理</Space>}
      open={visible}
      onCancel={onCancel}
      width={960}
      footer={[
        <Button key="close" onClick={onCancel}>关闭</Button>,
        <Button key="save" type="primary" onClick={onSave}>保存全部</Button>,
      ]}
    >
      <Space style={{ marginBottom: 12 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={onAddEmptyItem}>+ 添加颜色</Button>
        <span style={{ color: '#888' }}>共 {currentItems.length} 条</span>
        <span style={{ color: '#bbb', fontSize: 12 }}>规格/成分/幅宽继承自母卡</span>
      </Space>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 500, overflowY: 'auto' }}>
        {currentItems.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>
            暂无颜色条目，点击"+ 添加颜色"开始录入
          </div>
        )}
        {currentItems.map((item, idx) => (
          <Card key={idx} size="small" style={{ border: '1px solid #eee' }}>
            <Row gutter={[8, 8]} align="middle">
              <Col xs={24} sm={1}>
                <Tag color="blue" style={{ cursor: 'pointer' }}
                  title="查看完整信息"
                  onClick={() => colorDetailParent && onOpenColorDetail(colorDetailParent, item)}>#{idx + 1}</Tag>
              </Col>
              <Col xs={24} sm={3}>
                <Input placeholder="颜色" value={item.color || ''}
                  onChange={(e) => onUpdateItem(idx, 'color', e.target.value)} size="small" />
              </Col>
              <Col xs={24} sm={4}>
                <Input placeholder="物料名称*" value={item.materialName || ''}
                  onChange={(e) => onUpdateItem(idx, 'materialName', e.target.value)} size="small" />
              </Col>
              <Col xs={24} sm={2}>
                <Input placeholder="编号" value={item.materialCode || ''}
                  onChange={(e) => onUpdateItem(idx, 'materialCode', e.target.value)} size="small" />
              </Col>
              <Col xs={24} sm={2}>
                <InputNumber placeholder="单价" value={item.unitPrice}
                  onChange={(v) => onUpdateItem(idx, 'unitPrice', v)}
                  min={0} step={0.01} style={{ width: '100%' }} size="small" />
              </Col>
              <Col xs={24} sm={3}>
                <Space.Compact>
                  <Button size="small" icon={<PlusOutlined />} onClick={async () => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'image/*';
                    const file: File = await new Promise((resolve) => {
                      input.onchange = (ev: any) => resolve(ev.target.files[0]);
                      input.click();
                    });
                    try {
                      const formData = new FormData();
                      formData.append('file', file);
                      const res = await api.post<{ code: number; data: string }>(
                        '/common/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } },
                      );
                      if (res.code === 200) onUpdateItem(idx, 'image', res.data);
                    } catch (e) { console.error('[MaterialColorCard] 上传色卡图片失败:', e); antdMessage.error('上传图片失败'); }
                  }}>上传图片</Button>
                  {item.image && (
                    <Image src={getFullAuthedFileUrl(item.image)} width={32} height={32}
                      style={{ objectFit: 'cover' }} preview />
                  )}
                </Space.Compact>
              </Col>
              <Col xs={24} sm={1}>
                <Button type="link" danger size="small" onClick={() => onRemoveItem(idx)}>删除</Button>
              </Col>
              <Col xs={24} sm={8}>
                <Input placeholder="备注" value={item.remark || ''}
                  onChange={(e) => onUpdateItem(idx, 'remark', e.target.value)} size="small" />
              </Col>
            </Row>
          </Card>
        ))}
      </div>
    </Modal>
  );
};

export default ItemsManageModal;
