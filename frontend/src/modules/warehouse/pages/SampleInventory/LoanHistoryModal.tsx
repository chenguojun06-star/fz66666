import React, { useEffect, useState } from 'react';
import { Tag, Input, Modal, App } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import RowActions from '@/components/common/RowActions';
import ResizableTable from '@/components/common/ResizableTable';
import { SampleLoan, SampleStock } from './types';
import api from '@/utils/api';
import dayjs from 'dayjs';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import { isSmartFeatureEnabled } from '@/smart/core/featureFlags';
import type { SmartErrorInfo } from '@/smart/core/types';

interface LoanHistoryModalProps {
  visible: boolean;
  stock?: SampleStock;
  onClose: () => void;
  onRefresh: () => void;
}

const LoanHistoryModal: React.FC<LoanHistoryModalProps> = ({ visible, stock, onClose, onRefresh }) => {
  const { message: msgApi } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<SampleLoan[]>([]);
  const [smartError, setSmartError] = useState<SmartErrorInfo | null>(null);
  const [returnModalVisible, setReturnModalVisible] = useState(false);
  const [currentLoan, setCurrentLoan] = useState<SampleLoan | null>(null);
  const [returnRemark, setReturnRemark] = useState('');
  const showSmartErrorNotice = React.useMemo(() => isSmartFeatureEnabled('smart.production.precheck.enabled'), []);

  const reportSmartError = (title: string, reason?: string, code?: string) => {
    if (!showSmartErrorNotice) return;
    setSmartError({ title, reason, code, actionText: '刷新重试' });
  };

  const loadData = async () => {
    if (!stock) return;
    setLoading(true);
    try {
      const res = await api.get('/stock/sample/loan/list', { params: { sampleStockId: stock.id } });
      if (res.code === 200) {
        setData(res.data || []);
        if (showSmartErrorNotice) setSmartError(null);
      }
    } catch (error) {
      console.error(error);
      reportSmartError('借还记录加载失败', '网络异常或服务不可用，请稍后重试', 'SAMPLE_LOAN_HISTORY_LOAD_FAILED');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible && stock) {
      loadData();
    }
  }, [visible, stock]);

  const handleReturnClick = (record: SampleLoan) => {
    setCurrentLoan(record);
    setReturnRemark('');
    setReturnModalVisible(true);
  };

  const handleReturnConfirm = async () => {
    if (!currentLoan) return;
    try {
      const res = await api.post('/stock/sample/return', {
        loanId: currentLoan.id,
        remark: returnRemark
      });
      if (res.code === 200) {
        msgApi.success('归还成功');
        setReturnModalVisible(false);
        loadData(); // 刷新记录
        onRefresh(); // 刷新父页面库存
      } else {
        msgApi.error(res.message || '归还失败');
      }
    } catch (error) {
      console.error(error);
    }
  };

  const columns = [
    {
      title: '借用人',
      dataIndex: 'borrower',
      key: 'borrower',
    },
    {
      title: '数量',
      dataIndex: 'quantity',
      key: 'quantity',
    },
    {
      title: '借出时间',
      dataIndex: 'loanDate',
      key: 'loanDate',
      render: (text: string) => text ? dayjs(text).format('YYYY-MM-DD HH:mm') : '-',
    },
    {
      title: '预计归还',
      dataIndex: 'expectedReturnDate',
      key: 'expectedReturnDate',
      render: (text: string) => text ? dayjs(text).format('YYYY-MM-DD HH:mm') : '-',
    },
    {
      title: '实际归还',
      dataIndex: 'returnDate',
      key: 'returnDate',
      render: (text: string) => text ? dayjs(text).format('YYYY-MM-DD HH:mm') : '-',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Tag color={status === 'borrowed' ? 'processing' : status === 'returned' ? 'success' : 'default'}>
          {status === 'borrowed' ? '借出中' : status === 'returned' ? '已归还' : status}
        </Tag>
      ),
    },
    {
      title: '备注',
      dataIndex: 'remark',
      key: 'remark',
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: SampleLoan) => (
        record.status === 'borrowed' ? (
          <RowActions
            actions={[
              {
                key: 'return',
                label: '归还',
                onClick: () => handleReturnClick(record)
              }
            ]}
          />
        ) : null
      ),
    },
  ];

  return (
    <>
      <ResizableModal
        title={`借还记录 - ${stock?.styleNo} (${stock?.color}/${stock?.size})`}
        open={visible}
        onCancel={onClose}
        footer={null}
        width="40vw"
        initialHeight={typeof window !== 'undefined' ? Math.round(window.innerHeight * 0.5) : 400}
      >
        {showSmartErrorNotice && smartError ? (
          <div style={{ marginBottom: 12 }}>
            <SmartErrorNotice
              error={smartError}
              onFix={() => {
                void loadData();
              }}
            />
          </div>
        ) : null}

        <ResizableTable
          storageKey="loan-history-modal"
          columns={columns}
          dataSource={data}
          rowKey="id"
          loading={loading}
          pagination={false}
          size="small"
        />
      </ResizableModal>

      <Modal
        title="确认归还"
        open={returnModalVisible}
        onCancel={() => setReturnModalVisible(false)}
        onOk={handleReturnConfirm}
      >
        <p>确认归还样衣吗？</p>
        <Input.TextArea
          placeholder="归还备注（选填）"
          value={returnRemark}
          onChange={e => setReturnRemark(e.target.value)}
          rows={3}
        />
      </Modal>
    </>
  );
};

export default LoanHistoryModal;
