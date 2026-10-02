import React from 'react';
import styles from './XiaoyunCloudAvatar.module.css';

export type XiaoyunCloudMood = 'normal' | 'curious' | 'urgent' | 'error' | 'success';

interface XiaoyunCloudAvatarProps {
  size?: number;
  active?: boolean;
  mood?: XiaoyunCloudMood;
  loading?: boolean;
  interacting?: boolean;
}

const XiaoyunCloudAvatar: React.FC<XiaoyunCloudAvatarProps> = ({
  size = 52,
  active = false,
  mood = 'normal',
  loading = false,
  interacting = false,
}) => {
  // D-702：此前 mood 属性「声明了 5 种情绪却从未被接收」，属静默失效 ——
  // SmartBubble（highPriorityCount>0 传 urgent）与 ChatMessageList（传 liveStatus.mood）
  // 两处一直在传，界面上却永远显示同一个表情，紧急态形同虚设。现真正接线。
  const className = [
    styles.stage,
    active ? styles.active : '',
    interacting ? styles.interacting : '',
    loading ? styles.loading : '',
    styles[mood] ?? '',
  ].filter(Boolean).join(' ');

  return (
    <div className={className} style={{ width: size, height: size }} data-mood={mood}>
      <span className={styles.halo} />
      <span className={styles.ring} />
      <span className={styles.ringSoft} />
      <div className={styles.cloud}>
        <span className={`${styles.part} ${styles.partLeft}`} />
        <span className={`${styles.part} ${styles.partCenter}`} />
        <span className={`${styles.part} ${styles.partRight}`} />
        <span className={styles.base} />
        <span className={`${styles.eye} ${styles.eyeLeft}`}>
          <span className={styles.highlight} />
        </span>
        <span className={`${styles.eye} ${styles.eyeRight}`}>
          <span className={styles.highlight} />
        </span>
        <span className={styles.mouth} />
      </div>
    </div>
  );
};

export default XiaoyunCloudAvatar;
export { XiaoyunCloudAvatar as CuteCloudTrigger };
