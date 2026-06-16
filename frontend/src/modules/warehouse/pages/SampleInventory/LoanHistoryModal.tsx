import React, { useCallback, useEffect, useState } from 'react';
import { Tag, Input, Modal, App, InputNumber, DatePicker } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import RowActions from '@/components/common/RowActions';
import ResizableTable from '@/components/common/ResizableTable';
import { SampleLoan, SampleStock } from './types';
import api from '@/utils/api';
import { formatDateTime } from '@/utils/datetime';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import { isSmartFeatureEnabled } from '@/smart/core/featureFlags';
import type { SmartErrorInfo } from '@/smart/core/types';
import dayjs from 'dayjs';

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
  const [transferModalVisible, setTransferModalVisible] = useState(false);
  const [currentLoan, setCurrentLoan] = useState<SampleLoan | null>(null);
  const [returnRemark, setReturnRemark] = useState('');
  const [returnQty, setReturnQty] = useState<number>(0);
  const [transferForm, setTransferForm] = useState({ lendTo: '', lendToFactoryName: '', quantity: 0, remark: '' });
  const showSmartErrorNotice = React.useMemo(() => isSmartFeatureEnabled('smart.production.precheck.enabled'), []);

  const reportSmartError = useCallback((title: string, reason?: string, code?: string) => {
    if (!showSmartErrorNotice) return;
    setSmartError({ title, reason, code, actionText: '刷新重试' });
  }, [showSmartErrorNotice]);

  const loadData = useCallback(async () => {
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
  }, [stock, showSmartErrorNotice, reportSmartError]);

  useEffect(() => {
    if (visible && stock) {
      loadData();
    }
  }, [visible, stock, loadData]);

  const handleReturnClick = (record: SampleLoan) => {
    setCurrentLoan(record);
    setReturnQty(record.remainingQuantity || record.quantity || 1);
    setReturnRemark('');
    setReturnModalVisible(true);
  };

  const handleReturnConfirm = async () => {
    if (!currentLoan) return;
    try {
      const res = await api.post('/stock/sample/return', {
        loanId: currentLoan.id,
        returnQuantity: returnQty,
        remark: returnRemark
      });
      if (res.code === 200) {
        msgApi.success('归还成功');
        setReturnModalVisible(false);
        loadData();
        onRefresh();
      } else {
        msgApi.error(res.message || '归还失败');
      }
    } catch (error) {
      console.error(error);
    }
  };

  const handleTransferClick = (record: SampleLoan) => {
    setCurrentLoan(record);
    setTransferForm({
      lendTo: '',
      lendToFactoryName: '',
      quantity: record.remainingQuantity || record.quantity || 1,
      remark: '',
    });
    setTransferModalVisible(true);
  };

  const handleTransferConfirm = async () => {
    if (!currentLoan) return;
    if (!transferForm.lendTo && !transferForm.lendToFactoryName) {
      msgApi.warning('请填写转借入人或工厂');
      return;
    }
    try {
      const res = await api.post('/stock/sample/transfer', {
        sourceLoanId: currentLoan.id,
        lendTo: transferForm.lendTo,
        lendToFactoryName: transferForm.lendToFactoryName,
        quantity: transferForm.quantity,
        remark: transferForm.remark,
      });
      if (res.code === 200) {
        msgApi.success('转借成功');
        setTransferModalVisible(false);
        loadData();
        onRefresh();
      } else {
        msgApi.error(res.message || '转借失败');
      }
    } catch (error) {
      console.error(error);
    }
  };

  const buildLendToDisplay = (record: SampleLoan) => {
    if (record.lendToFactoryName) {
      return record.lendToFactoryName + (record.lendTo ? `(${record.lendTo})` : '');
    }
    return record.lendTo || '-';
  };

  const columns = [
    {
      title: '借出人',
      dataIndex: 'borrower',
      key: 'borrower',
    },
    {
      title: '借给谁',
      key: 'lendTo',
      render: (_: any, record: SampleLoan) => (
        <span>
          {buildLendToDisplay(record)}
          {record.transferFromLoanId && (
            <Tag color="purple" style={{ marginLeft: 4, fontSize: 11 }}>转借</Tag>
          )}
        </span>
      ),
    },
    {
      title: '数量',
      dataIndex: 'quantity',
      key: 'quantity',
    },
    {
      title: '剩余未还',
      key: 'remaining',
      render: (_: any, record: SampleLoan) => record.remainingQuantity ?? record.quantity,
    },
    {
      title: '借出时间',
      dataIndex: 'loanDate',
      key: 'loanDate',
      render: (text: string) => text ? formatDateTime(text) : '-',
    },
    {
      title: '预计归还',
      dataIndex: 'expectedReturnDate',
      key: 'expectedReturnDate',
      render: (text: string) => text ? formatDateTime(text) : '-',
    },
    {
      title: '实际归还',
      dataIndex: 'returnDate',
      key: 'returnDate',
      render: (text: string) => text ? formatDateTime(text) : '-',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        const statusMap: Record<string, { label: string; color: string }> = {
          borrowed: { label: '借出中', color: 'processing' },
          returned: { label: '已归还', color: 'success' },
          lost: { label: '遗失', color: 'error' },
          overdue: { label: '逾期', color: 'warning' },
          damaged: { label: '损坏', color: 'error' },
          transferred: { label: '已转借', color: 'purple' },
        };
        const info = statusMap[status] || { label: '未知', color: 'default' };
        return <Tag color={info.color}>{info.label}</Tag>;
      },
    },
    {
      title: '备注',
      dataIndex: 'remark',
      key: 'remark',
      ellipsis: true,
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
              },
              {
                key: 'transfer',
                label: '转借',
                onClick: () => handleTransferClick(record)
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
        />
      </ResizableModal>

      <Modal
        title="确认归还"
        open={returnModalVisible}
        onCancel={() => setReturnModalVisible(false)}
        onOk={handleReturnConfirm}
        width="30vw" maskClosable={false}
      >
        <p>确认归还样衣吗？</p>
        <div style={{ marginBottom: 8 }}>
          <span>归还数量（剩余未还 {currentLoan?.remainingQuantity || currentLoan?.quantity || 0} 件）：</span>
          <InputNumber
            min={1}
            max={currentLoan?.remainingQuantity || currentLoan?.quantity || 1}
            value={returnQty}
            onChange={v => setReturnQty(v || 1)}
            style={{ width: 120, marginLeft: 8 }}
          />
        </div>
        <Input.TextArea
          placeholder="归还备注（选填）"
          value={returnRemark}
          onChange={e => setReturnRemark(e.target.value)}
          rows={3}
        />
      </Modal>

      <Modal
        title="转借样衣"
        open={transferModalVisible}
        onCancel={() => setTransferModalVisible(false)}
        onOk={handleTransferConfirm}
        width="30vw" maskClosable={false}
      >
        <p>将当前借调转借给其他人或工厂</p>
        <div style={{ marginBottom: 8 }}>
          <span>转借数量（最多 {currentLoan?.remainingQuantity || currentLoan?.quantity || 0} 件）：</span>
          <InputNumber
            min={1}
            max={currentLoan?.remainingQuantity || currentLoan?.quantity || 1}
            value={transferForm.quantity}
            onChange={v => setTransferForm({ ...transferForm, quantity: v || 1 })}
            style={{ width: 120, marginLeft: 8 }}
          />
        </div>
        <Input
          placeholder="转借入人姓名"
          value={transferForm.lendTo}
          onChange={e => setTransferForm({ ...transferForm, lendTo: e.target.value })}
          style={{ marginBottom: 8 }}
        />
        <Input
          placeholder="转借入工厂名称（选填）"
          value={transferForm.lendToFactoryName}
          onChange={e => setTransferForm({ ...transferForm, lendToFactoryName: e.target.value })}
          style={{ marginBottom: 8 }}
        />
        <Input.TextArea
          placeholder="转借备注（选填）"
          value={transferForm.remark}
          onChange={e => setTransferForm({ ...transferForm, remark: e.target.value })}
          rows={2}
        />
      </Modal>
    </>
  );
};

export default LoanHistoryModal;
