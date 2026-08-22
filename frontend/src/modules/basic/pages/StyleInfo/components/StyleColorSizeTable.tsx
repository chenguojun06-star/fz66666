import React, { useEffect, useMemo, useRef, useState } from 'react';
import { App, Button, InputNumber, Tag, Tooltip } from 'antd';
import { ArrowDownOutlined, ArrowUpOutlined, SortAscendingOutlined } from '@ant-design/icons';
import DictAutoComplete from '@/components/common/DictAutoComplete';
import { TagMinusCloseIcon } from '@/components/common/CircleIconButton';
import ImageUploadBox from '@/components/common/ImageUploadBox';
import { getSizeWeight, sortBySize } from '@/utils/sizeOrder';

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
  hideInternalTitle?: boolean;
  hideMatrix?: boolean;
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
  editLocked, isFieldLocked,
  hideInternalTitle = false,
  hideMatrix = false
}) => {
  const { message } = App.useApp();

  const [quickColorDraft, setQuickColorDraft] = useState('');
  const [quickSizeDraft, setQuickSizeDraft] = useState('');
  // Tag 拖动排序状态（码数/颜色，拖动后同步重排矩阵列/行）
  const [dragSizeIndex, setDragSizeIndex] = useState<number | null>(null);
  const [dragOverSizeIndex, setDragOverSizeIndex] = useState<number | null>(null);
  const [dragColorIndex, setDragColorIndex] = useState<number | null>(null);
  const [dragOverColorIndex, setDragOverColorIndex] = useState<number | null>(null);

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
  // 已选颜色/码数标签：蓝色文字（浅灰看不清），淡蓝底
  const selectedTagStyle: React.CSSProperties = {
    margin: 0,
    paddingInline: 8,
    borderRadius: 999,
    color: 'var(--color-primary, #2563eb)',
    background: '#e8f2ff',
    borderColor: 'var(--color-border-antd)',
    fontWeight: 500,
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // 新增码数自动按标准尺码顺序（小→大）插入正确位置：
    // 落在第一个"更大"的码之前，不打乱用户已拖动/微调过的其他码相对顺序
    const weight = getSizeWeight(value);
    const insertAt = selectedSizes.findIndex((item) => getSizeWeight(item) > weight);
    const next = [...selectedSizes];
    if (insertAt >= 0) {
      next.splice(insertAt, 0, value);
    } else {
      next.push(value);
    }
    setSizeOptions(next);
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

  // ===== 尺码顺序调整（同步重排矩阵数量列，避免错位） =====
  const applySizeOrder = (nextSizes: string[]) => {
    setMatrixRows((prevRows: { color: string; quantities: number[]; imageUrl?: string }[]) =>
      prevRows.map((row) => ({
        ...row,
        quantities: nextSizes.map((size) => {
          const oldIndex = selectedSizes.indexOf(size);
          return oldIndex >= 0 ? Number(row.quantities?.[oldIndex] || 0) : 0;
        }),
      }))
    );
    setSizeOptions(nextSizes);
  };

  // 单个码数前移/后移（↑↓按钮）
  const moveSize = (index: number, dir: -1 | 1) => {
    if (editLocked) return;
    const target = index + dir;
    if (target < 0 || target >= selectedSizes.length) return;
    const next = [...selectedSizes];
    [next[index], next[target]] = [next[target], next[index]];
    applySizeOrder(next);
  };

  // 一键按码数从小到大排序（未识别码如 D 码排最后）
  const sortSizesByOrder = () => {
    if (editLocked) return;
    const next = sortBySize(selectedSizes, (s) => s);
    applySizeOrder(next);
    message.success('已按码数从小到大排序（未识别的码如 D 码排在最后），保存后商品编码将按此顺序生成');
  };

  // ===== 码数 Tag 拖动排序（拖动后同步重排矩阵数量列） =====
  const handleSizeDrop = (targetIndex: number) => {
    if (dragSizeIndex !== null && !editLocked && dragSizeIndex !== targetIndex) {
      const next = [...selectedSizes];
      const [moved] = next.splice(dragSizeIndex, 1);
      next.splice(targetIndex, 0, moved);
      applySizeOrder(next);
    }
    setDragSizeIndex(null);
    setDragOverSizeIndex(null);
  };

  // ===== 颜色顺序调整（同步重排矩阵行，避免行数据错位） =====
  const applyColorOrder = (nextColors: string[]) => {
    setMatrixRows((prevRows: { color: string; quantities: number[]; imageUrl?: string }[]) =>
      nextColors
        .map((color) => prevRows.find((row) => row.color === color))
        .filter((row): row is { color: string; quantities: number[]; imageUrl?: string } => Boolean(row))
    );
    setColorOptions(nextColors);
  };

  // ===== 颜色 Tag 拖动排序 =====
  const handleColorDrop = (targetIndex: number) => {
    if (dragColorIndex !== null && !editLocked && dragColorIndex !== targetIndex) {
      const next = [...selectedColors];
      const [moved] = next.splice(dragColorIndex, 1);
      next.splice(targetIndex, 0, moved);
      applyColorOrder(next);
    }
    setDragColorIndex(null);
    setDragOverColorIndex(null);
  };


  const removeColor = (color: string) => {
    if (editLocked || isFieldLocked(color)) return;
    setColorOptions(selectedColors.filter((item) => item !== color));
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
    } catch (error: unknown) {
      message.warning(error instanceof Error ? error.message : '已清空本地颜色图，但资产区同步失败');
    }
  };

  const sizeColumnTotals = selectedSizes.map((_, columnIndex) =>
    matrixRows.reduce((sum, row) => sum + Number(row.quantities[columnIndex] || 0), 0)
  );

  return (
    <div className="style-color-size-table" style={{ marginBottom: hideInternalTitle ? 0 : 12 }}>
      {!hideInternalTitle && <div style={{ marginBottom: 10, fontWeight: 600 }}>码数/颜色/数量配置</div>}

      <div style={{ display: 'grid', gap: 10 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '72px minmax(0, 1fr)', gap: 10, alignItems: 'start' }}>
          <div style={{ paddingTop: 8, color: 'var(--color-text-secondary)' }}>颜色</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {selectedColors.map((color, colorIndex) => (
              <Tag
                key={color}
                closable={!editLocked && !isFieldLocked(color)}
                closeIcon={<TagMinusCloseIcon />}
                onClose={(e) => {
                  e.preventDefault();
                  removeColor(color);
                }}
                draggable={!editLocked}
                onDragStart={() => setDragColorIndex(colorIndex)}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverColorIndex(colorIndex);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  handleColorDrop(colorIndex);
                }}
                onDragEnd={() => {
                  setDragColorIndex(null);
                  setDragOverColorIndex(null);
                }}
                style={{
                  ...selectedTagStyle,
                  cursor: !editLocked ? 'move' : undefined,
                  opacity: dragColorIndex === colorIndex ? 0.4 : 1,
                  outline:
                    dragOverColorIndex === colorIndex && dragColorIndex !== null && dragColorIndex !== colorIndex
                      ? '2px dashed var(--color-primary)'
                      : undefined,
                  outlineOffset: 1,
                }}
              >
                {color}
              </Tag>
            ))}
            {!editLocked ? (
              <DictAutoComplete
                dictType="color"

                value={quickColorDraft}
                onChange={(value) => setQuickColorDraft(String(value || ''))}
                onSelect={(value) => {
                  // 从下拉选中即新增（免按钮；手动输入则回车新增）
                  const v = String(value || '').trim();
                  if (v) addColor(v);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    addColor(quickColorDraft);
                  }
                }}
                style={{ width: 96 }}
                placeholder="选或输入后回车新增"
              />
            ) : null}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '72px minmax(0, 1fr)', gap: 10, alignItems: 'start' }}>
          <div style={{ paddingTop: 8, color: 'var(--color-text-secondary)' }}>码数</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            {selectedSizes.map((size, sizeIndex) => (
              <Tag
                key={size}
                closable={!editLocked && !isFieldLocked(size)}
                closeIcon={<TagMinusCloseIcon />}
                onClose={(e) => {
                  e.preventDefault();
                  removeSize(size);
                }}
                draggable={!editLocked}
                onDragStart={() => setDragSizeIndex(sizeIndex)}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverSizeIndex(sizeIndex);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  handleSizeDrop(sizeIndex);
                }}
                onDragEnd={() => {
                  setDragSizeIndex(null);
                  setDragOverSizeIndex(null);
                }}
                style={{
                  ...selectedTagStyle,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 2,
                  cursor: !editLocked ? 'move' : undefined,
                  opacity: dragSizeIndex === sizeIndex ? 0.4 : 1,
                  outline:
                    dragOverSizeIndex === sizeIndex && dragSizeIndex !== null && dragSizeIndex !== sizeIndex
                      ? '2px dashed var(--color-primary)'
                      : undefined,
                  outlineOffset: 1,
                }}
              >
                {!editLocked && (
                  <span style={{ display: 'inline-flex', gap: 1, marginRight: 2 }}>
                    <Tooltip title="前移（小码方向）">
                      <ArrowUpOutlined
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          moveSize(sizeIndex, -1);
                        }}
                        style={{
                          fontSize: 10,
                          color: sizeIndex === 0 ? 'var(--color-text-quaternary)' : 'var(--color-text-tertiary)',
                          cursor: sizeIndex === 0 ? 'not-allowed' : 'pointer',
                          pointerEvents: sizeIndex === 0 ? 'none' : 'auto',
                        }}
                      />
                    </Tooltip>
                    <Tooltip title="后移（大码方向）">
                      <ArrowDownOutlined
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          moveSize(sizeIndex, 1);
                        }}
                        style={{
                          fontSize: 10,
                          color: sizeIndex === selectedSizes.length - 1 ? 'var(--color-text-quaternary)' : 'var(--color-text-tertiary)',
                          cursor: sizeIndex === selectedSizes.length - 1 ? 'not-allowed' : 'pointer',
                          pointerEvents: sizeIndex === selectedSizes.length - 1 ? 'none' : 'auto',
                        }}
                      />
                    </Tooltip>
                  </span>
                )}
                {size}
              </Tag>
            ))}
            {selectedSizes.length > 1 && !editLocked && (
              <Tooltip title="按标准尺码从小到大自动排序：XXS→XS→S→M→L→XL→XXL→数字码升序；未识别的码（如 D 码）排在最后">
                <Button size="small" icon={<SortAscendingOutlined />} onClick={sortSizesByOrder}>
                  按码数排序
                </Button>
              </Tooltip>
            )}
            {!editLocked && selectedSizes.length > 0 && (
              <span style={{ fontSize: 12, color: 'var(--color-text-quaternary)', userSelect: 'none' }}>
                新增自动按小→大排位，可拖动标签调整顺序
              </span>
            )}
            {!editLocked ? (
              <DictAutoComplete
                dictType="size"

                value={quickSizeDraft}
                onChange={(value) => setQuickSizeDraft(String(value || ''))}
                onSelect={(value) => {
                  // 从下拉选中即新增（免按钮；手动输入则回车新增）
                  const v = String(value || '').trim();
                  if (v) addSize(v);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    addSize(quickSizeDraft);
                  }
                }}
                style={{ width: 96 }}
                placeholder="选或输入后回车新增"
              />
            ) : null}
          </div>
        </div>

        {!hideMatrix && (
          <>
            <div style={{ overflowX: 'auto', border: '1px solid var(--color-border)', borderRadius: 12 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
                <tbody>
                  <tr>
                    <td style={{ width: 120, padding: '8px 10px', background: 'var(--color-bg-container)', fontWeight: 600, fontSize: 14 }}>颜色 / 尺码</td>
                    {selectedSizes.map((size) => (
                      <td key={size} style={{ padding: '8px 10px', background: 'var(--color-bg-container)', textAlign: 'center', fontWeight: 600, fontSize: 14 }}>{size}</td>
                    ))}
                    <td style={{ width: 72, padding: '8px 10px', background: 'var(--color-bg-container)', textAlign: 'center', fontWeight: 600, fontSize: 14 }}>小计</td>
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
                            <div style={{ fontWeight: 600, color: 'var(--color-danger)', fontSize: 14, textAlign: 'center', maxWidth: 90, wordBreak: 'break-all' }}>{row.color}</div>
                          </div>
                        </td>
                        {selectedSizes.map((_, columnIndex) => (
                          <td key={`${row.color}-${columnIndex}`} style={{ padding: '6px 8px', borderTop: '1px solid var(--color-border)' }}>
                            <InputNumber
                              className="style-color-size-table__input"
                             
                              min={0}
                              controls={false}
                              value={Number(row.quantities[columnIndex] || 0)}
                              onChange={(value) => updateCell(rowIndex, columnIndex, Number(value || 0))}
                              style={{ width: '100%' }}
                              disabled={editLocked}
                            />
                          </td>
                        ))}
                        <td style={{ padding: '8px 10px', borderTop: '1px solid var(--color-border)', textAlign: 'center', fontWeight: 600, fontSize: 14 }}>{rowTotal}</td>
                      </tr>
                    );
                  })}
                  <tr>
                    <td style={{ padding: '8px 10px', borderTop: '1px solid var(--color-border)', background: 'rgba(37, 99, 235, 0.04)', fontWeight: 700, fontSize: 14 }}>合计</td>
                    {sizeColumnTotals.map((total, index) => (
                      <td key={index} style={{ padding: '8px 10px', borderTop: '1px solid var(--color-border)', background: 'rgba(37, 99, 235, 0.04)', textAlign: 'center', fontWeight: 700, fontSize: 14 }}>{total}</td>
                    ))}
                    <td style={{ padding: '8px 10px', borderTop: '1px solid var(--color-border)', background: 'rgba(37, 99, 235, 0.04)', textAlign: 'center', fontWeight: 700, fontSize: 14 }}>{matrixTotal}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {matrixTotal > 0 && (
              <div style={{ marginTop: 4, padding: '5px 8px', background: 'var(--color-slate-50)', border: '1px solid var(--status-processing-border)', display: 'inline-block', borderRadius: 8 }}>
                <span style={{ fontWeight: 500, color: 'var(--primary-color)' }}>总数量：</span>
                <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--primary-color)' }}>{matrixTotal}</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default StyleColorSizeTable;
