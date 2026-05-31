import React, { useCallback, useState } from 'react';
import { Popover, Tag, Tooltip } from 'antd';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  PlayCircleOutlined,
  RightOutlined,
} from '@ant-design/icons';
import NodeDetailModal from '@/components/common/NodeDetailModal';
import type { NodeStats, ProcessPriceItem } from '@/components/common/NodeDetailModal/types';
import type { ProcessStageProgress, ProcessNodeInfo } from './useSampleProcessProgress';

interface SampleProcessListProps {
  stages: ProcessStageProgress[];
  loading: boolean;
  orderId: string | null;
  orderNo: string | null;
  onCompleteProcess?: (processCode: string) => Promise<void>;
}

const STAGE_COLORS: Record<string, string> = {
  procurement: '#1890ff',
  cutting: '#722ed1',
  secondary: '#eb2f96',
  sewing: '#fa8c16',
  tail: '#13c2c2',
  warehousing: '#52c41a',
};

const STAGE_NODE_TYPE_MAP: Record<string, string> = {
  procurement: 'procurement',
  cutting: 'cutting',
  secondary: 'secondaryProcess',
  sewing: 'sewing',
  tail: 'ironing',
  warehousing: 'warehousing',
};

export default function SampleProcessList({ stages, loading, orderId, orderNo, onCompleteProcess }: SampleProcessListProps) {
  const [modalVisible, setModalVisible] = useState(false);
  const [activeNodeName, setActiveNodeName] = useState('');
  const [activeNodeType, setActiveNodeType] = useState('sewing');
  const [activeStats, setActiveStats] = useState<NodeStats | undefined>();
  const [activeProcessList, setActiveProcessList] = useState<ProcessPriceItem[]>([]);

  const openNodeDetail = useCallback((stage: ProcessStageProgress) => {
    setActiveNodeName(stage.label);
    setActiveNodeType(STAGE_NODE_TYPE_MAP[stage.key] || 'sewing');
    setActiveStats({
      done: stage.completedCount,
      total: stage.totalCount,
      percent: stage.percent,
      remaining: stage.totalCount - stage.completedCount,
    });
    setActiveProcessList(
      stage.subProcesses.map((sub: ProcessNodeInfo) => ({
        name: sub.name,
        processCode: sub.processCode || sub.id,
        unitPrice: sub.unitPrice,
      }))
    );
    setModalVisible(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setModalVisible(false);
  }, []);

  return (
    <>
      <div style={{
        marginTop: 8,
        display: 'flex',
        flexWrap: 'wrap',
        gap: 4,
        alignItems: 'center',
      }}>
        {stages.map((stage) => (
          <StageChip
            key={stage.key}
            stage={stage}
            loading={loading}
            onClick={() => openNodeDetail(stage)}
          />
        ))}
      </div>

      <NodeDetailModal
        visible={modalVisible}
        onClose={handleCloseModal}
        orderId={orderId || undefined}
        orderNo={orderNo || undefined}
        nodeType={activeNodeType}
        nodeName={activeNodeName}
        stats={activeStats}
        processList={activeProcessList}
        isPatternProduction={false}
        mode="drawer"
        onSaved={onCompleteProcess ? () => { /* refresh handled by parent */ } : undefined}
      />
    </>
  );
}

function StageChip({
  stage,
  loading,
  onClick,
}: {
  stage: ProcessStageProgress;
  loading: boolean;
  onClick: () => void;
}) {
  const color = STAGE_COLORS[stage.key] || '#8c8c8c';
  const isDone = stage.percent >= 100;
  const isActive = stage.percent > 0 && stage.percent < 100;
  const hasSubProcesses = stage.subProcesses.length > 0;

  const icon = isDone
    ? <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 12 }} />
    : isActive
      ? <PlayCircleOutlined style={{ color, fontSize: 12 }} />
      : <ClockCircleOutlined style={{ color: '#bfbfbf', fontSize: 12 }} />;

  const chip = (
    <div
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 8px',
        borderRadius: 12,
        fontSize: 12,
        lineHeight: '18px',
        background: isDone ? '#f6ffed' : isActive ? `${color}10` : '#fafafa',
        border: `1px solid ${isDone ? '#b7eb8f' : isActive ? `${color}40` : '#f0f0f0'}`,
        cursor: 'pointer',
        transition: 'all 0.2s',
      }}
    >
      {icon}
      <span style={{ color: isDone ? '#389e0d' : isActive ? color : '#8c8c8c', fontWeight: isActive ? 500 : 400 }}>
        {stage.label}
      </span>
      {stage.totalCount > 1 && (
        <span style={{ color: '#8c8c8c', fontSize: 11 }}>
          {stage.completedCount}/{stage.totalCount}
        </span>
      )}
      {isActive && (
        <span style={{ color, fontSize: 11, fontWeight: 600 }}>{stage.percent}%</span>
      )}
      <RightOutlined style={{ fontSize: 10, color: '#bfbfbf' }} />
    </div>
  );

  if (!hasSubProcesses) {
    return chip;
  }

  return (
    <Popover
      trigger="hover"
      placement="bottom"
      content={
        <div style={{ minWidth: 180 }}>
          <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 12 }}>
            {stage.label} · {stage.completedCount}/{stage.totalCount}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {stage.subProcesses.map((sub) => (
              <div key={sub.processCode || sub.id} style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '2px 0',
                fontSize: 12,
                opacity: sub.completed ? 0.45 : 1,
                textDecoration: sub.completed ? 'line-through' : 'none',
              }}>
                <span>
                  {sub.completed && <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 10, marginRight: 4 }} />}
                  {sub.name}
                </span>
                <Tag color={sub.completed ? 'default' : 'blue'} style={{ margin: 0, fontSize: 10 }}>
                  {sub.unitPrice ? `¥${sub.unitPrice}` : '-'}
                </Tag>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 6, fontSize: 11, color: '#8c8c8c' }}>点击查看详情</div>
        </div>
      }
    >
      {chip}
    </Popover>
  );
}
