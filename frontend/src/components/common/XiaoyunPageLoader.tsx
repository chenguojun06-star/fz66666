import React from 'react';
import XiaoyunCloudAvatar from './XiaoyunCloudAvatar';
import styles from './XiaoyunPageLoader.module.css';

interface XiaoyunPageLoaderProps {
  message?: string;
  inline?: boolean;
}

const XiaoyunPageLoader: React.FC<XiaoyunPageLoaderProps> = ({
  message = '小云正在展开页面，请稍等一下…',
  inline = false,
}) => {
  return (
    <div className={`${styles.wrap} ${inline ? styles.inline : ''}`}>
      <div className={styles.card}>
        <XiaoyunCloudAvatar size={88} active loading />
        <div className={styles.title}>小云正在赶来</div>
        <div className={styles.desc}>{message}</div>
      </div>
    </div>
  );
};

export default XiaoyunPageLoader;
