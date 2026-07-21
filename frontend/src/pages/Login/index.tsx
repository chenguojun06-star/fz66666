import React from 'react';
import { Typography } from 'antd';
import { useLoginData } from './useLoginData';
import LoginLeftPane from './components/LoginLeftPane';
import LoginForm from './components/LoginForm';
import LoginFooter from './components/LoginFooter';
import './styles.css';

const { Title } = Typography;

const Login: React.FC = () => {
  const {
    form,
    submitting,
    loginMode,
    smsSending,
    smsCountdown,
    selectedTenant,
    tenantsLoading,
    searchOptions,
    year,
    buildCommit,
    buildTimeText,
    handleSearch,
    handleSelect,
    handleSendSmsCode,
    handleLogin,
    setSelectedTenant,
  } = useLoginData();

  return (
    <div className="login-page modern-login-page">
      <LoginLeftPane />

      <div className="login-divider" aria-hidden="true" />

      <div className="login-right-pane">
        <svg className="right-pane-garment" viewBox="0 0 80 70" fill="none" aria-hidden="true">
          <path d="M0 18L12 6L20 10L26 8L40 6L54 8L60 10L68 6L80 18" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M68 6L66 14L62 26L66 22" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M12 6L14 14L18 26L14 22" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M62 26L62 64L18 64L18 26" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M18 64L40 66L62 64" stroke="currentColor" strokeWidth="0.5" strokeDasharray="2 2" strokeLinecap="round"/>
          <path d="M34 6C34 4 36 2 40 2C44 2 46 4 46 6" stroke="currentColor" strokeWidth="0.6" strokeLinecap="round"/>
        </svg>
        <svg className="right-pane-hanger" viewBox="0 0 80 36" fill="none" aria-hidden="true">
          <path d="M38 4C38 1.8 39.8 0 42 0C44.2 0 46 1.8 46 4C46 5.2 45.2 6.2 44 6.8" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round"/>
          <path d="M44 6.8L76 28L74 32L42 16L10 32L6 28L40 6.8" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round"/>
          <circle cx="42" cy="4" r="1.5" stroke="currentColor" strokeWidth="0.5" opacity="0.5"/>
        </svg>
        <div className="login-form-wrapper">
          <div className="login-form-card">
            <div className="login-header">
              <Title level={2} className="login-title">
                云裳智链
              </Title>
              <div className="login-subtitle">
                云裳智链｜多端协同智能提醒平台
              </div>
            </div>
            <LoginForm
              form={form}
              submitting={submitting}
              loginMode={loginMode}
              smsSending={smsSending}
              smsCountdown={smsCountdown}
              selectedTenant={selectedTenant}
              tenantsLoading={tenantsLoading}
              searchOptions={searchOptions}
              handleSearch={handleSearch}
              handleSelect={handleSelect}
              handleSendSmsCode={handleSendSmsCode}
              handleLogin={handleLogin}
              setSelectedTenant={setSelectedTenant}
            />
            <LoginFooter
              year={year}
              buildCommit={buildCommit}
              buildTimeText={buildTimeText}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
