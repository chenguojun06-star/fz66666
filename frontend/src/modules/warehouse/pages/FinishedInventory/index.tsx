import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, Button, Space, Tag, Row, Col, InputNumber, Input, Select, App } from 'antd';
import { PlusOutlined, DownloadOutlined, ExportOutlined, HistoryOutlined, ScanOutlined } from '@ant-design/icons';
import QrcodeOutboundModal from './QrcodeOutboundModal';
import type { ColumnsType } from 'antd/es/table';
import Layout from '@/components/Layout';
import ResizableTable from '@/components/common/ResizableTable';
import StandardModal from '@/components/common/StandardModal';
import PageStatCards from '@/components/common/PageStatCards';
import StandardSearchBar from '@/components/common/StandardSearchBar';
import StandardToolbar from '@/components/common/StandardToolbar';
import RowActions from '@/components/common/RowActions';
import { useModal, useTablePagination } from '@/hooks';
import api from '@/utils/api';
import { StyleCoverThumb } from '@/components/StyleAssets';
import type { Dayjs } from 'dayjs';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import { isSmartFeatureEnabled } from '@/smart/core/featureFlags';
import type { SmartErrorInfo } from '@/smart/core/types';
import { useOrganizationFilterOptions } from '@/hooks/useOrganizationFilterOptions';


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
  orderId?: string;
  orderNo: string;
  factoryName?: string;
  factoryType?: 'INTERNAL' | 'EXTERNAL';
  orderBizType?: string;
  parentOrgUnitId?: string;
  parentOrgUnitName?: string;
  orgPath?: string;
  styleId?: string;
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
  lastOutboundDate?: string;
  lastOutstockNo?: string;
  lastOutboundBy?: string;
  totalInboundQty?: number;        // 累计入库总量
  costPrice?: number;              // 成本价
  salesPrice?: number;             // 销售价
  colors?: string[];               // 多颜色列表
  sizes?: string[];                // 多尺码列表
}

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
  // 出库发货信息（用于关联电商订单自动回写状态）
  const [outboundProductionOrderNo, setOutboundProductionOrderNo] = useState('');
  const [outboundTrackingNo, setOutboundTrackingNo] = useState('');
  const [outboundExpressCompany, setOutboundExpressCompany] = useState('');
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
          keyword: searchText || undefined,
          orderNo: searchText || undefined,
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
  }, [searchText, selectedFactoryType, showSmartErrorNotice, reportSmartError]);

  useEffect(() => {
    loadData();
  }, []);

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
    }]);
    setOutboundProductionOrderNo('');
    setOutboundTrackingNo('');
    setOutboundExpressCompany('');
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
      });
      message.success(`出库成功，共 ${outboundItems.length} 个SKU已出库`);
      outboundModal.close();
      setOutboundProductionOrderNo('');
      setOutboundTrackingNo('');
      setOutboundExpressCompany('');
      setSkuDetails([]);
      loadData();
    } catch (error: any) {
      message.error(error?.message || '出库失败，请重试');
    }
  };

  // 查看入库记录 - 从后端获取真实数据
  const handleViewInboundHistory = async (record: FinishedInventory) => {
    try {
      const params = new URLSearchParams();
      if (record.styleNo) params.append('styleNo', record.styleNo);
      if (record.orderNo) params.append('orderNo', record.orderNo);
      params.append('page', '1');
      params.append('size', '100');
      const res = await api.get(`/production/warehousing/list?${params.toString()}`);
      if (res.code === 200 && res.data?.records?.length > 0) {
        const fallbackOperator = record.lastInboundBy || '-';
        const fallbackWarehouse = record.warehouseLocation || '-';
        setInboundHistory(res.data.records.map((item: Record<string, unknown>, idx: number) => ({
          id: String(item.id || idx),
          inboundDate: item.warehousingEndTime || item.createTime || '-',
          qualityInspectionNo: item.warehousingNo || '-',
          quantity: (item.qualifiedQuantity as number) ?? (item.warehousingQuantity as number) ?? 0,
          operator: item.warehousingOperatorName || item.qualityOperatorName || item.receiverName || fallbackOperator,
          warehouseLocation: item.warehouse || item.warehouseLocation || fallbackWarehouse,
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
      width: 72,
      fixed: 'left',
      align: 'center',
      render: (_, record) => (
        <StyleCoverThumb
          src={record.styleImage || null}
          styleNo={record.styleNo}
          size={48}
          borderRadius={4}
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
          {record.factoryName || record.orgPath || record.parentOrgUnitName || record.factoryType ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ fontSize: 12, color: 'var(--neutral-text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                工厂：
                {record.factoryType === 'INTERNAL' && <Tag color="blue" style={{ margin: 0, fontSize: 10, padding: '0 4px', lineHeight: '16px', height: 16 }}>内</Tag>}
                {record.factoryType === 'EXTERNAL' && <Tag color="purple" style={{ margin: 0, fontSize: 10, padding: '0 4px', lineHeight: '16px', height: 16 }}>外</Tag>}
                {record.factoryName || '-'}
                {record.orderBizType && (() => {
                  const colorMap: Record<string, string> = { FOB: 'cyan', ODM: 'purple', OEM: 'blue', CMT: 'orange' };
                  return <Tag color={colorMap[record.orderBizType] ?? 'default'} style={{ margin: 0, fontSize: 10, padding: '0 4px', lineHeight: '16px', height: 16 }}>{record.orderBizType}</Tag>;
                })()}
              </div>
              {record.orgPath || record.parentOrgUnitName ? (
                <div style={{ fontSize: 12, color: 'var(--neutral-text-secondary)' }}>
                  组织：{record.orgPath || record.parentOrgUnitName}
                </div>
              ) : null}
            </div>
          ) : null}
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
            <div style={{ fontSize: "var(--font-size-lg)", fontWeight: 700, color: 'var(--color-success)' }}>
              {record.availableQty.toLocaleString()}
            </div>
            <div style={{ fontSize: "var(--font-size-xs)", color: 'var(--neutral-text-disabled)', marginTop: 2 }}>件</div>
          </div>
          <div>
            <div style={{ fontSize: "var(--font-size-sm)", color: 'var(--neutral-text-disabled)', marginBottom: 4, fontWeight: 500 }}>锁定</div>
            <div style={{ fontSize: "var(--font-size-lg)", fontWeight: 700, color: 'var(--color-warning)' }}>
              {record.lockedQty.toLocaleString()}
            </div>
            <div style={{ fontSize: "var(--font-size-xs)", color: 'var(--neutral-text-disabled)', marginTop: 2 }}>件</div>
          </div>
          <div>
            <div style={{ fontSize: "var(--font-size-sm)", color: 'var(--neutral-text-disabled)', marginBottom: 4, fontWeight: 500 }}>次品</div>
            <div style={{ fontSize: "var(--font-size-lg)", fontWeight: 700, color: record.defectQty > 0 ? 'var(--color-danger)' : 'var(--color-success)' }}>
              {record.defectQty.toLocaleString()}
            </div>
            <div style={{ fontSize: "var(--font-size-xs)", color: 'var(--neutral-text-disabled)', marginTop: 2 }}>件</div>
          </div>
        </div>
      ),
    },
    {
      title: '单价',
      width: 130,
      render: (_, record) => (
        <div style={{ lineHeight: '22px' }}>
          {record.salesPrice != null ? (
            <div>
              <span style={{ fontSize: 11, color: 'var(--neutral-text-disabled)' }}>售价 </span>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-danger)' }}>¥{Number(record.salesPrice).toFixed(2)}</span>
            </div>
          ) : null}
          {record.costPrice != null ? (
            <div>
              <span style={{ fontSize: 11, color: 'var(--neutral-text-disabled)' }}>成本 </span>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--neutral-text-secondary)' }}>¥{Number(record.costPrice).toFixed(2)}</span>
            </div>
          ) : null}
          {record.salesPrice != null && record.costPrice != null ? (
            <div style={{ marginTop: 2 }}>
              <span style={{ fontSize: 10, color: 'var(--neutral-text-disabled)' }}>毛利 </span>
              <span style={{ fontSize: 11, color: Number(record.salesPrice) > Number(record.costPrice) ? 'var(--color-success)' : 'var(--color-danger)' }}>
                ¥{(Number(record.salesPrice) - Number(record.costPrice)).toFixed(2)}
              </span>
            </div>
          ) : null}
          {record.salesPrice == null && record.costPrice == null ? (
            <span style={{ fontSize: 12, color: 'var(--neutral-text-disabled)' }}>-</span>
          ) : null}
        </div>
      ),
    },
    {
      title: '出入库记录',
      width: 260,
      render: (_, record) => (
        <Space orientation="vertical" size={4} style={{ width: '100%' }}>
          <div style={{ fontSize: "var(--font-size-sm)", color: 'var(--neutral-text-secondary)', fontWeight: 500 }}>
            <span style={{ color: 'var(--neutral-text-disabled)' }}>入库时间:</span>{' '}
            <span style={{ fontWeight: 600 }}>{record.lastInboundDate ? String(record.lastInboundDate).slice(0, 16).replace('T', ' ') : '-'}</span>
          </div>
          <div style={{ fontSize: "var(--font-size-sm)", color: 'var(--neutral-text-secondary)', fontWeight: 500 }}>
            <span style={{ color: 'var(--neutral-text-disabled)' }}>入库号:</span>{' '}
            <span style={{ color: 'var(--primary-color)', fontWeight: 600 }}>{record.qualityInspectionNo || '-'}</span>
          </div>
          <div style={{ fontSize: "var(--font-size-sm)", color: 'var(--neutral-text-secondary)', fontWeight: 500 }}>
            <span style={{ color: 'var(--neutral-text-disabled)' }}>操作人:</span>{' '}
            <span style={{ fontWeight: 600 }}>{record.lastInboundBy || '-'}</span>
          </div>
          <div style={{ fontSize: "var(--font-size-sm)", color: 'var(--neutral-text-secondary)', fontWeight: 500 }}>
            <span style={{ color: 'var(--neutral-text-disabled)' }}>入库数量:</span>{' '}
            <span style={{ color: 'var(--color-success)', fontWeight: 700 }}>{record.totalInboundQty ?? record.availableQty ?? '-'}</span>
            {(record.totalInboundQty != null || record.availableQty != null) && <span style={{ color: 'var(--neutral-text-disabled)', marginLeft: 2 }}>件</span>}
          </div>
          <div style={{ fontSize: "var(--font-size-sm)", color: 'var(--neutral-text-secondary)', fontWeight: 500, paddingTop: 4, borderTop: '1px dashed #f0f0f0' }}>
            <span style={{ color: 'var(--neutral-text-disabled)' }}>最后出库:</span>{' '}
            <span style={{ fontWeight: 600 }}>{record.lastOutboundDate ? String(record.lastOutboundDate).slice(0, 16).replace('T', ' ') : '-'}</span>
          </div>
          <div style={{ fontSize: "var(--font-size-sm)", color: 'var(--neutral-text-secondary)', fontWeight: 500 }}>
            <span style={{ color: 'var(--neutral-text-disabled)' }}>出库单号:</span>{' '}
            <span style={{ color: 'var(--warning-color-dark)', fontWeight: 600 }}>{record.lastOutstockNo || '-'}</span>
          </div>
          <div style={{ fontSize: "var(--font-size-sm)", color: 'var(--neutral-text-secondary)', fontWeight: 500 }}>
            <span style={{ color: 'var(--neutral-text-disabled)' }}>出库人:</span>{' '}
            <span style={{ fontWeight: 600 }}>{record.lastOutboundBy || '-'}</span>
          </div>
          <div style={{ fontSize: "var(--font-size-sm)", color: 'var(--neutral-text-secondary)', fontWeight: 500 }}>
            <span style={{ color: 'var(--neutral-text-disabled)' }}>库位:</span>{' '}
            <span style={{ fontWeight: 600 }}>{record.warehouseLocation || '-'}</span>
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
              primary: true,
              onClick: () => handleOutbound(record)
            },
            {
              key: 'history',
              label: '入库记录',
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
        <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>{qty}</span>
      ),
    },
    {
      title: '锁定库存',
      dataIndex: 'lockedQty',
      key: 'lockedQty',
      width: 100,
      align: 'center',
      render: (qty: number) => (
        <span style={{ color: 'var(--color-warning)', fontWeight: 600 }}>{qty}</span>
      ),
    },
    {
      title: '次品库存',
      dataIndex: 'defectQty',
      key: 'defectQty',
      width: 100,
      align: 'center',
      render: (qty: number) => (
        <span style={{ color: 'var(--color-danger)', fontWeight: 600 }}>{qty}</span>
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
              activeBg: 'rgba(45, 127, 249, 0.1)',
            },
            {
              key: 'available',
              items: [
                { label: '可用库存', value: rawDataSource.reduce((s, r) => s + (r.availableQty ?? 0), 0), unit: '件', color: 'var(--color-success)' },
              ],
              onClick: () => setStatusValue('available'),
              activeColor: 'var(--color-success)',
              activeBg: '#f6ffed',
            },
            {
              key: 'defect',
              items: [
                { label: '次品数量', value: rawDataSource.reduce((s, r) => s + (r.defectQty ?? 0), 0), unit: '件', color: 'var(--color-danger)' },
              ],
              onClick: () => setStatusValue('defect'),
              activeColor: 'var(--color-danger)',
              activeBg: '#fff1f0',
            }
          ]}
        />

        <Card>
          <div style={{ marginBottom: 16 }}>
            <h2 style={{ margin: 0 }}>📦 成品进销存</h2>
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
            setOutboundProductionOrderNo('');
            setOutboundTrackingNo('');
            setOutboundExpressCompany('');
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
                  📋 请选择需要出库的颜色和尺码，并输入数量：
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
                    <strong style={{ color: 'var(--color-success)', fontSize: "var(--font-size-lg)" }}>
                      {inboundHistoryModal.data.availableQty} 件
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
                    render: (text) => <strong style={{ color: 'var(--color-success)' }}>{text} 件</strong>,
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
                    <strong style={{ marginLeft: 8, fontSize: "var(--font-size-lg)", color: 'var(--color-success)' }}>
                      {Math.max(
                        inboundHistory.reduce((sum, item) => sum + item.quantity, 0),
                        Number(inboundHistoryModal.data?.availableQty || 0)
                      )} 件
                    </strong>
                  </div>
                </Space>
              </Card>
            </Space>
          )}
        </StandardModal>

        {/* 扫码批量出库弹窗 */}
        <QrcodeOutboundModal
          open={qrcodeOutboundOpen}
          onClose={() => setQrcodeOutboundOpen(false)}
          onSuccess={loadData}
        />
    </Layout>
  );
};

export default _FinishedInventory;
