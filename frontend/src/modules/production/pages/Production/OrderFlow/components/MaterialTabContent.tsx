import React from 'react';
import { Alert, Button, Space } from 'antd';
import { PlusOutlined, ThunderboltOutlined } from '@ant-design/icons';
import ResizableTable from '@/components/common/ResizableTable';
import { getMaterialTypeLabel } from '@/utils/materialType';
import { displayAmount } from '@/utils/display';
import { getBomColumns } from '../helpers/bomColumns';

interface MaterialTabContentProps {
  orderId: string;
  orderNo: string;
  isFactoryUser: boolean;
  bomList: any[];
  materialPurchases: any[];
  generating: boolean;
  /** 弹出原因输入弹窗 */
  showReasonModal: (title: string, actionLabel: string, onConfirm: (reason: string) => void) => void;
  /** 记录操作到订单操作记录 */
  recordAction: (action: string, reason: string) => Promise<void>;
  /** 从 BOM 生成采购 */
  handleGenerateFromBom: (reason: string) => Promise<void>;
}

/**
 * 面辅料 Tab 内容。
 *
 * 优先级：
 * 1. materialPurchases 非空 → 显示采购明细 + 「从BOM生成」「录入采购」按钮
 * 2. bomList 非空 → 显示 BOM 物料 + 「从BOM生成采购」按钮
 * 3. 都为空 → Alert 提示
 */
const MaterialTabContent: React.FC<MaterialTabContentProps> = ({
  orderId,
  orderNo,
  isFactoryUser,
  bomList,
  materialPurchases,
  generating,
  showReasonModal,
  recordAction,
  handleGenerateFromBom,
}) => {
  if (materialPurchases.length > 0) {
    return (
      <>
        <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'flex-end' }}>
          <Space>
            {bomList.length > 0 && (
              <Button
                icon={<ThunderboltOutlined />}
                loading={generating}
                onClick={() => showReasonModal('从BOM生成采购', '生成采购', (reason) => handleGenerateFromBom(reason))}
              >
                从BOM生成
              </Button>
            )}
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                showReasonModal('录入物料采购', '录入采购', (reason) => {
                  recordAction('录入采购', reason);
                  const url = orderId
                    ? `/production/material-purchase?orderId=${orderId}&orderNo=${encodeURIComponent(orderNo)}`
                    : '/production/material-purchase';
                  window.open(url, '_blank');
                });
              }}
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
            onClick={() => showReasonModal('从BOM生成采购', '生成采购', (reason) => handleGenerateFromBom(reason))}
          >
            从BOM生成采购
          </Button>
        </div>
        <ResizableTable
          storageKey="order-flow-bom"
          size="small"
          dataSource={bomList}
          rowKey={(r: any) => r.id || `bom-${Math.random()}`}
          columns={getBomColumns(isFactoryUser)}
          showIndex
          emptyDescription="暂无BOM物料"
          pagination={false}
          bordered
          scroll={{ x: 'max-content' }}
        />
      </>
    );
  }

  return (
    <Alert
      title="暂无面辅料信息"
      description="此订单尚未录入采购物料，也关联的款号未录入BOM物料清单"
      type="info"
      showIcon
    />
  );
};

export default MaterialTabContent;
