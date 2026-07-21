import React from 'react';
import { Button, Descriptions, Progress, Space, Tabs, Tag } from 'antd';
import { DollarOutlined, LinkOutlined, UserOutlined } from '@ant-design/icons';
import ResizableModal from '@/components/common/ResizableModal';
import ResizableTable from '@/components/common/ResizableTable';
import { formatMoney } from '@/utils/format';
import type { Customer, Receivable } from '@/services/crm/customerApi';
import type { ProductionOrder } from '@/types/production';
import { ORDER_STATUS_LABEL, ORDER_STATUS_COLOR } from '@/constants/orderStatus';
import { RECEIVABLE_STATUS_CONFIG } from '../helpers';

interface CustomerDetailDrawerProps {
  open: boolean;
  drawerData: Customer | null;
  drawerOrders: any[];
  drawerLoading: boolean;
  drawerReceivables: Receivable[];
  drawerReceivableLoading: boolean;
  onClose: () => void;
  handleShareOrder: (order: ProductionOrder) => void;
}

// 客户详情弹窗（基本信息 / 生产订单 / 应收账款）
const CustomerDetailDrawer: React.FC<CustomerDetailDrawerProps> = ({
  open,
  drawerData,
  drawerOrders,
  drawerLoading,
  drawerReceivables,
  drawerReceivableLoading,
  onClose,
  handleShareOrder,
}) => {
  return (
    <ResizableModal
      title={<Space><UserOutlined />{drawerData?.companyName}</Space>}
      open={open}
      onCancel={onClose}
      footer={null}
      width="85vw"
      initialHeight={Math.round(window.innerHeight * 0.82)}
      destroyOnHidden
    >
      {drawerData && (
        <Tabs
          items={[
            {
              key: 'info',
              label: '基本信息',
              children: (
                <Descriptions column={2} bordered>
                  <Descriptions.Item label="客户编号">{drawerData.customerNo}</Descriptions.Item>
                  <Descriptions.Item label="等级">
                    {drawerData.customerLevel === 'VIP' ? <Tag color="gold">VIP</Tag> : <Tag>普通</Tag>}
                  </Descriptions.Item>
                  <Descriptions.Item label="联系人">{drawerData.contactPerson || '-'}</Descriptions.Item>
                  <Descriptions.Item label="联系电话">{drawerData.contactPhone || '-'}</Descriptions.Item>
                  <Descriptions.Item label="邮箱" span={2}>{drawerData.contactEmail || '-'}</Descriptions.Item>
                  <Descriptions.Item label="地址" span={2}>{drawerData.address || '-'}</Descriptions.Item>
                  <Descriptions.Item label="所属行业">{drawerData.industry || '-'}</Descriptions.Item>
                  <Descriptions.Item label="客户来源">{drawerData.source || '-'}</Descriptions.Item>
                  <Descriptions.Item label="状态">
                    {drawerData.status === 'ACTIVE' ? <Tag color="green">合作中</Tag> : <Tag>已停合作</Tag>}
                  </Descriptions.Item>
                  <Descriptions.Item label="创建人">{drawerData.creatorName || '-'}</Descriptions.Item>
                  <Descriptions.Item label="备注" span={2}>{drawerData.remark || '-'}</Descriptions.Item>
                </Descriptions>
              ),
            },
            {
              key: 'orders',
              label: `生产订单${drawerOrders.length > 0 ? ` (${drawerOrders.length})` : ''}`,
              children: (
                <ResizableTable
                  rowKey="id"
                  loading={drawerLoading}
                  dataSource={drawerOrders}

                  pagination={{ pageSize: 8, showTotal: t => `共 ${t} 条` }}
                  columns={[
                    { title: '订单号', dataIndex: 'orderNo', width: 160 },
                    { title: '款式', dataIndex: 'styleName', width: 120 },
                    { title: '数量', dataIndex: 'orderQuantity', width: 80 },
                    {
                      title: '生产进度', dataIndex: 'productionProgress', width: 150,
                      render: v => (
                        <Progress
                          percent={Number(v) || 0}

                          strokeColor={Number(v) >= 100 ? 'var(--color-success)' : undefined}
                        />
                      ),
                    },
                    {
                      title: '状态', dataIndex: 'status', width: 100,
                      render: (v: string) => {
                        const s = String(v || '').toLowerCase();
                        const label = ORDER_STATUS_LABEL[s];
                        return <Tag color={ORDER_STATUS_COLOR[s] ?? 'default'}>{label ?? '未知'}</Tag>;
                      },
                    },
                    { title: '创建时间', dataIndex: 'createTime', width: 110, render: v => v?.substring(0, 10) ?? '-' },
                    {
                      title: '操作', width: 120,
                      render: (_, order: any) => (
                        <Button

                          icon={<LinkOutlined />}
                          onClick={() => {
                            void handleShareOrder({
                              id: order.id,
                              orderNo: order.orderNo,
                            } as ProductionOrder);
                          }}
                        >
                          追踪链接
                        </Button>
                      ),
                    },
                  ]}
                  locale={{ emptyText: '暂无关联订单' }}
                />
              ),
            },
            {
              key: 'receivables',
              label: (
                <Space size={4}>
                  <DollarOutlined />
                  {`应收账款${drawerReceivables.length > 0 ? ` (${drawerReceivables.length})` : ''}`}
                </Space>
              ),
              children: (
                <ResizableTable
                  rowKey="id"
                  loading={drawerReceivableLoading}
                  dataSource={drawerReceivables}

                  pagination={{ pageSize: 8, showTotal: (t: number) => `共 ${t} 条` }}
                  columns={[
                    { title: '单号', dataIndex: 'receivableNo', width: 150 },
                    { title: '应收金额', dataIndex: 'amount', width: 110, render: (v: number) => formatMoney(v) },
                    { title: '已收金额', dataIndex: 'receivedAmount', width: 110, render: (v: number) => formatMoney(v ?? 0) },
                    { title: '到期日', dataIndex: 'dueDate', width: 110, render: (v: string) => v || '-' },
                    {
                      title: '状态', dataIndex: 'status', width: 110,
                      render: (v: string) => {
                        const c = RECEIVABLE_STATUS_CONFIG[v] ?? { label: v, color: 'default' };
                        return <Tag color={c.color}>{c.label}</Tag>;
                      },
                    },
                  ]}
                  locale={{ emptyText: '暂无应收账款' }}
                />
              ),
            },
          ]}
        />
      )}
    </ResizableModal>
  );
};

export default CustomerDetailDrawer;
