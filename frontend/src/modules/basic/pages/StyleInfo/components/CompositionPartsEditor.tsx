import React, { useState, useCallback, useEffect } from 'react';
import { Button, Input, Space } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';

interface Part {
  part: string;
  materials: string;
}

interface Props {
  value?: string;
  onChange?: (v: string | undefined) => void;
  disabled?: boolean;
}

/**
 * 多部位面料成分编辑器
 * 用于洗水唛打印：支持两件套/拼接款分部位标注成分
 * 内部存储为 JSON：[{"part":"Lower","materials":"91.00% Polyester\n9.00% Spandex"},...]
 */
export default function CompositionPartsEditor({ value, onChange, disabled }: Props) {
  const parse = (v?: string): Part[] => {
    if (!v) return [];
    try { return JSON.parse(v); } catch { return []; }
  };

  const [parts, setParts] = useState<Part[]>(() => parse(value));

  useEffect(() => {
    setParts(parse(value));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const emit = useCallback((next: Part[]) => {
    setParts(next);
    onChange?.(next.length ? JSON.stringify(next) : undefined);
  }, [onChange]);

  const addPart    = () => emit([...parts, { part: '', materials: '' }]);
  const removePart = (i: number) => emit(parts.filter((_, idx) => idx !== i));
  const update     = (i: number, key: keyof Part, val: string) =>
    emit(parts.map((p, idx) => (idx === i ? { ...p, [key]: val } : p)));

  return (
    <div>
      {parts.map((p, i) => (
        <Space key={i} align="start" style={{ display: 'flex', marginBottom: 6 }}>
          <Input
            style={{ width: 84 }}
            placeholder="部位名"
            value={p.part}
            disabled={disabled}
            onChange={e => update(i, 'part', e.target.value)}
          />
          <Input.TextArea
            style={{ width: 220 }}
            rows={2}
            placeholder={'如：91.00% Polyester\n9.00% Spandex'}
            value={p.materials}
            disabled={disabled}
            onChange={e => update(i, 'materials', e.target.value)}
          />
          {!disabled && (
            <Button
              type="text"
              danger
              size="small"
              icon={<DeleteOutlined />}
              onClick={() => removePart(i)}
            />
          )}
        </Space>
      ))}
      {!disabled && (
        <Button
          type="dashed"
          size="small"
          icon={<PlusOutlined />}
          onClick={addPart}
          style={{ marginTop: parts.length ? 0 : 0 }}
        >
          添加部位
        </Button>
      )}
      {parts.length === 0 && disabled && (
        <span style={{ color: '#bbb', fontSize: 12 }}>（未设置多部位成分）</span>
      )}
    </div>
  );
}
