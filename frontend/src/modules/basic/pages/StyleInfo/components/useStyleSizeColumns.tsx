import { useMemo } from 'react';
import { Button, Input, InputNumber, Select, Modal, Upload, Image } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import api, { toNumberSafe } from '@/utils/api';
import { MatrixRow, DisplayRow, normalizeGradingZones } from './styleSizeTabUtils';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import RowActions from '@/components/common/RowActions';

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
}: UseStyleSizeColumnsParams) {
  return useMemo(() => {
    const editableMode = editMode && !readOnly;
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
                      style={{ objectFit: 'contain', borderRadius: 8, border: '1px solid #eee', background: '#fff', padding: 6 }}
                      preview={{ src: getFullAuthedFileUrl(url) }}
                    />
                    {editableMode && (
                      <DeleteOutlined
                        onClick={() => setChunkImageUrls(record.chunkRowKeys, imgs.filter((_, ii) => ii !== i))}
                        style={{ position: 'absolute', top: -4, right: -4, background: 'rgba(0,0,0,0.55)', color: '#fff', borderRadius: '50%', padding: 2, fontSize: 10, cursor: 'pointer' }}
                      />
                    )}
                  </div>
                ))}
              </Image.PreviewGroup>
              {editableMode && imgs.length < 2 && (
                <Upload
                  accept="image/*"
                  showUploadList={false}
                  beforeUpload={async (file) => {
                    const formData = new FormData();
                    formData.append('file', file);
                    try {
                      const res: any = await (api as any).post('/common/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
                      if (res?.code === 200 && res?.data) {
                        setChunkImageUrls(record.chunkRowKeys, [...imgs, String(res.data)].slice(0, 2));
                      } else {
                        message.error('图片上传失败');
                      }
                    } catch {
                      message.error('图片上传失败');
                    }
                    return false;
                  }}
                >
                  <Button size="small" icon={<PlusOutlined />} style={{ width: '100%', height: imgs.length > 0 ? 84 : 220, borderRadius: 8, borderStyle: 'dashed' }} />
                </Upload>
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
                  size="small"
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
        width: 50,
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
        width: 80,
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
        render: (_: any, record: MatrixRow) =>
          editableMode ? (
            <Select
              value={record.baseSize || undefined}
              allowClear
              style={{ width: '100%' }}
              options={sizeColumns.map((size) => ({ value: size, label: size }))}
              onChange={(value) => updateBaseSize(record.key, String(value || ''))}
            />
          ) : (
            record.baseSize || '-'
          ),
      },
      {
        title: '跳码区',
        dataIndex: 'gradingZones',
        width: 120,
        render: (_: any, record: MatrixRow) => {
          const zones = normalizeGradingZones(record.gradingZones || [], sizeColumns);
          const summary = zones.map((zone) => {
            const frontInfo = (zone.frontSizes || []).length > 0
              ? `前:${zone.frontSizes.join('/')}↓${toNumberSafe(zone.frontStep)}`
              : '';
            const backInfo = (zone.backSizes || []).length > 0
              ? `后:${zone.backSizes.join('/')}↑${toNumberSafe(zone.backStep)}`
              : '';
            const extraInfo = (zone.sizeStepColumns || []).map((col, idx) => {
              if ((col.sizes || []).length === 0) return '';
              return `列${idx + 1}:${col.sizes.join('/')}→${toNumberSafe(col.step)}`;
            }).filter(Boolean).join(' ');
            return `${zone.label}(${[frontInfo, backInfo, extraInfo].filter(Boolean).join(' ')})`;
          }).join('；');
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 11, lineHeight: 1.5, color: '#334155', whiteSpace: 'pre-wrap' }}>{summary || '-'}</div>
              {editableMode ? (
                <Button size="small" onClick={() => openGradingConfig(record)}>
                  配置跳码区
                </Button>
              ) : null}
            </div>
          );
        },
      },
    ];

    const sizeCols = sizeColumns.map((sn) => ({
      title: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span>{sn}</span>
          {editableMode ? (
            <Button
              size="small"
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
      ),
      dataIndex: sn,
      width: 40,
      align: 'center' as const,
      render: (_: any, record: MatrixRow) => {
        const v = record.cells[sn]?.value;
        return editableMode ? (
          <InputNumber
            value={v}
            min={0}
            step={0.1}
            controls={false}
            style={{ width: '100%' }}
            onChange={(val) => updateCellValue(record.key, sn, toNumberSafe(val))}
          />
        ) : (
          v
        );
      },
    }));

    const right = [
      {
        title: '公差',
        dataIndex: 'tolerance',
        width: 50,
        align: 'center' as const,
        render: (_: any, record: MatrixRow) =>
          editableMode ? (
            <Input
              value={String(record.tolerance ?? '')}
              style={{ width: '100%' }}
              onChange={(e) => updateTolerance(record.key, e.target.value)}
            />
          ) : (
            record.tolerance
          ),
      },
      {
        title: '操作',
        key: 'operation',
        width: 90,
        resizable: false,
        render: (_: any, record: MatrixRow) =>
          editableMode ? (
            <RowActions
              maxInline={1}
              actions={[
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
  }, [editMode, readOnly, sizeColumns, displayRows, groupNameOptions, rows]);
}
