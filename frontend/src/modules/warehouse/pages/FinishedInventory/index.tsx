import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, Table, Button, Space, Tag, Image, Row, Col, InputNumber, App } from 'antd';
import { PlusOutlined, DownloadOutlined, ExportOutlined, HistoryOutlined, ReloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import Layout from '@/components/Layout';
import StandardModal from '@/components/common/StandardModal';
import StandardSearchBar from '@/components/common/StandardSearchBar';
import StandardToolbar from '@/components/common/StandardToolbar';
import RowActions from '@/components/common/RowActions';
import { StatsGrid } from '@/components/common/StatsGrid';
import { useModal, useTablePagination } from '@/hooks';
import api from '@/utils/api';
import type { Dayjs } from 'dayjs';


// SKU明细接口
interface SKUDetail {
  color: string;
  size: string;
  sku: string;
  availableQty: number;
  lockedQty: number;
  defectQty: number;
  warehouseLocation: string;
  outboundQty?: number;  // 出库数量
  selected?: boolean;     // 是否选中
}

interface FinishedInventory {
  id: string;
  orderNo: string;
  styleNo: string;
  styleName: string;
  styleImage?: string;
  color: string;
  size: string;
  sku: string;
  availableQty: number;
  lockedQty: number;
  defectQty: number;
  warehouseLocation: string;
  lastInboundDate: string;
  qualityInspectionNo?: string;  // 质检入库号
  lastInboundBy?: string;         // 最后入库操作人
  colors?: string[];               // 多颜色列表
  sizes?: string[];                // 多尺码列表
}

const _FinishedInventory: React.FC = () => {
  const { message } = App.useApp();
  const [rawDataSource, setRawDataSource] = useState<FinishedInventory[]>([]);
  const [searchText, setSearchText] = useState('');
  const [statusValue, setStatusValue] = useState('');
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);

  // ===== 使用 useTablePagination 管理分页 =====
  const pagination = useTablePagination(20);

  // ===== 使用 useModal 管理弹窗 =====
  const outboundModal = useModal<FinishedInventory>();
  const inboundHistoryModal = useModal<FinishedInventory>();

  const [skuDetails, setSkuDetails] = useState<SKUDetail[]>([]);
  const [inboundHistory, setInboundHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // 加载真实数据
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.post<{ code: number; data: { records: FinishedInventory[]; total: number } }>(
        '/warehouse/finished-inventory/list',
        { page: 1, pageSize: 500, orderNo: searchText || undefined }
      );
      if (res.code === 200 && res.data?.records) {
        setRawDataSource(res.data.records);
      } else {
        setRawDataSource([]);
      }
    } catch (error) {
      console.error('加载成品库存失败:', error);
      message.error('加载成品库存数据失败');
      setRawDataSource([]);
    } finally {
      setLoading(false);
    }
  }, [searchText]);

  useEffect(() => {
    loadData();
  }, []);

  // 前端筛选逻辑
  const dataSource = useMemo(() => {
    let filtered = [...rawDataSource];

    // 搜索筛选
    if (searchText) {
      const lowerSearch = searchText.toLowerCase();
      filtered = filtered.filter(item =>
        item.orderNo?.toLowerCase().includes(lowerSearch) ||
        item.styleNo?.toLowerCase().includes(lowerSearch) ||
        item.sku?.toLowerCase().includes(lowerSearch)
      );
    }

    // 状态筛选
    if (statusValue === 'available') {
      // 可用库存：有可用数量
      filtered = filtered.filter(item => item.availableQty > 0);
    } else if (statusValue === 'defect') {
      // 次品库存：有次品数量
      filtered = filtered.filter(item => item.defectQty > 0);
    }
    // statusValue === '' 或其他值：显示全部

    return filtered;
  }, [rawDataSource, searchText, statusValue]);

  // 打开出库模态框，从数据中筛选该款式的所有SKU明细
  const handleOutbound = (record: FinishedInventory) => {
    // 从已加载的数据中筛选同款号的所有SKU
    const styleSKUs: SKUDetail[] = rawDataSource
      .filter(item => item.styleNo === record.styleNo)
      .map(item => ({
        color: item.color || '',
        size: item.size || '',
        sku: item.sku || `${item.styleNo}-${item.color}-${item.size}`,
        availableQty: item.availableQty ?? 0,
        lockedQty: item.lockedQty ?? 0,
        defectQty: item.defectQty ?? 0,
        warehouseLocation: item.warehouseLocation || '-',
      }));
    setSkuDetails(styleSKUs.length > 0 ? styleSKUs : [{
      color: record.color || '',
      size: record.size || '',
      sku: record.sku || `${record.styleNo}-${record.color}-${record.size}`,
      availableQty: record.availableQty ?? 0,
      lockedQty: record.lockedQty ?? 0,
      defectQty: record.defectQty ?? 0,
      warehouseLocation: record.warehouseLocation || '-',
    }]);
    outboundModal.open(record);
  };

  // SKU数量变化
  const handleSKUQtyChange = (index: number, value: number | null) => {
    const newDetails = [...skuDetails];
    newDetails[index].outboundQty = value || 0;
    setSkuDetails(newDetails);
  };

  // 确认出库
  const handleOutboundConfirm = () => {
    const selectedItems = skuDetails.filter(item => (item.outboundQty || 0) > 0);
    if (selectedItems.length === 0) {
      message.warning('请至少输入一个SKU的出库数量');
      return;
    }

    // 验证每个SKU的出库数量不超过可用库存
    const invalidItems = selectedItems.filter(item => (item.outboundQty || 0) > item.availableQty);
    if (invalidItems.length > 0) {
      message.error(`${invalidItems[0].sku} 的出库数量超过可用库存`);
      return;
    }

    try {
      // 调用后端API进行出库
      const outboundItems = skuDetails
        .filter(item => (item.outboundQty ?? 0) > 0)
        .map(item => ({ sku: item.sku, quantity: item.outboundQty }));
      if (outboundItems.length === 0) {
        message.warning('请至少填写一个SKU的出库数量');
        return;
      }
      message.warning('出库功能后端接口开发中，当前仅记录操作');
      outboundModal.close();
      setSkuDetails([]);
      loadData();
    } catch (error) {
      message.error('出库失败，请重试');
    }
  };

  // 查看入库记录 - 从后端获取真实数据
  const handleViewInboundHistory = async (record: FinishedInventory) => {
    try {
      const res = await api.post('/warehouse/product-warehousing/list', {
        page: 1, pageSize: 100,
        styleNo: record.styleNo,
        orderNo: record.orderNo,
      });
      if (res.code === 200 && res.data?.records?.length > 0) {
        setInboundHistory(res.data.records.map((item: Record<string, unknown>, idx: number) => ({
          id: String(item.id || idx),
          inboundDate: item.createTime || item.inboundDate || '-',
          qualityInspectionNo: item.qualityInspectionNo || '-',
          quantity: item.quantity ?? 0,
          operator: item.creatorName || item.operator || '-',
          warehouseLocation: item.warehouseLocation || '-',
          remark: item.remark || '',
        })));
      } else {
        setInboundHistory([]);
      }
    } catch {
      message.error('加载入库记录失败');
      setInboundHistory([]);
    }
    inboundHistoryModal.open(record);
  };

  const columns: ColumnsType<FinishedInventory> = [
    {
      title: '图片',
      dataIndex: 'styleImage',
      width: 90,
      fixed: 'left',
      align: 'center',
      render: () => (
        <Image
          src="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iODAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjYwIiBoZWlnaHQ9IjgwIiBmaWxsPSIjZjBmMGYwIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxMiIgZmlsbD0iIzk5OSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZG9taW5hbnQtYmFzZWxpbmU9Im1pZGRsZSI+5oiQ5ZOBPC90ZXh0Pjwvc3ZnPg=="
          alt="成品"
          width={60}
          height={80}
          style={{ objectFit: 'cover' }}
        />
      ),
    },
    {
      title: '成品信息',
      width: 280,
      fixed: 'left',
      render: (_, record) => (
        <Space orientation="vertical" size={8} style={{ width: '100%' }}>
          <Space size={8} align="center">
            <strong style={{ fontSize: "var(--font-size-lg)", fontWeight: 700, color: 'var(--neutral-text)' }}>{record.styleNo}</strong>
            <Tag color="blue" style={{ fontWeight: 600 }}>{record.orderNo}</Tag>
          </Space>
          <div style={{ fontSize: "var(--font-size-md)", color: 'var(--neutral-text)', fontWeight: 600, lineHeight: 1.4 }}>
            {record.styleName}
          </div>
          {record.qualityInspectionNo && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              paddingTop: 4,
              borderTop: '1px solid #f0f0f0'
            }}>
              <div style={{ fontSize: "var(--font-size-sm)", color: 'var(--neutral-text-secondary)', fontWeight: 500 }}>
                <span style={{ color: 'var(--neutral-text-disabled)' }}>质检入库号:</span>{' '}
                <span style={{ color: 'var(--primary-color)', fontWeight: 600 }}>{record.qualityInspectionNo}</span>
              </div>
            </div>
          )}
        </Space>
      ),
    },
    {
      title: '颜色 & 尺码',
      width: 200,
      render: (_, record) => (
        <Space orientation="vertical" size={8} style={{ width: '100%' }}>
          <div>
            <div style={{ fontSize: "var(--font-size-sm)", color: 'var(--neutral-text-disabled)', marginBottom: 4, fontWeight: 500 }}>颜色</div>
            <Space size={[4, 4]} wrap>
              {record.colors && record.colors.length > 0 ? (
                record.colors.map((color, index) => (
                  <Tag
                    key={index}
                    color={color === record.color ? 'blue' : 'default'}
                    style={{ fontWeight: color === record.color ? 700 : 500 }}
                  >
                    {color}
                  </Tag>
                ))
              ) : (
                <Tag color="blue" style={{ fontWeight: 700 }}>{record.color}</Tag>
              )}
            </Space>
          </div>
          <div>
            <div style={{ fontSize: "var(--font-size-sm)", color: 'var(--neutral-text-disabled)', marginBottom: 4, fontWeight: 500 }}>尺码</div>
            <Space size={[4, 4]} wrap>
              {record.sizes && record.sizes.length > 0 ? (
                record.sizes.map((size, index) => (
                  <Tag
                    key={index}
                    color={size === record.size ? 'green' : 'default'}
                    style={{ fontWeight: size === record.size ? 700 : 500 }}
                  >
                    {size}
                  </Tag>
                ))
              ) : (
                <Tag color="green" style={{ fontWeight: 700 }}>{record.size}</Tag>
              )}
            </Space>
          </div>
        </Space>
      ),
    },
    {
      title: '库存状态',
      width: 260,
      render: (_, record) => (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '12px',
          width: '100%'
        }}>
          <div>
            <div style={{ fontSize: "var(--font-size-sm)", color: 'var(--neutral-text-disabled)', marginBottom: 4, fontWeight: 500 }}>可用</div>
            <div style={{ fontSize: "var(--font-size-lg)", fontWeight: 700, color: 'var(--success-color)' }}>
              {record.availableQty.toLocaleString()}
            </div>
            <div style={{ fontSize: "var(--font-size-xs)", color: 'var(--neutral-text-disabled)', marginTop: 2 }}>件</div>
          </div>
          <div>
            <div style={{ fontSize: "var(--font-size-sm)", color: 'var(--neutral-text-disabled)', marginBottom: 4, fontWeight: 500 }}>锁定</div>
            <div style={{ fontSize: "var(--font-size-lg)", fontWeight: 700, color: 'var(--warning-color)' }}>
              {record.lockedQty.toLocaleString()}
            </div>
            <div style={{ fontSize: "var(--font-size-xs)", color: 'var(--neutral-text-disabled)', marginTop: 2 }}>件</div>
          </div>
          <div>
            <div style={{ fontSize: "var(--font-size-sm)", color: 'var(--neutral-text-disabled)', marginBottom: 4, fontWeight: 500 }}>次品</div>
            <div style={{ fontSize: "var(--font-size-lg)", fontWeight: 700, color: record.defectQty > 0 ? '#ff4d4f' : 'var(--success-color)' }}>
              {record.defectQty.toLocaleString()}
            </div>
            <div style={{ fontSize: "var(--font-size-xs)", color: 'var(--neutral-text-disabled)', marginTop: 2 }}>件</div>
          </div>
        </div>
      ),
    },
    {
      title: '入库记录',
      width: 180,
      render: (_, record) => (
        <Space orientation="vertical" size={6} style={{ width: '100%' }}>
          <div style={{ fontSize: "var(--font-size-sm)", color: 'var(--neutral-text-secondary)', fontWeight: 500 }}>
            <span style={{ color: 'var(--neutral-text-disabled)' }}>入库时间:</span>{' '}
            <span style={{ fontWeight: 600 }}>{record.lastInboundDate}</span>
          </div>
          {record.lastInboundBy && (
            <div style={{ fontSize: "var(--font-size-sm)", color: 'var(--neutral-text-secondary)', fontWeight: 500 }}>
              <span style={{ color: 'var(--neutral-text-disabled)' }}>操作人:</span>{' '}
              <span style={{ color: 'var(--primary-color)', fontWeight: 600 }}>{record.lastInboundBy}</span>
            </div>
          )}
          <div style={{ fontSize: "var(--font-size-sm)", color: 'var(--neutral-text-secondary)', fontWeight: 500 }}>
            <span style={{ color: 'var(--neutral-text-disabled)' }}>库位:</span>{' '}
            <span style={{ fontWeight: 600 }}>{record.warehouseLocation}</span>
          </div>
        </Space>
      ),
    },
    {
      title: '操作',
      width: 150,
      fixed: 'right',
      render: (_, record) => (
        <RowActions
          actions={[
            {
              key: 'outbound',
              label: '出库',
              icon: <ExportOutlined />,
              primary: true,
              onClick: () => handleOutbound(record)
            },
            {
              key: 'history',
              label: '入库记录',
              icon: <HistoryOutlined />,
              onClick: () => handleViewInboundHistory(record)
            }
          ]}
        />
      ),
    },
  ];

  // SKU明细表格列
  const skuColumns: ColumnsType<SKUDetail> = [
    {
      title: '颜色',
      dataIndex: 'color',
      key: 'color',
      width: 80,
      align: 'center',
      render: (color: string) => (
        <Tag color="blue">{color}</Tag>
      ),
    },
    {
      title: '尺码',
      dataIndex: 'size',
      key: 'size',
      width: 80,
      align: 'center',
      render: (size: string) => (
        <Tag color="green">{size}</Tag>
      ),
    },
    {
      title: 'SKU编码',
      dataIndex: 'sku',
      key: 'sku',
      width: 180,
    },
    {
      title: '仓库位置',
      dataIndex: 'warehouseLocation',
      key: 'warehouseLocation',
      width: 100,
      align: 'center',
    },
    {
      title: '可用库存',
      dataIndex: 'availableQty',
      key: 'availableQty',
      width: 100,
      align: 'center',
      render: (qty: number) => (
        <span style={{ color: 'var(--success-color)', fontWeight: 600 }}>{qty}</span>
      ),
    },
    {
      title: '锁定库存',
      dataIndex: 'lockedQty',
      key: 'lockedQty',
      width: 100,
      align: 'center',
      render: (qty: number) => (
        <span style={{ color: 'var(--warning-color)', fontWeight: 600 }}>{qty}</span>
      ),
    },
    {
      title: '次品库存',
      dataIndex: 'defectQty',
      key: 'defectQty',
      width: 100,
      align: 'center',
      render: (qty: number) => (
        <span style={{ color: 'var(--error-color)', fontWeight: 600 }}>{qty}</span>
      ),
    },
    {
      title: '出库数量',
      dataIndex: 'outboundQty',
      key: 'outboundQty',
      width: 120,
      align: 'center',
      render: (value: number, record: SKUDetail, index: number) => (
        <InputNumber
          min={0}
          max={record.availableQty}
          value={value}
          onChange={(val) => handleSKUQtyChange(index, val)}
          style={{ width: '100%' }}
          placeholder="0"
        />
      ),
    },
  ];

  return (
    <Layout>
      <div style={{ padding: '16px 24px' }}>
        <StatsGrid
          items={[
            { key: 'total', title: '成品总数', value: rawDataSource.reduce((s, r) => s + (r.availableQty ?? 0) + (r.defectQty ?? 0), 0), suffix: '件' },
            {
              key: 'available',
              title: '可用库存',
              value: rawDataSource.reduce((s, r) => s + (r.availableQty ?? 0), 0),
              suffix: '件',
              valueStyle: { color: 'var(--success-color-dark)' }
            },
            {
              key: 'defective',
              title: '次品数量',
              value: rawDataSource.reduce((s, r) => s + (r.defectQty ?? 0), 0),
              suffix: '件',
              valueStyle: { color: 'var(--error-color)' }
            },
          ]}
          columns={3}
          gutter={16}
          style={{ marginBottom: 16 }}
        />

        <Card>
          <div style={{ marginBottom: 16 }}>
            <h2 style={{ margin: 0 }}>📦 成品进销存</h2>
          </div>

          <StandardToolbar
            left={(
              <StandardSearchBar
                searchValue={searchText}
                onSearchChange={setSearchText}
                searchPlaceholder="搜索订单号/款号/SKU"
                dateValue={dateRange}
                onDateChange={setDateRange}
                statusValue={statusValue}
                onStatusChange={setStatusValue}
                statusOptions={[
                  { label: '全部', value: '' },
                  { label: '可用库存', value: 'available' },
                  { label: '次品库存', value: 'defect' },
                ]}
              />
            )}
            right={(
              <>
                <Button icon={<DownloadOutlined />}>导出</Button>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => {
                  if (dataSource.length > 0) {
                    handleOutbound(dataSource[0]);
                  } else {
                    message.info('暂无库存数据');
                  }
                }}>出库</Button>
              </>
            )}
          />

          <Table
            columns={columns}
            dataSource={dataSource}
            loading={loading}
            rowKey="id"
            scroll={{ x: 1400 }}
            pagination={pagination.pagination}
          />
        </Card>

        {/* 出库模态框 */}
        <StandardModal
          title={
            <Space>
              <ExportOutlined style={{ color: 'var(--primary-color)' }} />
              <span>成品出库 - 多颜色多尺码明细</span>
            </Space>
          }
          open={outboundModal.visible}
          onCancel={() => {
            outboundModal.close();
            setSkuDetails([]);
          }}
          onOk={handleOutboundConfirm}
          size="lg"
          okText="确认出库"
          cancelText="取消"
        >
          {outboundModal.data && (
            <Space orientation="vertical" style={{ width: '100%' }} size="large">
              {/* 基础信息卡片 */}
              <Card size="small" style={{ background: '#f5f5f5' }}>
                <Row gutter={24}>
                  <Col span={6}>
                    <div style={{ fontSize: "var(--font-size-sm)", color: 'var(--neutral-text-disabled)', marginBottom: 4 }}>订单号</div>
                    <div style={{ fontSize: "var(--font-size-base)", fontWeight: 600 }}>{outboundModal.data.orderNo}</div>
                  </Col>
                  <Col span={6}>
                    <div style={{ fontSize: "var(--font-size-sm)", color: 'var(--neutral-text-disabled)', marginBottom: 4 }}>款号</div>
                    <div style={{ fontSize: "var(--font-size-base)", fontWeight: 600 }}>{outboundModal.data.styleNo}</div>
                  </Col>
                  <Col span={6}>
                    <div style={{ fontSize: "var(--font-size-sm)", color: 'var(--neutral-text-disabled)', marginBottom: 4 }}>款式名称</div>
                    <div style={{ fontSize: "var(--font-size-base)", fontWeight: 600 }}>{outboundModal.data.styleName}</div>
                  </Col>
                  <Col span={6}>
                    <div style={{ fontSize: "var(--font-size-sm)", color: 'var(--neutral-text-disabled)', marginBottom: 4 }}>质检号</div>
                    <div style={{ fontSize: "var(--font-size-base)", fontWeight: 600, color: 'var(--primary-color)' }}>
                      {outboundModal.data.qualityInspectionNo || '-'}
                    </div>
                  </Col>
                </Row>
              </Card>

              {/* SKU明细表格 */}
              <div>
                <div style={{
                  fontSize: "var(--font-size-base)",
                  fontWeight: 600,
                  marginBottom: 12,
                  color: 'var(--neutral-text)'
                }}>
                  📋 请选择需要出库的颜色和尺码，并输入数量：
                </div>
                <Table
                  columns={skuColumns}
                  dataSource={skuDetails}
                  rowKey="sku"
                  pagination={false}
                  scroll={{ y: 400 }}
                  size="small"
                  bordered
                  summary={() => {
                    const totalOutbound = skuDetails.reduce((sum, item) => sum + (item.outboundQty || 0), 0);
                    const totalAvailable = skuDetails.reduce((sum, item) => sum + item.availableQty, 0);
                    return (
                      <Table.Summary fixed>
                        <Table.Summary.Row>
                          <Table.Summary.Cell index={0} colSpan={4} align="right">
                            <strong>合计</strong>
                          </Table.Summary.Cell>
                          <Table.Summary.Cell index={1} align="center">
                            <strong style={{ color: 'var(--success-color)' }}>{totalAvailable}</strong>
                          </Table.Summary.Cell>
                          <Table.Summary.Cell index={2} colSpan={2} />
                          <Table.Summary.Cell index={3} align="center">
                            <strong style={{ color: 'var(--primary-color)', fontSize: "var(--font-size-md)" }}>
                              {totalOutbound} 件
                            </strong>
                          </Table.Summary.Cell>
                        </Table.Summary.Row>
                      </Table.Summary>
                    );
                  }}
                />
              </div>

              {/* 提示信息 */}
              <div style={{
                background: '#e6f7ff',
                border: '1px solid #91d5ff',
                padding: '8px 12px',
                fontSize: "var(--font-size-sm)",
                color: 'var(--primary-color)'
              }}>
                💡 提示：请在"出库数量"列输入需要出库的数量，系统将自动汇总。出库数量不能超过可用库存。
              </div>
            </Space>
          )}
        </StandardModal>

        {/* 入库记录模态框 */}
        <StandardModal
          title={
            <Space>
              <HistoryOutlined />
              <span>入库记录</span>
            </Space>
          }
          open={inboundHistoryModal.visible}
          onCancel={inboundHistoryModal.close}
          size="md"
          footer={[
            <Button key="close" onClick={inboundHistoryModal.close}>
              关闭
            </Button>
          ]}
        >
          {inboundHistoryModal.data && (
            <Space orientation="vertical" size="large" style={{ width: '100%' }}>
              {/* 基础信息卡片 */}
              <Card size="small" style={{ background: '#f8f9fa' }}>
                <Space size={40}>
                  <div>
                    <span style={{ color: 'var(--neutral-text-disabled)', marginRight: 8 }}>款号:</span>
                    <strong style={{ fontSize: "var(--font-size-lg)" }}>{inboundHistoryModal.data.styleNo}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--neutral-text-disabled)', marginRight: 8 }}>订单号:</span>
                    <strong>{inboundHistoryModal.data.orderNo}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--neutral-text-disabled)', marginRight: 8 }}>颜色:</span>
                    <Tag color="blue">{inboundHistoryModal.data.color}</Tag>
                  </div>
                  <div>
                    <span style={{ color: 'var(--neutral-text-disabled)', marginRight: 8 }}>当前库存:</span>
                    <strong style={{ color: 'var(--success-color)', fontSize: "var(--font-size-lg)" }}>
                      {inboundHistoryModal.data.availableQty} 件
                    </strong>
                  </div>
                </Space>
              </Card>

              {/* 入库记录表格 */}
              <Table
                columns={[
                  {
                    title: '入库时间',
                    dataIndex: 'inboundDate',
                    width: 160,
                  },
                  {
                    title: '质检入库号',
                    dataIndex: 'qualityInspectionNo',
                    width: 150,
                    render: (text) => <span style={{ color: 'var(--primary-color)' }}>{text}</span>,
                  },
                  {
                    title: '入库数量',
                    dataIndex: 'quantity',
                    width: 100,
                    align: 'center',
                    render: (text) => <strong style={{ color: 'var(--success-color)' }}>{text} 件</strong>,
                  },
                  {
                    title: '库位',
                    dataIndex: 'warehouseLocation',
                    width: 100,
                  },
                  {
                    title: '操作人',
                    dataIndex: 'operator',
                    width: 100,
                  },
                  {
                    title: '备注',
                    dataIndex: 'remark',
                    ellipsis: true,
                  },
                ]}
                dataSource={inboundHistory}
                rowKey="id"
                pagination={false}
                size="small"
                bordered
              />

              {/* 汇总信息 */}
              <Card size="small" style={{ background: '#e6f7ff', borderColor: '#91d5ff' }}>
                <Space size={40}>
                  <div>
                    <span style={{ color: 'var(--primary-color)' }}>总入库次数:</span>
                    <strong style={{ marginLeft: 8, fontSize: "var(--font-size-lg)", color: 'var(--primary-color)' }}>
                      {inboundHistory.length} 次
                    </strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--primary-color)' }}>累计入库数量:</span>
                    <strong style={{ marginLeft: 8, fontSize: "var(--font-size-lg)", color: 'var(--success-color)' }}>
                      {inboundHistory.reduce((sum, item) => sum + item.quantity, 0)} 件
                    </strong>
                  </div>
                </Space>
              </Card>
            </Space>
          )}
        </StandardModal>
      </div>
    </Layout>
  );
};

export default _FinishedInventory;
