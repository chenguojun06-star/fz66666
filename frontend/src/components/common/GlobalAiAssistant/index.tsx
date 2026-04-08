import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  SendOutlined,
  CloseOutlined,
  SoundOutlined,
  LoadingOutlined,
  AudioMutedOutlined,
  ClearOutlined,
  PaperClipOutlined,
  SmileOutlined,
} from '@ant-design/icons';
import { intelligenceApi } from '@/services/intelligence/intelligenceApi';
import { App } from 'antd';
import api from '@/utils/api';
import { useAuth } from '@/utils/AuthContext';
import XiaoyunCloudAvatar, { CuteCloudTrigger, type XiaoyunCloudMood } from '@/components/common/XiaoyunCloudAvatar';
import styles from './index.module.css';
import { loadDismissedPending, saveDismissedPending } from './sessionUtils';
import { INITIAL_MSG, SUGGESTIONS, EMOJI_GROUPS } from './constants';
import { choose } from './helpers';
import { useAiChat } from './useAiChat';
import MessageBubble from './MessageBubble';

const GlobalAiAssistant: React.FC = () => {
  const { message } = App.useApp();
  const { user } = useAuth();
  const navigate = useNavigate();

  // ── parent-local state ──
  const [isOpen, setIsOpen] = useState(false);
  const [_mood, setMood] = useState<XiaoyunCloudMood>('normal');
  const [hasFetchedMood, setHasFetchedMood] = useState(false);
  const [pendingItems, setPendingItems] = useState<Array<{orderNo: string; styleNo: string; factoryName: string; progress: number; daysLeft: number}>>([]);
  const [dismissedPending, setDismissedPending] = useState<Set<string>>(loadDismissedPending);

  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [emojiTab, setEmojiTab] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const emojiPanelRef = useRef<HTMLDivElement>(null);

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
    handleAdvisorFeedback,
    handleShowAgentTrace,
    handleShowRecentTraces,
    clearChat,
  } = useAiChat(message);

  // ── 监听后端推送的 AI 智能决策卡片 ──
  useEffect(() => {
    const handleAdvicePush = (event: Event) => {
      const customEvent = event as CustomEvent;
      const advice = customEvent.detail;
      if (!advice || !advice.title) return;

      setIsOpen(true);
      setMessages(prev => [
        ...prev,
        {
          id: `advice-${Date.now()}`,
          role: 'ai',
          text: advice.summary || '系统发来了一条智能建议。',
          traceableAdvice: advice,
        }
      ]);
    };

    window.addEventListener('ai:traceable_advice', handleAdvicePush);
    return () => window.removeEventListener('ai:traceable_advice', handleAdvicePush);
  }, []);

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
  }, []);

  const dismissPendingItem = (orderNo: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDismissedPending(prev => {
      const next = new Set(prev); next.add(orderNo); saveDismissedPending(next); return next;
    });
  };
  const visiblePendingItems = pendingItems.filter(item => !dismissedPending.has(item.orderNo));

  // ── mood / greeting ──
  useEffect(() => {
    if (hasFetchedMood) return;
    const fetchStatus = async () => {
      try {
        setHasFetchedMood(true);
        const factoryId = (user as any)?.factoryId;
        const isManagerLevel = !!(user as any)?.isSuperAdmin || !!(user as any)?.isTenantOwner
          || ['admin', '管理员', '管理'].some(k => ((user as any)?.role || '').toLowerCase().includes(k));
        if (!factoryId && !isManagerLevel) return;
        const res = await api.get('/dashboard/daily-brief', factoryId ? { params: { factoryId } } : undefined);
        // @ts-ignore
        const actualData = res?.code === 200 ? res.data : (res?.data || res);
        if (actualData) {
          const { overdueOrderCount = 0, highRiskOrderCount = 0, todayScanCount = 0, pendingItems: apiPendingItems = [], topPriorityOrder } = actualData;
          let newMood: XiaoyunCloudMood = 'normal';
          let greeting = INITIAL_MSG.text;
          const seed = overdueOrderCount * 17 + highRiskOrderCount * 11 + todayScanCount;

          if (apiPendingItems && apiPendingItems.length > 0) {
            setPendingItems(apiPendingItems);
          } else if (topPriorityOrder) {
            setPendingItems([topPriorityOrder]);
          }

          if (overdueOrderCount >= 5 || highRiskOrderCount >= 3) {
            newMood = 'urgent';
            const topHint = topPriorityOrder ? `最紧急：${topPriorityOrder.orderNo}（${topPriorityOrder.daysLeft < 0 ? '已逾期' + Math.abs(topPriorityOrder.daysLeft) + '天' : '剩' + topPriorityOrder.daysLeft + '天'}，进度${topPriorityOrder.progress}%）` : '';
            greeting = choose(seed, [
              `现在有 ${overdueOrderCount + highRiskOrderCount} 个高优先级风险。${topHint}\n我可以先按影响面帮你排处理顺序。`,
              `当前高优先级风险共 ${overdueOrderCount + highRiskOrderCount} 个。${topHint}\n建议先收口最急的几单，我可以直接给出处理次序。`,
              `风险已经堆到 ${overdueOrderCount + highRiskOrderCount} 项。${topHint}\n你可以让我先把"先做什么"排出来。`,
            ]);
          } else if (overdueOrderCount > 0 || highRiskOrderCount > 0) {
            newMood = 'curious';
            const topHint = topPriorityOrder ? `\n📌 ${topPriorityOrder.orderNo}（${topPriorityOrder.styleNo || ''}）${topPriorityOrder.daysLeft < 0 ? '已逾期' + Math.abs(topPriorityOrder.daysLeft) + '天' : '还剩' + topPriorityOrder.daysLeft + '天'}，进度${topPriorityOrder.progress}%` : '';
            greeting = choose(seed + 3, [
              `当前有 ${overdueOrderCount + highRiskOrderCount} 个待关注事项。${topHint}\n我可以继续往下拆：为什么慢、先动哪里。`,
              `现在有 ${overdueOrderCount + highRiskOrderCount} 项需要盯。${topHint}\n你可以让我直接给出优先处理顺序。`,
              `这会儿要关注的事项有 ${overdueOrderCount + highRiskOrderCount} 个。${topHint}\n我可以帮你把根因和动作排清楚。`,
            ]);
          } else if (todayScanCount > 100) {
            newMood = 'success';
            greeting = choose(seed + 5, [
              '今天节奏挺稳的呢 ✨ 继续帮你盯效率、风险和成本波动好不好～',
              '今天运行状态不错哦！要不要让我再做一轮隐患巡检看看？',
              '今天盘面挺好的～ 下一步可以看看效率和成本有没有小伏击！',
            ]);
          } else {
            newMood = 'normal';
            greeting = choose(seed + 7, [
              '你好呀！我是小云 🌤️ 有什么可以帮你的吗？随时问风险、订单进度都行哦！',
              '嘉～ 我是小云！想问风险、瓶颈还是交付进度？直接说就好啊！',
              '你好呀！我是小云 ☁️ 可以让我帮你看风险、瓶颈和交付影响～',
            ]);
            const hour = new Date().getHours();
            if (hour >= 0 && hour < 6) {
               greeting = '夜猫子！🌙 还在工作呀～ 让我帮你把夜间异常和明早要做的事整理一下吧！';
            } else if (hour >= 12 && hour <= 14) {
               greeting = '午休时间搶个手～ 🍱 要不要先快速过一遍上半天的数据？';
            } else if (hour >= 19) {
               greeting = '辛苦啊！🌸 到收尾阶段了，让我帮你整理今晚要盯的订单和明天计划～';
            }
          }
          setMood(newMood);
          setMessages([{ ...INITIAL_MSG, text: greeting }]);
        }
      } catch (err) {
        console.error('Failed to fetch system mood', err);
        setMood('normal');
        setMessages([{ ...INITIAL_MSG, text: '实时数据暂时没取到，但不要紧～随时问我都行哦！' }]);
      }
    };
    fetchStatus();
  }, [hasFetchedMood]);

  // ── 历史记录恢复 ──
  useEffect(() => { restoreHistory(); }, [restoreHistory]);

  // ── 滚动到底部 ──
  useEffect(() => {
    if (chatAreaRef.current) {
      chatAreaRef.current.scrollTop = chatAreaRef.current.scrollHeight;
    }
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

  // ── 表情面板点击外部关闭 ──
  useEffect(() => {
    if (!showEmojiPicker) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (emojiPanelRef.current && !emojiPanelRef.current.contains(e.target as Node)) {
        setShowEmojiPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showEmojiPicker]);

  const handleEmojiSelect = (emoji: string) => {
    setInputValue(prev => prev + emoji);
    inputRef.current?.focus();
  };

  const jumpToIntelligenceCenter = (_query: string) => {
    setIsOpen(false);
    if (window.location.pathname !== '/cockpit') {
      navigate('/cockpit');
    }
  };

  const onSafeNavigate = useCallback((path: string) => {
    const knownPrefixes = ['/production', '/finance', '/warehouse', '/intelligence', '/system', '/dashboard', '/style', '/crm', '/procurement', '/basic', '/cockpit'];
    const safePath = path && knownPrefixes.some(p => path.startsWith(p)) ? path : '/production';
    setIsOpen(false);
    navigate(safePath);
  }, [navigate]);

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

  // ── JSX ──
  return (
    <div className={styles.assistantWrapper}>
      {isOpen && (
        <div className={styles.chatPanel}>
          {/* Header */}
          <div className={styles.panelHeader}>
            <div className={styles.avatarContainer}>
              <CuteCloudTrigger size={40} active />
            </div>
            <div className={styles.headerText}>
              <div className={styles.headerTitle}>小云 智能助理</div>
              <div className={styles.headerSubtitle}>云裳智链 · 实时判断与执行协作</div>
            </div>
            <div className={styles.headerActions}>
              {isMuted ? (
                <AudioMutedOutlined
                  className={styles.headerActionBtn}
                  onClick={() => setIsMuted(false)}
                  title="取消静音"
                />
              ) : (
                <SoundOutlined
                  className={styles.headerActionBtn}
                  onClick={() => setIsMuted(true)}
                  title="静音"
                />
              )}
              <ClearOutlined
                className={styles.headerActionBtn}
                onClick={() => {
                  clearChat();
                  setPendingItems([]);
                  setHasFetchedMood(false);
                }}
                title="清空对话"
              />
              <CloseOutlined
                className={`${styles.headerActionBtn} ${styles.closeBtnIcon}`}
                onClick={() => setIsOpen(false)}
                title="关闭"
              />
            </div>
          </div>

          {/* Chat List */}
          <div className={styles.chatArea} ref={chatAreaRef}>
            {/* 预警待办 */}
            {messages.length === 1 && visiblePendingItems.length > 0 && (
              <div className={styles.pendingItems}>
                {visiblePendingItems.map((item: any) => {
                  const dl = item.daysLeft;
                  const status = dl < 0 ? `已逾期${Math.abs(dl)}天` : dl === 0 ? '今天到期' : `剩${dl}天`;
                  return (
                    <div key={item.orderNo} className={styles.pendingItem} style={{position:'relative'}}
                      onClick={() => { setIsOpen(false); navigate(`/production?orderNo=${encodeURIComponent(item.orderNo)}`); }}
                    >
                      <span>⚠️</span>
                      <span style={{flex:1}}>{item.orderNo}{item.styleNo ? `（${item.styleNo}）` : ''} — {status}，进度{item.progress}%</span>
                      <span style={{color:'#1890ff',fontSize:11}}>查看 →</span>
                      <button
                        className={styles.pendingDismissBtn}
                        onClick={(e) => dismissPendingItem(item.orderNo, e)}
                        title="今日不再提醒"
                      >×</button>
                    </div>
                  );
                })}
              </div>
            )}
            {messages.length === 1 && (
              <>
                <div className={styles.quickHint}>
                  直接自然语言输入就可以，下面只是常用示例
                </div>
                <div className={styles.suggestionChips}>
                  {SUGGESTIONS.map(q => (
                    <div key={q} className={styles.chip} onClick={() => handleSend(q)}>
                      {q}
                    </div>
                  ))}
                </div>
              </>
            )}

            {messages.map(msg => (
              <MessageBubble
                key={msg.id}
                msg={msg}
                downloadingType={downloadingType}
                onSend={handleSend}
                onDownloadReport={handleDownloadReport}
                onShowAgentTrace={handleShowAgentTrace}
                onShowRecentTraces={handleShowRecentTraces}
                onOpenTraceCenter={openTraceCenter}
                onFeedback={handleAdvisorFeedback}
                onJumpToIntelligence={jumpToIntelligenceCenter}
                onSafeNavigate={onSafeNavigate}
                onSpeak={speak}
                onPurchaseDocAction={(msgId, mode, card) => onPurchaseDocAction(msgId, mode, card)}
              />
            ))}

            {/* Loading Indicator */}
            {isTyping && (
              <div className={`${styles.messageRow} ${styles.rowAi}`}>
                <div className={styles.messageAvatar}>
                  <XiaoyunCloudAvatar size={28} active loading />
                </div>
                <div className={`${styles.messageBubble} ${styles.bubbleAi}`}>
                  <div className={styles.typingText}>小云正在处理，请稍等一下…</div>
                </div>
              </div>
            )}
          </div>

          {/* Input Area */}
          <div className={styles.inputArea}>
            <input
              ref={fileInputRef}
              type="file"
              style={{ display: 'none' }}
              accept=".xlsx,.xls,.csv,.jpg,.jpeg,.png,.gif,.pdf"
              onChange={handleFileSelect}
            />
            {attachedFile && (
              <div className={styles.attachChip}>
                <span>📎 {attachedFile.name}</span>
                <button className={styles.attachChipRemove} onClick={() => setAttachedFile(null)}>×</button>
              </div>
            )}
            <div className={styles.inputRow}>
              <button
                className={styles.uploadBtn}
                title="上传文件（Excel/CSV/图片/PDF）"
                onClick={() => fileInputRef.current?.click()}
                disabled={isTyping || uploadingFile}
              >
                <PaperClipOutlined />
              </button>
              <button
                className={`${styles.uploadBtn} ${styles.traceBtn}`}
                title="查看AI记录"
                onClick={() => openTraceCenter()}
                disabled={isTyping || uploadingFile}
              >
                AI记录
              </button>
              <div className={styles.emojiWrapper} ref={emojiPanelRef}>
                <button
                  className={`${styles.uploadBtn} ${showEmojiPicker ? styles.emojiActive : ''}`}
                  title="表情"
                  onClick={() => setShowEmojiPicker(v => !v)}
                >
                  <SmileOutlined />
                </button>
                {showEmojiPicker && (
                  <div className={styles.emojiPanel}>
                    <div className={styles.emojiTabs}>
                      {EMOJI_GROUPS.map((g, i) => (
                        <button
                          key={g.label}
                          className={`${styles.emojiTabBtn} ${emojiTab === i ? styles.emojiTabActive : ''}`}
                          onClick={() => setEmojiTab(i)}
                        >
                          {g.label}
                        </button>
                      ))}
                    </div>
                    <div className={styles.emojiGrid}>
                      {EMOJI_GROUPS[emojiTab].emojis.map((em, i) => (
                        <button
                          key={`${em}-${i}`}
                          className={styles.emojiItem}
                          onClick={() => handleEmojiSelect(em)}
                        >
                          {em}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <input
                ref={inputRef}
                type="text"
                className={styles.chatInput}
                placeholder="直接说需求，也可以上传采购单据让我自动识别、到货或入库"
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isTyping || uploadingFile}
              />
              <button
                className={styles.voiceBtn}
                title="语音输入（点击后说话）"
                onClick={handleVoiceInput}
                disabled={isTyping || isRecording}
                style={{ color: isRecording ? '#f5222d' : undefined }}
              >
                {isRecording ? <LoadingOutlined spin /> : <SoundOutlined />}
                <span>语音</span>
              </button>
              <button
                className={styles.sendBtn}
                onClick={() => attachedFile ? void handleSendWithAttachment() : void handleSend()}
                disabled={(!inputValue.trim() && !attachedFile) || isTyping || uploadingFile}
              >
                {uploadingFile ? <LoadingOutlined /> : <SendOutlined />}
                <span>{uploadingFile ? '处理中' : '发送'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 悬浮图标开关 */}
      {!isOpen && (
        <div
          className={styles.triggerBtn}
          onClick={() => setIsOpen(true)}
          title="召唤小云智能助手"
        >
          <CuteCloudTrigger size={56} />
          {visiblePendingItems.length > 0 && (
            <span className={styles.triggerBadge}>{visiblePendingItems.length}</span>
          )}
        </div>
      )}
    </div>
  );
};

export default GlobalAiAssistant;
