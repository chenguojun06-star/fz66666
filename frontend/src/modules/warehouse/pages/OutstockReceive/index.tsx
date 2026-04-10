import React, { useState, useEffect, useCallback } from 'react';
import { Card, Tag, App } from 'antd';
import { CheckCircleOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import Layout from '@/components/Layout';
import ResizableTable from '@/components/common/ResizableTable';
import StandardPagination from '@/components/common/StandardPagination';
import StandardSearchBar from '@/components/common/StandardSearchBar';
import RowActions from '@/components/common/RowActions';
import type { RowAction } from '@/components/common/RowActions';
import { useTablePagination } from '@/hooks';
import api from '@/utils/api';
import type { ProductOutstock } from '@/types/production';
import dayjs from 'dayjs';

const OutstockReceive: React.FC = () => {
  const { message, modal } = App.useApp();
  const [dataSource, setDataSource] = useState<ProductOutstock[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [keyword, setKeyword] = useState('');
  const { pagination, onChange, setTotal: setPagTotal } = useTablePagination(20);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/production/outstock/list', {
        params: { page: pagination.current, pageSize: pagination.pageSize, keyword: keyword || undefined },
      });
      const data = res.data || res;
      setDataSource(Array.isArray(data.records) ? data.records : (Array.isArray(data) ? data : []));
      setTotal(data.total || 0);
      setPagTotal(data.total || 0);
    } catch {
      message.error('获取出库记录失败');
    } finally {
      setLoading(false);
    }
  }, [pagination.current, pagination.pageSize, keyword, message]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleReceive = useCallback((record: ProductOutstock) => {
    modal.confirm({
      title: '确认收货',
      content: `确认已收到出库单 ${record.outstockNo} 的货物（${record.outstockQuantity} 件）？`,
      okText: '确认收货',
      cancelText: '取消',
      onOk: async () => {
        try {
          await api.post(`/production/outstock/${record.id}/receive`);
          message.success('收货确认成功');
          fetchData();
        } catch {
          message.error('收货确认失败');
        }
      },
    });
  }, [modal, message, fetchData]);

  const columns: ColumnsType<ProductOutstock> = [
    { title: '出库单号', dataIndex: 'outstockNo', width: 160 },
    { title: '订单号', dataIndex: 'orderNo', width: 150 },
    { title: '款号', dataIndex: 'styleNo', width: 120 },
    { title: '款式名称', dataIndex: 'styleName', width: 140 },
    { title: '出库数量', dataIndex: 'outstockQuantity', width: 100, align: 'right' },
    { title: '出库类型', dataIndex: 'outstockType', width: 100 },
    {
      title: '收货状态', dataIndex: 'receiveStatus', width: 100, align: 'center',
      render: (val: string) => val === 'received'
        ? <Tag color="green" icon={<CheckCircleOutlined />}>已收货</Tag>
        : <Tag color="orange">待收货</Tag>,
    },
    {
      title: '收货时间', dataIndex: 'receiveTime', width: 160,
      render: (val: string) => val ? dayjs(val).format('YYYY-MM-DD HH:mm') : '-',
    },
    { title: '收货人', dataIndex: 'receivedByName', width: 100, render: (v: string) => v || '-' },
    {
      title: '出库时间', dataIndex: 'createTime', width: 160,
      render: (val: string) => val ? dayjs(val).format('YYYY-MM-DD HH:mm') : '-',
    },
    { title: '备注', dataIndex: 'remark', width: 140, ellipsis: true },
    {
      title: '操作', key: 'actions', width: 120, fixed: 'right' as const,
      render: (_: unknown, record: ProductOutstock) => {
        const actions: RowAction[] = [];
        if (record.receiveStatus !== 'received') {
          actions.push({
            key: 'receive',
            label: '确认收货',
            primary: true,
            onClick: () => handleReceive(record),
          });
        }
        return <RowActions actions={actions} />;
      },
    },
  ];

  return (
    <Layout>
      <Card>
        <StandardSearchBar
          onSearchChange={(val) => { setKeyword(val); onChange(1, pagination.pageSize); }}
          searchPlaceholder="搜索出库单号/订单号/款号"
          showDate={false}
          showStatus={false}
        />
        <ResizableTable<ProductOutstock>
          columns={columns}
          dataSource={dataSource}
          rowKey="id"
          loading={loading}
          scroll={{ x: 1400 }}
          pagination={false}
        />
        <StandardPagination
          current={pagination.current}
          pageSize={pagination.pageSize}
          total={total}
          onChange={onChange}
        />
      </Card>
    </Layout>
  );
};

export default OutstockReceive;
