import React, { useState } from 'react';
import { Card, Button, Space, Input, Select, App, Tabs, Row, Col, Drawer } from 'antd';
import { HistoryOutlined, ScanOutlined, InboxOutlined } from '@ant-design/icons';
import QrcodeOutboundModal from './QrcodeOutboundModal';
import OutstockRecordTab from './OutstockRecordTab';
import CustomerInfoSection from './CustomerInfoSection';
import ScanOperationModal from './FinishedScanOperationModal';
import FreeInboundModal from './FreeInboundModal';
import { getMainColumns, getSkuColumns } from './finishedInventoryColumns';
import type { FinishedInventory } from './finishedInventoryColumns';
import ResizableTable from '@/components/common/ResizableTable';
import StandardModal from '@/components/common/StandardModal';
import StandardPagination from '@/components/common/StandardPagination';
import PageStatCards from '@/components/common/PageStatCards';
import StandardSearchBar from '@/components/common/StandardSearchBar';
import { formatMoney } from '@/utils/format';
import StandardToolbar from '@/components/common/StandardToolbar';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import { useFinishedInventoryData } from './hooks/useFinishedInventoryData';
import { useFinishedInventoryActions } from './hooks/useFinishedInventoryActions';
import { useSync } from '@/utils/syncManager';

const _FinishedInventory: React.FC = () => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { message } = App.useApp();
  const [qrcodeOutboundOpen, setQrcodeOutboundOpen] = useState(false);
  const [scanOperationOpen, setScanOperationOpen] = useState(false);
  const [freeInboundOpen, setFreeInboundOpen] = useState(false);
  const [inboundPage, setInboundPage] = useState(1);
  const [inboundPageSize, setInboundPageSize] = useState(20);

  const { rawDataSource, dataSource, pagedDataSource, totalRecords, loading, smartError, showSmartErrorNotice, searchText, setSearchText, statusValue, setStatusValue, selectedFactoryType, setSelectedFactoryType, factoryTypeOptions, pagination, loadData } = useFinishedInventoryData();
  const { outboundModal, inboundHistoryModal, skuDetails, inboundHistory, outstockTotal, outboundType, setOutboundType, outboundReason, setOutboundReason, outboundProductionOrderNo, setOutboundProductionOrderNo, outboundTrackingNo, setOutboundTrackingNo, outboundExpressCompany, setOutboundExpressCompany, outboundCustomerName, setOutboundCustomerName, outboundCustomerPhone, setOutboundCustomerPhone, outboundShippingAddress, setOutboundShippingAddress, outboundSubmitting, handleOutbound, handleSKUQtyChange, handleSKUSalesPriceChange, handleSKUPriceReasonChange, handleOutboundConfirm, handleViewInboundHistory } = useFinishedInventoryActions(rawDataSource, loadData);

  // 30秒轮询自动刷新成品库存
  useSync(
    'warehouse-finished-inventory-poll',
    async () => { await loadData(); },
    () => {},
    { interval: 30000, pauseOnHidden: true }
  );

  const columns = getMainColumns({ handleOutbound, handleViewInboundHistory });
  const skuColumns = getSkuColumns({ handleSKUQtyChange, handleSKUSalesPriceChange, handleSKUPriceReasonChange });
  const totalAvailableQty = dataSource.reduce((sum, item) => sum + (item.availableQty || 0), 0);
  const totalDefectQty = dataSource.reduce((sum, item) => sum + (item.defectQty || 0), 0);
  const skuTotalOutbound = skuDetails.reduce((sum, item) => sum + (item.outboundQty || 0), 0);
  const skuTotalAmount = skuDetails.reduce((sum, item) => sum + (item.outboundQty || 0) * (item.salesPrice || 0), 0);
  const inboundTotalQty = inboundHistory.reduce((sum, item) => sum + (item.quantity || 0), 0);

  return (
    <>
      {showSmartErrorNotice && smartError && <Card style={{ marginBottom: 12 }}><SmartErrorNotice error={smartError} onFix={() => { void loadData(); }} /></Card>}
      <Card style={{ marginBottom: 0, border: 'none', boxShadow: 'none', background: 'transparent' }}>
        <StandardToolbar left={<StandardSearchBar searchValue={searchText} onSearchChange={setSearchText} searchPlaceholder="搜索订单号/款号/SKU" statusValue={statusValue} onStatusChange={setStatusValue} statusOptions={[{ label: '全部', value: '' }, { label: '有库存', value: 'available' }, { label: '有次品', value: 'defect' }]} />} right={<Space wrap><Select style={{ width: 140 }} placeholder="工厂类型" allowClear value={selectedFactoryType || undefined} onChange={setSelectedFactoryType} options={factoryTypeOptions} /><Button icon={<InboxOutlined />} onClick={() => setFreeInboundOpen(true)}>无采购单入库</Button><Button icon={<ScanOutlined />} onClick={() => setScanOperationOpen(true)}>扫码出入库</Button><Button icon={<ScanOutlined />} onClick={() => setQrcodeOutboundOpen(true)}>扫码出库</Button></Space>} />
      </Card>
      <PageStatCards cards={[{ key: 'total', items: [{ label: '成品总数', value: totalRecords, unit: '款', color: 'var(--color-primary)' }] }, { key: 'available', items: [{ label: '可用库存', value: totalAvailableQty, unit: '件', color: 'var(--color-success)' }] }, { key: 'defect', items: [{ label: '次品数量', value: totalDefectQty, unit: '件', color: 'var(--color-danger)' }] }]} activeKey="" />
      <Tabs defaultActiveKey="inventory" style={{ marginTop: 12 }} items={[
        {
          key: 'inventory',
          label: '库存管理',
          children: (<>
          <Card>
            <ResizableTable storageKey="warehouse-finished-inventory" size="small" columns={columns} dataSource={pagedDataSource} rowKey={(r: FinishedInventory) => `${r.orderNo}_${r.styleNo}`} loading={loading} pagination={false} scroll={{ x: 'max-content' }}
              emptyDescription="暂无成品库存数据"
              emptyActionText="去扫码入库"
              onEmptyAction={() => { window.location.href = '/warehouse/scan-in'; }}
            />
            <StandardPagination current={pagination.pagination.current} pageSize={pagination.pagination.pageSize} total={totalRecords} onChange={(page, _pageSize) => pagination.gotoPage(page)} />
          </Card>
          <Drawer
            title={`出库 - ${outboundModal.data?.styleNo || ''}`}
            open={outboundModal.visible}
            onClose={outboundModal.close}
            size="large"
            styles={{ wrapper: { width: '85%' } }}
            destroyOnHidden
            extra={
              <Space>
                <Button onClick={outboundModal.close} disabled={outboundSubmitting}>取消</Button>
                <Button type="primary" loading={outboundSubmitting} onClick={handleOutboundConfirm} disabled={outboundSubmitting}>确认出库</Button>
              </Space>
            }
          >
            {outboundModal.data && (
              <>
                <Card style={{ marginBottom: 12 }}>
                  <Row gutter={16}>
                    <Col span={8}>
                      <div style={{ color: 'var(--color-text-tertiary)', fontSize: 14 }}>订单号</div>
                      <div style={{ fontWeight: 600 }}>{outboundModal.data.orderNo || '-'}</div>
                    </Col>
                    <Col span={8}>
                      <div style={{ color: 'var(--color-text-tertiary)', fontSize: 14 }}>款号</div>
                      <div style={{ fontWeight: 600 }}>{outboundModal.data.styleNo || '-'}</div>
                    </Col>
                    <Col span={8}>
                      <div style={{ color: 'var(--color-text-tertiary)', fontSize: 14 }}>款名</div>
                      <div style={{ fontWeight: 600 }}>{outboundModal.data.styleName || '-'}</div>
                    </Col>
                  </Row>
                </Card>
                <Card style={{ marginBottom: 12 }}>
                  <Row gutter={16}>
                    <Col span={12}>
                      <div style={{ marginBottom: 8, fontSize: 14, color: 'var(--color-text-tertiary)' }}>出库类型</div>
                      <Select
                        style={{ width: '100%' }}
                        value={outboundType}
                        onChange={(v) => setOutboundType(v)}
                        options={[
                          { label: '销售出库', value: 'sales' },
                          { label: '调拨出库', value: 'transfer' },
                          { label: '报废出库', value: 'scrap' }
                        ]}
                      />
                    </Col>
                    <Col span={12}>
                      <div style={{ marginBottom: 8, fontSize: 14, color: 'var(--color-text-tertiary)' }}>
                        {outboundType === 'scrap' ? '报废原因' : '备注（选填）'}
                      </div>
                      <Input
                        value={outboundReason}
                        onChange={e => setOutboundReason(e.target.value)}
                        placeholder={outboundType === 'scrap' ? '请填写报废原因' : '选填'}
                        status={outboundType === 'scrap' && !outboundReason.trim() ? 'warning' : undefined}
                      />
                    </Col>
                  </Row>
                </Card>
                <div style={{ marginBottom: 8, fontWeight: 600 }}>SKU明细</div>
                <ResizableTable columns={skuColumns} dataSource={skuDetails} rowKey="sku" pagination={false} emptyDescription="暂无SKU数据" />
                <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
                  <span>出库总量: {skuTotalOutbound} 件</span>
                  <span>出库金额: {formatMoney(skuTotalAmount)}</span>
                </div>
                {outboundType === 'sales' && <CustomerInfoSection customerName={outboundCustomerName} onCustomerNameChange={setOutboundCustomerName} customerPhone={outboundCustomerPhone} onCustomerPhoneChange={setOutboundCustomerPhone} shippingAddress={outboundShippingAddress} onShippingAddressChange={setOutboundShippingAddress} variant="card" />}
                <Card title="发货信息（选填）" style={{ marginTop: 12 }}>
                  <Row gutter={16}>
                    <Col span={8}>
                      <div style={{ marginBottom: 8, fontSize: 14, color: 'var(--color-text-tertiary)' }}>关联生产单号</div>
                      <Input value={outboundProductionOrderNo} onChange={e => setOutboundProductionOrderNo(e.target.value)} placeholder="选填" />
                    </Col>
                    <Col span={8}>
                      <div style={{ marginBottom: 8, fontSize: 14, color: 'var(--color-text-tertiary)' }}>快递单号</div>
                      <Input value={outboundTrackingNo} onChange={e => setOutboundTrackingNo(e.target.value)} placeholder="选填" />
                    </Col>
                    <Col span={8}>
                      <div style={{ marginBottom: 8, fontSize: 14, color: 'var(--color-text-tertiary)' }}>快递公司</div>
                      <Input value={outboundExpressCompany} onChange={e => setOutboundExpressCompany(e.target.value)} placeholder="选填" />
                    </Col>
                  </Row>
                </Card>
              </>
            )}
          </Drawer>
          <Drawer
            title={`入库记录 - ${inboundHistoryModal.data?.styleNo || ''}`}
            open={inboundHistoryModal.visible}
            onClose={inboundHistoryModal.close}
            size="large"
            styles={{ wrapper: { width: '85%' } }}
            destroyOnHidden
          >
            {inboundHistoryModal.data && (
              <>
                <Card style={{ marginBottom: 12 }}><Row gutter={16}><Col span={8}><div style={{ color: 'var(--color-text-tertiary)', fontSize: 14 }}>款号</div><div style={{ fontWeight: 600 }}>{inboundHistoryModal.data.styleNo || '-'}</div></Col><Col span={8}><div style={{ color: 'var(--color-text-tertiary)', fontSize: 14 }}>总入库量</div><div style={{ fontWeight: 600 }}>{inboundHistoryModal.data.totalInboundQty ?? 0} 件</div></Col><Col span={8}><div style={{ color: 'var(--color-text-tertiary)', fontSize: 14 }}>当前库存</div><div style={{ fontWeight: 600 }}>{inboundHistoryModal.data.availableQty ?? 0} 件</div></Col></Row></Card>
                <ResizableTable size="small" columns={[{ title: '入库日期', dataIndex: 'inboundDate', key: 'inboundDate', width: 120 }, { title: '质检单号', dataIndex: 'qualityInspectionNo', key: 'qualityInspectionNo', width: 140 }, { title: '菲号', dataIndex: 'cuttingBundleNo', key: 'cuttingBundleNo', width: 100 }, { title: '颜色', dataIndex: 'color', key: 'color', width: 80 }, { title: '尺码', dataIndex: 'size', key: 'size', width: 60 }, { title: '数量', dataIndex: 'quantity', key: 'quantity', width: 80, align: 'right' as const }, { title: '操作人', dataIndex: 'operator', key: 'operator', width: 100 }, { title: '库位', dataIndex: 'warehouseLocation', key: 'warehouseLocation', width: 100 }]} dataSource={inboundHistory} rowKey="id" emptyDescription="暂无入库记录" pagination={{ current: inboundPage, pageSize: inboundPageSize, total: inboundHistory.length, onChange: (p, ps) => { setInboundPage(p); setInboundPageSize(ps); } }} />
                <div style={{ marginTop: 12, padding: '8px 12px', background: 'var(--color-bg-container)', borderRadius: 6, fontSize: 14 }}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>对账公式</div>
                  <div>入库总量: <b>{inboundHistoryModal.data.totalInboundQty ?? 0}</b> 件 = 当前库存: <b style={{ color: 'var(--color-success)' }}>{inboundHistoryModal.data.availableQty ?? 0}</b> 件 + 出库总量: <b style={{ color: '#fa541c' }}>{outstockTotal}</b> 件 + 次品: <b>{inboundHistoryModal.data.defectQty ?? 0}</b> 件</div>
                  <div style={{ marginTop: 4, color: 'var(--color-text-tertiary)' }}>入库记录合计: {inboundTotalQty} 件（{inboundHistory.length} 条记录）</div>
                </div>
              </>
            )}
          </Drawer>
          <QrcodeOutboundModal open={qrcodeOutboundOpen} onClose={() => setQrcodeOutboundOpen(false)} onSuccess={() => { setQrcodeOutboundOpen(false); loadData(); }} />
          <ScanOperationModal open={scanOperationOpen} onClose={() => setScanOperationOpen(false)} onSuccess={() => { setScanOperationOpen(false); loadData(); }} />
          <FreeInboundModal open={freeInboundOpen} onClose={() => setFreeInboundOpen(false)} onSuccess={() => { setFreeInboundOpen(false); loadData(); }} /></>),
        },
        {
          key: 'outstock',
          label: <span><HistoryOutlined /> 出库记录</span>,
          children: <OutstockRecordTab />,
        },
      ]} />
    </>
  );
};

export default _FinishedInventory;