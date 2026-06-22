import React, { useEffect, useState } from 'react';
import { App, Descriptions, Divider, Table, Tag } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import shipmentReconciliationApi from '@/services/finance/shipmentReconciliationApi';
import { unwrapApiData } from '@/utils/api';
import { errorHandler } from '@/utils/errorHandling';
import { formatDateTime } from '@/utils/datetime';
import { canViewPrice } from '@/utils/sensitiveDataMask';
import type { ShipmentReconciliation, DeductionItem } from '@/types/finance';
import { useUser } from '@/utils/AuthContext';

/** 出货对账状态配置 */
const getStatusConfig = (status: string) => {
  const map: Record<string, { text: string; color: string }> = {
    pending: { text: '待核实', color: 'blue' },
    verified: { text: '已核实', color: 'orange' },
    approved: { text: '已审批', color: 'green' },
    paid: { text: '已付款', color: 'purple' },
    rejected: { text: '已驳回', color: 'red' },
  };
  return map[status] ?? { text: status || '未知', color: 'default' };
};

interface ShipmentReconDetailModalProps {
  open: boolean;
  record: ShipmentReconciliation | null;
  onClose: () => void;
  onRefresh?: () => void;
}

const ShipmentReconDetailModal: React.FC<ShipmentReconDetailModalProps> = ({
  open, record, onClose, onRefresh,
}) => {
  const { message } = App.useApp();
  const { user } = useUser();
  const [detail, setDetail] = useState<ShipmentReconciliation | null>(null);
  const [deductionItems, setDeductionItems] = useState<DeductionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [deductionLoading, setDeductionLoading] = useState(false);

  const viewPrice = canViewPrice(user);

  useEffect(() => {
    if (!open || !record?.id) return;
    const fetchDetail = async () => {
      setLoading(true);
      try {
        const res = await shipmentReconciliationApi.getById(String(record.id));
        const data = unwrapApiData<ShipmentReconciliation>(res, '获取对账详情失败');
        setDetail(data ?? record);
      } catch {
        setDetail(record);
      } finally {
        setLoading(false);
      }
    };
    const fetchDeductions = async () => {
      setDeductionLoading(true);
      try {
        const res = await shipmentReconciliationApi.getDeductionItems(String(record.id));
        const data = unwrapApiData<DeductionItem[]>(res, '获取扣款明细失败');
        setDeductionItems(data ?? []);
      } catch {
        setDeductionItems([]);
      } finally {
        setDeductionLoading(false);
      }
    };
    fetchDetail();
    fetchDeductions();
  }, [open, record]);

  const d = detail ?? record;
  const statusCfg = d ? getStatusConfig(d.status) : null;

  const deductionColumns = [
    { title: '扣款类型', dataIndex: 'deductionType', key: 'deductionType', width: 120 },
    { title: '扣款金额', dataIndex: 'deductionAmount', key: 'deductionAmount', width: 120, align: 'right' as const,
      render: (v: number) => viewPrice ? `¥${(v ?? 0).toFixed(2)}` : '***',
    },
    { title: '说明', dataIndex: 'description', key: 'description', ellipsis: true },
  ];

  return (
    <ResizableModal
      title="出货对账详情"
      open={open}
      onCancel={onClose}
      footer={null}
      width="75vw"
      initialHeight={500}
      minWidth={400}
      scaleWithViewport
    >
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-tertiary)' }}>加载中...</div>
      ) : d ? (
        <>
          {/* 基本信息 */}
          <Descriptions bordered size="small" column={3} title="基本信息">
            <Descriptions.Item label="对账单号">{d.reconciliationNo}</Descriptions.Item>
            <Descriptions.Item label="客户名称">{d.customerName}</Descriptions.Item>
            <Descriptions.Item label="订单号">{d.orderNo}</Descriptions.Item>
            <Descriptions.Item label="款号">{d.styleNo}</Descriptions.Item>
            <Descriptions.Item label="款名">{d.styleName || '-'}</Descriptions.Item>
            <Descriptions.Item label="数量">
              {d.quantity ?? 0}{d.productionCompletedQuantity != null ? ` / 已完成 ${d.productionCompletedQuantity}` : ''}
            </Descriptions.Item>
            <Descriptions.Item label="单价">{viewPrice ? `¥${(d.unitPrice ?? 0).toFixed(2)}` : '***'}</Descriptions.Item>
            <Descriptions.Item label="对账日期">{formatDateTime(d.reconciliationDate) || '-'}</Descriptions.Item>
            <Descriptions.Item label="状态">
              {statusCfg && <Tag color={statusCfg.color}>{statusCfg.text}</Tag>}
            </Descriptions.Item>
          </Descriptions>

          {/* 金额信息 */}
          <Divider style={{ margin: '16px 0 8px' }}>金额信息</Divider>
          <Descriptions bordered size="small" column={3}>
            <Descriptions.Item label="总金额">
              <span style={{ color: 'var(--color-primary)' }}>{viewPrice ? `¥${(d.totalAmount ?? 0).toFixed(2)}` : '***'}</span>
            </Descriptions.Item>
            <Descriptions.Item label="扣款金额">
              <span style={{ color: (d.deductionAmount ?? 0) > 0 ? 'var(--color-error)' : undefined }}>
                {viewPrice ? `¥${(d.deductionAmount ?? 0).toFixed(2)}` : '***'}
              </span>
            </Descriptions.Item>
            <Descriptions.Item label="最终金额">
              <span style={{ fontWeight: 600 }}>{viewPrice ? `¥${(d.finalAmount ?? 0).toFixed(2)}` : '***'}</span>
            </Descriptions.Item>
          </Descriptions>

          {/* 成本利润信息 */}
          <Divider style={{ margin: '16px 0 8px' }}>成本利润</Divider>
          <Descriptions bordered size="small" column={3}>
            <Descriptions.Item label="物料成本">{viewPrice && d.totalMaterialCost != null ? `¥${d.totalMaterialCost.toFixed(2)}` : '-'}</Descriptions.Item>
            <Descriptions.Item label="工序成本">{viewPrice && d.totalProcessCost != null ? `¥${d.totalProcessCost.toFixed(2)}` : '-'}</Descriptions.Item>
            <Descriptions.Item label="总成本">{viewPrice && d.totalCost != null ? `¥${d.totalCost.toFixed(2)}` : '-'}</Descriptions.Item>
            <Descriptions.Item label="利润">
              {viewPrice && d.profit != null ? (
                <span style={{ color: d.profit >= 0 ? 'var(--color-success)' : 'var(--color-error)' }}>
                  ¥{d.profit.toFixed(2)}
                </span>
              ) : '-'}
            </Descriptions.Item>
            <Descriptions.Item label="利润率">
              {d.profitMargin != null ? `${d.profitMargin.toFixed(1)}%` : '-'}
            </Descriptions.Item>
          </Descriptions>

          {/* 扣款明细 */}
          <Divider style={{ margin: '16px 0 8px' }}>扣款明细</Divider>
          <Table
            columns={deductionColumns}
            dataSource={deductionItems}
            rowKey={(item) => item.id || String(item.deductionType)}
            loading={deductionLoading}
            size="small"
            pagination={false}
            locale={{ emptyText: '无扣款明细' }}
          />

          {/* 备注 */}
          {(d.remark || d.reReviewReason) && (
            <>
              <Divider style={{ margin: '16px 0 8px' }}>备注</Divider>
              <Descriptions bordered size="small" column={1}>
                {d.remark && <Descriptions.Item label="备注">{d.remark}</Descriptions.Item>}
                {d.reReviewReason && <Descriptions.Item label="驳回原因">{d.reReviewReason}</Descriptions.Item>}
              </Descriptions>
            </>
          )}
        </>
      ) : (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-tertiary)' }}>无数据</div>
      )}
    </ResizableModal>
  );
};

export default ShipmentReconDetailModal;
