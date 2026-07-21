import React, { useMemo } from 'react';
import { Button, Space, Tag } from 'antd';
import { SendOutlined, ReloadOutlined } from '@ant-design/icons';
import ResizableTable from '@/components/common/ResizableTable';
import type { FactoryShipment } from '@/types/production';
import { useFactoryShipmentTabData } from './useFactoryShipmentTabData';
import { buildColumns } from './columns';
import ExpandedDetail from './ExpandedDetail';
import ShipModal from './ShipModal';
import ReceiveModal from './ReceiveModal';
import type { FactoryShipmentTabProps } from './types';

/**
 * 外发工厂发货 Tab：发货记录列表 + 新建发货 + 收货确认
 */
const FactoryShipmentTab: React.FC<FactoryShipmentTabProps> = ({ selectedFactoryId }) => {
  const data = useFactoryShipmentTabData(selectedFactoryId);

  const columns = useMemo(
    () => buildColumns({ onReceiveClick: data.handleReceiveClick, onDelete: data.handleDelete }),
    [data.handleReceiveClick, data.handleDelete],
  );

  return (
    <div style={{ padding: '0 16px 16px' }}>
      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Space>
          <Tag color="blue">共 {data.total} 条记录</Tag>
        </Space>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={data.fetchShipments} loading={data.loading}>刷新</Button>
          <Button type="primary" icon={<SendOutlined />} onClick={data.handleOpenShip}>
            新建发货
          </Button>
        </Space>
      </div>

      <ResizableTable<FactoryShipment>
        columns={columns}
        dataSource={data.shipments}
        rowKey="id"
        loading={data.loading}
        emptyDescription="暂无发货数据"
        scroll={{ x: 'max-content' }}
        expandable={{
          expandedRowRender: (record) => (
            <ExpandedDetail
              details={data.expandedDetails[record.id!] || []}
              loading={!!data.expandedLoading[record.id!]}
            />
          ),
          onExpand: data.handleExpandRow,
        }}
        pagination={{
          current: data.page,
          pageSize: data.pageSize,
          total: data.total,
          onChange: (p, ps) => { data.setPage(p); data.setPageSize(ps); },
          showTotal: (t) => `共 ${t} 条`,
          showSizeChanger: true,
          pageSizeOptions: ['10', '20', '50'],
        }}
      />

      <ShipModal
        open={data.shipModalOpen}
        loading={data.shipLoading}
        form={data.shipForm}
        orderList={data.orderList}
        orderLoading={data.orderLoading}
        shippableInfo={data.shippableInfo}
        shipDetails={data.shipDetails}
        onCancel={() => data.setShipModalOpen(false)}
        onOk={data.handleShip}
        onOrderSelect={data.handleOrderSelect}
        onShipDetailsChange={data.setShipDetails}
      />

      <ReceiveModal
        open={data.receiveModalOpen}
        loading={data.receiveLoading}
        record={data.receiveRecord}
        receiveQty={data.receiveQty}
        onCancel={() => data.setReceiveModalOpen(false)}
        onOk={data.handleReceiveConfirm}
        onReceiveQtyChange={data.setReceiveQty}
      />
    </div>
  );
};

export default FactoryShipmentTab;
