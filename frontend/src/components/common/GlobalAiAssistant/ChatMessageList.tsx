import React from 'react';
import XiaoyunCloudAvatar from '@/components/common/XiaoyunCloudAvatar';
import styles from './index.module.css';
import msgStyles from './MessageBubble.module.css';
import XiaoyunLiveStatus from './XiaoyunLiveStatus';
import PendingItemsSection from './PendingItemsSection';
import MessageBubble from './MessageBubble';
import type { Message, TaskItem, ActionCard } from './types';
import type { LiveStatus } from './useAiChatStream';
import type { PendingTaskDTO } from '@/services/intelligence/intelligenceApi';
import { buildWizardCommand } from './helpers';

interface ChatMessageListProps {
  chatAreaRef: React.RefObject<HTMLDivElement>;
  liveStatus: LiveStatus;
  messages: Message[];
  visiblePendingItems: PendingTaskDTO[];
  pageSuggestions: string[];
  isTyping: boolean;
  downloadingType: string | null;
  dismissPendingItem: (id: string, e: React.MouseEvent) => void;
  onSafeNavigate: (path: string) => void;
  switchToTasks: () => void;
  sendWithContext: (text?: string) => void;
  handleSend: (text?: string) => Promise<void>;
  handleDownloadReport: (type: 'daily' | 'weekly' | 'monthly') => void;
  handleActualDownload: (type: 'daily' | 'weekly' | 'monthly') => void;
  handleShowAgentTrace: (commandId?: string) => void;
  handleShowRecentTraces: () => void;
  openTraceCenter: () => void;
  handleAdvisorFeedback: (msg: Message, score: number) => void;
  jumpToIntelligenceCenter: (text: string) => void;
  speak: (text: string) => void;
  onPurchaseDocAction: (msgId: string, mode: string, card: any) => void;
  handleActionCardAction: (card: ActionCard, actionType: string, path?: string, orderId?: string) => void;
}

const ChatMessageList: React.FC<ChatMessageListProps> = ({
  chatAreaRef,
  liveStatus,
  messages,
  visiblePendingItems,
  pageSuggestions,
  isTyping,
  downloadingType,
  dismissPendingItem,
  onSafeNavigate,
  switchToTasks,
  sendWithContext,
  handleSend,
  handleDownloadReport,
  handleActualDownload,
  handleShowAgentTrace,
  handleShowRecentTraces,
  openTraceCenter,
  handleAdvisorFeedback,
  jumpToIntelligenceCenter,
  speak,
  onPurchaseDocAction,
  handleActionCardAction,
}) => {
  return (
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
          key={msg.id}
          msg={msg}
          downloadingType={downloadingType}
          onSend={handleSend}
          onDownloadReport={handleDownloadReport}
          onActualDownload={handleActualDownload}
          onShowAgentTrace={handleShowAgentTrace}
          onShowRecentTraces={handleShowRecentTraces}
          onOpenTraceCenter={openTraceCenter}
          onFeedback={handleAdvisorFeedback}
          onJumpToIntelligence={jumpToIntelligenceCenter}
          onSafeNavigate={onSafeNavigate}
          onSpeak={speak}
          onPurchaseDocAction={(msgId, mode, card) => onPurchaseDocAction(msgId, mode, card)}
          onActionCardAction={(card, actionType, path, orderId) =>
            handleActionCardAction(card, actionType, path, orderId)
          }
          onWizardSubmit={(_msgId, command, params) => {
            handleSend(buildWizardCommand(command, params));
          }}
        />
      ))}
      {isTyping && (
        <div className={`${msgStyles.messageRow} ${msgStyles.rowAi}`}>
          <div className={msgStyles.messageAvatar}>
            <XiaoyunCloudAvatar size={28} active loading />
          </div>
          <div className={`${msgStyles.messageBubble} ${msgStyles.bubbleAi}`}>
            <div className={msgStyles.typingText}>小云正在处理，请稍等一下…</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatMessageList;
