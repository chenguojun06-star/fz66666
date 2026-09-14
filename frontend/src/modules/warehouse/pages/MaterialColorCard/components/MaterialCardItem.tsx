import React from 'react';
import {
  Button, Card, Image, Tag, Space, Popconfirm,
} from 'antd';
import {
  EditOutlined, DeleteOutlined, FileTextOutlined,
  AppstoreAddOutlined, FileAddOutlined,
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
    className="u-h-full u-d-flex u-fd-column"
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
        <div className="u-fs-12" style={{ color: 'var(--color-text-tertiary)' }}>{card.cardCode}</div>
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
    <div className="u-flex-1 u-d-flex u-fd-column" style={{ padding: '12px 16px 16px 16px' }}>
      {/* 封面图 + 供应商信息 */}
      <div className="u-d-flex u-gap-12" style={{ marginBottom: 14 }}>
        {card.coverImage ? (
          <Image
            src={getFullAuthedFileUrl(card.coverImage)}
            width={96}
            height={96}
            className="u-objf-cover u-br-8 u-fshrink-0" style={{ border: '1px solid var(--color-border-light)' }}
            preview
          />
        ) : (
          <div style={{
            width: 96, height: 96, flexShrink: 0,
            borderRadius: 8, border: '1px dashed var(--color-border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--color-bg-page)', color: 'var(--color-text-quaternary)',
          }}>
            <FileTextOutlined className="u-fs-28" />
          </div>
        )}

        <div className="u-flex-1" style={{ minWidth: 0 }}>
          <div className="u-fs-13 u-mb-6" style={{ color: 'var(--color-text-secondary)' }}>
            <span style={{ color: 'var(--color-text-tertiary)' }}>供应商：</span>
            <span className="u-fw-500">{card.supplierName || '-'}</span>
          </div>
          {card.supplierContactPerson && (
            <div className="u-fs-12 u-mb-4" style={{ color: 'var(--color-text-secondary)' }}>
              <span style={{ color: 'var(--color-text-tertiary)' }}>联系人：</span>{card.supplierContactPerson}
              {card.supplierContactPhone && <span> · {card.supplierContactPhone}</span>}
            </div>
          )}
          <Tag color="blue" className="u-mt-4">{getMaterialTypeLabel(card.materialType)}</Tag>
          <Tag color={card.materialCount && card.materialCount > 0 ? 'green' : 'default'} className="u-mt-4">
            {card.materialCount || 0} 条物料
          </Tag>
        </div>
      </div>

      {/* 物料属性概览 */}
      {(card.fabricWidth || card.fabricWeight || card.specifications || card.fabricComposition) && (
        <div style={{
          padding: 10, background: 'var(--color-bg-container)', borderRadius: 6, marginBottom: 12,
          fontSize: 12, color: 'var(--color-text-secondary)',
        }}>
          <div className="u-d-flex u-fwrap-wrap" style={{ gap: '6px 16px' }}>
            {card.fabricWidth && <span>幅宽：{card.fabricWidth}</span>}
            {card.fabricWeight && <span>克重：{card.fabricWeight}</span>}
            {card.specifications && <span>规格：{card.specifications}</span>}
            {card.fabricComposition && <span>成分：{card.fabricComposition}</span>}
          </div>
        </div>
      )}

      {/* 操作按钮：集中到底部 */}
      <div style={{ marginTop: 'auto' }}>
        <div className="u-d-flex u-ai-center u-jc-between u-mb-12">
          <span className="u-fs-12" style={{ color: 'var(--color-text-tertiary)' }}>创建：{card.createTime?.slice(0, 10)}</span>
        </div>

        <Space size={8} wrap>
          <Button size="small" type="primary" icon={<AppstoreAddOutlined />} onClick={() => onOpenItems(card)}>
            颜色管理 ({card.materialCount || 0})
          </Button>
          <Button size="small" icon={<FileAddOutlined />} onClick={() => onGenerateMaterials(card)}>
            生成到物料资料
          </Button>
        </Space>

        {card.remark && (
          <div style={{
            marginTop: 10, padding: 8, background: 'var(--color-bg-page)', borderRadius: 4,
            fontSize: 12, color: 'var(--color-text-secondary)',
          }}>
            备注：{card.remark}
          </div>
        )}
      </div>
    </div>
  </Card>
);

export default MaterialCardItem;
