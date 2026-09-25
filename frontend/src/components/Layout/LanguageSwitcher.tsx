import React from 'react';
import { Button, Dropdown, Tooltip } from 'antd';
import { GlobalOutlined } from '@ant-design/icons';
import { APP_LANGUAGE_OPTIONS, type AppLanguage } from '../../i18n/languagePreference';
import { useAppLanguage } from '../../i18n/useAppLanguage';
import { t } from '../../i18n';

interface LanguageSwitcherProps {
  /** 侧边栏是否折叠（折叠时只显示图标 + Tooltip） */
  collapsed?: boolean;
  /** 额外类名 */
  className?: string;
}

/**
 * 语言切换器（PC 端）
 *
 * D-520：补齐 PC 端语言切换入口 —— 此前 i18n 基础设施齐备但全仓无任何
 * setLanguage 调用方，用户实际无法切换语言。
 *
 * 切换后 setStoredAppLanguage 会派发 APP_LANGUAGE_EVENT，
 * 已订阅 useAppLanguage 的组件（AppWrapper / SideMenu / StatusTag）即时更新。
 */
const LanguageSwitcher: React.FC<LanguageSwitcherProps> = ({ collapsed = false, className }) => {
  const { language, setLanguage } = useAppLanguage();
  const current = APP_LANGUAGE_OPTIONS.find((item) => item.value === language) ?? APP_LANGUAGE_OPTIONS[0];

  const items = APP_LANGUAGE_OPTIONS.map((item) => ({
    key: item.value,
    label: item.label,
  }));

  const menuProps = {
    items,
    selectable: true,
    selectedKeys: [language],
    onClick: ({ key }: { key: string }) => setLanguage(key as AppLanguage),
  };

  const button = (
    <Button
      type="text"
      className="sidebar-lang-btn"
      icon={<GlobalOutlined />}
      aria-label={t('admin.switchLanguage', language)}
    >
      {collapsed ? null : current.label}
    </Button>
  );

  return (
    <div className={['sidebar-lang', className].filter(Boolean).join(' ')}>
      <Dropdown
        menu={menuProps}
        placement={collapsed ? 'rightBottom' : 'topLeft'}
        trigger={['click']}
      >
        {collapsed ? (
          <Tooltip placement="right" title={t('admin.switchLanguage', language)}>
            {button}
          </Tooltip>
        ) : button}
      </Dropdown>
    </div>
  );
};

export default LanguageSwitcher;
