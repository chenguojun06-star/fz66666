import React, { useMemo, useState } from 'react';
import { App, Button, Input, Select, Space, Tag } from 'antd';
import { intelligenceApi } from '@/services/intelligence/intelligenceApi';

type FeedbackMode = 'accept' | 'reject';

type Props = {
  predictionId?: string;
  predictedFinishTime?: string;
  orderId?: string;
  orderNo?: string;
  stageName: string;
  processName?: string;
};

const ACCEPT_REASON_OPTIONS = [
  { value: 'ALREADY_ON_TRACK', label: '当前排程可执行' },
  { value: 'CAPACITY_COORDINATED', label: '已协调产能处理' },
  { value: 'SCHEDULE_ADJUSTED', label: '已按建议调整节奏' },
  { value: 'OTHER_ACCEPTED', label: '其他采纳原因' },
];

const REJECT_REASON_OPTIONS = [
  { value: 'FACTORY_UNCONTROLLABLE', label: '工厂执行不可控' },
  { value: 'MATERIAL_NOT_READY', label: '物料未就绪' },
  { value: 'CASHFLOW_FIRST', label: '当前先保现金流' },
  { value: 'ORDER_CHANGED', label: '客户/订单计划变更' },
  { value: 'OTHER_REJECTED', label: '其他未采纳原因' },
];

const PredictionFeedbackBar: React.FC<Props> = ({
  predictionId,
  predictedFinishTime,
  orderId,
  orderNo,
  stageName,
  processName,
}) => {
  const { message } = App.useApp();
  const [mode, setMode] = useState<FeedbackMode | null>(null);
  const [reasonCode, setReasonCode] = useState<string>();
  const [reasonText, setReasonText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const options = useMemo(
    () => (mode === 'accept' ? ACCEPT_REASON_OPTIONS : REJECT_REASON_OPTIONS),
    [mode],
  );

  const chooseMode = (nextMode: FeedbackMode) => {
    setMode(nextMode);
    setSubmitted(false);
    setReasonText('');
    setReasonCode((nextMode === 'accept' ? ACCEPT_REASON_OPTIONS : REJECT_REASON_OPTIONS)[0].value);
  };

  const submit = async () => {
    if (!mode || !reasonCode) {
      message.warning('请选择反馈原因');
      return;
    }
    try {
      setSubmitting(true);
      const result = await intelligenceApi.feedback({
        predictionId,
        suggestionType: 'FINISH_TIME_PREDICTION',
        reasonCode,
        reasonText: reasonText.trim() || undefined,
        orderId,
        orderNo,
        stageName,
        processName,
        predictedFinishTime,
        acceptedSuggestion: mode === 'accept',
      });
      if ((result as any)?.code === 200) {
        setSubmitted(true);
        message.success('智能反馈已记录');
      } else {
        message.error((result as any)?.message || '反馈记录失败');
      }
    } catch (error: unknown) {
      message.error(error instanceof Error ? error.message : '反馈记录失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #e0e0e0', width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <span style={{ color: '#333', fontSize: 13, fontWeight: 500 }}>这条预测是否可执行？</span>
        <Button
         
          type={mode === 'accept' ? 'primary' : 'default'}
          onClick={() => chooseMode('accept')}
        >
          ✓ 可执行
        </Button>
        <Button
         
          type={mode === 'reject' ? 'primary' : 'default'}
          danger={mode === 'reject'}
          onClick={() => chooseMode('reject')}
        >
          ✕ 不可执行
        </Button>
        {submitted && <Tag color="success">已记录</Tag>}
      </div>

      {mode && (
        <Space.Compact style={{ display: 'flex', width: '100%' }}>
          <Select
            style={{ width: 220 }}
            value={reasonCode}
            onChange={setReasonCode}
            options={options}
            placeholder="选择原因"
          />
          <Input
            value={reasonText}
            onChange={(event) => setReasonText(event.target.value)}
            maxLength={80}
            placeholder={mode === 'accept' ? '补充说明，例如已协调好工厂' : '补充卡点原因，例如面料晚到/客户临改'}
          />
          <Button type="primary" loading={submitting} onClick={submit}>
            记录反馈
          </Button>
        </Space.Compact>
      )}
    </div>
  );
};

export default PredictionFeedbackBar;
