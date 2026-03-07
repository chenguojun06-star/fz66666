import React, { useEffect, useMemo, useState } from 'react';
import { Card, Spin, Tag, Typography, message } from 'antd';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import ResizableModal from '@/components/common/ResizableModal';
import ResizableTable from '@/components/common/ResizableTable';
import {
  ModalField,
  ModalFieldGrid,
  ModalHeaderCard,
  ModalInfoCard,
  ModalPrimaryField,
} from '@/components/common/ModalContentLayout';
import { procurementApi, type MaterialInboundRecord } from '@/services/procurement/procurementApi';

const { Paragraph } = Typography;

const formatDate = (value?: string) => {
  if (!value) return '-';
  return String(value).replace('T', ' ').slice(0, 19);
};

interface MaterialInboundHistoryModalProps {
  open: boolean;
  purchaseId?: string | null;
  inboundRecordId?: string | null;
  materialCode?: string | null;
  onClose: () => void;
}

const MaterialInboundHistoryModal: React.FC<MaterialInboundHistoryModalProps> = ({
  open,
  purchaseId,
  inboundRecordId,
  materialCode,
  onClose,
}) => {
  const [records, setRecords] = useState<MaterialInboundRecord[]>([]);
  const [selected, setSelected] = useState<MaterialInboundRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10, total: 0 });

  useEffect(() => {
    if (!open || (!purchaseId && !materialCode && !inboundRecordId)) {
      setRecords([]);
      setSelected(null);
      return;
    }

    const load = async () => {
      setLoading(true);
      try {
        const [listRes, detailRes] = await Promise.all([
          procurementApi.listMaterialInboundRecords({
            pageNum: pagination.current,
            pageSize: pagination.pageSize,
            purchaseId: purchaseId || undefined,
            materialCode: materialCode || undefined,
          }),
          inboundRecordId ? procurementApi.getMaterialInboundRecordDetail(inboundRecordId) : Promise.resolve(null),
        ]);

        const listData = (listRes as any)?.data ?? listRes;
        const detailData = detailRes ? ((detailRes as any)?.data ?? detailRes) : null;
        const listRecords = listData?.records ?? [];
        setRecords(listRecords);
        setPagination(prev => ({
          ...prev,
          total: listData?.total ?? 0,
        }));

        if (detailData) {
          setSelected(detailData);
        } else if (listRecords.length > 0) {
          setSelected(listRecords[0]);
        } else {
          setSelected(null);
        }
      } catch {
        setRecords([]);
        setSelected(null);
        message.error('入库记录加载失败');
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [open, purchaseId, materialCode, inboundRecordId, pagination.current, pagination.pageSize]);

  const totalInboundQty = useMemo(
    () => records.reduce((sum, item) => sum + Number(item.inboundQuantity ?? 0), 0),
    [records],
  );

  const columns: ColumnsType<MaterialInboundRecord> = [
    {
      title: '入库单号',
      dataIndex: 'inboundNo',
      width: 160,
      render: (value, record) => (
        <a onClick={() => setSelected(record)}>{value || record.id || '-'}</a>
      ),
    },
    { title: '数量', dataIndex: 'inboundQuantity', width: 80 },
    { title: '库位', dataIndex: 'warehouseLocation', width: 120, render: value => value || '-' },
    { title: '操作人', dataIndex: 'operatorName', width: 100, render: value => value || '-' },
    { title: '入库时间', dataIndex: 'inboundTime', width: 170, render: value => formatDate(value) },
    {
      title: '当前',
      width: 70,
      render: (_value, record) => (
        record.id && inboundRecordId && String(record.id) === String(inboundRecordId)
          ? <Tag color="blue">当前</Tag>
          : null
      ),
    },
  ];

  return (
    <ResizableModal
      title="入库记录"
      open={open}
      onCancel={onClose}
      onOk={onClose}
      okText="关闭"
      cancelButtonProps={{ style: { display: 'none' } }}
      width="60vw"
      destroyOnClose
    >
      {loading ? (
        <div style={{ padding: '48px 0', textAlign: 'center' }}>
          <Spin />
        </div>
      ) : (
        <div style={{ marginTop: 12 }}>
          <ModalHeaderCard>
            <div style={{ flex: 1, minWidth: 0 }}>
              <ModalPrimaryField label="当前入库单" value={selected?.inboundNo || selected?.id || '-'} />
              <div style={{ marginTop: 8 }}>
                <ModalField label="采购单ID" value={purchaseId || '-'} />
              </div>
            </div>
            <div style={{ minWidth: 180 }}>
              <ModalField label="入库记录数" value={pagination.total || records.length} />
              <div style={{ marginTop: 8 }}>
                <ModalField label="当前页入库总量" value={totalInboundQty} />
              </div>
            </div>
          </ModalHeaderCard>

          <Card size="small" style={{ marginBottom: 12 }} bodyStyle={{ padding: 0 }}>
            <ResizableTable
              rowKey="id"
              columns={columns}
              dataSource={records}
              loading={loading}
              size="small"
              pagination={{
                current: pagination.current,
                pageSize: pagination.pageSize,
                total: pagination.total,
                showSizeChanger: true,
                showTotal: count => `共 ${count} 条`,
              }}
              onChange={(page: TablePaginationConfig) => {
                setPagination(prev => ({
                  ...prev,
                  current: page.current ?? 1,
                  pageSize: page.pageSize ?? 10,
                }));
              }}
              scroll={{ x: 760 }}
            />
          </Card>

          <ModalInfoCard>
            <ModalFieldGrid columns={2}>
              <ModalField label="物料编码" value={selected?.materialCode || '-'} />
              <ModalField label="物料名称" value={selected?.materialName || '-'} />
              <ModalField label="物料类型" value={selected?.materialType || '-'} />
              <ModalField label="颜色/规格" value={[selected?.color, selected?.size].filter(Boolean).join(' / ') || '-'} />
              <ModalField label="供应商" value={selected?.supplierName || '-'} />
              <ModalField label="联系方式" value={[selected?.supplierContactPerson, selected?.supplierContactPhone].filter(Boolean).join(' / ') || '-'} />
              <ModalField label="入库数量" value={selected?.inboundQuantity ?? '-'} />
              <ModalField label="仓库库位" value={selected?.warehouseLocation || '-'} />
              <ModalField label="操作人" value={selected?.operatorName || '-'} />
              <ModalField label="入库时间" value={formatDate(selected?.inboundTime || selected?.createTime)} />
            </ModalFieldGrid>
            <div style={{ marginTop: 12 }}>
              <Typography.Text strong style={{ display: 'block', marginBottom: 6 }}>备注</Typography.Text>
              <Paragraph style={{ marginBottom: 0, minHeight: 22, whiteSpace: 'pre-wrap' }}>
                {selected?.remark || '-'}
              </Paragraph>
            </div>
          </ModalInfoCard>
        </div>
      )}
    </ResizableModal>
  );
};

export default MaterialInboundHistoryModal;