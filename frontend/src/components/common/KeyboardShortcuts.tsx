import React, { useEffect, useState, useCallback } from 'react';
import { XOutlined, KeyOutlined, MacCommandOutlined } from '@ant-design/icons';
import { Modal } from 'antd';
import './KeyboardShortcuts.css';

const SHORTCUTS = [
  {
    category: '全局',
    shortcuts: [
      { keys: ['Cmd/Ctrl', 'K'], description: '打开全局搜索' },
      { keys: ['Cmd/Ctrl', '?'], description: '显示快捷键帮助' },
      { keys: ['Cmd/Ctrl', 'N'], description: '新建订单' },
      { keys: ['Esc'], description: '关闭弹窗/取消操作' },
    ],
  },
  {
    category: '导航',
    shortcuts: [
      { keys: ['Cmd/Ctrl', '['], description: '上一页' },
      { keys: ['Cmd/Ctrl', ']'], description: '下一页' },
      { keys: ['Cmd/Ctrl', 'Home'], description: '返回首页' },
    ],
  },
  {
    category: '编辑',
    shortcuts: [
      { keys: ['Cmd/Ctrl', 'S'], description: '保存' },
      { keys: ['Cmd/Ctrl', 'Z'], description: '撤销' },
      { keys: ['Cmd/Ctrl', 'Shift', 'Z'], description: '重做' },
      { keys: ['Cmd/Ctrl', 'F'], description: '查找' },
    ],
  },
  {
    category: '列表操作',
    shortcuts: [
      { keys: ['Enter'], description: '打开选中项详情' },
      { keys: ['Space'], description: '选中/取消选中' },
      { keys: ['Cmd/Ctrl', 'A'], description: '全选' },
      { keys: ['Del'], description: '删除选中项' },
    ],
  },
];

export function KeyboardShortcutsModal(): React.ReactElement {
  const [visible, setVisible] = useState(false);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === '?') {
      e.preventDefault();
      setVisible(true);
    }
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <Modal
      open={visible}
      onCancel={() => setVisible(false)}
      footer={null}
      width={520}
      title={
        <div className="kb-modal-title">
          <KeyOutlined className="kb-icon" />
          <span>键盘快捷键</span>
        </div>
      }
      className="kb-modal"
      maskClosable
    >
      <div className="kb-content">
        {SHORTCUTS.map(({ category, shortcuts }) => (
          <div key={category} className="kb-section">
            <h3 className="kb-section-title">{category}</h3>
            <div className="kb-shortcuts">
              {shortcuts.map(({ keys, description }, idx) => (
                <div key={idx} className="kb-row">
                  <div className="kb-keys">
                    {keys.map((key, i) => (
                      <React.Fragment key={key}>
                        {i > 0 && <span className="kb-plus">+</span>}
                        <kbd className="kb-key">
                          {key === 'Cmd/Ctrl' ? <MacCommandOutlined className="kb-cmd" /> : key}
                        </kbd>
                      </React.Fragment>
                    ))}
                  </div>
                  <span className="kb-desc">{description}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="kb-footer">
        <span className="kb-hint">按 <kbd className="kb-key">Esc</kbd> 关闭</span>
      </div>
    </Modal>
  );
}

export default KeyboardShortcutsModal;
