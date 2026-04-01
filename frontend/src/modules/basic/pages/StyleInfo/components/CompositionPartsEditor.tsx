import React, { useState, useCallback, useEffect } from 'react';
import { Button, Input, Select, Space, Spin, Tag } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { parseWashLabelPartsMap, parseWashNotePerPart, serializeWashLabelParts } from '@/utils/washLabel';
import { useDictOptions, autoCollectDictEntry } from '@/hooks/useDictOptions';

const DEFAULT_GARMENT_PARTS = [
  { label: '整件', value: 'GARMENT_PART_WHOLE' },
  { label: '上装', value: 'GARMENT_PART_UPPER' },
  { label: '马甲', value: 'GARMENT_PART_VEST' },
  { label: '下装', value: 'GARMENT_PART_LOWER' },
  { label: '里布', value: 'GARMENT_PART_LINING' },
  { label: '其他', value: 'GARMENT_PART_OTHER' },
];

interface Props {
  value?: string;
  onChange?: (v: string | undefined) => void;
  disabled?: boolean;
}

/**
 * 动态多部位面料成分 + 洗涤说明 编辑器（行式布局）
 * - 每行：品类标签 | 成分列表 | 洗涤说明 | 删除
 * - 部位列表从词典 garment_part 动态加载，可在系统词典管理中随时新增
 * - 支持任意件数套装：单件、两件套、三件套等
 */
export default function CompositionPartsEditor({ value, onChange, disabled }: Props) {
  const { options: dictOptions, loading: dictLoading } = useDictOptions('garment_part', DEFAULT_GARMENT_PARTS);

  const [activeParts, setActiveParts] = useState<string[]>([]);
  const [partsMap, setPartsMap] = useState<Record<string, string[]>>({});
  const [washNoteMap, setWashNoteMap] = useState<Record<string, string>>({});
  const [selectSearch, setSelectSearch] = useState('');

  useEffect(() => {
    const map = parseWashLabelPartsMap(value);
    const washNotes = parseWashNotePerPart(value);
    setPartsMap(map);
    setActiveParts(Object.keys(map));
    setWashNoteMap(washNotes);
  }, [value]);

  const emit = useCallback((
    nextMap: Record<string, string[]>,
    nextParts: string[],
    nextWashMap: Record<string, string>,
  ) => {
    setPartsMap(nextMap);
    setActiveParts(nextParts);
    setWashNoteMap(nextWashMap);
    onChange?.(serializeWashLabelParts(nextMap, nextParts, nextWashMap));
  }, [onChange]);

  const addSection = (partLabel: string) => {
    if (activeParts.includes(partLabel)) return;
    emit({ ...partsMap, [partLabel]: [''] }, [...activeParts, partLabel], washNoteMap);
    autoCollectDictEntry('garment_part', partLabel);
  };

  const removeSection = (partLabel: string) => {
    const nextParts = activeParts.filter(p => p !== partLabel);
    const nextMap = { ...partsMap };
    delete nextMap[partLabel];
    const nextWash = { ...washNoteMap };
    delete nextWash[partLabel];
    emit(nextMap, nextParts, nextWash);
  };

  const addMaterial = (partLabel: string) => {
    emit({ ...partsMap, [partLabel]: [...(partsMap[partLabel] || []), ''] }, activeParts, washNoteMap);
  };

  const updateMaterial = (partLabel: string, idx: number, text: string) => {
    const nextItems = (partsMap[partLabel] || []).map((v, i) => i === idx ? text : v);
    emit({ ...partsMap, [partLabel]: nextItems }, activeParts, washNoteMap);
  };

  const removeMaterial = (partLabel: string, idx: number) => {
    const nextItems = (partsMap[partLabel] || []).filter((_, i) => i !== idx);
    emit({ ...partsMap, [partLabel]: nextItems }, activeParts, washNoteMap);
  };

  const updateWashNote = (partLabel: string, note: string) => {
    emit(partsMap, activeParts, { ...washNoteMap, [partLabel]: note });
  };

  const unactiveParts = dictOptions.map(d => d.label).filter(label => !activeParts.includes(label));
  const hasRows = activeParts.length > 0;

  return (
    <Spin spinning={dictLoading} size="small">
      <div>
        {hasRows && (
          <>
            {/* 列头 */}
            <div style={{
              display: 'flex', gap: 8, padding: '2px 0 4px',
              borderBottom: '1px solid #f0f0f0',
              color: '#999', fontSize: 12,
            }}>
              <div style={{ width: 72, flexShrink: 0 }}>品类</div>
              <div style={{ flex: '1 1 160px' }}>成分</div>
              <div style={{ flex: '1 1 160px' }}>洗涤说明</div>
              <div style={{ width: 28, flexShrink: 0 }} />
            </div>

            {/* 数据行 */}
            {activeParts.map((partLabel) => (
              <div
                key={partLabel}
                style={{
                  display: 'flex', gap: 8, alignItems: 'flex-start',
                  padding: '8px 0', borderBottom: '1px solid #f5f5f5',
                }}
              >
                {/* 品类 */}
                <div style={{ width: 72, flexShrink: 0, paddingTop: 3 }}>
                  <Tag color="blue" style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>
                    {partLabel}
                  </Tag>
                </div>

                {/* 成分列表 */}
                <div style={{ flex: '1 1 160px' }}>
                  {(partsMap[partLabel] || []).map((mat, idx) => (
                    <Space key={idx} style={{ display: 'flex', marginBottom: 4 }} align="center">
                      <Input
                        size="small"
                        value={mat}
                        placeholder="如：70%棉 30%聚酯"
                        disabled={disabled}
                        style={{ width: 150 }}
                        onChange={e => updateMaterial(partLabel, idx, e.target.value)}
                      />
                      {!disabled && (
                        <Button
                          type="text" danger size="small" icon={<DeleteOutlined />}
                          onClick={() => removeMaterial(partLabel, idx)}
                        />
                      )}
                    </Space>
                  ))}
                  {!(partsMap[partLabel]?.length) && disabled && (
                    <span style={{ color: '#bbb', fontSize: 12 }}>（未设置）</span>
                  )}
                  {!disabled && (
                    <Button
                      type="link" size="small" icon={<PlusOutlined />}
                      onClick={() => addMaterial(partLabel)}
                      style={{ padding: 0, height: 22 }}
                    >
                      加成分
                    </Button>
                  )}
                </div>

                {/* 洗涤说明 */}
                <div style={{ flex: '1 1 160px' }}>
                  <Input.TextArea
                    rows={2}
                    size="small"
                    value={washNoteMap[partLabel] || ''}
                    placeholder="如：30°C水洗，不可漂白"
                    disabled={disabled}
                    style={{ resize: 'none' }}
                    onChange={e => updateWashNote(partLabel, e.target.value)}
                  />
                </div>

                {/* 删除整行 */}
                <div style={{ width: 28, flexShrink: 0, paddingTop: 3 }}>
                  {!disabled && (
                    <Button
                      type="text" danger size="small" icon={<DeleteOutlined />}
                      onClick={() => removeSection(partLabel)}
                    />
                  )}
                </div>
              </div>
            ))}
          </>
        )}

        {/* 添加品类 */}
        {!disabled && (
          <div style={{ marginTop: hasRows ? 8 : 0 }}>
            <Select
              size="small"
              showSearch
              placeholder="添加品类…（可直接输入新品类）"
              style={{ width: 200 }}
              value={undefined}
              searchValue={selectSearch}
              onSearch={setSelectSearch}
              filterOption={(input, option) =>
                String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
              onChange={(v: string) => {
                addSection(v);
                setSelectSearch('');
              }}
              options={[
                ...unactiveParts.map(label => ({ label, value: label })),
                ...(selectSearch.trim() && !unactiveParts.includes(selectSearch.trim()) && !activeParts.includes(selectSearch.trim())
                  ? [{ label: `创建 "${selectSearch.trim()}"`, value: selectSearch.trim() }]
                  : []),
              ]}
            />
          </div>
        )}

        {!hasRows && disabled && (
          <span style={{ color: '#bbb', fontSize: 12 }}>（未设置成分）</span>
        )}
      </div>
    </Spin>
  );
}
