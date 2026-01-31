import React, { useState, useEffect } from 'react';
import { Tabs, App } from 'antd';
import Layout from '@/components/Layout';
import { ProductionOrder } from '@/types/production';
import { useNavigate } from 'react-router-dom';
import { useViewport } from '@/utils/useViewport';
import { templateLibraryApi } from '@/services/template/templateLibraryApi';

// 导入已创建的 Hooks 和组件
import useOrderList from './hooks/useOrderList';
import useOrderActions from './hooks/useOrderActions';
import FilterPanel from './components/FilterPanel';
import OrderTable from './components/OrderTable';
import OrderDetailModal from './components/OrderDetailModal';
import QuickEditModal from './components/QuickEditModal';
import LogModal from './components/LogModal';
import ProcessDetailModal from './components/ProcessDetailModal';

import './styles.css';

const ProductionList: React.FC = () => {
  const { message } = App.useApp();
  const { isMobile } = useViewport();
  const navigate = useNavigate();

  // ===== Hooks：数据和操作 =====
  const {
    productionList,
    loading,
    pagination,
    fetchProductionList,
    handlePageChange,
  } = useOrderList();

  const {
    quickEdit,
    closeOrder,
    scrapOrder,
  } = useOrderActions(() => {
    // 操作后刷新列表
    fetchProductionList(filters);
  });

  // ===== 状态管理 =====
  const [filters, setFilters] = useState<any>({});
  const [activeTab, setActiveTab] = useState<string>('all');

  // 弹窗状态
  const [detailVisible, setDetailVisible] = useState(false);
  const [currentRecord, setCurrentRecord] = useState<ProductionOrder | null>(null);
  const [quickEditVisible, setQuickEditVisible] = useState(false);
  const [logVisible, setLogVisible] = useState(false);
  const [logRecords, setLogRecords] = useState<any[]>([]);
  const [processDetailVisible, setProcessDetailVisible] = useState(false);
  const [processDetailType, setProcessDetailType] = useState<string>('all');

  // 列显示控制
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(() => {
    const saved = localStorage.getItem('production-list-visible-columns');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return {};
      }
    }
    return {};
  });

  // 保存列显示状态
  useEffect(() => {
    localStorage.setItem('production-list-visible-columns', JSON.stringify(visibleColumns));
  }, [visibleColumns]);

  // ===== 初始加载 =====
  useEffect(() => {
    fetchProductionList(filters);
  }, []);

  // ===== 处理函数 =====

  // 筛选
  const handleSearch = (newFilters: any) => {
    setFilters(newFilters);
    fetchProductionList(newFilters);
  };

  // 重置筛选
  const handleReset = () => {
    setFilters({});
    setActiveTab('all');
    fetchProductionList({});
  };

  // 导出Excel
  const handleExport = () => {
    message.info('导出功能开发中');
  };

  // 打开订单详情
  const handleRowClick = (record: ProductionOrder) => {
    setCurrentRecord(record);
    setDetailVisible(true);
  };

  // 打开快速编辑
  const handleQuickEdit = (record: ProductionOrder) => {
    setCurrentRecord(record);
    setQuickEditVisible(true);
  };

  // 打开工序详情
  const handleProcessDetail = (record: ProductionOrder, type: string) => {
    setCurrentRecord(record);
    setProcessDetailType(type);
    setProcessDetailVisible(true);
  };

  // 从模板同步工序
  const handleSyncProcess = async (record: ProductionOrder) => {
    const styleNo = String(record.styleNo || '').trim();
    if (!styleNo) {
      message.error('订单款号为空，无法同步');
      return;
    }

    try {
      // 从模板库获取最新工序数据
      const res = await templateLibraryApi.progressNodeUnitPrices(styleNo);
      const result = res as Record<string, unknown>;
      if (result.code !== 200) {
        message.error('获取工序模板失败');
        return;
      }

      const rows = Array.isArray(result.data) ? result.data : [];
      if (rows.length === 0) {
        message.warning('未找到该款号的工序模板');
        return;
      }

      // 构建新的 progressWorkflowJson
      const allProcesses = rows.map((item: any, idx: number) => ({
        id: String(item.id || item.processCode || item.name || '').trim(),
        name: String(item.name || item.processName || '').trim(),
        unitPrice: Number(item.unitPrice) || 0,
        progressStage: String(item.progressStage || item.name || '').trim(),
        machineType: String(item.machineType || '').trim(),
        standardTime: Number(item.standardTime) || 0,
        sortOrder: idx,
      }));

      // 按 progressStage 分组
      const processesByNode: Record<string, typeof allProcesses> = {};
      for (const p of allProcesses) {
        const stage = p.progressStage || p.name;
        if (!processesByNode[stage]) {
          processesByNode[stage] = [];
        }
        processesByNode[stage].push(p);
      }

      const progressWorkflowJson = JSON.stringify({
        nodes: allProcesses,
        processesByNode,
      });

      // 调用快速编辑API更新订单
      await quickEdit(record, { progressWorkflowJson });
      message.success(`已同步 ${allProcesses.length} 个工序`);
    } catch (e) {
      console.error('同步工序失败:', e);
      message.error('同步工序失败');
    }
  };

  // Tab切换
  const handleTabChange = (key: string) => {
    setActiveTab(key);
    const newFilters = {
      ...filters,
      status: key === 'all' ? undefined : key,
    };
    setFilters(newFilters);
    fetchProductionList(newFilters);
  };

  // ===== 渲染 =====
  return (
    <Layout
      title="生产订单列表"
      breadcrumb={[{ title: '生产管理' }, { title: '订单列表' }]}
    >
      <div style={{ padding: isMobile ? 12 : 24 }}>
        {/* 筛选面板 */}
        <FilterPanel
          filters={filters}
          onSearch={handleSearch}
          onReset={handleReset}
          onExport={handleExport}
        />

        {/* Tab切换 */}
        <Tabs
          activeKey={activeTab}
          onChange={handleTabChange}
          style={{ marginTop: 16 }}
          items={[
            {
              key: 'all',
              label: `全部订单 (${activeTab === 'all' ? pagination.total : '-'})`,
            },
            {
              key: 'in_progress',
              label: '生产中',
            },
            {
              key: 'completed',
              label: '已完成',
            },
            {
              key: 'cancelled',
              label: '已取消',
            },
          ]}
        />

        {/* 表格 */}
        <OrderTable
          dataSource={productionList}
          loading={loading}
          pagination={{
            current: pagination.page,
            pageSize: pagination.pageSize,
            total: pagination.total,
            onChange: handlePageChange,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `共 ${total} 条`,
          }}
          onRowClick={handleRowClick}
          onQuickEdit={handleQuickEdit}
          onProcessDetail={handleProcessDetail}
          onSyncProcess={handleSyncProcess}
          visibleColumns={visibleColumns}
          isMobile={isMobile}
        />

        {/* ===== 弹窗组 ===== */}

        {/* 订单详情弹窗 */}
        <OrderDetailModal
          visible={detailVisible}
          order={currentRecord}
          onClose={() => {
            setDetailVisible(false);
            setCurrentRecord(null);
          }}
          isMobile={isMobile}
        />

        {/* 快速编辑弹窗 */}
        <QuickEditModal
          visible={quickEditVisible}
          record={currentRecord}
          onClose={() => {
            setQuickEditVisible(false);
            setCurrentRecord(null);
          }}
          onSave={async (updates) => {
            if (currentRecord) {
              await quickEdit(currentRecord, updates);
              setQuickEditVisible(false);
              setCurrentRecord(null);
            }
          }}
        />

        {/* 扫码日志弹窗 */}
        <LogModal
          visible={logVisible}
          records={logRecords}
          onClose={() => {
            setLogVisible(false);
            setLogRecords([]);
          }}
        />

        {/* 工序详情弹窗 */}
        <ProcessDetailModal
          visible={processDetailVisible}
          record={currentRecord}
          type={processDetailType}
          onClose={() => {
            setProcessDetailVisible(false);
            setCurrentRecord(null);
          }}
          onSave={() => {
            fetchProductionList(filters);
          }}
        />
      </div>
    </Layout>
  );
};

export default ProductionList;
