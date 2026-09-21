import React from 'react';
import { Alert, Button, Checkbox, Space } from 'antd';
import { BASIC_PRESET_MODULES, ALL_MODULE_PATHS, MODULE_SECTIONS } from './tenantModuleConfig';

type ModuleConfigPanelProps = {
  selectedModules: string[] | null;
  setSelectedModules: React.Dispatch<React.SetStateAction<string[] | null>>;
};

const ModuleConfigPanel: React.FC<ModuleConfigPanelProps> = ({ selectedModules, setSelectedModules }) => (
  <div className="u-mt-16" style={{ borderTop: '1px dashed var(--color-border)', paddingTop: 16 }}>
    <div className="u-d-flex u-jc-between u-ai-start u-mb-12 u-gap-12 u-fwrap-wrap">
      <span className="u-fw-600 u-fs-16" style={{ lineHeight: 1.5 }}>
        菜单模块配置
        <span className="u-fs-14 u-fw-400 u-ml-8" style={{ color: 'var(--color-text-tertiary)' }}>
          （不勾选 = 全部开放；勾选后只显示已配置模块）
        </span>
      </span>
      <Space size={8} wrap>
        <Button onClick={() => setSelectedModules(null)}>全部开放</Button>
        <Button onClick={() => setSelectedModules([...BASIC_PRESET_MODULES])}>基础版预设</Button>
        <Button onClick={() => setSelectedModules(ALL_MODULE_PATHS)}>全选</Button>
        <Button onClick={() => setSelectedModules([])}>全不选</Button>
      </Space>
    </div>
    {selectedModules === null ? (
      <Alert title="当前：全部开放，账户可访问所有菜单。点击「基础版预设」快速配置基础套餐。" type="success" showIcon style={{ marginBottom: 10 }} />
    ) : selectedModules.length === 0 ? (
      <Alert title="警告：白名单为空，账户登录后将没有任何菜单，请至少勾选一个模块。" type="error" showIcon style={{ marginBottom: 10 }} />
    ) : (
      <Alert title={`已配置 ${selectedModules.length} 个模块路径，仅显示勾选的菜单项。`} type="info" showIcon style={{ marginBottom: 10 }} />
    )}
    <div className="u-d-grid u-gap-12 u-ai-start" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', padding: 2 }}>
      {MODULE_SECTIONS.map(section => {
        const sectionPaths = section.paths.map(item => item.path);
        const checkedCount = selectedModules === null ? 0 : sectionPaths.filter(path => selectedModules.includes(path)).length;
        const allChecked = selectedModules !== null && checkedCount === sectionPaths.length;
        const someChecked = checkedCount > 0 && !allChecked;
        return (
          <div key={section.key} className="u-br-8" style={{ border: '1px solid var(--color-border-light)', padding: '12px 14px', background: 'var(--color-bg-container)' }}>
            <Checkbox
              checked={allChecked}
              indeterminate={someChecked}
              style={{ fontWeight: 600, marginBottom: 8, fontSize: 15, lineHeight: 1.5 }}
              onChange={(e) => {
                setSelectedModules(prev => {
                  const base = prev === null ? [] : [...prev];
                  if (e.target.checked) return [...new Set([...base, ...sectionPaths])];
                  return base.filter(path => !sectionPaths.includes(path));
                });
              }}
            >
              {section.title}
            </Checkbox>
            <div className="u-d-flex u-fd-column u-gap-6" style={{ paddingLeft: 4 }}>
              {section.paths.map(item => (
                <Checkbox
                  key={item.path}
                  checked={selectedModules !== null && selectedModules.includes(item.path)}
                  style={{ fontSize: 15, marginLeft: 0, lineHeight: 1.6 }}
                  onChange={(e) => {
                    setSelectedModules(prev => {
                      const base = prev === null ? [] : [...prev];
                      if (e.target.checked) return [...new Set([...base, item.path])];
                      return base.filter(path => path !== item.path);
                    });
                  }}
                >
                  {item.label}
                </Checkbox>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  </div>
);

export default ModuleConfigPanel;
