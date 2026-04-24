import React from 'react';
import { Tag } from 'antd';
import { ThunderboltOutlined } from '@ant-design/icons';
import XiaoyunCloudAvatar from '@/components/common/XiaoyunCloudAvatar';
import AiExecutionPanel from '../../components/AiExecutionPanel';
import CollapseChevron from './CollapseChevron';

interface BrainActionGridProps {
  brain: any;
  actionCenter: any;
  collapsedPanels: Record<string, boolean>;
  toggleCollapse: (key: string) => void;
  executingTask: string | null;
  executeTaskResult: { taskCode: string; ok: boolean; msg: string } | null;
  handleExecuteTask: (task: any) => void;
  navigate: (path: string) => void;
}

const BrainActionGrid: React.FC<BrainActionGridProps> = ({
  brain, actionCenter, collapsedPanels, toggleCollapse,
  executingTask, executeTaskResult, handleExecuteTask, navigate,
}) => (
  <div className="cockpit-grid-2">

    {/* AI 大脑快照 */}
    <div className="c-card">
      <div className="c-card-title" style={{ cursor: 'pointer' }} onClick={() => toggleCollapse('brain')}>
        <XiaoyunCloudAvatar size={18} active />
        AI 大脑状态
        {brain && (
          <span className="c-card-badge" style={{
            background: brain.summary.healthGrade === 'A' ? 'rgba(82,196,26,0.12)' : 'rgba(212,137,6,0.12)',
            color: brain.summary.healthGrade === 'A' ? '#73d13d' : '#d48806',
            borderColor: brain.summary.healthGrade === 'A' ? '#73d13d55' : '#d4880655',
          }}>
            {brain.summary.healthGrade} 级 · {brain.summary.healthIndex} 分
          </span>
        )}
        <CollapseChevron panelKey="brain" collapsed={!!collapsedPanels['brain']} />
      </div>
      <div style={{ overflow: 'hidden', maxHeight: collapsedPanels['brain'] ? 0 : 600, transition: 'max-height 0.28s ease' }}>
      {brain ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
            <div style={{ textAlign: 'center', padding: '6px 0', background: 'rgba(0,229,255,0.04)', borderRadius: 6, border: '1px solid rgba(0,229,255,0.1)' }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#00e5ff' }}>{brain.summary.todayScanQty.toLocaleString()}</div>
              <div style={{ fontSize: 10, color: '#7aaec8' }}>今日扫码</div>
            </div>
            <div style={{ textAlign: 'center', padding: '6px 0', background: 'rgba(167,139,250,0.04)', borderRadius: 6, border: '1px solid rgba(167,139,250,0.1)' }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#a78bfa' }}>{brain.summary.anomalyCount}</div>
              <div style={{ fontSize: 10, color: '#7aaec8' }}>异常项</div>
            </div>
            <div style={{ textAlign: 'center', padding: '6px 0', background: 'rgba(255,65,54,0.04)', borderRadius: 6, border: '1px solid rgba(255,65,54,0.1)' }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: brain.summary.highRiskOrders > 0 ? '#e8686a' : '#39ff14' }}>{brain.summary.highRiskOrders}</div>
              <div style={{ fontSize: 10, color: '#7aaec8' }}>高风险订单</div>
            </div>
          </div>
          {/* 模型网关状态 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: 11, color: '#b0c4de' }}>
            <span style={{ color: brain.modelGateway.status === 'CONNECTED' ? '#39ff14' : '#e8686a', fontWeight: 600 }}>
              ● {brain.modelGateway.status}
            </span>
            <span>{brain.modelGateway.provider} · {brain.modelGateway.activeModel}</span>
            {brain.modelGateway.fallbackEnabled && <Tag style={{ fontSize: 9, background: 'rgba(0,229,255,0.08)', color: '#00e5ff', borderColor: '#00e5ff33' }}>降级就绪</Tag>}
          </div>
          {/* 信号列表 */}
          {brain.signals?.slice(0, 4).map((sig: any, i: number) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <span style={{ color: sig.level === 'CRITICAL' ? '#e8686a' : sig.level === 'WARNING' ? '#f7a600' : '#39ff14', fontWeight: 600, fontSize: 10, minWidth: 52 }}>
                {sig.level}
              </span>
              <span style={{ color: '#b0c4de', flex: 1 }}>{sig.title}</span>
              {sig.relatedOrderNo && <span style={{ color: '#5a7a9a', fontSize: 10 }}>{sig.relatedOrderNo}</span>}
            </div>
          ))}
          {brain.summary.topRisk && (
            <div style={{ marginTop: 6, fontSize: 10, color: '#f7a600', background: 'rgba(247,166,0,0.06)', padding: '4px 8px', borderRadius: 4 }}>
               首要风险：{brain.summary.topRisk}
            </div>
          )}
        </>
      ) : <div className="c-empty">大脑快照加载中...</div>}
      </div>
    </div>

    {/* 行动中心 */}
    <div className="c-card">
      <div className="c-card-title" style={{ cursor: 'pointer' }} onClick={() => toggleCollapse('actionCenter')}>
        <ThunderboltOutlined style={{ color: '#ffd700', marginRight: 6 }} />
        行动中心
        {actionCenter?.summary && (
          <span className="c-card-badge red-badge">
            待处理 {actionCenter.summary.totalTasks} · 紧急 {actionCenter.summary.highPriorityTasks}
          </span>
        )}
        <CollapseChevron panelKey="actionCenter" collapsed={!!collapsedPanels['actionCenter']} />
      </div>
      <div style={{ overflow: 'hidden', maxHeight: collapsedPanels['actionCenter'] ? 0 : 800, transition: 'max-height 0.28s ease' }}>
      {actionCenter?.tasks?.length ? (
        <>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
            {actionCenter.summary.productionTasks > 0 && <Tag style={{ fontSize: 10, background: 'rgba(0,229,255,0.08)', color: '#00e5ff', borderColor: '#00e5ff33' }}>生产 {actionCenter.summary.productionTasks}</Tag>}
            {actionCenter.summary.financeTasks > 0 && <Tag style={{ fontSize: 10, background: 'rgba(167,139,250,0.08)', color: '#a78bfa', borderColor: '#a78bfa33' }}>财务 {actionCenter.summary.financeTasks}</Tag>}
            {actionCenter.summary.factoryTasks > 0 && <Tag style={{ fontSize: 10, background: 'rgba(247,166,0,0.08)', color: '#f7a600', borderColor: '#f7a60033' }}>工厂 {actionCenter.summary.factoryTasks}</Tag>}
          </div>
          {actionCenter.tasks.slice(0, 6).map((task: any, index: number) => {
            const taskRowKey = [task.taskCode, task.relatedOrderNo, task.routePath, index]
              .filter(Boolean)
              .join('-');
            return (
            <div key={taskRowKey} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: task.routePath ? 'pointer' : 'default' }}
              onClick={() => task.routePath && navigate(task.routePath)}>
              <span style={{
                fontSize: 9, fontWeight: 700, minWidth: 22, textAlign: 'center', padding: '1px 4px', borderRadius: 3,
                background: task.priority === 'CRITICAL' ? 'rgba(255,65,54,0.15)' : task.priority === 'HIGH' ? 'rgba(247,166,0,0.12)' : 'rgba(0,229,255,0.08)',
                color: task.priority === 'CRITICAL' ? '#e8686a' : task.priority === 'HIGH' ? '#f7a600' : '#00e5ff',
              }}>
                L{task.escalationLevel}
              </span>
              <span style={{ color: '#b0c4de', flex: 1 }}>{task.title}</span>
              {task.relatedOrderNo && <span style={{ color: '#5a7a9a', fontSize: 10 }}>{task.relatedOrderNo}</span>}
              {task.dueHint && <span style={{ color: '#f7a600', fontSize: 9 }}>{task.dueHint}</span>}
              {task.autoExecutable && (
                executeTaskResult?.taskCode === task.taskCode ? (
                  <span style={{ fontSize: 9, color: executeTaskResult.ok ? '#73d13d' : '#e8686a', fontWeight: 600 }}>
                    {executeTaskResult.ok ? ' 已执行' : ' 失败'}
                  </span>
                ) : (
                  <button
                    disabled={executingTask === task.taskCode}
                    onClick={e => { e.stopPropagation(); handleExecuteTask(task); }}
                    style={{
                      fontSize: 9, padding: '2px 7px', border: '1px solid rgba(82,196,26,0.4)',
                      borderRadius: 3, background: executingTask === task.taskCode ? 'rgba(82,196,26,0.04)' : 'rgba(82,196,26,0.08)',
                      color: '#73d13d', cursor: executingTask === task.taskCode ? 'wait' : 'pointer',
                    }}
                  >
                    {executingTask === task.taskCode ? '执行中…' : '一键执行'}
                  </button>
                )
              )}
            </div>
          );})}
          {/* 待审批 AI 命令 — 常驻显示，无需触发聊天 */}
          <div style={{ marginTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 8 }}>
            <div style={{ fontSize: 10, color: '#4a6d8a', marginBottom: 6 }}>
              <ThunderboltOutlined style={{ marginRight: 4, color: '#a78bfa' }} />待审批 AI 命令
            </div>
            <AiExecutionPanel />
          </div>
        </>
      ) : (
        <div>
          <div className="c-empty">暂无待办任务</div>
          {/* 即使无任务也显示待审批命令区 */}
          <div style={{ marginTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 8 }}>
            <div style={{ fontSize: 10, color: '#4a6d8a', marginBottom: 6 }}>
              <ThunderboltOutlined style={{ marginRight: 4, color: '#a78bfa' }} />待审批 AI 命令
            </div>
            <AiExecutionPanel />
          </div>
        </div>
      )}
      </div>
    </div>

  </div>
);

export default BrainActionGrid;
