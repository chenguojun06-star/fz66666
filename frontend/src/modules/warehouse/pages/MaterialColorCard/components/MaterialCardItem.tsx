import React from 'react';
import {
  Button, Card, Image, Tag, Space, Row, Col, Popconfirm,
} from 'antd';
import {
  EditOutlined, DeleteOutlined, FileTextOutlined,
  AppstoreAddOutlined, EyeOutlined,
} from '@ant-design/icons';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import { getMaterialTypeLabel } from '@/utils/materialType';
import type { MaterialColorCard } from '../types';

interface Props {
  card: MaterialColorCard;
  onEdit: (card: MaterialColorCard) => void;
  onDelete: (id: string) => void;
  onOpenItems: (card: MaterialColorCard) => void;
  onGenerateMaterials: (card: MaterialColorCard) => void;
}

const MaterialCardItem: React.FC<Props> = ({
  card, onEdit, onDelete, onOpenItems, onGenerateMaterials,
}) => (
  <Card
    key={card.id}
    hoverable
    style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
    bodyStyle={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 0 }}
    styles={{ body: { flex: 1, display: 'flex', flexDirection: 'column', padding: 0 } }}
    title={
      <div style={{ padding: '0 16px' }}>
        <div style={{
          fontWeight: 600, fontSize: 14,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }} title={card.cardName}>
          {card.cardName}
        </div>
        <div style={{ color: '#8c8c8c', fontSize: 12 }}>{card.cardCode}</div>
      </div>
    }
    extra={
      <Space size={4} style={{ marginRight: 12 }}>
        <Button size="small" type="link" icon={<EditOutlined />} onClick={() => onEdit(card)} />
        <Popconfirm title="确认删除？" onConfirm={() => onDelete(card.id)} okText="确认" cancelText="取消">
          <Button size="small" type="link" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      </Space>
    }
  >
    <div style={{ padding: '12px 16px 16px 16px', flex: 1, display: 'flex', flexDirection: 'column' }}>
      {/* 封面图 + 供应商信息 */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
        {/* 封面缩略图 */}
        {card.coverImage ? (
          <Image
            src={getFullAuthedFileUrl(card.coverImage)}
            width={96}
            height={96}
            style={{ objectFit: 'cover', borderRadius: 8, flexShrink: 0, border: '1px solid var(--color-border-light)' }}
            preview
          />
        ) : (
          <div style={{
            width: 96, height: 96, flexShrink: 0,
            borderRadius: 8, border: '1px dashed var(--color-border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--color-bg-page)', color: '#94a3b8',
          }}>
            <FileTextOutlined style={{ fontSize: 28 }} />
          </div>
        )}

        {/* 右侧信息 */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: '#595959', fontSize: 13, marginBottom: 6 }}>
            <span style={{ color: '#8c8c8c' }}>供应商：</span>
            <span style={{ fontWeight: 500 }}>{card.supplierName || '-'}</span>
          </div>
          {card.supplierContactPerson && (
            <div style={{ color: '#595959', fontSize: 12, marginBottom: 4 }}>
              <span style={{ color: '#8c8c8c' }}>联系人：</span>{card.supplierContactPerson}
              {card.supplierContactPhone && <span> · {card.supplierContactPhone}</span>}
            </div>
          )}
          <Tag color="blue" style={{ marginTop: 4 }}>{getMaterialTypeLabel(card.materialType)}</Tag>
          <Tag color={card.materialCount && card.materialCount > 0 ? 'green' : 'default'} style={{ marginTop: 4 }}>
            {card.materialCount || 0} 条物料
          </Tag>
        </div>
      </div>

      {/* 物料属性概览 */}
      {(card.fabricWidth || card.fabricWeight || card.specifications || card.fabricComposition) && (
        <div style={{
          padding: 10, background: 'var(--color-bg-container)', borderRadius: 6, marginBottom: 12,
          fontSize: 12, color: '#595959',
        }}>
          <Row gutter={[8, 6]}>
            {card.fabricWidth && <Col xs={12} sm={12}>幅宽：{card.fabricWidth}</Col>}
            {card.fabricWeight && <Col xs={12} sm={12}>克重：{card.fabricWeight}</Col>}
            {card.specifications && <Col xs={12} sm={12}>规格：{card.specifications}</Col>}
            {card.fabricComposition && (
              <Col xs={24} sm={24}>成分：{card.fabricComposition}</Col>
            )}
          </Row>
        </div>
      )}

      {/* 操作按钮 */}
      <div style={{ marginTop: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={{ color: '#8c8c8c', fontSize: 12 }}>创建：{card.createTime?.slice(0, 10)}</span>
        </div>

        <Space size={8} wrap>
          <Button size="small" type="primary" icon={<AppstoreAddOutlined />} onClick={() => onOpenItems(card)}>
            颜色管理 ({card.materialCount || 0})
          </Button>
          <Button size="small" icon={<EyeOutlined />} onClick={() => onGenerateMaterials(card)}>
            生成到物料资料
          </Button>
        </Space>

        {card.remark && (
          <div style={{
            marginTop: 10, padding: 8, background: '#FFFBE6', borderRadius: 4,
            fontSize: 12, color: '#874d00',
          }}>
            备注：{card.remark}
          </div>
        )}
      </div>
    </div>
  </Card>
);

export default MaterialCardItem;
