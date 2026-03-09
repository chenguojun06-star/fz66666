import React from 'react';

import UniversalCardView from '@/components/common/UniversalCardView';
import SmartStyleHoverCard from './SmartStyleHoverCard';
import { StyleInfo } from '@/types/style';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { withQuery } from '@/utils/api';
import { isSupervisorOrAboveUser, useAuth } from '@/utils/AuthContext';

interface StyleCardViewProps {
  data: StyleInfo[];
  loading: boolean;
  total: number;
  pageSize: number;
  currentPage: number;
  onPageChange: (page: number, pageSize: number) => void;
  onDelete: (id: string) => void;
  onPrint: (record: StyleInfo) => void;
  onMaintenance: (record: StyleInfo) => void;
}

/**
 * 款式信息卡片视图
 * 操作与表格视图完全一致：
 * - 已完成(样衣完成)：详情 + 下单 + 维护(主管+)
 * - 开发中：详情 + 纸样开发 + 样衣生产 + 打印 + 删除
 */
const StyleCardView: React.FC<StyleCardViewProps> = ({
  data,
  loading,
  total,
  pageSize,
  currentPage,
  onPageChange,
  onDelete,
  onPrint,
  onMaintenance
}) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isSupervisorOrAbove = isSupervisorOrAboveUser(user);

  const isStageDoneRow = (record: StyleInfo) => {
    const node = String((record as any).progressNode || '').trim();
    return node === '样衣完成';
  };

  return (
    <UniversalCardView
      dataSource={data}
      loading={loading}
      columns={6}
      coverField="cover"
      titleField="styleNo"
      subtitleField="styleName"
      fields={[]}
      fieldGroups={[
        [{ label: '码数', key: 'sizeColorConfig', render: (val) => { if (!val) return '-'; try { const config = JSON.parse(val); const sizes = (config.sizes || []).filter((s: string) => s && s.trim()); return sizes.length > 0 ? sizes.join(',') : '-'; } catch { return '-'; } } }, { label: '数量', key: 'sampleQuantity', render: (val) => { const qty = Number(val) || 0; return qty > 0 ? `${qty}件` : '-'; } }],
        [{ label: '交板', key: 'deliveryDate', render: (val: unknown) => val ? dayjs(val as string).format('MM-DD') : '-' }, { label: '创建', key: 'createTime', render: (val: unknown) => val ? dayjs(val as string).format('MM-DD') : '-' }],
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
      onCardClick={(record) => navigate(`/style-info/${record.id}`)}
      actions={(record) => {
        const r = record as StyleInfo;
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
        // 开发中：纸样开发 + 样衣生产 + 打印 + 删除
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
            label: '删除',
            danger: true,
            onClick: () => onDelete(String(r.id!)),
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
  );
};

export default StyleCardView;
