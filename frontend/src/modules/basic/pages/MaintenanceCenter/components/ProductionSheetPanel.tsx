import React, { useEffect, useMemo, useState } from 'react';
import { App, Button, Card, Form, Input, Space, Row, Col, Image } from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import ResizableModal from '@/components/common/ResizableModal';
import SmallModal from '@/components/common/SmallModal';
import RowActions from '@/components/common/RowActions';
import StandardToolbar from '@/components/common/StandardToolbar';
import PageStatCards from '@/components/common/PageStatCards';
import api from '@/utils/api';
import { StyleInfo, StyleQueryParams } from '@/types/style';
import { getErrorMessage } from '../../TemplateCenter/utils/templateUtils';
import { toCategoryCn } from '@/utils/styleCategory';
import { formatDateTime } from '@/utils/datetime';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import { readPageSize } from '@/utils/pageSizeStore';
import { isAdminUser as isAdminUserFn, useAuth } from '@/utils/AuthContext';
import { buildProductionSheetHtml } from '../../DataCenter/buildProductionSheetHtml';

const { TextArea } = Input;

const directCardStyle = {
  border: '1px solid #ececec',
  borderRadius: 10,
  padding: 12,
  background: '#fff',
} as const;

const directStackStyle = { display: 'grid', gap: 10 } as const;

const directTitleStyle = {
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--color-text-primary)',
  lineHeight: 1.2,
} as const;

const directMetaStyle = {
  fontSize: 12,
  color: 'var(--neutral-text-secondary)',
  lineHeight: 1.4,
} as const;

const directFieldLabelStyle = {
  marginBottom: 4,
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--neutral-text-secondary)',
} as const;

const processingBannerStyle = {
  marginBottom: 10,
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid #ffd591',
  background: '#fff7e6',
  display: 'grid',
  gap: 4,
} as const;

interface DataCenterStats {
  styleCount: number;
  materialCount: number;
  productionCount: number;
}

interface ProductionRequirementsSaveResult {
  id: number;
  styleNo?: string;
  description?: string;
  descriptionLocked?: number;
  descriptionReturnComment?: string | null;
  updateBy?: string;
  updateTime?: string;
}

const AttachmentThumb: React.FC<{ styleId?: string | number; cover?: string | null }> = React.memo(({ styleId, cover }) => {
  const [url, setUrl] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    let mounted = true;
    if (!styleId) { setUrl(cover || null); return () => { mounted = false; }; }
    (async () => {
      setLoading(true);
      try {
        const res = await api.get<{ code: number; data: unknown[] }>(`/style/attachment/list?styleId=${styleId}`);
        if (res.code === 200) {
          const images = (res.data || []).filter((f: any) => String(f.fileType || '').includes('image'));
          if (mounted) setUrl((images[0] as any)?.fileUrl || cover || null);
          return;
        }
        if (mounted) setUrl(cover || null);
      } catch {
        if (mounted) setUrl(cover || null);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [styleId, cover]);

  return (
    <div style={{ width: 56, height: 56, overflow: 'hidden', background: 'var(--color-bg-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {loading ? <span style={{ color: 'var(--neutral-text-secondary)', fontSize: 'var(--font-size-sm)' }}>...</span>
        : url ? <img src={getFullAuthedFileUrl(url)} alt="cover" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : <span style={{ color: 'var(--neutral-text-disabled)', fontSize: 'var(--font-size-sm)' }}>无图</span>}
    </div>
  );
});

interface ProductionSheetPanelProps { styleNo?: string; }

const ProductionSheetPanel: React.FC<ProductionSheetPanelProps> = ({ styleNo }) => {
  const { message } = App.useApp();
  const { user } = useAuth();

  const [stats, setStats] = useState<DataCenterStats>({ styleCount: 0, materialCount: 0, productionCount: 0 });
  const [queryParams, setQueryParams] = useState<StyleQueryParams>({ page: 1, pageSize: readPageSize(10), onlyCompleted: true, ...(styleNo ? { styleNoExact: styleNo } : {}) });
  const [styles, setStyles] = useState<StyleInfo[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingRecord, setEditingRecord] = useState<StyleInfo | null>(null);
  const [editForm] = Form.useForm();
  const [editSaving, setEditSaving] = useState(false);
  const [cancelLocking, setCancelLocking] = useState(false);

  const [returnDescVisible, setReturnDescVisible] = useState(false);
  const [returnDescRecord, setReturnDescRecord] = useState<StyleInfo | null>(null);
  const [returnDescSaving, setReturnDescSaving] = useState(false);
  const [returnDescForm] = Form.useForm();

  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [detailRecord, setDetailRecord] = useState<StyleInfo | null>(null);

  const isAdminUser = useMemo(() => isAdminUserFn(user), [user]);
  const isFactoryUser = useMemo(() => !!user?.factoryId, [user]);
  const canManage = isAdminUser || isFactoryUser;
  const directRow = styleNo ? (styles.find(s => s.styleNo === styleNo) ?? null) : null;
  const directLocked = Number((directRow as any)?.descriptionLocked) === 1;
  const directProcessing = !directLocked && !!String((directRow as any)?.descriptionReturnComment || '').trim();

  const fetchStats = async () => {
    try {
      const res = await api.get<{ code: number; data: DataCenterStats }>('/data-center/stats');
      if (res.code === 200 && res.data) setStats(res.data);
    } catch { /* silent */ }
  };

  const fetchStyles = async () => {
    setLoading(true);
    try {
      const response = await api.get<{ code: number; message: string; data: { records: any[]; total: number } }>('/style/info/list', { params: queryParams });
      if (response.code === 200) { setStyles(response.data.records || []); setTotal(response.data.total || 0); }
      else { message.error(response.message || '获取列表失败'); }
    } catch (e: unknown) { message.error(e instanceof Error ? e.message : '获取列表失败'); }
    finally { setLoading(false); }
  };

  const openEditModal = (record: StyleInfo) => {
    setEditingRecord(record);
    editForm.setFieldsValue({ description: (record as any).description || '' });
    setEditModalVisible(true);
  };

  const handleEditSave = async () => {
    const targetRecord = styleNo ? directRow : editingRecord;
    if (!targetRecord) return;
    try {
      setEditSaving(true);
      const values = await editForm.validateFields();
      const res = await api.put<{ code: number; message: string; data?: ProductionRequirementsSaveResult }>(`/style/info/${targetRecord.id}/production-requirements`, {
        description: values.description,
      });
      if (res.code === 200 && Number(res.data?.descriptionLocked) === 1) {
        setEditModalVisible(false);
        editForm.resetFields();
        await fetchStyles();
        message.success('保存成功');
      } else {
        message.error(res.message || '保存后状态未锁定，请刷新后重试');
      }
    } catch (e: unknown) { message.error(e instanceof Error ? e.message : '保存失败'); }
    finally { setEditSaving(false); }
  };

  const handleReturnDescSave = async () => {
    const targetRecord = styleNo ? directRow : returnDescRecord;
    if (!targetRecord) return;
    try {
      setReturnDescSaving(true);
      const values = await returnDescForm.validateFields();
      const res = await api.post<{ code: number; message: string }>(`/style/info/${targetRecord.id}/production-requirements/rollback`, { reason: values.reason });
      if (res.code === 200) { message.success('已退回制单信息'); setReturnDescVisible(false); returnDescForm.resetFields(); fetchStyles(); }
      else { message.error(res.message || '退回失败'); }
    } catch (e: unknown) { message.error(e instanceof Error ? e.message : '退回失败'); }
    finally { setReturnDescSaving(false); }
  };

  const downloadFile = (fileName: string, content: string, mime = 'text/html') => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = fileName; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  const downloadProductionSheet = async (style: StyleInfo) => {
    try {
      const res = await api.get<{ code: number; data: any }>('/data-center/production-sheet', { params: { styleNo: style.styleNo } });
      if (res.code === 200 && res.data) {
        const html = buildProductionSheetHtml(res.data);
        downloadFile(`${style.styleNo}_制单.html`, html);
      } else { message.error('获取制单数据失败'); }
    } catch { message.error('获取制单数据失败'); }
  };

  useEffect(() => { fetchStats(); }, []);
  useEffect(() => {
    setQueryParams(prev => {
      const next = styleNo || undefined;
      if (prev.styleNo === next) return prev;
      return { ...prev, styleNo: next, page: 1 };
    });
  }, [styleNo]);
  useEffect(() => { fetchStyles(); }, [queryParams]);

  useEffect(() => {
    if (styleNo && directRow && !directLocked) {
      editForm.setFieldsValue({ description: (directRow as any).description || '' });
    }
  }, [directLocked, directRow, editForm, styleNo]);

  const renderProductionSummary = (record: StyleInfo) => (
    <div style={{ display: 'grid', gap: 4, marginBottom: 10 }}>
      <div style={directTitleStyle}>制单维护</div>
      <div style={directMetaStyle}>款号 {record.styleNo || '-'} · {toCategoryCn((record as any).category) || '-'}</div>
      <div style={directMetaStyle}>推送人 {(record as any).productionAssignee || '-'} · 推送时间 {(record as any).productionCompletedTime ? formatDateTime((record as any).productionCompletedTime) : '-'}</div>
      {(record as any).descriptionReturnComment ? <div style={directMetaStyle}>上次退回 {(record as any).descriptionReturnComment}</div> : null}
    </div>
  );

  const columns = useMemo(() => [
    { title: '图片', dataIndex: 'cover', key: 'cover', width: 72, render: (_: any, record: StyleInfo) => <AttachmentThumb styleId={(record as any).id} cover={(record as any).cover || null} /> },
    { title: '款号', dataIndex: 'styleNo', key: 'styleNo', width: 140 },
    { title: '款名', dataIndex: 'styleName', key: 'styleName', ellipsis: true },
    { title: '品类', dataIndex: 'category', key: 'category', width: 100, render: (v: any) => toCategoryCn(v) },
    { title: '推送时间', dataIndex: 'productionCompletedTime', key: 'productionCompletedTime', width: 150, render: (v: any) => v ? formatDateTime(v) : '-' },
    { title: '推送人', dataIndex: 'productionAssignee', key: 'productionAssignee', width: 100, render: (v: any) => v || '-' },
    { title: '维护人', dataIndex: 'updateBy', key: 'updateBy', width: 100, render: (v: any) => v || '-' },
    { title: '维护时间', dataIndex: 'updateTime', key: 'updateTime', width: 150, render: (v: any) => v ? formatDateTime(v) : '-' },
    {
      title: '操作', key: 'action', width: 160,
      render: (_: any, record: StyleInfo) => {
        const descAction = canManage
          ? ((record as any).descriptionLocked === 0
            ? { key: 'edit', label: (record as any).descriptionReturnComment ? '继续处理' : '编辑', title: (record as any).descriptionReturnComment ? '继续处理制单描述' : '编辑制单描述', onClick: () => openEditModal(record) }
            : { key: 'rollback', label: '退回', title: '退回后可重新编辑', onClick: () => { setReturnDescRecord(record); setReturnDescVisible(true); } })
          : null;
        const actions = [
          ...(descAction ? [descAction] : []),
          { key: 'view', label: '查看', title: '查看款式详情', onClick: () => { setDetailRecord(record); setDetailModalVisible(true); } },
          { key: 'download', label: '下载', title: '下载制单', onClick: () => downloadProductionSheet(record) },
        ];
        return (
          <RowActions maxInline={1} actions={actions} />
        );
      },
    }
  ], [canManage]);

  /* ── direct mode render: skip table, show form inline ── */
  if (styleNo) {
    if (loading && !directRow) return <div style={{ textAlign: 'center', padding: 24, color: 'rgba(0,0,0,0.45)' }}>加载中...</div>;
    if (!directRow && !loading) return <div style={{ textAlign: 'center', padding: 24, color: 'rgba(0,0,0,0.45)' }}>未找到该款号的数据</div>;
    if (!directRow) return <div style={{ textAlign: 'center', padding: 24, color: 'rgba(0,0,0,0.45)' }}>加载中...</div>;
    if (!canManage) {
      return (
        <div style={directCardStyle}>
          {renderProductionSummary(directRow)}
          <div style={directFieldLabelStyle}>生产要求 / 制单描述</div>
          <Input.TextArea value={String((directRow as any).description || '')} autoSize={{ minRows: 10, maxRows: 16 }} readOnly />
          <div style={{ ...directMetaStyle, marginTop: 10 }}>当前账号仅可查看制单内容，不能直接编辑或退回。</div>
        </div>
      );
    }
    if (directLocked) {
      return (
        <div style={directStackStyle}>
          <div style={directCardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              <span style={directTitleStyle}>已锁定，退回后直接编辑</span>
              <span style={directMetaStyle}>制单维护</span>
            </div>
            <div style={{ ...directMetaStyle, marginBottom: 8 }}>退回原因填在这里，下面保留当前制单内容预览。</div>
            {(directRow as any).descriptionReturnComment ? (
              <div style={{ ...directMetaStyle, marginBottom: 8 }}>上次退回 {(directRow as any).descriptionReturnComment}（{(directRow as any).descriptionReturnBy || '系统'}）</div>
            ) : null}
            <Form form={returnDescForm} layout="vertical">
              <div style={directFieldLabelStyle}>退回原因</div>
              <Form.Item name="reason" rules={[{ required: true, message: '请填写退回原因' }]} style={{ marginBottom: 8 }}>
                <TextArea autoSize={{ minRows: 2, maxRows: 4 }} placeholder="请说明制单退回原因" />
              </Form.Item>
            </Form>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button danger type="default" size="small" loading={returnDescSaving} onClick={handleReturnDescSave} style={{ background: '#fff', color: '#ff4d4f', borderColor: '#ff4d4f' }}>确认退回</Button>
            </div>
          </div>
          <div style={directCardStyle}>
            {renderProductionSummary(directRow)}
            <div style={directFieldLabelStyle}>生产要求 / 制单描述</div>
            <Input.TextArea value={String((directRow as any).description || '')} autoSize={{ minRows: 10, maxRows: 16 }} readOnly />
          </div>
        </div>
      );
    }
    return (
      <div style={directCardStyle}>
        {directProcessing ? (
          <div style={processingBannerStyle}>
            <div style={{ ...directTitleStyle, color: '#d46b08' }}>处理中</div>
            <div style={{ ...directMetaStyle, color: '#ad6800' }}>制单内容已退回，当前还没有重新保存提交，保存后会结束这次处理。</div>
          </div>
        ) : null}
        {renderProductionSummary(directRow)}
        <Form form={editForm} layout="vertical">
          <div style={directFieldLabelStyle}>生产要求 / 制单描述</div>
          <Form.Item name="description" style={{ marginBottom: 0 }}>
            <TextArea autoSize={{ minRows: 10, maxRows: 16 }} placeholder={'请输入生产要求和制单描述信息\n示例：\n1. 面料：主面料用32支全棉平纹\n2. 颜色：藏蓝色（潘通色号19-4024）\n3. 缝制要求：1/4″四线包缝'} />
          </Form.Item>
        </Form>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10, gap: 8 }}>
          <Button size="small" loading={cancelLocking} onClick={async () => {
            if (!directRow?.id) return;
            setCancelLocking(true);
            try {
              await api.post(`/style/info/${directRow.id}/production-requirements/lock`);
              await fetchStyles();
            } catch (error: unknown) {
              message.error(getErrorMessage(error, '取消修改失败'));
            } finally {
              setCancelLocking(false);
            }
          }}>取消修改</Button>
          <Button type="primary" size="small" loading={editSaving} onClick={handleEditSave}>保存</Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <PageStatCards cards={[
        { key: 'style', items: { label: '款式数量', value: stats.styleCount } },
        { key: 'material', items: { label: '面料数量', value: stats.materialCount } },
        { key: 'production', items: { label: '生产单量', value: stats.productionCount } },
      ]} />

      <Card size="small" className="filter-card" style={{ marginBottom: 16 }}>
        <StandardToolbar
          left={<Space wrap>
            <Input placeholder="款号" style={{ width: 180 }} onChange={(e) => setQueryParams(prev => ({ ...prev, styleNo: e.target.value, page: 1 }))} />
            <Input placeholder="款名" style={{ width: 220 }} onChange={(e) => setQueryParams(prev => ({ ...prev, styleName: e.target.value, page: 1 }))} />
          </Space>}
          right={<Button onClick={() => fetchStyles()} loading={loading}>刷新</Button>}
        />
      </Card>

      <ResizableTable rowKey={(r) => String((r as any).id ?? r.styleNo)} columns={columns as any} dataSource={styles} loading={loading}
        pagination={{ current: queryParams.page, pageSize: queryParams.pageSize, total, showTotal: (t) => `共 ${t} 条`, showSizeChanger: true, pageSizeOptions: ['10', '20', '50', '100'],
          onChange: (page, pageSize) => setQueryParams(prev => ({ ...prev, page, pageSize })) }} />

      {/* 编辑制单描述弹窗 */}
      <ResizableModal open={editModalVisible} title={`编辑制单 - ${editingRecord?.styleNo || ''}`} width="40vw"
        onCancel={() => { setEditModalVisible(false); editForm.resetFields(); }}
        footer={<Space><Button onClick={() => { setEditModalVisible(false); editForm.resetFields(); }}>取消</Button><Button type="primary" loading={editSaving} onClick={handleEditSave}>保存</Button></Space>}>
        <Form form={editForm} layout="vertical">
          <Form.Item name="description" label="生产要求/制单描述">
            <TextArea rows={15} placeholder="请输入生产要求和制单描述信息&#10;示例：&#10;1. 面料：主面料用32支全棉平纹&#10;2. 颜色：藏蓝色（潘通色号19-4024）&#10;3. 缝制要求：1/4″四线包缝" />
          </Form.Item>
        </Form>
      </ResizableModal>

      {/* 退回制单弹窗 */}
      <SmallModal open={returnDescVisible} title={`退回制单 - ${returnDescRecord?.styleNo || ''}`}
        onCancel={() => { setReturnDescVisible(false); returnDescForm.resetFields(); }}
        footer={<Space><Button onClick={() => { setReturnDescVisible(false); returnDescForm.resetFields(); }}>取消</Button><Button danger loading={returnDescSaving} onClick={handleReturnDescSave}>确认退回</Button></Space>}>
        {returnDescRecord?.descriptionReturnComment && (
          <div style={{ marginBottom: 12, padding: '8px 12px', background: '#fff7e6', border: '1px solid #ffd591', borderRadius: 4, fontSize: 13 }}>
            上次退回：{returnDescRecord.descriptionReturnComment}（{(returnDescRecord as any).descriptionReturnBy}）
          </div>
        )}
        <Form form={returnDescForm} layout="vertical">
          <Form.Item name="reason" label="退回原因" rules={[{ required: true, message: '请填写退回原因' }]}>
            <TextArea rows={4} placeholder="请说明制单退回原因" />
          </Form.Item>
        </Form>
      </SmallModal>

      {/* 详情弹窗 */}
      <ResizableModal open={detailModalVisible} title={`款式详情 - ${detailRecord?.styleNo || ''}`} width="60vw" initialHeight={Math.round(window.innerHeight * 0.82)}
        onCancel={() => setDetailModalVisible(false)} footer={<Button onClick={() => setDetailModalVisible(false)}>关闭</Button>}>
        {detailRecord && (
          <div>
            <Row gutter={24}>
              <Col span={8}>
                {(detailRecord as any).cover ? (
                  <Image src={getFullAuthedFileUrl((detailRecord as any).cover)} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 8 }} />
                ) : (
                  <div style={{ width: '100%', aspectRatio: '1', background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8 }}>暂无封面</div>
                )}
              </Col>
              <Col span={16}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', fontSize: 14 }}>
                  <div><strong>款号：</strong>{detailRecord.styleNo}</div>
                  <div><strong>款名：</strong>{detailRecord.styleName}</div>
                  <div><strong>品类：</strong>{toCategoryCn((detailRecord as any).category)}</div>
                  <div><strong>推送人：</strong>{(detailRecord as any).productionAssignee || '-'}</div>
                  <div><strong>推送时间：</strong>{(detailRecord as any).productionCompletedTime ? formatDateTime((detailRecord as any).productionCompletedTime) : '-'}</div>
                  <div><strong>维护人：</strong>{(detailRecord as any).updateBy || '-'}</div>
                </div>
                <div style={{ marginTop: 16 }}>
                  <strong>生产要求：</strong>
                  <div style={{ whiteSpace: 'pre-wrap', marginTop: 8, padding: '8px 12px', background: '#fafafa', borderRadius: 4, maxHeight: 200, overflowY: 'auto' }}>
                    {(detailRecord as any).description || '暂无'}
                  </div>
                </div>
              </Col>
            </Row>
          </div>
        )}
      </ResizableModal>
    </>
  );
};

export default ProductionSheetPanel;
