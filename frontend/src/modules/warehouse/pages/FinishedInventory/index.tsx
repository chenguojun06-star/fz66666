import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, Button, Space, Row, Col, Input, Select, App, Tabs } from 'antd';
import { PlusOutlined, DownloadOutlined, ExportOutlined, HistoryOutlined, ScanOutlined } from '@ant-design/icons';
import QrcodeOutboundModal from './QrcodeOutboundModal';
import OutstockRecordTab from './OutstockRecordTab';
import CustomerInfoSection from './CustomerInfoSection';
import { getMainColumns, getSkuColumns } from './finishedInventoryColumns';
import type { SKUDetail, FinishedInventory } from './finishedInventoryColumns';
import ResizableTable from '@/components/common/ResizableTable';
import StandardModal from '@/components/common/StandardModal';
import ResizableModal from '@/components/common/ResizableModal';
import StandardPagination from '@/components/common/StandardPagination';
import PageStatCards from '@/components/common/PageStatCards';
import StandardSearchBar from '@/components/common/StandardSearchBar';
import StandardToolbar from '@/components/common/StandardToolbar';
import { useModal, useTablePagination } from '@/hooks';
import api from '@/utils/api';
import type { Dayjs } from 'dayjs';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import { isSmartFeatureEnabled } from '@/smart/core/featureFlags';
import type { SmartErrorInfo } from '@/smart/core/types';
import { useOrganizationFilterOptions } from '@/hooks/useOrganizationFilterOptions';

const _FinishedInventory: React.FC = () => {
  const { message } = App.useApp();
  const [rawDataSource, setRawDataSource] = useState<FinishedInventory[]>([]);
  const [searchText, setSearchText] = useState('');
  const [statusValue, setStatusValue] = useState('');
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [selectedFactoryType, setSelectedFactoryType] = useState('');
  const { factoryTypeOptions } = useOrganizationFilterOptions();

  // ===== 使用 useTablePagination 管理分页 =====
  const pagination = useTablePagination(20);

  // ===== 使用 useModal 管理弹窗 =====
  const outboundModal = useModal<FinishedInventory>();
  const inboundHistoryModal = useModal<FinishedInventory>();
  const [qrcodeOutboundOpen, setQrcodeOutboundOpen] = useState(false);

  const [skuDetails, setSkuDetails] = useState<SKUDetail[]>([]);
  const [inboundHistory, setInboundHistory] = useState<any[]>([]);
  const [inboundPage, setInboundPage] = useState(1);
  const [inboundPageSize, setInboundPageSize] = useState(20);
  const [outstockTotal, setOutstockTotal] = useState(0);
  // 出库发货信息（用于关联电商订单自动回写状态）
  const [outboundProductionOrderNo, setOutboundProductionOrderNo] = useState('');
  const [outboundTrackingNo, setOutboundTrackingNo] = useState('');
  const [outboundExpressCompany, setOutboundExpressCompany] = useState('');
  // 客户信息
  const [outboundCustomerName, setOutboundCustomerName] = useState('');
  const [outboundCustomerPhone, setOutboundCustomerPhone] = useState('');
  const [outboundShippingAddress, setOutboundShippingAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [smartError, setSmartError] = useState<SmartErrorInfo | null>(null);
  const showSmartErrorNotice = useMemo(() => isSmartFeatureEnabled('smart.production.precheck.enabled'), []);

  const reportSmartError = useCallback((title: string, reason?: string, code?: string) => {
    if (!showSmartErrorNotice) return;
    setSmartError({
      title,
      reason,
      code,
      actionText: '刷新重试',
    });
  }, [showSmartErrorNotice]);

  // 加载真实数据
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.post<{ code: number; data: { records: FinishedInventory[]; total: number } }>(
        '/warehouse/finished-inventory/list',
        {
          page: 1,
          pageSize: 500,
          factoryType: selectedFactoryType || undefined,
        }
      );
      if (res.code === 200 && res.data?.records) {
        setRawDataSource(res.data.records);
        if (showSmartErrorNotice) setSmartError(null);
      } else {
        setRawDataSource([]);
      }
    } catch (error) {
      console.error('加载成品库存失败:', error);
      reportSmartError('成品库存加载失败', '网络异常或服务不可用，请稍后重试', 'FINISHED_INVENTORY_LOAD_FAILED');
      message.error('加载成品库存数据失败');
      setRawDataSource([]);
    } finally {
      setLoading(false);
    }
  }, [selectedFactoryType, showSmartErrorNotice, reportSmartError]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 前端筛选 + 按订单+款号聚合逻辑
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
      filtered = filtered.filter(item => item.availableQty > 0);
    } else if (statusValue === 'defect') {
      filtered = filtered.filter(item => item.defectQty > 0);
    }

    if (selectedFactoryType) {
      filtered = filtered.filter(item => item.factoryType === selectedFactoryType);
    }

    // 按 订单号+款号 聚合为一行（同一订单的不同尺码合并）
    const groupMap = new Map<string, FinishedInventory>();
    for (const item of filtered) {
      const key = `${item.orderNo || ''}_${item.styleNo || ''}`;
      const existing = groupMap.get(key);
      if (existing) {
        // 累加库存数量
        existing.availableQty = (existing.availableQty || 0) + (item.availableQty || 0);
        existing.lockedQty = (existing.lockedQty || 0) + (item.lockedQty || 0);
        existing.defectQty = (existing.defectQty || 0) + (item.defectQty || 0);
        // 收集不重复的颜色和尺码
        const colors = new Set(existing.colors || []);
        if (item.color) colors.add(item.color);
        existing.colors = Array.from(colors);
        const sizes = new Set(existing.sizes || []);
        if (item.size) sizes.add(item.size);
        existing.sizes = Array.from(sizes);
        // 保留最大的入库总量
        if ((item.totalInboundQty ?? 0) > (existing.totalInboundQty ?? 0)) {
          existing.totalInboundQty = item.totalInboundQty;
        }
      } else {
        groupMap.set(key, {
          ...item,
          colors: item.colors?.length ? [...item.colors] : (item.color ? [item.color] : []),
          sizes: item.sizes?.length ? [...item.sizes] : (item.size ? [item.size] : []),
        });
      }
    }

    return Array.from(groupMap.values());
  }, [rawDataSource, searchText, selectedFactoryType, statusValue]);

  const totalRecords = dataSource.length;

  // 过滤条件变化时重置到第1页，防止当前页超出范围后表格空白
  useEffect(() => {
    pagination.gotoPage(1);
  }, [searchText, statusValue, selectedFactoryType]);

  // 根据当前页/每页条数对 dataSource 做切片，真正实现分页显示
  const { current: paginationCurrent, pageSize: paginationPageSize } = pagination.pagination;
  const pagedDataSource = useMemo(() => {
    const start = (paginationCurrent - 1) * paginationPageSize;
    return dataSource.slice(start, start + paginationPageSize);
  }, [dataSource, paginationCurrent, paginationPageSize]);

  // 打开出库模态框，从数据中筛选该款式的所有SKU明细
  const handleOutbound = (record: FinishedInventory) => {
    // 从已加载的数据中筛选同款号的所有SKU
    // 防御：若 size/color 含逗号（脏数据），拆分成独立行
    const styleSKUs: SKUDetail[] = rawDataSource
      .filter(item => item.styleNo === record.styleNo)
      .flatMap(item => {
        const colors = (item.color || '').includes(',')
          ? (item.color || '').split(',').map(c => c.trim()).filter(Boolean)
          : [item.color || ''];
        const sizes = (item.size || '').includes(',')
          ? (item.size || '').split(',').map(s => s.trim()).filter(Boolean)
          : [item.size || ''];
        return colors.flatMap(color =>
          sizes.map(size => ({
            color,
            size,
            sku: `${item.styleNo}-${color}-${size}`,
            availableQty: item.availableQty ?? 0,
            lockedQty: item.lockedQty ?? 0,
            defectQty: item.defectQty ?? 0,
            warehouseLocation: item.warehouseLocation || '-',
            costPrice: item.costPrice,
            salesPrice: item.salesPrice,
          }))
        );
      });
    setSkuDetails(styleSKUs.length > 0 ? styleSKUs : [{
      color: record.color || '',
      size: record.size || '',
      sku: record.sku || `${record.styleNo}-${record.color}-${record.size}`,
      availableQty: record.availableQty ?? 0,
      lockedQty: record.lockedQty ?? 0,
      defectQty: record.defectQty ?? 0,
      warehouseLocation: record.warehouseLocation || '-',
      costPrice: record.costPrice,
      salesPrice: record.salesPrice,
    }]);
    setOutboundProductionOrderNo('');
    setOutboundTrackingNo('');
    setOutboundExpressCompany('');
    setOutboundCustomerName('');
    setOutboundCustomerPhone('');
    setOutboundShippingAddress('');
    outboundModal.open(record);
  };

  // SKU数量变化
  const handleSKUQtyChange = (index: number, value: number | null) => {
    const newDetails = [...skuDetails];
    newDetails[index].outboundQty = value || 0;
    setSkuDetails(newDetails);
  };

  // 确认出库
  const handleOutboundConfirm = async () => {
    if (!outboundCustomerName.trim()) {
      message.warning('请填写客户名称，出库必须选择客户');
      return;
    }
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
      // 调用后端接口进行出库操作
      const outboundItems = skuDetails
        .filter(item => (item.outboundQty ?? 0) > 0)
        .map(item => ({ sku: item.sku, quantity: item.outboundQty }));
      if (outboundItems.length === 0) {
        message.warning('请至少填写一个SKU的出库数量');
        return;
      }
      await api.post('/warehouse/finished-inventory/outbound', {
        items: outboundItems,
        ...(outboundModal.data?.orderId ? { orderId: outboundModal.data.orderId } : {}),
        ...(outboundModal.data?.orderNo ? { orderNo: outboundModal.data.orderNo } : {}),
        ...(outboundModal.data?.styleId ? { styleId: outboundModal.data.styleId } : {}),
        ...(outboundModal.data?.styleNo ? { styleNo: outboundModal.data.styleNo } : {}),
        ...(outboundModal.data?.styleName ? { styleName: outboundModal.data.styleName } : {}),
        ...(outboundModal.data?.warehouseLocation ? { warehouseLocation: outboundModal.data.warehouseLocation } : {}),
        ...(outboundProductionOrderNo ? { productionOrderNo: outboundProductionOrderNo } : {}),
        ...(outboundTrackingNo ? { trackingNo: outboundTrackingNo } : {}),
        ...(outboundExpressCompany ? { expressCompany: outboundExpressCompany } : {}),
        customerName: outboundCustomerName.trim(),
        ...(outboundCustomerPhone ? { customerPhone: outboundCustomerPhone } : {}),
        ...(outboundShippingAddress ? { shippingAddress: outboundShippingAddress } : {}),
      });
      message.success(`出库成功，共 ${outboundItems.length} 个SKU已出库`);
      outboundModal.close();
      setOutboundProductionOrderNo('');
      setOutboundTrackingNo('');
      setOutboundExpressCompany('');
      setOutboundCustomerName('');
      setOutboundCustomerPhone('');
      setOutboundShippingAddress('');
      setSkuDetails([]);
      loadData();
    } catch (error: unknown) {
      message.error(error instanceof Error ? error.message : '出库失败，请重试');
    }
  };

  // 查看入库记录 - 从后端获取真实数据
  // 注意：t_product_warehousing 按 SKU（颜色+尺码）存储，同一批次入库操作会产生多条相同 warehousingNo 的记录。
  // 必须按 warehousingNo 分组合并，否则同一批次会显示为多行重复记录，数量也会被翻倍。
  const handleViewInboundHistory = async (record: FinishedInventory) => {
    try {
      const params = new URLSearchParams();
      if (record.styleNo) params.append('styleNo', record.styleNo);
      // 不过滤 orderNo：一款多个订单的入库记录全部展示
      params.append('page', '1');
      params.append('pageSize', '500'); // 多取原始行，分组后数量会大幅减少（注意：参数名是 pageSize 非 size）
      const res = await api.get(`/production/warehousing/list?${params.toString()}`);
      if (res.code === 200 && res.data?.records?.length > 0) {
        const fallbackOperator = record.lastInboundBy || '-';
        const fallbackWarehouse = record.warehouseLocation || '-';

        // 每条记录独立显示（用户要求：所有入库记录全部可见，不做合并）
        type GroupedItem = {
          id: string;
          styleNo: string;
          orderNo: string;
          inboundDate: string;
          qualityInspectionNo: string;
          cuttingBundleNo: string;
          color: string;
          size: string;
          quantity: number;
          operator: string;
          warehouseLocation: string;
        };
        const rows: GroupedItem[] = (res.data.records as Record<string, unknown>[]).map(item => ({
          id: String(item.id),
          styleNo: String((item.styleNo as string) || record.styleNo || '-'),
          orderNo: String(item.orderNo || '-'),
          inboundDate: String(item.warehousingEndTime || item.createTime || '-'),
          qualityInspectionNo: String(item.warehousingNo || '-'),
          cuttingBundleNo: String(item.cuttingBundleNo || '-'),
          color: String(item.color || '-'),
          size: String(item.size || '-'),
          quantity: Number((item.warehousingQuantity as number) ?? (item.qualifiedQuantity as number) ?? 0),
          operator: String(item.warehousingOperatorName || item.qualityOperatorName || item.receiverName || fallbackOperator),
          warehouseLocation: String(item.warehouse || item.warehouseLocation || fallbackWarehouse),
        }));
        setInboundHistory(rows);
      } else {
        setInboundHistory([]);
      }
    } catch {
      message.error('加载入库记录失败');
      setInboundHistory([]);
    }

    // 同步拉取出库总量，用于对账公式展示
    try {
      const outstockRes = await api.post('/warehouse/finished-inventory/outstock-records', {
        page: 1,
        pageSize: 500,
        keyword: record.styleNo || undefined,
      });
      const outstockData = outstockRes.data || outstockRes;
      const rows: Array<{ outstockQuantity?: number; styleNo?: string }> = outstockData.records || [];
      // 精确匹配 styleNo（keyword 是模糊搜索，需在前端二次过滤）
      const total = rows
        .filter(r => !record.styleNo || r.styleNo === record.styleNo)
        .reduce((s, r) => s + (r.outstockQuantity || 0), 0);
      setOutstockTotal(total);
    } catch {
      setOutstockTotal(0);
    }

    inboundHistoryModal.open(record);
  };

  const columns = getMainColumns({ handleOutbound, handleViewInboundHistory });

  const skuColumns = getSkuColumns({ handleSKUQtyChange });

  return (
    <>
        {showSmartErrorNotice && smartError ? (
          <Card size="small" style={{ marginBottom: 12 }}>
            <SmartErrorNotice
              error={smartError}
              onFix={() => {
                void loadData();
              }}
            />
          </Card>
        ) : null}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>数据概览</h2>
          <StandardSearchBar
            onSearchChange={() => {}}
            dateValue={dateRange}
            onDateChange={setDateRange}
            showSearchButton={false}
            showStatus={false}
            showDatePresets={true}
          />
        </div>
        <PageStatCards
          activeKey={statusValue || 'all'}
          cards={[
            {
              key: 'all',
              items: [
                { label: '成品总数', value: rawDataSource.reduce((s, r) => s + (r.availableQty ?? 0) + (r.defectQty ?? 0), 0), unit: '件', color: 'var(--color-primary)' },
              ],
              onClick: () => setStatusValue(''),
              activeColor: 'var(--color-primary)',
            },
            {
              key: 'available',
              items: [
                { label: '可用库存', value: rawDataSource.reduce((s, r) => s + (r.availableQty ?? 0), 0), unit: '件', color: 'var(--color-success)' },
              ],
              onClick: () => setStatusValue('available'),
              activeColor: 'var(--color-success)',
            },
            {
              key: 'defect',
              items: [
                { label: '次品数量', value: rawDataSource.reduce((s, r) => s + (r.defectQty ?? 0), 0), unit: '件', color: 'var(--color-danger)' },
              ],
              onClick: () => setStatusValue('defect'),
              activeColor: 'var(--color-danger)',
            }
          ]}
        />

        <Tabs
          defaultActiveKey="inventory"
          size="large"
          style={{ marginBottom: 0 }}
          items={[
            {
              key: 'inventory',
              label: '库存管理',
              children: (
                <>
        <Card>
          <div style={{ marginBottom: 16 }}>
            <h2 style={{ margin: 0 }}> 成品进销存</h2>
          </div>

          <StandardToolbar
            left={(
              <>
                <StandardSearchBar
                  searchValue={searchText}
                  onSearchChange={setSearchText}
                  searchPlaceholder="搜索订单号/款号/SKU/组织"
                  statusValue={statusValue}
                  onStatusChange={setStatusValue}
                  showDate={false}
                  statusOptions={[
                    { label: '全部', value: '' },
                    { label: '可用库存', value: 'available' },
                    { label: '次品库存', value: 'defect' },
                  ]}
                />
                <Select
                  value={selectedFactoryType}
                  onChange={(value) => setSelectedFactoryType(value || '')}
                  placeholder="内外标签"
                  allowClear
                  style={{ minWidth: 110 }}
                  options={factoryTypeOptions}
                />
              </>
            )}
            right={(
              <>
                <Button icon={<DownloadOutlined />}>导出</Button>
                <Button icon={<ScanOutlined />} onClick={() => setQrcodeOutboundOpen(true)}>扫码出库</Button>
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

          <ResizableTable
            storageKey="finished-inventory-main"
            columns={columns}
            dataSource={pagedDataSource}
            loading={loading}
            rowKey="id"
            stickyHeader
            scroll={{ x: 1400 }}
            pagination={false}
          />
          <StandardPagination
            current={pagination.pagination.current}
            pageSize={pagination.pagination.pageSize}
            total={totalRecords}
            wrapperStyle={{ paddingTop: 12 }}
            onChange={pagination.onChange}
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
            setOutboundProductionOrderNo('');
            setOutboundTrackingNo('');
            setOutboundExpressCompany('');
            setOutboundCustomerName('');
            setOutboundCustomerPhone('');
            setOutboundShippingAddress('');
          }}
          onOk={handleOutboundConfirm}
          size="lg"
          okText="确认出库"
          cancelText="取消"
        >
          {outboundModal.data && (
            <Space orientation="vertical" style={{ width: '100%' }} size="large">
              {/* 基础信息卡片 */}
              <Card size="small" style={{ background: 'var(--color-bg-subtle)' }}>
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
                   请选择需要出库的颜色和尺码，并输入数量：
                </div>
                <ResizableTable
                  storageKey="finished-inventory-sku"
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
                      <ResizableTable.Summary fixed>
                        <ResizableTable.Summary.Row>
                          <ResizableTable.Summary.Cell index={0} colSpan={4} align="right">
                            <strong>合计</strong>
                          </ResizableTable.Summary.Cell>
                          <ResizableTable.Summary.Cell index={1} align="center">
                            <strong style={{ color: 'var(--color-success)' }}>{totalAvailable}</strong>
                          </ResizableTable.Summary.Cell>
                          <ResizableTable.Summary.Cell index={2} colSpan={2} />
                          <ResizableTable.Summary.Cell index={3} align="center">
                            <strong style={{ color: 'var(--primary-color)', fontSize: "var(--font-size-md)" }}>
                              {totalOutbound} 件
                            </strong>
                          </ResizableTable.Summary.Cell>
                        </ResizableTable.Summary.Row>
                      </ResizableTable.Summary>
                    );
                  }}
                />
              </div>

              <CustomerInfoSection
                variant="card"
                customerName={outboundCustomerName}
                onCustomerNameChange={setOutboundCustomerName}
                customerPhone={outboundCustomerPhone}
                onCustomerPhoneChange={setOutboundCustomerPhone}
                shippingAddress={outboundShippingAddress}
                onShippingAddressChange={setOutboundShippingAddress}
              />

              {/* 出库金额自动汇总 */}
              {(() => {
                const totalAmount = skuDetails.reduce((sum, item) => {
                  const qty = item.outboundQty || 0;
                  const price = item.salesPrice || 0;
                  return sum + qty * price;
                }, 0);
                return totalAmount > 0 ? (
                  <div style={{
                    background: '#fff7e6',
                    border: '1px solid #ffd591',
                    padding: '8px 12px',
                    fontSize: "var(--font-size-sm)",
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}>
                    <span style={{ color: '#d46b08' }}>💰 出库金额（按单价 × 出库数量自动计算）</span>
                    <strong style={{ color: '#d46b08', fontSize: "var(--font-size-lg)" }}>
                      ¥ {totalAmount.toFixed(2)}
                    </strong>
                  </div>
                ) : null;
              })()}

              {/* 发货信息 — 填写后自动回写关联电商订单 */}
              <Card size="small" style={{ background: '#fffbe6', border: '1px solid #ffe58f' }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: '#d46b08' }}>
                  📦 发货信息（选填）—— 填写后将自动回写关联电商订单的发货状态和快递单号
                </div>
                <Row gutter={12}>
                  <Col span={8}>
                    <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>关联生产订单号</div>
                    <Input
                      size="small"
                      placeholder="如 PO20260301001"
                      value={outboundProductionOrderNo}
                      onChange={(e) => setOutboundProductionOrderNo(e.target.value)}
                    />
                  </Col>
                  <Col span={8}>
                    <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>快递单号</div>
                    <Input
                      size="small"
                      placeholder="输入快递单号"
                      value={outboundTrackingNo}
                      onChange={(e) => setOutboundTrackingNo(e.target.value)}
                    />
                  </Col>
                  <Col span={8}>
                    <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>快递公司</div>
                    <Select
                      size="small"
                      style={{ width: '100%' }}
                      allowClear
                      placeholder="选择快递公司"
                      value={outboundExpressCompany || undefined}
                      onChange={(v) => setOutboundExpressCompany(v ?? '')}
                    >
                      <Select.Option value="顺丰">顺丰速运</Select.Option>
                      <Select.Option value="中通">中通快递</Select.Option>
                      <Select.Option value="圆通">圆通速递</Select.Option>
                      <Select.Option value="韵达">韵达快递</Select.Option>
                      <Select.Option value="申通">申通快递</Select.Option>
                      <Select.Option value="极兔">极兔速递</Select.Option>
                      <Select.Option value="菜鸟">菜鸟速递</Select.Option>
                      <Select.Option value="EMS">EMS</Select.Option>
                    </Select>
                  </Col>
                </Row>
              </Card>

              {/* 提示信息 */}
              <div style={{
                background: '#e6f7ff',
                border: '1px solid #91d5ff',
                padding: '8px 12px',
                fontSize: "var(--font-size-sm)",
                color: 'var(--primary-color)'
              }}>
                 提示：请在"出库数量"列输入需要出库的数量，系统将自动汇总。出库数量不能超过可用库存。
              </div>
            </Space>
          )}
        </StandardModal>

        {/* 入库记录模态框 */}
        <ResizableModal
          title={
            <Space>
              <HistoryOutlined />
              <span>入库记录</span>
            </Space>
          }
          open={inboundHistoryModal.visible}
          onCancel={() => { inboundHistoryModal.close(); setInboundPage(1); }}
          width="60vw"
          initialHeight={Math.round(window.innerHeight * 0.82)}
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
                <Space size={40} wrap>
                  <div>
                    <span style={{ color: 'var(--neutral-text-disabled)', marginRight: 8 }}>款号:</span>
                    <strong style={{ fontSize: "var(--font-size-lg)" }}>{inboundHistoryModal.data.styleNo}</strong>
                  </div>
                  {inboundHistoryModal.data.orderNo && (
                    <div>
                      <span style={{ color: 'var(--neutral-text-disabled)', marginRight: 8 }}>订单号:</span>
                      <span style={{ fontFamily: 'monospace' }}>{inboundHistoryModal.data.orderNo}</span>
                    </div>
                  )}
                  <div>
                    <span style={{ color: 'var(--neutral-text-disabled)', marginRight: 8 }}>当前可用库存:</span>
                    <strong style={{ fontSize: "var(--font-size-lg)", color: 'var(--color-success)' }}>
                      {inboundHistoryModal.data.availableQty ?? 0} 件
                    </strong>
                  </div>
                </Space>
              </Card>

              {/* 入库记录表格 */}
              <ResizableTable
                storageKey="finished-inventory-records"
                columns={[
                  {
                    title: '入库时间',
                    dataIndex: 'inboundDate',
                    width: 160,
                  },
                  {
                    title: '款号',
                    dataIndex: 'styleNo',
                    width: 100,
                    render: (text: string) => <strong style={{ fontFamily: 'monospace' }}>{text}</strong>,
                  },
                  {
                    title: '订单号',
                    dataIndex: 'orderNo',
                    width: 130,
                    render: (text) => <span style={{ color: 'var(--primary-color)', fontFamily: 'monospace' }}>{text}</span>,
                  },
                  {
                    title: '质检入库号',
                    dataIndex: 'qualityInspectionNo',
                    width: 150,
                    render: (text) => <span style={{ color: 'var(--primary-color)' }}>{text}</span>,
                  },
                  {
                    title: '菲号',
                    dataIndex: 'cuttingBundleNo',
                    width: 100,
                    render: (text) => <span style={{ fontFamily: 'monospace' }}>{text || '-'}</span>,
                  },
                  {
                    title: '颜色',
                    dataIndex: 'color',
                    width: 80,
                  },
                  {
                    title: '尺码',
                    dataIndex: 'size',
                    width: 70,
                  },
                  {
                    title: '入库数量',
                    dataIndex: 'quantity',
                    width: 90,
                    align: 'center',
                    render: (text) => <strong style={{ color: 'var(--color-success)' }}>{text} 件</strong>,
                  },
                  {
                    title: '库位',
                    dataIndex: 'warehouseLocation',
                    width: 80,
                  },
                  {
                    title: '操作人',
                    dataIndex: 'operator',
                    width: 80,
                  },

                ]}
                dataSource={inboundHistory}
                rowKey="id"
                pagination={{
                  current: inboundPage,
                  pageSize: inboundPageSize,
                  showSizeChanger: true,
                  pageSizeOptions: ['20', '50', '100'],
                  showTotal: (total) => `共 ${total} 条`,
                  onChange: (page, size) => {
                    setInboundPage(page);
                    setInboundPageSize(size);
                  },
                }}
                size="small"
                bordered
              />

              {/* 汇总信息 + 对账公式 */}
              <Card size="small" style={{ background: '#e6f7ff', borderColor: '#91d5ff' }}>
                <Space size={32} wrap>
                  <div>
                    <span style={{ color: 'var(--primary-color)' }}>总入库次数:</span>
                    <strong style={{ marginLeft: 8, fontSize: "var(--font-size-lg)", color: 'var(--primary-color)' }}>
                      {inboundHistory.length} 次
                    </strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--primary-color)' }}>累计入库:</span>
                    <strong style={{ marginLeft: 8, fontSize: "var(--font-size-lg)", color: 'var(--color-success)' }}>
                      {inboundHistory.reduce((sum, item) => sum + item.quantity, 0)} 件
                    </strong>
                  </div>
                  {outstockTotal > 0 && (
                    <div>
                      <span style={{ color: '#cf1322' }}>累计出库:</span>
                      <strong style={{ marginLeft: 8, fontSize: "var(--font-size-lg)", color: '#cf1322' }}>
                        {outstockTotal} 件
                      </strong>
                    </div>
                  )}
                  <div style={{
                    background: 'var(--color-success)',
                    color: '#fff',
                    padding: '2px 12px',
                    borderRadius: 6,
                    fontSize: "var(--font-size-base)",
                  }}>
                    当前可用库存 ={' '}
                    <strong style={{ fontSize: "var(--font-size-lg)" }}>
                      {inboundHistoryModal.data?.availableQty ?? 0} 件
                    </strong>
                  </div>
                </Space>
              </Card>
            </Space>
          )}
        </ResizableModal>

        {/* 扫码批量出库弹窗 */}
        <QrcodeOutboundModal
          open={qrcodeOutboundOpen}
          onClose={() => setQrcodeOutboundOpen(false)}
          onSuccess={loadData}
        />
                </>
              ),
            },
            {
              key: 'outstock-records',
              label: '出库记录',
              children: <OutstockRecordTab />,
            },
          ]}
        />
    </>
  );
};

export default _FinishedInventory;
