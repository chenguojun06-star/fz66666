/**
 * LogModal - 操作日志弹窗
 * 功能：显示订单的扫码记录和操作日志
 */
import React from 'react';
import { Table, Tag } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import { ScanRecord } from '@/types/production';
import { formatDateTime } from '@/utils/datetime';

interface LogModalProps {
  visible: boolean;
  title: string;
  records: ScanRecord[];
  loading: boolean;
  onClose: () => void;
}

const scanTypeLabel: Record<string, string> = {
  material: '物料',
  procurement: '采购',
  cutting: '裁剪',
  production: '生产',
  sewing: '车缝',
  ironing: '整烫',
  packaging: '包装',
  quality: '质检',
  warehouse: '入库',
  shipment: '出货',
};

const LogModal: React.FC<LogModalProps> = ({
  visible,
  title,
  records,
  loading,
  onClose,
}) => {
  const columns = [
    {
      title: '类型',
      dataIndex: 'scanType',
      key: 'scanType',
      width: 90,
      render: (v: string) => scanTypeLabel[v] || v || '-',
    },
    {
      title: '环节',
      dataIndex: 'progressStage',
      key: 'progressStage',
      width: 140,
      render: (v: string, record: ScanRecord) => v || record.processName || '-',
    },
    {
      title: '操作人',
      dataIndex: 'operatorName',
      key: 'operatorName',
      width: 120,
      render: (v: string) => v || '-',
    },
    {
      title: '结果',
      dataIndex: 'scanResult',
      key: 'scanResult',
      width: 90,
      render: (v: string) => {
        const text = String(v || '').trim();
        if (text === 'success') return <Tag color="success">成功</Tag>;
        if (text === 'failure') return <Tag color="error">失败</Tag>;
        return v || '-';
      },
    },
    {
      title: '时间',
      dataIndex: 'scanTime',
      key: 'scanTime',
      width: 170,
      render: (v: any) => formatDateTime(v),
    },
    {
      title: '备注',
      dataIndex: 'remark',
      key: 'remark',
      render: (v: string) => v || '-',
    },
  ];

  return (
    <ResizableModal
      title={title}
      visible={visible}
      onCancel={onClose}
      footer={null}
      defaultWidth="60vw"
      defaultHeight="60vh"
    >
      <Table
        dataSource={records}
        columns={columns}
        loading={loading}
        rowKey={(record) => record.id || `${record.scanTime}-${record.operatorName}`}
        pagination={{
          pageSize: 50,
          showSizeChanger: true,
          showTotal: (total) => `共 ${total} 条记录`,
        }}
        scroll={{ y: 'calc(60vh - 200px)' }}
        size="small"
      />
    </ResizableModal>
  );
};

export default LogModal;
