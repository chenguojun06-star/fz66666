import React, { useState } from 'react';
import { Button, Empty, Select } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import type { FlowPanelGroup, ModuleOption } from './flowGuideConfig';

interface FlowGuideConfigModalProps {
  onClose: () => void;
  groups: FlowPanelGroup[];
  /** 全系统可选模块（已按登录人权限过滤） */
  allModules: ModuleOption[];
  onChange: (groups: FlowPanelGroup[]) => void;
  onReset: () => void;
}

/**
 * D-530：流程引导面板的设置弹窗。
 * 每组内可删除条目、可从全系统模块中搜索添加；改动即时保存，支持一键恢复默认。
 */
const FlowGuideConfigModal: React.FC<FlowGuideConfigModalProps> = ({
  onClose, groups, allModules, onChange, onReset,
}) => {
  const [addingFor, setAddingFor] = useState<string | null>(null);

  const usedPaths = new Set(groups.flatMap((g) => g.items.map((it) => it.path)));

  const removeItem = (groupKey: string, path: string) => {
    onChange(groups.map((g) => (g.key === groupKey ? { ...g, items: g.items.filter((it) => it.path !== path) } : g)));
  };

  const addItem = (groupKey: string, path: string) => {
    const mod = allModules.find((m) => m.path === path);
    if (!mod) return;
    onChange(groups.map((g) => (g.key === groupKey
      ? { ...g, items: [...g.items, { label: mod.label, path: mod.path, desc: mod.desc }] }
      : g)));
    setAddingFor(null);
  };

  return (
    <div className="fgc-body">
      {groups.length === 0 && <Empty description="暂无分组，可点击「恢复默认」重建" />}
      <div className="fgc-grid">
        {groups.map((group) => {
          const options = allModules
            .filter((m) => !usedPaths.has(m.path))
            .map((m) => ({ value: m.path, label: `${m.sectionTitle} · ${m.label}` }));
          return (
            <div key={group.key} className="fgc-group">
              <div className="fgc-group-title">{group.title}</div>
              {group.items.length === 0 && (
                <div className="fgc-empty">暂无模块，从下方添加</div>
              )}
              {group.items.map((item) => (
                <div key={item.path} className="fgc-item">
                  <span className="fgc-item-name" title={item.desc || item.label}>{item.label}</span>
                  <Button
                    type="text"
                    size="small"
                    icon={<DeleteOutlined />}
                    onClick={() => removeItem(group.key, item.path)}
                    title="从面板移除"
                    style={{ color: 'var(--color-text-quaternary)' }}
                  />
                </div>
              ))}
              {addingFor === group.key ? (
                <Select
                  size="small"
                  showSearch
                  autoFocus
                  defaultOpen
                  placeholder="搜索全系统模块..."
                  style={{ width: '100%', marginTop: 6 }}
                  options={options}
                  filterOption={(input, opt: any) =>
                    String(opt?.label || '').toLowerCase().includes(input.toLowerCase())}
                  onChange={(value) => addItem(group.key, String(value))}
                  onBlur={() => setAddingFor(null)}
                />
              ) : (
                <Button
                  type="dashed"
                  size="small"
                  block
                  onClick={() => setAddingFor(group.key)}
                  style={{ marginTop: 6 }}
                >
                  添加模块
                </Button>
              )}
            </div>
          );
        })}
      </div>
      <div className="fgc-footer">
        <Button size="small" onClick={onReset}>恢复默认</Button>
        <Button type="primary" size="small" onClick={onClose}>完成</Button>
      </div>
    </div>
  );
};

export default FlowGuideConfigModal;
