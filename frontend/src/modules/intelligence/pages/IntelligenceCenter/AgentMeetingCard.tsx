import React from 'react';
import { Tag } from 'antd';
import XiaoyunCloudAvatar from '@/components/common/XiaoyunCloudAvatar';
import CollapseChevron from './CollapseChevron';

interface AgentMeetingCardProps {
  meetingTopic: string;
  setMeetingTopic: (v: string) => void;
  holdingMeeting: boolean;
  holdMeeting: () => void;
  meetingResult: any;
  meetingHistory: any[];
  collapsedPanels: Record<string, boolean>;
  toggleCollapse: (key: string) => void;
}

const AgentMeetingCard: React.FC<AgentMeetingCardProps> = ({
  meetingTopic, setMeetingTopic, holdingMeeting, holdMeeting,
  meetingResult, meetingHistory, collapsedPanels, toggleCollapse,
}) => (
  <div className="c-card" style={{ marginBottom: 16 }}>
    <div className="c-card-title" style={{ cursor: 'pointer' }} onClick={() => toggleCollapse('meeting')}>
      <XiaoyunCloudAvatar size={18} active />
      Agent 智能例会
      <span className="c-card-badge purple-badge">多Agent辩论</span>
      <CollapseChevron panelKey="meeting" collapsed={!!collapsedPanels['meeting']} />
    </div>
    <div style={{ overflow: 'hidden', maxHeight: collapsedPanels['meeting'] ? 0 : 600, transition: 'max-height 0.28s ease' }}>
      <div style={{ display: 'flex', gap: 8, padding: '10px 14px', alignItems: 'center' }}>
        <input
          value={meetingTopic}
          onChange={e => setMeetingTopic(e.target.value)}
          placeholder="输入议题，如：Q3产能分配方案"
          onKeyDown={e => e.key === 'Enter' && holdMeeting()}
          style={{
            flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 6, padding: '6px 12px', color: '#e0e0e0', fontSize: 13, outline: 'none',
          }}
        />
        <button
          onClick={holdMeeting}
          disabled={holdingMeeting || !meetingTopic.trim()}
          style={{
            background: 'linear-gradient(135deg, #a78bfa, #7c3aed)', color: '#fff',
            border: 'none', borderRadius: 6, padding: '6px 16px', cursor: holdingMeeting ? 'wait' : 'pointer',
            fontSize: 12, fontWeight: 600, opacity: (holdingMeeting || !meetingTopic.trim()) ? 0.5 : 1, whiteSpace: 'nowrap',
          }}
        >
          {holdingMeeting ? '讨论中…' : ' 召开例会'}
        </button>
      </div>
      {/* 最新结果 */}
      {meetingResult && !meetingResult.error && (
        <div style={{ padding: '8px 14px', margin: '0 14px 10px', background: 'rgba(167,139,250,0.06)', borderRadius: 8, border: '1px solid rgba(167,139,250,0.15)' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#a78bfa', marginBottom: 4 }}> 共识结论</div>
          <div style={{ fontSize: 12, color: '#c0c8d0', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{meetingResult.consensus || '无共识'}</div>
          {meetingResult.dissent && (
            <>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#d48806', marginTop: 8, marginBottom: 4 }}> 分歧意见</div>
              <div style={{ fontSize: 12, color: '#a0a8b0', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{meetingResult.dissent}</div>
            </>
          )}
          {meetingResult.confidenceScore != null && (
            <div style={{ marginTop: 6, fontSize: 11, color: '#7aaec8' }}>
              共识置信度：<span style={{ color: meetingResult.confidenceScore >= 70 ? '#73d13d' : '#d48806', fontWeight: 600 }}>{meetingResult.confidenceScore}%</span>
              {meetingResult.durationMs > 0 && <span> · 耗时 {(meetingResult.durationMs / 1000).toFixed(1)}s</span>}
            </div>
          )}
        </div>
      )}
      {meetingResult?.error && <div style={{ padding: '6px 14px', fontSize: 12, color: '#ff7875' }}>例会调用失败，请稍后重试</div>}
      {/* 历史记录 */}
      {meetingHistory.length > 0 && (
        <div style={{ padding: '0 14px 10px' }}>
          <div style={{ fontSize: 11, color: '#7aaec8', marginBottom: 6 }}>近期例会</div>
          {meetingHistory.slice(0, 5).map((m: any, idx: number) => (
            <div key={m.id ?? idx} style={{ padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', gap: 8, alignItems: 'baseline' }}>
              <Tag style={{ fontSize: 10, background: '#a78bfa22', color: '#a78bfa', borderColor: '#a78bfa55' }}>{m.meetingType ?? '辩论'}</Tag>
              <span style={{ fontSize: 12, color: '#d0d8e0', flex: 1 }}>{m.topic}</span>
              <span style={{ fontSize: 10, color: '#5a6a7a' }}>{m.createTime?.slice(5, 16)?.replace('T', ' ')}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  </div>
);

export default AgentMeetingCard;
