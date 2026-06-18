import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Button, Card, Input, Select, Form, Row, Col, InputNumber, Image, Tag,
  Modal, Space, message as antdMessage, Popconfirm, Table, Checkbox,
} from 'antd';
import {
  PlusOutlined, CameraOutlined, EditOutlined, DeleteOutlined,
  ReloadOutlined, ShareAltOutlined, FileImageOutlined, EyeOutlined,
} from '@ant-design/icons';
import ResizableTable from '@/components/common/ResizableTable';
import ImageUploadBox from '@/components/common/ImageUploadBox';
import SupplierSelect from '@/components/common/SupplierSelect';
import api from '@/utils/api';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import { getMaterialTypeLabel } from '@/utils/materialType';

interface ColorCardItem {
  id?: string;
  colorCardId?: string;
  colorNo: string;
  colorName?: string;
  unitPrice?: number;
  image?: string;
  remark?: string;
  sortOrder?: number;
}

interface ColorCard {
  id: string;
  colorCardCode: string;
  colorCardName: string;
  materialType?: string;
  fabricWidth?: string;
  specifications?: string;
  fabricWeight?: string;
  fabricComposition?: string;
  unit?: string;
  supplierId?: string;
  supplierName?: string;
  supplierContactPerson?: string;
  supplierContactPhone?: string;
  image?: string;
  remark?: string;
  status?: string;
  colorCount?: number;
  createTime?: string;
}

const MATERIAL_TYPE_OPTIONS = [
  { label: '面料', value: 'fabric' },
  { label: '里料', value: 'lining' },
  { label: '辅料', value: 'accessory' },
];

const ColorCardPage: React.FC = () => {
  const [dataList, setDataList] = useState<ColorCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [materialType, setMaterialType] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);

  // ===== 色卡本弹窗 =====
  const [dialogVisible, setDialogVisible] = useState(false);
  const [currentCard, setCurrentCard] = useState<ColorCard | null>(null);
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [coverImageFiles, setCoverImageFiles] = useState<any[]>([]);

  // ===== 颜色管理弹窗 =====
  const [itemVisible, setItemVisible] = useState(false);
  const [currentItems, setCurrentItems] = useState<ColorCardItem[]>([]);
  const [currentCardId, setCurrentCardId] = useState<string>('');
  const [currentCardName, setCurrentCardName] = useState<string>('');

  // ===== 拍照识别 =====
  const [recognizeVisible, setRecognizeVisible] = useState(false);
  const [recognizeImage, setRecognizeImage] = useState<string>('');
  const [recognizing, setRecognizing] = useState(false);

  // ===== 生成物料预览 =====
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewCard, setPreviewCard] = useState<ColorCard | null>(null);
  const [previewItems, setPreviewItems] = useState<ColorCardItem[]>([]);
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());

  // ===== 颜色编号递增 =====
  const nextColorNoRef = useRef<string>('');

  // ===== 上传图片 =====
  const uploadImage = useCallback(async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await api.post<{ code: number; data: string }>(
      '/common/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } },
    );
    if (res.code !== 200 || !res.data) throw new Error('上传失败');
    return res.data;
  }, []);

  // ===== 列表加载 =====
  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { keyword, page, pageSize };
      if (materialType) params.materialType = materialType;
      const res = await api.get<{ code: number; data: any; message?: string }>(
        '/color-card/list', { params },
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

  // ===== 色卡本 CRUD =====

  const openCreateDialog = async () => {
    setCurrentCard(null);
    form.resetFields();
    setCoverImageFiles([]);
    // 自动生成编号
    try {
      const res = await api.get<{ code: number; data: string }>('/color-card/generate-code');
      if (res.code === 200 && res.data) {
        form.setFieldsValue({ colorCardCode: res.data, materialType: 'fabric' });
      }
    } catch {}
    setDialogVisible(true);
  };

  const openEditDialog = (card: ColorCard) => {
    setCurrentCard(card);
    setCoverImageFiles(card.image ? [{ url: card.image }] : []);
    form.setFieldsValue({
      colorCardCode: card.colorCardCode,
      colorCardName: card.colorCardName,
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
      image: card.image,
      remark: card.remark,
    });
    setDialogVisible(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      // 获取封面图片URL
      if (coverImageFiles.length > 0) {
        values.image = (coverImageFiles[0] as any)?.url || '';
      }
      if (currentCard?.id) {
        await api.put('/color-card', { id: currentCard.id, ...values });
        antdMessage.success('更新成功');
      } else {
        await api.post('/color-card', values);
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
      await api.delete(`/color-card/${id}`);
      antdMessage.success('删除成功');
      fetchList();
    } catch (err: any) {
      antdMessage.error(err?.message || '删除失败');
    }
  };

  // ===== 颜色管理 =====

  const openItemsDialog = async (card: ColorCard) => {
    setCurrentCardId(card.id);
    setCurrentCardName(card.colorCardName);
    try {
      const res = await api.get<{ code: number; data: any }>(`/color-card/${card.id}`);
      if (res.code === 200) {
        const items = res.data?.items || [];
        setCurrentItems(items);
        // 计算下一个颜色编号
        if (items.length > 0) {
          const maxSeq = items.reduce((max, item) => {
            const m = item.colorNo?.match(/^C(\d+)$/);
            const seq = m ? parseInt(m[1]) : 0;
            return seq > max ? seq : max;
          }, 0);
          nextColorNoRef.current = 'C' + String(maxSeq + 1).padStart(3, '0');
        } else {
          nextColorNoRef.current = 'C001';
        }
      } else {
        setCurrentItems([]);
        nextColorNoRef.current = 'C001';
      }
    } catch {
      setCurrentItems([]);
      nextColorNoRef.current = 'C001';
    }
    setItemVisible(true);
  };

  const addEmptyItem = async () => {
    // 自动获取下一个颜色编号
    if (!nextColorNoRef.current) {
      try {
        const res = await api.get<{ code: number; data: string }>(
          `/color-card/${currentCardId}/generate-color-no`,
        );
        if (res.code === 200) nextColorNoRef.current = res.data;
      } catch {
        nextColorNoRef.current = 'C' + String(currentItems.length + 1).padStart(3, '0');
      }
    }
    const next: ColorCardItem = {
      colorNo: nextColorNoRef.current,
      colorName: '',
      unitPrice: undefined,
      image: '',
      remark: '',
      sortOrder: currentItems.length,
    };
    setCurrentItems([...currentItems, next]);
    // 递增编号
    const m = nextColorNoRef.current.match(/^C(\d+)$/);
    if (m) {
      nextColorNoRef.current = 'C' + String(parseInt(m[1]) + 1).padStart(3, '0');
    }
  };

  const updateItem = (idx: number, field: keyof ColorCardItem, value: any) => {
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
    const validItems = currentItems.filter(it => it.colorNo || it.colorName);
    if (validItems.length === 0) {
      antdMessage.warning('至少填写一条颜色');
      return;
    }
    try {
      await api.post(`/color-card/${currentCardId}/items/batch`, { items: validItems });
      antdMessage.success(`已保存 ${validItems.length} 条颜色`);
      setItemVisible(false);
      fetchList();
    } catch (err: any) {
      antdMessage.error(err?.message || '保存失败');
    }
  };

  // ===== 拍照识别 =====

  const openRecognize = (card: ColorCard) => {
    setCurrentCardId(card.id);
    setCurrentCardName(card.colorCardName);
    setRecognizeImage('');
    setRecognizeVisible(true);
  };

  const onPickImage: any = (e: any) => {
    const file = e.target?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const url = await uploadImage(file);
        setRecognizeImage(url);
      } catch {
        antdMessage.warning('上传失败');
      }
    };
    reader.readAsDataURL(file);
  };

  const runRecognition = async () => {
    if (!recognizeImage) {
      antdMessage.warning('请先上传色卡图片');
      return;
    }
    setRecognizing(true);
    try {
      const res = await api.post<{ code: number; data: any; message?: string }>(
        '/material/database/recognize-color-card', { imageUrl: recognizeImage },
      );
      if (res.code === 200 && res.data && res.data.success) {
        const data = res.data;
        const colorName = data?.color?.textValue || data?.color?.rawText || '';
        if (colorName) {
          antdMessage.success(`识别到颜色：${colorName}`);
          setRecognizeVisible(false);
          // 自动添加识别到的颜色
          if (!itemVisible) {
            setCurrentCardId(previewCard?.id || '');
            setCurrentCardName(previewCard?.colorCardName || '');
            setCurrentItems([]);
          }
          const newItem: ColorCardItem = {
            colorNo: nextColorNoRef.current || 'C001',
            colorName,
            unitPrice: data?.unitPrice?.numberValue,
            image: data?.imageUrl || '',
            remark: data?.aiHint || '',
          };
          setCurrentItems(prev => [...prev, newItem]);
          setItemVisible(true);
        } else {
          antdMessage.info('未识别到明确的颜色信息，请手动添加');
        }
      } else {
        antdMessage.warning(res.data?.errorMessage || '识别失败');
      }
    } catch (err: any) {
      antdMessage.error(err?.message || '识别失败');
    } finally {
      setRecognizing(false);
    }
  };

  // ===== 生成物料预览 =====

  const openPreview = async (card: ColorCard) => {
    setPreviewCard(card);
    try {
      const res = await api.get<{ code: number; data: any }>(`/color-card/${card.id}`);
      if (res.code === 200) {
        setPreviewItems(res.data?.items || []);
        // 默认全选
        setSelectedItems(new Set((res.data?.items || []).map((_: any, i: number) => i)));
      } else {
        setPreviewItems([]);
      }
    } catch {
      setPreviewItems([]);
    }
    setPreviewVisible(true);
  };

  const confirmGenerate = async () => {
    if (!previewCard || selectedItems.size === 0) {
      antdMessage.warning('请选择要生成的颜色');
      return;
    }
    try {
      const itemsToGenerate = selectedItems.size === previewItems.length
        ? null  // null 表示全部
        : previewItems.filter((_, i) => selectedItems.has(i));
      const res = await api.post<{ code: number; data: string[]; message?: string }>(
        `/color-card/${previewCard.id}/generate-materials`, { items: itemsToGenerate },
      );
      if (res.code === 200) {
        antdMessage.success(`成功生成 ${res.data.length} 条物料记录`);
        setPreviewVisible(false);
        fetchList();
      }
    } catch (err: any) {
      antdMessage.error(err?.message || '生成失败');
    }
  };

  const toggleSelect = (idx: number) => {
    const next = new Set(selectedItems);
    if (next.has(idx)) next.delete(idx);
    else next.add(idx);
    setSelectedItems(next);
  };

  // ===== 表格列 =====
  const columns = [
    { title: '色卡本编号', dataIndex: 'colorCardCode', width: 140, fixed: 'left' as const },
    { title: '色卡本名称', dataIndex: 'colorCardName', width: 180 },
    { title: '物料类型', dataIndex: 'materialType', width: 90,
      render: (v: string) => getMaterialTypeLabel(v) },
    { title: '幅宽', dataIndex: 'fabricWidth', width: 90 },
    { title: '规格', dataIndex: 'specifications', width: 110 },
    { title: '供应商', dataIndex: 'supplierName', width: 150 },
    { title: '颜色数量', dataIndex: 'colorCount', width: 90,
      render: (v: number) => <Tag color={v > 0 ? 'blue' : 'default'}>{v || 0}</Tag> },
    { title: '创建时间', dataIndex: 'createTime', width: 160 },
    { title: '操作', dataIndex: 'op', width: 340, fixed: 'right' as const,
      render: (_: any, r: ColorCard) => (
        <Space size="small" wrap>
          <Button size="small" type="link" icon={<EditOutlined />} onClick={() => openEditDialog(r)}>编辑</Button>
          <Button size="small" type="link" onClick={() => openItemsDialog(r)}>颜色管理</Button>
          <Button size="small" type="link" icon={<CameraOutlined />} onClick={() => openRecognize(r)}>拍照识别</Button>
          <Button size="small" type="link" icon={<EyeOutlined />} onClick={() => openPreview(r)}>生成物料</Button>
          <Popconfirm title="确认删除？" onConfirm={() => handleDelete(r.id)} okText="确认" cancelText="取消">
            <Button size="small" type="link" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const previewColumns = [
    { title: '', key: 'select', width: 50,
      render: (_: any, __: any, idx: number) => (
        <Checkbox checked={selectedItems.has(idx)} onChange={() => toggleSelect(idx)} />
      )},
    { title: '颜色编号', dataIndex: 'colorNo', width: 100 },
    { title: '颜色名称', dataIndex: 'colorName', width: 150 },
    { title: '单价', dataIndex: 'unitPrice', width: 100 },
    { title: '图片', dataIndex: 'image', width: 80,
      render: (v: string) => v ? <Image src={getFullAuthedFileUrl(v)} width={40} height={40} style={{objectFit:'cover'}} /> : '-' },
  ];

  return (
    <>
      <Card style={{ marginBottom: 12, background: 'var(--color-bg-container)' }}>
        <Space.Compact style={{ width: '100%', display: 'flex' }}>
          <Input placeholder="搜索色卡本编号/名称/供应商" value={keyword}
            onChange={(e) => setKeyword(e.target.value)} style={{ maxWidth: 280 }} allowClear />
          <Select placeholder="物料类型" value={materialType || undefined} onChange={setMaterialType}
            style={{ width: 140 }} allowClear>
            {MATERIAL_TYPE_OPTIONS.map(o => (
              <Select.Option key={o.value} value={o.value}>{o.label}</Select.Option>
            ))}
          </Select>
          <Button icon={<ReloadOutlined />} onClick={fetchList}>刷新</Button>
          <div style={{ flexGrow: 1 }} />
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreateDialog}>新建色卡本</Button>
        </Space.Compact>
      </Card>

      <ResizableTable<ColorCard>
        columns={columns}
        dataSource={dataList}
        rowKey={(r: ColorCard) => String(r.id)}
        loading={loading}
        scroll={{ x: 1200 }}
        pagination={{
          current: page, pageSize, total,
          showSizeChanger: true,
          showTotal: (t) => `共 ${t} 本色卡本`,
          onChange: (p, ps) => { setPage(p); setPageSize(ps); },
        }}
      />

      {/* ===== 色卡本新建/编辑弹窗 ===== */}
      <Modal
        title={currentCard?.id ? '编辑色卡本' : '新建色卡本'}
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
              <Form.Item name="colorCardCode" label="色卡本编号" rules={[{ required: true, message: '请输入编号' }]}>
                <Input placeholder="自动生成或手动输入" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="colorCardName" label="色卡本名称" rules={[{ required: true, message: '请输入' }]}>
                <Input placeholder="如 纯棉春夏季色卡" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="materialType" label="物料类型" rules={[{ required: true, message: '请选择' }]}>
                <Select placeholder="请选择">
                  {MATERIAL_TYPE_OPTIONS.map(o => (
                    <Select.Option key={o.value} value={o.value}>{o.label}</Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>

          {/* 封面图片 */}
          <Form.Item name="image" label="色卡本封面图片">
            <ImageUploadBox
              value={coverImageFiles.length > 0 ? (coverImageFiles[0] as any)?.url : null}
              onChange={(url) => setCoverImageFiles(url ? [{ url }] : [])}
              uploadFn={uploadImage}
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
            <Col xs={24} sm={8}>
              <Form.Item name="fabricComposition" label="成分"><Input placeholder="如 100%棉" /></Form.Item>
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

      {/* ===== 颜色管理弹窗 ===== */}
      <Modal
        title={<Space><FileImageOutlined /> {currentCardName} - 颜色管理</Space>}
        open={itemVisible}
        onCancel={() => setItemVisible(false)}
        width={960}
        footer={[
          <Button key="close" onClick={() => setItemVisible(false)}>关闭</Button>,
          <Button key="save" type="primary" onClick={saveItems}>保存全部</Button>,
        ]}
      >
        <Space style={{ marginBottom: 12 }}>
          <Button type="primary" icon={<PlusOutlined />} onClick={addEmptyItem}>+ 添加颜色</Button>
          <Button icon={<CameraOutlined />} onClick={() => {
            setCurrentCardId(currentCardId);
            setRecognizeImage('');
            setRecognizeVisible(true);
          }}>拍照识别</Button>
          <span style={{ color: '#888' }}>共 {currentItems.length} 条 | 下一个编号：{nextColorNoRef.current}</span>
        </Space>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 500, overflowY: 'auto' }}>
          {currentItems.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>
              暂无颜色，点击"添加颜色"或"拍照识别"添加
            </div>
          )}
          {currentItems.map((item, idx) => (
            <Card key={idx} size="small" style={{ border: '1px solid #eee' }}>
              <Row gutter={8} align="middle">
                <Col xs={24} sm={2}>
                  <Tag color="blue">#{idx + 1}</Tag>
                </Col>
                <Col xs={24} sm={3}>
                  <Input placeholder="颜色编号 *" value={item.colorNo}
                    onChange={(e) => updateItem(idx, 'colorNo', e.target.value)} size="small" />
                </Col>
                <Col xs={24} sm={4}>
                  <Input placeholder="颜色名称" value={item.colorName || ''}
                    onChange={(e) => updateItem(idx, 'colorName', e.target.value)} size="small" />
                </Col>
                <Col xs={24} sm={3}>
                  <InputNumber placeholder="单价" value={item.unitPrice}
                    onChange={(v) => updateItem(idx, 'unitPrice', v)}
                    min={0} step={0.01} style={{ width: '100%' }} size="small" />
                </Col>
                <Col xs={24} sm={5}>
                  <Space.Compact>
                    <Button size="small" icon={<CameraOutlined />} onClick={() => {
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.accept = 'image/*';
                      input.onchange = async (e: any) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          try {
                            const url = await uploadImage(file);
                            updateItem(idx, 'image', url);
                          } catch { antdMessage.error('上传失败'); }
                        }
                      };
                      input.click();
                    }}>上传图片</Button>
                    {item.image && (
                      <Image src={getFullAuthedFileUrl(item.image)} width={32} height={32}
                        style={{ objectFit: 'cover' }} preview />
                    )}
                  </Space.Compact>
                </Col>
                <Col xs={24} sm={3}>
                  <Input placeholder="备注" value={item.remark || ''}
                    onChange={(e) => updateItem(idx, 'remark', e.target.value)} size="small" />
                </Col>
                <Col xs={24} sm={1}>
                  <Button type="link" danger size="small" onClick={() => removeItem(idx)}>删除</Button>
                </Col>
              </Row>
            </Card>
          ))}
        </div>
      </Modal>

      {/* ===== 拍照识别弹窗 ===== */}
      <Modal
        title="拍照识别色卡"
        open={recognizeVisible}
        onCancel={() => setRecognizeVisible(false)}
        footer={[
          <Button key="close" onClick={() => setRecognizeVisible(false)}>关闭</Button>,
          <Button key="ok" type="primary" loading={recognizing} onClick={runRecognition}>开始识别</Button>,
        ]}
        width={520}
      >
        <div style={{ textAlign: 'center' }}>
          {recognizeImage ? (
            <div style={{ marginBottom: 16 }}>
              <Image src={getFullAuthedFileUrl(recognizeImage)} width={240} height={240}
                style={{ objectFit: 'contain', borderRadius: 8 }} preview />
            </div>
          ) : (
            <div style={{ width: 240, height: 240, margin: '0 auto 16px',
              border: '2px dashed #d9d9d9', borderRadius: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>
              请选择色卡图片
            </div>
          )}
          <input type="file" accept="image/*" capture="environment" onChange={onPickImage}
            style={{ marginBottom: 12 }} />
          <div style={{ color: '#888', fontSize: 12, marginTop: 8 }}>
            上传后点击"开始识别"，AI 自动提取颜色信息并添加到颜色列表
          </div>
        </div>
      </Modal>

      {/* ===== 生成物料预览弹窗 ===== */}
      <Modal
        title={<Space><ShareAltOutlined /> 生成物料预览 - {previewCard?.colorCardName}</Space>}
        open={previewVisible}
        onCancel={() => setPreviewVisible(false)}
        width={700}
        footer={[
          <Button key="close" onClick={() => setPreviewVisible(false)}>取消</Button>,
          <Button key="generate" type="primary" onClick={confirmGenerate}
            disabled={selectedItems.size === 0}>
            确认生成 {selectedItems.size} 条物料
          </Button>,
        ]}
      >
        {previewCard && (
          <div style={{ marginBottom: 16, padding: 12, background: '#f5f5f5', borderRadius: 8 }}>
            <Space split={<span style={{ color: '#ccc' }}>|</span>}>
              <span>编号：<b>{previewCard.colorCardCode}</b></span>
              <span>类型：<b>{getMaterialTypeLabel(previewCard.materialType)}</b></span>
              <span>供应商：<b>{previewCard.supplierName || '-'}</b></span>
            </Space>
          </div>
        )}
        <Table
          columns={previewColumns}
          dataSource={previewItems}
          rowKey={(_, i) => String(i)}
          size="small"
          pagination={false}
          scroll={{ y: 400 }}
          footer={() => (
            <Space>
              <Checkbox
                checked={selectedItems.size === previewItems.length && previewItems.length > 0}
                indeterminate={selectedItems.size > 0 && selectedItems.size < previewItems.length}
                onChange={(e) => {
                  if (e.target.checked) setSelectedItems(new Set(previewItems.map((_, i) => i)));
                  else setSelectedItems(new Set());
                }}
              >
                全选 ({selectedItems.size}/{previewItems.length})
              </Checkbox>
              <span style={{ color: '#888' }}>勾选的颜色将被生成到物料资料库</span>
            </Space>
          )}
        />
      </Modal>
    </>
  );
};

export default ColorCardPage;
