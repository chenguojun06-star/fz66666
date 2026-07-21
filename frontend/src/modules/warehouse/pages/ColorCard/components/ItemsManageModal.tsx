import React from 'react';
import { Button, Card, Image, Input, InputNumber, Modal, Row, Col, Space, Tag, message as antdMessage } from 'antd';
import { CameraOutlined, FileImageOutlined, PlusOutlined } from '@ant-design/icons';
import type { RefObject } from 'react';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import type { ColorCardItem } from '../types';

// ===== 颜色管理弹窗（从 index.tsx 抽取） =====
interface ItemsManageModalProps {
  open: boolean;
  currentCardName: string;
  currentItems: ColorCardItem[];
  nextColorNoRef: RefObject<string>;
  onAddEmptyItem: () => Promise<void>;
  onUpdateItem: (idx: number, field: keyof ColorCardItem, value: string | number | undefined | null) => void;
  onRemoveItem: (idx: number) => void;
  onSaveItems: () => Promise<void>;
  onOpenRecognize: () => void;
  onCancel: () => void;
  uploadImage: (file: File) => Promise<string>;
}

const ItemsManageModal: React.FC<ItemsManageModalProps> = ({
  open, currentCardName, currentItems, nextColorNoRef,
  onAddEmptyItem, onUpdateItem, onRemoveItem, onSaveItems, onOpenRecognize, onCancel,
  uploadImage,
}) => {
  return (
    <Modal
      title={<Space><FileImageOutlined /> {currentCardName} - 颜色管理</Space>}
      open={open}
      onCancel={onCancel}
      width={960}
      footer={[
        <Button key="close" onClick={onCancel}>关闭</Button>,
        <Button key="save" type="primary" onClick={onSaveItems}>保存全部</Button>,
      ]}
    >
      <Space style={{ marginBottom: 12 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={onAddEmptyItem}>+ 添加颜色</Button>
        <Button icon={<CameraOutlined />} onClick={onOpenRecognize}>拍照识别</Button>
        <span style={{ color: '#888' }}>共 {currentItems.length} 条 | 下一个编号：{nextColorNoRef.current}</span>
      </Space>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 500, overflowY: 'auto' }}>
        {currentItems.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>
            暂无颜色，点击"添加颜色"或"拍照识别"添加
          </div>
        )}
        {currentItems.map((item, idx) => (
          <Card key={idx} size="small" style={{ border: '1px solid #eee' }}>
            <Row gutter={8} align="middle">
              <Col xs={24} sm={2}>
                <Tag color="blue">#{idx + 1}</Tag>
              </Col>
              <Col xs={24} sm={3}>
                <Input placeholder="颜色编号 *" value={item.colorNo}
                  onChange={(e) => onUpdateItem(idx, 'colorNo', e.target.value)} size="small" />
              </Col>
              <Col xs={24} sm={4}>
                <Input placeholder="颜色名称" value={item.colorName || ''}
                  onChange={(e) => onUpdateItem(idx, 'colorName', e.target.value)} size="small" />
              </Col>
              <Col xs={24} sm={3}>
                <InputNumber placeholder="单价" value={item.unitPrice}
                  onChange={(v) => onUpdateItem(idx, 'unitPrice', v)}
                  min={0} step={0.01} style={{ width: '100%' }} size="small" />
              </Col>
              <Col xs={24} sm={5}>
                <Space.Compact>
                  <Button size="small" icon={<CameraOutlined />} onClick={() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'image/*';
                    input.onchange = async (e: Event) => {
                      const file = (e.target as HTMLInputElement).files?.[0];
                      if (file) {
                        try {
                          const url = await uploadImage(file);
                          onUpdateItem(idx, 'image', url);
                        } catch { antdMessage.error('上传失败'); }
                      }
                    };
                    input.click();
                  }}>上传图片</Button>
                  {item.image && (
                    <Image src={getFullAuthedFileUrl(item.image)} width={32} height={32}
                      style={{ objectFit: 'cover' }} preview />
                  )}
                </Space.Compact>
              </Col>
              <Col xs={24} sm={3}>
                <Input placeholder="备注" value={item.remark || ''}
                  onChange={(e) => onUpdateItem(idx, 'remark', e.target.value)} size="small" />
              </Col>
              <Col xs={24} sm={1}>
                <Button type="link" danger size="small" onClick={() => onRemoveItem(idx)}>删除</Button>
              </Col>
            </Row>
          </Card>
        ))}
      </div>
    </Modal>
  );
};

export default ItemsManageModal;
