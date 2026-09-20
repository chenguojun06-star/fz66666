import React, { useCallback, useEffect, useState } from 'react';
import { App, Button, Card, Form, Input, InputNumber, Select, Space, Table, Tabs, Tag } from 'antd';
import api from '@/utils/api';

/**
 * D-474：扣款管理。
 * - 扣款类型由管理员设定（质量/延期/次品/其他），可设默认金额或按比例扣
 * - 录入扣款：选对象 + 类型 + 金额 → 推成账单（金额记负数），在收付款中心冲减应付
 */
interface DeductionType {
  id?: string;
  typeCode: string;
  typeName: string;
  applyTarget: 'WORKER' | 'FACTORY' | 'BOTH';
  defaultAmount?: number;
  deductRatio?: number;
  sortOrder?: number;
  status?: string;
}

const TARGET_TEXT: Record<string, string> = {
  WORKER: '员工',
  FACTORY: '外发工厂',
  BOTH: '员工/工厂',
};

const DeductionManagePage: React.FC = () => {
  const { message } = App.useApp();
  const [types, setTypes] = useState<DeductionType[]>([]);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  const fetchTypes = useCallback(async () => {
    setLoading(true);
    try {
      const res: any = await api.get('/finance/deduction/types');
      setTypes(res?.data ?? []);
    } catch {
      setTypes([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchTypes();
  }, [fetchTypes]);

  /** 新增/更新类型（简化：直接按当前输入保存） */
  const handleSaveType = async () => {
    try {
      const v = await form.validateFields();
      await api.post('/finance/deduction/types/save', v);
      message.success('扣款类型已保存');
      form.resetFields();
      void fetchTypes();
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '保存失败');
    }
  };

  const handleDeleteType = async (id: string) => {
    await api.delete(`/finance/deduction/types/${id}`);
    message.success('已删除');
    void fetchTypes();
  };

  /** 录入扣款 */
  const [deductForm] = Form.useForm();
  const handleCreate = async () => {
    try {
      const v = await deductForm.validateFields();
      setSubmitting(true);
      const res: any = await api.post('/finance/deduction/create', null, {
        params: {
          targetType: v.targetType,
          targetId: v.targetId,
          targetName: v.targetName,
          typeCode: v.typeCode,
          amount: v.amount,
          month: v.month,
          remark: v.remark,
        },
      });
      const d = res?.data ?? {};
      if (d.success === false) {
        message.error(d.message || '录入失败');
      } else {
        message.success(d.message || `扣款已录入 ¥${d.amount}`);
        deductForm.resetFields();
      }
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '录入失败');
    } finally {
      setSubmitting(false);
    }
  };

  const typeColumns = [
    { title: '编码', dataIndex: 'typeCode' },
    { title: '名称', dataIndex: 'typeName' },
    {
      title: '适用对象',
      dataIndex: 'applyTarget',
      render: (v: string) => <Tag color={v === 'FACTORY' ? 'blue' : 'green'}>{TARGET_TEXT[v] ?? v}</Tag>,
    },
    { title: '默认金额', dataIndex: 'defaultAmount', render: (v: number) => (v ? `¥${v}` : '-') },
    { title: '扣款比例', dataIndex: 'deductRatio', render: (v: number) => (v ? `${v}%` : '-') },
    { title: '排序', dataIndex: 'sortOrder' },
    {
      title: '操作',
      render: (_: unknown, r: DeductionType) => (
        <Button type="link" size="small" danger onClick={() => r.id && handleDeleteType(r.id)}>
          删除
        </Button>
      ),
    },
  ];

  return (
    <Card title="扣款管理">
      <Tabs
        items={[
          {
            key: 'types',
            label: '扣款类型',
            children: (
              <>
                <Form form={form} layout="inline" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                  <Form.Item name="typeCode" rules={[{ required: true }]}>
                    <Input placeholder="编码 如 QUALITY" style={{ width: 140 }} />
                  </Form.Item>
                  <Form.Item name="typeName" rules={[{ required: true }]}>
                    <Input placeholder="名称 如 质量扣款" style={{ width: 160 }} />
                  </Form.Item>
                  <Form.Item name="applyTarget" initialValue="WORKER">
                    <Select
                      style={{ width: 120 }}
                      options={[
                        { label: '员工', value: 'WORKER' },
                        { label: '外发工厂', value: 'FACTORY' },
                        { label: '两者', value: 'BOTH' },
                      ]}
                    />
                  </Form.Item>
                  <Form.Item name="defaultAmount">
                    <InputNumber placeholder="默认金额" style={{ width: 120 }} min={0} />
                  </Form.Item>
                  <Form.Item name="deductRatio">
                    <InputNumber placeholder="比例%" style={{ width: 110 }} min={0} max={100} />
                  </Form.Item>
                  <Form.Item name="sortOrder">
                    <InputNumber placeholder="排序" style={{ width: 90 }} min={0} />
                  </Form.Item>
                  <Button type="primary" onClick={handleSaveType}>
                    新增类型
                  </Button>
                </Form>
                <Table
                  rowKey={(r) => r.id || r.typeCode}
                  loading={loading}
                  columns={typeColumns}
                  dataSource={types}
                  pagination={false}
                  size="small"
                />
              </>
            ),
          },
          {
            key: 'create',
            label: '录入扣款',
            children: (
              <Form form={deductForm} layout="vertical" style={{ maxWidth: 520 }}>
                <Form.Item name="targetType" label="扣谁的钱" rules={[{ required: true }]} initialValue="WORKER">
                  <Select
                    options={[
                      { label: '员工', value: 'WORKER' },
                      { label: '外发工厂', value: 'FACTORY' },
                    ]}
                  />
                </Form.Item>
                <Form.Item name="targetId" label="对象ID（员工登录名 / 工厂ID）" rules={[{ required: true }]}>
                  <Input placeholder="如 lilb" />
                </Form.Item>
                <Form.Item name="targetName" label="对象名称" rules={[{ required: true }]}>
                  <Input placeholder="如 李老板 / 某某加工厂" />
                </Form.Item>
                <Form.Item name="typeCode" label="扣款类型" rules={[{ required: true }]}>
                  <Select
                    placeholder="选择扣款类型"
                    options={types.map((t) => ({ label: t.typeName, value: t.typeCode }))}
                  />
                </Form.Item>
                <Form.Item name="amount" label="扣款金额（元）" rules={[{ required: true }]}>
                  <InputNumber min={0} step={10} style={{ width: 200 }} />
                </Form.Item>
                <Form.Item name="month" label="结算月份">
                  <Input placeholder="2026-09" style={{ width: 200 }} />
                </Form.Item>
                <Form.Item name="remark" label="说明">
                  <Input.TextArea placeholder="如：次品 3 件，按每件 30 元扣" rows={2} />
                </Form.Item>
                <Space>
                  <Button type="primary" loading={submitting} onClick={handleCreate}>
                    录入并生成账单
                  </Button>
                  <Button onClick={() => deductForm.resetFields()}>重置</Button>
                </Space>
                <div style={{ marginTop: 12, fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                  录入后会自动生成一张账单（金额记负数），在收付款中心对账付款时自动冲减应付金额。
                </div>
              </Form>
            ),
          },
        ]}
      />
    </Card>
  );
};

export default DeductionManagePage;
