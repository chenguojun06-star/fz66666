import React from 'react';
import { Button, Card, Select } from 'antd';
import PageStatCards from '@/components/common/PageStatCards';
import ResizableTable from '@/components/common/ResizableTable';
import StandardSearchBar from '@/components/common/StandardSearchBar';
import StandardToolbar from '@/components/common/StandardToolbar';
import StickyFilterBar from '@/components/common/StickyFilterBar';
import type { CuttingTask } from '@/types/production';

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
  return (
    <Card className="mb-sm">
      <PageStatCards
        activeKey={tasks.activeStatFilter}
        cards={[
          {
            key: 'all',
            items: [
              { label: '任务总数', value: tasks.cuttingStats.totalCount, unit: '条', color: 'var(--color-primary)' },
              { label: '总数量', value: tasks.cuttingStats.totalQuantity, color: 'var(--color-success)' },
            ],
            onClick: () => tasks.handleStatClick('all'),
            activeColor: 'var(--color-primary)',
          },
          {
            key: 'pending',
            items: [{ label: '待领取', value: tasks.cuttingStats.pendingCount, unit: '条', color: 'var(--color-warning)' }],
            onClick: () => tasks.handleStatClick('pending'),
            activeColor: 'var(--color-warning)',
          },
          {
            key: 'received',
            items: [{ label: '已领取', value: tasks.cuttingStats.receivedCount, unit: '条', color: 'var(--color-primary)' }],
            onClick: () => tasks.handleStatClick('received'),
            activeColor: 'var(--color-primary)',
          },
          {
            key: 'bundled',
            items: [{ label: '已完成', value: tasks.cuttingStats.bundledCount, unit: '条', color: 'var(--color-success)' }],
            onClick: () => tasks.handleStatClick('bundled'),
            activeColor: 'var(--color-success)',
          },
        ]}
        extraRight={
          <button
            type="button"
            onClick={() => tasks.setShowAllTasks(v => !v)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              border: '1px solid var(--color-border-antd)',
              background: 'var(--color-bg-base)',
              color: !tasks.showAllTasks ? 'var(--color-text-secondary)' : 'var(--color-primary)',
              borderRadius: 4,
              padding: '4px 10px',
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer',
              lineHeight: 1.4,
              whiteSpace: 'nowrap',
            }}
          >
            {tasks.showAllTasks ? '只看进行中' : '显示全部'}
          </button>
        }
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
          <Button type="primary" onClick={onCreateTask}>
            无资料下单
          </Button>
        )}
      />
      </StickyFilterBar>

      <ResizableTable<CuttingTask>
        stickyHeader
        storageKey="cutting-task-table-v2"
        scroll={{ x: 'max-content' }}
        columns={taskColumns}
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
    </Card>
  );
};

export default CuttingTaskListView;
