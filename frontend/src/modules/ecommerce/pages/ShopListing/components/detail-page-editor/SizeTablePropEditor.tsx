import React from 'react';
import { Button, Input, InputNumber } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import type { SizeTableElement } from './types';

/**
 * D-835：尺码表元素的属性编辑 —— 右侧面板里的紧凑格子编辑器。
 * 首列是量体部位名，其余列与表头一一对应；支持加/删行和加/删列。
 */
export interface SizeTablePropEditorProps {
  value: SizeTableElement;
  onChange: (patch: Partial<SizeTableElement>) => void;
}

const SizeTablePropEditor: React.FC<SizeTablePropEditorProps> = ({ value, onChange }) => {
  const setCell = (r: number, c: number, v: string) => {
    const rows = value.rows.map((row) => [...row]);
    while (rows[r].length < value.cols.length) rows[r].push('');
    rows[r][c] = v;
    onChange({ rows });
  };
  const setCol = (c: number, v: string) => onChange({ cols: value.cols.map((x, i) => (i === c ? v : x)) });
  const addRow = () => onChange({ rows: [...value.rows, value.cols.map(() => '')] });
  const removeRow = (r: number) =>
    onChange({ rows: value.rows.length > 1 ? value.rows.filter((_, i) => i !== r) : value.rows });
  const addCol = () => onChange({ cols: [...value.cols, ''], rows: value.rows.map((r) => [...r, '']) });
  const removeCol = (c: number) =>
    onChange({
      cols: value.cols.length > 2 ? value.cols.filter((_, i) => i !== c) : value.cols,
      rows: value.cols.length > 2 ? value.rows.map((r) => r.filter((_, i) => i !== c)) : value.rows,
    });

  return (
    <div className="dpe-prop__grid">
      <div className="dpe-prop__grid-row dpe-prop__grid-row--head">
        {value.cols.map((c, i) => (
          <div key={i} className="dpe-prop__grid-cell">
            <Input
              size="small"
              value={c}
              maxLength={8}
              onChange={(e) => setCol(i, e.target.value)}
              aria-label={`第 ${i + 1} 列名`}
            />
            <Button
              size="small"
              type="text"
              danger
              icon={<DeleteOutlined />}
              disabled={value.cols.length <= 2}
              onClick={() => removeCol(i)}
              aria-label={`删除第 ${i + 1} 列`}
            />
          </div>
        ))}
        <Button size="small" type="text" icon={<PlusOutlined />} onClick={addCol} aria-label="加一列" />
      </div>
      {value.rows.map((row, r) => (
        <div key={r} className="dpe-prop__grid-row">
          {value.cols.map((_, c) => (
            <Input
              key={c}
              size="small"
              value={row[c] ?? ''}
              maxLength={12}
              onChange={(e) => setCell(r, c, e.target.value)}
              aria-label={`第 ${r + 1} 行第 ${c + 1} 列`}
            />
          ))}
          <Button size="small" type="text" danger icon={<DeleteOutlined />} disabled={value.rows.length <= 1} onClick={() => removeRow(r)} aria-label={`删除第 ${r + 1} 行`} />
        </div>
      ))}
      <Button size="small" block icon={<PlusOutlined />} onClick={addRow} aria-label="加一行">
        加一行
      </Button>
      <InputNumber
        size="small"
        min={12}
        max={72}
        value={value.fontSize}
        onChange={(v) => onChange({ fontSize: Number(v) || 22 })}
        addonBefore="字号"
        style={{ width: '100%' }}
      />
    </div>
  );
};

export default SizeTablePropEditor;
