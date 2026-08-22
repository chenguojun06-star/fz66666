import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Button, DatePicker, Form, Input, Select, Space, Tag, Tooltip } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import PageLayout from '@/components/common/PageLayout';
import PageStatCards from '@/components/common/PageStatCards';
import ResizableTable from '@/components/common/ResizableTable';
import RowActions from '@/components/common/RowActions';
import StandardModal from '@/components/common/StandardModal';
import { exportTableToExcel } from '@/utils/exportExcel';
import api from '@/utils/api';
import { useUser } from '@/utils/AuthContext';
import { readPageSize } from '@/utils/pageSizeStore';
import tenantService, { type TenantUser } from '@/services/tenantService';
import attendanceApi, {
  type AdminListResp,
  type AttendanceRecord,
  type AttendanceStats,
} from '@/services/production/attendanceApi';

const { RangePicker } = DatePicker;

// ==================== 状态/休假类型常量 ====================

const STATUS_OPTIONS = [
  { label: '全部', value: '' },
  { label: '正常', value: 'NORMAL' },
  { label: '迟到', value: 'LATE' },
  { label: '早退', value: 'EARLY_LEAVE' },
  { label: '迟到/早退', value: 'LATE_EARLY_LEAVE' },
  { label: '漏打下班卡', value: 'MISSING_CLOCK_OUT' },
  { label: '工时异常', value: 'ABNORMAL' },
  { label: '休假', value: 'LEAVE' },
  { label: '管理员调整', value: 'ADJUSTED' },
  { label: '已作废', value: 'CANCELLED' },
];

const LEAVE_TYPE_OPTIONS = [
  { label: '法定节假日', value: 'LEGAL_HOLIDAY' },
  { label: '病假', value: 'SICK' },
  { label: '事假', value: 'PERSONAL' },
  { label: '年假', value: 'ANNUAL' },
  { label: '产假', value: 'MATERNITY' },
  { label: '其他休假', value: 'OTHER' },
];

const statusTagColor = (status: string): string => {
  switch (status) {
    case 'NORMAL':
      return 'green';
    case 'LATE':
    case 'EARLY_LEAVE':
    case 'LATE_EARLY_LEAVE':
      return 'orange';
    case 'MISSING_CLOCK_OUT':
    case 'ABNORMAL':
      return 'red';
    case 'LEAVE':
      return 'purple';
    case 'ADJUSTED':
      return 'blue';
    case 'CANCELLED':
      return 'default';
    default:
      return 'default';
  }
};

const formatDate = (v: string | null | undefined): string => {
  if (!v) return '-';
  const d = dayjs(v);
  return d.isValid() ? d.format('YYYY-MM-DD HH:mm') : v;
};

// ==================== 主页面 ====================

const AttendanceAdminPage: React.FC = () => {
  const { isSuperAdmin } = useUser();
  const { message } = App.useApp();

  const [loading, setLoading] = useState(false);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [stats, setStats] = useState<AttendanceStats | null>(null);
  const [total, setTotal] = useState(0);

  // 筛选
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>(() => [
    dayjs().startOf('month'),
    dayjs(),
  ]);
  const [userIdFilter, setUserIdFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [activeStatKey, setActiveStatKey] = useState<string>('');

  // 用户下拉（同时支持租户子账号 & 超管全量用户）
  const [userOptions, setUserOptions] = useState<TenantUser[]>([]);
  const [userLoading, setUserLoading] = useState(false);

  // 弹窗
  const [supplementOpen, setSupplementOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [batchLeaveOpen, setBatchLeaveOpen] = useState(false);
  const [adjustRecord, setAdjustRecord] = useState<AttendanceRecord | null>(null);
  const [cancelRecord, setCancelRecord] = useState<AttendanceRecord | null>(null);

  // ---- 加载用户下拉（租户子账号 / 超管全量用户）----
  const fetchUsers = useCallback(async () => {
    setUserLoading(true);
    try {
      if (isSuperAdmin) {
        const res: any = await api.get<{
          code: number;
          data: { records: any[]; total: number };
        }>('/system/user/list', {
          params: { page: 1, pageSize: 200, excludeFactoryUsers: true },
        });
        if (res?.code === 200) {
          setUserOptions((res.data?.records || []).map((u: any) => ({
            id: u.id,
            username: u.username,
            name: u.name || u.username,
            roleName: u.roleName || '',
            phone: u.phone || '',
            status: u.status || '',
            registrationStatus: '',
            createTime: u.createTime || '',
          })));
        }
      } else {
        const res: any = await tenantService.listSubAccounts({
          page: 1,
          pageSize: 200,
          excludeFactoryUsers: true,
        });
        if (res?.code === 200) {
          setUserOptions(res.data?.records || []);
        }
      }
    } catch {
      // 静默忽略，不影响主流程
    } finally {
      setUserLoading(false);
    }
  }, [isSuperAdmin]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // ---- 加载列表 ----
  const fetchList = useCallback(
    async (overrides?: { userId?: string; status?: string; range?: [Dayjs, Dayjs] }) => {
      setLoading(true);
      try {
        const range = overrides?.range ?? dateRange;
        const params = {
          startDate: range[0].format('YYYY-MM-DD'),
          endDate: range[1].format('YYYY-MM-DD'),
          userId: overrides?.userId ?? userIdFilter,
          status: overrides?.status ?? statusFilter,
        };
        const res: any = await attendanceApi.adminList(params);
        if (res?.code === 200) {
          const data: AdminListResp = res.data;
          setRecords(data?.records || []);
          setStats(data?.stats || null);
          setTotal(data?.total || 0);
        } else {
          message.error(res?.message || '加载考勤列表失败');
        }
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : '网络异常';
        message.error(`加载考勤列表失败: ${errMsg}`);
      } finally {
        setLoading(false);
      }
    },
    [dateRange, userIdFilter, statusFilter, message],
  );

  useEffect(() => {
    fetchList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- 筛选交互 ----
  const handleSearch = () => {
    setActiveStatKey('');
    fetchList({ userId: userIdFilter, status: statusFilter, range: dateRange });
  };

  const handleReset = () => {
    const range: [Dayjs, Dayjs] = [dayjs().startOf('month'), dayjs()];
    setUserIdFilter('');
    setStatusFilter('');
    setActiveStatKey('');
    setDateRange(range);
    fetchList({ userId: '', status: '', range });
  };

  // 点击统计卡片筛选
  const handleStatClick = useCallback((key: string, status: string) => {
    setActiveStatKey(key);
    setStatusFilter(status);
    fetchList({ status });
  }, [fetchList]);

  // ---- 操作回调 ----
  const handleAdjust = useCallback((record: AttendanceRecord) => {
    if (record.status === 'CANCELLED') {
      message.warning('已作废的记录不能再修改');
      return;
    }
    if (record.status === 'LEAVE') {
      message.warning('休假记录请使用「批量休假」功能修改');
      return;
    }
    setAdjustRecord(record);
    setAdjustOpen(true);
  }, [message]);

  const handleCancel = useCallback((record: AttendanceRecord) => {
    if (record.status === 'CANCELLED') {
      message.warning('记录已作废');
      return;
    }
    setCancelRecord(record);
    setCancelOpen(true);
  }, [message]);

  const handleRefresh = () => {
    fetchList();
  };

  // ---- 列定义 ----
  const columns: ColumnsType<AttendanceRecord> = useMemo(
    () => [
      {
        title: '员工',
        dataIndex: 'userName',
        width: 110,
        render: (v: string, r: AttendanceRecord) => v || r.userId || '-',
      },
      {
        title: '日期',
        dataIndex: 'workDate',
        width: 110,
        render: (v: string) => (v ? dayjs(v).format('YYYY-MM-DD') : '-'),
        sorter: (a, b) => dayjs(a.workDate).valueOf() - dayjs(b.workDate).valueOf(),
        defaultSortOrder: 'descend',
      },
      {
        title: '上班时间',
        dataIndex: 'clockInTime',
        width: 140,
        render: formatDate,
      },
      {
        title: '下班时间',
        dataIndex: 'clockOutTime',
        width: 140,
        render: formatDate,
      },
      {
        title: '工时',
        dataIndex: 'workHours',
        width: 80,
        align: 'right',
        render: (v: string, r: AttendanceRecord) => {
          if (r.status === 'LEAVE') return <Tag color="purple">休假</Tag>;
          if (r.status === 'CANCELLED') return <Tag>已作废</Tag>;
          return v ? `${v} h` : '-';
        },
      },
      {
        title: '当日产量',
        dataIndex: 'scanQty',
        width: 90,
        align: 'right',
        render: (v: number, r: AttendanceRecord) => {
          if (r.status === 'LEAVE' || r.status === 'CANCELLED') return '-';
          return v && v > 0 ? `${v} 件` : '-';
        },
      },
      {
        title: '当日金额',
        dataIndex: 'scanAmount',
        width: 100,
        align: 'right',
        render: (v: number, r: AttendanceRecord) => {
          if (r.status === 'LEAVE' || r.status === 'CANCELLED') return '-';
          return v && v > 0 ? `¥${Number(v).toFixed(2)}` : '-';
        },
      },
      {
        title: '状态',
        dataIndex: 'status',
        width: 110,
        render: (v: string, r: AttendanceRecord) => (
          <Tag color={statusTagColor(v)}>{r.statusText || v || '-'}</Tag>
        ),
      },
      {
        title: '操作人',
        dataIndex: 'operatorName',
        width: 110,
        render: (v: string) => v || '-',
      },
      {
        title: '操作时间',
        dataIndex: 'operateTime',
        width: 140,
        render: formatDate,
      },
      {
        title: '备注',
        dataIndex: 'remark',
        ellipsis: true,
        width: 200,
        render: (v: string) =>
          v ? (
            <Tooltip title={v}>
              <span>{v}</span>
            </Tooltip>
          ) : (
            '-'
          ),
      },
      {
        title: '操作',
        key: 'action',
        width: 90,
        fixed: 'right',
        render: (_: unknown, record: AttendanceRecord) => (
          <RowActions
            actions={[
              {
                key: 'adjust',
                label: '修改',
                disabled: record.status === 'CANCELLED' || record.status === 'LEAVE',
                onClick: () => handleAdjust(record),
              },
              {
                key: 'cancel',
                label: '作废',
                danger: true,
                disabled: record.status === 'CANCELLED',
                onClick: () => handleCancel(record),
              },
            ]}
          />
        ),
      },
    ],
    [handleAdjust, handleCancel],
  );

  // ---- 统计卡片配置 ----
  const statCards = useMemo(() => {
    if (!stats) return [];
    return [
      {
        key: 'total',
        items: { label: '总记录', value: stats.total, unit: '条' },
        onClick: () => handleStatClick('total', ''),
        activeColor: 'var(--color-primary)',
      },
      {
        key: 'normal',
        items: { label: '正常', value: stats.normalCount, unit: '条', color: 'var(--color-success)' },
        onClick: () => handleStatClick('normal', 'NORMAL'),
        activeColor: 'var(--color-success)',
      },
      {
        key: 'leave',
        items: { label: '休假', value: stats.leaveCount, unit: '条', color: 'var(--color-purple)' },
        onClick: () => handleStatClick('leave', 'LEAVE'),
        activeColor: 'var(--color-purple)',
      },
      {
        key: 'adjusted',
        items: { label: '管理员调整', value: stats.adjustedCount, unit: '条', color: 'var(--color-primary)' },
        onClick: () => handleStatClick('adjusted', 'ADJUSTED'),
        activeColor: 'var(--color-primary)',
      },
      {
        key: 'cancelled',
        items: { label: '已作废', value: stats.cancelledCount, unit: '条', color: 'var(--color-text-tertiary)' },
        onClick: () => handleStatClick('cancelled', 'CANCELLED'),
        activeColor: 'var(--color-text-tertiary)',
      },
      {
        key: 'hours',
        items: { label: '总工时', value: stats.totalHours, unit: 'h', color: 'var(--color-amber-700)' },
      },
      {
        key: 'scanQty',
        items: { label: '总产量', value: stats.totalScanQty ?? 0, unit: '件', color: 'var(--color-blue-600)' },
      },
      {
        key: 'scanAmount',
        items: {
          label: '总金额',
          value: stats.totalScanAmount ?? 0,
          unit: '元',
          color: 'var(--color-green-600)',
        },
      },
    ];
  }, [stats, handleStatClick]);

  // 导出 Excel（基于当前筛选条件下的全部数据）
  const [exporting, setExporting] = useState(false);
  const handleExport = useCallback(async () => {
    if (exporting) return;
    setExporting(true);
    try {
      // 拉取当前筛选条件下的全量数据
      const res: any = await attendanceApi.adminList({
        startDate: dateRange[0].format('YYYY-MM-DD'),
        endDate: dateRange[1].format('YYYY-MM-DD'),
        userId: userIdFilter,
        status: statusFilter,
      });
      const data: AdminListResp = res?.data;
      const exportRecords: AttendanceRecord[] = data?.records || [];
      if (exportRecords.length === 0) {
        message.warning('当前筛选条件下没有可导出的数据');
        return;
      }
      // 导出列：与界面一致，自动排除操作列
      await exportTableToExcel(
        exportRecords,
        columns,
        `考勤记录_${dateRange[0].format('YYYY-MM-DD')}_${dateRange[1].format('YYYY-MM-DD')}.xlsx`,
      );
      message.success(`已导出 ${exportRecords.length} 条考勤记录`);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : '网络异常';
      message.error(`导出失败: ${errMsg}`);
    } finally {
      setExporting(false);
    }
  }, [exporting, dateRange, userIdFilter, statusFilter, columns, message]);

  return (
    <PageLayout
      title="考勤管理"
      headerContent={
        <PageStatCards cards={statCards} activeKey={activeStatKey} />
      }
      filterLeft={
        <Space wrap>
          <RangePicker
            value={dateRange}
            onChange={(range) => {
              if (range && range[0] && range[1]) {
                setDateRange([range[0], range[1]]);
              }
            }}
            allowClear={false}
            style={{ width: 240 }}
          />
          <Select
            showSearch
            placeholder="选择员工"
            value={userIdFilter || undefined}
            onChange={(v) => setUserIdFilter(v || '')}
            loading={userLoading}
            options={userOptions.map((u) => ({
              label: u.name || u.username || `用户${u.id}`,
              value: String(u.id),
            }))}
            allowClear
            style={{ width: 180 }}
            optionFilterProp="label"
          />
          <Select
            placeholder="状态"
            value={statusFilter || undefined}
            onChange={(v) => setStatusFilter(v || '')}
            options={STATUS_OPTIONS}
            allowClear
            style={{ width: 140 }}
          />
          <Button onClick={handleReset}>重置</Button>
          <Button type="primary" onClick={handleSearch}>
            查询
          </Button>
        </Space>
      }
      filterRight={
        <Space>
          <Button onClick={() => setSupplementOpen(true)}>补录打卡</Button>
          <Button onClick={() => setBatchLeaveOpen(true)}>批量休假</Button>
          <Button
            icon={<DownloadOutlined />}
            loading={exporting}
            onClick={handleExport}
            disabled={records.length === 0}
          >
            导出 Excel
          </Button>
        </Space>
      }
    >
      <ResizableTable
        loading={loading}
        dataSource={records}
        columns={columns}
        rowKey={(r) => String(r.id)}
        stickyHeader
        emptyDescription="暂无考勤记录"
        size="middle"
        scroll={{ x: 1380 }}
        pagination={{
          total,
          showTotal: (t) => `共 ${t} 条`,
          showSizeChanger: true,
          pageSize: readPageSize(20),
          pageSizeOptions: ['20', '50', '100'],
        }}
      />

      <SupplementModal
        open={supplementOpen}
        userOptions={userOptions}
        onCancel={() => setSupplementOpen(false)}
        onSuccess={() => {
          setSupplementOpen(false);
          handleRefresh();
        }}
      />

      <AdjustModal
        open={adjustOpen}
        record={adjustRecord}
        onCancel={() => {
          setAdjustOpen(false);
          setAdjustRecord(null);
        }}
        onSuccess={() => {
          setAdjustOpen(false);
          setAdjustRecord(null);
          handleRefresh();
        }}
      />

      <CancelModal
        open={cancelOpen}
        record={cancelRecord}
        onCancel={() => {
          setCancelOpen(false);
          setCancelRecord(null);
        }}
        onSuccess={() => {
          setCancelOpen(false);
          setCancelRecord(null);
          handleRefresh();
        }}
      />

      <BatchLeaveModal
        open={batchLeaveOpen}
        userOptions={userOptions}
        onCancel={() => setBatchLeaveOpen(false)}
        onSuccess={() => {
          setBatchLeaveOpen(false);
          handleRefresh();
        }}
      />
    </PageLayout>
  );
};

// ==================== 补录弹窗 ====================

interface SupplementModalProps {
  open: boolean;
  userOptions: TenantUser[];
  onCancel: () => void;
  onSuccess: () => void;
}

const SupplementModal: React.FC<SupplementModalProps> = ({ open, userOptions, onCancel, onSuccess }) => {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      const selectedUser = userOptions.find((u) => String(u.id) === values.targetUserId);
      const payload = {
        targetUserId: values.targetUserId,
        targetUserName: selectedUser?.name || selectedUser?.username,
        workDate: values.workDate.format('YYYY-MM-DD'),
        clockInTime: values.clockInTime ? values.clockInTime.format('YYYY-MM-DD HH:mm') : undefined,
        clockOutTime: values.clockOutTime ? values.clockOutTime.format('YYYY-MM-DD HH:mm') : undefined,
        remark: values.remark,
      };
      const res: any = await attendanceApi.supplement(payload);
      if (res?.code === 200) {
        message.success(res.data?.message || '补录成功');
        form.resetFields();
        onSuccess();
      } else {
        message.error(res?.message || '补录失败');
      }
    } catch (err: any) {
      if (err?.errorFields) return; // 表单校验错误
      const errMsg = err instanceof Error ? err.message : '网络异常';
      message.error(`补录失败: ${errMsg}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <StandardModal
      title="补录打卡"
      open={open}
      onCancel={() => {
        form.resetFields();
        onCancel();
      }}
      onOk={handleOk}
      okText="确认补录"
      confirmLoading={submitting}
      size="sm"
      destroyOnHidden
    >
      <Form form={form} layout="vertical" preserve={false}>
        <Form.Item
          name="targetUserId"
          label="员工"
          rules={[{ required: true, message: '请选择员工' }]}
        >
          <Select
            showSearch
            placeholder="选择员工"
            options={userOptions.map((u) => ({
              label: u.name || u.username || `用户${u.id}`,
              value: String(u.id),
            }))}
            optionFilterProp="label"
          />
        </Form.Item>
        <Form.Item
          name="workDate"
          label="打卡日期"
          rules={[{ required: true, message: '请选择日期' }]}
        >
          <DatePicker
            style={{ width: '100%' }}
            disabledDate={(d) => d && d.isAfter(dayjs().endOf('day'))}
          />
        </Form.Item>
        <Form.Item name="clockInTime" label="上班时间">
          <DatePicker
            showTime={{ format: 'HH:mm' }}
            format="YYYY-MM-DD HH:mm"
            style={{ width: '100%' }}
            placeholder="上班打卡时间"
          />
        </Form.Item>
        <Form.Item name="clockOutTime" label="下班时间">
          <DatePicker
            showTime={{ format: 'HH:mm' }}
            format="YYYY-MM-DD HH:mm"
            style={{ width: '100%' }}
            placeholder="下班打卡时间"
          />
        </Form.Item>
        <Form.Item name="remark" label="备注">
          <Input.TextArea rows={3} placeholder="补录原因（可选）" maxLength={200} showCount />
        </Form.Item>
        <div style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}>
          提示：上班时间和下班时间至少填一项。不允许补录未来日期。
        </div>
      </Form>
    </StandardModal>
  );
};

// ==================== 修改弹窗 ====================

interface AdjustModalProps {
  open: boolean;
  record: AttendanceRecord | null;
  onCancel: () => void;
  onSuccess: () => void;
}

const AdjustModal: React.FC<AdjustModalProps> = ({ open, record, onCancel, onSuccess }) => {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open && record) {
      form.setFieldsValue({
        clockInTime: record.clockInTime ? dayjs(record.clockInTime) : undefined,
        clockOutTime: record.clockOutTime ? dayjs(record.clockOutTime) : undefined,
        remark: record.remark || '',
      });
    } else if (!open) {
      form.resetFields();
    }
  }, [open, record, form]);

  const handleOk = async () => {
    if (!record) return;
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      const payload = {
        id: record.id,
        clockInTime: values.clockInTime ? values.clockInTime.format('YYYY-MM-DD HH:mm') : undefined,
        clockOutTime: values.clockOutTime ? values.clockOutTime.format('YYYY-MM-DD HH:mm') : undefined,
        remark: values.remark,
      };
      const res: any = await attendanceApi.adjust(payload);
      if (res?.code === 200) {
        message.success(res.data?.message || '修改成功');
        onSuccess();
      } else {
        message.error(res?.message || '修改失败');
      }
    } catch (err: any) {
      if (err?.errorFields) return;
      const errMsg = err instanceof Error ? err.message : '网络异常';
      message.error(`修改失败: ${errMsg}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <StandardModal
      title={`修改打卡 - ${record?.userName || ''} (${record?.workDate || ''})`}
      open={open}
      onCancel={onCancel}
      onOk={handleOk}
      okText="保存修改"
      confirmLoading={submitting}
      size="sm"
      destroyOnHidden
    >
      <Form form={form} layout="vertical" preserve={false}>
        <Form.Item name="clockInTime" label="上班时间">
          <DatePicker
            showTime={{ format: 'HH:mm' }}
            format="YYYY-MM-DD HH:mm"
            style={{ width: '100%' }}
            placeholder="上班打卡时间"
          />
        </Form.Item>
        <Form.Item name="clockOutTime" label="下班时间">
          <DatePicker
            showTime={{ format: 'HH:mm' }}
            format="YYYY-MM-DD HH:mm"
            style={{ width: '100%' }}
            placeholder="下班打卡时间"
          />
        </Form.Item>
        <Form.Item name="remark" label="备注">
          <Input.TextArea rows={3} placeholder="修改原因（可选）" maxLength={200} showCount />
        </Form.Item>
      </Form>
    </StandardModal>
  );
};

// ==================== 作废弹窗 ====================

interface CancelModalProps {
  open: boolean;
  record: AttendanceRecord | null;
  onCancel: () => void;
  onSuccess: () => void;
}

const CancelModal: React.FC<CancelModalProps> = ({ open, record, onCancel, onSuccess }) => {
  const { message } = App.useApp();
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) setReason('');
  }, [open]);

  const handleOk = async () => {
    if (!record) return;
    setSubmitting(true);
    try {
      const res: any = await attendanceApi.cancel({ id: record.id, reason });
      if (res?.code === 200) {
        message.success(res.data?.message || '作废成功');
        onSuccess();
      } else {
        message.error(res?.message || '作废失败');
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : '网络异常';
      message.error(`作废失败: ${errMsg}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <StandardModal
      title={`作废打卡 - ${record?.userName || ''} (${record?.workDate || ''})`}
      open={open}
      onCancel={onCancel}
      onOk={handleOk}
      okText="确认作废"
      okButtonProps={{ danger: true }}
      confirmLoading={submitting}
      size="sm"
      destroyOnHidden
    >
      <div style={{ marginBottom: 12, color: 'var(--color-text-secondary)', fontSize: 13 }}>
        作废后该记录将标记为「已作废」，不再计入工时统计。此操作可追溯，但不可恢复。
      </div>
      <Input.TextArea
        rows={3}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="作废原因（可选，建议填写）"
        maxLength={200}
        showCount
      />
    </StandardModal>
  );
};

// ==================== 批量休假弹窗 ====================

interface BatchLeaveModalProps {
  open: boolean;
  userOptions: TenantUser[];
  onCancel: () => void;
  onSuccess: () => void;
}

const BatchLeaveModal: React.FC<BatchLeaveModalProps> = ({ open, userOptions, onCancel, onSuccess }) => {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      const selectedUser = userOptions.find((u) => String(u.id) === values.targetUserId);
      const payload = {
        targetUserId: values.targetUserId,
        targetUserName: selectedUser?.name || selectedUser?.username,
        startDate: values.range[0].format('YYYY-MM-DD'),
        endDate: values.range[1].format('YYYY-MM-DD'),
        leaveType: values.leaveType,
        remark: values.remark,
      };
      const res: any = await attendanceApi.batchLeave(payload);
      if (res?.code === 200) {
        message.success(res.data?.message || '标记完成');
        form.resetFields();
        onSuccess();
      } else {
        message.error(res?.message || '标记失败');
      }
    } catch (err: any) {
      if (err?.errorFields) return;
      const errMsg = err instanceof Error ? err.message : '网络异常';
      message.error(`标记失败: ${errMsg}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <StandardModal
      title="批量标记休假"
      open={open}
      onCancel={() => {
        form.resetFields();
        onCancel();
      }}
      onOk={handleOk}
      okText="确认标记"
      confirmLoading={submitting}
      size="sm"
      destroyOnHidden
    >
      <Form form={form} layout="vertical" preserve={false}>
        <Form.Item
          name="targetUserId"
          label="员工"
          rules={[{ required: true, message: '请选择员工' }]}
        >
          <Select
            showSearch
            placeholder="选择员工"
            options={userOptions.map((u) => ({
              label: u.name || u.username || `用户${u.id}`,
              value: String(u.id),
            }))}
            optionFilterProp="label"
          />
        </Form.Item>
        <Form.Item
          name="range"
          label="休假日期范围"
          rules={[{ required: true, message: '请选择日期范围' }]}
        >
          <RangePicker style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item
          name="leaveType"
          label="休假类型"
          rules={[{ required: true, message: '请选择休假类型' }]}
        >
          <Select placeholder="选择休假类型" options={LEAVE_TYPE_OPTIONS} />
        </Form.Item>
        <Form.Item name="remark" label="备注">
          <Input.TextArea rows={3} placeholder="休假说明（可选）" maxLength={200} showCount />
        </Form.Item>
        <div style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}>
          提示：单次最多标记 31 天。已有打卡记录的日期会自动跳过。
        </div>
      </Form>
    </StandardModal>
  );
};

export default AttendanceAdminPage;
