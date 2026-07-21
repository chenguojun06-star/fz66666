import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { App } from 'antd';
import { useUser, useAuthState } from '@/utils/AuthContext';
import { useWebSocket } from '@/hooks/useWebSocket';
import XiaoyunCloudAvatar from '@/components/common/XiaoyunCloudAvatar';
import styles from './index.module.css';
import msgStyles from './MessageBubble.module.css';
import { loadDismissedPending, saveDismissedPending } from './sessionUtils';
import { getPageSuggestions } from './constants';
import { computePanelStyle } from './helpers';
import { useAiChat } from './useAiChat';
import { useDragSnap } from './useDragSnap';
import { usePendingTasks } from './usePendingTasks';
import { useMoodGreeting } from './useMoodGreeting';
import { useEmojiPicker } from './useEmojiPicker';
import { usePanelResize } from './usePanelResize';
import { useAdviceListener } from './useAdviceListener';
import { useTaskPanel } from './useTaskPanel';
import { usePanelActions } from './usePanelActions';
import { useTriggerDrag } from './useTriggerDrag';
import MessageBubble from './MessageBubble';
import SmartBubble from './SmartBubble';
import XiaoyunLiveStatus from './XiaoyunLiveStatus';
import TaskAggregationPanel from './TaskAggregationPanel';
import PendingItemsSection from './PendingItemsSection';
import TaskListView from './TaskListView';
import TaskFormModal from './TaskFormModal';
import PanelHeader from './PanelHeader';
import ChatInputArea from './ChatInputArea';
import FloatingTrigger from './FloatingTrigger';
import SampleLoanModal from './SampleLoanModal';

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
  const { tasks: pendingItems, refresh: refreshPendingTasks } = usePendingTasks();
  const [dismissedPending, setDismissedPending] = useState<Set<string>>(loadDismissedPending);

  const { size, cycleSize, dimensions, showSidebar, showAuxPanel } = usePanelResize();

  const handleClose = useCallback(() => {
    setIsOpen(false);
    startIdleSnap();
  }, [startIdleSnap]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── isOpen ref 镜像（保留原行为） ──
  const isOpenRef = useRef(isOpen);
  useEffect(() => { isOpenRef.current = isOpen; }, [isOpen]);

  // ── chat hook ──
  const {
      messages, setMessages,
      inputValue, setInputValue,
      isTyping,
      liveStatus,
      isMuted, setIsMuted,
      downloadingType,
      attachedFile, setAttachedFile,
      uploadingFile,
      isRecording,
      advisorSessionId: _advisorSessionId,
      historyFetchedRef: _historyFetchedRef,
      previewImage,
      setPreviewImage,
      speak,
      restoreHistory,
      fetchBriefing,
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

  const { mood: _mood, hasFetchedMood: _hasFetchedMood, setHasFetchedMood } = useMoodGreeting(user, setMessages);
  const { showEmojiPicker, setShowEmojiPicker, emojiTab, setEmojiTab, emojiPanelRef, handleEmojiSelect } = useEmojiPicker(setInputValue, inputRef as React.RefObject<HTMLInputElement>);

  const { subscribe } = useWebSocket({
    userId: user?.id,
    tenantId: user?.tenantId,
    enabled: isAuthenticated && !!user?.id,
    token: localStorage.getItem('authToken') ?? '',
  });

  // ── 监听后端推送的 AI 智能决策卡片 + ⌘K 搜索无结果 ──
  useAdviceListener({ setMessages, setIsOpen, setInputValue, subscribe });

  // ── 任务面板状态与回调 ──
  const {
    isTaskPanelOpen, setIsTaskPanelOpen,
    panelView, setPanelView,
    showTaskForm, setShowTaskForm, editingTask, setEditingTask, taskSaving,
    myTasks, tasksLoading, taskStats,
    openTaskPanel, closeTaskPanel, backToChat,
    switchToTasks, switchToChat,
    handleTaskCreate, handleTaskEdit, handleTaskSave,
    handleTaskDelete, handleTaskClaim, handleTaskComplete,
  } = useTaskPanel({ refreshPendingTasks, setIsOpen, messageApi: message });

  // ── 导航 / 模态框 / 动作卡片回调 ──
  const {
    sampleLoanModalVisible, setSampleLoanModalVisible,
    sampleLoanPrefill,
    openTraceCenter, jumpToIntelligenceCenter,
    onSafeNavigate, handleActionCardAction, onPurchaseDocAction,
  } = usePanelActions({ setIsOpen, setIsTaskPanelOpen, setMessages, handleSend, messageApi: message, navigate });

  // ── 浮标拖拽事件 ──
  const { handleTriggerMouseDown } = useTriggerDrag({
    triggerPos, cancelIdleSnap, setIsActiveDrag,
    moveTo, snapToEdge, startIdleSnap, snapToVisible, setIsOpen,
  });

  const dismissPendingItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDismissedPending(prev => {
      const next = new Set(prev); next.add(id); saveDismissedPending(next); return next;
    });
  };
  const visiblePendingItems = pendingItems.filter(item => !dismissedPending.has(item.id));

  // ── 历史记录恢复 ──
  useEffect(() => { restoreHistory(); }, [restoreHistory]);

  // ── 打开时自动拉取智能简报 ──
  useEffect(() => { if (isOpen) fetchBriefing(); }, [isOpen, fetchBriefing]);

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
      const timer = setTimeout(() => inputRef.current?.focus(), 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      attachedFile ? void handleSendWithAttachment() : sendWithContext();
    }
  };

  const sendWithContext = useCallback((text?: string) => {
    const msgText = (text ?? inputValue).trim();
    if (!msgText) return;
    void handleSend(text);
  }, [inputValue, handleSend]);

  // ── 页面上下文感知建议 ──
  const pageSuggestions = useMemo(() => getPageSuggestions(location.pathname), [location.pathname]);

  // ── 面板定位样式（根据浮标边缘侧计算） ──
  const panelStyle: React.CSSProperties = useMemo(
    () => computePanelStyle(triggerPos.edge, dimensions.width, dimensions.height),
    [triggerPos.edge, dimensions.width, dimensions.height],
  );

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
          <PanelHeader
            size={size}
            cycleSize={cycleSize}
            isMuted={isMuted}
            setIsMuted={setIsMuted}
            clearChat={clearChat}
            refreshPendingTasks={refreshPendingTasks}
            setHasFetchedMood={setHasFetchedMood}
            handleClose={handleClose}
            switchToTasks={switchToTasks}
          />

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
              </div>
            )}

            {!showSidebar && (
              <div className={styles.bottomNav}>
                <button className={`${styles.bottomNavItem} ${panelView === 'chat' ? styles.bottomNavItemActive : ''}`} onClick={switchToChat}>💬</button>
                <button className={`${styles.bottomNavItem} ${panelView === 'tasks' ? styles.bottomNavItemActive : ''}`} onClick={switchToTasks}>
                  📋{taskStats.pending > 0 && <span className={styles.bottomNavBadge}>{taskStats.pending}</span>}
                </button>
              </div>
            )}

            <div className={styles.mainContent}>
              {panelView === 'chat' && (
                <>
                  <div className={styles.chatArea} ref={chatAreaRef}>
                    <XiaoyunLiveStatus
                      mood={liveStatus.mood}
                      step={liveStatus.step}
                      toolExecuting={liveStatus.toolExecuting}
                      elapsedMs={liveStatus.elapsedMs}
                      visible={liveStatus.visible}
                    />
                    {messages.length === 1 && (
                      <PendingItemsSection
                        items={visiblePendingItems}
                        onDismiss={dismissPendingItem}
                        onNavigate={onSafeNavigate}
                        onOpenTaskList={switchToTasks}
                      />
                    )}
                    {messages.length <= 1 && (
                      <div className={msgStyles.quickHint}>直接自然语言输入就可以，下面只是常用示例</div>
                    )}
                    <div className={msgStyles.suggestionChips}>
                      {pageSuggestions.map(q => (
                        <div key={q} className={msgStyles.chip} onClick={() => sendWithContext(q)}>{q}</div>
                      ))}
                    </div>
                    {messages.map(msg => (
                      <MessageBubble
                        key={msg.id} msg={msg} downloadingType={downloadingType}
                        onSend={handleSend} onDownloadReport={handleDownloadReport}
                        onActualDownload={handleActualDownload} onShowAgentTrace={handleShowAgentTrace}
                        onShowRecentTraces={handleShowRecentTraces} onOpenTraceCenter={openTraceCenter}
                        onFeedback={handleAdvisorFeedback} onJumpToIntelligence={jumpToIntelligenceCenter}
                        onSafeNavigate={onSafeNavigate} onSpeak={speak}
                        onPurchaseDocAction={(msgId, mode, card) => onPurchaseDocAction(msgId, mode, card)}
                        onActionCardAction={(card, actionType, path, orderId) => handleActionCardAction(card, actionType, path, orderId)}
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

                  <ChatInputArea
                    fileInputRef={fileInputRef}
                    handleFileSelect={handleFileSelect}
                    previewImage={previewImage}
                    attachedFile={attachedFile}
                    setAttachedFile={setAttachedFile}
                    setPreviewImage={setPreviewImage}
                    isTyping={isTyping}
                    uploadingFile={uploadingFile}
                    isRecording={isRecording}
                    openTraceCenter={() => openTraceCenter()}
                    emojiPanelRef={emojiPanelRef}
                    showEmojiPicker={showEmojiPicker}
                    setShowEmojiPicker={setShowEmojiPicker}
                    emojiTab={emojiTab}
                    setEmojiTab={setEmojiTab}
                    handleEmojiSelect={handleEmojiSelect}
                    inputRef={inputRef}
                    inputValue={inputValue}
                    setInputValue={setInputValue}
                    handleKeyDown={handleKeyDown}
                    handleVoiceInput={handleVoiceInput}
                    handleSendWithAttachment={handleSendWithAttachment}
                    sendWithContext={sendWithContext}
                  />
                </>
              )}

              {panelView === 'tasks' && (
                <TaskListView
                  tasks={myTasks} loading={tasksLoading}
                  onClaim={handleTaskClaim} onComplete={handleTaskComplete}
                  onEdit={handleTaskEdit} onCreate={handleTaskCreate}
                  onNavigate={onSafeNavigate}
                />
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
                <div className={styles.auxStatItem}><span>紧急</span><span className={styles.auxStatValue} style={{ color: 'var(--color-error)' }}>{taskStats.highPriority}</span></div>
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
      <FloatingTrigger
        triggerPos={triggerPos}
        isActiveDrag={isActiveDrag}
        isDocked={isDocked}
        isOpen={isOpen}
        isTaskPanelOpen={isTaskPanelOpen}
        visiblePendingCount={visiblePendingItems.length}
        onMouseDown={handleTriggerMouseDown}
        onBadgeClick={(e) => { e.stopPropagation(); openTaskPanel(); }}
      />

      <SampleLoanModal
        visible={sampleLoanModalVisible}
        prefillData={sampleLoanPrefill}
        onCancel={() => setSampleLoanModalVisible(false)}
        onSuccess={() => {
          setSampleLoanModalVisible(false);
          message.success('样衣借出成功');
        }}
      />
    </>
  );
};

export default GlobalAiAssistant;
