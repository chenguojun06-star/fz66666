import React, { useState } from 'react';
import { Tag } from 'antd';

import { createCardSpecFieldGroups } from '@/components/common/CardSizeQuantityFieldGroups';
import UniversalCardView from '@/components/common/UniversalCardView';
import StandardPagination from '@/components/common/StandardPagination';
import SmartStyleHoverCard from './SmartStyleHoverCard';
import StyleCopyModal from './StyleCopyModal';
import RemarkTimelineModal from '@/components/common/RemarkTimelineModal';
import { StyleInfo } from '@/types/style';
import { toCategoryCn } from '@/utils/styleCategory';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { isSupervisorOrAboveUser, useUser } from '@/utils/AuthContext';
import { getStyleCardColorText, getStyleCardQuantityText, getStyleCardSizeQuantityItems, getStyleCardSizeText } from '@/utils/cardSizeQuantity';
import { DEFAULT_PAGE_SIZE_OPTIONS } from '@/utils/pageSizeStore';
import { getStyleSourceText } from '@/utils/styleSource';
import { useCardGridLayout } from '@/hooks/useCardGridLayout';
import { isStyleInfoCompleted } from './styleTableViewUtils';

interface StyleCardViewProps {
  data: StyleInfo[];
  stockStateMap?: Record<string, boolean>;
  loading: boolean;
  total: number;
  pageSize: number;
  currentPage: number;
  onPageChange: (page: number, pageSize: number) => void;
  onScrap: (id: string) => void;
  onPrint: (record: StyleInfo) => void;
  onMaintenance: (record: StyleInfo) => void;
  onRefresh: () => void;
  focusedStyleId?: string | null;
}

/**
 * 款式信息卡片视图
 * 操作与表格视图完全一致：
 * - 已完成(样衣完成)：详情 + 下单 + 维护(主管+)
 * - 开发中：详情 + 纸样 + 生产制单 + 打印 + 报废
 */
const StyleCardView: React.FC<StyleCardViewProps> = ({
  data,
  stockStateMap = {},
  loading,
  total,
  pageSize,
  currentPage,
  onPageChange,
  onScrap,
  onPrint,
  onMaintenance,
  onRefresh,
  focusedStyleId,
}) => {
  const navigate = useNavigate();
  const { user } = useUser();
  const { columns: cardColumns } = useCardGridLayout(10);
  const isSupervisorOrAbove = isSupervisorOrAboveUser(user);

  const [copyModalOpen, setCopyModalOpen] = useState(false);
  const [copySource, setCopySource] = useState<StyleInfo | null>(null);
  const [remarkTarget, setRemarkTarget] = useState<{ open: boolean; styleNo: string }>({ open: false, styleNo: '' });

  const resolveDisplayColor = (record: StyleInfo) => {
    return getStyleCardColorText(record);
  };

  const resolveDisplaySize = (record: StyleInfo) => {
    return getStyleCardSizeText(record);
  };

  const resolveDisplayQuantity = (record: StyleInfo) => {
    return getStyleCardQuantityText(record);
  };

  const isStageDoneRow = (record: StyleInfo) => {
    const stockKey = `${String((record as any).styleNo || '').trim().toUpperCase()}|${resolveDisplayColor(record).trim().toUpperCase()}`;
    if (stockStateMap[stockKey]) {
      return true;
    }
    return String((record as any).latestPatternStatus || '').trim().toUpperCase() === 'COMPLETED';
  };

  const renderSourceText = (record: StyleInfo) => {
    return getStyleSourceText(record);
  };

  const isScrappedRow = (record: StyleInfo) => {
    return String(record.status || '').trim().toUpperCase() === 'SCRAPPED'
      || String((record as any).progressNode || '').trim() === '开发样报废';
  };

  const getStyleDomKey = (record: Partial<StyleInfo> | null | undefined) => {
    return String(record?.id || record?.styleNo || '').trim();
  };

  return (
    <>
    <UniversalCardView
      dataSource={data}
      loading={loading}
      columns={cardColumns}
      coverField="cover"
      titleField="styleNo"
      subtitleField="styleName"
      fields={[]}
      fieldGroups={[
        ...createCardSpecFieldGroups<StyleInfo>({
          colorKey: 'styleCardColorLine',
          sizeKey: 'styleCardSizeLine',
          quantityKey: 'styleCardQuantityLine',
          getItems: (record) => getStyleCardSizeQuantityItems(record),
          getFallbackColor: (record) => resolveDisplayColor(record),
          getFallbackSize: (record) => resolveDisplaySize(record),
          getFallbackQuantity: (record) => {
            const directQuantity = resolveDisplayQuantity(record);
            if (directQuantity && !directQuantity.includes('/')) {
              return Number(directQuantity) || Number(record.sampleQuantity) || Number((record as any).quantity) || 0;
            }
            return Number(record.sampleQuantity) || Number((record as any).quantity) || 0;
          },
        }),
        [{ label: '来源', key: 'developmentSourceType', render: (_val, record) => renderSourceText(record as StyleInfo) }, { label: '品类', key: 'category', render: (val) => toCategoryCn(val) }],
        [{ label: '交板', key: 'deliveryDate', render: (val: unknown) => val ? dayjs(val as string).format('MM-DD') : '-' }, { label: '状态', key: 'latestPatternStatus', render: (_val, record) => isStageDoneRow(record as StyleInfo) ? '已入库' : '待入库' }],
      ]}
      progressConfig={{
        show: true,
        calculate: (record) => {
          // 计算样衣开发进度 - 6个核心步骤
          let completedSteps = 0;
          const totalSteps = 6; // BOM、纸样、尺寸、工序、生产制单、二次工艺

          if ((record as any).bomCompletedTime) completedSteps++; // 1. BOM配置完成
          if ((record as any).patternCompletedTime) completedSteps++; // 2. 纸样开发完成
          if ((record as any).sizeCompletedTime) completedSteps++; // 3. 尺寸表完成
          if ((record as any).processCompletedTime) completedSteps++; // 4. 工序配置完成
          if ((record as any).productionCompletedTime) completedSteps++; // 5. 生产制单完成
          if ((record as any).secondaryCompletedTime) completedSteps++; // 6. 二次工艺完成

          return Math.round((completedSteps / totalSteps) * 100);
        },
        getStatus: (record) => {
          if (isScrappedRow(record as StyleInfo)) {
            return 'warning';
          }
          // 已完成状态直接返回 normal（不再标红色），不参与逾期判断
          if (isStyleInfoCompleted(record as StyleInfo)) {
            return 'normal';
          }

          // 根据交板日期判断状态颜色
          if (!record.deliveryDate) {
            return 'normal'; // 没有交期，显示正常颜色
          }

          const deliveryTime = new Date(record.deliveryDate).getTime();
          const now = new Date().getTime();
          const remainingDays = (deliveryTime - now) / (1000 * 60 * 60 * 24);

          // 已延期或今天就是交期
          if (remainingDays <= 0) {
            return 'danger'; // 红色
          }
          // 3天内到期
          if (remainingDays <= 3) {
            return 'warning'; // 黄色
          }
          // 时间充裕
          return 'normal'; // 绿色
        },
        type: 'liquid', // 液体波浪进度条
      }}
      hoverRender={(record) => <SmartStyleHoverCard record={record as StyleInfo} />}
      titleTags={(record) => {
        const node = String((record as StyleInfo).progressNode || '').trim();
        if (!node) return null;
        const color = node === '开发样报废'
          ? 'error'
          : /完成/.test(node)
            ? 'default'
            : /(制作中|开发中|进行中)/.test(node)
              ? 'success'
              : 'processing';
        return <Tag color={color}>{node}</Tag>;
      }}
      onCardClick={undefined}
      getCardId={(record) => `style-card-${getStyleDomKey(record as StyleInfo)}`}
      getCardStyle={(record) => getStyleDomKey(record as StyleInfo) === focusedStyleId ? {
        boxShadow: '0 0 0 2px rgba(250, 173, 20, 0.35), 0 10px 24px rgba(250, 173, 20, 0.18)',
        transform: 'translateY(-2px)',
      } : undefined}
      actions={(record) => {
        const r = record as StyleInfo;
        if (isScrappedRow(r)) {
          return [
            { key: 'detail', label: '详情', onClick: () => navigate(`/style-info/${r.id}`) },
            { key: 'print', label: '打印', onClick: () => onPrint(r) },
            { key: 'remark', label: '备注', onClick: () => setRemarkTarget({ open: true, styleNo: (r as any).styleNo || '' }) },
          ];
        }
        if (isStageDoneRow(r)) {
          const items: { key: string; label: string; onClick: () => void; danger?: boolean }[] = [
            { key: 'detail', label: '详情', onClick: () => navigate(`/style-info/${r.id}`) },
            {
              key: 'production',
              label: '生产订单',
              onClick: () => navigate(`/production?keyword=${encodeURIComponent((r as any).orderNo || (r as any).styleNo || '')}`),
            },
            { key: 'print', label: '打印', onClick: () => onPrint(r) },
          ];
          if (isSupervisorOrAbove) {
            items.push({ key: 'maintenance', label: '维护', onClick: () => onMaintenance(r) });
          }
          items.push({ key: 'copy', label: '复制', onClick: () => { setCopySource(r); setCopyModalOpen(true); } });
          items.push({ key: 'remark', label: '备注', onClick: () => setRemarkTarget({ open: true, styleNo: (r as any).styleNo || '' }) });
          return items;
        }
        return [
          { key: 'detail', label: '详情', onClick: () => navigate(`/style-info/${r.id}`) },
          {
            key: 'pattern',
            label: '纸样',
            onClick: () => navigate(`/style-info/${r.id}?tab=7&section=files`),
          },
          {
            key: 'sample',
            label: '生产制单',
            onClick: () => navigate(`/style-info/${r.id}?tab=8`),
          },
          { key: 'print', label: '打印', onClick: () => onPrint(r) },
          { key: 'scrap', label: '报废', danger: true, onClick: () => onScrap(String(r.id!)) },
          { key: 'copy', label: '复制', onClick: () => { setCopySource(r); setCopyModalOpen(true); } },
          { key: 'remark', label: '备注', onClick: () => setRemarkTarget({ open: true, styleNo: (r as any).styleNo || '' }) },
        ];
      }}
      pagination={{
        total,
        pageSize,
        current: currentPage,
        onChange: onPageChange,
        showSizeChanger: true,
        showQuickJumper: true,
        showTotal: (total: number) => `共 ${total} 条`,
        pageSizeOptions: [...DEFAULT_PAGE_SIZE_OPTIONS],
      }}
    />
    <StandardPagination
      current={currentPage}
      pageSize={pageSize}
      total={total}
      wrapperStyle={{ paddingTop: 12, paddingBottom: 4 }}
      onChange={onPageChange}
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

export default React.memo(StyleCardView);
