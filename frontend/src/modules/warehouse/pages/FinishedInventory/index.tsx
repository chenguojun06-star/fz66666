import React, { useState } from 'react';
import { Card, Button, Space, Input, InputNumber, Select, Row, Col, Drawer, Tag } from 'antd';
import { HistoryOutlined, ScanOutlined, InboxOutlined } from '@ant-design/icons';
import QrcodeOutboundModal from './QrcodeOutboundModal';
import OutstockRecordTab from './OutstockRecordTab';
import CustomerInfoSection from './CustomerInfoSection';
import StyleCoverThumb from '@/components/StyleAssets/StyleCoverThumb';
import { App } from 'antd';
import api from '@/utils/api';
import ScanOperationModal from './FinishedScanOperationModal';
import FreeInboundModal from './FreeInboundModal';
import SkuDetailDrawer from './SkuDetailDrawer';
import RecordLogDrawer from '@/components/common/RecordLogDrawer';
import { getMainColumns, getSkuColumns } from './finishedInventoryColumns';
import type { FinishedInventory } from './finishedInventoryTypes';
import type { FinishedInventoryRow } from './finishedInventoryColumns';
import { flattenInventoryBySku } from './flattenBySku';
import ResizableTable from '@/components/common/ResizableTable';
import StandardPagination from '@/components/common/StandardPagination';
import PageStatCards from '@/components/common/PageStatCards';
import StandardSearchBar from '@/components/common/StandardSearchBar';
import { formatMoney } from '@/utils/format';
import StandardToolbar from '@/components/common/StandardToolbar';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import PersistentTabs from '@/components/common/PersistentTabs';
import { useFinishedInventoryData } from './hooks/useFinishedInventoryData';
import { useFinishedInventoryActions } from './hooks/useFinishedInventoryActions';
import { useSync } from '@/utils/syncManager';
import { useSearchParams } from 'react-router-dom';

const _FinishedInventory: React.FC = () => {
  const [qrcodeOutboundOpen, setQrcodeOutboundOpen] = useState(false);
  const [scanOperationOpen, setScanOperationOpen] = useState(false);
  const [freeInboundOpen, setFreeInboundOpen] = useState(false);
  // D-362i：商品仓储全页日志侧滑看板（含出库/入库/扫码流水）
  const [pageLogOpen, setPageLogOpen] = useState(false);
  const [inboundPage, setInboundPage] = useState(1);
  const [inboundPageSize, setInboundPageSize] = useState(20);

  const { rawDataSource, dataSource, pagedDataSource, totalRecords, loading, smartError, showSmartErrorNotice, searchText, setSearchText, statusValue, setStatusValue, selectedFactoryType, setSelectedFactoryType, factoryTypeOptions, pagination, loadData } = useFinishedInventoryData();
  const [searchParams] = useSearchParams();
  const directShipInitRef = React.useRef(false);
  const directShipStyleNo = String(searchParams.get('styleNo') || '').trim();
  const directShipOrderNo = String(searchParams.get('orderNo') || '').trim();
  const isDirectShipEntry = String(searchParams.get('directShip') || '') === '1';
  const [directShipMode, setDirectShipMode] = React.useState(false);
  const { outboundModal, inboundHistoryModal, skuDetailModal, skuDetails, inboundHistory, outstockTotal, outboundType, setOutboundType, outboundReason, setOutboundReason, outboundProductionOrderNo, setOutboundProductionOrderNo, outboundTrackingNo, setOutboundTrackingNo, outboundExpressCompany, setOutboundExpressCompany, outboundCustomerName, setOutboundCustomerName, outboundCustomerPhone, setOutboundCustomerPhone, outboundShippingAddress, setOutboundShippingAddress, outboundSubmitting, handleOutbound, handleSKUQtyChange, handleSKUSalesPriceChange, handleSKUPriceReasonChange, handleOutboundConfirm, handleViewInboundHistory, handleViewSkuDetail, handleAddStyleRows, handleRemoveStyleFromCart, handleFillAllAvailable, handleApplyUnifiedPrice } = useFinishedInventoryActions(rawDataSource, loadData, { directShip: directShipMode });
  // D-437：统一单价输入
  const [unifiedPrice, setUnifiedPrice] = React.useState<number | null>(null);

  // 30秒轮询自动刷新成品库存
  // 注意：fetchFn 必须返回非 null/undefined 值，否则 syncManager 会判定为"空数据"并累计 3 次后自动停止
  useSync(
    'warehouse-finished-inventory-poll',
    async () => { await loadData(true); return true; },
    () => {},
    { interval: 30000, pauseOnHidden: true }
  );

  // 跨页面实时联动：其它模块（仓库地图/扫码入库等）发生库存变动广播 data:changed 后立即刷新
  React.useEffect(() => {
    const handleDataChanged = () => { void loadData(true); };
    window.addEventListener('data:changed', handleDataChanged);
    return () => window.removeEventListener('data:changed', handleDataChanged);
  }, [loadData]);

  // D-360k：质检详情「直接发货」跳转本页 → 自动打开销售出库抽屉（预填订单/款号/商品编码明细，直发模式免库存校验）
  React.useEffect(() => {
    if (!directShipStyleNo || directShipInitRef.current) return;
    const record = rawDataSource.find((r) => String(r.styleNo || '').trim() === directShipStyleNo);
    if (!record) return;
    directShipInitRef.current = true;
    if (isDirectShipEntry) {
      setDirectShipMode(true);
      // D-363e：直发模式只允许销售出库——直发不扣库存，选调拨/报废会生成幽灵出库单
      setOutboundType('sales');
    }
    if (directShipOrderNo && !record.orderNo) {
      record.orderNo = directShipOrderNo;
    }
    handleOutbound(record);
    // 打开后清掉 URL 参数，避免刷新重复弹出
    window.history.replaceState(null, '', window.location.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setOutboundType 为 setState 稳定引用，仅直发入口打开时执行一次
  }, [directShipStyleNo, directShipOrderNo, isDirectShipEntry, rawDataSource, handleOutbound]);

  // D-241：序号按「款」编号，翻页后要接续上一页，故传入分页偏移
  const indexOffset = ((pagination.pagination.current || 1) - 1) * (pagination.pagination.pageSize || 0);
  const columns = getMainColumns({ handleOutbound, handleViewInboundHistory, handleViewSkuDetail }, indexOffset);
  // D-363i：多款混出购物车——加款全库搜索（不受当前页限制），添加后可继续搜索，
  // 表格只显示已勾选进清单的款
  const cartStyleNos = Array.from(new Set(skuDetails.map(item => item.styleNo || outboundModal.data?.styleNo || '').filter(Boolean)));
  const cartStyleNames = new Map(skuDetails.map(item => [item.styleNo || '', item.styleName || '']));
  const [styleSearchText, setStyleSearchText] = useState('');
  const [styleSearchOptions, setStyleSearchOptions] = useState<{ label: string; value: string; rows: FinishedInventory[] }[]>([]);
  const [styleSearching, setStyleSearching] = useState(false);
  const styleSearchTimer = React.useRef<number | undefined>(undefined);
  const handleStyleSearch = React.useCallback((text: string) => {
    setStyleSearchText(text);
    if (styleSearchTimer.current) window.clearTimeout(styleSearchTimer.current);
    const kw = text.trim();
    if (!kw) { setStyleSearchOptions([]); return; }
    styleSearchTimer.current = window.setTimeout(async () => {
      setStyleSearching(true);
      try {
        const res = await api.post('/warehouse/finished-inventory/list', { page: 1, pageSize: 100, keyword: kw });
        const data = res.data || res;
        const recs: FinishedInventory[] = data.records || [];
        const byStyle = new Map<string, FinishedInventory[]>();
        for (const r of recs) {
          const sn = String(r.styleNo || '');
          if (!sn) continue;
          if (!byStyle.has(sn)) byStyle.set(sn, []);
          byStyle.get(sn)!.push(r);
        }
        setStyleSearchOptions(Array.from(byStyle.entries())
          .filter(([sn]) => !cartStyleNos.includes(sn))
          .map(([sn, rows]) => ({
            label: `${sn}${rows[0].styleName ? ` ${rows[0].styleName}` : ''}（可用 ${rows.reduce((sum, r) => sum + (r.availableQty ?? 0), 0)} 件）`,
            value: sn,
            rows,
          })));
      } catch { setStyleSearchOptions([]); }
      finally { setStyleSearching(false); }
    }, 300);
  }, [cartStyleNos]);
  const handleStyleSelect = (sn: string) => {
    const opt = styleSearchOptions.find(o => o.value === sn);
    if (opt) handleAddStyleRows(opt.rows);
    setStyleSearchText(''); setStyleSearchOptions([]);
  };
  // 关抽屉清搜索残留
  React.useEffect(() => {
    if (!outboundModal.visible) { setStyleSearchText(''); setStyleSearchOptions([]); setUnifiedPrice(null); }
  }, [outboundModal.visible]);
  // D-228：一款多码时拆成每个商品编码一行，款级信息由 rowSpan 纵向合并，
  // 避免 15 个编码堆在同一单元格把行高撑爆（列表密密麻麻的根因）
  const flatRows = React.useMemo(() => flattenInventoryBySku(pagedDataSource), [pagedDataSource]);
  const { message: appMessage } = App.useApp();
  // D-360l：误标「直发客户」的入库记录退回上一步（恢复待入库）
  const handleRevertDirectship = async (row: { id: string }) => {
    try {
      const res = await api.post('/production/warehousing/revert-directship', { ids: [row.id] });
      if (res?.code === 200) {
        appMessage.success('已退回上一步，该记录恢复为待入库');
        if (inboundHistoryModal.data) handleViewInboundHistory(inboundHistoryModal.data);
      } else {
        appMessage.error(res?.message || '退回失败');
      }
    } catch (e) {
      appMessage.error(e instanceof Error ? e.message : '退回失败');
    }
  };

  const totalAvailableQty = dataSource.reduce((sum, item) => sum + (item.availableQty || 0), 0);
  const totalDefectQty = dataSource.reduce((sum, item) => sum + (item.defectQty || 0), 0);
  const skuTotalOutbound = skuDetails.reduce((sum, item) => sum + (item.outboundQty || 0), 0);
  const skuTotalAmount = skuDetails.reduce((sum, item) => sum + (item.outboundQty || 0) * (item.salesPrice || 0), 0);
  const inboundTotalQty = inboundHistory.reduce((sum, item) => sum + (item.quantity || 0), 0);

  return (
    <>
      {showSmartErrorNotice && smartError && <Card style={{ marginBottom: 12 }}><SmartErrorNotice error={smartError} onFix={() => { void loadData(); }} /></Card>}
      <Card style={{ marginBottom: 0, border: 'none', boxShadow: 'none', background: 'transparent' }}>
        <StandardToolbar left={<StandardSearchBar searchValue={searchText} onSearchChange={setSearchText} searchPlaceholder="搜索订单号/款号/商品编码" statusValue={statusValue} onStatusChange={setStatusValue} statusOptions={[{ label: '全部', value: '' }, { label: '有库存', value: 'available' }, { label: '有次品', value: 'defect' }]} />} right={<Space wrap><Select style={{ width: 140 }} placeholder="工厂类型" allowClear value={selectedFactoryType || undefined} onChange={setSelectedFactoryType} options={factoryTypeOptions} /><Button icon={<InboxOutlined />} onClick={() => setFreeInboundOpen(true)}>无采购单入库</Button><Button icon={<ScanOutlined />} onClick={() => setScanOperationOpen(true)}>扫码出入库</Button><Button icon={<ScanOutlined />} onClick={() => setQrcodeOutboundOpen(true)}>扫码出库</Button><Button icon={<HistoryOutlined />} onClick={() => setPageLogOpen(true)}>操作日志</Button></Space>} />
      </Card>
      <PageStatCards cards={[{ key: 'total', items: [{ label: '成品总数', value: totalRecords, unit: '款', color: 'var(--color-primary)' }] }, { key: 'available', items: [{ label: '可用库存', value: totalAvailableQty, unit: '件', color: 'var(--color-success)' }] }, { key: 'defect', items: [{ label: '次品数量', value: totalDefectQty, unit: '件', color: 'var(--color-danger)' }] }]} activeKey="" />
      <PersistentTabs paramName="invTab" defaultKey="inventory" style={{ marginTop: 12 }} items={[
        {
          key: 'inventory',
          label: '库存管理',
          children: (<>
          <Card>
            {/* D-241：关闭组件自带的按行递增序号，改用主表按款编号的序号列 */}
            <ResizableTable storageKey="warehouse-finished-inventory" size="small" columns={columns} dataSource={flatRows} rowKey={(r: FinishedInventoryRow) => r.__rowKey} loading={loading} pagination={false} scroll={{ x: 'max-content' }} showIndex={false}
              emptyDescription="暂无成品库存数据"
              emptyActionText="去扫码入库"
              onEmptyAction={() => { window.location.href = '/warehouse/scan-in'; }}
            />
            <StandardPagination current={pagination.pagination.current} pageSize={pagination.pagination.pageSize} total={totalRecords} onChange={(page, _pageSize) => pagination.gotoPage(page)} />
          </Card>
          <Drawer
            title={`出库${cartStyleNos.length > 1 ? ` - ${cartStyleNos.length} 个款（混出一张单）` : ` - ${outboundModal.data?.styleNo || ''}`}`}
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
                      <div className="u-fs-14" style={{ color: 'var(--color-text-tertiary)' }}>订单号</div>
                      <div className="u-fw-600">{outboundModal.data.orderNo || '-'}</div>
                    </Col>
                    <Col span={8}>
                      <div className="u-fs-14" style={{ color: 'var(--color-text-tertiary)' }}>款号</div>
                      <div className="u-fw-600">{outboundModal.data.styleNo || '-'}</div>
                    </Col>
                    <Col span={8}>
                      <div className="u-fs-14" style={{ color: 'var(--color-text-tertiary)' }}>款名</div>
                      <div className="u-fw-600">{outboundModal.data.styleName || '-'}</div>
                    </Col>
                  </Row>
                </Card>
                <Card style={{ marginBottom: 12 }}>
                  <Row gutter={16}>
                    <Col span={12}>
                      <div className="u-mb-8 u-fs-14" style={{ color: 'var(--color-text-tertiary)' }}>出库类型</div>
                      <Select
                        style={{ width: '100%' }}
                        value={outboundType}
                        disabled={directShipMode}
                        onChange={(v) => setOutboundType(v)}
                        options={[
                          { label: '销售出库', value: 'sales' },
                          { label: '调拨出库', value: 'transfer' },
                          { label: '报废出库', value: 'scrap' }
                        ]}
                      />
                    </Col>
                    <Col span={12}>
                      <div className="u-mb-8 u-fs-14" style={{ color: 'var(--color-text-tertiary)' }}>
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
                <div className="u-mb-8 u-d-flex u-ai-center u-gap-12 u-fwrap-wrap">
                  <span className="u-fw-600">商品编码明细</span>
                  {!directShipMode && (
                    <Select
                      style={{ width: 320 }}
                      placeholder="＋ 搜索款号/款名添加混出（可连续添加）"
                      showSearch
                      filterOption={false}
                      searchValue={styleSearchText || undefined}
                      onSearch={handleStyleSearch}
                      loading={styleSearching}
                      value={null}
                      options={styleSearchOptions.map(o => ({ label: o.label, value: o.value }))}
                      onChange={handleStyleSelect}
                      notFoundContent={styleSearching ? '搜索中…' : (styleSearchText ? '无匹配款号' : '输入款号/款名搜索全库')}
                    />
                  )}
                  {/* D-437/D-442：一键按可用库存填满出库数量 + 统一单价批量应用（统一 middle 尺寸消除高低差） */}
                  <Button onClick={handleFillAllAvailable}>一键全部库存</Button>
                  <Space.Compact>
                    <InputNumber style={{ width: 130 }} min={0} precision={2} value={unifiedPrice} onChange={(v) => setUnifiedPrice(v)} placeholder="统一单价" />
                    <Button onClick={() => handleApplyUnifiedPrice(unifiedPrice)}>单价应用到全部</Button>
                  </Space.Compact>
                  {cartStyleNos.length > 1 && (
                    <span className="u-fs-12" style={{ color: 'var(--color-text-tertiary)' }}>
                      已混 {cartStyleNos.length} 个款，确认后合并为一张出库单
                    </span>
                  )}
                </div>
                {cartStyleNos.map((sn) => {
                  const offset = skuDetails.findIndex(item => (item.styleNo || outboundModal.data?.styleNo || '') === sn);
                  const groupRows = skuDetails.filter(item => (item.styleNo || outboundModal.data?.styleNo || '') === sn);
                  if (offset < 0 || groupRows.length === 0) return null;
                  const groupColumns = getSkuColumns({
                    handleSKUQtyChange: (i, v) => handleSKUQtyChange(offset + i, v),
                    handleSKUSalesPriceChange: (i, v) => handleSKUSalesPriceChange(offset + i, v),
                    handleSKUPriceReasonChange: (i, v) => handleSKUPriceReasonChange(offset + i, v),
                  });
                  return (
                    <div key={sn} className="u-mb-12">
                      <div className="u-d-flex u-ai-center u-gap-8 u-mb-6">
                        <Tag color="blue" style={{ margin: 0 }}>{sn}</Tag>
                        <span className="u-fs-13" style={{ color: 'var(--color-text-secondary)' }}>
                          {cartStyleNames.get(sn) || outboundModal.data?.styleName || ''}
                        </span>
                        {!directShipMode && (
                          <Button type="link" size="small" style={{ padding: 0, marginLeft: 'auto' }}
                            onClick={() => handleRemoveStyleFromCart(sn)}>
                            移除该款
                          </Button>
                        )}
                      </div>
                      <ResizableTable columns={groupColumns} dataSource={groupRows} rowKey="sku" pagination={false} emptyDescription="暂无商品编码数据" />
                    </div>
                  );
                })}
                <div className="u-mt-8 u-d-flex u-jc-between u-fw-600">
                  <span>出库总量: {skuTotalOutbound} 件</span>
                  <span>出库金额: {formatMoney(skuTotalAmount)}</span>
                </div>
                {outboundType === 'sales' && <CustomerInfoSection customerName={outboundCustomerName} onCustomerNameChange={setOutboundCustomerName} customerPhone={outboundCustomerPhone} onCustomerPhoneChange={setOutboundCustomerPhone} shippingAddress={outboundShippingAddress} onShippingAddressChange={setOutboundShippingAddress} variant="card" />}
                <Card title="发货信息（选填）" style={{ marginTop: 12 }}>
                  <Row gutter={16}>
                    <Col span={8}>
                      <div className="u-mb-8 u-fs-14" style={{ color: 'var(--color-text-tertiary)' }}>关联生产单号</div>
                      <Input value={outboundProductionOrderNo} onChange={e => setOutboundProductionOrderNo(e.target.value)} placeholder="选填" />
                    </Col>
                    <Col span={8}>
                      <div className="u-mb-8 u-fs-14" style={{ color: 'var(--color-text-tertiary)' }}>快递单号</div>
                      <Input value={outboundTrackingNo} onChange={e => setOutboundTrackingNo(e.target.value)} placeholder="选填" />
                    </Col>
                    <Col span={8}>
                      <div className="u-mb-8 u-fs-14" style={{ color: 'var(--color-text-tertiary)' }}>快递公司</div>
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
                <Card style={{ marginBottom: 12 }}>
                  <div className="u-d-flex u-gap-16 u-ai-center u-fwrap-wrap">
                    <StyleCoverThumb
                      src={(inboundHistoryModal.data as any).styleCover || null}
                      styleNo={inboundHistoryModal.data.styleNo}
                      size={72}
                      borderRadius={6}
                    />
                    <Row gutter={16} style={{ flex: 1, minWidth: 320 }}>
                      <Col span={8}><div className="u-fs-14" style={{ color: 'var(--color-text-tertiary)' }}>款号</div><div className="u-fw-600">{inboundHistoryModal.data.styleNo || '-'}</div></Col>
                      <Col span={8}><div className="u-fs-14" style={{ color: 'var(--color-text-tertiary)' }}>订单号</div><div className="u-fw-600">{inboundHistoryModal.data.orderNo || '-'}</div></Col>
                      <Col span={8}><div className="u-fs-14" style={{ color: 'var(--color-text-tertiary)' }}>生产方</div><div className="u-fw-600">{inboundHistoryModal.data.factoryName || '-'}</div></Col>
                      <Col span={8}><div className="u-fs-14" style={{ color: 'var(--color-text-tertiary)' }}>总入库量</div><div className="u-fw-600">{inboundHistoryModal.data.totalInboundQty ?? 0} 件</div></Col>
                      <Col span={8}><div className="u-fs-14" style={{ color: 'var(--color-text-tertiary)' }}>当前库存</div><div className="u-fw-600">{inboundHistoryModal.data.availableQty ?? 0} 件</div></Col>
                    </Row>
                  </div>
                </Card>
                <ResizableTable size="small" columns={[
                  { title: '入库日期', dataIndex: 'inboundDate', key: 'inboundDate', width: 150 },
                  { title: '入库单号', dataIndex: 'qualityInspectionNo', key: 'qualityInspectionNo', width: 150, render: (v: string) => <span style={{ fontFamily: 'var(--font-family-mono, monospace)' }}>{v || '-'}</span> },
                  { title: '订单号', dataIndex: 'orderNo', key: 'orderNo', width: 130, render: (v: string) => v || '-' },
                  { title: '生产方', dataIndex: 'factoryName', key: 'factoryName', width: 110, render: (v: string) => v || '-' },
                  { title: '菲号', dataIndex: 'cuttingBundleNo', key: 'cuttingBundleNo', width: 80 },
                  { title: '商品编码', dataIndex: 'skuCode', key: 'skuCode', width: 180, render: (v: string) => <span title={v} style={{ fontFamily: 'var(--font-family-mono, monospace)' }}>{v}</span> },
                  { title: '颜色', dataIndex: 'color', key: 'color', width: 70 },
                  { title: '尺码', dataIndex: 'size', key: 'size', width: 60 },
                  {
                    title: '数量(合格/不合格)',
                    key: 'qty',
                    width: 130,
                    align: 'right' as const,
                    render: (_: unknown, r: any) => (
                      <span>
                        <span style={{ color: 'var(--color-success)' }} className="u-fw-600">{r.qualifiedQuantity ?? '-'}</span>
                        <span style={{ color: 'var(--color-text-tertiary)' }}> / </span>
                        <span style={{ color: r.unqualifiedQuantity > 0 ? 'var(--color-danger)' : 'var(--color-text-tertiary)' }}>{r.unqualifiedQuantity ?? 0}</span>
                      </span>
                    ),
                  },
                  {
                    title: '单价',
                    dataIndex: 'unitPrice',
                    key: 'unitPrice',
                    width: 90,
                    align: 'right' as const,
                    render: (v: number | null) => v != null ? `¥${v.toFixed(2)}` : '-',
                  },
                  {
                    title: '库位/库区',
                    key: 'loc',
                    width: 140,
                    render: (_: unknown, r: any) => (
                      <span>
                        {r.warehouseLocation || '-'}
                        {r.warehouseAreaName && r.warehouseAreaName !== '-' ? <span style={{ color: 'var(--color-text-tertiary)' }}> · {r.warehouseAreaName}</span> : null}
                      </span>
                    ),
                  },
                  { title: '质检', dataIndex: 'qualityStatus', key: 'qualityStatus', width: 90, render: (v: string) => v && v !== '-' ? <Tag color={v === 'qualified' ? 'green' : v === 'unqualified' ? 'red' : 'default'} style={{ margin: 0 }}>{v === 'qualified' ? '合格' : v === 'unqualified' ? '不合格' : v}</Tag> : '-' },
                  { title: '次品类别', dataIndex: 'defectCategory', key: 'defectCategory', width: 100, render: (v: string) => v && v !== '-' ? v : '-' },
                  { title: '次品备注', dataIndex: 'defectRemark', key: 'defectRemark', width: 160, render: (v: string) => v && v !== '-' ? <span style={{ color: 'var(--color-amber-700)' }}>{v}</span> : '-' },
                  { title: '入库人', dataIndex: 'operator', key: 'operator', width: 90 },
                  { title: '收货人', dataIndex: 'receiverName', key: 'receiverName', width: 90, render: (v: string) => v && v !== '-' ? v : '-' },
                  { title: '更新时间', dataIndex: 'updateTime', key: 'updateTime', width: 150, render: (v: string) => v && v !== '-' ? <span className="u-fs-12" style={{ color: 'var(--color-text-tertiary)' }}>{v}</span> : '-' },
                  { title: '操作', key: 'action', width: 100, render: (_: unknown, r: { id: string; warehouseLocation?: string }) => (String(r.warehouseLocation || '') === '直发客户' ? <Button size="small" type="link" style={{ padding: 0 }} onClick={() => { void handleRevertDirectship(r); }}>退回上一步</Button> : null) },
                ]} dataSource={inboundHistory} rowKey="id" emptyDescription="暂无入库记录" pagination={{ current: inboundPage, pageSize: inboundPageSize, total: inboundHistory.length, onChange: (p, ps) => { setInboundPage(p); setInboundPageSize(ps); } }} />
                <div className="u-mt-12 u-p-8px12px u-br-6 u-fs-14" style={{ background: 'var(--color-bg-container)' }}>
                  <div className="u-fw-600 u-mb-4">对账公式</div>
                  <div>入库总量: <b>{inboundHistoryModal.data.totalInboundQty ?? 0}</b> 件 = 当前库存: <b style={{ color: 'var(--color-success)' }}>{inboundHistoryModal.data.availableQty ?? 0}</b> 件 + 出库总量: <b style={{ color: 'var(--color-orange-600)' }}>{outstockTotal}</b> 件 + 次品: <b>{inboundHistoryModal.data.defectQty ?? 0}</b> 件</div>
                  <div className="u-mt-4" style={{ color: 'var(--color-text-tertiary)' }}>入库记录合计: {inboundTotalQty} 件（{inboundHistory.length} 条记录）</div>
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
      <RecordLogDrawer
        open={pageLogOpen}
        onClose={() => setPageLogOpen(false)}
        title="商品仓储操作日志"
        filter={{ module: '仓库管理' }}
      />

      {/* ===== 编码点击 → SKU 详情侧滑（统一 SideDrawer，可编辑库位/库区/单价/备注） ===== */}
      <SkuDetailDrawer
        open={skuDetailModal.visible}
        onClose={skuDetailModal.close}
        record={skuDetailModal.data}
        onRefresh={loadData}
        rawDataSource={rawDataSource}
      />
    </>
  );
};

export default _FinishedInventory;