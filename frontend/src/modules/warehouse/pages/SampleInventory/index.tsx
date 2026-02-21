import React, { useState, useEffect } from 'react';
import {
  Card,
  Button,
  Space,
  Tag,
  Tooltip,
  Image,
} from 'antd';
import RowActions from '@/components/common/RowActions';
import type { ColumnsType } from 'antd/es/table';
import Layout from '@/components/Layout';
import StandardSearchBar from '@/components/common/StandardSearchBar';
import StandardToolbar from '@/components/common/StandardToolbar';
import ResizableTable from '@/components/common/ResizableTable';
import api from '@/utils/api';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import { useModal, useTablePagination } from '@/hooks';
import { SampleStock, SampleTypeMap } from './types';
import InboundModal from './InboundModal';
import LoanModal from './LoanModal';
import LoanHistoryModal from './LoanHistoryModal';
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

  }, [pagination.pagination.current, pagination.pagination.pageSize, searchText, sampleType]);

  const columns: ColumnsType<SampleStock> = [
    {
      title: '样衣图片',
      dataIndex: 'imageUrl',
      key: 'imageUrl',
      width: 80,
      render: (text) => (
        <Image
          src={text ? getFullAuthedFileUrl(text) : "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iODAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjYwIiBoZWlnaHQ9IjgwIiBmaWxsPSIjZjBmMGYwIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxMiIgZmlsbD0iIzk5OSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZG9taW5hbnQtYmFzZWxpbmU9Im1pZGRsZSI+5qC36KGoPC90ZXh0Pjwvc3ZnPg=="}
          alt="样衣"
          width={60}
          height={80}
          style={{ objectFit: 'cover' }}
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
              key: 'loan',
              label: '借出',
              disabled: record.quantity - record.loanedQuantity <= 0,
              onClick: () => loanModal.open(record)
            },
            {
              key: 'history',
              label: '记录',
              onClick: () => historyDrawer.open(record)
            }
          ]}
        />
      ),
    },
  ];

  return (
    <Layout>
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
                  statusOptions={[
                    { label: '全部', value: '' },
                    ...Object.entries(SampleTypeMap).map(([key, label]) => ({
                      label,
                      value: key,
                    }))
                  ]}
                />
              )}
              right={(
                <Button type="primary" onClick={() => inboundModal.open()}>
                  样衣入库
                </Button>
              )}
            />
          </div>

          <ResizableTable
            storageKey="sample-inventory"
            columns={columns}
            dataSource={dataSource}
            loading={loading}
            rowKey="id"
            pagination={{
              ...pagination.pagination,
              showTotal: (total) => `共 ${total} 条`,
              showSizeChanger: true,
              pageSizeOptions: ['10', '20', '50', '100'],
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

        <LoanHistoryModal
          visible={historyDrawer.visible}
          stock={historyDrawer.data}
          onClose={historyDrawer.close}
          onRefresh={loadData}
        />
    </Layout>
  );
};

export default SampleInventory;
