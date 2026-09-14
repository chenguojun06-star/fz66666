// QcRecordForm — 单条菲号质检/复检表单
// 抽离自原 ProcessKanbanDrawer.tsx，保持业务逻辑不变

import React from 'react';
import {
  Button, Col, Divider, Form, Input, InputNumber, Radio, Row, Select,
  Space, Statistic, Switch, Tag,
} from 'antd';
import {
  ArrowLeftOutlined, CheckCircleOutlined, CloseCircleOutlined,
  FileTextOutlined, LockOutlined, UnlockOutlined,
} from '@ant-design/icons';
import type { FormInstance } from 'antd';
import { STAGE_COLORS, DEFECT_CATEGORIES } from './ProcessKanbanDrawer.constants';
import { getDefectProblemsForProcess } from './ProcessKanbanDrawer.helpers';
import type { TrackingRecord, QcResult } from './ProcessKanbanDrawer.types';
import RemarkTimelineContent from './RemarkTimelineContent';

interface QcRecordFormProps {
  qcRecord: TrackingRecord;
  qcResult: QcResult;
  setQcResult: (v: QcResult) => void;
  qcForm: FormInstance;
  submitting: boolean;
  orderNo?: string;
  remarkPanelOpen: boolean;
  setRemarkPanelOpen: (v: boolean) => void;
  onBack: () => void;
  onSubmit: () => void;
}

const QcRecordForm: React.FC<QcRecordFormProps> = ({
  qcRecord, qcResult, setQcResult, qcForm, submitting,
  orderNo, remarkPanelOpen, setRemarkPanelOpen, onBack, onSubmit,
}) => {
  return (
    <div>
      <div className="u-d-flex u-ai-center u-gap-8 u-mb-16">
        <Button type="link" icon={<ArrowLeftOutlined />} onClick={onBack} className="u-p-0">
          返回菲号列表
        </Button>
        <Divider orientation="vertical" />
        <span className="u-fw-600 u-fs-15">
          {qcRecord.repairStatus === 'repair_done' ? '复检' : '工序质检'} — 菲号#{qcRecord.bundleNo} {qcRecord.processName}
        </span>
      </div>
      <div className="u-mb-12 u-br-8" style={{ padding: '10px 14px', background: 'var(--color-bg-page)' }}>
        <Row gutter={16}>
          <Col span={8}><Statistic title="菲号" value={qcRecord.bundleNo} styles={{ content: { fontSize: 18 } }} /></Col>
          <Col span={8}><Statistic title="总数量" value={qcRecord.quantity} styles={{ content: { fontSize: 18 } }} /></Col>
          <Col span={8}><Statistic title="工序" value={qcRecord.processName} styles={{ content: { fontSize: 15 } }} /></Col>
        </Row>
        <div className="u-mt-6 u-d-flex u-jc-between u-ai-center">
          <div>
            {qcRecord.color && <Tag>{qcRecord.color}</Tag>}
            {qcRecord.size && <Tag>{qcRecord.size}</Tag>}
            {qcRecord.progressStage && <Tag color={STAGE_COLORS[qcRecord.progressStage]}>{qcRecord.progressStage}</Tag>}
          </div>
          {orderNo && (
            <Button type="link" icon={<FileTextOutlined />} onClick={() => setRemarkPanelOpen(true)}>
              查看订单备注
            </Button>
          )}
        </div>
      </div>
      <Form form={qcForm} layout="vertical">
        <Row gutter={12}>
          <Col span={10}>
            <Form.Item label="质检结果" required>
              <Radio.Group
                value={qcResult}
                onChange={(e) => {
                  setQcResult(e.target.value);
                  if (e.target.value === 'qualified') {
                    qcForm.setFieldsValue({ defectQuantity: 0, defectCategory: undefined, defectProblems: undefined, lockBundle: false });
                  } else {
                    qcForm.setFieldsValue({ defectQuantity: undefined });
                  }
                }}
              >
                <Radio.Button value="qualified">
                  <CheckCircleOutlined style={{ color: 'var(--color-success)' }} /> 合格
                </Radio.Button>
                <Radio.Button value="unqualified" style={qcResult === 'unqualified' ? { color: 'var(--color-danger)', borderColor: 'var(--color-danger)' } : { color: 'var(--color-danger)' }}>
                  <CloseCircleOutlined /> 不合格
                </Radio.Button>
              </Radio.Group>
            </Form.Item>
          </Col>
          {qcResult === 'unqualified' && (
            <Col span={14}>
              <Form.Item name="defectQuantity" label="次品数量" rules={[{ required: true, message: '请输入' }]}>
                <InputNumber min={1} max={qcRecord?.quantity || 999} className="u-w-full" placeholder="次品数量" />
              </Form.Item>
            </Col>
          )}
        </Row>

        {qcResult === 'unqualified' && (
          <>
            <Row gutter={12}>
              <Col span={10}>
                <Form.Item name="defectCategory" label="缺陷分类" rules={[{ required: true, message: '请选择' }]}>
                  <Select placeholder="选择分类" options={DEFECT_CATEGORIES} />
                </Form.Item>
              </Col>
              <Col span={14}>
                <Form.Item name="defectProblems" label="具体次品问题" rules={[{ required: true, message: '请选择' }]}>
                  <Select
                    mode="multiple"
                    placeholder="选择次品问题"
                    options={getDefectProblemsForProcess(qcRecord?.processName, qcRecord?.progressStage)}
                    maxTagCount={3}
                    allowClear
                    showSearch
                    optionFilterProp="label"
                  />
                </Form.Item>
              </Col>
            </Row>
            <div className="u-p-8px12px u-br-6 u-mb-12" style={{ border: '1px solid var(--status-error-border)' }}>
              <Form.Item name="lockBundle" valuePropName="checked" className="u-mb-0">
                <Space>
                  <Switch checkedChildren={<LockOutlined />} unCheckedChildren={<UnlockOutlined />} />
                  <span className="u-fw-500" style={{ color: 'var(--color-error)' }}>锁定菲号，阻止下游扫码</span>
                </Space>
              </Form.Item>
            </div>
          </>
        )}

        <Form.Item name="qualityRemark" label="备注" extra="备注将同步到订单备注">
          <Input.TextArea rows={3} placeholder="可选，记录质检情况" />
        </Form.Item>

        <div className="u-d-flex u-jc-end u-gap-8 u-mt-8">
          <Button onClick={onBack}>取消</Button>
          <Button type="primary" onClick={onSubmit} loading={submitting}>提交质检结果</Button>
        </div>
      </Form>

      {remarkPanelOpen && orderNo && (
        <div className="u-mt-16" style={{ borderTop: '1px solid var(--color-border-light)', paddingTop: 16 }}>
          <div className="u-d-flex u-jc-between u-ai-center u-mb-8">
            <span className="u-fw-600"><FileTextOutlined className="u-mr-6" />订单备注 — {orderNo}</span>
            <Button type="link" size="small" onClick={() => setRemarkPanelOpen(false)}>收起</Button>
          </div>
          <RemarkTimelineContent targetType="order" targetNo={orderNo} canAddRemark />
        </div>
      )}
    </div>
  );
};

export default QcRecordForm;
