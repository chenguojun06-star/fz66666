import React, { useState, useEffect, useMemo } from 'react';
import { Button, Card, Tag, Input, Select, Space , Modal } from 'antd';

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
  // D-362f：勾选批量确认出库（仓库侧闭环）
  const [selectedPickingIds, setSelectedPickingIds] = useState<React.Key[]>([]);
  const [batchOutboundSubmitting, setBatchOutboundSubmitting] = useState(false);

  const handleBatchConfirmOutbound = async () => {
    const pending = selectedPickingIds.map(String);
    if (!pending.length) { message.warning('请先勾选待出库的领料单'); return; }
    let success = 0;
    const fails: string[] = [];
    setBatchOutboundSubmitting(true);
    try {
      const queue = pending.slice();
      const workers = Array.from({ length: Math.min(3, queue.length) }).map(async () => {
        while (queue.length) {
          const id = queue.shift();
          if (!id) continue;
          try {
            const res = await api.post(`/production/material-picking/${id}/confirm-outbound`);
            if (res?.code === 200) success++; else fails.push(res?.message || id);
          } catch (e) { fails.push(e instanceof Error ? e.message : id); }
        }
      });
      await Promise.all(workers);
      if (fails.length === 0) message.success(`批量出库成功（${success} 张）`);
      else if (success > 0) message.warning(`成功 ${success} 张，失败 ${fails.length} 张：${fails[0]}`);
      else message.error(`批量出库失败：${fails[0]}`);
      setSelectedPickingIds([]);
      await fetchList(1, pageSize, { status: statusFilter });
    } finally {
      setBatchOutboundSubmitting(false);
    }
  };
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
            ...(record.status === 'pending' ? [{
              key: 'confirm-outbound',
              label: '确认出库',
              primary: true,
              onClick: () => {
                Modal.confirm({
                  title: '确认出库',
                  content: `领料单 ${record.pickingNo || ''} 将扣减库存并完成出库，是否继续？`,
                  okText: '确认出库',
                  onOk: async () => {
                    const res = await api.post(`/production/material-picking/${record.id}/confirm-outbound`);
                    if (res?.code === 200) { message.success('出库成功'); fetchList(1, pageSize, { status: statusFilter }); }
                    else message.error(res?.message || '出库失败');
                  },
                });
              },
            }] : []),
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
            <Button
              type="primary"
              ghost
              danger={false}
              loading={batchOutboundSubmitting}
              disabled={selectedPickingIds.length === 0}
              onClick={() => { void handleBatchConfirmOutbound(); }}
            >
              批量确认出库{selectedPickingIds.length > 0 ? `（${selectedPickingIds.length}）` : ''}
            </Button>
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
          rowSelection={{
            selectedRowKeys: selectedPickingIds,
            onChange: (keys: React.Key[]) => setSelectedPickingIds(keys),
            getCheckboxProps: (r: any) => ({ disabled: r.status !== 'pending' }),
          }}
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
