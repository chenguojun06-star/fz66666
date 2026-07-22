/**
 * 标签管理页面（洗水唛 / U编码）
 *
 * 功能：
 *   - 按订单查看洗水唛（成分/洗涤说明）和 U 编码
 *   - 洗水唛数据来源于款式开发（styleInfo），下单后由款式信息同步
 *   - U 编码默认按「款号-颜色-码数-订单号后6位」自动生成，用户可在行内覆盖
 *   - 支持单条及批量打印洗水唛 / 吊牌
 */
import React from 'react';
import { Button, Input, Select, Space, Tag } from 'antd';
import { PrinterOutlined, ReloadOutlined, TagOutlined } from '@ant-design/icons';
import ResizableTable from '@/components/common/ResizableTable';
import StandardToolbar from '@/components/common/StandardToolbar';
import type { ProductionOrder } from '@/types/production';
import WashLabelBatchPrintModal from './components/WashLabelBatchPrintModal';
import { useWashLabelData } from './useWashLabelData';
import { useWashLabelPrint } from './useWashLabelPrint';
import { buildColumns } from './columns';

const { Option } = Select;

const WashLabelPage: React.FC = () => {
  const {
    orders,
    loading,
    total,
    page,
    setPage,
    pageSize,
    searchOrderNo,
    setSearchOrderNo,
    searchStyleNo,
    setSearchStyleNo,
    statusFilter,
    setStatusFilter,
    styleCache,
    uCodeOverrides,
    setUCodeOverrides,
    getUCode,
    refresh,
    fetchStyleInfoForOrders,
  } = useWashLabelData();

  const {
    selectedRowKeys,
    setSelectedRowKeys,
    batchPrintOpen,
    batchPrintItems,
    batchPrintLoading,
    printingOrderId,
    openBatchPrint,
    handleBatchPrint,
    closeBatchPrint,
  } = useWashLabelPrint({
    orders,
    styleCache,
    fetchStyleInfoForOrders,
    getUCode,
  });

  const columns = buildColumns({
    styleCache,
    uCodeOverrides,
    setUCodeOverrides,
    getUCode,
    printingOrderId,
    openBatchPrint,
  });

  return (
    <>
      <div style={{ padding: 16 }}>
        <div style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
            <TagOutlined style={{ marginRight: 8, color: 'var(--primary-color)' }} />
            标签管理（洗水唛 / U编码）
          </h2>
          <div style={{ marginTop: 4, fontSize: 14, color: '#888' }}>
            洗水唛数据来源于款式开发，下单后自动同步；U编码支持行内修改
          </div>
        </div>

        <StandardToolbar
          left={
            <Space wrap>
              <Input
                placeholder="订单号"
                value={searchOrderNo}
                onChange={e => setSearchOrderNo(e.target.value)}
                onPressEnter={refresh}
                allowClear
                style={{ width: 140 }}
              />
              <Input
                placeholder="款号"
                value={searchStyleNo}
                onChange={e => setSearchStyleNo(e.target.value)}
                onPressEnter={refresh}
                allowClear
                style={{ width: 120 }}
              />
              <Select
                value={statusFilter}
                onChange={v => { setStatusFilter(v); setPage(1); }}
                style={{ width: 110 }}
                placeholder="状态"
              >
                <Option value="">全部状态</Option>
                <Option value="pending">待生产</Option>
                <Option value="production">生产中</Option>
                <Option value="completed">已完成</Option>
              </Select>
              <Button icon={<ReloadOutlined />} onClick={refresh}>
                刷新
              </Button>
            </Space>
          }
          right={
            <Space>
              {selectedRowKeys.length > 0 && (
                <Tag color="blue">{selectedRowKeys.length} 条已选</Tag>
              )}
              <Button
                type="primary"
                icon={<PrinterOutlined />}
                loading={batchPrintLoading}
                disabled={selectedRowKeys.length === 0}
                onClick={() => void handleBatchPrint()}
              >
                批量打印标签
              </Button>
            </Space>
          }
        />

        <ResizableTable<ProductionOrder>
          rowKey="id"
          columns={columns}
          dataSource={orders}
          loading={loading}
          emptyDescription="暂无生产订单"
          stickyHeader
          scroll={{ x: 1200 }}
          rowSelection={{
            selectedRowKeys,
            onChange: setSelectedRowKeys,
          }}
          pagination={{
            current: page,
            pageSize,
            total,
            onChange: (p) => setPage(p),
            showSizeChanger: false,
            showTotal: (t) => `共 ${t} 条`,
          }}
        />
      </div>

      <WashLabelBatchPrintModal
        open={batchPrintOpen}
        onClose={closeBatchPrint}
        items={batchPrintItems}
        loading={batchPrintLoading}
      />
    </>
  );
};

export default WashLabelPage;
