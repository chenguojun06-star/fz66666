import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  SendOutlined,
  CloseOutlined,
  SoundOutlined,
  LoadingOutlined,
  AudioMutedOutlined,
  ClearOutlined,
  PaperClipOutlined,
  SmileOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import { intelligenceApi } from '@/services/intelligence/intelligenceApi';
import { App } from 'antd';
import { useUser, useAuthState } from '@/utils/AuthContext';
import { useWebSocket, type WsMessage } from '@/hooks/useWebSocket';
import XiaoyunCloudAvatar, { CuteCloudTrigger } from '@/components/common/XiaoyunCloudAvatar';
import styles from './index.module.css';
import cloudStyles from './CloudTrigger.module.css';
import emojiStyles from './EmojiPicker.module.css';
import msgStyles from './MessageBubble.module.css';
import { loadDismissedPending, saveDismissedPending } from './sessionUtils';
import { INITIAL_MSG, EMOJI_GROUPS, getPageSuggestions } from './constants';
import { useAiChat } from './useAiChat';
import { stopAllSpeech } from './speechUtils';
import { useDragSnap } from './useDragSnap';
import { usePendingTasks } from './usePendingTasks';
import { useMoodGreeting } from './useMoodGreeting';
import { useEmojiPicker } from './useEmojiPicker';
import MessageBubble from './MessageBubble';
import SmartBubble from './SmartBubble';
import TaskAggregationPanel from './TaskAggregationPanel';
import PendingItemsSection from './PendingItemsSection';
import TaskListView from './TaskListView';
import TaskFormModal from './TaskFormModal';
import QuickLinksPanel from './QuickLinksPanel';
import { usePanelResize } from './usePanelResize';
import { useTaskManager } from './useTaskManager';
import type { Message, PanelView, TaskItem } from './types';

function normalizeTraceableAdvice(payload: unknown): Message['traceableAdvice'] | null {
  if (!payload || typeof payload !== 'object') return null;
  const raw = payload as Record<string, unknown>;
  const title = String(raw.title || '').trim();
  if (!title) return null;
  return {
    traceId: String(raw.traceId || ''),
    title,
    summary: String(raw.summary || '系统发来了一条智能建议。'),
    reasoningChain: Array.isArray(raw.reasoningChain)
      ? raw.reasoningChain.map(item => String(item || '')).filter(Boolean)
      : [],
    proposedActions: Array.isArray(raw.proposedActions)
      ? raw.proposedActions
        .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
        .map((item) => ({
          label: String(item.label || '执行'),
          actionCommand: String(item.actionCommand || ''),
          actionParams: item.actionParams && typeof item.actionParams === 'object'
            ? item.actionParams as Record<string, unknown>
            : undefined,
          riskWarning: item.riskWarning != null ? String(item.riskWarning) : undefined,
        }))
      : [],
    confidenceScore: typeof raw.confidenceScore === 'number' ? raw.confidenceScore : undefined,
  };
}

const GlobalAiAssistant: React.FC = () => {
  const { message } = App.useApp();
  const { user } = useUser();
  const { isAuthenticated } = useAuthState();
  const navigate = useNavigate();
  const location = useLocation();

  // ── 拖拽 + 边缘吸附 ──
  const {
    triggerPos, isDocked, isActiveDrag, setIsActiveDrag,
    moveTo, snapToEdge, snapToVisible,
    startIdleSnap, cancelIdleSnap,
  } = useDragSnap();

  // ── parent-local state ──
  const [isOpen, setIsOpen] = useState(false);
  const [isTaskPanelOpen, setIsTaskPanelOpen] = useState(false);

  const [panelView, setPanelView] = useState<PanelView>('chat');
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskItem | null>(null);
  const [taskSaving, setTaskSaving] = useState(false);
  const [recentLinks] = useState<{ label: string; path: string }[]>(() => {
    try { return JSON.parse(localStorage.getItem('xiaoyun.recentLinks') || '[]'); } catch { return []; }
  });
  const { tasks: pendingItems, refresh: refreshPendingTasks } = usePendingTasks();
  const [dismissedPending, setDismissedPending] = useState<Set<string>>(loadDismissedPending);

  const { size, cycleSize, dimensions, showSidebar, showAuxPanel } = usePanelResize();
  const { tasks: myTasks, loading: tasksLoading, stats: taskStats, fetchTasks, createTask, updateTask, deleteTask, claimTask, completeTask, startPolling, stopPolling } = useTaskManager();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── 拖拽辅助 refs ──
  const hasDragRef = useRef(false);
  const dragStartRef = useRef({ mx: 0, my: 0, tx: 0, ty: 0 });
  const isOpenRef = useRef(isOpen);
  useEffect(() => { isOpenRef.current = isOpen; }, [isOpen]);

  // ── chat hook ──
  const {
    messages, setMessages,
    inputValue, setInputValue,
    isTyping,
    isMuted, setIsMuted,
    downloadingType,
    attachedFile, setAttachedFile,
    uploadingFile,
    isRecording,
    advisorSessionId: _advisorSessionId,
    historyFetchedRef: _historyFetchedRef,
    speak,
    restoreHistory,
    handleSend,
    handleSendWithAttachment,
    handleFileSelect,
    handleVoiceInput,
    handleDownloadReport,
    handleActualDownload,
    handleAdvisorFeedback,
    handleShowAgentTrace,
    handleShowRecentTraces,
    clearChat,
  } = useAiChat(message);

  const { mood: _mood, hasFetchedMood, setHasFetchedMood } = useMoodGreeting(user, setMessages);
  const { showEmojiPicker, setShowEmojiPicker, emojiTab, setEmojiTab, emojiPanelRef, handleEmojiSelect } = useEmojiPicker(setInputValue, inputRef as React.RefObject<HTMLInputElement>);

  const { subscribe } = useWebSocket({
    userId: user?.id,
    tenantId: user?.tenantId,
    enabled: isAuthenticated && !!user?.id,
    token: localStorage.getItem('authToken') ?? '',
  });

  // ── 监听后端推送的 AI 智能决策卡片 ──
  useEffect(() => {
    const handleAdvicePush = (event: Event) => {
      const customEvent = event as CustomEvent;
      const advice = normalizeTraceableAdvice(customEvent.detail);
      if (!advice) return;

      setIsOpen(true);
      setMessages(prev => [
        ...prev,
        {
          id: `advice-${Date.now()}`,
          role: 'ai',
          text: advice.summary,
          traceableAdvice: advice,
        }
      ]);
    };

    window.addEventListener('ai:traceable_advice', handleAdvicePush);
    return () => window.removeEventListener('ai:traceable_advice', handleAdvicePush);
  }, [setMessages]);

  useEffect(() => {
    return subscribe('ai:traceable_advice', (msg: WsMessage) => {
      const advice = normalizeTraceableAdvice(msg.payload);
      if (!advice) return;

      setIsOpen(true);
      setMessages(prev => [
        ...prev,
        {
          id: `advice-ws-${Date.now()}`,
          role: 'ai',
          text: advice.summary,
          traceableAdvice: advice,
        }
      ]);
    });
  }, [subscribe, setMessages]);

  // ── 监听 ⌘K 搜索无结果 → 打开小云面板并预填问题 ──
  useEffect(() => {
    const handleOpenAiChat = (event: Event) => {
      const query = (event as CustomEvent).detail?.query;
      if (query) {
        setInputValue(query);
      }
      setIsOpen(true);
    };
    window.addEventListener('openAiChat', handleOpenAiChat);
    return () => window.removeEventListener('openAiChat', handleOpenAiChat);
  }, [setInputValue]);

  const dismissPendingItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDismissedPending(prev => {
      const next = new Set(prev); next.add(id); saveDismissedPending(next); return next;
    });
  };
  const visiblePendingItems = pendingItems.filter(item => !dismissedPending.has(item.id));

  // ── 历史记录恢复 ──
  useEffect(() => { restoreHistory(); }, [restoreHistory]);

  // ── 滚动到底部 ──
  useEffect(() => {
    const el = chatAreaRef.current;
    if (!el) return;
    const raf = requestAnimationFrame(() => {
      if (messages.length > 1 || isTyping) {
        el.scrollTop = el.scrollHeight;
      } else if (isOpen && messages.length <= 1) {
        el.scrollTop = 0;
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [messages, isTyping, isOpen]);

  // ── 打开时聚焦 ──
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  // ── 辅助回调 ──
  const openTraceCenter = useCallback((commandId?: string) => {
    const path = commandId ? `/cockpit/agent-traces?commandId=${commandId}` : '/cockpit/agent-traces';
    window.open(path, '_blank');
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      attachedFile ? void handleSendWithAttachment() : void handleSend();
    }
  };

  const jumpToIntelligenceCenter = (_query: string) => {
    setIsOpen(false);
    if (window.location.pathname !== '/cockpit') {
      navigate('/cockpit');
    }
  };

  const onSafeNavigate = useCallback((path: string) => {
    const knownPrefixes = ['/production', '/finance', '/warehouse', '/intelligence', '/system', '/dashboard', '/style', '/crm', '/procurement', '/basic', '/cockpit', '/style-info', '/order-management'];
    const safePath = path && knownPrefixes.some(p => path.startsWith(p)) ? path : '/production';
    setIsOpen(false);
    setIsTaskPanelOpen(false);
    navigate(safePath);
  }, [navigate]);

  const openTaskPanel = useCallback(() => {
    setIsTaskPanelOpen(true);
    setIsOpen(false);
    refreshPendingTasks();
  }, [refreshPendingTasks]);

  const closeTaskPanel = useCallback(() => {
    setIsTaskPanelOpen(false);
  }, []);

  const backToChat = useCallback(() => {
    setIsTaskPanelOpen(false);
    setIsOpen(true);
    setPanelView('chat');
  }, []);

  const switchToTasks = useCallback(() => {
    setPanelView('tasks');
    fetchTasks();
    startPolling();
  }, [fetchTasks, startPolling]);

  const switchToLinks = useCallback(() => {
    setPanelView('links');
    stopPolling();
  }, [stopPolling]);

  const switchToChat = useCallback(() => {
    setPanelView('chat');
    stopPolling();
  }, [stopPolling]);

  const handleTaskCreate = useCallback(() => {
    setEditingTask(null);
    setShowTaskForm(true);
  }, []);

  const handleTaskEdit = useCallback((task: TaskItem) => {
    setEditingTask(task);
    setShowTaskForm(true);
  }, []);

  const handleTaskSave = useCallback(async (data: { title: string; description?: string; priority: string; module: string; orderNo?: string; endTime?: string }) => {
    setTaskSaving(true);
    try {
      if (editingTask?.id) {
        await updateTask(editingTask.id, data as Record<string, unknown>);
      } else {
        await createTask(data);
      }
      setShowTaskForm(false);
      setEditingTask(null);
    } catch {} finally { setTaskSaving(false); }
  }, [editingTask, createTask, updateTask]);

  const handleTaskDelete = useCallback(async (taskId: string) => {
    await deleteTask(taskId);
    setShowTaskForm(false);
    setEditingTask(null);
  }, [deleteTask]);

  const handleTaskClaim = useCallback(async (taskId: string) => {
    await claimTask(taskId);
  }, [claimTask]);

  const handleTaskComplete = useCallback(async (taskId: string) => {
    await completeTask(taskId);
  }, [completeTask]);

  const trackNavigate = useCallback((label: string, path: string) => {
    try {
      const stored: { label: string; path: string }[] = JSON.parse(localStorage.getItem('xiaoyun.recentLinks') || '[]');
      const updated = [{ label, path }, ...stored.filter(l => l.path !== path)].slice(0, 10);
      localStorage.setItem('xiaoyun.recentLinks', JSON.stringify(updated));
    } catch {}
  }, []);

  const handleQuickNavigate = useCallback((path: string) => {
    setIsOpen(false);
    navigate(path);
    const label = path.split('/').filter(Boolean).join(' > ');
    trackNavigate(label, path);
  }, [navigate, trackNavigate]);

  useEffect(() => {
    if (panelView === 'tasks') startPolling(); else stopPolling();
    return () => stopPolling();
  }, [panelView, startPolling, stopPolling]);

  const onPurchaseDocAction = useCallback(async (msgId: string, mode: string, card: any) => {
    try {
      await intelligenceApi.autoExecutePurchaseDoc({ docId: card.docId, confirmInbound: mode === 'inbound', warehouseLocation: mode === 'inbound' ? '默认仓' : undefined });
      setMessages(prev => prev.map(m =>
        m.id === msgId
          ? { ...m, purchaseDocCard: m.purchaseDocCard ? { ...m.purchaseDocCard, autoStatus: mode === 'arrival' ? 'arrived' : 'inbound' } : m.purchaseDocCard }
          : m
      ));
    } catch {
      message.error('操作失败，请稍后重试');
    }
  }, [message, setMessages]);

  // ── 浮标拖拽事件 ──
  const handleTriggerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    hasDragRef.current = false;
    dragStartRef.current = { mx: e.clientX, my: e.clientY, tx: triggerPos.x, ty: triggerPos.y };
    cancelIdleSnap();
    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - dragStartRef.current.mx;
      const dy = ev.clientY - dragStartRef.current.my;
      if (!hasDragRef.current && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
        hasDragRef.current = true;
        setIsActiveDrag(true);
      }
      if (!hasDragRef.current) return;
      moveTo(
        Math.max(-28, Math.min(dragStartRef.current.tx + dx, window.innerWidth - 28)),
        Math.max(10, Math.min(dragStartRef.current.ty + dy, window.innerHeight - 56)),
      );
    };
    const onUp = () => {
      setIsActiveDrag(false);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (hasDragRef.current) {
        snapToEdge();
      } else {
        // 点击（非拖拽）→ 切换面板
        setIsOpen(prev => {
          if (prev) { startIdleSnap(); } else { snapToVisible(); }
          return !prev;
        });
      }
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [triggerPos.x, triggerPos.y, cancelIdleSnap, setIsActiveDrag, moveTo, snapToEdge, startIdleSnap, snapToVisible]);

  // ── 页面上下文感知建议 ──
  const pageSuggestions = useMemo(() => getPageSuggestions(location.pathname), [location.pathname]);

  // ── 面板定位样式（根据浮标边缘侧计算） ──
  const panelStyle: React.CSSProperties = useMemo(() => ({
    position: 'fixed' as const,
    zIndex: 9998,
    bottom: 16,
    width: dimensions.width,
    height: dimensions.height,
    ...(triggerPos.edge === 'left'
      ? { left: 16, transformOrigin: 'bottom left' }
      : { right: 16, transformOrigin: 'bottom right' }),
  }), [triggerPos.edge, dimensions.width, dimensions.height]);

  // ── JSX ──
  return (
    <>
      {/* 智能通知气泡 */}
      <SmartBubble
        onOpenTaskPanel={openTaskPanel}
        triggerEdge={triggerPos.edge}
      />

      {/* 待办聚合面板 */}
      {isTaskPanelOpen && (
        <div className={styles.chatPanel} style={panelStyle}>
          <TaskAggregationPanel
            tasks={pendingItems}
            onClose={closeTaskPanel}
            onNavigate={onSafeNavigate}
            onBackToChat={backToChat}
          />
        </div>
      )}

      {isOpen && !isTaskPanelOpen && (
        <div className={styles.chatPanel} style={panelStyle}>
          {/* Header */}
          <div className={styles.panelHeader}>
            <div className={styles.avatarContainer}>
              <CuteCloudTrigger size={40} active />
            </div>
            <div className={styles.headerText}>
              <div className={styles.headerTitle}>小云 智慧大脑</div>
              <div className={styles.headerSubtitle}>衣智链 · AI协同工作中枢</div>
            </div>
            <div className={styles.headerActions}>
              <span className={styles.headerActionBtn} onClick={cycleSize} title={`当前${size === 'small' ? '小框' : size === 'medium' ? '中框' : '大框'}，点击切换`}>
                {size === 'small' ? '⬜' : size === 'medium' ? '⊞' : '⊟'}
              </span>
              <UnorderedListOutlined
                className={styles.headerActionBtn}
                onClick={switchToTasks}
                title="任务列表"
              />
              {isMuted ? (
                <AudioMutedOutlined className={styles.headerActionBtn} onClick={() => setIsMuted(false)} title="取消静音" />
              ) : (
                <SoundOutlined className={styles.headerActionBtn} onClick={() => { setIsMuted(true); stopAllSpeech(); }} title="静音" />
              )}
              <ClearOutlined className={styles.headerActionBtn} onClick={() => { clearChat(); refreshPendingTasks(); setHasFetchedMood(false); }} title="清空对话" />
              <CloseOutlined className={`${styles.headerActionBtn} ${styles.closeBtnIcon}`} onClick={() => { setIsOpen(false); startIdleSnap(); }} title="关闭" />
            </div>
          </div>

          {/* Body: Sidebar + Main + Aux */}
          <div className={styles.panelBody}>
            {showSidebar && (
              <div className={styles.sidebar}>
                <button className={`${styles.sidebarItem} ${panelView === 'chat' ? styles.sidebarItemActive : ''}`} onClick={switchToChat} title="对话">
                  💬 <span className={styles.sidebarLabel}>对话</span>
                </button>
                <button className={`${styles.sidebarItem} ${panelView === 'tasks' ? styles.sidebarItemActive : ''}`} onClick={switchToTasks} title="任务">
                  📋 <span className={styles.sidebarLabel}>任务</span>
                  {taskStats.pending > 0 && <span className={styles.sidebarBadge}>{taskStats.pending}</span>}
                </button>
                <button className={`${styles.sidebarItem} ${panelView === 'links' ? styles.sidebarItemActive : ''}`} onClick={switchToLinks} title="快捷入口">
                  🔗 <span className={styles.sidebarLabel}>入口</span>
                </button>
              </div>
            )}

            <div className={styles.mainContent}>
              {panelView === 'chat' && (
                <>
                  <div className={styles.chatArea} ref={chatAreaRef}>
                    {messages.length === 1 && (
                      <PendingItemsSection
                        items={visiblePendingItems}
                        onDismiss={dismissPendingItem}
                        onClosePanel={() => setIsOpen(false)}
                        onNavigate={onSafeNavigate}
                        onOpenTaskPanel={switchToTasks}
                      />
                    )}
                    {messages.length === 1 && (
                      <>
                        <div className={msgStyles.quickHint}>直接自然语言输入就可以，下面只是常用示例</div>
                        <div className={msgStyles.suggestionChips}>
                          {pageSuggestions.map(q => (
                            <div key={q} className={msgStyles.chip} onClick={() => handleSend(q)}>{q}</div>
                          ))}
                        </div>
                      </>
                    )}
                    {messages.map(msg => (
                      <MessageBubble
                        key={msg.id} msg={msg} downloadingType={downloadingType}
                        onSend={handleSend} onDownloadReport={handleDownloadReport}
                        onActualDownload={handleActualDownload} onShowAgentTrace={handleShowAgentTrace}
                        onShowRecentTraces={handleShowRecentTraces} onOpenTraceCenter={openTraceCenter}
                        onFeedback={handleAdvisorFeedback} onJumpToIntelligence={jumpToIntelligenceCenter}
                        onSafeNavigate={onSafeNavigate} onSpeak={speak}
                        onPurchaseDocAction={(msgId, mode, card) => onPurchaseDocAction(msgId, mode, card)}
                        onWizardSubmit={(_msgId, command, params) => {
                          let p = command;
                          Object.entries(params).forEach(([_k, v]) => {
                            if (Array.isArray(v)) p += ' ' + v.join(',');
                            else if (v !== undefined && v !== null && v !== '') p += ' ' + v;
                          });
                          handleSend(p);
                        }}
                      />
                    ))}
                    {isTyping && (
                      <div className={`${msgStyles.messageRow} ${msgStyles.rowAi}`}>
                        <div className={msgStyles.messageAvatar}><XiaoyunCloudAvatar size={28} active loading /></div>
                        <div className={`${msgStyles.messageBubble} ${msgStyles.bubbleAi}`}>
                          <div className={msgStyles.typingText}>小云正在处理，请稍等一下…</div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className={styles.inputArea}>
                    <input ref={fileInputRef} type="file" style={{ display: 'none' }} accept=".xlsx,.xls,.csv,.jpg,.jpeg,.png,.gif,.pdf" onChange={handleFileSelect} />
                    {attachedFile && (
                      <div className={styles.attachChip}>
                        <span>📎 {attachedFile.name}</span>
                        <button type="button" className={styles.attachChipRemove} onClick={() => setAttachedFile(null)}>×</button>
                      </div>
                    )}
                    <div className={styles.inputRow}>
                      <button type="button" className={styles.uploadBtn} title="上传文件" onClick={() => fileInputRef.current?.click()} disabled={isTyping || uploadingFile}>
                        <PaperClipOutlined />
                      </button>
                      <button type="button" className={`${styles.uploadBtn} ${styles.traceBtn}`} title="查看AI记录" onClick={() => openTraceCenter()} disabled={isTyping || uploadingFile}>
                        AI记录
                      </button>
                      <div className={emojiStyles.emojiWrapper} ref={emojiPanelRef}>
                        <button type="button" className={`${styles.uploadBtn} ${showEmojiPicker ? emojiStyles.emojiActive : ''}`} title="表情" onClick={() => setShowEmojiPicker(v => !v)}>
                          <SmileOutlined />
                        </button>
                        {showEmojiPicker && (
                          <div className={emojiStyles.emojiPanel}>
                            <div className={emojiStyles.emojiTabs}>
                              {EMOJI_GROUPS.map((g, i) => (
                                <button type="button" key={g.label} className={`${emojiStyles.emojiTabBtn} ${emojiTab === i ? emojiStyles.emojiTabActive : ''}`} onClick={() => setEmojiTab(i)}>{g.label}</button>
                              ))}
                            </div>
                            <div className={emojiStyles.emojiGrid}>
                              {EMOJI_GROUPS[emojiTab].emojis.map((em, i) => (
                                <button type="button" key={`${em}-${i}`} className={emojiStyles.emojiItem} onClick={() => handleEmojiSelect(em)}>{em}</button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                      <input ref={inputRef} type="text" className={styles.chatInput} placeholder="直接说需求，也可以上传采购单据让我自动识别、到货或入库" value={inputValue} onChange={e => setInputValue(e.target.value)} onKeyDown={handleKeyDown} disabled={isTyping || uploadingFile} />
                      <button type="button" className={styles.voiceBtn} title="语音输入" onClick={handleVoiceInput} disabled={isTyping || isRecording} style={{ color: isRecording ? 'var(--xiaoyun-danger)' : undefined }}>
                        {isRecording ? <LoadingOutlined spin /> : <SoundOutlined />}<span>语音</span>
                      </button>
                      <button type="button" className={styles.sendBtn} onClick={() => attachedFile ? void handleSendWithAttachment() : void handleSend()} disabled={(!inputValue.trim() && !attachedFile) || isTyping || uploadingFile}>
                        {uploadingFile ? <LoadingOutlined /> : <SendOutlined />}<span>{uploadingFile ? '处理中' : '发送'}</span>
                      </button>
                    </div>
                  </div>
                </>
              )}

              {panelView === 'tasks' && (
                <TaskListView
                  tasks={myTasks} loading={tasksLoading}
                  onClaim={handleTaskClaim} onComplete={handleTaskComplete}
                  onEdit={handleTaskEdit} onCreate={handleTaskCreate}
                />
              )}

              {panelView === 'links' && (
                <QuickLinksPanel onNavigate={handleQuickNavigate} recentLinks={recentLinks} />
              )}

              {showTaskForm && (
                <TaskFormModal
                  task={editingTask} onSave={handleTaskSave}
                  onDelete={handleTaskDelete}
                  onCancel={() => { setShowTaskForm(false); setEditingTask(null); }}
                  saving={taskSaving}
                />
              )}
            </div>

            {showAuxPanel && (
              <div className={styles.auxPanel}>
                <div className={styles.auxSectionTitle}>任务统计</div>
                <div className={styles.auxStatItem}><span>全部</span><span className={styles.auxStatValue}>{taskStats.total}</span></div>
                <div className={styles.auxStatItem}><span>待处理</span><span className={styles.auxStatValue}>{taskStats.pending}</span></div>
                <div className={styles.auxStatItem}><span>进行中</span><span className={styles.auxStatValue}>{taskStats.inProgress}</span></div>
                <div className={styles.auxStatItem}><span>已完成</span><span className={styles.auxStatValue}>{taskStats.completed}</span></div>
                <div className={styles.auxStatItem}><span>紧急</span><span className={styles.auxStatValue} style={{ color: '#cf1322' }}>{taskStats.highPriority}</span></div>
                <div className={styles.auxSectionTitle} style={{ marginTop: 20 }}>快捷操作</div>
                <button className={`${styles.actionBtn} ${styles.actionBtnPrimary}`} style={{ width: '100%', marginTop: 8 }} onClick={handleTaskCreate}>
                  + 新建任务
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 悬浮浮标 — 始终可见、可拖拽、吸附边缘 */}
      <div
        className={`${cloudStyles.triggerBtn} ${isActiveDrag ? cloudStyles.triggerDragging : ''} ${isDocked && !isOpen && !isTaskPanelOpen ? cloudStyles.triggerDocked : ''} ${isDocked && triggerPos.edge === 'right' ? cloudStyles.triggerDockedRight : ''}`}
        style={{ left: triggerPos.x, top: triggerPos.y }}
        onMouseDown={handleTriggerMouseDown}
        title="召唤小云智能助手"
      >
        <CuteCloudTrigger size={56} active={isOpen || isTaskPanelOpen} />
        {!isOpen && !isTaskPanelOpen && visiblePendingItems.length > 0 && (
          <span className={cloudStyles.triggerBadge} onClick={(e) => { e.stopPropagation(); openTaskPanel(); }}>{visiblePendingItems.length}</span>
        )}
      </div>
    </>
  );
};

export default GlobalAiAssistant;
