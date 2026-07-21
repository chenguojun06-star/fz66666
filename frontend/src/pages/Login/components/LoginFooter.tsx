import React from 'react';
import { t } from '../../../i18n';
import { useAppLanguage } from '../../../i18n/useAppLanguage';

interface LoginFooterProps {
  year: number;
  buildCommit: string;
  buildTimeText: string;
}

const LoginFooter: React.FC<LoginFooterProps> = ({ year, buildCommit, buildTimeText }) => {
  const { language } = useAppLanguage();

  return (
    <>
      <div className="login-footer">© {year} {t('login.brand', language)}</div>
      <div className="login-footer" style={{ marginTop: 2, fontSize: 14 }}>
        部署版本：{buildCommit} · 构建时间：{buildTimeText}
      </div>
      <div className="login-footer login-filing">
        <div className="login-filing-row">
          <div className="login-filing-item">
            <img loading="lazy" src="/police.png" alt="公安备案图标" className="login-filing-icon" />
            <a href="https://beian.mps.gov.cn/#/query/webSearch?code=44011302005352" target="_blank" rel="noopener noreferrer" className="login-filing-link">
              粤公网安备44011302005352号
            </a>
          </div>
          <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer" className="login-filing-link">
            粤ICP备2026026776号-1
          </a>
        </div>
      </div>
    </>
  );
};

export default LoginFooter;
