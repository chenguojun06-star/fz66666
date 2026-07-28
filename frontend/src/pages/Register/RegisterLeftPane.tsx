import React from 'react';

interface RegisterLeftPaneProps {
  isWorkerInvite: boolean;
  isFactoryInvite: boolean;
  factoryName: string;
}

/**
 * 注册页左面板
 * <p>
 * 与登录页 LoginLeftPane 保持视觉一致：tech-bg + login-showcase + tech-core（云头像）
 * 不引入未定义的装饰类（tech-arc / tech-node / signal-node / tech-float-card 等），
 * 避免元素以文档流堆叠导致布局错乱。
 */
const RegisterLeftPane: React.FC<RegisterLeftPaneProps> = ({
  isWorkerInvite,
  isFactoryInvite,
  factoryName,
}) => {
  const tagText = isWorkerInvite
    ? (isFactoryInvite ? 'MARS｜外发工厂注册' : 'MARS｜工人扫码注册')
    : 'MARS｜工厂入驻';

  const descText = isWorkerInvite
    ? `欢迎注册「${factoryName}」，审批通过后即可登录`
    : '填写工厂与联系人信息，审批通过后启用账号';

  return (
    <div className="login-left-pane">
      <div className="tech-bg" aria-hidden="true">
        <div className="tech-grid" />
        <div className="tech-glow-center" />
      </div>
      <section className="login-showcase">
        <div className="login-showcase-visual">
          <div className="login-showcase-copy">
            <div className="login-tag">{tagText}</div>
            <div className="login-showcase-desc">{descText}</div>
          </div>
          <div className="tech-core-container">
            <div className="tech-ring ring-1"></div>
            <div className="tech-ring ring-2"></div>
            <div className="tech-ring ring-3"></div>
            <div className="tech-halo"></div>
            <div className="tech-core tech-core--cloud">
              <div className="tech-cloud-glow" />
              <div className="tech-cloud">
                <span className="tech-cloud__part tech-cloud__part--left" />
                <span className="tech-cloud__part tech-cloud__part--center" />
                <span className="tech-cloud__part tech-cloud__part--right" />
                <span className="tech-cloud__base" />
                <span className="tech-cloud__eye tech-cloud__eye--left">
                  <span className="tech-cloud__eye-highlight tech-cloud__eye-highlight--left" />
                </span>
                <span className="tech-cloud__eye tech-cloud__eye--right">
                  <span className="tech-cloud__eye-highlight tech-cloud__eye-highlight--right" />
                </span>
                <span className="tech-cloud__smile" />
                <span className="tech-cloud__spark tech-cloud__spark--left" />
                <span className="tech-cloud__spark tech-cloud__spark--right" />
              </div>
            </div>
            <div className="small-ai-badge">AI</div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default RegisterLeftPane;
