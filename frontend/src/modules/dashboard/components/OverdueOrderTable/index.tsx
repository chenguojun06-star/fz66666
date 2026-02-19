import React, { useEffect, useState } from 'react';
import { Card, Spin } from 'antd';
import { ColumnsType } from 'antd/es/table';
import { CaretUpOutlined, CaretDownOutlined } from '@ant-design/icons';
import api from '@/utils/api';
import ResizableTable from '@/components/common/ResizableTable';
import './styles.css';

interface OverdueOrder {
  id: string;  // 修复：后端返回的是字符串类型的UUID
  orderNo: string;
  styleNo: string;
  quantity: number;
  deliveryDate: string;
  overdueDays: number;
  factoryName?: string;  // 工厂名称
}

const OverdueOrderTable: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [dataSource, setDataSource] = useState<OverdueOrder[]>([]);
  const [sortField, setSortField] = useState<'deliveryDate' | 'overdueDays' | null>(null);
  const [sortOrder, setSortOrder] = useState<'ascend' | 'descend' | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // 调用真实API获取延期订单列表
      const result = await api.get('/dashboard/overdue-orders');

      // 后端返回格式：{ code: 200, data: [...], message: "...", requestId: "..." }
      // 需要取 result.data 中的数组
      const orders = result?.data || result;

      if (Array.isArray(orders)) {
        setDataSource(orders);
      } else if (Array.isArray(result)) {
        setDataSource(result);
      } else {
        setDataSource([]);
      }
    } catch (error) {
      console.error('Failed to load overdue orders:', error);
      // 错误时显示空列表
      setDataSource([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (field: 'deliveryDate' | 'overdueDays') => {
    let newOrder: 'ascend' | 'descend' = 'ascend';

    if (sortField === field) {
      if (sortOrder === 'ascend') {
        newOrder = 'descend';
      } else if (sortOrder === 'descend') {
        // 第三次点击取消排序
        setSortField(null);
        setSortOrder(null);
        return;
      }
    }

    setSortField(field);
    setSortOrder(newOrder);
  };

  const renderSortIcon = (field: 'deliveryDate' | 'overdueDays') => {
    if (sortField !== field) {
      return (
        <span className="sort-icon-container">
          <CaretUpOutlined className="sort-icon sort-icon-inactive" />
          <CaretDownOutlined className="sort-icon sort-icon-inactive" />
        </span>
      );
    }

    return (
      <span className="sort-icon-container">
        <CaretUpOutlined
          className={`sort-icon ${sortOrder === 'ascend' ? 'sort-icon-active' : 'sort-icon-inactive'}`}
        />
        <CaretDownOutlined
          className={`sort-icon ${sortOrder === 'descend' ? 'sort-icon-active' : 'sort-icon-inactive'}`}
        />
      </span>
    );
  };

  const columns: ColumnsType<OverdueOrder> = [
    {
      title: '订单号',
      dataIndex: 'orderNo',
      key: 'orderNo',
      width: '25%',
      ellipsis: true,
    },
    {
      title: '款号',
      dataIndex: 'styleNo',
      key: 'styleNo',
      width: '20%',
      ellipsis: true,
    },
    {
      title: '数量',
      dataIndex: 'quantity',
      key: 'quantity',
      width: '15%',
      align: 'right',
      render: (value: number) => value.toLocaleString(),
    },
    {
      title: (
        <div
          className="sortable-header"
          onClick={() => handleSort('deliveryDate')}
        >
          <span>交货日期</span>
          {renderSortIcon('deliveryDate')}
        </div>
      ),
      dataIndex: 'deliveryDate',
      key: 'deliveryDate',
      width: '20%',
      sorter: sortField === 'deliveryDate' ? {
        compare: (a, b) => {
          const dateA = new Date(a.deliveryDate).getTime();
          const dateB = new Date(b.deliveryDate).getTime();
          return dateA - dateB;
        },
      } : undefined,
      sortOrder: sortField === 'deliveryDate' ? sortOrder : null,
    },
    {
      title: (
        <div
          className="sortable-header"
          onClick={() => handleSort('overdueDays')}
        >
          <span>延期天数</span>
          {renderSortIcon('overdueDays')}
        </div>
      ),
      dataIndex: 'overdueDays',
      key: 'overdueDays',
      width: '20%',
      align: 'right',
      sorter: sortField === 'overdueDays' ? {
        compare: (a, b) => a.overdueDays - b.overdueDays,
      } : undefined,
      sortOrder: sortField === 'overdueDays' ? sortOrder : null,
      render: (value: number) => (
        <span className="overdue-days">{value} 天</span>
      ),
    },
    {
      title: '工厂',
      dataIndex: 'factoryName',
      key: 'factoryName',
      width: '15%',
      ellipsis: true,
      render: (value: string) => value || '-',
    },
  ];

  return (
    <Card
      title="延期订单列表"
      className="overdue-order-table-card"
      variant="borderless"
    >
      <Spin spinning={loading}>
        <ResizableTable
          storageKey="overdue-order"
          columns={columns}
          dataSource={dataSource}
          rowKey="id"
          pagination={{
            pageSize: 10,
            showSizeChanger: false,
            showTotal: (total) => `共 ${total} 条`,
            pageSizeOptions: ['10', '20', '50', '100'],
          }}
          size="middle"
          className="overdue-order-table"
        />
      </Spin>
    </Card>
  );
};

export default OverdueOrderTable;
