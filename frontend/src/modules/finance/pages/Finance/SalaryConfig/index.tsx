import React, { useEffect, useState } from 'react';
import { App, Button, Card, Descriptions, Form, Input, InputNumber, Modal, Select, Space, Table, Tag } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
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
      await api.post('/finance/salary-config/save', values);
      message.success('薪资规则已保存');
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

      {/* 编辑/新增 */}
      <Modal
        title={editing ? '编辑薪资规则' : '新增薪资规则'}
        open={editOpen}
        onOk={handleSave}
        onCancel={() => setEditOpen(false)}
        width={640}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" initialValues={{ salaryType: 'HOURLY' }}>
          <Form.Item name="userId" label="员工ID（系统用户ID）" rules={[{ required: true }]}>
            <Input placeholder="如 lilb" disabled={!!editing} />
          </Form.Item>
          <Form.Item name="userName" label="员工姓名">
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
      </Modal>

      {/* 试算结果 */}
      <Modal
        title="工资试算结果"
        open={calcOpen}
        onCancel={() => setCalcOpen(false)}
        footer={null}
        width={560}
      >
        {calcResult?.configured === false ? (
          <div>{calcResult.message || '该员工还没设置薪资规则'}</div>
        ) : calcResult ? (
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label="员工">{calcResult.userName || calcResult.userId}</Descriptions.Item>
            <Descriptions.Item label="月份">{calcResult.month}</Descriptions.Item>
            <Descriptions.Item label="薪资类型">
              {TYPE_MAP[calcResult.salaryType]?.text ?? calcResult.salaryType}
            </Descriptions.Item>
            <Descriptions.Item label="出勤天数">{calcResult.attendanceDays} 天</Descriptions.Item>
            <Descriptions.Item label="总工时">{calcResult.totalHours} 小时</Descriptions.Item>
            <Descriptions.Item label="迟到次数">{calcResult.lateCount} 次</Descriptions.Item>
            <Descriptions.Item label="事假">{calcResult.leaveDays} 天</Descriptions.Item>
            <Descriptions.Item label="病假">{calcResult.sickLeaveDays} 天</Descriptions.Item>
            <Descriptions.Item label="基本工资">¥{calcResult.baseWage}</Descriptions.Item>
            <Descriptions.Item label="加班费">¥{calcResult.overtimePay}</Descriptions.Item>
            <Descriptions.Item label="全勤奖">¥{calcResult.bonus}</Descriptions.Item>
            <Descriptions.Item label="迟到扣款">¥{calcResult.lateDeduction}</Descriptions.Item>
            <Descriptions.Item label="请假扣款">¥{calcResult.leaveDeduction}</Descriptions.Item>
            <Descriptions.Item label="应发合计">¥{calcResult.grossPay}</Descriptions.Item>
            <Descriptions.Item label="实发工资">
              <strong style={{ color: 'var(--color-error)' }}>¥{calcResult.netPay}</strong>
            </Descriptions.Item>
          </Descriptions>
        ) : null}
      </Modal>
    </Card>
  );
};

export default SalaryConfigPage;
