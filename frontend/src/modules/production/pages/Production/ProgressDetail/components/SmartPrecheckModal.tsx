/**
 * SmartPrecheckModal — 智能预检风险弹窗
 *
 * 入口：confirmPrecheckRisk(data) → Promise<boolean>
 *  - LOW  + 无 issues → 立即 resolve(true)，静默通过
 *  - MEDIUM             → 橙色警告弹窗，用户可「确认继续」或「返回修改」
 *  - HIGH               → 红色阻断弹窗，强调风险，需「忽略风险，强制提交」才继续
 */
import React from 'react';
import { Modal, Tag, Space, Typography, Divider } from 'antd';
import {
  WarningOutlined,
  StopOutlined,
  BulbOutlined,
} from '@ant-design/icons';

const { Text } = Typography;

/* ── DTOs（与后端 PrecheckScanResponse / PrecheckIssue 对应） ── */
export interface PrecheckIssue {
  code?: string;
  level?: string;
  title?: string;
  reason?: string;
  suggestion?: string;
}

export interface PrecheckData {
  riskLevel?: string;       // "LOW" | "MEDIUM" | "HIGH"
  issues?: PrecheckIssue[];
  suggestions?: string[];
  traceId?: string;
}

/* ── Issue 卡片 ── */
const IssueCard: React.FC<{ issue: PrecheckIssue; isHigh: boolean }> = ({ issue, isHigh }) => (
  <div
    style={{
      background: isHigh ? '#fff1f0' : '#fffbe6',
      border: `1px solid ${isHigh ? '#ffccc7' : '#ffe58f'}`,
      borderRadius: 8,
      padding: '10px 14px',
    }}
  >
    <div style={{ marginBottom: 4 }}>
      <Tag color={isHigh ? 'error' : 'warning'} style={{ marginRight: 6, fontWeight: 600 }}>
        {issue.level || (isHigh ? 'HIGH' : 'MEDIUM')}
      </Tag>
      <Text strong style={{ color: isHigh ? '#cf1322' : '#ad6800' }}>
        {issue.title || '未知风险项'}
      </Text>
    </div>
    {issue.reason && (
      <div style={{ color: '#595959', fontSize: 12, lineHeight: '18px' }}>{issue.reason}</div>
    )}
    {issue.suggestion && (
      <div style={{ color: '#096dd9', fontSize: 12, marginTop: 4 }}>
        <BulbOutlined style={{ marginRight: 4 }} />
        {issue.suggestion}
      </div>
    )}
  </div>
);

/* ── 弹窗内容 ── */
const ModalContent: React.FC<{ data: PrecheckData; isHigh: boolean }> = ({ data, isHigh }) => {
  const issues: PrecheckIssue[] = Array.isArray(data?.issues) ? data.issues : [];
  const suggestions: string[] = Array.isArray(data?.suggestions) ? data.suggestions : [];

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={10}>
      {issues.map((issue, idx) => (
        <IssueCard key={issue.code ?? idx} issue={issue} isHigh={isHigh} />
      ))}

      {suggestions.length > 0 && (
        <>
          {issues.length > 0 && <Divider style={{ margin: '4px 0' }} />}
          <div style={{ color: '#8c8c8c', fontSize: 12, lineHeight: '18px' }}>
            <BulbOutlined style={{ marginRight: 4, color: '#faad14' }} />
            <Text type="secondary">智能建议：</Text>
            {suggestions.join('；')}
          </div>
        </>
      )}
    </Space>
  );
};

/* ── 主导出函数 ── */
export function confirmPrecheckRisk(data: PrecheckData): Promise<boolean> {
  const riskLevel = (data?.riskLevel || 'LOW').toUpperCase();
  const issues: PrecheckIssue[] = Array.isArray(data?.issues) ? data.issues : [];
  const suggestions: string[] = Array.isArray(data?.suggestions) ? data.suggestions : [];

  // LOW 且无任何 issues → 静默放行
  if (riskLevel === 'LOW' && issues.length === 0 && suggestions.length === 0) {
    return Promise.resolve(true);
  }

  const isHigh = riskLevel === 'HIGH';

  return new Promise<boolean>((resolve) => {
    let resolved = false;
    const safeResolve = (val: boolean) => {
      if (!resolved) {
        resolved = true;
        resolve(val);
      }
    };

    Modal.confirm({
      icon: isHigh
        ? <StopOutlined style={{ color: '#ff4d4f' }} />
        : <WarningOutlined style={{ color: '#faad14' }} />,
      title: (
        <span style={{ color: isHigh ? '#cf1322' : '#ad6800', fontWeight: 700 }}>
          {isHigh ? '🔴 高风险预警 — 建议暂停' : '🟡 中等风险提示'}
        </span>
      ),
      content: <ModalContent data={data} isHigh={isHigh} />,
      okText: isHigh ? '忽略风险，强制提交' : '确认继续',
      cancelText: '返回修改',
      okButtonProps: { danger: isHigh },
      cancelButtonProps: { type: isHigh ? 'primary' : 'default' },
      width: 500,
      maskClosable: false,
      onOk() {
        safeResolve(true);
      },
      onCancel() {
        safeResolve(false);
      },
    });
  });
}
