import React from 'react';
import PageStatCards from '@/components/common/PageStatCards';
import { StyleInfo } from '@/types/style';
import { StyleSmartFilter } from '../hooks/useStyleListData';

interface DelayedStageHint {
  key: string;
  stageName: string;
  count: number;
  items: { id: string; no: string; name: string }[];
}

interface StyleStats {
  totalStyles: number;
  developingStyles: number;
  completedStyles: number;
  delayedStyles: number;
}

interface StyleStatCardsSectionProps {
  styleStats: StyleStats;
  activeStatFilter: 'all' | 'developing' | 'completed' | 'delayed';
  setActiveStatFilter: React.Dispatch<
    React.SetStateAction<'all' | 'developing' | 'completed' | 'delayed'>
  >;
  setQueryParams: React.Dispatch<React.SetStateAction<any>>;
  smartFilter: StyleSmartFilter;
  setSmartFilter: React.Dispatch<React.SetStateAction<StyleSmartFilter>>;
  focusStyleIds: Set<string>;
  setFocusStyleIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  setPendingFocusStyleId: React.Dispatch<React.SetStateAction<string | null>>;
  setFocusedStyleId: React.Dispatch<React.SetStateAction<string | null>>;
  overdueStyles: StyleInfo[];
  warningStyles: StyleInfo[];
  overdueStyleCount: number;
  warningStyleCount: number;
  delayedHints: DelayedStageHint[];
  showAllStyles: boolean;
  setShowAllStyles: React.Dispatch<React.SetStateAction<boolean>>;
  handleSmartFilterClick: (
    target: Exclude<StyleSmartFilter, 'all'>,
    records: StyleInfo[]
  ) => void;
}

const StyleStatCardsSection: React.FC<StyleStatCardsSectionProps> = ({
  styleStats,
  activeStatFilter,
  setActiveStatFilter,
  setQueryParams,
  smartFilter,
  setSmartFilter,
  focusStyleIds,
  setFocusStyleIds,
  setPendingFocusStyleId,
  setFocusedStyleId,
  overdueStyles,
  warningStyles,
  overdueStyleCount,
  warningStyleCount,
  delayedHints,
  showAllStyles,
  setShowAllStyles,
  handleSmartFilterClick,
}) => {
  return (
    <PageStatCards
      activeKey={activeStatFilter}
      cards={[
        {
          key: 'all',
          items: [
            {
              label: '全部款号',
              value: styleStats.totalStyles,
              unit: '个',
              color: 'var(--color-text-primary)',
            },
          ],
          onClick: () => {
            setActiveStatFilter('all');
            setQueryParams((prev: any) => ({ ...prev, progressNode: '', page: 1 }));
            setSmartFilter('all');
            setFocusStyleIds(new Set());
          },
          activeColor: 'var(--color-text-primary)',
        },
        {
          key: 'developing',
          items: [
            {
              label: '开发中',
              value: styleStats.developingStyles,
              unit: '个',
              color: 'var(--color-primary)',
            },
          ],
          onClick: () => {
            setActiveStatFilter('developing');
            setQueryParams((prev: any) => ({ ...prev, progressNode: '', page: 1 }));
            setSmartFilter('all');
            setFocusStyleIds(new Set());
          },
          activeColor: 'var(--color-primary)',
        },
        {
          key: 'completed',
          items: [
            {
              label: '已完成',
              value: styleStats.completedStyles,
              unit: '个',
              color: 'var(--color-success)',
            },
          ],
          onClick: () => {
            setActiveStatFilter('completed');
            setQueryParams((prev: any) => ({ ...prev, progressNode: '样衣完成', page: 1 }));
            setSmartFilter('all');
            setFocusStyleIds(new Set());
          },
          activeColor: 'var(--color-success)',
        },
        {
          key: 'delayed',
          items: [
            {
              label: '已延期',
              value: styleStats.delayedStyles,
              unit: '个',
              color: 'var(--color-danger)',
            },
          ],
          onClick: () => {
            setActiveStatFilter('delayed');
            handleSmartFilterClick('overdue', overdueStyles);
          },
          activeColor: 'var(--color-danger)',
        },
      ]}
      hints={[
        {
          key: 'overdue',
          count: overdueStyleCount,
          tone: 'red' as const,
          label: '已延期',
          hint: overdueStyles[0]?.styleNo
            ? `点击定位到 ${overdueStyles[0].styleNo}`
            : '点击定位到延期款号',
          active: smartFilter === 'overdue',
          onClick: () => handleSmartFilterClick('overdue', overdueStyles),
        },
        {
          key: 'warning',
          count: warningStyleCount,
          tone: 'orange' as const,
          label: '临近交期',
          hint: warningStyles[0]?.styleNo
            ? `点击定位到 ${warningStyles[0].styleNo}`
            : '点击定位到临近交期款号',
          active: smartFilter === 'warning',
          onClick: () => handleSmartFilterClick('warning', warningStyles),
        },
        ...delayedHints.map((h) => ({
          key: h.key,
          count: h.count,
          tone: 'orange' as const,
          label: `${h.stageName}延期`,
          hint: `点击查看${h.stageName}延期款式`,
          active:
            focusStyleIds.size > 0 &&
            h.items.some((item) => focusStyleIds.has(String(item.id))),
          onClick: () => {
            const ids = h.items.map((item) => String(item.id));
            setFocusStyleIds(new Set(ids));
            setSmartFilter('all');
            setQueryParams((prev: any) => ({ ...prev, page: 1 }));
          },
        })),
      ]}
      onClearHints={
        smartFilter !== 'all' || focusStyleIds.size > 0
          ? () => {
              setSmartFilter('all');
              setFocusStyleIds(new Set());
              setPendingFocusStyleId(null);
              setFocusedStyleId(null);
            }
          : undefined
      }
      extraRight={
        <button
          type="button"
          onClick={() => setShowAllStyles((v) => !v)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            border: '1px solid var(--color-border-antd)',
            background: 'var(--color-bg-base)',
            color: showAllStyles ? 'var(--color-primary)' : 'var(--color-text-secondary)',
            borderRadius: 4,
            padding: '4px 10px',
            fontSize: 12,
            fontWeight: 500,
            cursor: 'pointer',
            lineHeight: 1.4,
            whiteSpace: 'nowrap',
          }}
        >
          {showAllStyles ? '只看进行中' : '显示全部'}
        </button>
      }
    />
  );
};

export default StyleStatCardsSection;
