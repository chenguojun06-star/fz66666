import React, { useCallback, useEffect, useState } from 'react';
import { Button, Card, Input, Select, Form, Row, Col, InputNumber, Modal, Tag, message, Drawer, Segmented, Space, Popconfirm, Image } from 'antd';
import { PrinterOutlined, UnorderedListOutlined, AppstoreOutlined, PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined, FileTextOutlined, AppstoreAddOutlined, EyeOutlined, BookOutlined } from '@ant-design/icons';
import StandardSearchBar from '@/components/common/StandardSearchBar';
import RejectReasonModal from '@/components/common/RejectReasonModal';
import StandardToolbar from '@/components/common/StandardToolbar';
import ImageUploadBox from '@/components/common/ImageUploadBox';
import { useUser } from '@/utils/AuthContext';
import ResizableTable from '@/components/common/ResizableTable';
import { MaterialDatabase } from '@/types/production';
import api from '@/utils/api';
import { formatMoney } from '@/utils/format';
import { getMaterialTypeLabel } from '@/utils/materialType';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import { useViewport } from '@/utils/useViewport';
import { useTablePagination } from '@/hooks';
import SupplierSelect from '@/components/common/SupplierSelect';
import DictAutoComplete from '@/components/common/DictAutoComplete';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import { isSmartFeatureEnabled } from '@/smart/core/featureFlags';
import type { SmartErrorInfo } from '@/smart/core/types';
import { useMaterialDatabaseActions } from './useMaterialDatabaseActions';
import { getMaterialDatabaseColumns } from './materialDatabaseColumns';
import MaterialColorCardRecognizer from '@/components/common/MaterialColorCardRecognizer';
import UniversalCardView from '@/components/common/UniversalCardView';
import '@/components/common/UniversalCardView/style.css';

const { Option } = Select;

// ===== 物料色卡相关类型 =====
interface MaterialColorCardItem {
  id?: string;
  materialColorCardId?: string;
  materialId?: string;
  materialCode?: string;
  materialName?: string;
  materialType?: string;
  color?: string;
  fabricWidth?: string;
  fabricWeight?: string;
  fabricComposition?: string;
  specifications?: string;
  unit?: string;
  unitPrice?: number;
  image?: string;
  remark?: string;
}

interface MaterialColorCard {
  id: string;
  cardCode: string;
  cardName: string;
  supplierId?: string;
  supplierName?: string;
  supplierContactPerson?: string;
  supplierContactPhone?: string;
  materialType?: string;
  fabricWidth?: string;
  specifications?: string;
  fabricWeight?: string;
  fabricComposition?: string;
  unit?: string;
  coverImage?: string;
  remark?: string;
  status?: string;
  materialCount?: number;
  createTime?: string;
}

const MATERIAL_TYPE_OPTIONS = [
  { label: '面料', value: 'fabric' },
  { label: '里料', value: 'lining' },
  { label: '辅料', value: 'accessory' },
];

const MaterialDatabasePage: React.FC = () => {
  const { isMobile } = useViewport();
  const { user } = useUser();
  const [dataList, setDataList] = useState<MaterialDatabase[]>([]);
  const [loading, setLoading] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [smartError, setSmartError] = useState<SmartErrorInfo | null>(null);
  const showSmartErrorNotice = isSmartFeatureEnabled('smart.production.precheck.enabled' as any);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [statusValue, setStatusValue] = useState('');
  const [dateRange, setDateRange] = useState<[any, any] | null>(null);
  const { pagination, onChange } = useTablePagination(20);
  const currentPage = pagination.current;
  const currentPageSize = pagination.pageSize;

  // ===== 视图切换：列表 / 物料卡片 / 供应商色卡 =====
  const [viewMode, setViewMode] = useState<'list' | 'materialCard' | 'supplierCard'>('list');

  // ===== 卡片视图数据 =====
  const [cardDataList, setCardDataList] = useState<MaterialColorCard[]>([]);
  const [cardLoading, setCardLoading] = useState(false);
  const [cardPage, setCardPage] = useState(1);
  const [cardPageSize] = useState(12);
  const [cardTotal, setCardTotal] = useState(0);
  const [cardKeyword, setCardKeyword] = useState('');
  const [cardMaterialType, setCardMaterialType] = useState('');

  // 物料管理弹窗
  const [itemVisible, setItemVisible] = useState(false);
  const [currentItems, setCurrentItems] = useState<MaterialColorCardItem[]>([]);
  const [currentCardId, setCurrentCardId] = useState<string>('');
  const [currentCardName, setCurrentCardName] = useState<string>('');
  const [currentCard, setCurrentCard] = useState<MaterialColorCard | null>(null);

  // 母卡新建/编辑弹窗
  const [cardDialogVisible, setCardDialogVisible] = useState(false);
  const [cardForm] = Form.useForm();
  const [coverImageFiles, setCoverImageFiles] = useState<any[]>([]);

  const fetchCardList = useCallback(async () => {
    setCardLoading(true);
    try {
      const params: any = { keyword: cardKeyword, page: cardPage, pageSize: cardPageSize };
      if (cardMaterialType) params.materialType = cardMaterialType;
      const res = await api.get<{ code: number; data: any; message?: string }>(
        '/material-color-card/list', { params },
      );
      if (res.code === 200) {
        setCardDataList(res.data?.records || []);
        setCardTotal(res.data?.total || 0);
      }
    } catch (err: any) {
      // 表格不存在时静默（迁移未跑）
    } finally {
      setCardLoading(false);
    }
  }, [cardKeyword, cardMaterialType, cardPage, cardPageSize]);

  // 切换到供应商色卡时加载数据
  useEffect(() => {
    if (viewMode === 'supplierCard') fetchCardList();
  }, [viewMode, fetchCardList]);

  const openCardItemsDialog = async (card: MaterialColorCard) => {
    setCurrentCardId(card.id);
    setCurrentCardName(card.cardName);
    setCurrentCard(card);
    try {
      const res = await api.get<{ code: number; data: any }>(`/material-color-card/${card.id}`);
      if (res.code === 200) setCurrentItems(res.data?.items || []);
      else setCurrentItems([]);
    } catch { setCurrentItems([]); }
    setItemVisible(true);
  };

  const addEmptyCardItem = () => {
    setCurrentItems([...currentItems, {
      materialCode: '', materialName: '', materialType: currentCard?.materialType || 'fabric',
      unitPrice: undefined, image: '', remark: '',
    }]);
  };

  const updateCardItem = (idx: number, field: keyof MaterialColorCardItem, value: any) => {
    const next = [...currentItems];
    (next[idx] as any)[field] = value;
    setCurrentItems(next);
  };

  const removeCardItem = (idx: number) => {
    const next = [...currentItems];
    next.splice(idx, 1);
    setCurrentItems(next);
  };

  const saveCardItems = async () => {
    if (!currentCardId) return;
    const validItems = currentItems.filter((it) => it.materialName);
    if (validItems.length === 0) { message.warning('至少填写一条物料'); return; }
    try {
      await api.post(`/material-color-card/${currentCardId}/items/batch`, { items: validItems });
      message.success(`已保存 ${validItems.length} 条物料`);
      setItemVisible(false);
      fetchCardList();
    } catch (err: any) { message.error(err?.message || '保存失败'); }
  };

  const handleGenerateCardMaterials = async (card: MaterialColorCard) => {
    try {
      const res = await api.post<{ code: number; data: string[]; message?: string }>(
        `/material-color-card/${card.id}/generate-materials`,
      );
      if (res.code === 200) message.success(`成功生成 ${res.data.length} 条物料到物料资料`);
    } catch (err: any) { message.error(err?.message || '生成失败'); }
  };

  const openCardEditDialog = (card: MaterialColorCard) => {
    setCurrentCard(card);
    setCoverImageFiles(card.coverImage ? [{ url: card.coverImage }] : []);
    cardForm.setFieldsValue({
      cardCode: card.cardCode, cardName: card.cardName, materialType: card.materialType || 'fabric',
      fabricWidth: card.fabricWidth, specifications: card.specifications, fabricWeight: card.fabricWeight,
      fabricComposition: card.fabricComposition, unit: card.unit,
      supplierId: card.supplierId, supplierName: card.supplierName,
      supplierContactPerson: card.supplierContactPerson, supplierContactPhone: card.supplierContactPhone,
      remark: card.remark,
    });
    setCardDialogVisible(true);
  };

  const openCardCreateDialog = async () => {
    setCurrentCard(null);
    cardForm.resetFields();
    setCoverImageFiles([]);
    try {
      const res = await api.get<{ code: number; data: string }>('/material-color-card/generate-code');
      if (res.code === 200 && res.data) cardForm.setFieldsValue({ cardCode: res.data, materialType: 'fabric' });
    } catch {}
    setCardDialogVisible(true);
  };

  const handleCardSave = async () => {
    try {
      const values = await cardForm.validateFields();
      if (coverImageFiles.length > 0) values.coverImage = (coverImageFiles[0] as any)?.url || '';
      if (currentCard?.id) {
        await api.put('/material-color-card', { id: currentCard.id, ...values });
        message.success('更新成功');
      } else {
        await api.post('/material-color-card', values);
        message.success('创建成功');
      }
      setCardDialogVisible(false);
      fetchCardList();
    } catch (err: any) { if (!err?.errorFields) message.error(err?.message || '保存失败'); }
  };

  const handleCardDelete = async (id: string) => {
    try { await api.delete(`/material-color-card/${id}`); message.success('删除成功'); fetchCardList(); }
    catch (err: any) { message.error(err?.message || '删除失败'); }
  };

  const uploadCardImage = useCallback(async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await api.post<{ code: number; data: string }>(
      '/common/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } },
    );
    if (res.code !== 200 || !res.data) throw new Error('上传失败');
    return res.data;
  }, []);

  // 渲染卡片视图
  const renderCardView = () => (
    <>
      {/* 卡片视图搜索栏 */}
      <Card style={{ marginBottom: 12, background: 'var(--color-bg-container)' }}>
        <Space.Compact style={{ width: '100%', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <Input placeholder="搜索编号/名称/供应商" value={cardKeyword}
            onChange={(e) => setCardKeyword(e.target.value)} style={{ maxWidth: 240 }} allowClear />
          <Select placeholder="物料类型" value={cardMaterialType || undefined} onChange={(v) => { setCardMaterialType(v || ''); setCardPage(1); }}
            style={{ width: 130 }} allowClear>
            {MATERIAL_TYPE_OPTIONS.map((o) => (
              <Select.Option key={o.value} value={o.value}>{o.label}</Select.Option>
            ))}
          </Select>
          <Button icon={<ReloadOutlined />} onClick={fetchCardList}>刷新</Button>
          <div style={{ flex: 1 }} />
          <Button type="primary" icon={<PlusOutlined />} onClick={openCardCreateDialog}>新建物料色卡</Button>
        </Space.Compact>
      </Card>

      {/* 通用卡片网格 */}
      <UniversalCardView
        dataSource={cardDataList}
        loading={cardLoading}
        titleField="cardName"
        subtitleField="cardCode"
        coverField="coverImage"
        coverPlaceholder="暂无封面"
        columns={4}
        fields={[
          { label: '供应商', key: 'supplierName', format: (v) => v || '-' },
          { label: '联系人', key: 'supplierContactPerson', format: (v, r) => v ? `${v}${r?.supplierContactPhone ? ' · ' + r.supplierContactPhone : ''}` : '-' },
          { label: '幅宽', key: 'fabricWidth', format: (v) => v || '-' },
          { label: '克重', key: 'fabricWeight', format: (v) => v || '-' },
          { label: '规格', key: 'specifications', format: (v) => v || '-' },
          { label: '成分', key: 'fabricComposition', format: (v) => v || '-' },
        ]}
        titleTags={(record) => (
          <>
            <Tag color="blue">{getMaterialTypeLabel(record.materialType)}</Tag>
            <Tag color={record.materialCount && record.materialCount > 0 ? 'green' : 'default'}>
              {record.materialCount || 0} 条物料
            </Tag>
          </>
        )}
        actions={(record) => [
          { key: 'manage', label: '物料管理', icon: <AppstoreAddOutlined />, onClick: () => openCardItemsDialog(record) },
          { key: 'generate', label: '生成物料', icon: <EyeOutlined />, onClick: () => handleGenerateCardMaterials(record) },
          { key: 'edit', label: '编辑', icon: <EditOutlined />, onClick: () => openCardEditDialog(record) },
          { key: 'delete', label: '删除', icon: <DeleteOutlined />, danger: true, onClick: () => handleCardDelete(record.id) },
        ]}
        maxInlineActions={2}
        pagination={{
          current: cardPage,
          pageSize: cardPageSize,
          total: cardTotal,
          onChange: (p) => setCardPage(p),
          showTotal: (t) => `共 ${t} 条`,
        }}
        hoverRender={(record) => (
          <div style={{ maxWidth: 400 }}>
            {record.remark && <div style={{ marginBottom: 8, color: '#874d00' }}>备注：{record.remark}</div>}
            {record.supplierContactPerson && <div>联系人：{record.supplierContactPerson}</div>}
            {record.supplierContactPhone && <div>电话：{record.supplierContactPhone}</div>}
            <div>创建时间：{record.createTime?.slice(0, 19).replace('T', ' ')}</div>
          </div>
        )}
      />

      {/* 空状态 */}
      {cardDataList.length === 0 && !cardLoading && (
        <Card style={{ textAlign: 'center', padding: '60px 0', color: '#8c8c8c', marginTop: 12 }}>
          <FileTextOutlined style={{ fontSize: 48, marginBottom: 12 }} />
          <div>暂无物料色卡，点击右上角"新建物料色卡"开始创建</div>
        </Card>
      )}
    </>
  );

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = {
        page: currentPage,
        pageSize: currentPageSize,
        keyword: searchKeyword,
        status: statusValue,
        startDate: dateRange?.[0],
        endDate: dateRange?.[1],
      };
      const res = await api.get<any>('/material/database/list', { params });
      const result = res as any;
      if (result.code === 200) {
        const data = result.data || {};
        setDataList(Array.isArray(data) ? data : data.records || []);
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }, [currentPage, currentPageSize, searchKeyword, statusValue, dateRange]);

  useEffect(() => { fetchList(); }, [fetchList]);

  const {
    form, visible, currentMaterial, imageFiles, setImageFiles,
    returnTarget, setReturnTarget, returnLoading, submitLoading,
    fetchMaterialCode, uploadImage, openDialog, closeDialog, handleSubmit,
    handleDelete, handleComplete, handleReturn, handleReturnConfirm,
    handleDisable, handleEnable, toLocalDateTimeInputValue,
  } = useMaterialDatabaseActions({ dataList, fetchList });

  const [colorItemsVisible, setColorItemsVisible] = useState(false);
  const [colorItemsData, setColorItemsData] = useState<any>(null);
  const [colorItemsLoading, setColorItemsLoading] = useState(false);

  const viewColorItems = useCallback(async (record: MaterialDatabase) => {
    if (!record?.id) return;
    setColorItemsLoading(true);
    try {
      const res = await api.get<any>(`/color-card/by-material/${record.id}`);
      const result = res as any;
      if (result.code === 200) {
        setColorItemsData(result.data);
        setColorItemsVisible(true);
      } else {
        message.error(result.message || '加载失败');
      }
    } catch (e: any) {
      message.error(e?.message || '加载失败');
    } finally {
      setColorItemsLoading(false);
    }
  }, []);

  const columns = getMaterialDatabaseColumns({
    openDialog, handleComplete, handleDelete, handleReturn, handleDisable, handleEnable, viewColorItems, user,
  });

  // ===== 打印功能 =====
  const buildMaterialPrintHtml = useCallback(() => {
    const esc = (v: any) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // 计算各类型数量
    const statsByType: Record<string, { count: number; totalQty: number }> = {};
    const rows = dataList.map((item: any, idx: number) => {
      const type = item.materialType || 'other';
      if (!statsByType[type]) statsByType[type] = { count: 0, totalQty: 0 };
      statsByType[type].count += 1;
      const qty = Number(item.quantity) || 0;
      statsByType[type].totalQty += qty;
      const unitPrice = Number(item.unitPrice) || 0;
      return `<tr>
        <td style="text-align:center">${idx + 1}</td>
        <td>${esc(item.materialCode)}</td>
        <td>${esc(item.materialName)}</td>
        <td>${esc(item.styleNo)}</td>
        <td style="text-align:center">${esc(getMaterialTypeLabel(item.materialType))}</td>
        <td>${esc(item.color)}</td>
        <td>${esc(item.specifications)}</td>
        <td style="text-align:center">${esc(item.unit)}</td>
        <td style="text-align:right">${qty.toFixed(2)}</td>
        <td style="text-align:right">${formatMoney(unitPrice)}</td>
        <td style="text-align:right;font-weight:600">${formatMoney(qty * unitPrice)}</td>
        <td>${esc(item.supplierName)}</td>
      </tr>`;
    }).join('');

    const totalCount = dataList.length;
    let totalQty = 0;
    let totalValue = 0;
    dataList.forEach((item: any) => {
      const qty = Number(item.quantity) || 0;
      const unitPrice = Number(item.unitPrice) || 0;
      totalQty += qty;
      totalValue += qty * unitPrice;
    });

    // 类型汇总行
    const typeSummaryRows = Object.keys(statsByType).map(type => {
      const s = statsByType[type];
      return `<tr><td colspan="8" style="text-align:right;background:var(--color-bg-container);font-weight:600">${esc(getMaterialTypeLabel(type))} 小计：${s.count} 项 / ${s.totalQty.toFixed(2)} 单位</td><td style="text-align:right;background:var(--color-bg-container);font-weight:600">${s.totalQty.toFixed(2)}</td><td colspan="2" style="text-align:right;background:var(--color-bg-container);font-weight:600">—</td><td style="background:var(--color-bg-container)"></td></tr>`;
    }).join('');

    const now = new Date();
    const printDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    // 按类型分组统计（仅用于汇总区展示）
    const typeStats: Record<string, { count: number; totalQty: number }> = {};
    dataList.forEach((item: any) => {
      const type = item.materialType || 'other';
      if (!typeStats[type]) typeStats[type] = { count: 0, totalQty: 0 };
      typeStats[type].count += 1;
      typeStats[type].totalQty += Number(item.quantity) || 0;
    });
    const typeRows = Object.keys(typeStats).map(t => {
      const s = typeStats[t];
      return `<div class="type-stat"><span class="type-name">${esc(getMaterialTypeLabel(t))}</span><span class="type-count">${s.count} 项</span><span class="type-qty">${s.totalQty.toFixed(2)}</span></div>`;
    }).join('');

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>物料资料库清单</title>
  <style>
    @page { margin: 12mm; }
    body { font-family: system-ui, -apple-system, "Microsoft YaHei", "PingFang SC", sans-serif; font-size: 13px; color: var(--color-text-primary); padding: 24px; background: var(--color-bg-base); line-height: 1.7; }
    .title { text-align: center; font-size: 26px; font-weight: 700; margin-bottom: 6px; letter-spacing: 3px; }
    .subtitle { text-align: center; font-size: 12px; color: #999; margin-bottom: 20px; }
    .info-bar { display: flex; justify-content: space-between; padding: 10px 16px; background: #f8f9fa; border: 1px solid #e8e8e8; margin-bottom: 20px; font-size: 12px; }
    /* ---- 汇总区 ---- */
    .summary-section { margin-bottom: 24px; }
    .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 16px; }
    .summary-card { padding: 14px 16px; background: #f4f6f8; border: 1px solid #e0e0e0; text-align: center; border-radius: 6px; }
    .summary-card.highlight { background: linear-gradient(135deg, #F6FFED, #ffd4b8); border-color: #ff7a45; }
    .summary-card-label { font-size: 11px; color: #666; margin-bottom: 6px; }
    .summary-card-value { font-size: 18px; font-weight: 700; color: var(--color-text-primary); }
    .summary-card.highlight .summary-card-value { color: #d4380d; font-size: 20px; }
    .type-stats { display: flex; flex-wrap: wrap; gap: 8px; }
    .type-stat { display: flex; align-items: center; gap: 8px; padding: 6px 12px; background: #f0f7ff; border: 1px solid #91d5ff; border-radius: 4px; font-size: 12px; }
    .type-name { font-weight: 600; color: var(--color-info); }
    .type-count, .type-qty { color: #666; }
    .section { page-break-inside: avoid; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 16px; }
    th, td { border: 1px solid #d0d0d0; padding: 6px 8px; vertical-align: middle; }
    th { background: #f4f6f8; font-weight: 600; color: #262626; text-align: center; }
    tbody tr:hover { background: #fafcff; }
    .footer { margin-top: 30px; text-align: center; font-size: 11px; color: #999; padding-top: 12px; border-top: 1px solid #eee; }
    .print-btn-bar { position: fixed; top: 10px; right: 10px; z-index: 999; }
    .print-btn { padding: 8px 16px; background: var(--color-info); color: var(--color-bg-base); border: none; border-radius: 4px; cursor: pointer; font-size: 13px; }
    @media print {
      .no-print { display: none !important; }
      .print-btn-bar { display: none; }
      .summary-card.highlight { background: #F6FFED !important; border-color: #999 !important; }
    }
  </style>
</head>
<body>
  <div class="print-btn-bar no-print">
    <button class="print-btn" onclick="window.print()">🖨️ 打印</button>
  </div>

  <div class="title">物 料 资 料 库</div>
  <div class="subtitle">Material Database Inventory</div>

  <div class="info-bar">
    <span>打印时间：<strong>${printDate}</strong></span>
    <span>共 <strong>${totalCount}</strong> 条物料记录</span>
  </div>

  <div class="summary-section">
    <div class="summary-grid">
      <div class="summary-card">
        <div class="summary-card-label">物料项数</div>
        <div class="summary-card-value">${totalCount}</div>
      </div>
      <div class="summary-card">
        <div class="summary-card-label">物料种类</div>
        <div class="summary-card-value">${Object.keys(typeStats).length}</div>
      </div>
      <div class="summary-card">
        <div class="summary-card-label">总数量</div>
        <div class="summary-card-value">${totalQty.toFixed(2)}</div>
      </div>
      <div class="summary-card highlight">
        <div class="summary-card-label">总金额（估算）</div>
        <div class="summary-card-value">${formatMoney(totalValue)}</div>
      </div>
    </div>
    ${typeRows ? `<div class="type-stats">${typeRows}</div>` : ''}
  </div>

  <div class="section">
    <table>
      <thead>
        <tr>
          <th style="width:35px">#</th>
          <th style="width:90px">物料编号</th>
          <th>物料名称</th>
          <th style="width:70px">款号</th>
          <th style="width:60px">类型</th>
          <th style="width:60px">颜色</th>
          <th style="width:80px">规格</th>
          <th style="width:45px">单位</th>
          <th style="width:65px">数量</th>
          <th style="width:70px">单价</th>
          <th style="width:85px">金额</th>
          <th style="width:100px">供应商</th>
        </tr>
      </thead>
      <tbody>
        ${rows || '<tr><td colspan="12" style="text-align:center;color:#999;padding:20px">暂无物料数据</td></tr>'}
      </tbody>
    </table>
  </div>

  <div class="footer">本清单数据仅供参考，实际数量以盘点为准 · 打印时间：${printDate}</div>
</body>
</html>`;
  }, [dataList]);

  const handlePrintMaterialDatabase = useCallback(() => {
    if (dataList.length === 0) {
      return;
    }
    const html = buildMaterialPrintHtml();
    const printWindow = window.open('', '_blank', 'width=1200,height=800');
    if (!printWindow) {
      return;
    }
    printWindow.document.write(html);
    printWindow.document.close();
  }, [dataList, buildMaterialPrintHtml]);

  return (
    <>
      {showSmartErrorNotice && smartError ? (
        <Card style={{ marginBottom: 12 }}>
          <SmartErrorNotice error={smartError} onFix={() => { void fetchList(); }} />
        </Card>
      ) : null}

      {/* 视图切换 + 标题栏 */}
      <Card style={{ marginBottom: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 0 }}>
          <h2 style={{ margin: 0 }}> 物料资料库</h2>
          <Space>
            <Segmented
              value={viewMode}
              onChange={(v) => setViewMode(v as 'list' | 'materialCard' | 'supplierCard')}
              options={[
                { value: 'list', label: <span><UnorderedListOutlined /> 列表</span> },
                { value: 'materialCard', label: <span><AppstoreOutlined /> 物料卡片</span> },
                { value: 'supplierCard', label: <span><BookOutlined /> 供应商色卡</span> },
              ]}
            />
            {viewMode === 'list' && (
              <Button icon={<PrinterOutlined />} onClick={handlePrintMaterialDatabase}>打印清单</Button>
            )}
          </Space>
        </div>
      </Card>

      {/* 列表视图 */}
      {viewMode === 'list' && (
        <Card style={{ marginTop: 12 }}>
          <Card style={{ marginBottom: 12, background: 'var(--color-bg-container)' }}>
            <StandardToolbar
              left={(
                <StandardSearchBar
                  searchValue={searchKeyword} onSearchChange={setSearchKeyword}
                  searchPlaceholder="搜索物料编号/名称" dateValue={dateRange} onDateChange={setDateRange}
                  statusValue={statusValue} onStatusChange={setStatusValue} showDatePresets={false}
                  statusOptions={[
                    { label: '全部', value: '' }, { label: '面料', value: 'fabric' },
                    { label: '里料', value: 'lining' }, { label: '辅料', value: 'accessory' },
                    { label: '已停用', value: 'disabled' },
                  ]}
                />
              )}
              right={<Button type="primary" onClick={() => openDialog('create')}>新增物料信息</Button>}
            />
          </Card>
          <ResizableTable<MaterialDatabase>
            columns={columns} dataSource={dataList} rowKey={(r) => String(r?.id || r?.materialCode || '')}
            loading={loading} stickyHeader scroll={{ x: 'max-content' }} size={isMobile ? 'small' : 'middle'} emptyDescription="暂无物料数据"
            pagination={{ ...pagination, simple: false, showTotal: (t) => `共 ${t} 条`, showSizeChanger: true, pageSizeOptions: ['20', '50', '100', '200'], onChange, size: isMobile ? 'small' : 'default' }}
          />
        </Card>
      )}

      {/* 物料卡片视图 */}
      {viewMode === 'materialCard' && (
        <Card style={{ marginTop: 12 }}>
          <Card style={{ marginBottom: 12, background: 'var(--color-bg-container)' }}>
            <StandardToolbar
              left={(
                <StandardSearchBar
                  searchValue={searchKeyword} onSearchChange={setSearchKeyword}
                  searchPlaceholder="搜索物料编号/名称" dateValue={dateRange} onDateChange={setDateRange}
                  statusValue={statusValue} onStatusChange={setStatusValue} showDatePresets={false}
                  statusOptions={[
                    { label: '全部', value: '' }, { label: '面料', value: 'fabric' },
                    { label: '里料', value: 'lining' }, { label: '辅料', value: 'accessory' },
                    { label: '已停用', value: 'disabled' },
                  ]}
                />
              )}
              right={<Button type="primary" onClick={() => openDialog('create')}>新增物料信息</Button>}
            />
          </Card>
          <UniversalCardView
            dataSource={dataList}
            loading={loading}
            titleField="materialName"
            subtitleField="materialCode"
            coverField="image"
            coverPlaceholder="暂无图片"
            fields={[
              { label: '类型', key: 'materialType', format: (v) => getMaterialTypeLabel(v) },
              { label: '颜色', key: 'color', format: (v) => v || '-' },
              { label: '幅宽', key: 'fabricWidth', format: (v) => v || '-' },
              { label: '克重', key: 'fabricWeight', format: (v) => v || '-' },
              { label: '规格', key: 'specifications', format: (v) => v || '-' },
              { label: '成分', key: 'fabricComposition', format: (v) => v || '-' },
              { label: '单价', key: 'unitPrice', format: (v) => v != null ? `¥${v}` : '-' },
              { label: '单位', key: 'unit', format: (v) => v || '-' },
            ]}
            titleTags={(record) => (
              <>
                <Tag color="blue">{getMaterialTypeLabel(record.materialType)}</Tag>
                {record.disabled === 1 && <Tag color="default">已停用</Tag>}
              </>
            )}
            actions={(record) => [
              { key: 'edit', label: '编辑', icon: <EditOutlined />, onClick: () => openDialog('edit', record) },
              { key: 'delete', label: '删除', icon: <DeleteOutlined />, danger: true, onClick: () => handleDelete(record) },
            ]}
            maxInlineActions={2}
            pagination={{
              ...pagination, showTotal: (t) => `共 ${t} 条`, showSizeChanger: true,
              pageSizeOptions: ['20', '50', '100', '200'], onChange, size: isMobile ? 'small' : 'default',
            }}
            hoverRender={(record) => (
              <div style={{ maxWidth: 400 }}>
                {record.supplierName && <div style={{ marginBottom: 6 }}>供应商：{record.supplierName}</div>}
                {record.supplierContactPerson && <div>联系人：{record.supplierContactPerson}{record.supplierContactPhone ? ` · ${record.supplierContactPhone}` : ''}</div>}
                {record.description && <div style={{ marginTop: 6, color: '#666' }}>{record.description}</div>}
                {record.remark && <div style={{ marginTop: 6, color: '#874d00' }}>备注：{record.remark}</div>}
              </div>
            )}
          />
        </Card>
      )}

      {/* 供应商色卡视图 */}
      {viewMode === 'supplierCard' && (
        <Card style={{ marginTop: 12 }}>
          {renderCardView()}
        </Card>
      )}

      {/* ===== 物料新增抽屉（同原来） ===== */}
      <Drawer
        title={currentMaterial?.id ? '编辑物料信息' : (currentMaterial ? '复制物料信息' : '新增物料信息')}
        open={visible}
        onClose={closeDialog}
        width="85%"
        bodyStyle={{ padding: 16 }}
        footer={[
          <Button key="cancel" onClick={closeDialog}>取消</Button>,
          <Button key="submit" type="primary" loading={submitLoading} onClick={() => handleSubmit()}>
            {currentMaterial?.id ? '保存' : '创建'}
          </Button>,
        ]}
      >
        <div style={{ marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid #eee' }}>
          <MaterialColorCardRecognizer
            form={form}
            onMaterialTypeRecognized={(type) => fetchMaterialCode(type)}
            onImageSelected={(url) => {
              form.setFieldsValue({ image: url });
              setImageFiles([{ uid: '-1', name: 'image', status: 'done' as const, url }]);
            }}
          />
          <span style={{ color: '#999', fontSize: 12, marginLeft: 12 }}>
            提示：拍照色卡图片，AI 自动识别物料信息，识别后可编辑再保存
          </span>
        </div>
        <Form form={form} layout="vertical" size={isMobile ? 'small' : 'middle'}>
          <Row gutter={[12, 8]}>
            <Col xs={24} sm={8} md={6} lg={4} xl={4}>
              <Form.Item name="image" label="物料图片">
                <ImageUploadBox
                  value={imageFiles.length > 0 ? (imageFiles[0] as any)?.url?.replace(/^.*\/api\//, '/api/') || null : null}
                  onChange={(url) => {
                    if (!url) {
                      form.setFieldsValue({ image: undefined });
                      setImageFiles([]);
                    }
                  }}
                  enableDrop
                  size={104}
                  label="物料图片"
                  uploadFn={uploadImage}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8} md={6} lg={5} xl={4}>
              <Form.Item name="materialCode" label="物料编号" rules={[{ required: true, message: '请输入物料编号' }]}>
                <Input placeholder="选择物料类型后自动生成，也可手动输入" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8} md={6} lg={5} xl={4}>
              <Form.Item name="materialName" label="物料名称" rules={[{ required: true, message: '请输入物料名称' }]}>
                <Input placeholder="请输入物料名称" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8} md={6} lg={5} xl={4}>
              <Form.Item name="styleNo" label="款号"><Input placeholder="请输入款号" /></Form.Item>
            </Col>
            <Col xs={24} sm={8} md={6} lg={5} xl={4}>
              <Form.Item name="materialType" label="物料类型" rules={[{ required: true, message: '请选择物料类型' }]}>
                <Select placeholder="请选择物料类型" onChange={(value) => { if (!currentMaterial?.id) fetchMaterialCode(value); }}>
                  <Option value="fabric">面料</Option><Option value="lining">里料</Option><Option value="accessory">辅料</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={[12, 8]}>
            <Col xs={24} sm={8} md={6} lg={5} xl={4}>
              <Form.Item name="color" label="颜色"><Input placeholder="请输入颜色" /></Form.Item>
            </Col>
            <Col xs={24} sm={8} md={6} lg={5} xl={4}>
              <Form.Item name="specifications" label="规格/幅宽"><Input placeholder="如：150cm 或请输入规格" /></Form.Item>
            </Col>
            <Col xs={24} sm={8} md={6} lg={5} xl={4}>
              <Form.Item name="unit" label="单位" rules={[{ required: true, message: '请选择单位' }]}>
                <DictAutoComplete dictType="material_unit" placeholder="请选择或输入单位" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8} md={6} lg={5} xl={4}>
              <Form.Item name="supplierName" label="供应商" rules={[{ required: true, message: '请输入供应商' }]}>
                <SupplierSelect placeholder="请选择或输入供应商"
                  onChange={(value, option) => { form.setFieldsValue({ supplierName: value, supplierId: option?.supplierId, supplierContactPerson: option?.supplierContactPerson, supplierContactPhone: option?.supplierContactPhone }); }} />
              </Form.Item>
              <Form.Item name="supplierId" hidden><Input /></Form.Item>
              <Form.Item name="supplierContactPerson" hidden><Input /></Form.Item>
              <Form.Item name="supplierContactPhone" hidden><Input /></Form.Item>
            </Col>
            <Col xs={24} sm={8} md={6} lg={4} xl={4}>
              <Form.Item name="unitPrice" label="单价(元)"><InputNumber placeholder="请输入单价" style={{ width: '100%' }} min={0} step={0.01} precision={2} /></Form.Item>
            </Col>
            <Col xs={24} sm={8} md={6} lg={4} xl={4}>
              <Form.Item name="conversionRate" label="换算"><InputNumber placeholder="如：3" style={{ width: '100%' }} min={0} step={0.01} precision={4} /></Form.Item>
            </Col>
          </Row>
          <Form.Item noStyle shouldUpdate={(prevValues, currentValues) => prevValues.materialType !== currentValues.materialType}>
            {({ getFieldValue }) => {
              const materialType = getFieldValue('materialType');
              const mt = String(materialType || '').toLowerCase();
              if (mt !== 'fabric' && mt !== 'lining' && mt !== 'accessory') return null;
              return (
                <Row gutter={[12, 8]}>
                  <Col xs={24}><div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, marginTop: 4, marginBottom: 8, color: 'var(--primary-color)' }}> 面料属性</div></Col>
                  <Col xs={24} sm={8} md={6} lg={5} xl={4}>
                    <Form.Item name="fabricWeight" label="克重"><Input placeholder="如：200g/m²" /></Form.Item>
                  </Col>
                  <Col xs={24} sm={8} md={6} lg={5} xl={4}>
                    <Form.Item name="fabricWidth" label="幅宽"><Input placeholder="如：150cm" /></Form.Item>
                  </Col>
                  <Col xs={24} sm={8} md={6} lg={5} xl={4}>
                    <Form.Item name="fabricComposition" label="成分"><Input placeholder="如：100%棉" /></Form.Item>
                  </Col>
                </Row>
              );
            }}
          </Form.Item>
          <Row gutter={[12, 8]}>
            <Col xs={24} sm={12} md={8} lg={6} xl={5}>
              <Form.Item name="description" label="描述"><Input placeholder="请输入描述" /></Form.Item>
            </Col>
            <Col xs={24} sm={12} md={8} lg={6} xl={5}>
              <Form.Item name="createTime" label="创建时间"><Input type="datetime-local" placeholder="系统自动生成" disabled /></Form.Item>
            </Col>
            <Col xs={24} sm={12} md={8} lg={6} xl={5}>
              <Form.Item name="completedTime" label="完成时间"><Input type="datetime-local" placeholder="完成后自动生成" disabled /></Form.Item>
            </Col>
            <Col xs={24} sm={12} md={8} lg={6} xl={5}>
              <Form.Item name="status" label="状态">
                <Select placeholder="请选择状态" onChange={(v) => {
                  const st = String(v || 'pending').trim().toLowerCase();
                  if (st === 'completed') { const existed = String(form.getFieldValue('completedTime') || '').trim(); if (!existed) form.setFieldsValue({ completedTime: toLocalDateTimeInputValue() }); return; }
                  form.setFieldsValue({ completedTime: undefined });
                }}>
                  <Option value="pending">待完成</Option><Option value="completed">已完成</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={[12, 8]}>
            <Col xs={24}>
              <Form.Item name="remark" label="备注"><Input.TextArea placeholder="请输入备注" autoSize={{ minRows: 2 }} /></Form.Item>
            </Col>
          </Row>
        </Form>
      </Drawer>
      <RejectReasonModal
        open={returnTarget !== null} title="确认退回编辑"
        description="退回后该物料将恢复为待处理状态，可重新编辑。"
        fieldLabel="退回原因" placeholder="请填写退回原因（可选）" required={false}
        okText="确认退回" loading={returnLoading} onOk={handleReturnConfirm} onCancel={() => setReturnTarget(null)}
      />
      <Modal
        title={
          colorItemsData?.card?.colorCardName
            ? `色卡本 "${colorItemsData.card.colorCardName}" - 颜色详情`
            : '色卡本颜色详情'
        }
        open={colorItemsVisible}
        onCancel={() => setColorItemsVisible(false)}
        footer={null}
        width={720}
      >
        {colorItemsLoading && <div style={{ textAlign: 'center', padding: 20, color: 'var(--color-text-secondary)' }}>加载中...</div>}
        {!colorItemsLoading && colorItemsData?.card && (
          <>
            <div style={{ marginBottom: 16, color: 'var(--color-text-secondary)', fontSize: 13 }}>
              色卡本编号：{colorItemsData.card.colorCardCode || '-'} · 共 {Array.isArray(colorItemsData.items) ? colorItemsData.items.length : 0} 种颜色
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {Array.isArray(colorItemsData.items) && colorItemsData.items.map((item: any, idx: number) => (
                <Card key={item.id || idx} size="small" style={{ border: '1px solid var(--color-border)' }}>
                  <Row gutter={12} align="middle">
                    <Col xs={24} sm={2} style={{ fontWeight: 600, color: 'var(--color-primary)' }}>#{idx + 1}</Col>
                    <Col xs={24} sm={5}>颜色编号：{item.colorNo || '-'}</Col>
                    <Col xs={24} sm={5}>颜色名称：{item.colorName || '-'}</Col>
                    <Col xs={24} sm={6}>
                      {item.unitPrice != null && item.unitPrice !== undefined ? `单价：${item.unitPrice} 元` : '-'}
                    </Col>
                    <Col xs={24} sm={6} style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}>
                      {item.remark || ''}
                    </Col>
                  </Row>
                </Card>
              ))}
              {Array.isArray(colorItemsData.items) && colorItemsData.items.length === 0 && (
                <div style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-tertiary)' }}>暂无颜色信息</div>
              )}
            </div>
          </>
        )}
      </Modal>

      {/* ===== 物料色卡母卡新建/编辑弹窗 ===== */}
      <Modal
        title={currentCard?.id ? '编辑物料色卡' : '新建物料色卡'}
        open={cardDialogVisible}
        onCancel={() => setCardDialogVisible(false)}
        onOk={handleCardSave}
        width={760}
        okText="保存"
        cancelText="取消"
      >
        <Form form={cardForm} layout="vertical" size="middle">
          <Row gutter={12}>
            <Col xs={24} sm={8}>
              <Form.Item name="cardCode" label="色卡编号" rules={[{ required: true, message: '请输入编号' }]}>
                <Input placeholder="自动生成或手动输入" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={16}>
              <Form.Item name="cardName" label="色卡名称" rules={[{ required: true, message: '请输入' }]}>
                <Input placeholder="如：某某纺织-春夏面料色卡" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="materialType" label="物料类型" rules={[{ required: true, message: '请选择' }]}>
                <Select placeholder="请选择">
                  {MATERIAL_TYPE_OPTIONS.map((o) => (
                    <Select.Option key={o.value} value={o.value}>{o.label}</Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>

          {/* 封面图片 */}
          <Form.Item label="封面图片">
            <ImageUploadBox
              value={coverImageFiles.length > 0 ? (coverImageFiles[0] as any)?.url : null}
              onChange={(url) => setCoverImageFiles(url ? [{ url }] : [])}
              uploadFn={uploadCardImage}
              size={120}
              label=""
              enableDrop
            />
          </Form.Item>

          <Row gutter={12}>
            <Col xs={24} sm={8}>
              <Form.Item name="fabricWidth" label="幅宽"><Input placeholder="如 150cm" /></Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="specifications" label="规格"><Input placeholder="如 50米/卷" /></Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="fabricWeight" label="克重"><Input placeholder="如 200g/m²" /></Form.Item>
            </Col>
            <Col xs={24} sm={16}>
              <Form.Item name="fabricComposition" label="成分含量"><Input placeholder="如 100%棉" /></Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="unit" label="单位"><Input placeholder="如 米" /></Form.Item>
            </Col>
          </Row>

          <Form.Item name="supplierId" hidden><Input /></Form.Item>
          <Form.Item label="供应商" required>
            <Form.Item noStyle shouldUpdate={(prev: any, curr: any) => prev.supplierId !== curr.supplierId}>
              {({ getFieldValue }) => (
                <SupplierSelect
                  placeholder="请选择供应商"
                  value={getFieldValue('supplierName')}
                  onChange={(value, option) => {
                    cardForm.setFieldsValue({
                      supplierId: (option as any)?.supplierId || value,
                      supplierName: value,
                      supplierContactPerson: (option as any)?.contactPerson,
                      supplierContactPhone: (option as any)?.contactPhone,
                    });
                  }}
                />
              )}
            </Form.Item>
          </Form.Item>

          <Row gutter={12}>
            <Col xs={24} sm={12}>
              <Form.Item name="supplierContactPerson" label="联系人"><Input placeholder="自动填充" /></Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="supplierContactPhone" label="联系电话"><Input placeholder="自动填充" /></Form.Item>
            </Col>
          </Row>
          <Form.Item name="remark" label="备注">
            <Input.TextArea placeholder="备注信息" autoSize={{ minRows: 2, maxRows: 4 }} />
          </Form.Item>
        </Form>
      </Modal>

      {/* ===== 物料色卡子物料管理弹窗 ===== */}
      <Modal
        title={<Space><AppstoreAddOutlined /> {currentCardName} - 物料管理</Space>}
        open={itemVisible}
        onCancel={() => setItemVisible(false)}
        width={960}
        footer={[
          <Button key="close" onClick={() => setItemVisible(false)}>关闭</Button>,
          <Button key="save" type="primary" onClick={saveCardItems}>保存全部</Button>,
        ]}
      >
        <Space style={{ marginBottom: 12 }}>
          <Button type="primary" icon={<PlusOutlined />} onClick={addEmptyCardItem}>+ 添加物料</Button>
          <span style={{ color: '#888' }}>共 {currentItems.length} 条</span>
        </Space>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 480, overflowY: 'auto' }}>
          {currentItems.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>暂无物料，点击"添加物料"开始添加</div>
          )}
          {currentItems.map((item, idx) => (
            <Card key={idx} size="small" style={{ border: '1px solid #eee' }}>
              <Row gutter={[8, 8]} align="middle">
                <Col xs={24} sm={1}>
                  <Tag color="blue">#{idx + 1}</Tag>
                </Col>
                <Col xs={24} sm={3}>
                  <Input placeholder="物料编号" value={item.materialCode || ''}
                    onChange={(e) => updateCardItem(idx, 'materialCode', e.target.value)} size="small" />
                </Col>
                <Col xs={24} sm={4}>
                  <Input placeholder="物料名称*" value={item.materialName || ''}
                    onChange={(e) => updateCardItem(idx, 'materialName', e.target.value)} size="small" />
                </Col>
                <Col xs={24} sm={3}>
                  <Input placeholder="颜色" value={item.color || ''}
                    onChange={(e) => updateCardItem(idx, 'color', e.target.value)} size="small" />
                </Col>
                <Col xs={24} sm={3}>
                  <InputNumber placeholder="单价" value={item.unitPrice}
                    onChange={(v) => updateCardItem(idx, 'unitPrice', v)}
                    min={0} step={0.01} style={{ width: '100%' }} size="small" />
                </Col>
                <Col xs={24} sm={3}>
                  <Select placeholder="物料类型" value={item.materialType || undefined}
                    onChange={(v) => updateCardItem(idx, 'materialType', v)} size="small" style={{ width: '100%' }}>
                    {MATERIAL_TYPE_OPTIONS.map((o) => (
                      <Select.Option key={o.value} value={o.value}>{o.label}</Select.Option>
                    ))}
                  </Select>
                </Col>
                <Col xs={24} sm={5}>
                  <Space.Compact>
                    <Button size="small" icon={<PlusOutlined />} onClick={async () => {
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.accept = 'image/*';
                      const file: File = await new Promise((resolve) => {
                        input.onchange = (ev: any) => resolve(ev.target.files[0]);
                        input.click();
                      });
                      try {
                        const url = await uploadCardImage(file);
                        updateCardItem(idx, 'image', url);
                      } catch {}
                    }}>上传图片</Button>
                    {item.image && (
                      <Image src={getFullAuthedFileUrl(item.image)} width={32} height={32} style={{ objectFit: 'cover' }} preview />
                    )}
                  </Space.Compact>
                </Col>
                <Col xs={24} sm={2}>
                  <Button type="link" danger size="small" onClick={() => removeCardItem(idx)}>删除</Button>
                </Col>
              </Row>
            </Card>
          ))}
        </div>
      </Modal>
    </>
  );
};

export default MaterialDatabasePage;
