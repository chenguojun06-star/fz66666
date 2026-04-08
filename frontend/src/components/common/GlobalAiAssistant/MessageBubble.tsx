import React from 'react';
import {
  ExportOutlined,
  DownloadOutlined,
  LoadingOutlined,
  SoundOutlined,
} from '@ant-design/icons';
import { Tooltip } from 'antd';
import XiaoyunInsightCard from '@/components/common/XiaoyunInsightCard';
import XiaoyunCloudAvatar from '@/components/common/XiaoyunCloudAvatar';
import { paths } from '@/routeConfig';
import styles from './index.module.css';
import MiniChartWidget from './MiniChartWidget';
import { AiTraceCardWidget, BundleSplitCardWidget, PurchaseDocCardWidget, TeamStatusCardWidget } from './AgentCards';
import type { Message } from './types';
import { renderSimpleMarkdown, sanitizeHtml } from './markdownUtils';
import ActionCardWidget from './ActionCardWidget';
import FollowUpActionPanel from './FollowUpActionPanel';
import { RiskIndicatorWidget, SimulationWidget, ClarificationCard, FeedbackWidget } from './HyperAdvisorWidgets';

export interface MessageBubbleProps {
  msg: Message;
  downloadingType: string | null;
  onSend: (text: string) => void;
  onDownloadReport: (type: 'daily' | 'weekly' | 'monthly') => void;
  onShowAgentTrace: (commandId?: string) => void;
  onShowRecentTraces: () => void;
  onOpenTraceCenter: (commandId?: string) => void;
  onFeedback: (msg: Message, score: number) => void;
  onJumpToIntelligence: (text: string) => void;
  onSafeNavigate: (path: string) => void;
  onSpeak: (text: string) => void;
  onPurchaseDocAction: (msgId: string, mode: string, card: any) => void;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({
  msg, downloadingType,
  onSend, onDownloadReport, onShowAgentTrace, onShowRecentTraces,
  onOpenTraceCenter, onFeedback, onJumpToIntelligence, onSafeNavigate,
  onSpeak, onPurchaseDocAction,
}) => (
  <div className={`${styles.messageRow} ${msg.role === 'ai' ? styles.rowAi : styles.rowUser}`}>
    {msg.role === 'ai' && (
      <div className={styles.messageAvatar}><XiaoyunCloudAvatar size={24} active /></div>
    )}

    <div className={`${styles.messageBubble} ${msg.role === 'ai' ? styles.bubbleAi : styles.bubbleUser}`}>
      {msg.role === 'ai' ? (
        <div
          className={styles.mdContent}
          dangerouslySetInnerHTML={{
            __html: sanitizeHtml(renderSimpleMarkdown(
              msg.text.includes('【推荐追问】：') ? msg.text.split('【推荐追问】：')[0] : msg.text
            ))
          }}
        />
      ) : (
        <div style={{ whiteSpace: 'pre-wrap' }}>{msg.text}</div>
      )}

      {msg.text.includes('【推荐追问】：') && (
        <div className={styles.recommendWrapper}>
          <div className={styles.recommendTitle}>你可以接着问：</div>
          <div className={styles.recommendPills}>
            {msg.text.split('【推荐追问】：')[1].split('|').map((q, idx) => {
              const question = q.trim();
              if (!question) return null;
              return <div key={idx} className={styles.recommendPill} onClick={() => onSend(question)}>{question}</div>;
            })}
          </div>
        </div>
      )}

      {msg.role === 'ai' && msg.intent && (
        <div className={styles.intentWidgetHint} onClick={() => onJumpToIntelligence(msg.text)}>
          <ExportOutlined /> 在智能驾驶舱展开查看完整图表
        </div>
      )}

      {msg.role === 'ai' && msg.reportType && (
        <div style={{ marginTop: 12 }}>
          <button
            className={styles.reportDownloadBtn}
            disabled={!!downloadingType}
            onClick={() => onDownloadReport(msg.reportType!)}
            style={{ width: '100%', marginBottom: 0 }}
          >
            {downloadingType === msg.reportType ? <LoadingOutlined /> : <DownloadOutlined />}
            <span>下载{msg.reportType === 'daily' ? '运营日报' : msg.reportType === 'weekly' ? '运营周报' : '运营月报'}</span>
          </button>
        </div>
      )}

      {msg.role === 'ai' && !!msg.charts?.length && (
        <div className={styles.chartsWrapper}>
          {msg.charts.map((chart, i) => <MiniChartWidget key={i} chart={chart} />)}
        </div>
      )}

      {msg.role === 'ai' && !!msg.cards?.length && (
        <div className={styles.teamStatusWrapper}>
          {msg.cards.map((card, i) => (
            <XiaoyunInsightCard
              key={`${card.title ?? 'insight'}-${i}`}
              compact
              card={card}
              onNavigate={(path) => onSafeNavigate(path)}
            />
          ))}
        </div>
      )}

      {msg.role === 'ai' && !!msg.actionCards?.length && (
        <div className={styles.actionCardsWrapper}>
          {msg.actionCards.map((card, i) => (
            <ActionCardWidget
              key={i}
              card={card}
              onUrgeOrderSaved={() => void onSend(`订单 ${card.orderNo ?? card.orderId} 出货信息已更新`)}
              onAction={(type, path, orderId) => {
                if (type === 'navigate' && path) onSafeNavigate(path);
                else if (type === 'mark_urgent' && orderId) void onSend(`把订单 ${orderId} 标记为紧急`);
                else void onSend(`执行操作：${card.title}`);
              }}
            />
          ))}
        </div>
      )}

      {msg.role === 'ai' && !!msg.teamStatusCards?.length && (
        <div className={styles.teamStatusWrapper}>
          {msg.teamStatusCards.map((card, i) => (
            <TeamStatusCardWidget
              key={`${card.orderNo ?? 'team'}-${i}`}
              card={card}
              onNavigate={(path) => onSafeNavigate(path)}
            />
          ))}
        </div>
      )}

      {msg.role === 'ai' && !!msg.bundleSplitCards?.length && (
        <div className={styles.teamStatusWrapper}>
          {msg.bundleSplitCards.map((card, i) => (
            <BundleSplitCardWidget
              key={`${card.sourceBundleId ?? card.rootBundleId ?? 'split'}-${i}`}
              card={card}
              onNavigateToCutting={(splitCard) => {
                const orderNo = splitCard.orderNo;
                const bundleIds = (splitCard.bundles || [])
                  .filter((item) => item.splitStatus === 'split_child' && item.bundleId)
                  .map((item) => item.bundleId);
                const query = new URLSearchParams();
                if (bundleIds.length) { query.set('bundleIds', bundleIds.join(',')); query.set('autoPrint', '1'); }
                const next = orderNo
                  ? `/production/cutting/task/${encodeURIComponent(orderNo)}${query.toString() ? `?${query.toString()}` : ''}`
                  : paths.cutting;
                onSafeNavigate(next);
              }}
            />
          ))}
        </div>
      )}

      {msg.role === 'ai' && msg.purchaseDocCard && (
        <div className={styles.teamStatusWrapper}>
          <PurchaseDocCardWidget
            card={msg.purchaseDocCard}
            onAutoAction={(mode, card) => void onPurchaseDocAction(msg.id, mode, card)}
          />
        </div>
      )}

      {msg.role === 'ai' && msg.agentCommandId && (
        <div className={styles.quickActionsRow}>
          <button className={styles.actionBtn} onClick={() => void onShowAgentTrace(msg.agentCommandId)}>查看执行轨迹</button>
          <button className={styles.actionBtn} onClick={() => onOpenTraceCenter(msg.agentCommandId)}>打开独立页</button>
          <button className={styles.actionBtn} onClick={() => void onShowRecentTraces()}>最近执行记录</button>
        </div>
      )}

      {msg.role === 'ai' && msg.agentTraceCard && (
        <div className={styles.teamStatusWrapper}><AiTraceCardWidget card={msg.agentTraceCard} /></div>
      )}

      {msg.role === 'ai' && !!msg.quickActions?.length && (
        <div className={styles.quickActionsRow}>
          {msg.quickActions.map((action, i) => (
            <button
              key={i}
              className={`${styles.actionBtn} ${action.style === 'danger' ? styles.actionBtnDanger : styles.actionBtnPrimary}`}
              onClick={() => onSend(action.label)}
            >{action.label}</button>
          ))}
        </div>
      )}

      {msg.role === 'ai' && msg.traceableAdvice && (
        <div style={{ marginTop: 12, padding: 12, background: 'rgba(255, 255, 255, 0.05)', borderRadius: 8, border: '1px solid rgba(0, 229, 255, 0.2)' }}>
          <div style={{ fontWeight: 'bold', color: '#00e5ff', marginBottom: 8, fontSize: 14 }}>{msg.traceableAdvice.title}</div>
          <div style={{ marginBottom: 12 }}>
            <details style={{ cursor: 'pointer', fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
              <summary style={{ outline: 'none', userSelect: 'none' }}>🔍 查看评估依据</summary>
              <ul style={{ marginTop: 8, paddingLeft: 20, color: 'rgba(255,255,255,0.8)' }}>
                {msg.traceableAdvice.reasoningChain?.map((reason, idx) => (
                  <li key={idx} style={{ marginBottom: 4 }}>{reason}</li>
                ))}
              </ul>
            </details>
          </div>
          {msg.traceableAdvice.proposedActions && msg.traceableAdvice.proposedActions.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {msg.traceableAdvice.proposedActions.map((action, idx) => (
                <Tooltip key={idx} title={action.riskWarning || '点击执行'}>
                  <button
                    className={styles.actionBtn}
                    style={{
                      background: action.actionCommand === 'IGNORE' ? 'rgba(255,255,255,0.1)' : 'rgba(0, 229, 255, 0.1)',
                      borderColor: action.actionCommand === 'IGNORE' ? 'transparent' : 'rgba(0, 229, 255, 0.3)',
                      color: action.actionCommand === 'IGNORE' ? 'rgba(255,255,255,0.6)' : '#00e5ff'
                    }}
                    onClick={() => onSend(action.actionCommand === 'IGNORE' ? '我忽略了这条建议。' : `执行操作：${action.label}`)}
                  >{action.label}</button>
                </Tooltip>
              ))}
            </div>
          )}
        </div>
      )}

      {msg.role === 'ai' && !!msg.followUpActions?.length && (
        <FollowUpActionPanel
          actions={msg.followUpActions}
          onExecute={(cmd, params) => onSend(`执行 ${cmd} ${JSON.stringify(params)}`)}
          onAsk={(question) => onSend(question)}
        />
      )}

      {msg.role === 'ai' && msg.needsClarification && <ClarificationCard />}
      {msg.role === 'ai' && !!msg.riskIndicators?.length && <RiskIndicatorWidget items={msg.riskIndicators} />}
      {msg.role === 'ai' && msg.simulation && <SimulationWidget data={msg.simulation} />}
      {msg.role === 'ai' && msg.traceId && <FeedbackWidget msg={msg} onFeedback={onFeedback} />}
    </div>

    {msg.role === 'ai' && (
      <button className={styles.speechBtn} onClick={() => onSpeak(msg.text)} title="朗读回答">
        <SoundOutlined />
      </button>
    )}
  </div>
);

export default MessageBubble;
