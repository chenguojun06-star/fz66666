import React, { useEffect, useMemo, useState } from 'react';
import { Button, Empty, Space, Spin, Table, Tag, Typography, message } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import {
  ModalField,
  ModalFieldGrid,
  ModalHeaderCard,
  ModalInfoCard,
  ModalPrimaryField,
} from '@/components/common/ModalContentLayout';
import { procurementApi } from '@/services/procurement/procurementApi';
import type { MaterialReconciliation } from '@/types/finance';

const { Paragraph, Text } = Typography;

const statusColorMap: Record<string, string> = {
  pending: 'default',
  verified: 'processing',
  approved: 'blue',
  paid: 'success',
  rejected: 'red',
};

const statusLabelMap: Record<string, string> = {
  pending: '待审核',
  verified: '已审核',
  approved: '已批准',
  paid: '已支付',
  rejected: '已驳回',
};

const formatDate = (value?: string) => {
  if (!value) return '-';
  return String(value).replace('T', ' ').slice(0, 16);
};

const formatAmount = (value?: number) => {
  if (value == null) return '-';
  return `￥${Number(value).toLocaleString()}`;
};

interface MaterialReconciliationHistoryModalProps {
  open: boolean;
  purchaseId?: string;
  purchaseNo?: string;
  onClose: () => void;
}

const MaterialReconciliationHistoryModal: React.FC<MaterialReconciliationHistoryModalProps> = ({
  open,
  purchaseId,
  purchaseNo,
  onClose,
}) => {
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [records, setRecords] = useState<MaterialReconciliation[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<MaterialReconciliation | null>(null);

  useEffect(() => {
    if (!open || !purchaseId) {
      setRecords([]);
      setSelectedRecord(null);
      return;
    }

    const load = async () => {
      setLoading(true);
      try {
        const res = await procurementApi.listMaterialReconciliations(purchaseId, { page: 1, pageSize: 50 });
        const data = (res as any)?.data ?? res;
        const list = Array.isArray(data?.records) ? data.records : [];
        setRecords(list);
        setSelectedRecord(list[0] ?? null);
      } catch (error: any) {
        setRecords([]);
        setSelectedRecord(null);
        message.error(error?.response?.data?.message || '对账记录加载失败');
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [open, purchaseId]);

  const handleSelect = async (record: MaterialReconciliation) => {
    if (!record.id) {
      setSelectedRecord(record);
      return;
    }
    setDetailLoading(true);
    try {
      const res = await procurementApi.getMaterialReconciliationDetail(record.id);
      const data = (res as any)?.data ?? res;
      setSelectedRecord(data ?? record);
    } catch (error: any) {
      setSelectedRecord(record);
      message.error(error?.response?.data?.message || '对账详情加载失败');
    } finally {
      setDetailLoading(false);
    }
  };

  const summary = useMemo(() => {
    return records.reduce(
      (acc, record) => {
        acc.totalAmount += Number(record.totalAmount || 0);
        acc.finalAmount += Number(record.finalAmount || 0);
        return acc;
      },
      { totalAmount: 0, finalAmount: 0 },
    );
  }, [records]);

  return (
    <ResizableModal
      title={`采购单对账记录${purchaseNo ? ` · ${purchaseNo}` : ''}`}
      open={open}
      onCancel={onClose}
      onOk={onClose}
      okText="关闭"
      cancelButtonProps={{ style: { display: 'none' } }}
      width="60vw"
      initialHeight={Math.round(window.innerHeight * 0.82)}
      destroyOnClose
    >
      {loading ? (
        <div style={{ padding: '48px 0', textAlign: 'center' }}>
          <Spin />
        </div>
      ) : records.length === 0 ? (
        <Empty description="该采购单还没有生成物料对账记录" style={{ padding: '24px 0' }} />
      ) : (
        <Space direction="vertical" size={12} style={{ display: 'flex', marginTop: 12 }}>
          <ModalHeaderCard>
            <div style={{ flex: 1, minWidth: 0 }}>
              <ModalPrimaryField label="关联采购单" value={purchaseNo || '-'} />
            </div>
            <div style={{ minWidth: 220 }}>
              <ModalField label="对账单数" value={`${records.length} 条`} />
              <div style={{ marginTop: 8 }}>
                <ModalField label="最终金额汇总" value={formatAmount(summary.finalAmount)} />
              </div>
            </div>
          </ModalHeaderCard>

          <Table<MaterialReconciliation>
            rowKey={(record) => String(record.id || record.reconciliationNo)}
            size="small"
            pagination={false}
            dataSource={records}
            columns={[
              {
                title: '对账单号',
                dataIndex: 'reconciliationNo',
                width: 160,
                render: (_value, record) => (
                  <Button type="link" size="small" style={{ padding: 0 }} onClick={() => void handleSelect(record)}>
                    {record.reconciliationNo || '-'}
                  </Button>
                ),
              },
              {
                title: '状态',
                dataIndex: 'status',
                width: 100,
                render: (value: string) => {
                  const key = String(value || '').trim().toLowerCase();
                  return <Tag color={statusColorMap[key] || 'default'}>{statusLabelMap[key] || value || '-'}</Tag>;
                },
              },
              {
                title: '实到数量',
                dataIndex: 'quantity',
                width: 100,
                render: (value: number, record) => `${value || 0}${record.unit ? ` ${record.unit}` : ''}`,
              },
              {
                title: '单价',
                dataIndex: 'unitPrice',
                width: 110,
                render: (value: number) => formatAmount(value),
              },
              {
                title: '最终金额',
                dataIndex: 'finalAmount',
                width: 120,
                render: (value: number) => formatAmount(value),
              },
              {
                title: '对账日期',
                dataIndex: 'reconciliationDate',
                width: 160,
                render: (value: string) => formatDate(value),
              },
            ]}
          />

          <ModalInfoCard>
            {detailLoading ? (
              <div style={{ padding: '24px 0', textAlign: 'center' }}>
                <Spin size="small" />
              </div>
            ) : selectedRecord ? (
              <>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>对账详情</div>
                <ModalFieldGrid columns={2}>
                  <ModalField label="对账单号" value={selectedRecord.reconciliationNo || '-'} />
                  <ModalField label="供应商" value={selectedRecord.supplierName || '-'} />
                  <ModalField label="物料编码" value={selectedRecord.materialCode || '-'} />
                  <ModalField label="物料名称" value={selectedRecord.materialName || '-'} />
                  <ModalField label="采购单号" value={selectedRecord.purchaseNo || '-'} />
                  <ModalField label="订单号" value={selectedRecord.orderNo || '-'} />
                  <ModalField label="款号" value={selectedRecord.styleNo || '-'} />
                  <ModalField label="库区" value={selectedRecord.warehouseLocation || '-'} />
                  <ModalField label="实到数量" value={`${selectedRecord.quantity || 0}${selectedRecord.unit ? ` ${selectedRecord.unit}` : ''}`} />
                  <ModalField label="采购单价" value={formatAmount(selectedRecord.unitPrice)} />
                  <ModalField label="采购总额" value={formatAmount(selectedRecord.totalAmount)} />
                  <ModalField label="扣款金额" value={formatAmount(selectedRecord.deductionAmount)} />
                  <ModalField label="最终金额" value={formatAmount(selectedRecord.finalAmount)} />
                  <ModalField label="状态" value={statusLabelMap[String(selectedRecord.status || '').trim().toLowerCase()] || selectedRecord.status || '-'} />
                  <ModalField label="入库日期" value={formatDate(selectedRecord.inboundDate)} />
                  <ModalField label="对账日期" value={formatDate(selectedRecord.reconciliationDate)} />
                </ModalFieldGrid>
                <div style={{ marginTop: 12 }}>
                  <Text strong style={{ display: 'block', marginBottom: 6 }}>备注</Text>
                  <Paragraph style={{ marginBottom: 0, minHeight: 22, whiteSpace: 'pre-wrap' }}>
                    {selectedRecord.remark || '该对账单没有备注'}
                  </Paragraph>
                </div>
              </>
            ) : (
              <div style={{ color: '#8c8c8c' }}>请选择一条对账记录查看详情</div>
            )}
          </ModalInfoCard>
        </Space>
      )}
    </ResizableModal>
  );
};

export default MaterialReconciliationHistoryModal;
