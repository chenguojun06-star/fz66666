import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertOutlined,
  CheckCircleOutlined,
  CloseOutlined,
  ExclamationCircleOutlined,
  RobotOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { Badge } from 'antd';
import { RISK_TYPE_LABELS } from '@/modules/production/pages/Production/List/hooks/useAiPatrol';
import XiaoyunCloudAvatar from '../common/XiaoyunCloudAvatar';
import XiaoyunInsightCard from '../common/XiaoyunInsightCard';
import BackgroundTaskPanel from '../common/BackgroundTaskPanel';
import { useAlertData } from './SmartAlertBell/hooks/useAlertData';
import { choose, getEventNav } from './SmartAlertBell/helpers';
import UrgeReplyInline from './SmartAlertBell/components/UrgeReplyInline';
import OneClickActionInline from './SmartAlertBell/components/OneClickActionInline';

const SmartAlertBell: React.FC = () => {
  const navigate = useNavigate();
  const {
    open,
    setOpen,
    brief,
    loading,
    visibleEvents,
    visibleNotices,
    dismissedIds,
    alertCount,
    unreadNoticeCount,
    patrolSummary,
    panelRef,
    btnRef,
    dotColor,
    patrolSeverityColor,
    goTo,
    handleToggle,
    dismissEvent,
    dismissNotice,
    markAllNoticesRead,
    handleMarkRead,
    dismissNoticeLocally,
  } = useAlertData();

  return (
    <div className="smart-alert-wrap">
      {/* ── 按钮 ── */}
      <button
        ref={btnRef}
        onClick={handleToggle}
        className={`smart-alert-btn${open ? ' open' : ''}`}
        title="今日跟踪预警"
      >
        <span className="smart-alert-btn-icon">
          <ThunderboltOutlined style={{ fontSize: 15 }} />
          {alertCount > 0 && (
            <span className="smart-alert-dot" style={{ background: dotColor }} />
          )}
        </span>
        <span className="smart-alert-btn-label">
          <span className="smart-alert-btn-main">今日预警</span>
        </span>
        {alertCount > 0 && (
          <Badge
            count={alertCount}

            style={{ marginLeft: 4, background: dotColor, boxShadow: 'none' }}
          />
        )}
      </button>

      {/* ── 下滑面板 ── */}
      <div
        ref={panelRef}
        className={`smart-alert-panel${open ? ' visible' : ''}`}
      >
        {/* 面板头 */}
        <div className="sap-header">
          <div className="sap-title">
            <ThunderboltOutlined style={{ color: '#6d28d9' }} />
            <span>今日跟踪预警</span>
            {brief?.date && <span className="sap-date">{brief.date}</span>}
          </div>
          <button className="sap-close" onClick={() => setOpen(false)}>
            <CloseOutlined style={{ fontSize: 12 }} />
          </button>
        </div>

        {loading && (
          <div className="sap-loading">
            <XiaoyunCloudAvatar size={34} active loading />
            <span>小云正在整理提醒，请稍等一下…</span>
          </div>
        )}

        {!loading && (
          <div className="sap-body-scroll">

            {/* ── AI 巡检简报 ── */}
            {patrolSummary && (patrolSummary.autoExecutedToday > 0 || patrolSummary.recentActions.length > 0) && (
              <div className="sap-section">
                <div className="sap-section-title">
                  <RobotOutlined style={{ color: 'var(--color-accent-purple)' }} /> AI巡检简报
                  {patrolSummary.autoExecutedToday > 0 && (
                    <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--color-accent-purple)', background: '#f9f0ff', borderRadius: 10, padding: '1px 8px' }}>
                      今日自动执行 {patrolSummary.autoExecutedToday} 次
                    </span>
                  )}
                  {patrolSummary.highRiskPending > 0 && (
                    <Badge count={patrolSummary.highRiskPending} size="small"
                      style={{ marginLeft: 8, background: 'var(--color-error)', boxShadow: 'none' }} />
                  )}
                </div>
                {patrolSummary.recentActions.slice(0, 5).map((action, idx) => (
                  <div key={idx} className="sap-event-row" style={{ cursor: 'default' }}>
                    <span className="sap-event-dot"
                      style={{ background: patrolSeverityColor(action.issueSeverity) }} />
                    <span className="sap-event-title">
                      {RISK_TYPE_LABELS[action.issueType] || action.issueType}: {action.detectedIssue}
                    </span>
                    <span style={{
                      fontSize: 11,
                      color: action.status === 'PENDING' ? 'var(--color-warning)' : 'var(--color-accent-purple)',
                      marginLeft: 'auto',
                      flexShrink: 0,
                    }}>
                      {action.status === 'PENDING' ? '待处理' : '已执行'}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* ── 首要关注订单 ── */}
            {brief?.topPriorityOrder && !dismissedIds.has('topPriority') && (
              <div className="sap-section">
                <div className="sap-section-title">
                  <AlertOutlined style={{ color: '#6d28d9' }} /> 首要关注
                  <span style={{ marginLeft: 6, fontSize: 14, color: 'var(--color-text-tertiary)' }}>点 × 今日不再提醒</span>
                </div>
                <div
                className="sap-priority-card"
                onClick={() => goTo(`/production?orderNo=${brief.topPriorityOrder?.orderNo ?? ''}`)}
                style={{ cursor: 'pointer', position: 'relative' }}
                title="点击查看该订单"
              >
                  <button
                    className="sap-event-dismiss-btn"
                    style={{ position: 'absolute', top: 6, right: 6 }}
                    onClick={(e) => dismissEvent('topPriority', e)}
                    title="今日不再提醒（明天会重新检测）"
                  >
                    <CloseOutlined style={{ fontSize: 9 }} />
                  </button>
                  <div className="sap-priority-row">
                    <span className="sap-priority-no">{brief.topPriorityOrder.orderNo}</span>
                    <span className="sap-priority-factory">{brief.topPriorityOrder.factoryName}</span>
                  </div>
                  <div className="sap-priority-bar-wrap">
                    <div
                      className="sap-priority-bar"
                      style={{ width: `${brief.topPriorityOrder.progress}%` }}
                    />
                    <span className="sap-priority-pct">{brief.topPriorityOrder.progress}%</span>
                    <span
                      className="sap-priority-days"
                      style={{ color: brief.topPriorityOrder.daysLeft <= 3 ? '#ef4444' : '#888' }}
                    >
                      剩 {brief.topPriorityOrder.daysLeft} 天
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* ── 紧急事件列表 ── */}
            {visibleEvents.length > 0 && (
              <div className="sap-section">
                <div className="sap-section-title">
                  <ExclamationCircleOutlined style={{ color: '#ef4444' }} /> 待处理事项
                  <span style={{ marginLeft: 6, fontSize: 14, color: 'var(--color-text-tertiary)' }}>点 × 今日不再提醒，明日自动重检</span>
                </div>
                {visibleEvents.slice(0, 6).map(ev => (
                  <div
                    key={ev.id}
                    className="sap-event-row"
                    onClick={() => goTo(getEventNav(ev))}
                    style={{ cursor: 'pointer' }}
                    title="点击前往处理"
                  >
                    <span className="sap-event-dot" />
                    <span className="sap-event-title">{ev.title}</span>
                    <span className="sap-event-time">{ev.time}</span>
                    <button
                      className="sap-event-dismiss-btn"
                      onClick={(e) => dismissEvent(ev.id, e)}
                      title="今日不再提醒（明天会重新检测）"
                    >
                      <CloseOutlined style={{ fontSize: 9 }} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* ── 提醒建议 ── */}
            {brief?.suggestions && brief.suggestions.length > 0 && (
              <div className="sap-section">
                <div className="sap-section-title">
                  <CheckCircleOutlined style={{ color: '#0284c7' }} /> 提醒建议
                  <span style={{ marginLeft: 6, fontSize: 14, color: 'var(--color-text-tertiary)' }}>点 × 今日不再提醒</span>
                </div>
                {brief.decisionCards && brief.decisionCards.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {brief.decisionCards.slice(0, 3).map((card, i) => dismissedIds.has(`decisionCard_${i}`) ? null : (
                      <div key={`${card.title}-${i}`} className="sap-dismissible" style={{ position: 'relative' }}>
                        <button
                          className="sap-event-dismiss-btn"
                          style={{ position: 'absolute', top: 6, right: 6, zIndex: 2 }}
                          onClick={(e) => dismissEvent(`decisionCard_${i}`, e)}
                          title="今日不再提醒（明天会重新检测）"
                        >
                          <CloseOutlined style={{ fontSize: 9 }} />
                        </button>
                        <XiaoyunInsightCard
                          compact
                          onNavigate={goTo}
                          card={{
                            ...card,
                            source: card.source || '实时数据推演',
                            confidence: card.confidence || ((brief.overdueOrderCount || 0) + (brief.highRiskOrderCount || 0) > 0 ? '建议优先处理' : '可执行建议'),
                            summary: card.summary || choose((brief.overdueOrderCount || 0) * 11 + (brief.highRiskOrderCount || 0) * 7 + i, [
                              '有风险点，先处理影响最大的。',
                              '先做优先级收口，再展开细项。',
                              '先压关键风险，后续更顺。',
                            ]),
                            labels: {
                              summary: '现状',
                              painPoint: '关注点',
                              execute: '下一步',
                              evidence: '数据',
                              note: '补充',
                              ...card.labels,
                            },
                          }}
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  brief.suggestions.slice(0, 3).map((s, i) => dismissedIds.has(`suggestion_${i}`) ? null : (
                    <div key={i} className="sap-suggestion" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span>· {s}</span>
                      <button
                        className="sap-event-dismiss-btn"
                        style={{ opacity: 1 }}
                        onClick={(e) => dismissEvent(`suggestion_${i}`, e)}
                        title="今日不再提醒（明天会重新检测）"
                      >
                        <CloseOutlined style={{ fontSize: 9 }} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* ── 后台任务 ── */}
            <div className="sap-section">
              <BackgroundTaskPanel
                maxItems={5}
                pollInterval={10000}
                onViewAll={() => navigate('/intelligence/tasks')}
              />
            </div>

            {/* ── 我的通知 ── */}
            {visibleNotices.length > 0 && (
              <div className="sap-section">
                <div className="sap-section-title">
                  <span style={{ color: '#d46b08' }}></span> 我的通知
                  {unreadNoticeCount > 0 && (
                    <span style={{ marginLeft: 4, fontSize: 11, background: '#ffa940', color: 'var(--color-bg-base)', borderRadius: 10, padding: '1px 8px' }}>
                      {unreadNoticeCount} 未读
                    </span>
                  )}
                  {unreadNoticeCount > 1 && (
                    <button
                      className="sap-mark-all-read-btn"
                      onClick={(e) => { e.stopPropagation(); markAllNoticesRead(); }}
                      title="一键全部已读"
                    >
                      全部已读
                    </button>
                  )}
                </div>
                {visibleNotices.slice(0, 8).map(n => (
                  <div key={n.id} className="sap-notice-row"
                    style={{
                      background: n.isRead ? 'var(--color-bg-container)' : 'var(--status-warning-bg)',
                      borderLeft: `3px solid ${n.isRead ? '#ddd' : n.actionType === 'urge_order' ? 'var(--color-error)' : '#ffa940'}`,
                    }}
                    onClick={() => {
                      if (!n.isRead) {
                        handleMarkRead(n.id);
                      }
                    }}
                  >
                    {n.styleImage && (
                      <img
                        src={n.styleImage}
                        alt=""
                        style={{
                          width: 48,
                          height: 48,
                          borderRadius: 6,
                          objectFit: 'cover',
                          flexShrink: 0,
                          marginRight: 10,
                          border: '1px solid var(--color-border-light)',
                        }}
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: n.isRead ? 400 : 600, color: 'var(--color-text-primary)', lineHeight: 1.4 }}>
                        {n.title}
                      </div>
                      <div style={{ fontSize: 14, color: '#888', marginTop: 1 }}>
                        {n.fromName} · {n.createdAt?.slice(5, 16)}
                      </div>
                      {n.actionType === 'urge_order' && n.urgeRecordId && !n.isRead && (
                        <UrgeReplyInline
                          urgeRecordId={n.urgeRecordId}
                          orderNo={n.orderNo}
                          onReplied={() => handleMarkRead(n.id, () => dismissNoticeLocally(n.id))}
                        />
                      )}
                      {n.actionPayload && !n.isRead && !n.urgeRecordId && (
                        <OneClickActionInline
                          notice={n}
                          onDone={() => handleMarkRead(n.id, () => dismissNoticeLocally(n.id))}
                        />
                      )}
                    </div>
                    {!n.isRead && (
                      <button
                        className="sap-notice-read-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMarkRead(n.id, () => dismissNoticeLocally(n.id));
                        }}
                      >
                        已读
                      </button>
                    )}
                    <button
                      className="sap-notice-dismiss-btn"
                      onClick={(e) => dismissNotice(n.id, e)}
                      title="关闭该通知"
                    >
                      <CloseOutlined style={{ fontSize: 9 }} />
                    </button>
                  </div>
                ))}
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  );
};

export default SmartAlertBell;
