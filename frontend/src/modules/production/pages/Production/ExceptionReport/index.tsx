import React, { useCallback, useEffect, useState } from 'react';
import { App, Button, Card, Input, Select, Space, Table, Tag, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ReloadOutlined, CheckCircleOutlined, UndoOutlined } from '@ant-design/icons';
import { useSearchParams } from 'react-router-dom';
import { isSupervisorOrAboveUser, useUser } from '@/utils/AuthContext';
import exceptionReportApi, { type ProductionExceptionReport } from '@/services/production/exceptionReportApi';

/**
 * 生产异常报告处理页（D-417）
 *
 * 目的：补齐「异常报告只有手机端能处理、PC 端点了只看订单流程页」的不对称，
 *       让 PC 与手机端共用同一套接口，一端处理另一端立即同步。
 *
 * 接口：
 *   GET  /production/exception/list
 *   POST /production/exception/{id}/handle?action=resolve|reopen&note=
 *
 * 状态：PENDING=待处理 → RESOLVED=已解决（可 reopen 回退）
 * 权限：仅主管及以上可见操作按钮（与后端 UserContext.isSupervisorOrAbove 对齐）
 */

const STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: 'PENDING', label: '待处理' },
  { value: 'RESOLVED', label: '已解决' },
];

const TYPE_TEXT: Record<string, string> = {
  MATERIAL_SHORTAGE: '缺面料/辅料',
  MACHINE_FAULT: '车床故障',
  NEED_HELP: '需指导/协助',
};

function statusTag(status?: string) {
  const s = String(status || 'PENDING').toUpperCase();
  if (s === 'RESOLVED') return <Tag color="success">已解决</Tag>;
  return <Tag color="warning">待处理</Tag>;
}

const ExceptionReport: React.FC = () => {
  const { message, modal } = App.useApp();
  const { user } = useUser();
  const canHandle = isSupervisorOrAboveUser(user);
  // 待办深链可带 ?keyword=订单号 直达并自动筛选（后端 PendingTaskOrchestrator 下发）
  const [searchParams] = useSearchParams();
  const initialKeyword = searchParams.get('keyword') || '';
  const initialStatus = searchParams.get('status') || '';

  const [rows, setRows] = useState<ProductionExceptionReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [status, setStatus] = useState<string>(initialStatus);
  const [keyword, setKeyword] = useState<string>(initialKeyword);

  const fetchList = useCallback(async (nextPage?: number, nextPageSize?: number) => {
    setLoading(true);
    try {
      const p = nextPage ?? page;
      const ps = nextPageSize ?? pageSize;
      const res = await exceptionReportApi.list({
        page: p,
        pageSize: ps,
        ...(status ? { status } : {}),
        ...(keyword ? { keyword } : {}),
      });
      const data: any = (res as any)?.data ?? res;
      const records: ProductionExceptionReport[] = data?.records || data?.rows || [];
      setRows(records);
      setTotal(Number(data?.total || 0));
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '加载异常报告失败');
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, status, keyword, message]);

  useEffect(() => {
    void fetchList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 标记已解决（需填处理说明，与手机端一致） */
  const handleResolve = (record: ProductionExceptionReport) => {
    let note = '';
    modal.confirm({
      title: '标记已解决',
      content: (
        <div style={{ marginTop: 8 }}>
          <Input.TextArea
            rows={3}
            placeholder="请填写处理说明（如如何解决的）"
            onChange={(e) => { note = e.target.value; }}
          />
        </div>
      ),
      okText: '确认',
      cancelText: '取消',
      onOk: async () => {
        const text = (note || '').trim();
        if (!text) {
          message.warning('请填写处理说明');
          return Promise.reject(new Error('empty note'));
        }
        await submit(record.id, 'resolve', text, '已标记解决');
      },
    });
  };

  /** 重新打开（误点恢复） */
  const handleReopen = (record: ProductionExceptionReport) => {
    modal.confirm({
      title: '重新打开',
      content: '确认将该异常重新标记为「待处理」？',
      okText: '确认',
      cancelText: '取消',
      onOk: async () => { await submit(record.id, 'reopen', undefined, '已重新打开'); },
    });
  };

  const submit = async (
    id: number,
    action: 'resolve' | 'reopen',
    note: string | undefined,
    okText: string,
  ) => {
    setSubmitting(true);
    try {
      const res: any = await exceptionReportApi.handle(id, action, note);
      // api 层可能返回 {code, data} 或直接 data，这里两种都兼容
      const code = res?.code;
      if (code !== undefined && code !== 200) {
        throw new Error(res?.message || '操作失败');
      }
      message.success(okText);
      await fetchList();
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '操作失败');
      throw e;
    } finally {
      setSubmitting(false);
    }
  };

  const columns: ColumnsType<ProductionExceptionReport> = [
    {
      title: '订单号',
      dataIndex: 'orderNo',
      width: 150,
      render: (v?: string) => v || '—',
    },
    {
      title: '工序',
      dataIndex: 'processName',
      width: 110,
      render: (v?: string) => v || '—',
    },
    {
      title: '异常类型',
      dataIndex: 'exceptionType',
      width: 130,
      render: (v?: string) => TYPE_TEXT[String(v || '').toUpperCase()] || v || '未知异常',
    },
    {
      title: '描述',
      dataIndex: 'description',
      ellipsis: true,
      render: (v?: string) => (
        <Tooltip title={v || ''}>
          <span>{v || '—'}</span>
        </Tooltip>
      ),
    },
    {
      title: '上报人',
      dataIndex: 'workerName',
      width: 100,
      render: (v?: string) => v || '—',
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (_: unknown, r) => statusTag(r.status),
    },
    {
      title: '处理人',
      dataIndex: 'handlerName',
      width: 100,
      render: (v: string | undefined, r: ProductionExceptionReport) => (v ? <Tooltip title={r.handleNote || ''}>{v}</Tooltip> : '—'),
    },
    {
      title: '上报时间',
      dataIndex: 'createTime',
      width: 160,
      render: (v?: string) => (v ? String(v).replace('T', ' ').slice(0, 19) : '—'),
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      fixed: 'right',
      render: (_: unknown, record) => {
        if (!canHandle) return <span style={{ color: '#999' }}>—</span>;
        const isPending = String(record.status || 'PENDING').toUpperCase() === 'PENDING';
        return isPending ? (
          <Button
            type="link"
            size="small"
            icon={<CheckCircleOutlined />}
            loading={submitting}
            onClick={() => handleResolve(record)}
          >
            标记已解决
          </Button>
        ) : (
          <Button
            type="link"
            size="small"
            icon={<UndoOutlined />}
            loading={submitting}
            onClick={() => handleReopen(record)}
          >
            重新打开
          </Button>
        );
      },
    },
  ];

  return (
    <Card
      title="生产异常"
      extra={
        <Space>
          <Select
            value={status}
            options={STATUS_OPTIONS}
            style={{ width: 130 }}
            onChange={(v) => { setStatus(v); setPage(1); void fetchList(1, pageSize); }}
          />
          <Input.Search
            allowClear
            placeholder="订单号 / 工序 / 上报人 / 描述"
            style={{ width: 240 }}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onSearch={(v) => { setKeyword(v); setPage(1); void fetchList(1, pageSize); }}
          />
          <Button ghost icon={<ReloadOutlined />} onClick={() => { setStatus(''); setKeyword(''); setPage(1); void fetchList(1, pageSize); }}>
            重置
          </Button>
        </Space>
      }
    >
      {!canHandle && (
        <div style={{ marginBottom: 12, color: '#999', fontSize: 13 }}>
          仅主管及以上可处理生产异常
        </div>
      )}
      <Table<ProductionExceptionReport>
        rowKey="id"
        size="small"
        loading={loading}
        columns={columns}
        dataSource={rows}
        scroll={{ x: 'max-content' }}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          showTotal: (t) => `共 ${t} 条`,
          onChange: (p, ps) => { setPage(p); setPageSize(ps); void fetchList(p, ps); },
        }}
      />
    </Card>
  );
};

export default ExceptionReport;
