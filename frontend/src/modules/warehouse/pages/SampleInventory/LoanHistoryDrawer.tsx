import React, { useEffect, useState } from 'react';
import { Drawer, Table, Button, Tag, Space, Popconfirm, message, Input, Modal } from 'antd';
import { SampleLoan, SampleStock } from './types';
import api from '@/utils/api';
import dayjs from 'dayjs';

interface LoanHistoryDrawerProps {
  visible: boolean;
  stock?: SampleStock;
  onClose: () => void;
  onRefresh: () => void;
}

const LoanHistoryDrawer: React.FC<LoanHistoryDrawerProps> = ({ visible, stock, onClose, onRefresh }) => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<SampleLoan[]>([]);
  const [returnModalVisible, setReturnModalVisible] = useState(false);
  const [currentLoan, setCurrentLoan] = useState<SampleLoan | null>(null);
  const [returnRemark, setReturnRemark] = useState('');

  const loadData = async () => {
    if (!stock) return;
    setLoading(true);
    try {
      const res = await api.get('/stock/sample/loan/list', { params: { sampleStockId: stock.id } });
      if (res.code === 200) {
        setData(res.data || []);
      }
    } catch (error) {
      console.error(error);
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
        message.success('归还成功');
        setReturnModalVisible(false);
        loadData(); // 刷新记录
        onRefresh(); // 刷新父页面库存
      } else {
        message.error(res.message || '归还失败');
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
        record.status === 'borrowed' && (
          <Button type="link" size="small" onClick={() => handleReturnClick(record)}>
            归还
          </Button>
        )
      ),
    },
  ];

  return (
    <>
      <Drawer
        title={`借还记录 - ${stock?.styleNo} (${stock?.color}/${stock?.size})`}
        size="large"
        onClose={onClose}
        open={visible}
      >
        <Table
          columns={columns}
          dataSource={data}
          rowKey="id"
          loading={loading}
          pagination={false}
        />
      </Drawer>

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

export default LoanHistoryDrawer;
