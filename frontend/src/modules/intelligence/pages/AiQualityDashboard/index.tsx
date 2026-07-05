import React, { useState, useCallback } from 'react';
import { Card, Button, Table, Tag, Statistic, Row, Col, message, Descriptions, Empty } from 'antd';
import { ReloadOutlined, ExperimentOutlined, SafetyOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { intelligenceApi } from '@/services/intelligence/intelligenceApi';

interface EvalResult {
  name: string;
  question: string;
  passed: boolean;
  score: number;
  answer?: string;
  error?: string;
}

interface GoldenEvalData {
  status: string;
  total: number;
  passed: number;
  avgScore: number;
  results: EvalResult[];
}

// 安全护栏字段中文标签映射
const GUARDRAIL_LABELS: Record<string, string> = {
  maxTurns: '最大对话轮数',
  maxTokens: '最大 Token 数',
  allowedTools: '允许使用的工具',
  forbiddenTools: '禁止使用的工具',
  forbiddenTopics: '禁止讨论的话题',
  allowedTopics: '允许讨论的话题',
  maxToolCalls: '最大工具调用次数',
  timeoutMs: '超时时间（毫秒）',
  retryLimit: '重试次数上限',
  enableGuardrail: '是否启用护栏',
  enableReflection: '是否启用反思',
  enableToolReview: '是否启用工具审查',
  temperature: '温度参数',
  topP: 'Top-P 参数',
  safetyLevel: '安全等级',
  rules: '规则列表',
  description: '说明',
};

// 安全等级中文化
const SAFETY_LEVEL_MAP: Record<string, string> = {
  strict: '严格',
  moderate: '适中',
  loose: '宽松',
  high: '高',
  medium: '中',
  low: '低',
};

// 将任意值转换为中文友好的展示字符串
const formatGuardrailValue = (key: string, value: unknown): string => {
  if (value == null) return '未设置';
  if (Array.isArray(value)) {
    if (value.length === 0) return '无';
    return value.map((v) => formatGuardrailValue(key, v)).join('、');
  }
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (typeof value === 'object') return JSON.stringify(value);
  if (typeof value === 'string') {
    if (key === 'safetyLevel') return SAFETY_LEVEL_MAP[value.toLowerCase()] ?? value;
    return value;
  }
  return String(value);
};

// 安全护栏结构化展示
const GuardrailsView: React.FC<{ guardrails: Record<string, unknown> }> = ({ guardrails }) => {
  const entries = Object.entries(guardrails).filter(([, v]) => v != null);
  if (entries.length === 0) {
    return <Empty description="暂无安全规则配置" />;
  }
  return (
    <Descriptions column={1} bordered size="small">
      {entries.map(([key, value]) => (
        <Descriptions.Item
          key={key}
          label={GUARDRAIL_LABELS[key] ?? key}
        >
          {formatGuardrailValue(key, value)}
        </Descriptions.Item>
      ))}
    </Descriptions>
  );
};

const AiQualityDashboard: React.FC = () => {
  const [evalData, setEvalData] = useState<GoldenEvalData | null>(null);
  const [loading, setLoading] = useState(false);
  const [guardrails, setGuardrails] = useState<Record<string, unknown> | null>(null);

  const runGoldenEval = useCallback(async () => {
    setLoading(true);
    try {
      const res = await intelligenceApi.runGoldenEval();
      setEvalData(res as unknown as GoldenEvalData);
      message.success(`回归测试完成: ${res.passed}/${res.total} 通过, 均分 ${res.avgScore}`);
    } catch (e: unknown) {
      message.error('回归测试失败: ' + (e instanceof Error ? e.message : '未知错误'));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadGuardrails = useCallback(async () => {
    try {
      const res = await intelligenceApi.getGuardrails();
      setGuardrails(res);
    } catch (e: unknown) {
      message.error('加载安全规则失败: ' + (e instanceof Error ? e.message : '未知错误'));
    }
  }, []);

  const columns = [
    { title: '测试用例', dataIndex: 'name', key: 'name', width: 150 },
    {
      title: '问题',
      dataIndex: 'question',
      key: 'question',
      ellipsis: true,
      render: (text: string) => text.length > 60 ? text.substring(0, 60) + '…' : text,
    },
    {
      title: '结果',
      dataIndex: 'passed',
      key: 'passed',
      width: 80,
      render: (passed: boolean) =>
        passed ? <Tag icon={<CheckCircleOutlined />} color="success">通过</Tag> : <Tag icon={<CloseCircleOutlined />} color="error">未通过</Tag>,
    },
    { title: '得分', dataIndex: 'score', key: 'score', width: 80 },
    {
      title: 'AI回答',
      dataIndex: 'answer',
      key: 'answer',
      ellipsis: true,
      render: (text: string) => text || '-',
    },
  ];

  const passRate = evalData ? Math.round((evalData.passed / evalData.total) * 100) : 0;

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ marginBottom: 12 }}>小云AI 质量评估看板</h2>

      {/* 操作栏 */}
      <div style={{ marginBottom: 16, display: 'flex', gap: 12 }}>
        <Button type="primary" icon={<ExperimentOutlined />} onClick={runGoldenEval} loading={loading}>
          运行回归测试
        </Button>
        <Button icon={<SafetyOutlined />} onClick={loadGuardrails}>
          查看安全规则
        </Button>
        {evalData && (
          <Button icon={<ReloadOutlined />} onClick={runGoldenEval} loading={loading}>
            重新测试
          </Button>
        )}
      </div>

      {/* 统计卡片 */}
      {evalData && (
        <Row gutter={16} style={{ marginBottom: 12 }}>
          <Col span={6}>
            <Card>
              <Statistic title="测试总数" value={evalData.total} suffix="项" />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic title="通过数" value={evalData.passed} suffix="项" valueStyle={{ color: '#3f8600' }} />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic title="通过率" value={passRate} suffix="%" valueStyle={{ color: passRate >= 80 ? '#3f8600' : 'var(--color-error)' }} />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic title="平均分" value={evalData.avgScore} precision={1} suffix="/100" />
            </Card>
          </Col>
        </Row>
      )}

      {/* 测试结果表格 */}
      {evalData && (
        <Card title="回归测试结果" style={{ marginBottom: 16 }}>
          <Table
            dataSource={evalData.results}
            columns={columns}
            rowKey="name"
            pagination={false}
            size="small"
          />
        </Card>
      )}

      {/* 安全规则 */}
      {guardrails && (
        <Card title="安全护栏规则">
          <GuardrailsView guardrails={guardrails} />
        </Card>
      )}

      {/* 空状态 */}
      {!evalData && !guardrails && (
        <Card>
          <p style={{ color: 'var(--color-text-tertiary, #999)' }}>
            点击「运行回归测试」对 AI 回答质量进行评估，或「查看安全规则」了解当前的内容安全策略。
          </p>
        </Card>
      )}
    </div>
  );
};

export default AiQualityDashboard;