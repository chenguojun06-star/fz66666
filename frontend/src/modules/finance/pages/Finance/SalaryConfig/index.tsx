import React, { useCallback, useEffect, useState } from 'react';
import { App, Button, Card, Checkbox, Descriptions, Form, Input, InputNumber, Select, Space, Table, Tag } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import SideDrawer from '@/components/common/SideDrawer';
import { safePrint } from '@/utils/safePrint';
import api from '@/utils/api';

/**
 * D-474：薪资规则配置（管理员设定，不写死在代码里）。
 * 支持三种薪资类型：计时（时薪）/ 计件 / 固定（月薪），
 * 每种都能单独设定：时薪、月薪、岗位工资、应出勤天数、全勤奖、迟到扣款、请假扣款比例、加班倍数。
 * 设定完可以点「试算」立刻看某员工某月工资怎么算出来的。
 */
interface SalaryConfig {
  id?: string;
  userId: string;
  userName?: string;
  salaryType: 'FIXED' | 'HOURLY' | 'PIECE';
  monthlySalary?: number;
  hourlyRate?: number;
  positionSalary?: number;
  attendanceDays?: number;
  fullAttendanceBonus?: number;
  latePenalty?: number;
  leaveDeductRatio?: number;
  sickLeaveRatio?: number;
  overtimeEnabled?: number;
  overtimeRate?: number;
}

const TYPE_MAP: Record<string, { text: string; color: string }> = {
  FIXED: { text: '固定月薪', color: 'blue' },
  HOURLY: { text: '计时', color: 'orange' },
  PIECE: { text: '计件', color: 'green' },
};

/** D-474：工资条显示项——打印/展示时可勾选要出现哪些（比如不想让员工看到奖金就勾掉） */
const SALARY_FIELDS = [
  { key: 'attendanceDays', label: '出勤天数', suffix: ' 天' },
  { key: 'totalHours', label: '总工时', suffix: ' 小时' },
  { key: 'lateCount', label: '迟到次数', suffix: ' 次' },
  { key: 'baseWage', label: '基本工资', prefix: '¥' },
  { key: 'overtimePay', label: '加班费', prefix: '¥' },
  { key: 'bonus', label: '全勤奖', prefix: '¥' },
  { key: 'lateDeduction', label: '迟到扣款', prefix: '¥' },
  { key: 'leaveDeduction', label: '请假扣款', prefix: '¥' },
  { key: 'grossPay', label: '应发合计', prefix: '¥' },
  { key: 'netPay', label: '实发工资', prefix: '¥' },
];

const SalaryConfigPage: React.FC = () => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [list, setList] = useState<SalaryConfig[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<SalaryConfig | null>(null);
  const [form] = Form.useForm();
  const [calcOpen, setCalcOpen] = useState(false);
  const [calcResult, setCalcResult] = useState<any>(null);
  const [calcUserId, setCalcUserId] = useState<string>('');
  const [calcMonth, setCalcMonth] = useState<string>(
    new Date().toISOString().slice(0, 7),
  );
  // D-474：工资条里要显示哪些项（打印时按这个来）
  const [visibleFields, setVisibleFields] = useState<string[]>(SALARY_FIELDS.map((f) => f.key));

  const fetchList = async () => {
    setLoading(true);
    try {
      const res: any = await api.get('/finance/salary-config/list');
      setList(res?.data ?? []);
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '加载薪资配置失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchList();
  }, []);

  const openEdit = (record?: SalaryConfig) => {
    setEditing(record ?? null);
    form.setFieldsValue(
      record ?? {
        salaryType: 'HOURLY',
        hourlyRate: 20,
        monthlySalary: 0,
        positionSalary: 0,
        attendanceDays: 26,
        fullAttendanceBonus: 200,
        latePenalty: 20,
        leaveDeductRatio: 100,
        sickLeaveRatio: 50,
        overtimeEnabled: 1,
        overtimeRate: 1.5,
      },
    );
    setEditOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      const picked: string[] = Array.isArray(values.userId) ? values.userId : [values.userId];
      // D-474：批量——给每个选中的员工各存一条规则
      for (const uid of picked) {
        await api.post('/finance/salary-config/save', { ...values, userId: uid });
      }
      message.success(picked.length > 1 ? `已为 ${picked.length} 名员工保存规则` : '薪资规则已保存');
      setEditOpen(false);
      void fetchList();
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '保存失败');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/finance/salary-config/${id}`);
      message.success('已删除');
      void fetchList();
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '删除失败');
    }
  };

  const handleCalc = async () => {
    if (!calcUserId) {
      message.warning('请选择员工');
      return;
    }
    try {
      const res: any = await api.get('/finance/salary-config/calculate', {
        params: { userId: calcUserId, month: calcMonth },
      });
      setCalcResult(res?.data ?? null);
      setCalcOpen(true);
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '试算失败');
    }
  };

  // D-474：员工选择器（远程搜索），支持单选与批量
  const [userOptions, setUserOptions] = useState<{ label: string; value: string }[]>([]);
  const [userLoading, setUserLoading] = useState(false);

  const searchUsers = useCallback(async (kw: string) => {
    setUserLoading(true);
    try {
      const res: any = await api.get('/system/user/list', {
        params: { name: kw || undefined, pageSize: 50 },
      });
      const recs = res?.data?.records ?? res?.data ?? [];
      setUserOptions(
        (Array.isArray(recs) ? recs : []).map((u: any) => ({
          // 薪资/考勤都以 username 作为 user_id，保持一致
          value: u.username || u.id,
          label: `${u.name || u.username}${u.employeeNo ? `（${u.employeeNo}）` : ''}`,
        })),
      );
    } catch {
      setUserOptions([]);
    } finally {
      setUserLoading(false);
    }
  }, []);

  useEffect(() => {
    void searchUsers('');
  }, [searchUsers]);

  /** D-474：一键生成当月工资单——算完直接推成应付账单，之后在收付款中心付款核销 */
  const handleGenerate = async () => {
    try {
      const res: any = await api.post(
        '/finance/salary-config/generate',
        null,
        { params: { month: calcMonth } },
      );
      const d = res?.data ?? {};
      message.success(
        `已生成 ${d.created ?? 0} 人工资单，合计 ¥${d.total ?? 0}` +
          (d.skipped ? `（跳过 ${d.skipped} 人：无规则或金额为 0）` : ''),
      );
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '生成工资单失败');
    }
  };

  /** D-474：打印工资条——只打印勾选的项 */
  const printPayslip = () => {
    if (!calcResult) return;
    const rows = SALARY_FIELDS.filter((f) => visibleFields.includes(f.key))
      .map((f) => {
        const v = calcResult[f.key];
        const text = `${f.prefix ?? ''}${v ?? 0}${f.suffix ?? ''}`;
        const strong = f.key === 'netPay';
        return `<tr><td style="padding:5px 10px;border:1px solid #333;">${f.label}</td>` +
          `<td style="padding:5px 10px;border:1px solid #333;text-align:right;` +
          `${strong ? 'font-weight:700;color:#c00000;' : ''}">${text}</td></tr>`;
      })
      .join('');
    const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"/>` +
      `<title>工资条 - ${calcResult.userName || calcResult.userId} - ${calcResult.month}</title>` +
      `<style>body{font-family:"Microsoft YaHei",sans-serif;font-size:13px;padding:20px;}` +
      `h2{text-align:center;margin:0 0 10px;}table{border-collapse:collapse;width:320px;margin:0 auto;}` +
      `.sign{margin-top:26px;width:320px;margin-left:auto;margin-right:auto;font-size:12px;}` +
      `@media print{button{display:none;}}</style></head><body>` +
      `<button onclick="window.print()" style="float:right;">打印</button>` +
      `<h2>工资条</h2>` +
      `<div style="text-align:center;margin-bottom:10px;">` +
      `${calcResult.userName || calcResult.userId} · ${calcResult.month} · ` +
      `${TYPE_MAP[calcResult.salaryType]?.text ?? calcResult.salaryType}</div>` +
      `<table>${rows}</table>` +
      `<div class="sign">员工签字：____________&nbsp;&nbsp;&nbsp;日期：__________</div>` +
      `</body></html>`;
    safePrint(html, `工资条-${calcResult.userName || calcResult.userId}-${calcResult.month}`);
  };

  const columns = [
    {
      title: '员工',
      dataIndex: 'userName',
      render: (v: string, r: SalaryConfig) => v || r.userId,
    },
    {
      title: '薪资类型',
      dataIndex: 'salaryType',
      render: (v: string) => {
        const t = TYPE_MAP[v] ?? { text: v, color: 'default' };
        return <Tag color={t.color}>{t.text}</Tag>;
      },
    },
    {
      title: '时薪(计时)',
      dataIndex: 'hourlyRate',
      render: (v: number) => (v != null ? `¥${v}` : '-'),
    },
    {
      title: '月薪(固定)',
      dataIndex: 'monthlySalary',
      render: (v: number) => (v ? `¥${v}` : '-'),
    },
    {
      title: '岗位工资',
      dataIndex: 'positionSalary',
      render: (v: number) => (v ? `¥${v}` : '-'),
    },
    { title: '应出勤', dataIndex: 'attendanceDays', render: (v: number) => (v ? `${v}天` : '-') },
    {
      title: '全勤奖',
      dataIndex: 'fullAttendanceBonus',
      render: (v: number) => (v ? `¥${v}` : '-'),
    },
    {
      title: '迟到扣款',
      dataIndex: 'latePenalty',
      render: (v: number) => (v ? `¥${v}/次` : '-'),
    },
    {
      title: '加班倍数',
      dataIndex: 'overtimeRate',
      render: (v: number) => (v ? `${v}倍` : '-'),
    },
    {
      title: '操作',
      render: (_: unknown, r: SalaryConfig) => (
        <Space size={4}>
          <Button type="link" size="small" onClick={() => openEdit(r)}>
            编辑
          </Button>
          <Button type="link" size="small" danger onClick={() => r.id && handleDelete(r.id)}>
            删除
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <Card
      title="薪资规则配置"
      extra={
        <Space>
          <Select
            style={{ width: 160 }}
            placeholder="选择员工试算"
            value={calcUserId || undefined}
            onChange={setCalcUserId}
            options={list.map((i) => ({ label: i.userName || i.userId, value: i.userId }))}
          />
          <Input
            style={{ width: 130 }}
            value={calcMonth}
            onChange={(e) => setCalcMonth(e.target.value)}
            placeholder="2026-09"
          />
          <Button onClick={handleCalc}>试算工资</Button>
          <Button type="primary" onClick={handleGenerate}>
            生成{calcMonth}工资单
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openEdit()}>
            新增规则
          </Button>
        </Space>
      }
    >
      <Table
        rowKey={(r) => r.id || r.userId}
        loading={loading}
        columns={columns}
        dataSource={list}
        pagination={false}
        size="small"
      />

      {/* 编辑/新增：用侧滑（项目统一风格，表单项多时更好填） */}
      <SideDrawer
        title={editing ? '编辑薪资规则' : '新增薪资规则'}
        open={editOpen}
        onClose={() => setEditOpen(false)}
        width={640}
        footer={
          <Space>
            <Button onClick={() => setEditOpen(false)}>取消</Button>
            <Button type="primary" onClick={handleSave}>保存</Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical" initialValues={{ salaryType: 'HOURLY' }}>
          <Form.Item
            name="userId"
            label={editing ? '员工' : '员工（可多选，批量应用同一套规则）'}
            rules={[{ required: true, message: '请选择员工' }]}
          >
            <Select
              showSearch
              allowClear
              mode={editing ? undefined : 'multiple'}
              disabled={!!editing}
              loading={userLoading}
              filterOption={false}
              placeholder="输入姓名搜索，可多选（一次给多个人用同一套规则）"
              onSearch={(v) => void searchUsers(v)}
              options={userOptions}
              maxTagCount="responsive"
            />
          </Form.Item>
          {!editing && (
            <div style={{ marginTop: -8, marginBottom: 12 }}>
              <Space size={4}>
                <Button
                  type="link"
                  size="small"
                  style={{ padding: 0 }}
                  onClick={() => form.setFieldValue('userId', userOptions.map((o) => o.value))}
                >
                  全选（{userOptions.length} 人）
                </Button>
                <Button
                  type="link"
                  size="small"
                  style={{ padding: 0 }}
                  onClick={() => form.setFieldValue('userId', [])}
                >
                  清空
                </Button>
              </Space>
            </div>
          )}
          <Form.Item name="userName" label="员工姓名（显示用，留空自动取系统姓名）">
            <Input placeholder="如 李老板" />
          </Form.Item>
          <Form.Item name="salaryType" label="薪资类型" rules={[{ required: true }]}>
            <Select
              options={[
                { label: '计时（按工时×时薪）', value: 'HOURLY' },
                { label: '固定月薪（按出勤天数折算）', value: 'FIXED' },
                { label: '计件（按工序数量）', value: 'PIECE' },
              ]}
            />
          </Form.Item>
          <Space wrap>
            <Form.Item name="hourlyRate" label="时薪（元/小时，计时用）">
              <InputNumber min={0} step={1} style={{ width: 160 }} />
            </Form.Item>
            <Form.Item name="monthlySalary" label="月薪（元，固定用）">
              <InputNumber min={0} step={100} style={{ width: 160 }} />
            </Form.Item>
            <Form.Item name="positionSalary" label="岗位工资（元）">
              <InputNumber min={0} step={100} style={{ width: 160 }} />
            </Form.Item>
          </Space>
          <Space wrap>
            <Form.Item name="attendanceDays" label="月应出勤天数">
              <InputNumber min={1} max={31} style={{ width: 160 }} />
            </Form.Item>
            <Form.Item name="fullAttendanceBonus" label="全勤奖（元）">
              <InputNumber min={0} step={50} style={{ width: 160 }} />
            </Form.Item>
            <Form.Item name="latePenalty" label="迟到扣款（元/次）">
              <InputNumber min={0} step={5} style={{ width: 160 }} />
            </Form.Item>
          </Space>
          <Space wrap>
            <Form.Item name="leaveDeductRatio" label="事假扣款比例(%)">
              <InputNumber min={0} max={100} style={{ width: 160 }} />
            </Form.Item>
            <Form.Item name="sickLeaveRatio" label="病假扣款比例(%)">
              <InputNumber min={0} max={100} style={{ width: 160 }} />
            </Form.Item>
            <Form.Item name="overtimeRate" label="加班倍数">
              <InputNumber min={1} max={3} step={0.5} style={{ width: 160 }} />
            </Form.Item>
          </Space>
        </Form>
      </SideDrawer>

      {/* D-474：工资条——完整罗列工资组成，可勾选显示项并打印 */}
      <SideDrawer
        title={`工资条 · ${calcResult?.userName || calcResult?.userId || ''} · ${calcResult?.month || ''}`}
        open={calcOpen}
        onClose={() => setCalcOpen(false)}
        width={560}
        footer={
          <Space>
            <Button onClick={() => setCalcOpen(false)}>关闭</Button>
            <Button type="primary" onClick={printPayslip}>打印工资条</Button>
          </Space>
        }
      >
        {calcResult?.configured === false ? (
          <div>{calcResult.message || '该员工还没设置薪资规则'}</div>
        ) : calcResult ? (
          <>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 13, marginBottom: 6 }}>打印/显示哪些项（不想让员工看到的可以勾掉）：</div>
              <Checkbox.Group
                options={SALARY_FIELDS.map((f) => ({ label: f.label, value: f.key }))}
                value={visibleFields}
                onChange={(v) => setVisibleFields(v as string[])}
              />
            </div>
            <Descriptions column={2} bordered size="small">
              {SALARY_FIELDS.filter((f) => visibleFields.includes(f.key)).map((f) => (
                <Descriptions.Item key={f.key} label={f.label}>
                  {f.key === 'netPay' ? (
                    <strong style={{ color: 'var(--color-error)' }}>
                      {f.prefix ?? ''}{calcResult[f.key] ?? 0}{f.suffix ?? ''}
                    </strong>
                  ) : (
                    `${f.prefix ?? ''}${calcResult[f.key] ?? 0}${f.suffix ?? ''}`
                  )}
                </Descriptions.Item>
              ))}
              <Descriptions.Item label="事假">{calcResult.leaveDays} 天</Descriptions.Item>
              <Descriptions.Item label="病假">{calcResult.sickLeaveDays} 天</Descriptions.Item>
            </Descriptions>
          </>
        ) : null}
      </SideDrawer>
    </Card>
  );
};

export default SalaryConfigPage;
