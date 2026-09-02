import { useMemo } from 'react';
import { Button, Input, Select, Modal, Image, Tooltip } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import api, { toNumberSafe } from '@/utils/api';
import { MatrixRow, DisplayRow, normalizeGradingZones } from './styleSizeTabUtils';
import { shortSizeLabel } from './styleSize/shared';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import RowActions from '@/components/common/RowActions';
import ExcelPasteInput from '@/components/common/ExcelPasteInput';

interface UseStyleSizeColumnsParams {
  editMode: boolean;
  readOnly?: boolean;
  sizeColumns: string[];
  displayRows: DisplayRow[];
  groupNameOptions: { label: string; value: string }[];
  rows: MatrixRow[];
  message: { error: (msg: string) => void };
  updatePartName: (key: string, value: string) => void;
  updateChunkGroupName: (keys: string[], value: string) => void;
  updateMeasureMethod: (key: string, value: string) => void;
  updateTolerance: (key: string, value: string) => void;
  updateBaseSize: (key: string, value: string) => void;
  updateCellValue: (key: string, sizeName: string, value: number) => void;
  setChunkImageUrls: (keys: string[], urls: string[]) => void;
  handleAddPartInGroup: (groupName: string) => void;
  handleDeletePart: (record: MatrixRow) => void;
  handleDeleteSize: (sizeName: string) => void;
  openGradingConfig: (record: MatrixRow) => void;
  onPasteToRow: (rowKey: string, startSizeIndex: number, values: number[]) => void;
  onDuplicateRow: (rowKey: string) => void;
}

/**
 * 公差输入规范化：± 由输入框 addonBefore 统一展示，
 * 剥离用户手输的 ± 前缀，避免存成 "±±1" 这类脏数据。
 */
function normalizeToleranceInput(raw: string): string {
  return String(raw || '').trim().replace(/^±\s*/, '');
}

export function useStyleSizeColumns({
  editMode,
  readOnly,
  sizeColumns,
  displayRows,
  groupNameOptions,
  rows,
  message,
  updatePartName,
  updateChunkGroupName,
  updateMeasureMethod,
  updateTolerance,
  updateBaseSize,
  updateCellValue,
  setChunkImageUrls,
  handleAddPartInGroup,
  handleDeletePart,
  handleDeleteSize,
  openGradingConfig,
  onPasteToRow,
  onDuplicateRow,
}: UseStyleSizeColumnsParams) {
  return useMemo(() => {
    const editableMode = editMode && !readOnly;

    const doUploadImage = async (file: File, chunkRowKeys: string[], imgs: string[]) => {
      const formData = new FormData();
      formData.append('file', file);
      try {
        const res: any = await (api as any).post('/common/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
        if (res?.code === 200 && res?.data) {
          setChunkImageUrls(chunkRowKeys, [...imgs, String(res.data)].slice(0, 2));
        } else {
          message.error('图片上传失败');
        }
      } catch {
        message.error('图片上传失败');
      }
    };

    const left = [
      {
        title: '参考图',
        key: 'groupImage',
        dataIndex: '__groupImage',
        width: 100,
        onCell: (record: DisplayRow) => {
          return {
            rowSpan: record.isImageChunkStart ? record.imageChunkSpan : 0,
            style: { verticalAlign: 'top' as const },
          };
        },
        render: (_: any, record: DisplayRow) => {
          if (!record.isImageChunkStart) return null;
          const imgs = record.chunkImageUrls || [];
          const blockHeight = imgs.length > 1 ? 108 : 220;
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'stretch', justifyContent: 'flex-start', width: '100%', minHeight: 240, padding: '8px 0' }}>
              <Image.PreviewGroup>
                {imgs.map((url, i) => (
                  <div key={url} style={{ position: 'relative', width: '100%' }}>
                    <Image
                      src={getFullAuthedFileUrl(url)}
                      width="100%"
                      height={blockHeight}
                      style={{ objectFit: 'contain', borderRadius: 8, border: '1px solid var(--color-border-light)', background: 'var(--color-bg-base)', padding: 6 }}
                      preview={{ src: getFullAuthedFileUrl(url) }}
                    />
                    {editableMode && (
                      <DeleteOutlined
                        onClick={() => setChunkImageUrls(record.chunkRowKeys, imgs.filter((_, ii) => ii !== i))}
                        style={{ position: 'absolute', top: -4, right: -4, background: 'rgba(0,0,0,0.55)', color: 'var(--color-bg-base)', borderRadius: '50%', padding: 2, fontSize: 14, cursor: 'pointer' }}
                      />
                    )}
                  </div>
                ))}
              </Image.PreviewGroup>
              {editableMode && imgs.length < 2 && (
                <span
                  onDragOver={(e) => { e.preventDefault(); }}
                  onDrop={(e) => {
                    e.preventDefault();
                    Array.from(e.dataTransfer.files || []).forEach((f) => {
                      if (f.type.startsWith('image/')) doUploadImage(f, record.chunkRowKeys, imgs);
                    });
                  }}
                  onPaste={(e) => {
                    const files = e.clipboardData.files;
                    if (files?.length) {
                      e.preventDefault();
                      Array.from(files).forEach((f) => {
                        if (f.type.startsWith('image/')) doUploadImage(f, record.chunkRowKeys, imgs);
                      });
                      return;
                    }
                    const items = e.clipboardData.items;
                    for (let i = 0; i < items.length; i++) {
                      if (items[i].type.startsWith('image/')) {
                        e.preventDefault();
                        const f = items[i].getAsFile();
                        if (f) doUploadImage(f, record.chunkRowKeys, imgs);
                        break;
                      }
                    }
                  }}
                  style={{ display: 'inline-block', width: '100%' }}
                >
                  <Button icon={<PlusOutlined />} style={{ width: '100%', height: imgs.length > 0 ? 84 : 220, borderRadius: 8, borderStyle: 'dashed' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.accept = 'image/*';
                      input.onchange = (ev) => {
                        const f = (ev.target as HTMLInputElement).files?.[0];
                        if (f) doUploadImage(f, record.chunkRowKeys, imgs);
                      };
                      input.click();
                    }}
                  />
                </span>
              )}
            </div>
          );
        },
      },
      {
        title: '分组',
        dataIndex: 'groupName',
        width: 50,
        onCell: (record: DisplayRow) => {
          return {
            rowSpan: record.isGroupChunkStart ? record.groupChunkSpan : 0,
            style: { verticalAlign: 'top' as const },
          };
        },
        render: (_: any, record: DisplayRow) => {
          if (!record.isGroupChunkStart) return null;

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'stretch', padding: '8px 0' }}>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignSelf: 'stretch',
                  gap: 2,
                  padding: '10px 12px',
                  borderRadius: 12,
                  background: record.groupToneMeta.tagBg,
                  color: record.groupToneMeta.tagColor,
                  boxShadow: `inset 0 0 0 1px ${record.groupToneMeta.tagColor}22`,
                }}
              >
                <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 700, lineHeight: 1.5 }}>
                  {record.resolvedGroupName}
                </span>
              </div>
              {editableMode ? (
                <Select
                  value={String(record.groupName || record.resolvedGroupName || '其他区')}
                  placeholder="选择分组"
                  style={{ width: '100%' }}
                  options={groupNameOptions}
                  onChange={(value) => updateChunkGroupName(record.chunkRowKeys, String(value || '其他区'))}
                />
              ) : null}
              {editableMode && (
                <Button
                 
                  icon={<PlusOutlined />}
                  type="dashed"
                  style={{ width: '100%', marginTop: 8 }}
                  onClick={() => handleAddPartInGroup(record.resolvedGroupName)}
                >
                  添加行
                </Button>
              )}
            </div>
          );
        },
      },
      {
        title: '部位',
        dataIndex: 'partName',
        // 100 在编辑时仍看不全"插肩袖长"这类输入，加宽到 160（表格横滑，不挤压码数列）
        width: 160,
        render: (_: any, record: DisplayRow) =>
          editableMode ? (
            <Input value={record.partName} placeholder="如：胸围" onChange={(e) => updatePartName(record.key, e.target.value)} />
          ) : (
            record.partName
          ),
      },
      {
        title: '度量方式',
        dataIndex: 'measureMethod',
        // 与部位列一档加宽，编辑时输入内容可见
        width: 120,
        render: (_: any, record: MatrixRow) =>
          editableMode ? (
            <Input value={record.measureMethod} placeholder="如：平量" onChange={(e) => updateMeasureMethod(record.key, e.target.value)} />
          ) : (
            record.measureMethod
          ),
      },
      {
        title: '样版码',
        dataIndex: 'baseSize',
        width: 40,
        align: 'center' as const,
        // D-252：与列头口径一致，只显示码数简称，完整名悬浮可见（列宽仅 40，放不下全名）
        render: (_: any, record: MatrixRow) =>
          editableMode ? (
            <Select
              value={record.baseSize || undefined}
              allowClear
              style={{ width: '100%' }}
              options={sizeColumns.map((size) => ({ value: size, label: shortSizeLabel(size) }))}
              onChange={(value) => updateBaseSize(record.key, String(value || ''))}
            />
          ) : (
            <Tooltip title={record.baseSize || undefined}>
              <span>{record.baseSize ? shortSizeLabel(record.baseSize) : '-'}</span>
            </Tooltip>
          ),
      },
      {
        title: '跳码区',
        dataIndex: 'gradingZones',
        width: 120,
        render: (_: any, record: MatrixRow) => {
          const zones = normalizeGradingZones(record.gradingZones || [], sizeColumns);
          // D-252：同一份逻辑生成两种文案，避免摘要与明细不一致。
          // withSizes=false → 精简摘要「前↓1 后↑1」，用于单元格（此前把每个码的全名
          //   都拼进来，如 `前:XS(155/72A)/S(160/76A)↓1 后:L(170/84A)/...↑1`，一行塞不下）
          // withSizes=true → 带具体码数的完整明细，用于 Tooltip，保证信息不丢失
          const buildZoneText = (withSizes: boolean) => zones.map((zone) => {
            const frontInfo = (zone.frontSizes ?? []).length > 0
              ? `前${withSizes ? `:${(zone.frontSizes ?? []).map(shortSizeLabel).join('/')}` : ''}↓${toNumberSafe(zone.frontStep)}`
              : '';
            const backInfo = (zone.backSizes ?? []).length > 0
              ? `后${withSizes ? `:${(zone.backSizes ?? []).map(shortSizeLabel).join('/')}` : ''}↑${toNumberSafe(zone.backStep)}`
              : '';
            const extraInfo = (zone.sizeStepColumns || []).map((col, idx) => {
              if ((col.sizes || []).length === 0) return '';
              return `列${idx + 1}${withSizes ? `:${col.sizes.map(shortSizeLabel).join('/')}` : ''}→${toNumberSafe(col.step)}`;
            }).filter(Boolean).join(' ');
            return `${zone.label}(${[frontInfo, backInfo, extraInfo].filter(Boolean).join(' ')})`;
          }).join('；');
          const summary = buildZoneText(false);
          const detail = buildZoneText(true);
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Tooltip title={detail || undefined}>
                <div style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--color-slate-700)', whiteSpace: 'pre-wrap', cursor: detail ? 'help' : 'default' }}>{summary || '-'}</div>
              </Tooltip>
              {editableMode ? (
                <Button onClick={() => openGradingConfig(record)}>
                  配置跳码区
                </Button>
              ) : null}
            </div>
          );
        },
      },
    ];

    const sizeCols = sizeColumns.map((sn, sizeIndex) => ({
      title: (
        // D-252：列头只显示码数简称（XS / S / D），完整名（XS(155/72A)）悬浮可见。
        // 此前列头直接用完整码数名，多个码并列时列被撑爆。
        <Tooltip title={sn}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontWeight: 600 }}>{shortSizeLabel(sn)}</span>
            {editableMode ? (
              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
                title={`删除尺码 ${sn}`}
                onClick={() => {
                  Modal.confirm({
                    width: '30vw',
                    title: `确定删除尺码"${sn}"？`,
                    onOk: () => handleDeleteSize(sn),
                  });
                }}
              />
            ) : null}
          </span>
        </Tooltip>
      ),
      dataIndex: sn,
      width: 60,
      align: 'center' as const,
      render: (_: any, record: MatrixRow) => {
        const v = record.cells[sn]?.value;
        return editableMode ? (
          <ExcelPasteInput
            value={v}
            min={0}
            step={0.1}
            onChange={(val) => updateCellValue(record.key, sn, toNumberSafe(val))}
            onPasteMultiValues={(values) => {
              onPasteToRow(record.key, sizeIndex, values);
              return true;
            }}
          />
        ) : (
          v
        );
      },
    }));

    const right = [
      {
        // D-261：列名「公差」→「正负公差」并加宽一倍；输入框前置 ± 号。
        // 存储仍是纯数值（如 "1"），± 只作为展示符号，避免与历史数据耦合。
        title: '正负公差',
        dataIndex: 'tolerance',
        width: 110,
        align: 'center' as const,
        render: (_: any, record: MatrixRow) =>
          editableMode ? (
            <Input
              value={String(record.tolerance ?? '')}
              addonBefore="±"
              placeholder="如：1"
              style={{ width: '100%' }}
              onChange={(e) => updateTolerance(record.key, normalizeToleranceInput(e.target.value))}
            />
          ) : (
            // 只读态同样补 ±，与列名语义一致
            record.tolerance ? `±${normalizeToleranceInput(String(record.tolerance))}` : record.tolerance
          ),
      },
      {
        title: '操作',
        key: 'operation',
        width: 120,
        resizable: false,
        render: (_: any, record: MatrixRow) =>
          editableMode ? (
            <RowActions
              maxInline={2}
              actions={[
                {
                  key: 'duplicate',
                  label: '复制',
                  title: '复制此行',
                  onClick: () => onDuplicateRow(record.key),
                },
                {
                  key: 'delete',
                  label: '删除',
                  title: '删除',
                  danger: true,
                  onClick: () => {
                    Modal.confirm({
                      width: '30vw',
                      title: '确定删除该部位？',
                      onOk: () => handleDeletePart(record),
                    });
                  },
                },
              ]}
            />
          ) : null,
      },
    ];

    // readOnly/只读模式下隐藏操作列（无任何可操作按钮，空列无意义）
    const filteredRight = editableMode ? right : right.filter(col => col.key !== 'operation');
    return [...left, ...sizeCols, ...filteredRight];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editMode, readOnly, sizeColumns, displayRows, groupNameOptions, rows]);
}
