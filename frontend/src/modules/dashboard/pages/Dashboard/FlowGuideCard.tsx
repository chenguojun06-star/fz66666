import React, { useState } from 'react';
import { Button, Modal } from 'antd';
import { DownOutlined, SettingOutlined, UpOutlined } from '@ant-design/icons';
import { useLayoutAuth } from '@/components/Layout/useLayoutAuth';
import FlowGuideConfigModal from './FlowGuideConfigModal';
import {
  DEFAULT_GROUPS,
  FlowPanelGroup,
  listAllSystemModules,
  loadPanelGroups,
  savePanelGroups,
} from './flowGuideConfig';

/**
 * D-530：首页「流程引导」面板（用户拍板的首页主入口形态）。
 * 分组 + 模块名 + 一句话说明 + 整行点击跳页；右上角齿轮可配置——
 * 从全系统菜单（menuConfig）中增删模块，改动即时保存，支持恢复默认。
 * 渲染时仍按登录人权限过滤：没权限的模块不显示、点了也不会进死链。
 */
const FlowGuideCard: React.FC = () => {
  const {
    hasPermissionForPath,
    isFactoryAccount,
    factoryVisiblePaths,
    isSuperAdmin,
    isTenantModuleEnabled,
  } = useLayoutAuth();

  const [groups, setGroups] = useState<FlowPanelGroup[]>(() => loadPanelGroups());
  const [configOpen, setConfigOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const itemVisible = (path: string) => {
    if (isFactoryAccount && !factoryVisiblePaths.has(path)) return false;
    return hasPermissionForPath(path) && isTenantModuleEnabled(path);
  };

  const allModules = listAllSystemModules().filter((m) => itemVisible(m.path));

  const updateGroups = (next: FlowPanelGroup[]) => {
    setGroups(next);
    savePanelGroups(next);
  };

  const resetToDefault = () => {
    setGroups(DEFAULT_GROUPS);
    savePanelGroups(DEFAULT_GROUPS);
  };

  // 渲染层权限过滤（分组内条目全部被过滤则整组隐藏）
  const visibleGroups = groups
    .map((group) => ({ ...group, items: group.items.filter((item) => itemVisible(item.path)) }))
    .filter((group) => group.items.length > 0);

  return (
    <div className="dashboard-card home-card">
      <div className="card-header">
        <h3 className="card-title">流程引导</h3>
        <Button
          type="text"
          size="small"
          icon={<SettingOutlined />}
          onClick={() => setConfigOpen(true)}
          title="配置面板模块"
          style={{ color: 'var(--color-text-tertiary)', marginRight: 4 }}
        >
          配置
        </Button>
        <Button
          type="text"
          size="small"
          icon={collapsed ? <DownOutlined /> : <UpOutlined />}
          onClick={() => setCollapsed((v) => !v)}
          style={{ color: 'var(--color-text-tertiary)' }}
        >
          {collapsed ? '展开' : '收起'}
        </Button>
      </div>
      {!collapsed && (
        <div className="card-content">
          {visibleGroups.length === 0 ? (
            <div className="flow-guide-empty">面板为空，点击右上角「配置」从全系统模块中添加</div>
          ) : (
            <div className="flow-guide-grid">
              {visibleGroups.map((group) => (
                <div key={group.key} className="flow-guide-group">
                  <div className="flow-guide-group-title">{group.title}</div>
                  {group.items.map((item) => (
                    <a key={item.path + item.label} className="flow-guide-item" href={item.path} title={item.desc || item.label}>
                      <span className="flow-guide-item-text">
                        <span className="flow-guide-item-name">{item.label}</span>
                        {item.desc && <span className="flow-guide-item-desc">{item.desc}</span>}
                      </span>
                      <span className="flow-guide-item-link">去看看</span>
                    </a>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <Modal
        title="配置流程引导面板"
        open={configOpen}
        onCancel={() => setConfigOpen(false)}
        footer={null}
        width={720}
      >
        <FlowGuideConfigModal
          onClose={() => setConfigOpen(false)}
          groups={groups}
          allModules={allModules}
          onChange={updateGroups}
          onReset={resetToDefault}
        />
      </Modal>
    </div>
  );
};

export default FlowGuideCard;
