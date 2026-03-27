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
  loading = false,
  interacting = false,
}) => {
  const className = [
    styles.stage,
    active ? styles.active : '',
    interacting ? styles.interacting : '',
    loading ? styles.loading : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={className} style={{ width: size, height: size }}>
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
