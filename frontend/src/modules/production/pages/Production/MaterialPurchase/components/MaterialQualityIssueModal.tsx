import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Button, Card, Descriptions, Form, Input, InputNumber, Select, Space, Tag } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import ResizableTable from '@/components/common/ResizableTable';
import type { MaterialPurchase } from '@/types/production';
import { materialQualityIssueApi, type MaterialQualityIssue } from '@/services/production/materialQualityIssueApi';
import { formatDateTime } from '@/utils/datetime';
import type { ApiResult } from '@/utils/api';

interface Props {
  open: boolean;
  purchase: MaterialPurchase | null;
  onClose: () => void;
  onChanged?: () => Promise<void> | void;
}

const ISSUE_TYPE_OPTIONS = [
  { label: '品质瑕疵', value: 'QUALITY_DEFECT' },
  { label: '色差问题', value: 'COLOR_DIFF' },
  { label: '破损污渍', value: 'DAMAGE' },
  { label: '规格不符', value: 'SPEC_MISMATCH' },
  { label: '其他异常', value: 'OTHER' },
];

const SEVERITY_OPTIONS = [
  { label: '轻微', value: 'MINOR', color: 'gold' },
  { label: '严重', value: 'MAJOR', color: 'orange' },
  { label: '致命', value: 'CRITICAL', color: 'red' },
];

const DISPOSITION_OPTIONS = [
  { label: '退货处理', value: 'RETURN_GOODS' },
  { label: '补货处理', value: 'REPLENISH' },
  { label: '对账扣款', value: 'DEDUCT_PAYMENT' },
  { label: '让步接收', value: 'ACCEPT_AS_IS' },
];

const STATUS_OPTIONS: Record<string, { label: string; color: string }> = {
  OPEN: { label: '待处理', color: 'processing' },
  RESOLVED: { label: '已处理', color: 'success' },
};

const getOptionLabel = (options: Array<{ label: string; value: string }>, value?: string) =>
  options.find((item) => item.value === value)?.label || value || '-';

const MaterialQualityIssueModal: React.FC<Props> = ({ open, purchase, onClose, onChanged }) => {
  const { message } = App.useApp();
  const [createForm] = Form.useForm();
  const [resolveForm] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resolveSubmitting, setResolveSubmitting] = useState(false);
  const [issues, setIssues] = useState<MaterialQualityIssue[]>([]);
  const [resolveTarget, setResolveTarget] = useState<MaterialQualityIssue | null>(null);

  const purchaseId = String(purchase?.id || '').trim();
  const maxIssueQuantity = useMemo(() => {
    const arrived = Number(purchase?.arrivedQuantity || 0);
    const purchaseQty = Number(purchase?.purchaseQuantity || 0);
    return arrived > 0 ? arrived : purchaseQty;
  }, [purchase?.arrivedQuantity, purchase?.purchaseQuantity]);

  const loadIssues = useCallback(async () => {
    if (!purchaseId) {
      setIssues([]);
      return;
    }
    setLoading(true);
    try {
      const res = await materialQualityIssueApi.listByPurchaseId(purchaseId) as ApiResult<MaterialQualityIssue[]>;
      const data = res?.data ?? res;
      setIssues(Array.isArray(data) ? data : []);
    } catch {
      message.error('加载品质异常记录失败');
    } finally {
      setLoading(false);
    }
  }, [message, purchaseId]);

  useEffect(() => {
    if (!open) {
      setResolveTarget(null);
      return;
    }
    createForm.setFieldsValue({
      issueType: 'QUALITY_DEFECT',
      severity: 'MAJOR',
      disposition: 'RETURN_GOODS',
      issueQuantity: maxIssueQuantity > 0 ? Math.min(1, maxIssueQuantity) : 1,
      remark: '',
    });
    void loadIssues();
  }, [loadIssues, maxIssueQuantity, open]);

  const handleCreate = async () => {
    if (!purchaseId) {
      return;
    }
    const values = await createForm.validateFields();
    setSubmitting(true);
    try {
      await materialQualityIssueApi.create({
        purchaseId,
        issueType: values.issueType,
        severity: values.severity,
        disposition: values.disposition,
        issueQuantity: Number(values.issueQuantity),
        remark: String(values.remark || '').trim(),
      });
      message.success('品质异常已登记');
      createForm.setFieldValue('remark', '');
      await loadIssues();
      await onChanged?.();
    } catch (error: unknown) {
      message.error(error instanceof Error ? error.message : '品质异常登记失败');
    } finally {
      setSubmitting(false);
    }
  };

  const openResolve = (issue: MaterialQualityIssue) => {
    setResolveTarget(issue);
    resolveForm.setFieldsValue({
      disposition: issue.disposition || 'RETURN_GOODS',
      resolutionRemark: '',
    });
  };

  const handleResolve = async () => {
    if (!resolveTarget?.id) {
      return;
    }
    const values = await resolveForm.validateFields();
    setResolveSubmitting(true);
    try {
      await materialQualityIssueApi.resolve(resolveTarget.id, {
        disposition: values.disposition,
        resolutionRemark: String(values.resolutionRemark || '').trim(),
      });
      message.success('品质异常已处理');
      setResolveTarget(null);
      resolveForm.resetFields();
      await loadIssues();
      await onChanged?.();
    } catch (error: unknown) {
      message.error(error instanceof Error ? error.message : '处理失败');
    } finally {
      setResolveSubmitting(false);
    }
  };

  return (
    <>
      <ResizableModal
        open={open}
        title="面辅料品质异常"
        onCancel={onClose}
        footer={null}
        width="72vw"
        initialHeight={Math.round(window.innerHeight * 0.82)}
        destroyOnHidden
      >
        <div style={{ marginTop: 16, display: 'grid', gap: 16 }}>
          <Descriptions bordered column={3}>
            <Descriptions.Item label="采购单号">{purchase?.purchaseNo || '-'}</Descriptions.Item>
            <Descriptions.Item label="供应商">{purchase?.supplierName || '-'}</Descriptions.Item>
            <Descriptions.Item label="订单号">{purchase?.orderNo || '-'}</Descriptions.Item>
            <Descriptions.Item label="物料编码">{purchase?.materialCode || '-'}</Descriptions.Item>
            <Descriptions.Item label="物料名称">{purchase?.materialName || '-'}</Descriptions.Item>
            <Descriptions.Item label="到货数量">{purchase?.arrivedQuantity ?? purchase?.purchaseQuantity ?? '-'}</Descriptions.Item>
          </Descriptions>
          <Card title="登记异常">
            <Form form={createForm} layout="vertical">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
                <Form.Item name="issueType" label="异常类型" rules={[{ required: true, message: '请选择异常类型' }]}>
                  <Select options={ISSUE_TYPE_OPTIONS} showSearch optionFilterProp="label" />
                </Form.Item>
                <Form.Item name="severity" label="严重等级" rules={[{ required: true, message: '请选择严重等级' }]}>
                  <Select options={SEVERITY_OPTIONS.map(({ label, value }) => ({ label, value }))} showSearch optionFilterProp="label" />
                </Form.Item>
                <Form.Item
                  name="issueQuantity"
                  label="异常数量"
                  rules={[{ required: true, message: '请填写异常数量' }]}
                >
                  <InputNumber min={1} max={maxIssueQuantity > 0 ? maxIssueQuantity : undefined} precision={0} style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item name="disposition" label="建议处理" rules={[{ required: true, message: '请选择建议处理' }]}>
                  <Select options={DISPOSITION_OPTIONS} showSearch optionFilterProp="label" />
                </Form.Item>
              </div>
              <Form.Item
                name="remark"
                label="异常说明"
                rules={[{ required: true, message: '请填写异常说明' }, { min: 4, message: '请至少写 4 个字' }]}
              >
                <Input.TextArea autoSize={{ minRows: 3, maxRows: 8 }} placeholder="例如：布面抽丝 8 米，建议退货补货" />
              </Form.Item>
              <Space>
                <Button type="primary" loading={submitting} onClick={() => void handleCreate()}>
                  提交异常
                </Button>
                <Button onClick={() => createForm.resetFields()}>
                  重置
                </Button>
              </Space>
            </Form>
          </Card>
          <Card title={`异常记录（${issues.length}）`}>
            <ResizableTable<MaterialQualityIssue>
              rowKey="id"
             
              pagination={false}
              loading={loading}
              dataSource={issues}
              scroll={{ x: 1100 }}
              locale={{ emptyText: '暂无品质异常记录' }}
              columns={[
                { title: '异常单号', dataIndex: 'issueNo', width: 180 },
                { title: '异常类型', dataIndex: 'issueType', width: 120, render: (v?: string) => getOptionLabel(ISSUE_TYPE_OPTIONS, v) },
                {
                  title: '严重等级',
                  dataIndex: 'severity',
                  width: 100,
                  render: (v?: string) => {
                    const item = SEVERITY_OPTIONS.find((option) => option.value === v);
                    return <Tag color={item?.color || 'default'}>{item?.label || v || '-'}</Tag>;
                  },
                },
                { title: '异常数量', dataIndex: 'issueQuantity', width: 100, align: 'right' },
                { title: '处理方式', dataIndex: 'disposition', width: 120, render: (v?: string) => getOptionLabel(DISPOSITION_OPTIONS, v) },
                {
                  title: '业务扭转',
                  key: 'businessImpact',
                  width: 220,
                  render: (_, record) => {
                    if (record.relatedPurchaseNo) {
                      return `已生成补货单 ${record.relatedPurchaseNo}`;
                    }
                    if (typeof record.deductionAmount === 'number') {
                      return `已扣款 ¥${record.deductionAmount.toFixed(2)}`;
                    }
                    return record.status === 'RESOLVED' ? '已同步原采购业务' : '-';
                  },
                },
                {
                  title: '状态',
                  dataIndex: 'status',
                  width: 90,
                  render: (v?: string) => <Tag color={(STATUS_OPTIONS[v || ''] || { color: 'default' }).color}>{(STATUS_OPTIONS[v || ''] || { label: v || '-' }).label}</Tag>,
                },
                { title: '异常说明', dataIndex: 'remark', width: 240, ellipsis: true },
                { title: '处理结果', dataIndex: 'resolutionRemark', width: 220, ellipsis: true, render: (v?: string) => v || '-' },
                { title: '登记人', dataIndex: 'reporterName', width: 100, render: (v?: string) => v || '-' },
                { title: '登记时间', dataIndex: 'createTime', width: 160, render: (v?: string) => formatDateTime(v) || '-' },
                {
                  title: '操作',
                  key: 'actions',
                  width: 110,
                  fixed: 'right',
                  render: (_, record) => record.status === 'RESOLVED' ? (
                    <Tag color="success">已完成</Tag>
                  ) : (
                    <Button type="link" onClick={() => openResolve(record)}>
                      处理完成
                    </Button>
                  ),
                },
              ]}
            />
          </Card>
        </div>
      </ResizableModal>
      <ResizableModal
        open={Boolean(resolveTarget)}
        title="处理品质异常"
        onCancel={() => {
          setResolveTarget(null);
          resolveForm.resetFields();
        }}
        onOk={() => void handleResolve()}
        okText="确认处理"
        cancelText="取消"
        width="40vw"
        confirmLoading={resolveSubmitting}
        destroyOnHidden
      >
        <Form form={resolveForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="disposition" label="最终处理方式" rules={[{ required: true, message: '请选择处理方式' }]}>
            <Select options={DISPOSITION_OPTIONS} showSearch optionFilterProp="label" />
          </Form.Item>
          <Form.Item
            name="resolutionRemark"
            label="处理结果"
            rules={[{ required: true, message: '请填写处理结果' }, { min: 4, message: '请至少写 4 个字' }]}
          >
            <Input.TextArea autoSize={{ minRows: 3, maxRows: 8 }} placeholder="例如：供应商确认补货 8 米，本批次先退回处理" />
          </Form.Item>
        </Form>
      </ResizableModal>
    </>
  );
};

export default MaterialQualityIssueModal;
