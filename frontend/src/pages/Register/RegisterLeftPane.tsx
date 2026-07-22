import React from 'react';
import { Typography } from 'antd';

const { Title } = Typography;

interface RegisterLeftPaneProps {
  isWorkerInvite: boolean;
  isFactoryInvite: boolean;
  factoryName: string;
}

const RegisterLeftPane: React.FC<RegisterLeftPaneProps> = ({
  isWorkerInvite,
  isFactoryInvite,
  factoryName,
}) => {
  return (
    <div className="login-left-pane">
      <div className="tech-bg" aria-hidden="true">
        <div className="tech-grid" />
        <div className="tech-world-map" />
        <div className="tech-glow-left" />
        <div className="tech-glow-right" />
        <div className="tech-arc tech-arc-1" />
        <div className="tech-arc tech-arc-2" />
        <div className="tech-arc tech-arc-3" />
        <span className="tech-node tech-node-1" />
        <span className="tech-node tech-node-2" />
        <span className="tech-node tech-node-3" />
        <span className="tech-node tech-node-4" />
        <span className="tech-node tech-node-5" />
        <span className="tech-node tech-node-6" />
      </div>
      <section className="login-showcase">
        <div className="login-showcase-shell">
          <div className="login-showcase-copy">
            <div className="login-kicker">MARS｜注册引导</div>
            <Title level={2} className="login-showcase-title">
              {isWorkerInvite
                ? isFactoryInvite
                  ? '扫码加入外发工厂'
                  : '扫码加入工厂'
                : '提交工厂入驻申请'}
            </Title>
            <div className="login-showcase-desc">
              {isWorkerInvite
                ? isFactoryInvite
                  ? `欢迎注册「${factoryName}」，请您耐心等待管理员审批通过后即可登录。`
                  : `欢迎注册「${factoryName}」，请您耐心等待管理员审批通过后即可登录。`
                : '填写工厂与联系人信息，审批通过后即可启用正式账号。'}
            </div>
          </div>
          <div className="login-showcase-visual">
            <div className="tech-core-container">
              <div className="tech-ring ring-1"></div>
              <div className="tech-ring ring-2"></div>
              <div className="tech-ring ring-3"></div>
              <div className="tech-orbit orbit-a"></div>
              <div className="tech-orbit orbit-b"></div>
              <div className="tech-orbit orbit-c"></div>
              <div className="tech-halo"></div>
              <div className="tech-axis tech-axis-x"></div>
              <div className="tech-axis tech-axis-y"></div>
              <div className="signal-node signal-node-1"></div>
              <div className="signal-node signal-node-2"></div>
              <div className="signal-node signal-node-3"></div>
              <div className="signal-node signal-node-4"></div>
              <div className="tech-float-card tech-float-card-top">
                <span className="tech-float-label">审批流程</span>
                <strong className="tech-float-value">在线跟踪</strong>
              </div>
              <div className="tech-float-card tech-float-card-left">
                <span className="tech-float-label">{isWorkerInvite ? '扫码注册' : '入驻申请'}</span>
                <strong className="tech-float-value">{isWorkerInvite ? '快速加入' : '平台审核'}</strong>
              </div>
              <div className="tech-float-card tech-float-card-right">
                <span className="tech-float-label">登录切换</span>
                <strong className="tech-float-value">租户隔离</strong>
              </div>
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
        </div>
        <div className="login-showcase-highlights">
          <div className="showcase-highlight-card">
            <span className="highlight-label">注册模式</span>
            <strong className="highlight-value">{isWorkerInvite ? (isFactoryInvite ? '外发工厂工人注册' : '工人扫码注册') : '工厂入驻申请'}</strong>
          </div>
          <div className="showcase-highlight-card">
            <span className="highlight-label">流程特点</span>
            <strong className="highlight-value">{isWorkerInvite ? '管理员审批' : '审核通过后启用'}</strong>
          </div>
          <div className="showcase-highlight-card">
            <span className="highlight-label">系统目标</span>
            <strong className="highlight-value">{isWorkerInvite ? '工厂绑定 · 账号归属清晰' : '账号归属清晰 · 登录切换准确'}</strong>
          </div>
        </div>
      </section>
    </div>
  );
};

export default RegisterLeftPane;
