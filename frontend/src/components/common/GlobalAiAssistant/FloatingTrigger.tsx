/**
 * FloatingTrigger — 小云悬浮浮标（可拖拽、边缘吸附、待办红点）
 */
import React from 'react';
import { CuteCloudTrigger } from '@/components/common/XiaoyunCloudAvatar';
import cloudStyles from './CloudTrigger.module.css';

interface FloatingTriggerProps {
  triggerPos: { x: number; y: number; edge: 'left' | 'right' };
  isActiveDrag: boolean;
  isDocked: boolean;
  isOpen: boolean;
  isTaskPanelOpen: boolean;
  visiblePendingCount: number;
  onMouseDown: (e: React.MouseEvent) => void;
  onBadgeClick: (e: React.MouseEvent) => void;
}

const FloatingTrigger: React.FC<FloatingTriggerProps> = ({
  triggerPos,
  isActiveDrag,
  isDocked,
  isOpen,
  isTaskPanelOpen,
  visiblePendingCount,
  onMouseDown,
  onBadgeClick,
}) => {
  return (
    <div
      className={`${cloudStyles.triggerBtn} ${isActiveDrag ? cloudStyles.triggerDragging : ''} ${isDocked && !isOpen && !isTaskPanelOpen ? cloudStyles.triggerDocked : ''} ${isDocked && triggerPos.edge === 'right' ? cloudStyles.triggerDockedRight : ''}`}
      style={{ left: triggerPos.x, top: triggerPos.y }}
      onMouseDown={onMouseDown}
      title="召唤小云智能助手"
    >
      <CuteCloudTrigger size={56} active={isOpen || isTaskPanelOpen} />
      {!isOpen && !isTaskPanelOpen && visiblePendingCount > 0 && (
        <span className={cloudStyles.triggerBadge} onClick={onBadgeClick}>{visiblePendingCount}</span>
      )}
    </div>
  );
};

export default FloatingTrigger;
