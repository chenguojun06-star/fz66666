import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  App,
  Button,
  DatePicker,
  Drawer,
  Form,
  Image,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { DownOutlined, ReloadOutlined, SearchOutlined, UpOutlined } from '@ant-design/icons';
import {
  SCAN_TYPE_MAP,
  scanRecordManageApi,
  type ScanRecordManageRow,
} from '@/services/production/scanRecordManageApi';
import { toMoneyLocale } from '@/utils/format';
import { isSupervisorOrAboveUser, useUser } from '@/utils/AuthContext';
import RejectReasonModal from '@/components/common/RejectReasonModal';

const { Text } = Typography;

const fmtMoney = (v?: number) => (v == null ? '-' : `¥${toMoneyLocale(v)}`);
const fmtTime = (v?: string) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-');

/**
 * D-473 录入记录 —— 生产数据录入流水的统一管理与修正入口。
 * 搜索设计：默认一个通用搜索框（一框搜 单号/款号/工序/记录员/备注/颜色/尺码）
 * + 记录日期；高级筛选（环节/结算状态）收进「筛选」按钮，默认收起。
 * 数据修正：编辑数量/备注、撤回重做——统计（进度/菲号报工/工资聚合）由记录
 * 实时推导，改完自然回流；已参与工资结算的记录后端拦截。
 */
export default function ScanRecordManage() {
  const { message, modal } = App.useApp();
  const { user } = useUser();
  const canManage = isSupervisorOrAboveUser(user);

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<ScanRecordManageRow[]>([]);
  const [total, setTotal] = useState(0);
  const [pageNum, setPageNum] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // 通用搜索：一框全搜
  const [keyword, setKeyword] = useState('');
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);
  // 高级筛选（默认收起）
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [scanType, setScanType] = useState<string | undefined>(undefined);
  const [settlementStatus, setSettlementStatus] = useState<string | undefined>(undefined);

  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ScanRecordManageRow | null>(null);
  const [editForm] = Form.useForm<{ quantity: number; remark: string }>();
  const [editSaving, setEditSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<ScanRecordManageRow | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  const [logOpen, setLogOpen] = useState(false);
  const [logTarget, setLogTarget] = useState<ScanRecordManageRow | null>(null);
  const [logLoading, setLogLoading] = useState(false);
  const [logRows, setLogRows] = useState<any[]>([]);

  const fetchRows = useCallback(async (page = pageNum, size = pageSize) => {
    setLoading(true);
    try {
      const res: any = await scanRecordManageApi.list({
        pageNum: page,
        pageSize: size,
        keyword: keyword.trim() || undefined,
        scanType,
        settlementStatus,
        startDate: dateRange?.[0] ? dateRange[0].format('YYYY-MM-DD') : undefined,
        endDate: dateRange?.[1] ? dateRange[1].format('YYYY-MM-DD') : undefined,
      });
      const data = res?.data ?? res ?? {};
      setRows(data?.records ?? []);
      setTotal(data?.total ?? 0);
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '加载录入记录失败');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [pageNum, pageSize, keyword, scanType, settlementStatus, dateRange, message]);

  useEffect(() => {
    void fetchRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageNum, pageSize]);

  const summary = useMemo(() => rows.reduce(
    (acc, r) => ({
      qty: acc.qty + Number(r.quantity ?? 0),
      amount: acc.amount + Number(r.totalAmount ?? 0),
    }),
    { qty: 0, amount: 0 },
  ), [rows]);

  const openEdit = (r: ScanRecordManageRow) => {
    setEditTarget(r);
    editForm.setFieldsValue({ quantity: r.quantity, remark: r.remark ?? '' });
    setEditOpen(true);
  };

  const handleEditSave = async () => {
    if (!editTarget) return;
    const values = await editForm.validateFields();
    setEditSaving(true);
    try {
      await scanRecordManageApi.update(editTarget.id, {
        quantity: values.quantity,
        remark: values.remark ?? '',
      });
      message.success('已修改，统计已同步回流');
      setEditOpen(false);
      setEditTarget(null);
      void fetchRows();
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '修改失败');
    } finally {
      setEditSaving(false);
    }
  };

  const handleDeleteOk = async (reason: string) => {
    if (!deleteTarget) return;
    setDeleteSubmitting(true);
    try {
      await scanRecordManageApi.remove(deleteTarget.id, reason || '撤回重做');
      message.success('已撤回，统计已同步回流；可重新扫码录入');
      setDeleteTarget(null);
      void fetchRows();
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '撤回失败');
      throw e instanceof Error ? e : new Error('撤回失败');
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const openLogs = async (r: ScanRecordManageRow) => {
    setLogTarget(r);
    setLogOpen(true);
    setLogLoading(true);
    try {
      const res: any = await scanRecordManageApi.logs(r.id);
      setLogRows(res?.data ?? res ?? []);
    } catch {
      setLogRows([]);
    } finally {
      setLogLoading(false);
    }
  };

  const columns: ColumnsType<ScanRecordManageRow> = [
    {
      title: '生产单',
      dataIndex: 'orderNo',
      width: 150,
      render: (v: string, r) => (
        <Space size={8}>
          {r.coverImage && <Image src={r.coverImage} width={32} height={32} style={{ objectFit: 'cover', borderRadius: 4 }} preview={false} />}
          <Text style={{ fontFamily: 'monospace' }}>{v || '-'}</Text>
        </Space>
      ),
    },
    { title: '款号', dataIndex: 'styleNo', width: 130, render: (v: string) => <Text style={{ fontFamily: 'monospace' }}>{v || '-'}</Text> },
    { title: '款式名称', dataIndex: 'styleName', width: 160, ellipsis: true, render: (v?: string) => v || '-' },
    { title: '颜色', dataIndex: 'color', width: 90, ellipsis: true, render: (v?: string) => v || '-' },
    { title: '尺码', dataIndex: 'size', width: 70, render: (v?: string) => v || '-' },
    {
      title: '环节',
      width: 130,
      render: (_: unknown, r) => {
        const t = SCAN_TYPE_MAP[r.scanType ?? ''] ?? { text: r.scanType || '-', color: 'default' };
        return (
          <Space size={4} direction="vertical">
            <Tag color={t.color} style={{ margin: 0 }}>{t.text}</Tag>
            {r.processName && <Text type="secondary" style={{ fontSize: 13 }}>{r.processName}</Text>}
          </Space>
        );
      },
    },
    { title: '数量', dataIndex: 'quantity', width: 70, align: 'right', render: (v: number) => <Text strong>{v}</Text> },
    { title: '金额', dataIndex: 'totalAmount', width: 100, align: 'right', render: (v?: number) => fmtMoney(v) },
    { title: '记录员', dataIndex: 'operatorName', width: 100, render: (v?: string) => v || '-' },
    { title: '备注', dataIndex: 'remark', width: 150, ellipsis: true, render: (v?: string) => v || '-' },
    {
      title: '结算状态',
      dataIndex: 'settlementStatus',
      width: 90,
      render: (v: string) => v === 'SETTLED'
        ? <Tag color="green">已入工资</Tag>
        : <Tag color="default">未结算</Tag>,
    },
    { title: '录入时间', dataIndex: 'scanTime', width: 140, render: (v?: string) => fmtTime(v) },
    ...(canManage ? [{
      title: '操作',
      key: 'action',
      width: 140,
      fixed: 'right' as const,
      render: (_: unknown, r: ScanRecordManageRow) => (
        <Space size={4}>
          <Button
            type="link"
            size="small"
            style={{ padding: 0 }}
            disabled={r.settlementStatus === 'SETTLED'}
            title={r.settlementStatus === 'SETTLED' ? '已参与工资结算，请先在工资结算中撤销' : '修改数量/备注'}
            onClick={() => openEdit(r)}
          >
            编辑
          </Button>
          <Button
            type="link"
            size="small"
            danger
            style={{ padding: 0 }}
            disabled={r.settlementStatus === 'SETTLED'}
            title={r.settlementStatus === 'SETTLED' ? '已参与工资结算，请先在工资结算中撤销' : '删除后重新扫码录入'}
            onClick={() => setDeleteTarget(r)}
          >
            撤回
          </Button>
          <Button type="link" size="small" style={{ padding: 0 }} onClick={() => void openLogs(r)}>
            日志
          </Button>
        </Space>
      ),
    }] : []),
  ];

  return (
    <>
      {/* 通用搜索条：一框全搜 + 日期 + 高级筛选（默认收起） */}
      <Space style={{ marginBottom: 12 }} wrap>
        <Input
          allowClear
          prefix={<SearchOutlined style={{ color: 'var(--color-text-tertiary)' }} />}
          placeholder="通用搜索：单号 / 款号 / 工序 / 记录员 / 备注 / 颜色 / 尺码"
          style={{ width: 360 }}
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onPressEnter={() => { setPageNum(1); void fetchRows(1, pageSize); }}
        />
        <DatePicker.RangePicker
          value={dateRange as never}
          onChange={(v) => { setDateRange(v as never); setPageNum(1); }}
          placeholder={['录入开始', '录入结束']}
        />
        <Button
          type={advancedOpen ? 'primary' : 'default'}
          ghost={advancedOpen}
          icon={advancedOpen ? <UpOutlined /> : <DownOutlined />}
          onClick={() => setAdvancedOpen((v) => !v)}
        >
          筛选
        </Button>
        <Button
          type="primary"
          onClick={() => { setPageNum(1); void fetchRows(1, pageSize); }}
        >
          搜索
        </Button>
        <Button icon={<ReloadOutlined />} onClick={() => void fetchRows()} />
        <Button
          onClick={() => {
            setKeyword('');
            setDateRange(null);
            setScanType(undefined);
            setSettlementStatus(undefined);
            setPageNum(1);
          }}
        >
          重置
        </Button>
      </Space>

      {advancedOpen && (
        <Space style={{ marginBottom: 12 }} wrap>
          <Select
            allowClear
            placeholder="环节"
            style={{ width: 140 }}
            value={scanType}
            onChange={(v) => { setScanType(v); setPageNum(1); }}
            options={Object.entries(SCAN_TYPE_MAP).map(([value, cfg]) => ({ value, label: cfg.text }))}
          />
          <Select
            allowClear
            placeholder="结算状态"
            style={{ width: 130 }}
            value={settlementStatus}
            onChange={(v) => { setSettlementStatus(v); setPageNum(1); }}
            options={[
              { value: 'UNSETTLED', label: '未结算' },
              { value: 'SETTLED', label: '已入工资' },
            ]}
          />
        </Space>
      )}

      <Space size={24} style={{ marginBottom: 12 }} wrap>
        <Text type="secondary">共 <Text strong>{total}</Text> 条（本页合计 {summary.qty} 件 / {fmtMoney(summary.amount)}）</Text>
        {canManage && (
          <Text type="secondary" style={{ fontSize: 13 }}>
            修改/撤回后生产统计自动回流；已入工资的记录需先在工资结算中撤销
          </Text>
        )}
      </Space>

      <Spin spinning={loading}>
        <Table<ScanRecordManageRow>
          rowKey="id"
          size="small"
          columns={columns}
          dataSource={rows}
          scroll={{ x: 1500 }}
          pagination={{
            current: pageNum,
            pageSize,
            total,
            showSizeChanger: true,
            showTotal: (t) => `共 ${t} 条`,
            onChange: (p, ps) => { setPageNum(p); setPageSize(ps); },
          }}
        />
      </Spin>

      {/* 编辑弹窗 */}
      <Modal
        title="修改录入记录"
        open={editOpen}
        onOk={() => void handleEditSave()}
        confirmLoading={editSaving}
        onCancel={() => { setEditOpen(false); setEditTarget(null); }}
        destroyOnHidden
      >
        {editTarget && (
          <>
            <Space direction="vertical" size={4} style={{ width: '100%', marginBottom: 12 }}>
              <Text type="secondary">
                {editTarget.orderNo || '-'} · {editTarget.styleNo || '-'} · {editTarget.processName || SCAN_TYPE_MAP[editTarget.scanType ?? '']?.text || '-'}
              </Text>
              <Text type="secondary" style={{ fontSize: 13 }}>
                修改数量后金额按原单价自动重算，所有生产统计自动回流；已入工资的记录不可修改
              </Text>
            </Space>
            <Form form={editForm} layout="vertical">
              <Form.Item
                name="quantity"
                label="数量"
                rules={[{ required: true, message: '请输入数量' }]}
              >
                <InputNumber min={1} precision={0} style={{ width: 160 }} />
              </Form.Item>
              <Form.Item name="remark" label="备注">
                <Input.TextArea rows={2} maxLength={200} showCount placeholder="选填" />
              </Form.Item>
            </Form>
          </>
        )}
      </Modal>

      {/* 撤回确认（带原因） */}
      <RejectReasonModal
        open={!!deleteTarget}
        title="撤回录入记录"
        description={
          deleteTarget
            ? `确定撤回 ${deleteTarget.orderNo || '-'} 的这条录入（${deleteTarget.processName || SCAN_TYPE_MAP[deleteTarget.scanType ?? '']?.text || '-'} · ${deleteTarget.quantity} 件）？撤回后相关统计同步回流，可重新扫码录入。`
            : undefined
        }
        onOk={handleDeleteOk}
        onCancel={() => setDeleteTarget(null)}
        loading={deleteSubmitting}
      />

      {/* 操作日志 */}
      <Drawer
        title={<Space><span>操作日志</span><Text type="secondary" style={{ fontWeight: 400, fontSize: 14 }}>{logTarget?.orderNo || '-'}</Text></Space>}
        width="60vw"
        open={logOpen}
        onClose={() => { setLogOpen(false); setLogTarget(null); setLogRows([]); }}
        destroyOnHidden
      >
        <Spin spinning={logLoading}>
          {logRows.length === 0 ? (
            <Text type="secondary">暂无修改/撤回记录</Text>
          ) : (
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              {logRows.map((l: any) => (
                <div key={l.id} style={{ borderBottom: '1px solid var(--color-border-secondary)', paddingBottom: 8 }}>
                  <Space>
                    <Tag color={l.operation === '撤回录入记录' ? 'red' : 'blue'}>{l.operation}</Tag>
                    <Text strong>{l.operatorName || '-'}</Text>
                    <Text type="secondary" style={{ fontSize: 13 }}>{fmtTime(l.operationTime)}</Text>
                  </Space>
                  <div style={{ marginTop: 4 }}>
                    <Text style={{ fontSize: 14 }}>{l.details || '-'}</Text>
                  </div>
                </div>
              ))}
            </Space>
          )}
        </Spin>
      </Drawer>
    </>
  );
}
