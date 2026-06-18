import React, { useCallback, useEffect, useState } from 'react';
import {
  Button, Card, Input, Select, Form, Row, Col, InputNumber, Image, Tag,
  Modal, Space, message as antdMessage, Popconfirm,
} from 'antd';
import {
  PlusOutlined, CameraOutlined, EditOutlined, DeleteOutlined,
  ReloadOutlined, ShareAltOutlined,
} from '@ant-design/icons';
import ResizableTable from '@/components/common/ResizableTable';
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

  const [dialogVisible, setDialogVisible] = useState(false);
  const [currentCard, setCurrentCard] = useState<ColorCard | null>(null);
  const [form] = Form.useForm();

  const [itemVisible, setItemVisible] = useState(false);
  const [currentItems, setCurrentItems] = useState<ColorCardItem[]>([]);
  const [currentCardId, setCurrentCardId] = useState<string>('');
  const [currentCardName, setCurrentCardName] = useState<string>('');

  // 拍照识别相关
  const [recognizeVisible, setRecognizeVisible] = useState(false);
  const [recognizeImage, setRecognizeImage] = useState<string>('');
  const [recognizing, setRecognizing] = useState(false);

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

  // ========== 色卡本 CRUD ==========

  const openCreateDialog = () => {
    setCurrentCard(null);
    form.resetFields();
    setDialogVisible(true);
  };

  const openEditDialog = (card: ColorCard) => {
    setCurrentCard(card);
    form.setFieldsValue({
      colorCardCode: card.colorCardCode,
      colorCardName: card.colorCardName,
      materialType: card.materialType || 'fabric',
      fabricWidth: card.fabricWidth,
      specifications: card.specifications,
      fabricWeight: card.fabricWeight,
      fabricComposition: card.fabricComposition,
      unit: card.unit,
      supplierName: card.supplierName,
      supplierContactPerson: card.supplierContactPerson,
      supplierContactPhone: card.supplierContactPhone,
      image: card.image,
      remark: card.remark,
      status: card.status || 'pending',
    });
    setDialogVisible(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
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

  // ========== 颜色条目管理 ==========

  const openItemsDialog = async (card: ColorCard) => {
    setCurrentCardId(card.id);
    setCurrentCardName(card.colorCardName);
    try {
      const res = await api.get<{ code: number; data: any }>(`/color-card/${card.id}`);
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
    const next: ColorCardItem = {
      colorNo: '',
      colorName: '',
      unitPrice: undefined,
      image: '',
      remark: '',
      sortOrder: currentItems.length,
    };
    setCurrentItems([...currentItems, next]);
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

  // ========== 拍照识别色卡 ==========

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
        const formData = new FormData();
        formData.append('file', file);
        const res = await api.post<{ code: number; data: string }>(
          '/common/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } },
        );
        if (res.code === 200 && res.data) {
          setRecognizeImage(res.data);
        } else {
          antdMessage.warning('上传失败');
        }
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
        const newItems: ColorCardItem[] = [];
        // 如果识别到颜色信息，则作为一条颜色条目
        const colorName = data?.color?.textValue || data?.color?.rawText || '';
        if (colorName) {
          newItems.push({
            colorNo: 'C' + String(currentItems.length + newItems.length + 1).padStart(3, '0'),
            colorName,
            unitPrice: data?.unitPrice?.numberValue,
            image: data?.imageUrl || '',
            remark: data?.aiHint || '',
          });
        }
        // 如果没有识别到颜色，但是有其他信息，可以作为备注
        if (newItems.length === 0) {
          antdMessage.info('未识别到明确的颜色信息，请手动添加');
        } else {
          setCurrentItems([...currentItems, ...newItems]);
          antdMessage.success(`识别到 ${newItems.length} 条颜色信息`);
          setRecognizeVisible(false);
          setItemVisible(true);
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

  // ========== 批量生成物料 ==========

  const handleGenerateMaterials = async (card: ColorCard) => {
    Modal.confirm({
      title: '确认收录到物料库',
      content: `将把色卡本"${card.colorCardName}"作为一条物料记录收录到物料库，颜色信息保留在色卡本中。是否继续？`,
      okText: '确认收录',
      cancelText: '取消',
      onOk: async () => {
        try {
          const res = await api.post<{ code: number; data: string[]; message?: string }>(
            `/color-card/${card.id}/generate-materials`, {},
          );
          if (res.code === 200) {
            antdMessage.success('已成功收录，一本色卡 = 一条物料记录');
          }
        } catch (err: any) {
          antdMessage.error(err?.message || '生成失败');
        }
      },
    });
  };

  // ===== 表格列 =====
  const columns = [
    { title: '色卡本编号', dataIndex: 'colorCardCode', width: 140, fixed: 'left' as const },
    { title: '色卡本名称', dataIndex: 'colorCardName', width: 180 },
    { title: '物料类型', dataIndex: 'materialType', width: 90,
      render: (v: string) => getMaterialTypeLabel(v) },
    { title: '幅宽', dataIndex: 'fabricWidth', width: 90 },
    { title: '规格', dataIndex: 'specifications', width: 110 },
    { title: '成分', dataIndex: 'fabricComposition', width: 140 },
    { title: '克重', dataIndex: 'fabricWeight', width: 80 },
    { title: '单位', dataIndex: 'unit', width: 70 },
    { title: '供应商', dataIndex: 'supplierName', width: 150 },
    { title: '颜色数量', dataIndex: 'colorCount', width: 90,
      render: (v: number) => <Tag color={v > 0 ? 'blue' : 'default'}>{v || 0}</Tag> },
    { title: '创建时间', dataIndex: 'createTime', width: 160 },
    { title: '操作', dataIndex: 'op', width: 320, fixed: 'right' as const,
      render: (_: any, r: ColorCard) => (
        <Space size="small">
          <Button size="small" type="link" icon={<EditOutlined />} onClick={() => openEditDialog(r)}>编辑</Button>
          <Button size="small" type="link" onClick={() => openItemsDialog(r)}>颜色管理</Button>
          <Button size="small" type="link" icon={<CameraOutlined />} onClick={() => openRecognize(r)}>拍照识别</Button>
          <Button size="small" type="link" icon={<ShareAltOutlined />} onClick={() => handleGenerateMaterials(r)}>生成物料</Button>
          <Popconfirm title="确认删除？" onConfirm={() => handleDelete(r.id)} okText="确认" cancelText="取消">
            <Button size="small" type="link" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Card style={{ marginBottom: 12, background: 'var(--color-bg-container)' }}>
        <Space.Compact style={{ width: '100%', display: 'flex' }}>
          <Input
            placeholder="搜索色卡本编号/名称/供应商"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            style={{ maxWidth: 280 }}
            allowClear
          />
          <Select
            placeholder="物料类型"
            value={materialType || undefined}
            onChange={setMaterialType}
            style={{ width: 140 }}
            allowClear
          >
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
        scroll={{ x: 1400 }}
        pagination={{
          current: page, pageSize, total,
          showSizeChanger: true,
          showTotal: (t) => `共 ${t} 本色卡本`,
          onChange: (p, ps) => { setPage(p); setPageSize(ps); },
        }}
      />

      {/* 色卡本 新建/编辑 弹窗 */}
      <Modal
        title={currentCard?.id ? '编辑色卡本' : '新建色卡本'}
        open={dialogVisible}
        onCancel={() => setDialogVisible(false)}
        onOk={handleSave}
        width={720}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical" size="middle">
          <Row gutter={12}>
            <Col xs={24} sm={12}>
              <Form.Item name="colorCardCode" label="色卡本编号" rules={[{ required: true, message: '请输入' }]}>
                <Input placeholder="如 CC001，自动生成或手动输入" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
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
            <Col xs={24} sm={8}>
              <Form.Item name="supplierName" label="供应商"><Input placeholder="供应商名称" /></Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="supplierContactPerson" label="联系人"><Input placeholder="联系人" /></Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="supplierContactPhone" label="联系电话"><Input placeholder="电话" /></Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item name="image" label="封面图片（可选）">
                <Input placeholder="图片 URL" />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item name="remark" label="备注">
                <Input.TextArea placeholder="备注信息" autoSize={{ minRows: 2, maxRows: 4 }} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* 颜色条目管理 弹窗 */}
      <Modal
        title={`${currentCardName} - 颜色管理`}
        open={itemVisible}
        onCancel={() => setItemVisible(false)}
        width={960}
        footer={[
          <Button key="cancel" onClick={() => setItemVisible(false)}>关闭</Button>,
          <Button key="save" type="primary" onClick={saveItems}>保存全部</Button>,
        ]}
      >
        <Space style={{ marginBottom: 12 }}>
          <Button type="primary" icon={<PlusOutlined />} onClick={addEmptyItem}>+ 添加颜色</Button>
          <span style={{ color: '#888' }}>共 {currentItems.length} 条</span>
        </Space>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 520, overflowY: 'auto' }}>
          {currentItems.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>暂无颜色条目，点击"添加颜色"或"拍照识别"添加</div>
          )}
          {currentItems.map((item, idx) => (
            <Card key={idx} size="small" style={{ border: '1px solid #eee' }}>
              <Row gutter={10} align="middle">
                <Col xs={24} sm={3}>
                  <div style={{ fontWeight: 600, color: '#1677ff' }}>#{idx + 1}</div>
                </Col>
                <Col xs={24} sm={4}>
                  <Input
                    placeholder="颜色编号 *"
                    value={item.colorNo}
                    onChange={(e) => updateItem(idx, 'colorNo', e.target.value)}
                    size="small"
                  />
                </Col>
                <Col xs={24} sm={4}>
                  <Input
                    placeholder="颜色名称"
                    value={item.colorName || ''}
                    onChange={(e) => updateItem(idx, 'colorName', e.target.value)}
                    size="small"
                  />
                </Col>
                <Col xs={24} sm={3}>
                  <InputNumber
                    placeholder="单价"
                    value={item.unitPrice}
                    onChange={(v) => updateItem(idx, 'unitPrice', v)}
                    min={0}
                    step={0.01}
                    style={{ width: '100%' }}
                    size="small"
                  />
                </Col>
                <Col xs={24} sm={6}>
                  <Input
                    placeholder="图片 URL（可选）"
                    value={item.image || ''}
                    onChange={(e) => updateItem(idx, 'image', e.target.value)}
                    size="small"
                  />
                </Col>
                <Col xs={24} sm={3}>
                  <Input
                    placeholder="备注"
                    value={item.remark || ''}
                    onChange={(e) => updateItem(idx, 'remark', e.target.value)}
                    size="small"
                  />
                </Col>
                <Col xs={24} sm={1}>
                  <Button type="link" danger size="small" onClick={() => removeItem(idx)}>删除</Button>
                </Col>
                {item.image && (
                  <Col xs={24}>
                    <div style={{ marginTop: 6 }}>
                      <Image src={getFullAuthedFileUrl(item.image)} width={80} height={60} style={{ objectFit: 'cover', borderRadius: 4 }} preview />
                    </div>
                  </Col>
                )}
              </Row>
            </Card>
          ))}
        </div>
      </Modal>

      {/* 拍照识别 弹窗 */}
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
              <Image src={getFullAuthedFileUrl(recognizeImage)} width={220} height={220} style={{ objectFit: 'contain', borderRadius: 8 }} preview />
            </div>
          ) : (
            <div style={{ width: 220, height: 220, margin: '0 auto 16px', border: '2px dashed #d9d9d9', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>
              请选择色卡图片
            </div>
          )}
          <input type="file" accept="image/*" capture="environment" onChange={onPickImage} style={{ marginBottom: 12 }} />
          <div style={{ color: '#888', fontSize: 12, marginTop: 8 }}>
            上传后点击"开始识别"，AI 会自动提取色卡上的颜色名称、编号、单价等信息
          </div>
        </div>
      </Modal>
    </>
  );
};

export default ColorCardPage;
