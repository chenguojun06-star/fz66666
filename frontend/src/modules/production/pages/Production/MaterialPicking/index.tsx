import React, { useState, useEffect, useMemo } from 'react';
import { Button, Card, Tag, Input, Select, Space } from 'antd';

import ResizableTable from '@/components/common/ResizableTable';
import RowActions from '@/components/common/RowActions';
import api from '@/utils/api';
import dayjs from 'dayjs';
import PickingForm from './PickingForm';
import PickingDetailModal from './PickingDetailModal';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import { isSmartFeatureEnabled } from '@/smart/core/featureFlags';
import type { SmartErrorInfo } from '@/smart/core/types';
import { message } from '@/utils/antdStatic';
import { readPageSize } from '@/utils/pageSizeStore';

/**
 * 状态筛选选项 — 与后端 MaterialPickingController.page 完全对齐
 * 后端状态值：pending（待出库）/ completed（已完成）/ cancelled（已取消）
 */
const PICKING_STATUS_OPTIONS = [
  { label: '全部', value: '' },
  { label: '待出库', value: 'pending' },
  { label: '已完成', value: 'completed' },
  { label: '已取消', value: 'cancelled' },
];

const PICKING_USAGE_TYPE_OPTIONS = [
  { label: '全部用途', value: '' },
  { label: '生产领料', value: 'production' },
  { label: '样品领料', value: 'sample' },
];

const MaterialPickingList: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [dataSource, setDataSource] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [current, setCurrent] = useState(1);
  const [pageSize, setPageSize] = useState(readPageSize(10));
  const [modalVisible, setModalVisible] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [selectedPickingId, setSelectedPickingId] = useState<string | null>(null);
  const [smartError, setSmartError] = useState<SmartErrorInfo | null>(null);
  const showSmartErrorNotice = useMemo(() => isSmartFeatureEnabled('smart.production.precheck.enabled'), []);

  // 筛选状态
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [usageType, setUsageType] = useState('');

  const reportSmartError = (title: string, reason?: string, code?: string) => {
    if (!showSmartErrorNotice) return;
    setSmartError({ title, reason, code });
  };

  const fetchList = async (page = current, size = pageSize, overrides?: { keyword?: string; status?: string; usageType?: string }) => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { page, pageSize: size };
      const kw = overrides?.keyword ?? keyword;
      const st = overrides?.status ?? statusFilter;
      const ut = overrides?.usageType ?? usageType;
      if (kw) params.keyword = kw;
      if (st) params.status = st;
      if (ut) params.usageType = ut;
      const res: any = await api.get('/production/picking/list', { params });
      if (res?.code === 200) {
        setDataSource(res.data.records);
        setTotal(res.data.total);
        if (showSmartErrorNotice) setSmartError(null);
      }
    } catch (err: unknown) {
      reportSmartError('领料记录加载失败', err instanceof Error ? err.message : '网络异常或服务不可用，请稍后重试', 'MATERIAL_PICKING_LIST_LOAD_FAILED');
      message.error(`获取领料记录失败: ${err instanceof Error ? err.message : '请检查网络连接'}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchList(1, pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const columns = [
    {
      title: '领料单号',
      dataIndex: 'pickingNo',
      width: 150,
      render: (text: string, record: any) => (
        <Button type="link" style={{ padding: 0, height: 'auto' }} onClick={() => {
          setSelectedPickingId(record.id);
          setDetailVisible(true);
        }}>{text}</Button>
      ),
    },
    {
      title: '生产订单',
      dataIndex: 'orderNo',
      width: 150,
    },
    {
      title: '款号',
      dataIndex: 'styleNo',
      width: 120,
    },
    {
      title: '领料人',
      dataIndex: 'pickerName',
      width: 100,
    },
    {
      title: '领料时间',
      dataIndex: 'pickTime',
      width: 160,
      render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD') : '-',
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (s: string) => {
        if (s === 'completed') return <Tag color="green">已完成</Tag>;
        if (s === 'pending') return <Tag color="orange">待出库</Tag>;
        if (s === 'cancelled') return <Tag color="default">已取消</Tag>;
        return <Tag color="default">{s || '未知'}</Tag>;
      },
    },
    {
      title: '审核状态',
      dataIndex: 'auditStatus',
      width: 100,
      render: (status: string, record: any) => {
        if (record.status !== 'completed') return '-';
        if (status === 'APPROVED') return <Tag color="green">已审核</Tag>;
        if (status === 'REJECTED') return <Tag color="red">已拒绝</Tag>;
        return <Tag color="orange">待审核</Tag>;
      },
    },
    {
      title: '财务状态',
      dataIndex: 'financeStatus',
      width: 100,
      render: (status: string, record: any) => {
        if (record.status !== 'completed') return '-';
        if (record.auditStatus !== 'APPROVED') return '-';
        if (status === 'SETTLED') return <Tag color="green">已平账</Tag>;
        if (status === 'PENDING') return <Tag color="orange">待结算</Tag>;
        return <Tag color="default">未知</Tag>;
      },
    },
    {
      title: '备注',
      dataIndex: 'remark',
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_: any, record: any) => (
        <RowActions
          actions={[
            {
              key: 'detail',
              label: '详情',
              onClick: () => {
                setSelectedPickingId(record.id);
                setDetailVisible(true);
              }
            }
          ]}
        />
      ),
    },
  ];

  const handleStatusChange = (value: string) => {
    setStatusFilter(value);
    fetchList(1, pageSize, { status: value });
  };

  const handleUsageTypeChange = (value: string) => {
    setUsageType(value);
    fetchList(1, pageSize, { usageType: value });
  };

  const handleKeywordSearch = (value: string) => {
    setKeyword(value);
    fetchList(1, pageSize, { keyword: value });
  };

  const handleReset = () => {
    setKeyword('');
    setStatusFilter('');
    setUsageType('');
    fetchList(1, pageSize, { keyword: '', status: '', usageType: '' });
  };

  return (
    <>
      <Card variant="borderless">
        {showSmartErrorNotice && smartError ? (
          <Card style={{ marginBottom: 12 }}>
            <SmartErrorNotice error={smartError} onFix={() => { void fetchList(); }} />
          </Card>
        ) : null}
        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <Space wrap>
            <Input.Search
              placeholder="搜索领料单号/订单/款号/领料人"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onSearch={handleKeywordSearch}
              style={{ width: 280 }}
              allowClear
            />
            <Select
              value={statusFilter}
              onChange={handleStatusChange}
              options={PICKING_STATUS_OPTIONS}
              style={{ width: 120 }}
              placeholder="状态"
            />
            <Select
              value={usageType}
              onChange={handleUsageTypeChange}
              options={PICKING_USAGE_TYPE_OPTIONS}
              style={{ width: 130 }}
              placeholder="用途"
            />
            <Button onClick={handleReset}>重置</Button>
          </Space>
          <Button type="primary" onClick={() => setModalVisible(true)}>
            新建领料
          </Button>
        </div>
        <ResizableTable
          loading={loading}
          dataSource={dataSource}
          columns={columns}
          rowKey="id"
          stickyHeader
          emptyDescription="暂无领料数据"
          pagination={{
            total,
            current,
            pageSize,
            showTotal: (total) => `共 ${total} 条`,
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50', '100'],
            onChange: (p, s) => {
              setCurrent(p);
              setPageSize(s);
              fetchList(p, s);
            },
          }}
        />
      </Card>
      <PickingForm
        visible={modalVisible}
        onCancel={() => setModalVisible(false)}
        onSuccess={() => {
          setModalVisible(false);
          fetchList(1);
        }}
      />
      <PickingDetailModal
        visible={detailVisible}
        pickingId={selectedPickingId}
        onCancel={() => {
          setDetailVisible(false);
          setSelectedPickingId(null);
        }}
      />
    </>
  );
};

export default MaterialPickingList;
