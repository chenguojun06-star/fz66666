import React, { useState } from 'react';
import { Alert, Button, Space } from 'antd';
import { PlusOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import ResizableTable from '@/components/common/ResizableTable';
import { getMaterialTypeLabel } from '@/utils/materialType';
import { displayAmount } from '@/utils/display';
import { getBomColumns } from '../helpers/bomColumns';
import SmartPurchasePreviewModal from './SmartPurchasePreviewModal';

interface MaterialTabContentProps {
  orderId: string;
  orderNo: string;
  isFactoryUser: boolean;
  bomList: any[];
  materialPurchases: any[];
  generating: boolean;
  /** 弹出原因输入弹窗（保留给其它环节使用） */
  showReasonModal: (title: string, actionLabel: string, onConfirm: (reason: string) => void) => void;
  /** 记录操作到订单操作记录 */
  recordAction: (action: string, reason: string) => Promise<void>;
  /** 从物料清单生成采购（全部物料）；shortageOnly=true 时仅按净需求生成缺料部分 */
  handleGenerateFromBom: (reason: string, shortageOnly?: boolean) => Promise<void>;
}

/**
 * 面辅料 Tab 内容。
 *
 * 优先级：
 * 1. materialPurchases 非空 → 显示采购明细 + 「生成采购」「录入采购」按钮
 * 2. bomList 非空 → 显示物料清单 + 「生成采购」按钮
 * 3. 都为空 → Alert 提示
 *
 * 「生成采购」先弹出缺料分析（净需求 = 用量×订单数量×(1+损耗) − 可用库存 − 在途），
 * 用户看清缺什么再选择「生成全部」或「仅缺料加入采购车」，原因改为选填。
 */
const MaterialTabContent: React.FC<MaterialTabContentProps> = ({
  orderId,
  orderNo,
  isFactoryUser,
  bomList,
  materialPurchases,
  generating,
  showReasonModal: _showReasonModal,
  recordAction,
  handleGenerateFromBom,
}) => {
  const navigate = useNavigate();
  const [previewOpen, setPreviewOpen] = useState(false);

  const openPurchasePreview = () => setPreviewOpen(true);

  const goToPurchaseEntry = () => {
    void recordAction('录入采购', '订单流程快捷入口');
    const url = orderId
      ? `/production/material-purchase?orderId=${orderId}&orderNo=${encodeURIComponent(orderNo)}`
      : '/production/material-purchase';
    navigate(url);
  };

  if (materialPurchases.length > 0) {
    return (
      <>
        <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'flex-end' }}>
          <Space>
            {bomList.length > 0 && (
              <Button
                icon={<ThunderboltOutlined />}
                loading={generating}
                onClick={openPurchasePreview}
              >
                生成采购
              </Button>
            )}
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={goToPurchaseEntry}
            >
              录入采购
            </Button>
          </Space>
        </div>
        <ResizableTable
          storageKey="order-flow-bom"
          size="small"
          dataSource={materialPurchases}
          rowKey={(r: any) => r.id || `mp-${Math.random()}`}
          showIndex
          emptyDescription="暂无采购明细"
          columns={[
            { title: '物料类型', dataIndex: 'materialType', key: 'materialType', width: 100, render: (v: any) => getMaterialTypeLabel(v) },
            { title: '物料编码', dataIndex: 'materialCode', key: 'materialCode', width: 120, render: (v: any) => v || '-' },
            { title: '物料名称', dataIndex: 'materialName', key: 'materialName', width: 180, ellipsis: true, render: (v: any) => v || '-' },
            { title: '规格/幅宽', dataIndex: 'specifications', key: 'specifications', width: 120, ellipsis: true, render: (v: any) => v || '-' },
            { title: '颜色', dataIndex: 'color', key: 'color', width: 80, render: (v: any) => v || '-' },
            {
              title: '尺码用量',
              key: 'sizeUsage',
              width: 220,
              render: (_: any, record: any) => {
                if (record.sizeUsageMap) {
                  try {
                    const map: Record<string, string> = JSON.parse(record.sizeUsageMap);
                    const entries = Object.entries(map);
                    if (entries.length > 0) {
                      return (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                          {entries.map(([sz, usage]) => (
                            <span key={sz} style={{ fontSize: 12, background: 'var(--color-border-light)', padding: '0 4px', borderRadius: 2 }}>
                              {sz}: {Number(usage).toFixed(2)}{record.unit || ''}
                            </span>
                          ))}
                        </div>
                      );
                    }
                  } catch { /* ignore */ }
                }
                return <span style={{ color: 'var(--color-text-tertiary)' }}>{record.size || '-'}</span>;
              },
            },
            { title: '采购数量', dataIndex: 'purchaseQuantity', key: 'purchaseQuantity', width: 120, align: 'right' as const, render: (v: any, record: any) => `${Number(v || 0).toFixed(2)} ${record.unit || ''}` },
            {
              title: '已到货',
              dataIndex: 'arrivedQuantity',
              key: 'arrivedQuantity',
              width: 120,
              align: 'right' as const,
              render: (v: any, record: any) => {
                const val = Number(v || 0);
                const ordered = Number(record.purchaseQuantity || 0);
                const color = val >= ordered && ordered > 0 ? 'var(--color-success)' : 'var(--color-warning)';
                return <span style={{ color }}>{val.toFixed(2)} {record.unit || ''}</span>;
              },
            },
            ...(!isFactoryUser ? [
              { title: '单价', dataIndex: 'unitPrice', key: 'unitPrice', width: 90, align: 'right' as const, render: (v: any) => v ? displayAmount(Number(v)) : '-' },
              {
                title: '总价',
                key: 'totalPrice',
                width: 100,
                align: 'right' as const,
                render: (_: any, record: any) => {
                  const total = Number(record.totalAmount || 0) || (Number(record.purchaseQuantity || 0) * Number(record.unitPrice || 0));
                  return total > 0 ? <strong style={{ color: 'var(--color-primary)' }}>{displayAmount(total)}</strong> : '-';
                },
              },
            ] : []),
            { title: '供应商', dataIndex: 'supplierName', key: 'supplierName', width: 120, ellipsis: true, render: (v: any) => v || '-' },
            { title: '状态', dataIndex: 'status', key: 'status', width: 100, render: (v: any) => v || '-' },
          ]}
          pagination={false}
          bordered
          scroll={{ x: 'max-content' }}
        />

        <SmartPurchasePreviewModal
          open={previewOpen}
          orderNo={orderNo}
          generating={generating}
          onClose={() => setPreviewOpen(false)}
          onGenerateAll={(reason) => { void handleGenerateFromBom(reason); }}
          onGenerateShortage={(reason) => { void handleGenerateFromBom(reason, true); }}
        />
      </>
    );
  }

  if (bomList.length > 0) {
    return (
      <>
        <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'flex-end' }}>
          <Button
            type="primary"
            icon={<ThunderboltOutlined />}
            loading={generating}
            onClick={openPurchasePreview}
          >
            生成采购
          </Button>
        </div>
        <ResizableTable
          storageKey="order-flow-bom"
          size="small"
          dataSource={bomList}
          rowKey={(r: any) => r.id || `bom-${Math.random()}`}
          columns={getBomColumns(isFactoryUser)}
          showIndex
          emptyDescription="暂无物料"
          pagination={false}
          bordered
          scroll={{ x: 'max-content' }}
        />

        <SmartPurchasePreviewModal
          open={previewOpen}
          orderNo={orderNo}
          generating={generating}
          onClose={() => setPreviewOpen(false)}
          onGenerateAll={(reason) => { void handleGenerateFromBom(reason); }}
          onGenerateShortage={(reason) => { void handleGenerateFromBom(reason, true); }}
        />
      </>
    );
  }

  return (
    <Alert
      title="暂无面辅料信息"
      description="此订单尚未录入采购物料，关联的款号也未录入物料清单"
      type="info"
      showIcon
    />
  );
};

export default MaterialTabContent;
