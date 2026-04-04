import React, { useEffect, useMemo, useRef, useState } from 'react';
import { App, Button, Input, InputNumber, Space, Tag } from 'antd';
import DictAutoComplete from '@/components/common/DictAutoComplete';
import ImageUploadBox from '@/components/common/ImageUploadBox';
import { autoCollectDictEntry } from '@/hooks/useDictOptions';

interface StyleColorSizeTableProps {
  // 码数状态
  size1: string;
  size2: string;
  size3: string;
  size4: string;
  size5: string;
  setSize1: (value: string) => void;
  setSize2: (value: string) => void;
  setSize3: (value: string) => void;
  setSize4: (value: string) => void;
  setSize5: (value: string) => void;

  // 颜色状态
  color1: string;
  color2: string;
  color3: string;
  color4: string;
  color5: string;
  setColor1: (value: string) => void;
  setColor2: (value: string) => void;
  setColor3: (value: string) => void;
  setColor4: (value: string) => void;
  setColor5: (value: string) => void;

  // 数量状态
  qty1: number;
  qty2: number;
  qty3: number;
  qty4: number;
  qty5: number;
  setQty1: (value: number) => void;
  setQty2: (value: number) => void;
  setQty3: (value: number) => void;
  setQty4: (value: number) => void;
  setQty5: (value: number) => void;
  sizeOptions: string[];
  setSizeOptions: (values: string[]) => void;
  colorOptions: string[];
  setColorOptions: (values: string[]) => void;
  matrixRows: Array<{ color: string; quantities: number[]; imageUrl?: string }>;
  setMatrixRows: (rows: Array<{ color: string; quantities: number[]; imageUrl?: string }> | ((prev: Array<{ color: string; quantities: number[]; imageUrl?: string }>) => Array<{ color: string; quantities: number[]; imageUrl?: string }>)) => void;
  onImageSync?: (color: string, file: File) => Promise<void> | void;
  onImageClear?: (color: string) => Promise<void> | void;

  // 常用选项
  commonSizes: string[];
  commonColors: string[];
  setCommonSizes: (sizes: string[]) => void;
  setCommonColors: (colors: string[]) => void;

  // 锁定状态
  editLocked: boolean;
  isFieldLocked: (fieldValue: any) => boolean;
}

/**
 * 颜色码数配置表组件
 * 5行表格 + 快捷标签选择
 */
const StyleColorSizeTable: React.FC<StyleColorSizeTableProps> = ({
  size1: _size1, size2: _size2, size3: _size3, size4: _size4, size5: _size5,
  setSize1: _setSize1, setSize2: _setSize2, setSize3: _setSize3, setSize4: _setSize4, setSize5: _setSize5,
  color1: _color1, color2: _color2, color3: _color3, color4: _color4, color5: _color5,
  setColor1: _setColor1, setColor2: _setColor2, setColor3: _setColor3, setColor4: _setColor4, setColor5: _setColor5,
  qty1: _qty1, qty2: _qty2, qty3: _qty3, qty4: _qty4, qty5: _qty5,
  setQty1, setQty2, setQty3, setQty4, setQty5,
  sizeOptions, setSizeOptions, colorOptions, setColorOptions,
  matrixRows, setMatrixRows,
  onImageSync,
  onImageClear,
  commonSizes, commonColors,
  setCommonSizes, setCommonColors,
  editLocked, isFieldLocked
}) => {
  const { message } = App.useApp();

  const [showColorInput, setShowColorInput] = useState(false);
  const [showSizeInput, setShowSizeInput] = useState(false);
  const [quickColorDraft, setQuickColorDraft] = useState('');
  const [quickSizeDraft, setQuickSizeDraft] = useState('');
  const [newColor, setNewColor] = useState('');
  const [newSize, setNewSize] = useState('');

  const selectedSizes = useMemo(
    () => sizeOptions.map((item) => String(item || '').trim()).filter(Boolean),
    [sizeOptions]
  );
  const selectedColors = useMemo(
    () => colorOptions.map((item) => String(item || '').trim()).filter(Boolean),
    [colorOptions]
  );

  const matrixTotal = useMemo(
    () => matrixRows.reduce((sum, row) => sum + row.quantities.reduce((subtotal, qty) => subtotal + Number(qty || 0), 0), 0),
    [matrixRows]
  );
  const selectedTagStyle: React.CSSProperties = {
    margin: 0,
    paddingInline: 8,
    borderRadius: 999,
    color: '#8c8c8c',
    background: '#f5f5f5',
    borderColor: '#d9d9d9',
  };

  const prevColorsRef = useRef<string[]>(selectedColors);
  const prevSizesRef = useRef<string[]>(selectedSizes);

  useEffect(() => {
    const colorsChanged = JSON.stringify(prevColorsRef.current) !== JSON.stringify(selectedColors);
    const sizesChanged = JSON.stringify(prevSizesRef.current) !== JSON.stringify(selectedSizes);

    prevColorsRef.current = selectedColors;
    prevSizesRef.current = selectedSizes;

    if (!selectedColors.length || !selectedSizes.length) {
      setMatrixRows([]);
      return;
    }

    if (!colorsChanged && !sizesChanged) {
      return;
    }

    // 使用函数式更新，确保使用最新的 matrixRows 值
    setMatrixRows((prevRows: { color: string; quantities: number[]; imageUrl?: string }[]) => {
      return selectedColors.map((color) => {
        const matched = prevRows.find((row) => row.color === color);
        return {
          color,
          quantities: selectedSizes.map((_, index) => Number(matched?.quantities?.[index] || 0)),
          imageUrl: matched?.imageUrl,
        };
      });
    });
  }, [selectedColors, selectedSizes]);

  useEffect(() => {
    const rowTotals = matrixRows.map((row) => row.quantities.reduce((sum, qty) => sum + Number(qty || 0), 0));
    setQty1(rowTotals[0] || 0);
    setQty2(rowTotals[1] || 0);
    setQty3(rowTotals[2] || 0);
    setQty4(rowTotals[3] || 0);
    setQty5(rowTotals[4] || 0);
  }, [matrixRows, setQty1, setQty2, setQty3, setQty4, setQty5]);

  const addSize = (size: string) => {
    if (editLocked) return;
    const value = String(size || '').trim();
    if (!value) return;
    if (selectedSizes.includes(value)) {
      setQuickSizeDraft('');
      return;
    }
    setSizeOptions([...selectedSizes, value]);
    setQuickSizeDraft('');
  };

  const addColor = (color: string) => {
    if (editLocked) return;
    const value = String(color || '').trim();
    if (!value) return;
    if (selectedColors.includes(value)) {
      setQuickColorDraft('');
      return;
    }
    setColorOptions([...selectedColors, value]);
    setQuickColorDraft('');
  };

  const removeSize = (size: string) => {
    if (editLocked || isFieldLocked(size)) return;
    setSizeOptions(selectedSizes.filter((item) => item !== size));
  };

  const removeColor = (color: string) => {
    if (editLocked || isFieldLocked(color)) return;
    setColorOptions(selectedColors.filter((item) => item !== color));
  };

  const handleAddNewSize = () => {
    const value = newSize.trim();
    if (!value) return;
    if (!commonSizes.includes(value)) {
      setCommonSizes([...commonSizes, value]);
    }
    if (!selectedSizes.includes(value)) {
      setSizeOptions([...selectedSizes, value]);
    }
    autoCollectDictEntry('size', value);
    setNewSize('');
    setShowSizeInput(false);
  };

  const handleAddNewColor = () => {
    const value = newColor.trim();
    if (!value) return;
    if (!commonColors.includes(value)) {
      setCommonColors([...commonColors, value]);
    }
    if (!selectedColors.includes(value)) {
      setColorOptions([...selectedColors, value]);
    }
    autoCollectDictEntry('color', value);
    setNewColor('');
    setShowColorInput(false);
  };

  const updateCell = (rowIndex: number, columnIndex: number, value: number) => {
    const nextRows = matrixRows.map((row, index) => (
      index === rowIndex
        ? {
            ...row,
            quantities: row.quantities.map((qty, qtyIndex) => (qtyIndex === columnIndex ? Number(value || 0) : Number(qty || 0))),
          }
        : row
    ));
    setMatrixRows(nextRows);
  };

  const clearRowImage = async (rowIndex: number) => {
    const color = matrixRows[rowIndex]?.color || '';
    setMatrixRows(matrixRows.map((row, index) => (index === rowIndex ? { ...row, imageUrl: undefined } : row)));
    try {
      await onImageClear?.(color);
    } catch (error: any) {
      message.warning(error?.message || '已清空本地颜色图，但资产区同步失败');
    }
  };

  const sizeColumnTotals = selectedSizes.map((_, columnIndex) =>
    matrixRows.reduce((sum, row) => sum + Number(row.quantities[columnIndex] || 0), 0)
  );

  return (
    <div className="style-color-size-table" style={{ marginBottom: 12 }}>
      <div style={{ marginBottom: 10, fontWeight: 600 }}>码数/颜色/数量配置</div>

      <div style={{ display: 'grid', gap: 10 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '72px minmax(0, 1fr)', gap: 10, alignItems: 'start' }}>
          <div style={{ paddingTop: 8, color: 'var(--color-text-secondary)' }}>颜色</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {selectedColors.map((color) => (
              <Tag
                key={color}
                closable={!editLocked && !isFieldLocked(color)}
                onClose={(e) => {
                  e.preventDefault();
                  removeColor(color);
                }}
                style={selectedTagStyle}
              >
                {color}
              </Tag>
            ))}
            {!editLocked ? (
              <Space.Compact size="small">
                <DictAutoComplete
                  dictType="color"
                  size="small"
                  value={quickColorDraft}
                  onChange={(value) => setQuickColorDraft(String(value || ''))}
                  onSelect={(value) => setQuickColorDraft(String(value || ''))}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      addColor(quickColorDraft);
                    }
                  }}
                  style={{ width: 96 }}
                  placeholder="新增颜色"
                />
                <Button size="small" onClick={() => addColor(quickColorDraft)}>
                  确定
                </Button>
              </Space.Compact>
            ) : null}
            {!editLocked && (
              !showColorInput ? (
                <Button size="small" type="text" style={{ color: '#8c8c8c' }} onClick={() => setShowColorInput(true)}>
                  新增颜色
                </Button>
              ) : (
                <Space.Compact size="small">
                  <Input size="small" placeholder="新颜色" value={newColor} onChange={(e) => setNewColor(e.target.value)} onPressEnter={handleAddNewColor} style={{ width: 88 }} />
                  <Button size="small" type="primary" onClick={handleAddNewColor}></Button>
                  <Button size="small" onClick={() => { setNewColor(''); setShowColorInput(false); }}></Button>
                </Space.Compact>
              )
            )}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '72px minmax(0, 1fr)', gap: 10, alignItems: 'start' }}>
          <div style={{ paddingTop: 8, color: 'var(--color-text-secondary)' }}>码数</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {selectedSizes.map((size) => (
              <Tag
                key={size}
                closable={!editLocked && !isFieldLocked(size)}
                onClose={(e) => {
                  e.preventDefault();
                  removeSize(size);
                }}
                style={selectedTagStyle}
              >
                {size}
              </Tag>
            ))}
            {!editLocked ? (
              <Space.Compact size="small">
                <DictAutoComplete
                  dictType="size"
                  size="small"
                  value={quickSizeDraft}
                  onChange={(value) => setQuickSizeDraft(String(value || ''))}
                  onSelect={(value) => setQuickSizeDraft(String(value || ''))}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      addSize(quickSizeDraft);
                    }
                  }}
                  style={{ width: 96 }}
                  placeholder="新增码数"
                />
                <Button size="small" onClick={() => addSize(quickSizeDraft)}>
                  确定
                </Button>
              </Space.Compact>
            ) : null}
            {!editLocked && (
              !showSizeInput ? (
                <Button size="small" type="text" style={{ color: '#8c8c8c' }} onClick={() => setShowSizeInput(true)}>
                  新增码数
                </Button>
              ) : (
                <Space.Compact size="small">
                  <Input size="small" placeholder="新码数" value={newSize} onChange={(e) => setNewSize(e.target.value)} onPressEnter={handleAddNewSize} style={{ width: 88 }} />
                  <Button size="small" type="primary" onClick={handleAddNewSize}></Button>
                  <Button size="small" onClick={() => { setNewSize(''); setShowSizeInput(false); }}></Button>
                </Space.Compact>
              )
            )}
          </div>
        </div>

        <div style={{ overflowX: 'auto', border: '1px solid var(--color-border)', borderRadius: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
            <tbody>
              <tr>
                <td style={{ width: 120, padding: '8px 10px', background: 'var(--color-bg-container)', fontWeight: 600, fontSize: 12 }}>颜色 / 尺码</td>
                {selectedSizes.map((size) => (
                  <td key={size} style={{ padding: '8px 10px', background: 'var(--color-bg-container)', textAlign: 'center', fontWeight: 600, fontSize: 12 }}>{size}</td>
                ))}
                <td style={{ width: 72, padding: '8px 10px', background: 'var(--color-bg-container)', textAlign: 'center', fontWeight: 600, fontSize: 12 }}>小计</td>
              </tr>
              {matrixRows.map((row, rowIndex) => {
                const rowTotal = row.quantities.reduce((sum, qty) => sum + Number(qty || 0), 0);
                return (
                  <tr key={row.color || rowIndex}>
                    <td style={{ padding: '8px 10px', borderTop: '1px solid var(--color-border)' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                        <ImageUploadBox
                          size={80}
                          enableDrop
                          maxSizeMB={0}
                          value={row.imageUrl ?? null}
                          disabled={editLocked}
                          uploadFn={async (file) => {
                            if (!file.type.startsWith('image/')) throw new Error('请上传图片文件');
                            if (file.size > 10 * 1024 * 1024) throw new Error('单张颜色图最大 10MB');
                            const dataUrl = await new Promise<string>((resolve, reject) => {
                              const reader = new FileReader();
                              reader.onload = () => resolve(String(reader.result || ''));
                              reader.onerror = reject;
                              reader.readAsDataURL(file);
                            });
                            void Promise.resolve(onImageSync?.(row.color, file)).catch((err: any) => {
                              message.warning(err?.message || '颜色图片已预览，但联动封面图失败');
                            });
                            return dataUrl;
                          }}
                          onChange={(url) => {
                            if (url) {
                              setMatrixRows((prev) => prev.map((r, i) => i === rowIndex ? { ...r, imageUrl: url } : r));
                            } else {
                              void clearRowImage(rowIndex);
                            }
                          }}
                        />
                        <div style={{ fontWeight: 600, color: '#ef4444', fontSize: 11, textAlign: 'center', maxWidth: 90, wordBreak: 'break-all' }}>{row.color}</div>
                      </div>
                    </td>
                    {selectedSizes.map((_, columnIndex) => (
                      <td key={`${row.color}-${columnIndex}`} style={{ padding: '6px 8px', borderTop: '1px solid var(--color-border)' }}>
                        <InputNumber
                          className="style-color-size-table__input"
                          size="small"
                          min={0}
                          controls={false}
                          value={Number(row.quantities[columnIndex] || 0)}
                          onChange={(value) => updateCell(rowIndex, columnIndex, Number(value || 0))}
                          style={{ width: '100%' }}
                          disabled={editLocked}
                        />
                      </td>
                    ))}
                    <td style={{ padding: '8px 10px', borderTop: '1px solid var(--color-border)', textAlign: 'center', fontWeight: 600, fontSize: 12 }}>{rowTotal}</td>
                  </tr>
                );
              })}
              <tr>
                <td style={{ padding: '8px 10px', borderTop: '1px solid var(--color-border)', background: 'rgba(37, 99, 235, 0.04)', fontWeight: 700, fontSize: 12 }}>合计</td>
                {sizeColumnTotals.map((total, index) => (
                  <td key={index} style={{ padding: '8px 10px', borderTop: '1px solid var(--color-border)', background: 'rgba(37, 99, 235, 0.04)', textAlign: 'center', fontWeight: 700, fontSize: 12 }}>{total}</td>
                ))}
                <td style={{ padding: '8px 10px', borderTop: '1px solid var(--color-border)', background: 'rgba(37, 99, 235, 0.04)', textAlign: 'center', fontWeight: 700, fontSize: 12 }}>{matrixTotal}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {matrixTotal > 0 && (
          <div style={{ marginTop: 4, padding: '5px 8px', background: '#f0f9ff', border: '1px solid #91d5ff', display: 'inline-block', borderRadius: 8 }}>
            <span style={{ fontWeight: 500, color: 'var(--primary-color)' }}>总数量：</span>
            <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--primary-color)' }}>{matrixTotal}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default StyleColorSizeTable;
