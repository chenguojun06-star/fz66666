import React, { useState } from 'react';
import { Tag } from 'antd';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import ResizableTable from '@/components/common/ResizableTable';
import RowActions, { type RowAction } from '@/components/common/RowActions';
import StyleCoverThumb from '@/components/StyleAssets/StyleCoverThumb';
import StyleCopyModal from './StyleCopyModal';
import RemarkTimelineModal from '@/components/common/RemarkTimelineModal';
import { StyleInfo } from '@/types/style';
import type { FieldConfigItem } from '@/hooks/useFieldConfig';
import type { ColumnOption } from '@/components/common/ColumnSettings';
import { getStyleSourceText } from '@/utils/styleSource';
import { toCategoryCn } from '@/utils/styleCategory';
import { getStyleCardColorText } from '@/utils/cardSizeQuantity';
import { isScrappedStyle } from './styleTableViewUtils';
import { isSupervisorOrAboveUser, useUser } from '@/utils/AuthContext';
import { getFieldValue, renderCellValue } from '@/hooks/useExtColumns';
import { DEFAULT_PAGE_SIZE_OPTIONS } from '@/utils/pageSizeStore';

/**
 * 样衣开发"表格"视图（参考订单管理页 ProductionTableView）。
 * - ResizableTable：列宽记忆 + 序号列 + 前端导出（ExcelJS，选择导出列）
 * - 列显隐/列顺序由父级 useColumnSettings 管理（列设置侧滑弹窗在父级渲染）
 * - 自定义字段列（字段配置 isSystem=0）始终追加显示
 */

/** 样衣表格可配置的系统列（列设置选项） */
export const STYLE_LIST_COLUMNS: ColumnOption[] = [
  { key: 'cover', label: '图片' },
  { key: 'styleNo', label: '款号' },
  { key: 'styleName', label: '款名' },
  { key: 'category', label: '商品分类' },
  { key: 'color', label: '颜色' },
  { key: 'size', label: '码数' },
  { key: 'sampleQuantity', label: '样衣数量' },
  { key: 'developmentSourceType', label: '来源' },
  { key: 'deliveryDate', label: '交板' },
  { key: 'progressNode', label: '进度节点' },
  { key: 'procurementProgress', label: '采购进度' },
  { key: 'patternCompletedTime', label: '纸样完成' },
  { key: 'sampleCompletedTime', label: '样衣完成' },
  { key: 'totalOrderQuantity', label: '累计订单' },
  { key: 'stockQuantity', label: '库存' },
  { key: 'createTime', label: '创建时间' },
];

/** 默认显示列 */
export const STYLE_LIST_DEFAULT_VISIBLE: Record<string, boolean> = {
  cover: true,
  styleNo: true,
  styleName: true,
  category: false,
  color: true,
  size: true,
  sampleQuantity: true,
  developmentSourceType: false,
  deliveryDate: true,
  progressNode: true,
  procurementProgress: false,
  patternCompletedTime: false,
  sampleCompletedTime: false,
  totalOrderQuantity: false,
  stockQuantity: false,
  createTime: false,
};

interface StyleListViewProps {
  data: StyleInfo[];
  stockStateMap?: Record<string, boolean>;
  loading: boolean;
  total: number;
  pageSize: number;
  currentPage: number;
  onPageChange: (page: number, pageSize: number) => void;
  onScrap: (id: string) => void;
  onUnscrap: (id: string) => void;
  onPrint: (record: StyleInfo) => void;
  onMaintenance: (record: StyleInfo) => void;
  onRefresh: () => void;
  customFields?: FieldConfigItem[];
  /** 有序可见系统列（来自父级列设置） */
  orderedColumns: ColumnOption[];
}

const formatDate = (v: unknown): string => {
  if (!v) return '-';
  const d = dayjs(v as string | number);
  return d.isValid() ? d.format('YYYY-MM-DD') : String(v);
};

const StyleListView: React.FC<StyleListViewProps> = ({
  data,
  stockStateMap = {},
  loading,
  total,
  pageSize,
  currentPage,
  onPageChange,
  onScrap,
  onUnscrap,
  onPrint,
  onMaintenance,
  onRefresh,
  customFields = [],
  orderedColumns,
}) => {
  const navigate = useNavigate();
  const { user } = useUser();
  const isSupervisorOrAbove = isSupervisorOrAboveUser(user);

  const [copyModalOpen, setCopyModalOpen] = useState(false);
  const [copySource, setCopySource] = useState<StyleInfo | null>(null);
  const [remarkTarget, setRemarkTarget] = useState<{ open: boolean; styleNo: string }>({ open: false, styleNo: '' });

  const isStageDoneRow = (record: StyleInfo) => {
    const stockKey = `${String(record.styleNo || '').trim().toUpperCase()}|${getStyleCardColorText(record).trim().toUpperCase()}`;
    if (stockStateMap[stockKey]) {
      return true;
    }
    return String(record.latestPatternStatus || '').trim().toUpperCase() === 'COMPLETED';
  };

  const renderCell = (key: string, record: StyleInfo): React.ReactNode => {
    switch (key) {
      case 'cover':
        return (
          <StyleCoverThumb
            styleId={record.id}
            styleNo={record.styleNo}
            src={record.cover || null}
            color={record.color}
            size={48}
            borderRadius={6}
          />
        );
      case 'category':
        return toCategoryCn(record.category) || '-';
      case 'developmentSourceType':
        return getStyleSourceText(record);
      case 'deliveryDate':
        return formatDate(record.deliveryDate);
      case 'createTime':
        return formatDate(record.createTime);
      case 'patternCompletedTime':
        return formatDate(record.patternCompletedTime);
      case 'sampleCompletedTime':
        return formatDate(record.sampleCompletedTime);
      case 'progressNode':
        return record.progressNode ? <Tag>{record.progressNode}</Tag> : '-';
      case 'procurementProgress':
        return record.procurementProgress != null ? `${record.procurementProgress}%` : '-';
      case 'sampleQuantity':
      case 'totalOrderQuantity':
      case 'stockQuantity':
        return record[key] != null ? String(record[key]) : '-';
      case 'styleNo':
        return (
          <a
            style={{ cursor: 'pointer', color: 'var(--primary-color, var(--color-primary))' }}
            onClick={(e) => {
              e.preventDefault();
              navigate(`/style-info/${record.id}`);
            }}
          >
            {record.styleNo || '-'}
          </a>
        );
      default:
        return (record as Record<string, unknown>)[key] != null ? String((record as Record<string, unknown>)[key]) : '-';
    }
  };

  const buildActions = (record: StyleInfo): RowAction[] => {
    if (isScrappedStyle(record)) {
      return [
        { key: 'detail', label: '详情', onClick: () => navigate(`/style-info/${record.id}`) },
        { key: 'unscrap', label: '取消报废', onClick: () => onUnscrap(String(record.id!)) },
        { key: 'print', label: '打印', onClick: () => onPrint(record) },
        { key: 'remark', label: '备注', onClick: () => setRemarkTarget({ open: true, styleNo: record.styleNo || '' }) },
      ];
    }
    if (isStageDoneRow(record)) {
      const items: RowAction[] = [
        { key: 'detail', label: '详情', onClick: () => navigate(`/style-info/${record.id}`) },
        {
          key: 'production',
          label: '生产订单',
          onClick: () => navigate(`/production?keyword=${encodeURIComponent((record as any).orderNo || record.styleNo || '')}`),
        },
        { key: 'print', label: '打印', onClick: () => onPrint(record) },
      ];
      if (isSupervisorOrAbove) {
        items.push({ key: 'maintenance', label: '维护', onClick: () => onMaintenance(record) });
      }
      items.push({ key: 'copy', label: '复制', onClick: () => { setCopySource(record); setCopyModalOpen(true); } });
      items.push({ key: 'remark', label: '备注', onClick: () => setRemarkTarget({ open: true, styleNo: record.styleNo || '' }) });
      return items;
    }
    return [
      { key: 'detail', label: '详情', onClick: () => navigate(`/style-info/${record.id}`) },
      { key: 'pattern', label: '纸样', onClick: () => navigate(`/style-info/${record.id}?tab=7&section=files`) },
      { key: 'sample', label: '生产制单', onClick: () => navigate(`/style-info/${record.id}?tab=8`) },
      { key: 'print', label: '打印', onClick: () => onPrint(record) },
      { key: 'scrap', label: '报废', danger: true, onClick: () => onScrap(String(record.id!)) },
      { key: 'copy', label: '复制', onClick: () => { setCopySource(record); setCopyModalOpen(true); } },
      { key: 'remark', label: '备注', onClick: () => setRemarkTarget({ open: true, styleNo: record.styleNo || '' }) },
    ];
  };

  const columns: any[] = [
    ...orderedColumns.map((col) => ({
      title: col.label,
      dataIndex: col.key,
      key: col.key,
      width: col.key === 'cover' ? 64 : col.key === 'styleNo' ? 110 : 110,
      render: (_: unknown, record: StyleInfo) => renderCell(col.key, record),
    })),
    ...customFields.map((f) => ({
      title: f.label,
      dataIndex: f.fieldKey,
      key: f.fieldKey,
      width: 120,
      ellipsis: true,
      render: (_: unknown, record: StyleInfo) => {
        const raw = getFieldValue(record, f.fieldKey);
        return renderCellValue(raw, f.fieldType);
      },
    })),
    {
      title: '操作',
      key: 'action',
      width: 120,
      fixed: 'right' as const,
      render: (_: unknown, record: StyleInfo) => (
        <RowActions className="table-actions" maxInline={1} actions={buildActions(record)} />
      ),
    },
  ];

  return (
    <>
      <ResizableTable<any>
        storageKey="style-list-table"
        columns={columns}
        dataSource={data}
        rowKey={(record: StyleInfo) => String(record.id || record.styleNo || '')}
        loading={loading}
        scroll={{ x: 1500 }}
        showExport
        exportFilename="样衣开发.xlsx"
        emptyDescription="暂无样衣数据"
        emptyActionText="去创建第一款"
        onEmptyAction={() => navigate('/style-info/new')}
        stickyHeader
        pagination={{
          current: currentPage,
          pageSize,
          total,
          showTotal: (t: number) => `共 ${t} 条`,
          showSizeChanger: true,
          showQuickJumper: true,
          pageSizeOptions: [...DEFAULT_PAGE_SIZE_OPTIONS],
          onChange: onPageChange,
        }}
      />

      <StyleCopyModal
        open={copyModalOpen}
        onCancel={() => setCopyModalOpen(false)}
        copySource={copySource}
        onSuccess={onRefresh}
      />

      <RemarkTimelineModal
        open={remarkTarget.open}
        onClose={() => setRemarkTarget({ open: false, styleNo: '' })}
        targetType="style"
        targetNo={remarkTarget.styleNo}
      />
    </>
  );
};

export default React.memo(StyleListView);
