import React, { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  Tag,
  Tooltip,
  Image,
} from 'antd';
import {
  PlusOutlined,
  HistoryOutlined,
  ExportOutlined,
} from '@ant-design/icons';
import RowActions from '@/components/common/RowActions';
import type { ColumnsType } from 'antd/es/table';
import Layout from '@/components/Layout';
import StandardSearchBar from '@/components/common/StandardSearchBar';
import StandardToolbar from '@/components/common/StandardToolbar';
import api from '@/utils/api';
import { useModal, useTablePagination } from '@/hooks';
import { SampleStock, SampleTypeMap } from './types';
import InboundModal from './InboundModal';
import LoanModal from './LoanModal';
import LoanHistoryDrawer from './LoanHistoryDrawer';
import type { Dayjs } from 'dayjs';

const SampleInventory: React.FC = () => {
  const pagination = useTablePagination(20);
  const [loading, setLoading] = useState(false);
  const [dataSource, setDataSource] = useState<SampleStock[]>([]);
  const [searchText, setSearchText] = useState('');
  const [sampleType, setSampleType] = useState<string | undefined>(undefined);
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);

  const inboundModal = useModal<void>();
  const loanModal = useModal<SampleStock>();
  const historyDrawer = useModal<SampleStock>();

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await api.get('/stock/sample/list', {
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
        <RowActions
          actions={[
            {
              label: '借出',
              icon: <ExportOutlined />,
              disabled: record.quantity - record.loanedQuantity <= 0,
              onClick: () => loanModal.open(record)
            },
            {
              label: '记录',
              icon: <HistoryOutlined />,
              onClick: () => historyDrawer.open(record)
            }
          ]}
        />
      ),
    },
  ];

  return (
    <Layout>
      <div style={{ padding: '16px 24px' }}>
        <Card>
          <div style={{ marginBottom: 16 }}>
            <StandardToolbar
              left={(
                <StandardSearchBar
                  searchValue={searchText}
                  onSearchChange={setSearchText}
                  searchPlaceholder="搜索款号"
                  dateValue={dateRange}
                  onDateChange={setDateRange}
                  statusValue={sampleType || ''}
                  onStatusChange={(value) => setSampleType(value || undefined)}
                  statusOptions={Object.entries(SampleTypeMap).map(([key, label]) => ({
                    label,
                    value: key,
                  }))}
                />
              )}
              right={(
                <Button type="primary" icon={<PlusOutlined />} onClick={() => inboundModal.open()}>
                  样衣入库
                </Button>
              )}
            />
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
