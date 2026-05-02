import React, { useState, useEffect } from 'react';
import {
  App,
  Button,
  Space,
  Tag,
  Tooltip,
  Image,
  Form,
  Input,
  Modal,
} from 'antd';
import RowActions from '@/components/common/RowActions';
import type { ColumnsType } from 'antd/es/table';
import StandardSearchBar from '@/components/common/StandardSearchBar';
import PageLayout from '@/components/common/PageLayout';
import ResizableTable from '@/components/common/ResizableTable';
import api from '@/utils/api';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import { useModal, useTablePagination } from '@/hooks';
import { SampleStock, SampleTypeMap } from './types';
import InboundModal from './InboundModal';
import LoanModal from './LoanModal';
import LoanHistoryModal from './LoanHistoryModal';
import dayjs, { type Dayjs } from 'dayjs';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import { isSmartFeatureEnabled } from '@/smart/core/featureFlags';
import type { SmartErrorInfo } from '@/smart/core/types';
import { useSearchParams } from 'react-router-dom';

export const STYLE_INFO_LIST_REFRESH_KEY = 'style-info-list:refresh-needed';

const formatTime = (value?: string) => {
  if (!value) return '-';
  const instance = dayjs(value);
  return instance.isValid() ? instance.format('YYYY-MM-DD HH:mm') : String(value);
};

const getRecordSwitchButtonStyle = (selected: boolean) => {
  return {
    background: '#ffffff',
    borderColor: selected ? '#cbd5e1' : '#e2e8f0',
    color: selected ? '#0f172a' : '#475569',
    boxShadow: selected ? '0 2px 8px rgba(15, 23, 42, 0.08)' : 'none',
  };
};

const InventoryStatusMap: Record<string, { label: string; color: string }> = {
  active: { label: '在库', color: 'green' },
  destroyed: { label: '已销毁', color: 'red' },
};

const SampleInventory: React.FC = () => {
  const { message } = App.useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const pagination = useTablePagination(20);
  const [loading, setLoading] = useState(false);
  const [dataSource, setDataSource] = useState<SampleStock[]>([]);
  const [smartError, setSmartError] = useState<SmartErrorInfo | null>(null);
  const [searchText, setSearchText] = useState('');
  const [sampleType, setSampleType] = useState<string | undefined>(undefined);
  const [recordStatus, setRecordStatus] = useState<'active' | 'destroyed'>('active');
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [inboundSeed, setInboundSeed] = useState<Record<string, any> | undefined>(undefined);
  const [destroyLoading, setDestroyLoading] = useState(false);
  const showSmartErrorNotice = React.useMemo(() => isSmartFeatureEnabled('smart.production.precheck.enabled'), []);
  const destroyModal = useModal<SampleStock>();
  const [destroyForm] = Form.useForm<{ remark: string }>();

  const reportSmartError = (title: string, reason?: string, code?: string) => {
    if (!showSmartErrorNotice) return;
    setSmartError({
      title,
      reason,
      code,
      actionText: '刷新重试',
    });
  };

  const inboundModal = useModal<void>();
  const loanModal = useModal<SampleStock>();
  const historyDrawer = useModal<SampleStock>();

  const clearAutoInboundParams = React.useCallback(() => {
    const next = new URLSearchParams(searchParams);
    ['action', 'styleId', 'styleNo', 'styleName', 'color', 'size', 'quantity', 'sampleType'].forEach((key) => {
      next.delete(key);
    });
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const closeInboundModal = React.useCallback(() => {
    inboundModal.close();
    setInboundSeed(undefined);
    if (searchParams.get('action') === 'inbound') {
      clearAutoInboundParams();
    }
  }, [clearAutoInboundParams, inboundModal, searchParams]);

  const closeDestroyModal = React.useCallback(() => {
    destroyModal.close();
    destroyForm.resetFields();
  }, [destroyForm, destroyModal]);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await api.get('/stock/sample/list', {
        params: {
          page: pagination.pagination.current,
          pageSize: pagination.pagination.pageSize,
          styleNo: searchText,
          sampleType,
          recordStatus,
        },
      });
      if (res.code === 200) {
        setDataSource(res.data.records || []);
        pagination.setTotal(res.data.total || 0);
        if (showSmartErrorNotice) setSmartError(null);
      }
    } catch (error) {
      reportSmartError('样衣库存加载失败', '网络异常或服务不可用，请稍后重试', 'SAMPLE_STOCK_LOAD_FAILED');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

  }, [pagination.pagination.current, pagination.pagination.pageSize, recordStatus, searchText, sampleType]);

  useEffect(() => {
    const action = searchParams.get('action');
    const styleId = searchParams.get('styleId');
    const styleNo = searchParams.get('styleNo');
    const styleName = searchParams.get('styleName');
    const color = searchParams.get('color');
    const size = searchParams.get('size');
    const quantity = searchParams.get('quantity');
    const sampleTypeParam = searchParams.get('sampleType');
    if (styleNo) {
      setSearchText(styleNo);
    }
    if (action === 'inbound' && styleNo) {
      setInboundSeed({
        styleId: styleId || undefined,
        styleNo,
        styleName: styleName || undefined,
        color: color || undefined,
        size: size || undefined,
        quantity: quantity ? Number(quantity) : undefined,
        sampleType: sampleTypeParam || 'development',
      });
      inboundModal.open();
      clearAutoInboundParams();
    }
  }, [clearAutoInboundParams, searchParams, searchParams.toString()]);

  useEffect(() => {
    if (destroyModal.visible) {
      destroyForm.resetFields();
    }
  }, [destroyForm, destroyModal.visible]);

  const handleDestroy = async () => {
    if (!destroyModal.data?.id) return;
    try {
      const values = await destroyForm.validateFields();
      setDestroyLoading(true);
      const res = await api.post('/stock/sample/destroy', {
        stockId: destroyModal.data.id,
        remark: values.remark,
      });
      if (res.code === 200) {
        message.success('样衣库存已销毁');
        closeDestroyModal();
        await loadData();
        return;
      }
      message.error(res.message || '销毁失败');
    } catch (error) {
      if (error && typeof error === 'object' && 'errorFields' in (error as Record<string, unknown>)) {
        return;
      }
      console.error(error);
      message.error((error as Error)?.message || '销毁失败');
    } finally {
      setDestroyLoading(false);
    }
  };

  const columns: ColumnsType<SampleStock> = [
    {
      title: '图片',
      dataIndex: 'imageUrl',
      key: 'imageUrl',
      width: 72,
      align: 'center' as const,
      render: (text) => (
        <div style={{ width: 48, minHeight: 28, borderRadius: 4, overflow: 'hidden', background: 'var(--color-bg-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {text ? (
            <Image
              src={getFullAuthedFileUrl(text)}
              alt="样衣"
              width={48}
              style={{ height: 'auto', display: 'block' }}
              preview={false}
            />
          ) : (
            <span style={{ color: '#ccc', fontSize: 12, height: 48, display: 'flex', alignItems: 'center' }}>无图</span>
          )}
        </div>
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
      render: (text) => text || '-',
    },
    {
      title: '纸样号',
      dataIndex: 'patternNo',
      key: 'patternNo',
      width: 140,
      render: (text) => text || '-',
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
      width: 150,
      render: (_, record) => `${record.color || '-'} / ${record.size || '-'}`,
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
      title: '状态',
      dataIndex: 'inventoryStatus',
      key: 'inventoryStatus',
      width: 100,
      render: (text) => {
        const meta = InventoryStatusMap[String(text || 'active')] || InventoryStatusMap.active;
        return <Tag color={meta.color}>{meta.label}</Tag>;
      },
    },
    {
      title: '样衣完成时间',
      dataIndex: 'sampleCompletedTime',
      key: 'sampleCompletedTime',
      width: 168,
      render: (text) => formatTime(text),
    },
    {
      title: '入库时间',
      dataIndex: 'createTime',
      key: 'createTime',
      width: 168,
      render: (text) => formatTime(text),
    },
    {
      title: '最近更新时间',
      dataIndex: 'updateTime',
      key: 'updateTime',
      width: 168,
      render: (text) => formatTime(text),
    },
    {
      title: '销毁时间',
      dataIndex: 'destroyTime',
      key: 'destroyTime',
      width: 168,
      render: (text) => formatTime(text),
    },
    {
      title: '位置',
      dataIndex: 'location',
      key: 'location',
      width: 100,
      render: (text) => text || '-',
    },
    {
      title: '备注',
      dataIndex: 'remark',
      key: 'remark',
      width: 220,
      ellipsis: true,
      render: (text) => text || '-',
    },
    {
      title: '销毁说明',
      dataIndex: 'destroyRemark',
      key: 'destroyRemark',
      width: 240,
      ellipsis: true,
      render: (text) => text || '-',
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
      fixed: 'right',
      render: (_, record) => (
        <RowActions
          actions={
            record.inventoryStatus === 'destroyed'
              ? [
                  {
                    key: 'history',
                    label: '记录',
                    onClick: () => historyDrawer.open(record)
                  }
                ]
              : [
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
                  },
                  {
                    key: 'destroy',
                    label: '销毁',
                    danger: true,
                    onClick: () => destroyModal.open(record),
                  }
                ]
          }
        />
      ),
    },
  ];

  return (
    <>
        <PageLayout
          title="样衣库存"
          headerContent={showSmartErrorNotice && smartError ? (
            <SmartErrorNotice
              error={smartError}
              onFix={() => { void loadData(); }}
            />
          ) : undefined}
          filterLeft={(
            <StandardSearchBar
              searchValue={searchText}
              onSearchChange={setSearchText}
              searchPlaceholder="搜索款号"
              dateValue={dateRange}
              onDateChange={setDateRange}
              statusValue={sampleType || ''}
              onStatusChange={(value) => setSampleType(value || undefined)}
              showDatePresets={false}
              statusOptions={[
                { label: '全部', value: '' },
                ...Object.entries(SampleTypeMap).map(([key, label]) => ({
                  label,
                  value: key,
                }))
              ]}
            />
          )}
          filterRight={(
            <Space>
              <Button
                type="default"
                style={getRecordSwitchButtonStyle(recordStatus === 'active')}
                onClick={() => setRecordStatus('active')}
              >
                在库列表
              </Button>
              <Button
                type="default"
                style={getRecordSwitchButtonStyle(recordStatus === 'destroyed')}
                onClick={() => setRecordStatus('destroyed')}
              >
                销毁记录
              </Button>
              {recordStatus === 'active' && (
                <Button type="primary" onClick={() => {
                  setInboundSeed(undefined);
                  inboundModal.open();
                }}>
                  样衣入库
                </Button>
              )}
            </Space>
          )}
        >
          <ResizableTable
            storageKey="sample-inventory"
            columns={columns}
            dataSource={dataSource}
            loading={loading}
            rowKey="id"
            stickyHeader
            pagination={{
              ...pagination.pagination,
              showTotal: (total) => `共 ${total} 条`,
              showSizeChanger: true,
              pageSizeOptions: ['10', '20', '50', '100'],
              onChange: pagination.onChange,
            }}
          />
        </PageLayout>

        <InboundModal
          visible={inboundModal.visible}
          onCancel={closeInboundModal}
          initialValues={inboundSeed}
          onSuccess={() => {
            localStorage.setItem(STYLE_INFO_LIST_REFRESH_KEY, String(Date.now()));
            closeInboundModal();
            loadData();
          }}
        />

        <LoanModal
          visible={loanModal.visible}
          stock={loanModal.data ?? undefined}
          onCancel={loanModal.close}
          onSuccess={() => {
            loanModal.close();
            loadData();
          }}
        />

        <LoanHistoryModal
          visible={historyDrawer.visible}
          stock={historyDrawer.data ?? undefined}
          onClose={historyDrawer.close}
          onRefresh={loadData}
        />
        <Modal
          open={destroyModal.visible}
          title={`销毁样衣库存${destroyModal.data?.styleNo ? ` - ${destroyModal.data.styleNo}` : ''}`}
          onCancel={closeDestroyModal}
          onOk={() => void handleDestroy()}
          okText="确认销毁"
          okButtonProps={{ danger: true }}
          confirmLoading={destroyLoading}
          destroyOnHidden
        >
          <Form form={destroyForm} layout="vertical">
            <Form.Item label="库存编号">
              <Input id="destroyInventoryId" value={destroyModal.data?.id || '-'} readOnly />
            </Form.Item>
            <Form.Item label="基础信息">
              <Input
                value={[
                  destroyModal.data?.styleNo || '-',
                  destroyModal.data?.styleName || '-',
                  destroyModal.data?.color || '-',
                  destroyModal.data?.size || '-',
                ].join(' / ')}
                readOnly
              />
            </Form.Item>
            <Form.Item
              name="remark"
              label="销毁备注"
              rules={[{ required: true, message: '请填写销毁备注后再提交' }]}
            >
              <Input.TextArea rows={4} maxLength={300} showCount placeholder="请填写销毁原因、处理说明、责任说明等" />
            </Form.Item>
          </Form>
        </Modal>
    </>
  );
};

export default SampleInventory;
