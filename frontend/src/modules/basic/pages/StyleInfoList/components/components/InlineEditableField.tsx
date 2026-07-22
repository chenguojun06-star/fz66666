import React, { useEffect, useRef, useState } from 'react';
import { Button, Space, Tooltip } from 'antd';
import { CloseOutlined, SaveOutlined } from '@ant-design/icons';

// 行内可编辑字段（从 SampleProcessList.tsx 拆分而来）
const InlineEditableField: React.FC<{
  label: string;
  value: string;
  editable: boolean;
  onSave: (value: string) => void;
  saving?: boolean;
}> = ({ value, editable, onSave, saving }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setDraft(value); }, [value]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const handleSave = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== value) {
      onSave(trimmed);
    }
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') { setDraft(value); setEditing(false); }
  };

  if (!editable) {
    return (
      <span style={{ fontSize: 13, lineHeight: '22px' }}>
        {value || '-'}
      </span>
    );
  }

  if (editing) {
    return (
      <Space size={4}>
        <input
          ref={inputRef as any}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => { setEditing(false); setDraft(value); }}
          disabled={saving}
          style={{
            width: 100,
            border: '1px solid var(--color-primary)',
            borderRadius: 4,
            padding: '2px 6px',
            fontSize: 13,
            outline: 'none',
          }}
        />
        <Tooltip title="确定">
          <Button size="small" type="link" icon={<SaveOutlined />} onClick={handleSave} loading={saving} style={{ padding: 0, color: 'var(--color-success)' }} />
        </Tooltip>
        <Tooltip title="取消">
          <Button size="small" type="link" icon={<CloseOutlined />} onClick={() => { setEditing(false); setDraft(value); }} style={{ padding: 0, color: '#999' }} />
        </Tooltip>
      </Space>
    );
  }

  return (
    <span
      onClick={() => setEditing(true)}
      style={{
        fontSize: 13,
        lineHeight: '22px',
        borderBottom: '1px dashed var(--color-primary)',
        cursor: 'pointer',
        padding: '2px 2px',
        transition: 'background 0.2s',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#e6f4ff'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
    >
      {value || '-'}
    </span>
  );
};

export default InlineEditableField;
