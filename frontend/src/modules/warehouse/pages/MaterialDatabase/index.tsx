import React, { useCallback, useEffect, useState } from 'react';
import { Button, Card, Input, Select, Form, Row, Col, InputNumber } from 'antd';
import { PrinterOutlined } from '@ant-design/icons';
import StandardModal from '@/components/common/StandardModal';
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
import { useViewport } from '@/utils/useViewport';
import { useTablePagination } from '@/hooks';
import SupplierSelect from '@/components/common/SupplierSelect';
import DictAutoComplete from '@/components/common/DictAutoComplete';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import { isSmartFeatureEnabled } from '@/smart/core/featureFlags';
import type { SmartErrorInfo } from '@/smart/core/types';
import { useMaterialDatabaseActions } from './useMaterialDatabaseActions';
import { getMaterialDatabaseColumns } from './materialDatabaseColumns';

const { Option } = Select;

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

  const columns = getMaterialDatabaseColumns({
    openDialog, handleComplete, handleDelete, handleReturn, handleDisable, handleEnable, user,
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
      return `<tr><td colspan="8" style="text-align:right;background:#fafafa;font-weight:600">${esc(getMaterialTypeLabel(type))} 小计：${s.count} 项 / ${s.totalQty.toFixed(2)} 单位</td><td style="text-align:right;background:#fafafa;font-weight:600">${s.totalQty.toFixed(2)}</td><td colspan="2" style="text-align:right;background:#fafafa;font-weight:600">—</td><td style="background:#fafafa"></td></tr>`;
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
    body { font-family: system-ui, -apple-system, "Microsoft YaHei", "PingFang SC", sans-serif; font-size: 13px; color: #1a1a1a; padding: 24px; background: #fff; line-height: 1.7; }
    .title { text-align: center; font-size: 26px; font-weight: 700; margin-bottom: 6px; letter-spacing: 3px; }
    .subtitle { text-align: center; font-size: 12px; color: #999; margin-bottom: 20px; }
    .info-bar { display: flex; justify-content: space-between; padding: 10px 16px; background: #f8f9fa; border: 1px solid #e8e8e8; margin-bottom: 20px; font-size: 12px; }
    /* ---- 汇总区 ---- */
    .summary-section { margin-bottom: 24px; }
    .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 16px; }
    .summary-card { padding: 14px 16px; background: #f4f6f8; border: 1px solid #e0e0e0; text-align: center; border-radius: 6px; }
    .summary-card.highlight { background: linear-gradient(135deg, #fff2e8, #ffd4b8); border-color: #ff7a45; }
    .summary-card-label { font-size: 11px; color: #666; margin-bottom: 6px; }
    .summary-card-value { font-size: 18px; font-weight: 700; color: #1a1a1a; }
    .summary-card.highlight .summary-card-value { color: #d4380d; font-size: 20px; }
    .type-stats { display: flex; flex-wrap: wrap; gap: 8px; }
    .type-stat { display: flex; align-items: center; gap: 8px; padding: 6px 12px; background: #f0f7ff; border: 1px solid #91d5ff; border-radius: 4px; font-size: 12px; }
    .type-name { font-weight: 600; color: #1890ff; }
    .type-count, .type-qty { color: #666; }
    .section { page-break-inside: avoid; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 16px; }
    th, td { border: 1px solid #d0d0d0; padding: 6px 8px; vertical-align: middle; }
    th { background: #f4f6f8; font-weight: 600; color: #262626; text-align: center; }
    tbody tr:hover { background: #fafcff; }
    .footer { margin-top: 30px; text-align: center; font-size: 11px; color: #999; padding-top: 12px; border-top: 1px solid #eee; }
    .print-btn-bar { position: fixed; top: 10px; right: 10px; z-index: 999; }
    .print-btn { padding: 8px 16px; background: #1890ff; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 13px; }
    @media print {
      .no-print { display: none !important; }
      .print-btn-bar { display: none; }
      .summary-card.highlight { background: #fff3e0 !important; border-color: #999 !important; }
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
      <Card>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: 16,
        }}>
          <h2 style={{ margin: 0 }}> 物料资料库</h2>
          <Button icon={<PrinterOutlined />} onClick={handlePrintMaterialDatabase}>打印清单</Button>
        </div>
        <Card style={{ marginBottom: 16, background: 'var(--color-bg-container)' }}>
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
          loading={loading} stickyHeader scroll={{ x: 'max-content' }} size={isMobile ? 'small' : 'middle'}
          pagination={{ ...pagination, simple: false, showTotal: (t) => `共 ${t} 条`, showSizeChanger: true, pageSizeOptions: ['20', '50', '100', '200'], onChange, size: isMobile ? 'small' : 'default' }}
        />
      </Card>
      <StandardModal
        title={currentMaterial?.id ? '编辑物料信息' : (currentMaterial ? '复制物料信息' : '新增物料信息')}
        open={visible} onCancel={closeDialog} size="lg"
        footer={[
          <Button key="cancel" onClick={closeDialog}>取消</Button>,
          <Button key="submit" type="primary" loading={submitLoading} onClick={() => handleSubmit()}>
            {currentMaterial?.id ? '保存' : '创建'}
          </Button>,
        ]}
      >
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
      </StandardModal>
      <RejectReasonModal
        open={returnTarget !== null} title="确认退回编辑"
        description="退回后该物料将恢复为待处理状态，可重新编辑。"
        fieldLabel="退回原因" placeholder="请填写退回原因（可选）" required={false}
        okText="确认退回" loading={returnLoading} onOk={handleReturnConfirm} onCancel={() => setReturnTarget(null)}
      />
    </>
  );
};

export default MaterialDatabasePage;
