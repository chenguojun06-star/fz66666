import React from 'react';
import { Alert, Button, Checkbox, Space } from 'antd';
import { BASIC_PRESET_MODULES, ALL_MODULE_PATHS, MODULE_SECTIONS } from './tenantModuleConfig';

type ModuleConfigPanelProps = {
  selectedModules: string[] | null;
  setSelectedModules: React.Dispatch<React.SetStateAction<string[] | null>>;
};

const ModuleConfigPanel: React.FC<ModuleConfigPanelProps> = ({ selectedModules, setSelectedModules }) => (
  <div style={{ marginTop: 16, borderTop: '1px dashed #e8e8e8', paddingTop: 16 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
      <span style={{ fontWeight: 600, fontSize: 16, lineHeight: 1.5 }}>
        菜单模块配置
        <span style={{ fontSize: 14, color: '#999', fontWeight: 400, marginLeft: 8 }}>
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
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12, padding: 2, alignItems: 'start' }}>
      {MODULE_SECTIONS.map(section => {
        const sectionPaths = section.paths.map(item => item.path);
        const checkedCount = selectedModules === null ? 0 : sectionPaths.filter(path => selectedModules.includes(path)).length;
        const allChecked = selectedModules !== null && checkedCount === sectionPaths.length;
        const someChecked = checkedCount > 0 && !allChecked;
        return (
          <div key={section.key} style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: '12px 14px', background: '#fafafa' }}>
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingLeft: 4 }}>
              {section.paths.map(item => (
                <Checkbox
                  key={item.path}
                  checked={selectedModules !== null && selectedModules.includes(item.path)}
                  style={{ fontSize: 14, marginLeft: 0, lineHeight: 1.6 }}
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
