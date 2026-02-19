import React, { useState, useEffect } from 'react';
import { Button, Card, message, Space, Tag } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import Layout from '@/components/Layout';
import ResizableTable from '@/components/common/ResizableTable';
import RowActions from '@/components/common/RowActions';
import api from '@/utils/api';
import dayjs from 'dayjs';
import PickingForm from './PickingForm';
import PickingDetailModal from './PickingDetailModal';

const MaterialPickingList: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [dataSource, setDataSource] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [current, setCurrent] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [modalVisible, setModalVisible] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [selectedPickingId, setSelectedPickingId] = useState<string | null>(null);

  const fetchList = async (page = current, size = pageSize) => {
    setLoading(true);
    try {
      const res: any = await api.get('/production/picking/list', {
        params: { page, pageSize: size },
      });
      if (res?.code === 200) {
        setDataSource(res.data.records);
        setTotal(res.data.total);
      }
    } catch (err: any) {
      message.error(`获取领料记录失败: ${err?.message || '请检查网络连接'}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchList();
  }, []);

  const columns = [
    {
      title: '领料单号',
      dataIndex: 'pickingNo',
      width: 150,
      render: (text: string, record: any) => (
        <a onClick={() => {
          setSelectedPickingId(record.id);
          setDetailVisible(true);
        }}>{text}</a>
      ),
    },
    {
      title: '生产订单',
      dataIndex: 'orderNo',
      width: 150,
    },
    {
      title: '款号',
      dataIndex: 'styleNo',
      width: 120,
    },
    {
      title: '领料人',
      dataIndex: 'pickerName',
      width: 100,
    },
    {
      title: '领料时间',
      dataIndex: 'pickTime',
      width: 160,
      render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-',
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (v: string) => <Tag color="green">已完成</Tag>,
    },
    {
      title: '备注',
      dataIndex: 'remark',
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_: any, record: any) => (
        <RowActions
          actions={[
            {
              key: 'detail',
              label: '详情',
              onClick: () => {
                setSelectedPickingId(record.id);
                setDetailVisible(true);
              }
            }
          ]}
        />
      ),
    },
  ];

  return (
    <Layout>
      <Card bordered={false}>
        <div style={{ marginBottom: 16 }}>
          <Button type="primary" onClick={() => setModalVisible(true)}>
            新建领料
          </Button>
        </div>
        <ResizableTable
          loading={loading}
          dataSource={dataSource}
          columns={columns}
          rowKey="id"
          pagination={{
            total,
            current,
            pageSize,
            showTotal: (total) => `共 ${total} 条`,
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50', '100'],
            onChange: (p, s) => {
              setCurrent(p);
              setPageSize(s);
              fetchList(p, s);
            },
          }}
        />
      </Card>
      <PickingForm
        visible={modalVisible}
        onCancel={() => setModalVisible(false)}
        onSuccess={() => {
          setModalVisible(false);
          fetchList(1);
        }}
      />
      <PickingDetailModal
        visible={detailVisible}
        pickingId={selectedPickingId}
        onCancel={() => {
          setDetailVisible(false);
          setSelectedPickingId(null);
        }}
      />
    </Layout>
  );
};

export default MaterialPickingList;
