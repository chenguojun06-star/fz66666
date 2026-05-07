import React, { useState } from 'react';
import { Card, Button, Space, Input, Select, App, Tabs, Row, Col } from 'antd';
import { HistoryOutlined, ScanOutlined, InboxOutlined } from '@ant-design/icons';
import QrcodeOutboundModal from './QrcodeOutboundModal';
import OutstockRecordTab from './OutstockRecordTab';
import CustomerInfoSection from './CustomerInfoSection';
import ScanOperationModal from './ScanOperationModal';
import FreeInboundModal from './FreeInboundModal';
import { getMainColumns, getSkuColumns } from './finishedInventoryColumns';
import type { FinishedInventory } from './finishedInventoryColumns';
import ResizableTable from '@/components/common/ResizableTable';
import StandardModal from '@/components/common/StandardModal';
import ResizableModal from '@/components/common/ResizableModal';
import StandardPagination from '@/components/common/StandardPagination';
import PageStatCards from '@/components/common/PageStatCards';
import StandardSearchBar from '@/components/common/StandardSearchBar';
import StandardToolbar from '@/components/common/StandardToolbar';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import { useFinishedInventoryData } from './hooks/useFinishedInventoryData';
import { useFinishedInventoryActions } from './hooks/useFinishedInventoryActions';

const _FinishedInventory: React.FC = () => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { message } = App.useApp();
  const [qrcodeOutboundOpen, setQrcodeOutboundOpen] = useState(false);
  const [scanOperationOpen, setScanOperationOpen] = useState(false);
  const [freeInboundOpen, setFreeInboundOpen] = useState(false);
  const [inboundPage, setInboundPage] = useState(1);
  const [inboundPageSize, setInboundPageSize] = useState(20);

  const { rawDataSource, dataSource, pagedDataSource, totalRecords, loading, smartError, showSmartErrorNotice, searchText, setSearchText, statusValue, setStatusValue, selectedFactoryType, setSelectedFactoryType, factoryTypeOptions, pagination, loadData } = useFinishedInventoryData();
  const { outboundModal, inboundHistoryModal, skuDetails, inboundHistory, outstockTotal, outboundProductionOrderNo, setOutboundProductionOrderNo, outboundTrackingNo, setOutboundTrackingNo, outboundExpressCompany, setOutboundExpressCompany, outboundCustomerName, setOutboundCustomerName, outboundCustomerPhone, setOutboundCustomerPhone, outboundShippingAddress, setOutboundShippingAddress, handleOutbound, handleSKUQtyChange, handleOutboundConfirm, handleViewInboundHistory } = useFinishedInventoryActions(rawDataSource, loadData);

  const columns = getMainColumns({ handleOutbound, handleViewInboundHistory });
  const skuColumns = getSkuColumns({ handleSKUQtyChange });
  const totalAvailableQty = dataSource.reduce((sum, item) => sum + (item.availableQty || 0), 0);
  const totalDefectQty = dataSource.reduce((sum, item) => sum + (item.defectQty || 0), 0);
  const skuTotalOutbound = skuDetails.reduce((sum, item) => sum + (item.outboundQty || 0), 0);
  const skuTotalAmount = skuDetails.reduce((sum, item) => sum + (item.outboundQty || 0) * (item.costPrice || 0), 0);
  const inboundTotalQty = inboundHistory.reduce((sum, item) => sum + (item.quantity || 0), 0);

  return (
    <>
      {showSmartErrorNotice && smartError && <Card size="small" style={{ marginBottom: 12 }}><SmartErrorNotice error={smartError} onFix={() => { void loadData(); }} /></Card>}
      <Card size="small" className="filter-card mb-sm">
        <StandardToolbar left={<StandardSearchBar searchValue={searchText} onSearchChange={setSearchText} searchPlaceholder="搜索订单号/款号/SKU" statusValue={statusValue} onStatusChange={setStatusValue} statusOptions={[{ label: '全部', value: '' }, { label: '有库存', value: 'available' }, { label: '有次品', value: 'defect' }]} />} right={<Space><Select style={{ width: 140 }} placeholder="工厂类型" allowClear value={selectedFactoryType || undefined} onChange={setSelectedFactoryType} options={[{ label: '全部工厂', value: '' }, ...factoryTypeOptions]} /><Button icon={<InboxOutlined />} onClick={() => setFreeInboundOpen(true)}>自由入库</Button><Button icon={<ScanOutlined />} onClick={() => setScanOperationOpen(true)}>扫码出入库</Button><Button icon={<ScanOutlined />} onClick={() => setQrcodeOutboundOpen(true)}>扫码出库</Button></Space>} />
      </Card>
      <PageStatCards cards={[{ key: 'total', items: [{ label: '成品总数', value: totalRecords, unit: '款', color: 'var(--color-primary)' }] }, { key: 'available', items: [{ label: '可用库存', value: totalAvailableQty, unit: '件', color: 'var(--color-success)' }] }, { key: 'defect', items: [{ label: '次品数量', value: totalDefectQty, unit: '件', color: 'var(--color-danger)' }] }]} activeKey="" />
      <Tabs defaultActiveKey="inventory" style={{ marginTop: 12 }} items={[
        {
          key: 'inventory',
          label: '库存管理',
          children: (<>
          <Card size="small">
            <ResizableTable storageKey="warehouse-finished-inventory" columns={columns} dataSource={pagedDataSource} rowKey={(r: FinishedInventory) => `${r.orderNo}_${r.styleNo}`} loading={loading} pagination={false} scroll={{ x: 'max-content' }} />
            <StandardPagination current={pagination.pagination.current} pageSize={pagination.pagination.pageSize} total={totalRecords} onChange={(page, _pageSize) => pagination.gotoPage(page)} />
          </Card>
          <StandardModal title={`出库 - ${outboundModal.data?.styleNo || ''}`} open={outboundModal.visible} onOk={handleOutboundConfirm} onCancel={outboundModal.close} okText="确认出库" width={800}>
            {outboundModal.data && (
              <>
                <Card size="small" style={{ marginBottom: 12 }}><Row gutter={16}><Col span={8}><div style={{ color: '#999', fontSize: 12 }}>订单号</div><div style={{ fontWeight: 600 }}>{outboundModal.data.orderNo || '-'}</div></Col><Col span={8}><div style={{ color: '#999', fontSize: 12 }}>款号</div><div style={{ fontWeight: 600 }}>{outboundModal.data.styleNo || '-'}</div></Col><Col span={8}><div style={{ color: '#999', fontSize: 12 }}>款名</div><div style={{ fontWeight: 600 }}>{outboundModal.data.styleName || '-'}</div></Col></Row></Card>
                <div style={{ marginBottom: 8, fontWeight: 600 }}>SKU明细</div>
                <ResizableTable columns={skuColumns} dataSource={skuDetails} rowKey="sku" pagination={false} size="small" />
                <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}><span>出库总量: {skuTotalOutbound} 件</span><span>出库金额: ¥{skuTotalAmount.toFixed(2)}</span></div>
                <CustomerInfoSection customerName={outboundCustomerName} onCustomerNameChange={setOutboundCustomerName} customerPhone={outboundCustomerPhone} onCustomerPhoneChange={setOutboundCustomerPhone} shippingAddress={outboundShippingAddress} onShippingAddressChange={setOutboundShippingAddress} variant="card" />
                <Card size="small" title="发货信息（选填）" style={{ marginTop: 12 }}>
                  <Row gutter={16}><Col span={8}><div style={{ marginBottom: 8, fontSize: 12, color: '#999' }}>关联生产单号</div><Input value={outboundProductionOrderNo} onChange={e => setOutboundProductionOrderNo(e.target.value)} placeholder="选填" /></Col><Col span={8}><div style={{ marginBottom: 8, fontSize: 12, color: '#999' }}>快递单号</div><Input value={outboundTrackingNo} onChange={e => setOutboundTrackingNo(e.target.value)} placeholder="选填" /></Col><Col span={8}><div style={{ marginBottom: 8, fontSize: 12, color: '#999' }}>快递公司</div><Input value={outboundExpressCompany} onChange={e => setOutboundExpressCompany(e.target.value)} placeholder="选填" /></Col></Row>
                </Card>
              </>
            )}
          </StandardModal>
          <ResizableModal title={`入库记录 - ${inboundHistoryModal.data?.styleNo || ''}`} open={inboundHistoryModal.visible} onCancel={inboundHistoryModal.close} width={900} initialHeight={500} footer={null}>
            {inboundHistoryModal.data && (
              <>
                <Card size="small" style={{ marginBottom: 12 }}><Row gutter={16}><Col span={8}><div style={{ color: '#999', fontSize: 12 }}>款号</div><div style={{ fontWeight: 600 }}>{inboundHistoryModal.data.styleNo || '-'}</div></Col><Col span={8}><div style={{ color: '#999', fontSize: 12 }}>总入库量</div><div style={{ fontWeight: 600 }}>{inboundHistoryModal.data.totalInboundQty ?? 0} 件</div></Col><Col span={8}><div style={{ color: '#999', fontSize: 12 }}>当前库存</div><div style={{ fontWeight: 600 }}>{inboundHistoryModal.data.availableQty ?? 0} 件</div></Col></Row></Card>
                <ResizableTable columns={[{ title: '入库日期', dataIndex: 'inboundDate', key: 'inboundDate', width: 120 }, { title: '质检单号', dataIndex: 'qualityInspectionNo', key: 'qualityInspectionNo', width: 140 }, { title: '菲号', dataIndex: 'cuttingBundleNo', key: 'cuttingBundleNo', width: 100 }, { title: '颜色', dataIndex: 'color', key: 'color', width: 80 }, { title: '尺码', dataIndex: 'size', key: 'size', width: 60 }, { title: '数量', dataIndex: 'quantity', key: 'quantity', width: 80, align: 'right' as const }, { title: '操作人', dataIndex: 'operator', key: 'operator', width: 100 }, { title: '库位', dataIndex: 'warehouseLocation', key: 'warehouseLocation', width: 100 }]} dataSource={inboundHistory} rowKey="id" pagination={{ current: inboundPage, pageSize: inboundPageSize, total: inboundHistory.length, onChange: (p, ps) => { setInboundPage(p); setInboundPageSize(ps); } }} size="small" />
                <div style={{ marginTop: 12, padding: '8px 12px', background: '#f6f8fa', borderRadius: 6, fontSize: 13 }}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>对账公式</div>
                  <div>入库总量: <b>{inboundHistoryModal.data.totalInboundQty ?? 0}</b> 件 = 当前库存: <b style={{ color: '#52c41a' }}>{inboundHistoryModal.data.availableQty ?? 0}</b> 件 + 出库总量: <b style={{ color: '#fa541c' }}>{outstockTotal}</b> 件 + 次品: <b>{inboundHistoryModal.data.defectQty ?? 0}</b> 件</div>
                  <div style={{ marginTop: 4, color: '#999' }}>入库记录合计: {inboundTotalQty} 件（{inboundHistory.length} 条记录）</div>
                </div>
              </>
            )}
          </ResizableModal>
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
