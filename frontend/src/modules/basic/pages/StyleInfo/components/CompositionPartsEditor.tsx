import React, { useState, useCallback, useEffect } from 'react';
import { Button, Input, Space } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { serializeWashLabelSections, splitWashLabelSections } from '@/utils/washLabel';

type SectionKey = 'upper' | 'lower' | 'other';
type SectionState = Record<SectionKey, string[]>;

interface Props {
  value?: string;
  onChange?: (v: string | undefined) => void;
  disabled?: boolean;
}

/**
 * 多部位面料成分编辑器
 * 用于洗水唛打印：支持上装 / 下装分别维护多条成分
 * 内部存储为 JSON：[{"part":"上装","materials":"70%棉"},{"part":"上装","materials":"30%涤纶"},...]
 */
export default function CompositionPartsEditor({ value, onChange, disabled }: Props) {
  const parse = (v?: string): SectionState => splitWashLabelSections(v);

  const [sections, setSections] = useState<SectionState>(() => parse(value));

  useEffect(() => {
    setSections(parse(value));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const emit = useCallback((next: SectionState) => {
    setSections(next);
    onChange?.(serializeWashLabelSections(next));
  }, [onChange]);

  const addPart = (key: SectionKey) => emit({ ...sections, [key]: [...sections[key], ''] });

  const removePart = (key: SectionKey, index: number) => {
    emit({
      ...sections,
      [key]: sections[key].filter((_, idx) => idx !== index),
    });
  };

  const updatePart = (key: SectionKey, index: number, val: string) => {
    emit({
      ...sections,
      [key]: sections[key].map((item, idx) => (idx === index ? val : item)),
    });
  };

  const renderSection = (
    key: SectionKey,
    title: string,
    placeholder: string,
    allowCreate = true,
  ) => {
    const items = sections[key];
    if (!items.length && disabled && key === 'other') return null;

    return (
      <div
        key={key}
        style={{
          flex: 1,
          minWidth: 280,
          border: '1px solid #f0f0f0',
          borderRadius: 8,
          padding: 12,
          background: '#fafafa',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>{title}</span>
          {!disabled && allowCreate && (
            <Button type="text" size="small" icon={<PlusOutlined />} onClick={() => addPart(key)}>
              添加成分
            </Button>
          )}
        </div>

        {items.map((item, index) => (
          <Space key={`${key}-${index}`} align="start" style={{ display: 'flex', marginBottom: 8 }}>
            <Input
              value={item}
              placeholder={placeholder}
              disabled={disabled}
              onChange={e => updatePart(key, index, e.target.value)}
            />
            {!disabled && (
              <Button
                type="text"
                danger
                size="small"
                icon={<DeleteOutlined />}
                onClick={() => removePart(key, index)}
              />
            )}
          </Space>
        ))}

        {!items.length && (
          <span style={{ color: '#bbb', fontSize: 12 }}>
            {disabled ? '（未设置）' : '点击右上角加号添加成分'}
          </span>
        )}
      </div>
    );
  };

  const hasAnyValue = sections.upper.length || sections.lower.length || sections.other.length;

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {renderSection('upper', '上装', '如：70%棉')}
        {renderSection('lower', '下装', '如：100%聚酯纤维')}
        {sections.other.length > 0 && renderSection('other', '其他部位', '如：里布 100%涤纶', false)}
      </div>
      {!hasAnyValue && disabled && (
        <span style={{ color: '#bbb', fontSize: 12 }}>（未设置上装 / 下装成分）</span>
      )}
    </div>
  );
}
