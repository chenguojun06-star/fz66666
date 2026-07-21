/**
 * PanelHeader — 小云面板头部（头像 + 标题 + 工具栏）
 */
import React from 'react';
import {
  CloseOutlined,
  SoundOutlined,
  AudioMutedOutlined,
  ClearOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import { CuteCloudTrigger } from '@/components/common/XiaoyunCloudAvatar';
import { stopAllSpeech } from './speechUtils';
import styles from './index.module.css';
import type { PanelSize } from './usePanelResize';

interface PanelHeaderProps {
  size: PanelSize;
  cycleSize: () => void;
  isMuted: boolean;
  setIsMuted: React.Dispatch<React.SetStateAction<boolean>>;
  clearChat: () => void;
  refreshPendingTasks: () => void;
  setHasFetchedMood: (v: boolean) => void;
  handleClose: () => void;
  switchToTasks: () => void;
}

const PanelHeader: React.FC<PanelHeaderProps> = ({
  size,
  cycleSize,
  isMuted,
  setIsMuted,
  clearChat,
  refreshPendingTasks,
  setHasFetchedMood,
  handleClose,
  switchToTasks,
}) => {
  return (
    <div className={styles.panelHeader}>
      <div className={styles.avatarContainer}>
        <CuteCloudTrigger size={40} active />
      </div>
      <div className={styles.headerText}>
        <div className={styles.headerTitle}>小云 智慧大脑</div>
        <div className={styles.headerSubtitle}>云裳智链 · AI协同工作中枢</div>
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
        <CloseOutlined className={`${styles.headerActionBtn} ${styles.closeBtnIcon}`} onClick={handleClose} title="关闭" />
      </div>
    </div>
  );
};

export default PanelHeader;
