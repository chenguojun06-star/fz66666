import React from 'react';
import { Modal, Button, Image, Descriptions } from 'antd';
import { FileTextOutlined } from '@ant-design/icons';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import { getMaterialTypeLabel } from '@/utils/materialType';
import type { MaterialColorCard, MaterialColorCardItem } from '../types';

interface Props {
  visible: boolean;
  onCancel: () => void;
  colorDetailItem: MaterialColorCardItem | null;
  colorDetailParent: MaterialColorCard | null;
}

const ColorDetailModal: React.FC<Props> = ({
  visible, onCancel, colorDetailItem, colorDetailParent,
}) => {
  return (
    <Modal
      title={`颜色详情 - ${colorDetailParent?.cardName || ''}`}
      open={visible}
      onCancel={onCancel}
      footer={[
        <Button key="close" onClick={onCancel}>关闭</Button>,
      ]}
      width={720}
    >
      {colorDetailItem && colorDetailParent && (
        <div>
          {/* 左侧图片 + 右侧信息 */}
          <div style={{ display: 'flex', gap: 20, marginBottom: 16 }}>
            <div style={{ width: 180, flexShrink: 0 }}>
              {colorDetailItem.image ? (
                <Image
                  src={getFullAuthedFileUrl(colorDetailItem.image)}
                  width={180}
                  height={180}
                  style={{ objectFit: 'cover', borderRadius: 8, border: '1px solid var(--color-border-light)' }}
                />
              ) : (
                <div style={{
                  width: 180, height: 180, borderRadius: 8,
                  border: '1px dashed var(--color-border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'var(--color-bg-page)', color: '#94a3b8',
                }}>
                  <FileTextOutlined style={{ fontSize: 40 }} />
                </div>
              )}
            </div>

            <div style={{ flex: 1 }}>
              <Descriptions column={1} size="small" bordered>
                <Descriptions.Item label="颜色">{colorDetailItem.color || '-'}</Descriptions.Item>
                <Descriptions.Item label="物料名称">{colorDetailItem.materialName || '-'}</Descriptions.Item>
                <Descriptions.Item label="物料编号">{colorDetailItem.materialCode || '-'}</Descriptions.Item>
                <Descriptions.Item label="单价">{colorDetailItem.unitPrice != null ? `¥${colorDetailItem.unitPrice}` : '-'}</Descriptions.Item>
                <Descriptions.Item label="物料类型">{getMaterialTypeLabel(colorDetailParent.materialType)}</Descriptions.Item>
                <Descriptions.Item label="供应商">
                  {colorDetailParent.supplierName || '-'}
                  {colorDetailParent.supplierContactPerson && ` (${colorDetailParent.supplierContactPerson})`}
                </Descriptions.Item>
                <Descriptions.Item label="幅宽">{colorDetailParent.fabricWidth || '-'}</Descriptions.Item>
                <Descriptions.Item label="克重">{colorDetailParent.fabricWeight || '-'}</Descriptions.Item>
                <Descriptions.Item label="规格">{colorDetailParent.specifications || '-'}</Descriptions.Item>
                <Descriptions.Item label="成分">{colorDetailParent.fabricComposition || '-'}</Descriptions.Item>
                <Descriptions.Item label="单位">{colorDetailParent.unit || '-'}</Descriptions.Item>
                {colorDetailItem.remark && (
                  <Descriptions.Item label="备注">{colorDetailItem.remark}</Descriptions.Item>
                )}
              </Descriptions>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
};

export default ColorDetailModal;
