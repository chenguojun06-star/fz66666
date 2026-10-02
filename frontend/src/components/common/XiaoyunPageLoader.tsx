import React from 'react';
import { BrandLoader } from './loading';
import styles from './XiaoyunPageLoader.module.css';

/**
 * 页面级「小云正在赶来」加载卡（D-702 收敛）
 *
 * <p><b>历史</b>：与 {@link XiaoyunSpinIndicator} 同属一套重复实现 ——
 * 自己算尺寸、自己放 {@link XiaoyunCloudAvatar}，绕开了品牌加载体系。
 *
 * <p><b>现在</b>：改为 {@link BrandLoader} 的薄封装。
 * 本组件保留自己的「小云正在赶来」卡片外壳（标题/描述/布局），
 * 只把里面那个指示器换成统一入口 —— 这样以后调整加载视觉只需改一处。
 *
 * <p>调用方无需改动 —— props 签名保持不变。
 */
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
        <BrandLoader size={88} />
        <div className={styles.title}>小云正在赶来</div>
        <div className={styles.desc}>{message}</div>
      </div>
    </div>
  );
};

export default XiaoyunPageLoader;
