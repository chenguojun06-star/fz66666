import React from 'react';
import { TableProps } from 'antd';
import { ColumnsType } from 'antd/es/table';
import DashboardCard from '../DashboardCard';
import ResizableTable from '../ResizableTable';

/**
 * 数据表格看板配置
 */
interface DashboardTableProps<T = any> {
  /**
   * ResizableTable 存储键（列宽持久化）
   */
  storageKey: string;

  /**
   * 卡片标题
   */
  title: string;

  /**
   * 标题图标
   */
  icon?: React.ReactNode;

  /**
   * 右侧操作区域
   */
  extra?: React.ReactNode;

  /**
   * 表格列配置
   */
  columns: ColumnsType<T>;

  /**
   * 表格数据源
   */
  dataSource: T[];

  /**
   * 加载状态
   * @default false
   */
  loading?: boolean;

  /**
   * 行唯一键
   * @default 'id'
   */
  rowKey?: string | ((record: T) => string);

  /**
   * 是否分页
   * @default false
   */
  pagination?: TableProps<T>['pagination'];

  /**
   * 表格尺寸
   * @default 'small'
   */
  size?: 'small' | 'middle' | 'large';

  /**
   * 滚动配置
   */
  scroll?: TableProps<T>['scroll'];

  /**
   * 行点击事件
   */
  onRow?: TableProps<T>['onRow'];

  /**
   * 空数据提示
   */
  locale?: TableProps<T>['locale'];
}

/**
 * 通用数据表格看板组件
 * 封装了 Card + Table，适用于看板中的列表数据展示
 *
 * @example
 * ```tsx
 * <DashboardTable
 *   storageKey="dashboard-pending-orders"
 *   title="待处理订单"
 *
 *   columns={[
 *     { title: '订单号', dataIndex: 'orderNo', key: 'orderNo' },
 *     { title: '金额', dataIndex: 'amount', key: 'amount' },
 *   ]}
 *   dataSource={orders}
 *   loading={loading}
 * />
 * ```
 */
const DashboardTable = <T extends Record<string, any>>({
  storageKey,
  title,
  icon,
  extra,
  columns,
  dataSource,
  loading = false,
  rowKey = 'id',
  pagination = false,
  size = 'small',
  scroll,
  onRow,
  locale,
}: DashboardTableProps<T>) => {
  return (
    <DashboardCard title={title} icon={icon} extra={extra} loading={false}>
      <ResizableTable<T>
        storageKey={storageKey}
        columns={columns}
        dataSource={dataSource}
        loading={loading}
        rowKey={rowKey}
        pagination={pagination}
        size={size}
        scroll={scroll}
        onRow={onRow}
        locale={locale}
        bordered={false}
      />
    </DashboardCard>
  );
};

export default DashboardTable;
