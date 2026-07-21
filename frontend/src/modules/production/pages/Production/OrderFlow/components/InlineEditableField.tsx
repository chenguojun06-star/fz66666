import React, { useState, useRef, useEffect } from 'react';
import { Input } from 'antd';

export const EDITABLE_FIELDS = ['styleNo', 'styleName', 'skc', 'color', 'size', 'sku'] as const;
export type EditableField = typeof EDITABLE_FIELDS[number];

export const FIELD_LABELS: Record<EditableField, string> = {
  styleNo: '款号',
  styleName: '款名',
  skc: 'SKC',
  color: '颜色',
  size: '尺码',
  sku: 'SKU',
};

interface InlineEditableFieldProps {
  label: string;
  value: string;
  editable: boolean;
  fieldKey: EditableField;
  onSave: (field: EditableField, value: string) => void;
  saving?: boolean;
  bold?: boolean;
}

const InlineEditableField: React.FC<InlineEditableFieldProps> = ({ label, value, editable, fieldKey, onSave, saving, bold }) => {
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
    if (trimmed === value.trim()) {
      setEditing(false);
      return;
    }
    onSave(fieldKey, trimmed);
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') { setDraft(value); setEditing(false); }
  };

  if (!editable) {
    return (
      <span style={{ fontSize: 14, lineHeight: '22px', fontWeight: bold ? 600 : 400 }}>
        {value || '-'}
      </span>
    );
  }

  if (editing) {
    return (
      <Input
        ref={inputRef as any}
        size="small"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        disabled={saving}
        style={{ fontSize: 14, lineHeight: '22px' }}
        onPressEnter={handleSave}
      />
    );
  }

  return (
    <span
      onClick={() => setEditing(true)}
      style={{
        fontSize: 14, lineHeight: '22px', cursor: 'pointer',
        fontWeight: bold ? 600 : 400,
        borderBottom: '1px dashed var(--color-text-quaternary)',
        padding: '0 2px',
      }}
      title="点击编辑"
    >
      {value || '-'}
    </span>
  );
};

export default InlineEditableField;
