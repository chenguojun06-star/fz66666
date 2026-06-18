import React, { useCallback, useEffect, useState } from 'react';
import {
  Button, Card, Input, Select, Form, Row, Col, InputNumber, Image, Tag,
  Modal, Space, message as antdMessage, Popconfirm, Avatar,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined,
  FileTextOutlined, EyeOutlined, AppstoreAddOutlined,
} from '@ant-design/icons';
import ImageUploadBox from '@/components/common/ImageUploadBox';
import SupplierSelect from '@/components/common/SupplierSelect';
import api from '@/utils/api';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import { getMaterialTypeLabel } from '@/utils/materialType';

interface MaterialColorCardItem {
  id?: string;
  materialColorCardId?: string;
  materialId?: string;
  materialCode?: string;
  materialName: string;
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
  sortOrder?: number;
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

const MaterialColorCardPage: React.FC = () => {
  const [dataList, setDataList] = useState<MaterialColorCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [materialType, setMaterialType] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [total, setTotal] = useState(0);

  // 母卡新建/编辑弹窗
  const [dialogVisible, setDialogVisible] = useState(false);
  const [currentCard, setCurrentCard] = useState<MaterialColorCard | null>(null);
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [coverImageFiles, setCoverImageFiles] = useState<any[]>([]);

  // 物料管理弹窗
  const [itemVisible, setItemVisible] = useState(false);
  const [currentItems, setCurrentItems] = useState<MaterialColorCardItem[]>([]);
  const [currentCardId, setCurrentCardId] = useState<string>('');
  const [currentCardName, setCurrentCardName] = useState<string>('');

  // ==================== 列表加载 ====================
  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { keyword, page, pageSize };
      if (materialType) params.materialType = materialType;
      const res = await api.get<{ code: number; data: any; message?: string }>(
        '/material-color-card/list', { params },
      );
      if (res.code === 200) {
        setDataList(res.data?.records || []);
        setTotal(res.data?.total || 0);
      }
    } catch (err: any) {
      antdMessage.error(err?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, [keyword, materialType, page, pageSize]);

  useEffect(() => { fetchList(); }, [fetchList]);

  // ==================== 母卡 CRUD ====================
  const openCreateDialog = async () => {
    setCurrentCard(null);
    form.resetFields();
    setCoverImageFiles([]);
    try {
      const res = await api.get<{ code: number; data: string }>('/material-color-card/generate-code');
      if (res.code === 200 && res.data) {
        form.setFieldsValue({ cardCode: res.data, materialType: 'fabric' });
      }
    } catch {}
    setDialogVisible(true);
  };

  const openEditDialog = (card: MaterialColorCard) => {
    setCurrentCard(card);
    setCoverImageFiles(card.coverImage ? [{ url: card.coverImage }] : []);
    form.setFieldsValue({
      cardCode: card.cardCode,
      cardName: card.cardName,
      materialType: card.materialType || 'fabric',
      fabricWidth: card.fabricWidth,
      specifications: card.specifications,
      fabricWeight: card.fabricWeight,
      fabricComposition: card.fabricComposition,
      unit: card.unit,
      supplierId: card.supplierId,
      supplierName: card.supplierName,
      supplierContactPerson: card.supplierContactPerson,
      supplierContactPhone: card.supplierContactPhone,
      coverImage: card.coverImage,
      remark: card.remark,
    });
    setDialogVisible(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      if (coverImageFiles.length > 0) {
        values.coverImage = (coverImageFiles[0] as any)?.url || '';
      }
      if (currentCard?.id) {
        await api.put('/material-color-card', { id: currentCard.id, ...values });
        antdMessage.success('更新成功');
      } else {
        await api.post('/material-color-card', values);
        antdMessage.success('创建成功');
      }
      setDialogVisible(false);
      fetchList();
    } catch (err: any) {
      if (err?.errorFields) return;
      antdMessage.error(err?.message || '保存失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/material-color-card/${id}`);
      antdMessage.success('删除成功');
      fetchList();
    } catch (err: any) {
      antdMessage.error(err?.message || '删除失败');
    }
  };

  // ==================== 物料条目管理 ====================
  const openItemsDialog = async (card: MaterialColorCard) => {
    setCurrentCardId(card.id);
    setCurrentCardName(card.cardName);
    try {
      const res = await api.get<{ code: number; data: any }>(`/material-color-card/${card.id}`);
      if (res.code === 200) {
        setCurrentItems(res.data?.items || []);
      } else {
        setCurrentItems([]);
      }
    } catch {
      setCurrentItems([]);
    }
    setItemVisible(true);
  };

  const addEmptyItem = () => {
    const next: MaterialColorCardItem = {
      materialCode: '',
      materialName: '',
      materialType: currentCard?.materialType || 'fabric',
      unitPrice: undefined,
      image: '',
      remark: '',
      sortOrder: currentItems.length,
    };
    setCurrentItems([...currentItems, next]);
  };

  const updateItem = (idx: number, field: keyof MaterialColorCardItem, value: any) => {
    const next = [...currentItems];
    (next[idx] as any)[field] = value;
    setCurrentItems(next);
  };

  const removeItem = (idx: number) => {
    const next = [...currentItems];
    next.splice(idx, 1);
    setCurrentItems(next);
  };

  const saveItems = async () => {
    if (!currentCardId) return;
    const validItems = currentItems.filter((it) => it.materialName);
    if (validItems.length === 0) {
      antdMessage.warning('至少填写一条物料');
      return;
    }
    try {
      await api.post(`/material-color-card/${currentCardId}/items/batch`, { items: validItems });
      antdMessage.success(`已保存 ${validItems.length} 条物料`);
      setItemVisible(false);
      fetchList();
    } catch (err: any) {
      antdMessage.error(err?.message || '保存失败');
    }
  };

  // ==================== 生成物料到物料库 ====================
  const handleGenerateMaterials = async (card: MaterialColorCard) => {
    try {
      const res = await api.post<{ code: number; data: string[]; message?: string }>(
        `/material-color-card/${card.id}/generate-materials`,
      );
      if (res.code === 200) {
        antdMessage.success(`成功生成 ${res.data.length} 条物料到物料资料`);
      }
    } catch (err: any) {
      antdMessage.error(err?.message || '生成失败');
    }
  };

  // ==================== 渲染 ====================
  const renderCard = (card: MaterialColorCard) => (
    <Card
      key={card.id}
      hoverable
      style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
      bodyStyle={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 0 }}
      styles={{ body: { flex: 1, display: 'flex', flexDirection: 'column', padding: 0 } }}
      title={
        <div style={{ padding: '0 16px' }}>
          <div style={{
            fontWeight: 600, fontSize: 14,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }} title={card.cardName}>
            {card.cardName}
          </div>
          <div style={{ color: '#8c8c8c', fontSize: 12 }}>{card.cardCode}</div>
        </div>
      }
      extra={
        <Space size={4} style={{ marginRight: 12 }}>
          <Button size="small" type="link" icon={<EditOutlined />} onClick={() => openEditDialog(card)} />
          <Popconfirm title="确认删除？" onConfirm={() => handleDelete(card.id)} okText="确认" cancelText="取消">
            <Button size="small" type="link" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      }
    >
      <div style={{ padding: '12px 16px 16px 16px', flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* 封面图 + 供应商信息 */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
          {/* 封面缩略图 */}
          {card.coverImage ? (
            <Image
              src={getFullAuthedFileUrl(card.coverImage)}
              width={96}
              height={96}
              style={{ objectFit: 'cover', borderRadius: 8, flexShrink: 0, border: '1px solid #f0f0f0' }}
              preview
            />
          ) : (
            <div style={{
              width: 96, height: 96, flexShrink: 0,
              borderRadius: 8, border: '1px dashed #e5e7eb',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: '#f8fafc', color: '#94a3b8',
            }}>
              <FileTextOutlined style={{ fontSize: 28 }} />
            </div>
          )}

          {/* 右侧信息 */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: '#595959', fontSize: 13, marginBottom: 6 }}>
              <span style={{ color: '#8c8c8c' }}>供应商：</span>
              <span style={{ fontWeight: 500 }}>{card.supplierName || '-'}</span>
            </div>
            {card.supplierContactPerson && (
              <div style={{ color: '#595959', fontSize: 12, marginBottom: 4 }}>
                <span style={{ color: '#8c8c8c' }}>联系人：</span>{card.supplierContactPerson}
                {card.supplierContactPhone && <span> · {card.supplierContactPhone}</span>}
              </div>
            )}
            <Tag color="blue" style={{ marginTop: 4 }}>{getMaterialTypeLabel(card.materialType)}</Tag>
            <Tag color={card.materialCount && card.materialCount > 0 ? 'green' : 'default'} style={{ marginTop: 4 }}>
              {card.materialCount || 0} 条物料
            </Tag>
          </div>
        </div>

        {/* 物料属性概览 */}
        {(card.fabricWidth || card.fabricWeight || card.specifications || card.fabricComposition) && (
          <div style={{
            padding: 10, background: '#fafafa', borderRadius: 6, marginBottom: 12,
            fontSize: 12, color: '#595959',
          }}>
            <Row gutter={[8, 6]}>
              {card.fabricWidth && <Col xs={12} sm={12}>幅宽：{card.fabricWidth}</Col>}
              {card.fabricWeight && <Col xs={12} sm={12}>克重：{card.fabricWeight}</Col>}
              {card.specifications && <Col xs={12} sm={12}>规格：{card.specifications}</Col>}
              {card.fabricComposition && (
                <Col xs={24} sm={24}>成分：{card.fabricComposition}</Col>
              )}
            </Row>
          </div>
        )}

        {/* 操作按钮 */}
        <div style={{ marginTop: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ color: '#8c8c8c', fontSize: 12 }}>创建：{card.createTime?.slice(0, 10)}</span>
          </div>

          <Space size={8} wrap>
            <Button size="small" type="primary" icon={<AppstoreAddOutlined />} onClick={() => openItemsDialog(card)}>
              物料管理
            </Button>
            <Button size="small" icon={<EyeOutlined />} onClick={() => handleGenerateMaterials(card)}>
              生成到物料资料
            </Button>
          </Space>

          {card.remark && (
            <div style={{
              marginTop: 10, padding: 8, background: '#fffbe6', borderRadius: 4,
              fontSize: 12, color: '#874d00',
            }}>
              备注：{card.remark}
            </div>
          )}
        </div>
      </div>
    </Card>
  );

  return (
    <>
      {/* 搜索工具栏 */}
      <Card style={{ marginBottom: 12, background: 'var(--color-bg-container)' }}>
        <Space.Compact style={{ width: '100%', display: 'flex' }}>
          <Input placeholder="搜索色卡编号/名称/供应商" value={keyword}
            onChange={(e) => setKeyword(e.target.value)} style={{ maxWidth: 280 }} allowClear />
          <Select placeholder="物料类型" value={materialType || undefined} onChange={setMaterialType}
            style={{ width: 140 }} allowClear>
            {MATERIAL_TYPE_OPTIONS.map((o) => (
              <Select.Option key={o.value} value={o.value}>{o.label}</Select.Option>
            ))}
          </Select>
          <Button icon={<ReloadOutlined />} onClick={fetchList}>刷新</Button>
          <div style={{ flexGrow: 1 }} />
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreateDialog}>新建物料色卡</Button>
        </Space.Compact>
      </Card>

      {/* 卡片网格 */}
      {dataList.length === 0 && !loading ? (
        <Card style={{ textAlign: 'center', padding: '60px 0', color: '#8c8c8c' }}>
          <FileTextOutlined style={{ fontSize: 48, marginBottom: 12 }} />
          <div>暂无物料色卡，点击右上角"新建物料色卡"开始创建</div>
        </Card>
      ) : (
        <Row gutter={[16, 16]}>
          {dataList.map((card) => (
            <Col xs={24} sm={24} md={12} lg={8} xl={6} key={card.id}>
              {renderCard(card)}
            </Col>
          ))}
        </Row>
      )}

      {/* 分页 */}
      {total > pageSize && (
        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <Space>
            <Button disabled={page <= 1} onClick={() => setPage(page - 1)}>上一页</Button>
            <span>第 {page} 页 / 共 {Math.ceil(total / pageSize)} 页</span>
            <Button disabled={page >= Math.ceil(total / pageSize)} onClick={() => setPage(page + 1)}>下一页</Button>
            <Select value={pageSize} onChange={(v) => { setPageSize(v as number); setPage(1); }}
              style={{ width: 110 }}>
              <Select.Option value={12}>12/页</Select.Option>
              <Select.Option value={24}>24/页</Select.Option>
              <Select.Option value={48}>48/页</Select.Option>
            </Select>
          </Space>
        </div>
      )}

      {/* ===== 母卡新建/编辑弹窗 ===== */}
      <Modal
        title={currentCard?.id ? '编辑物料色卡' : '新建物料色卡'}
        open={dialogVisible}
        onCancel={() => setDialogVisible(false)}
        onOk={handleSave}
        width={800}
        okText="保存"
        cancelText="取消"
        confirmLoading={submitting}
      >
        <Form form={form} layout="vertical" size="middle">
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
          <Form.Item name="coverImage" label="封面图片">
            <ImageUploadBox
              value={coverImageFiles.length > 0 ? (coverImageFiles[0] as any)?.url : null}
              onChange={(url) => setCoverImageFiles(url ? [{ url }] : [])}
              uploadFn={async (file: File) => {
                const formData = new FormData();
                formData.append('file', file);
                const res = await api.post<{ code: number; data: string }>(
                  '/common/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } },
                );
                if (res.code !== 200 || !res.data) throw new Error('上传失败');
                return res.data;
              }}
              size={120}
              label="封面图片"
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
            <Form.Item noStyle shouldUpdate={(prev, curr) => prev.supplierId !== curr.supplierId}>
              {({ getFieldValue }) => (
                <SupplierSelect
                  placeholder="请选择供应商"
                  value={getFieldValue('supplierName')}
                  onChange={(value, option) => {
                    form.setFieldsValue({
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
              <Form.Item name="supplierContactPerson" label="联系人">
                <Input placeholder="自动填充" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="supplierContactPhone" label="联系电话">
                <Input placeholder="自动填充" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="remark" label="备注">
            <Input.TextArea placeholder="备注信息" autoSize={{ minRows: 2, maxRows: 4 }} />
          </Form.Item>
        </Form>
      </Modal>

      {/* ===== 物料管理弹窗 ===== */}
      <Modal
        title={<Space><AppstoreAddOutlined /> {currentCardName} - 物料管理</Space>}
        open={itemVisible}
        onCancel={() => setItemVisible(false)}
        width={960}
        footer={[
          <Button key="close" onClick={() => setItemVisible(false)}>关闭</Button>,
          <Button key="save" type="primary" onClick={saveItems}>保存全部</Button>,
        ]}
      >
        <Space style={{ marginBottom: 12 }}>
          <Button type="primary" icon={<PlusOutlined />} onClick={addEmptyItem}>+ 添加物料</Button>
          <span style={{ color: '#888' }}>共 {currentItems.length} 条</span>
        </Space>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 500, overflowY: 'auto' }}>
          {currentItems.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>
              暂无物料条目，点击"添加物料"开始添加
            </div>
          )}
          {currentItems.map((item, idx) => (
            <Card key={idx} size="small" style={{ border: '1px solid #eee' }}>
              <Row gutter={[8, 8]} align="middle">
                <Col xs={24} sm={1}>
                  <Tag color="blue">#{idx + 1}</Tag>
                </Col>
                <Col xs={24} sm={3}>
                  <Input placeholder="物料编号" value={item.materialCode || ''}
                    onChange={(e) => updateItem(idx, 'materialCode', e.target.value)} size="small" />
                </Col>
                <Col xs={24} sm={4}>
                  <Input placeholder="物料名称*" value={item.materialName || ''}
                    onChange={(e) => updateItem(idx, 'materialName', e.target.value)} size="small" />
                </Col>
                <Col xs={24} sm={3}>
                  <Input placeholder="颜色" value={item.color || ''}
                    onChange={(e) => updateItem(idx, 'color', e.target.value)} size="small" />
                </Col>
                <Col xs={24} sm={3}>
                  <InputNumber placeholder="单价" value={item.unitPrice}
                    onChange={(v) => updateItem(idx, 'unitPrice', v)}
                    min={0} step={0.01} style={{ width: '100%' }} size="small" />
                </Col>
                <Col xs={24} sm={3}>
                  <Select placeholder="物料类型" value={item.materialType || undefined}
                    onChange={(v) => updateItem(idx, 'materialType', v)} size="small" style={{ width: '100%' }}>
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
                      const file: File = await new Promise((resolve, reject) => {
                        input.onchange = (ev: any) => resolve(ev.target.files[0]);
                        input.click();
                      });
                      try {
                        const formData = new FormData();
                        formData.append('file', file);
                        const res = await api.post<{ code: number; data: string }>(
                          '/common/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } },
                        );
                        if (res.code === 200) updateItem(idx, 'image', res.data);
                      } catch {}
                    }}>上传图片</Button>
                    {item.image && (
                      <Image src={getFullAuthedFileUrl(item.image)} width={32} height={32}
                        style={{ objectFit: 'cover' }} preview />
                    )}
                  </Space.Compact>
                </Col>
                <Col xs={24} sm={1}>
                  <Button type="link" danger size="small" onClick={() => removeItem(idx)}>删除</Button>
                </Col>
              </Row>
            </Card>
          ))}
        </div>
      </Modal>
    </>
  );
};

export default MaterialColorCardPage;
