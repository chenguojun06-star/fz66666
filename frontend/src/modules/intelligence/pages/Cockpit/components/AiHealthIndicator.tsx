import React, { useEffect, useState, useCallback } from 'react';
import { Tooltip, Tag, Space, Popover, Button } from 'antd';
import { ApiOutlined, ReloadOutlined } from '@ant-design/icons';

interface ComponentHealth {
  status: 'UP' | 'DOWN' | 'UNKNOWN';
  message?: string;
  details?: Record<string, unknown>;
}

interface AiHealthResponse {
  status: string;
  components: Record<string, ComponentHealth>;
}

const COMPONENT_LABELS: Record<string, string> = {
  deepSeek: 'DeepSeek',
  qdrant: 'Qdrant',
  agnes: 'Agnes视觉',
  litellm: 'LiteLLM',
  langfuse: 'Langfuse',
  memoryArchive: '记忆归档',
};

const STATUS_COLORS: Record<string, string> = {
  UP: 'green',
  DOWN: 'red',
  UNKNOWN: 'default',
};

const STATUS_TEXT: Record<string, string> = {
  UP: '正常',
  DOWN: '异常',
  UNKNOWN: '未配置',
};

/**
 * AI 组件健康状态指示灯。
 * 在驾驶舱右上角展示各 AI 组件的红绿灯，点击查看详情。
 * 不新增页面，只是在现有驾驶舱 header 加一个小指示器。
 */
const AiHealthIndicator: React.FC = () => {
  const [health, setHealth] = useState<AiHealthResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await fetch('/api/intelligence/ai-health', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
      });
      if (resp.ok) {
        const json = await resp.json();
        if (json.code === 0 || json.code === 200) {
          setHealth(json.data);
        }
      }
    } catch {
      // 静默失败，不影响驾驶舱正常使用
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    // 每 60 秒刷新一次
    const timer = setInterval(fetchHealth, 60_000);
    return () => clearInterval(timer);
  }, [fetchHealth]);

  if (!health) {
    return (
      <Tooltip title="AI组件状态加载中...">
        <Button size="small" type="text" loading={loading} icon={<ApiOutlined />} />
      </Tooltip>
    );
  }

  const components = health.components || {};
  const entries = Object.entries(components);
  const downCount = entries.filter(([, v]) => v.status === 'DOWN').length;
  const unknownCount = entries.filter(([, v]) => v.status === 'UNKNOWN').length;

  // 总体状态颜色
  const overallColor = downCount > 0 ? 'red' : unknownCount > 0 ? 'orange' : 'green';
  const overallText = downCount > 0 ? `${downCount}个异常` : unknownCount > 0 ? '部分未配置' : '全部正常';

  const popoverContent = (
    <div style={{ minWidth: 280 }}>
      <div style={{ marginBottom: 8, fontWeight: 600, fontSize: 13 }}>
        AI 组件健康状态
      </div>
      <Space direction="vertical" size={4} style={{ width: '100%' }}>
        {entries.map(([key, val]) => (
          <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12 }}>{COMPONENT_LABELS[key] || key}</span>
            <Tag color={STATUS_COLORS[val.status]} style={{ margin: 0, fontSize: 11 }}>
              {STATUS_TEXT[val.status] || val.status}
            </Tag>
          </div>
        ))}
      </Space>
      {downCount > 0 && (
        <div style={{ marginTop: 8, padding: '4px 8px', background: '#fff2f0', borderRadius: 4, fontSize: 11, color: '#cf1322' }}>
          ⚠️ {downCount} 个组件异常，可能影响 AI 对话/视觉识别/向量搜索
        </div>
      )}
      <div style={{ marginTop: 8, textAlign: 'right' }}>
        <Button size="small" type="link" icon={<ReloadOutlined />} onClick={fetchHealth} loading={loading}>
          刷新
        </Button>
      </div>
    </div>
  );

  return (
    <Popover content={popoverContent} trigger="click" placement="bottomRight">
      <Tooltip title={`AI组件: ${overallText}`}>
        <Button
          size="small"
          type="text"
          icon={<ApiOutlined style={{ color: overallColor === 'red' ? '#cf1322' : overallColor === 'orange' ? '#fa8c16' : '#52c41a' }} />}
        >
          <span style={{ fontSize: 11, color: overallColor === 'red' ? '#cf1322' : overallColor === 'orange' ? '#fa8c16' : '#52c41a' }}>
            AI {overallText}
          </span>
        </Button>
      </Tooltip>
    </Popover>
  );
};

export default AiHealthIndicator;
