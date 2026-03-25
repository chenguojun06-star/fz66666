import React from 'react';
import { Tag, Pagination } from 'antd';

import UniversalCardView from '@/components/common/UniversalCardView';
import SmartStyleHoverCard from './SmartStyleHoverCard';
import { StyleInfo } from '@/types/style';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { withQuery } from '@/utils/api';
import { isSupervisorOrAboveUser, useAuth } from '@/utils/AuthContext';
import { getStyleSourceText } from '@/utils/styleSource';
import { useCardGridLayout } from '@/hooks/useCardGridLayout';

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
  focusedStyleId?: string | null;
}

/**
 * 款式信息卡片视图
 * 操作与表格视图完全一致：
 * - 已完成(样衣完成)：详情 + 下单 + 维护(主管+)
 * - 开发中：详情 + 纸样开发 + 样衣生产 + 打印 + 报废
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
  focusedStyleId,
}) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { columns: cardColumns } = useCardGridLayout(10);
  const isSupervisorOrAbove = isSupervisorOrAboveUser(user);

  const parseSizeColorConfig = (raw: unknown): { sizes: string[]; colors: string[]; quantities: number[] } => {
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw || '{}') : (raw || {});
      return {
        sizes: Array.isArray((parsed as any)?.sizes) ? (parsed as any).sizes.map((item: unknown) => String(item || '').trim()).filter(Boolean) : [],
        colors: Array.isArray((parsed as any)?.colors) ? (parsed as any).colors.map((item: unknown) => String(item || '').trim()).filter(Boolean) : [],
        quantities: Array.isArray((parsed as any)?.quantities) ? (parsed as any).quantities.map((item: unknown) => Number(item || 0)) : [],
      };
    } catch {
      return { sizes: [], colors: [], quantities: [] };
    }
  };

  const buildConfiguredSpecPairs = (record: StyleInfo) => {
    const config = parseSizeColorConfig((record as any).sizeColorConfig);
    const directColor = String((record as any).color || '').trim() || config.colors.find(Boolean) || '';
    const parsed = typeof (record as any).sizeColorConfig === 'string' ? (() => {
      try {
        return JSON.parse((record as any).sizeColorConfig || '{}') as { matrixRows?: Array<{ color?: string; quantities?: unknown[] }>; sizes?: string[] };
      } catch {
        return {};
      }
    })() : (((record as any).sizeColorConfig as { matrixRows?: Array<{ color?: string; quantities?: unknown[] }>; sizes?: string[] }) || {});
    const matrixSizes = Array.isArray(parsed?.sizes) ? parsed.sizes.map((item) => String(item || '').trim()).filter(Boolean) : config.sizes;
    const matrixRows = Array.isArray(parsed?.matrixRows) ? parsed.matrixRows : [];
    const matrixPairs = matrixRows.flatMap((row) => {
      const rowColor = String(row?.color || '').trim();
      const quantities = Array.isArray(row?.quantities) ? row.quantities : [];
      return matrixSizes
        .map((size, index) => ({ color: rowColor, size, quantity: Number(quantities[index] || 0) }))
        .filter((item) => item.color && item.size && item.quantity > 0);
    });
    if (matrixPairs.length) {
      return matrixPairs;
    }
    const topLevelPairs = config.sizes
      .map((size, index) => ({ color: directColor, size, quantity: Number(config.quantities[index] || 0) }))
      .filter((item) => item.size && item.quantity > 0);
    if (topLevelPairs.length) {
      return topLevelPairs;
    }
    const fallbackSizes = String((record as any).size || '').split(/[/,，\s]+/).map((item) => item.trim()).filter(Boolean);
    const fallbackQuantity = Number((record as any).sampleQuantity || 0);
    if (directColor && fallbackSizes.length === 1 && fallbackQuantity > 0) {
      return [{ color: directColor, size: fallbackSizes[0], quantity: fallbackQuantity }];
    }
    return [];
  };

  const resolveDisplayColor = (record: StyleInfo) => {
    const pairs = buildConfiguredSpecPairs(record);
    return pairs.length ? Array.from(new Set(pairs.map((item) => item.color).filter(Boolean))).join(' / ') : '';
  };

  const resolveDisplaySize = (record: StyleInfo) => {
    const pairs = buildConfiguredSpecPairs(record);
    return pairs.length ? pairs.map((item) => item.size).join(' / ') : '';
  };

  const resolveDisplayQuantity = (record: StyleInfo) => {
    const pairs = buildConfiguredSpecPairs(record);
    return pairs.length ? pairs.map((item) => `${item.quantity}`).join(' / ') : '';
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
        [{ label: '颜色', key: 'color', render: (_val, record) => resolveDisplayColor(record as StyleInfo) || '-' }, { label: '码数', key: 'sizeColorConfig', render: (_val, record) => resolveDisplaySize(record as StyleInfo) || '-' }],
        [{ label: '数量', key: 'sampleQuantity', render: (_val, record) => { const qty = resolveDisplayQuantity(record as StyleInfo); return qty && qty !== '0' ? `${qty}件` : '-'; } }, { label: '来源', key: 'developmentSourceType', render: (_val, record) => renderSourceText(record as StyleInfo) }],
        [{ label: '品类', key: 'category', render: (val) => val || '-' }, { label: '交板', key: 'deliveryDate', render: (val: unknown) => val ? dayjs(val as string).format('MM-DD') : '-' }],
        [{ label: '创建', key: 'createTime', render: (val: unknown) => val ? dayjs(val as string).format('MM-DD') : '-' }, { label: '状态', key: 'latestPatternStatus', render: (_val, record) => isStageDoneRow(record as StyleInfo) ? '已入库' : '待入库' }],
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
          // 已完成状态直接返回 success，不参与逾期判断
          const node = String((record as any).progressNode || '').trim();
          const sampleStatus = String((record as any).sampleStatus || '').trim().toUpperCase();
          if (node === '样衣完成' || sampleStatus === 'COMPLETED') {
            return 'normal'; // 绿色（完成，不再标危险色）
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
      onCardClick={(record) => navigate(`/style-info/${record.id}`)}
      getCardId={(record) => `style-card-${getStyleDomKey(record as StyleInfo)}`}
      getCardStyle={(record) => getStyleDomKey(record as StyleInfo) === focusedStyleId ? {
        boxShadow: '0 0 0 2px rgba(250, 173, 20, 0.35), 0 10px 24px rgba(250, 173, 20, 0.18)',
        transform: 'translateY(-2px)',
      } : undefined}
      actions={(record) => {
        const r = record as StyleInfo;
        if (isScrappedRow(r)) {
          return [
            {
              key: 'print',
              label: '打印',
              onClick: () => onPrint(r),
            },
          ];
        }
        if (isStageDoneRow(r)) {
          // 已完成：下单 + 维护(主管+)
          const items = [
            {
              key: 'order',
              label: '下单',
              onClick: () => navigate(withQuery('/order-management', { styleNo: (r as any).styleNo })),
            },
          ];
          if (isSupervisorOrAbove) {
            items.push({
              key: 'maintenance',
              label: '维护',
              onClick: () => onMaintenance(r),
            });
          }
          return items;
        }
        // 开发中：纸样开发 + 样衣生产 + 打印 + 报废
        return [
          {
            key: 'pattern',
            label: '纸样开发',
            onClick: () => navigate(`/style-info/${r.id}?tab=7&section=files`),
          },
          {
            key: 'sample',
            label: '样衣生产',
            onClick: () => navigate(`/style-info/${r.id}?tab=8`),
          },
          {
            key: 'print',
            label: '打印',
            onClick: () => onPrint(r),
          },
          {
            key: 'delete',
            label: '报废',
            danger: true,
            onClick: () => onScrap(String(r.id!)),
          },
        ];
      }}
      pagination={{
        total,
        pageSize,
        current: currentPage,
        onChange: onPageChange,
        showSizeChanger: true,
        showQuickJumper: true,
        showTotal: (total) => `共 ${total} 条`,
        pageSizeOptions: ['10', '20', '50', '100'],
      }}
    />
    <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 0 4px' }}>
      <Pagination
        current={currentPage}
        pageSize={pageSize}
        total={total}
        showTotal={(t) => `共 ${t} 条`}
        showSizeChanger
        showQuickJumper
        pageSizeOptions={['10', '20', '50', '100']}
        onChange={onPageChange}
      />
    </div>
    </>
  );
};

export default StyleCardView;
