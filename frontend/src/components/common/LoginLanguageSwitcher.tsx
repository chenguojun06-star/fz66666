import React from 'react';
import { Button, Dropdown } from 'antd';
import { GlobalOutlined } from '@ant-design/icons';
import { APP_LANGUAGE_OPTIONS, type AppLanguage } from '@/i18n/languagePreference';
import { useAppLanguage } from '@/i18n/useAppLanguage';
import { LOCALES } from '@/i18n/locales.generated';
import './LoginLanguageSwitcher.css';

const resolveLanguageText = (uiLanguage: AppLanguage, targetLanguage: AppLanguage): string => {
  const table = LOCALES[uiLanguage]?.language?.names as Record<string, string> | undefined;
  return table?.[targetLanguage] || targetLanguage;
};

const LoginLanguageSwitcher: React.FC = () => {
  const { language, setLanguage } = useAppLanguage();
  const current = APP_LANGUAGE_OPTIONS.find((item) => item.value === language) || APP_LANGUAGE_OPTIONS[0];

  return (
    <Dropdown
      placement="bottomRight"
      trigger={['click']}
      menu={{
        selectable: true,
        selectedKeys: [language],
        items: APP_LANGUAGE_OPTIONS.map((item) => ({
          key: item.value,
          label: resolveLanguageText(language, item.value),
        })),
        onClick: ({ key }) => setLanguage(key as AppLanguage),
      }}
    >
      <Button type="text" className="login-language-switcher" aria-label="切换语言">
        <GlobalOutlined />
        <span>{resolveLanguageText(language, current.value)}</span>
      </Button>
    </Dropdown>
  );
};

export default LoginLanguageSwitcher;
