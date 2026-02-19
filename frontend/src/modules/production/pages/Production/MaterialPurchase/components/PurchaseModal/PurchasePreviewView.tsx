import React from 'react';
import { Tag } from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import { StyleCoverThumb, StyleAttachmentsButton } from '@/components/StyleAssets';
import { MaterialPurchase as MaterialPurchaseType } from '@/types/production';
import { getMaterialTypeCategory, getMaterialTypeLabel } from '@/utils/materialType';

interface PurchasePreviewViewProps {
  previewList: MaterialPurchaseType[];
  isMobile: boolean;
}

const PurchasePreviewView: React.FC<PurchasePreviewViewProps> = ({ previewList, isMobile }) => {
  return (
    <div className="purchase-preview">
      <ResizableTable
        columns={[
          {
            title: '图片',
            dataIndex: 'styleCover',
            key: 'styleCover',
            width: 72,
            render: (_: any, record: any) => (
              <StyleCoverThumb styleId={record.styleId} styleNo={record.styleNo} src={record.styleCover || null} size={48} borderRadius={6} />
            )
          },
          {
            title: '订单号',
            dataIndex: 'orderNo',
            key: 'orderNo',
            width: 120,
            render: (v: unknown) => (
              <span className="order-no-wrap">{String(v || '').trim() || '-'}</span>
            ),
          },
          {
            title: '款号',
            dataIndex: 'styleNo',
            key: 'styleNo',
            width: 100,
            ellipsis: true,
          },
          {
            title: '款名',
            dataIndex: 'styleName',
            key: 'styleName',
            width: 140,
            ellipsis: true,
          },
          {
            title: '附件',
            key: 'attachments',
            width: 100,
            render: (_: any, record: any) => (
              <StyleAttachmentsButton
                styleId={record.styleId}
                styleNo={record.styleNo}
                modalTitle={record.styleNo ? `放码纸样（${record.styleNo}）` : '放码纸样'}
                onlyGradingPattern={true}
                onlyActive
              />
            )
          },
          {
            title: '面料辅料类型',
            dataIndex: 'materialType',
            key: 'materialType',
            width: 120,
            render: (v: unknown) => {
              const type = String(v || '').trim();
              const category = getMaterialTypeCategory(type);
              const text = getMaterialTypeLabel(type);
              const color = category === 'accessory' ? 'purple' : category === 'lining' ? 'cyan' : 'geekblue';
              return <Tag color={color}>{text}</Tag>;
            },
          },
          {
            title: '物料编码',
            dataIndex: 'materialCode',
            key: 'materialCode',
          },
          {
            title: '物料名称',
            dataIndex: 'materialName',
            key: 'materialName',
          },
          {
            title: '规格',
            dataIndex: 'specifications',
            key: 'specifications',
          },
          {
            title: '单位',
            dataIndex: 'unit',
            key: 'unit',
          },
          {
            title: '采购数量',
            dataIndex: 'purchaseQuantity',
            key: 'purchaseQuantity',
            align: 'right' as const,
          },
          {
            title: '供应商',
            dataIndex: 'supplierName',
            key: 'supplierName',
          },
        ]}
        dataSource={previewList}
        rowKey={(record) => record.materialCode || record.id || `material-${Math.random()}`}
        pagination={false}
        scroll={{ x: 'max-content' }}
        size={isMobile ? 'small' : 'middle'}
      />
      <div className="mt-sm" style={{ color: 'var(--neutral-text-disabled)' }}>
        小提示：保存生成后可在列表中查看并补充单价等信息
      </div>
    </div>
  );
};

export default PurchasePreviewView;
