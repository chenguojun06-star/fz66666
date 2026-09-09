import React, { useMemo, useState } from 'react';
import { Button, Card, Select, Space } from 'antd';
import { SettingOutlined } from '@ant-design/icons';
import PageStatCards from '@/components/common/PageStatCards';
import ResizableTable from '@/components/common/ResizableTable';
import StandardSearchBar from '@/components/common/StandardSearchBar';
import StandardToolbar from '@/components/common/StandardToolbar';
import StickyFilterBar from '@/components/common/StickyFilterBar';
import { useColumnSettings, ColumnSettingsDrawer } from '@/components/common/ColumnSettings';
import type { CuttingTask } from '@/types/production';

// D-325 显示字段：字段全由系统预设，用户只挑显隐；方案跟随账号（与全站各列表页同一套）
const CUTTING_TASK_COLUMNS = [
  { key: 'cover', label: '图片' },
  { key: 'productionOrderNo', label: '订单号' },
  { key: 'styleNo', label: '款号' },
  { key: 'styleName', label: '款名' },
  { key: 'factoryName', label: '生产方' },
  { key: 'orderCreatorName', label: '下单人' },
  { key: 'orderTime', label: '下单时间' },
  { key: 'orderQuantity', label: '数量' },
  { key: 'cuttingQuantity', label: '裁剪数' },
  { key: 'cuttingBundleCount', label: '扎数' },
  { key: 'receiverName', label: '裁剪员' },
  { key: 'receivedTime', label: '领取时间' },
  { key: 'bundledTime', label: '完成时间' },
  { key: 'remarks', label: '备注' },
  { key: 'attachments', label: '纸样' },
];
const CUTTING_COLUMN_GROUPS = [
  { title: '订单/款式', keys: ['cover', 'productionOrderNo', 'styleNo', 'styleName', 'factoryName', 'orderCreatorName'] },
  { title: '裁剪进度', keys: ['orderTime', 'orderQuantity', 'cuttingQuantity', 'cuttingBundleCount', 'receiverName', 'receivedTime', 'bundledTime'] },
  { title: '备注/附件', keys: ['remarks', 'attachments'] },
];
const CUTTING_COLUMN_PRESETS = [
  {
    key: 'simple', label: '精简',
    values: { cover: true, productionOrderNo: true, styleNo: true, orderQuantity: true, cuttingQuantity: true, bundledTime: true },
  },
  { key: 'standard', label: '标准', values: Object.fromEntries(CUTTING_TASK_COLUMNS.map((c) => [c.key, true])) },
];

interface CuttingTaskListViewProps {
  tasks: {
    activeStatFilter: string;
    cuttingStats: {
      totalCount: number;
      totalQuantity: number;
      pendingCount: number;
      receivedCount: number;
      bundledCount: number;
    };
    showAllTasks: boolean;
    setShowAllTasks: (v: boolean | ((prev: boolean) => boolean)) => void;
    handleStatClick: (type: 'all' | 'pending' | 'received' | 'bundled') => void;
    taskQuery: {
      page: number;
      pageSize: number;
      status: string;
      orderNo: string;
      styleNo: string;
      orgUnitId: string;
      factoryType: '' | 'INTERNAL' | 'EXTERNAL';
    };
    setTaskQuery: (updater: (prev: any) => any) => void;
    taskDateRange: any;
    setTaskDateRange: (v: any) => void;
    fetchTasks: () => void;
    sortedTaskList: CuttingTask[];
    taskLoading: boolean;
    taskTotal: number;
  };
  taskColumns: any[];
  onCreateTask: () => void;
}

const CuttingTaskListView: React.FC<CuttingTaskListViewProps> = ({ tasks, taskColumns, onCreateTask }) => {
  const cuttingColumnSettings = useColumnSettings({
    pageKey: 'cutting-task-list',
    bizType: 'cutting',
    allColumns: CUTTING_TASK_COLUMNS,
    defaultVisible: Object.fromEntries(CUTTING_TASK_COLUMNS.map((c) => [c.key, true])),
  });
  const [columnSettingsOpen, setColumnSettingsOpen] = useState(false);
  // 操作列常显，其余按显示字段方案过滤
  const visibleTaskColumns = useMemo(
    () => taskColumns.filter((c: any) => c.key === 'action' || cuttingColumnSettings.visibleColumns[c.key] !== false),
    [taskColumns, cuttingColumnSettings.visibleColumns],
  );

  return (
    <Card className="mb-sm">
      <PageStatCards
        activeKey={tasks.activeStatFilter}
        cards={[
          {
            key: 'all',
            items: [
              { label: '任务总数', value: tasks.cuttingStats.totalCount, unit: '条', color: 'var(--color-primary)' },
              { label: '总数量', value: tasks.cuttingStats.totalQuantity, unit: '件', color: 'var(--color-success)' },
            ],
            onClick: () => tasks.handleStatClick('all'),
            activeColor: 'var(--color-primary)',
          },
          {
            key: 'pending',
            items: [
              { label: '待领取', value: tasks.cuttingStats.pendingCount, unit: '条', color: 'var(--color-warning)' },
              { label: '数量', value: (tasks.cuttingStats as any).pendingQuantity ?? 0, unit: '件', color: 'var(--color-success)' },
            ],
            onClick: () => tasks.handleStatClick('pending'),
            activeColor: 'var(--color-warning)',
          },
          {
            key: 'received',
            items: [
              { label: '已领取', value: tasks.cuttingStats.receivedCount, unit: '条', color: 'var(--color-primary)' },
              { label: '数量', value: (tasks.cuttingStats as any).receivedQuantity ?? 0, unit: '件', color: 'var(--color-success)' },
            ],
            onClick: () => tasks.handleStatClick('received'),
            activeColor: 'var(--color-primary)',
          },
          {
            key: 'bundled',
            items: [
              { label: '已完成', value: tasks.cuttingStats.bundledCount, unit: '条', color: 'var(--color-success)' },
              { label: '数量', value: (tasks.cuttingStats as any).bundledQuantity ?? 0, unit: '件', color: 'var(--color-success)' },
            ],
            onClick: () => tasks.handleStatClick('bundled'),
            activeColor: 'var(--color-success)',
          },
        ]}
      />

      <StickyFilterBar>
      <StandardToolbar
        left={(
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <StandardSearchBar
              searchValue={tasks.taskQuery.orderNo || ''}
              onSearchChange={(value) => tasks.setTaskQuery(prev => ({ ...prev, orderNo: value, page: 1 }))}
              searchPlaceholder="订单号/款号/工厂名"
              dateValue={tasks.taskDateRange}
              onDateChange={tasks.setTaskDateRange}
              statusValue={tasks.taskQuery.status || ''}
              onStatusChange={(value) => tasks.setTaskQuery(prev => ({ ...prev, status: value, page: 1 }))}
              statusOptions={[
                { label: '全部', value: '' },
                { label: '待领取', value: 'pending' },
                { label: '已领取', value: 'received' },
                { label: '已完成', value: 'bundled' },
              ]}
              showSearchButton
              onSearch={() => tasks.fetchTasks()}
              showResetButton
              onReset={() => {
                tasks.setTaskQuery((prev) => ({ page: 1, pageSize: prev.pageSize, status: '', orderNo: '', styleNo: '', orgUnitId: '', factoryType: '' }));
                tasks.setTaskDateRange(null);
              }}
            />
            <Select
              value={tasks.taskQuery.factoryType || ''}
              onChange={(value) => tasks.setTaskQuery(prev => ({ ...prev, factoryType: value as 'INTERNAL' | 'EXTERNAL' | '', page: 1 }))}
              options={[
                { label: '全部工厂', value: '' },
                { label: '内部工厂', value: 'INTERNAL' },
                { label: '外发工厂', value: 'EXTERNAL' },
              ]}
              style={{ width: 132 }}
              placeholder="工厂类型"
            />
          </div>
        )}
        right={(
          <Space>
            <Button icon={<SettingOutlined />} onClick={() => setColumnSettingsOpen(true)}>
              显示字段
            </Button>
            <Button type="primary" onClick={onCreateTask}>
              无资料下单
            </Button>
          </Space>
        )}
      />
      </StickyFilterBar>

      <ResizableTable<CuttingTask>
        stickyHeader
        storageKey="cutting-task-table-v2"
        scroll={{ x: 'max-content' }}
        columns={visibleTaskColumns}
        dataSource={tasks.sortedTaskList}
        rowKey={(row) => row.id || row.productionOrderId}
        loading={tasks.taskLoading}
        emptyDescription="暂无裁剪数据"
        pagination={{
          current: tasks.taskQuery.page,
          pageSize: tasks.taskQuery.pageSize,
          total: tasks.taskTotal,
          showTotal: (total) => `共 ${total} 条`,
          showSizeChanger: true,
          pageSizeOptions: ['10', '20', '50', '100', '200'],
          onChange: (page, pageSize) => tasks.setTaskQuery(prev => ({ ...prev, page, pageSize })),
        }}
      />

      <ColumnSettingsDrawer
        open={columnSettingsOpen}
        onClose={() => setColumnSettingsOpen(false)}
        columnOptions={CUTTING_TASK_COLUMNS}
        visibleColumns={cuttingColumnSettings.visibleColumns}
        onToggle={cuttingColumnSettings.setVisible}
        onReset={cuttingColumnSettings.reset}
        title="显示字段"
        groups={CUTTING_COLUMN_GROUPS}
        presets={CUTTING_COLUMN_PRESETS}
        onApplyPreset={cuttingColumnSettings.applyValues}
      />
    </Card>
  );
};

export default CuttingTaskListView;
