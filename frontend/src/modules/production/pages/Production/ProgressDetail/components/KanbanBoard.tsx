// KanbanBoard — 工序看板视图子组件
// 抽离自原 ProcessKanbanDrawer.tsx 的 renderKanban，保持业务逻辑不变

import React from 'react';
import { Card, Empty, Progress, Space, Tag } from 'antd';
import { CheckCircleOutlined } from '@ant-design/icons';
import { STAGE_COLORS } from './ProcessKanbanDrawer.constants';
import type { NodeStatsItem } from './ProcessKanbanDrawer.types';

interface KanbanBoardProps {
  nodeStats: NodeStatsItem[];
}

const KanbanBoard: React.FC<KanbanBoardProps> = ({ nodeStats }) => {
  if (nodeStats.length === 0) return <Empty description="暂无工序数据" />;
  return (
    <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 12 }}>
      {nodeStats.map((stage) => (
        <Card
          key={stage.stageName}
          title={
            <Space>
              <span style={{ color: STAGE_COLORS[stage.stageName] || '#666', fontWeight: 600 }}>{stage.stageName}</span>
              <Tag color={stage.completionRate >= 100 ? 'success' : stage.completionRate >= 50 ? 'warning' : 'error'}>
                {stage.completionRate}%
              </Tag>
            </Space>
          }
          style={{ minWidth: 220, flex: '0 0 auto' }}
        >
          <Progress percent={stage.completionRate} strokeColor={STAGE_COLORS[stage.stageName] || 'var(--color-info)'} style={{ marginBottom: 8 }} />
          <div style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>
            <div>总记录: {stage.totalRecords}</div>
            <div style={{ color: 'var(--color-success)' }}>已完成: {stage.scannedRecords}</div>
            <div style={{ color: 'var(--color-danger)' }}>待完成: {stage.pendingRecords}</div>
          </div>
          {stage.processBreakdown && Object.keys(stage.processBreakdown).length > 0 && (
            <div style={{ marginTop: 8, borderTop: '1px solid var(--color-border-light)', paddingTop: 8 }}>
              <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 6 }}>工序明细</div>
              {Object.entries(stage.processBreakdown).map(([name, detail]) => {
                const { total, completed, pending } = detail;
                const isAllDone = completed === total;
                const hasPending = pending > 0;
                const tagColor = isAllDone ? 'var(--color-success)' : hasPending ? 'var(--color-danger)' : 'var(--color-warning)';
                const tagBg = isAllDone ? 'rgba(82, 196, 26, 0.1)' : hasPending ? 'rgba(255, 77, 79, 0.1)' : 'rgba(250, 173, 20, 0.1)';
                return (
                  <div key={name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <Tag style={{ backgroundColor: tagBg, borderColor: tagColor, color: tagColor, marginBottom: 0 }}>
                      {name}
                    </Tag>
                    <Space size={4}>
                      {pending > 0 && (
                        <span style={{ color: 'var(--color-danger)', fontSize: 12 }}>
                          <CheckCircleOutlined /> {pending}
                        </span>
                      )}
                      {completed > 0 && (
                        <span style={{ color: 'var(--color-success)', fontSize: 12 }}>
                          {completed}
                        </span>
                      )}
                      <span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}>/{total}</span>
                    </Space>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      ))}
    </div>
  );
};

export default KanbanBoard;
