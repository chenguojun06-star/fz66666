import React from 'react';
import InlineEditableField from './InlineEditableField';
import { parseSizeDisplay } from '../SampleProcessList.helpers';

// 编辑模式下的"基本信息编辑条"（从 SampleProcessList.tsx 拆分而来）

export interface EditBasicInfoBarProps {
  styleNo: string;
  color: string;
  size: string;
  savingField: string | null;
  onSaveField: (field: 'styleNo' | 'color' | 'size', value: string) => void;
}

const EditBasicInfoBar: React.FC<EditBasicInfoBarProps> = ({ styleNo, color, size, savingField, onSaveField }) => {
  return (
    <div style={{
      background: 'var(--color-bg-container)',
      borderRadius: 6,
      padding: '8px 12px',
      marginBottom: 12,
      display: 'flex',
      gap: 24,
      alignItems: 'center',
      fontSize: 13,
    }}>
      <span style={{ color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap' }}>款号</span>
      <InlineEditableField
        label="款号"
        value={styleNo}
        editable
        saving={savingField === 'styleNo'}
        onSave={(v) => onSaveField('styleNo', v)}
      />
      <span style={{ color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap' }}>颜色</span>
      <InlineEditableField
        label="颜色"
        value={color}
        editable
        saving={savingField === 'color'}
        onSave={(v) => onSaveField('color', v)}
      />
      <span style={{ color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap' }}>尺码</span>
      <InlineEditableField
        label="尺码"
        value={parseSizeDisplay(size)}
        editable
        saving={savingField === 'size'}
        onSave={(v) => onSaveField('size', v)}
      />
    </div>
  );
};

export default EditBasicInfoBar;
