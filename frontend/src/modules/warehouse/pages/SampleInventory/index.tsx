import React, { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  Input,
  Tag,
  Tooltip,
  Select,
  Image,
} from 'antd';
import {
  PlusOutlined,
  SearchOutlined,
  HistoryOutlined,
  ExportOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import Layout from '@/components/Layout';
import api from '@/utils/api';
import { useModal, useTablePagination } from '@/hooks';
import { SampleStock, SampleTypeMap } from './types';
import InboundModal from './InboundModal';
import LoanModal from './LoanModal';
import LoanHistoryDrawer from './LoanHistoryDrawer';

const { Option } = Select;

const SampleInventory: React.FC = () => {
  const pagination = useTablePagination(20);
  const [loading, setLoading] = useState(false);
  const [dataSource, setDataSource] = useState<SampleStock[]>([]);
  const [searchText, setSearchText] = useState('');
  const [sampleType, setSampleType] = useState<string | undefined>(undefined);

  const inboundModal = useModal<void>();
  const loanModal = useModal<SampleStock>();
  const historyDrawer = useModal<SampleStock>();

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await api.get('/stock/sample/page', {
        params: {
          page: pagination.pagination.current,
          pageSize: pagination.pagination.pageSize,
          styleNo: searchText,
          sampleType,
        },
      });
      if (res.code === 200) {
        setDataSource(res.data.records || []);
        pagination.setTotal(res.data.total || 0);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagination.pagination.current, pagination.pagination.pageSize, searchText, sampleType]);

  const columns: ColumnsType<SampleStock> = [
    {
      title: '样衣图片',
      dataIndex: 'imageUrl',
      key: 'imageUrl',
      width: 80,
      render: (text) => (
        <Image
          src={text || "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iODAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjYwIiBoZWlnaHQ9IjgwIiBmaWxsPSIjZjBmMGYwIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxMiIgZmlsbD0iIzk5OSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZG9taW5hbnQtYmFzZWxpbmU9Im1pZGRsZSI+5qC36KGoPC90ZXh0Pjwvc3ZnPg=="}
          alt="样衣"
          width={60}
          height={80}
          style={{ objectFit: 'cover', borderRadius: 4 }}
        />
      ),
    },
    {
      title: '款号',
      dataIndex: 'styleNo',
      key: 'styleNo',
      width: 120,
      render: (text) => <strong>{text}</strong>,
    },
    {
      title: '款式名称',
      dataIndex: 'styleName',
      key: 'styleName',
      width: 150,
      ellipsis: true,
    },
    {
      title: '类型',
      dataIndex: 'sampleType',
      key: 'sampleType',
      width: 100,
      render: (text) => <Tag>{SampleTypeMap[text] || text}</Tag>,
    },
    {
      title: '颜色/尺码',
      key: 'spec',
      width: 120,
      render: (_, record) => `${record.color} / ${record.size}`,
    },
    {
      title: '库存概览',
      key: 'stock',
      width: 150,
      render: (_, record) => {
        const available = record.quantity - record.loanedQuantity;
        return (
          <Space>
            <Tooltip title="在库数量">
              <Tag color="green">{available}</Tag>
            </Tooltip>
            /
            <Tooltip title="总库存">
              <Tag>{record.quantity}</Tag>
            </Tooltip>
            {record.loanedQuantity > 0 && (
              <Tooltip title="借出数量">
                <Tag color="orange">借出: {record.loanedQuantity}</Tag>
              </Tooltip>
            )}
          </Space>
        );
      },
    },
    {
      title: '位置',
      dataIndex: 'location',
      key: 'location',
      width: 100,
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          <Button
            type="link"
            size="small"
            icon={<ExportOutlined />}
            disabled={record.quantity - record.loanedQuantity <= 0}
            onClick={() => loanModal.open(record)}
          >
            借出
          </Button>
          <Button
            type="link"
            size="small"
            icon={<HistoryOutlined />}
            onClick={() => historyDrawer.open(record)}
          >
            记录
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <Layout>
      <div style={{ padding: '16px 24px' }}>
        <Card>
          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
            <Space>
              <Input
                placeholder="搜索款号"
                prefix={<SearchOutlined />}
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                onPressEnter={loadData}
                style={{ width: 200 }}
                allowClear
              />
              <Select
                placeholder="样衣类型"
                value={sampleType}
                onChange={setSampleType}
                style={{ width: 150 }}
                allowClear
              >
                {Object.entries(SampleTypeMap).map(([key, label]) => (
                  <Option key={key} value={key}>{label}</Option>
                ))}
              </Select>
              <Button type="primary" onClick={loadData} icon={<SearchOutlined />}>
                查询
              </Button>
            </Space>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => inboundModal.open()}>
              样衣入库
            </Button>
          </div>

          <Table
            columns={columns}
            dataSource={dataSource}
            loading={loading}
            rowKey="id"
            pagination={{
              ...pagination.pagination,
              onChange: pagination.onChange,
            }}
          />
        </Card>

        <InboundModal
          visible={inboundModal.visible}
          onCancel={inboundModal.close}
          onSuccess={() => {
            inboundModal.close();
            loadData();
          }}
        />

        <LoanModal
          visible={loanModal.visible}
          stock={loanModal.data}
          onCancel={loanModal.close}
          onSuccess={() => {
            loanModal.close();
            loadData();
          }}
        />

        <LoanHistoryDrawer
          visible={historyDrawer.visible}
          stock={historyDrawer.data}
          onClose={historyDrawer.close}
          onRefresh={loadData}
        />
      </div>
    </Layout>
  );
};

export default SampleInventory;
