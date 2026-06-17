import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button, Form, Input, Select, InputNumber, Row, Col, App, Drawer, Descriptions, Divider, Space, Popconfirm, Table, Image } from 'antd';
import { PlusOutlined, LoginOutlined, PrinterOutlined, EditOutlined, SwapOutlined } from '@ant-design/icons';
import ResizableTable from '@/components/common/ResizableTable';
import PageLayout from '@/components/common/PageLayout';
import PageStatCards from '@/components/common/PageStatCards';
import RowActions from '@/components/common/RowActions';
import type { RowAction } from '@/components/common/RowActions';
import AttachmentThumb from '@/components/common/AttachmentThumb';
import ImageUploadBox from '@/components/common/ImageUploadBox';
import ResizableModal from '@/components/common/ResizableModal';
import { useViewport } from '@/utils/useViewport';
import { useNavigate } from 'react-router-dom';
import api from '@/utils/api';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import { toCategoryCn, toSeasonCn, CATEGORY_CODE_OPTIONS, SEASON_CODE_OPTIONS } from '@/utils/styleCategory';
import { formatMoney } from '@/utils/format';
import { StyleInfo } from '@/types/style';
import { useProductList } from './hooks/useProductList';

interface SkuRow {
  id: number;
  skuCode: string;
  color: string;
  skuColorImage?: string | null;
  size: string;
  costPrice?: number;
  salesPrice?: number;
  stockQuantity?: number;
  barcode?: string;
}

const ProductInfoPage: React.FC = () => {
  const { isMobile } = useViewport();
  const { message } = App.useApp();
  const navigate = useNavigate();

  const {
    loading,
    data,
    total,
    queryParams,
    setQueryParams,
    fetchList,
    handlePageChange,
  } = useProductList();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<StyleInfo | null>(null);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [form] = Form.useForm();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerRecord, setDrawerRecord] = useState<StyleInfo | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [skuList, setSkuList] = useState<SkuRow[]>([]);
  const [skuLoading, _setSkuLoading] = useState(false);

  const [localKeyword, setLocalKeyword] = useState(queryParams.keyword || '');
  const keywordDebounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    return () => {
      if (keywordDebounceRef.current) clearTimeout(keywordDebounceRef.current);
    };
  }, []);

  const handleKeywordChange = useCallback((v: string) => {
    setLocalKeyword(v);
    if (keywordDebounceRef.current) clearTimeout(keywordDebounceRef.current);
    keywordDebounceRef.current = setTimeout(() => {
      setQueryParams((p) => ({ ...p, keyword: v }));
      if (!v) setQueryParams((p) => ({ ...p, page: 1 }));
    }, 300);
  }, [setQueryParams]);

  useEffect(() => { fetchList(); }, [fetchList]);

  useEffect(() => {
    const onVisible = () => { if (!document.hidden) fetchList(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [fetchList]);

  const statCards = [
    {
      key: 'all',
      items: [{ label: '全部', value: total, unit: '条' }],
      onClick: () => setQueryParams((p) => ({ ...p, status: '', page: 1 })),
      activeColor: 'var(--color-primary)',
    },
    {
      key: 'ENABLED',
      items: [{ label: '启用', value: '-', unit: '', color: 'var(--color-success)' }],
      onClick: () => setQueryParams((p) => ({ ...p, status: 'ENABLED', page: 1 })),
      activeColor: 'var(--color-success)',
    },
    {
      key: 'DISABLED',
      items: [{ label: '停用', value: '-', unit: '', color: 'var(--color-error)' }],
      onClick: () => setQueryParams((p) => ({ ...p, status: 'DISABLED', page: 1 })),
      activeColor: 'var(--color-error)',
    },
  ];

  const openCreate = () => {
    setEditingItem(null);
    form.resetFields();
    form.setFieldsValue({ status: 'ENABLED' });
    setCoverUrl(null);
    setModalOpen(true);
  };

  const openEdit = async (record: StyleInfo) => {
    try {
      const res = await api.get<any>(`/style/info/${record.id}`);
      if (res.code === 200 && res.data) {
        const d = res.data;
        setEditingItem(d);
        setCoverUrl(d.cover || null);
        form.setFieldsValue({
          styleNo: d.styleNo, styleName: d.styleName, category: d.category,
          season: d.season, color: d.color, size: d.size,
          fabricComposition: d.fabricComposition, washInstructions: d.washInstructions,
          uCode: d.uCode, price: d.price, status: d.status,
          cycle: d.cycle, customer: d.customer, description: d.description,
          qualityGrade: d.qualityGrade, executeStandard: d.executeStandard,
          safetyCategory: d.safetyCategory, inspector: d.inspector,
        });
        setModalOpen(true);
      }
    } catch {
      message.error('获取详情失败');
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitLoading(true);
      const payload = { ...values, cover: coverUrl };
      if (editingItem?.id) {
        const res = await api.put('/style/info', { ...payload, id: editingItem.id });
        if ((res as any).code === 200) {
          message.success('更新成功');
          setModalOpen(false);
          fetchList();
        } else {
          message.error((res as any).message || '更新失败');
        }
      } else {
        const res = await api.post('/style/info', payload);
        if ((res as any).code === 200) {
          message.success('创建成功');
          setModalOpen(false);
          fetchList();
        } else {
          message.error((res as any).message || '创建失败');
        }
      }
    } catch {
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleToggleStatus = async (record: StyleInfo) => {
    const newStatus = record.status === 'ENABLED' ? 'DISABLED' : 'ENABLED';
    try {
      const res = await api.put('/style/info', { id: record.id, status: newStatus });
      if ((res as any).code === 200) {
        message.success(newStatus === 'ENABLED' ? '已启用' : '已停用');
        fetchList();
      } else {
        message.error((res as any).message || '操作失败');
      }
    } catch {
      message.error('操作失败');
    }
  };

  const openDrawer = async (record: StyleInfo) => {
    setDrawerRecord(record);
    setDrawerOpen(true);
    setDrawerLoading(true);
    setSkuList([]);
    try {
      const [styleRes, skuRes] = await Promise.all([
        api.get<any>(`/style/info/${record.id}`),
        api.post<any>('/style/sku/list-by-style', { styleId: record.id }).catch(() => null),
      ]);
      if (styleRes.code === 200 && styleRes.data) {
        setDrawerRecord(styleRes.data);
      }
      if (skuRes && skuRes.code === 200 && Array.isArray(skuRes.data)) {
        setSkuList(skuRes.data);
      } else if (skuRes && skuRes.code === 200 && skuRes.data?.records) {
        setSkuList(skuRes.data.records);
      }
    } catch {
    } finally {
      setDrawerLoading(false);
    }
  };

  const handleInbound = (record: StyleInfo) => {
    navigate(`/production/warehousing?styleNo=${encodeURIComponent(record.styleNo)}&styleId=${record.id}`);
  };

  const handlePrintTag = (record: StyleInfo) => {
    navigate(`/warehouse/label-print?styleNo=${encodeURIComponent(record.styleNo)}`);
  };

  const columns = [
    {
      title: '图片', dataIndex: 'cover', key: 'cover', width: 56,
      render: (_: unknown, r: StyleInfo) => (
        <AttachmentThumb styleId={r.id!} src={r.cover || null} width={36} height={36} borderRadius={4} />
      ),
    },
    { title: '款号', dataIndex: 'styleNo', key: 'styleNo', width: 120, ellipsis: true },
    { title: '款名', dataIndex: 'styleName', key: 'styleName', width: 140, ellipsis: true },
    {
      title: '品类', dataIndex: 'category', key: 'category', width: 80,
      render: (v: unknown) => toCategoryCn(v),
    },
    {
      title: '季节', dataIndex: 'season', key: 'season', width: 70,
      render: (v: unknown) => toSeasonCn(v),
    },
    { title: '颜色', dataIndex: 'color', key: 'color', width: 70 },
    { title: '尺码', dataIndex: 'size', key: 'size', width: 80, ellipsis: true },
    { title: 'SKC', dataIndex: 'skc', key: 'skc', width: 130, ellipsis: true },
    {
      title: '客户', dataIndex: 'customer', key: 'customer', width: 90, ellipsis: true,
      render: (v: unknown) => String(v ?? '-'),
    },
    {
      title: '单价', dataIndex: 'price', key: 'price', width: 80, align: 'right' as const,
      render: (v: unknown) => v != null ? formatMoney(v as number | string) : '-',
    },
    {
      title: '下单', dataIndex: 'orderCount', key: 'orderCount', width: 60, align: 'right' as const,
      render: (v: unknown) => v != null ? `${v}次` : '-',
    },
    {
      title: '入库量', dataIndex: 'totalWarehousedQuantity', key: 'totalWarehousedQuantity', width: 70, align: 'right' as const,
      render: (v: unknown) => v != null ? `${v}` : '-',
    },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 60,
      render: (v: string) => {
        if (v === 'ENABLED') return <span style={{ color: '#16a34a', fontWeight: 500 }}>启用</span>;
        if (v === 'DISABLED') return <span style={{ color: '#9ca3af', fontWeight: 400 }}>停用</span>;
        return <span style={{ color: '#9ca3af' }}>{v || '-'}</span>;
      },
    },
    {
      title: '操作', key: 'actions', width: 180, fixed: 'right' as const,
      render: (_: unknown, record: StyleInfo) => {
        const actions: RowAction[] = [
          { key: 'detail', label: '详情', primary: true, onClick: () => openDrawer(record) },
          { key: 'edit', label: '编辑', onClick: () => openEdit(record) },
          { key: 'inbound', label: '入库', onClick: () => handleInbound(record) },
          { key: 'print', label: '吊牌', onClick: () => handlePrintTag(record) },
        ];
        return <RowActions actions={actions} />;
      },
    },
  ];

  const skuColumns = [
    {
      title: '图片', key: 'skuColorImage', width: 70,
      render: (_: unknown, record: SkuRow) => {
        if (record.skuColorImage) {
          return (
            <Image
              src={getFullAuthedFileUrl(record.skuColorImage)}
              alt=""
              width={36}
              height={36}
              style={{ objectFit: 'cover', borderRadius: 4 }}
              preview={{ mask: <span style={{ fontSize: 10 }}>查看</span> }}
            />
          );
        }
        return <div style={{ width: 36, height: 36, background: '#f5f5f5', borderRadius: 4 }} />;
      },
    },
    { title: '颜色', dataIndex: 'color', key: 'color', width: 80, render: (v: unknown) => <span style={{ fontWeight: 500 }}>{v ? String(v) : '-'}</span> },
    { title: '尺码', dataIndex: 'size', key: 'size', width: 70, render: (v: unknown) => <span>{v ? String(v) : '-'}</span> },
    { title: 'SKU编码', dataIndex: 'skuCode', key: 'skuCode', width: 180, ellipsis: true },
    { title: '条形码', dataIndex: 'barcode', key: 'barcode', width: 130, ellipsis: true, render: (v: unknown) => String(v ?? '-') },
    {
      title: '成本价', dataIndex: 'costPrice', key: 'costPrice', width: 80, align: 'right' as const,
      render: (v: unknown) => v != null ? formatMoney(v as number | string) : '-',
    },
    {
      title: '销售价', dataIndex: 'salesPrice', key: 'salesPrice', width: 80, align: 'right' as const,
      render: (v: unknown) => v != null ? formatMoney(v as number | string) : '-',
    },
    {
      title: '库存', dataIndex: 'stockQuantity', key: 'stockQuantity', width: 70, align: 'right' as const,
      render: (v: unknown) => {
        if (v == null) return '-';
        const n = Number(v);
        return <span style={{ color: n > 0 ? 'var(--color-success)' : 'var(--color-text-tertiary)', fontWeight: n > 0 ? 600 : 400 }}>{n}</span>;
      },
    },
  ];

  const d = drawerRecord;

  return (
    <>
      <PageLayout
        title="成品资料"
        headerContent={
          <PageStatCards
            cards={statCards}
            activeKey={queryParams.status || 'all'}
          />
        }
        filterLeft={
          <Space wrap>
            <Input
              placeholder="搜索款号/款名/SKC"
              allowClear
              style={{ width: 240 }}
              value={localKeyword}
              onChange={(e) => handleKeywordChange(e.target.value)}
              onPressEnter={() => setQueryParams((p) => ({ ...p, page: 1 }))}
            />
            <Button
              onClick={() => setQueryParams((p) => ({ ...p, page: 1 }))}
            >
              搜索
            </Button>
            <Select
              placeholder="品类"
              allowClear
              style={{ width: 100 }}
              value={queryParams.category || undefined}
              onChange={(v) => setQueryParams((p) => ({ ...p, category: v || '', page: 1 }))}
              options={CATEGORY_CODE_OPTIONS}
            />
            <Select
              placeholder="季节"
              allowClear
              style={{ width: 90 }}
              value={queryParams.season || undefined}
              onChange={(v) => setQueryParams((p) => ({ ...p, season: v || '', page: 1 }))}
              options={SEASON_CODE_OPTIONS}
            />
          </Space>
        }
        filterRight={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            新增
          </Button>
        }
      >
        <ResizableTable<StyleInfo>
          columns={columns}
          dataSource={data}
          rowKey={(r) => String(r?.id || '')}
          loading={loading}
          stickyHeader
          scroll={{ x: 'max-content' }}
          size={isMobile ? 'small' : 'middle'}
          pagination={{
            current: queryParams.page,
            pageSize: queryParams.pageSize,
            total,
            showTotal: (t) => `共 ${t} 条`,
            showSizeChanger: true,
            pageSizeOptions: ['20', '50', '100', '200'],
            onChange: handlePageChange,
            size: isMobile ? 'small' : 'default',
          }}
        />
      </PageLayout>

      <Drawer
        title={d ? `${d.styleNo} — ${d.styleName}` : '成品详情'}
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setDrawerRecord(null); setSkuList([]); }}
        size="large"
        loading={drawerLoading}
        extra={
          d ? (
            <Space>
              <Button icon={<EditOutlined />} onClick={() => { setDrawerOpen(false); openEdit(d); }}>编辑</Button>
              <Button icon={<LoginOutlined />} onClick={() => handleInbound(d)}>入库</Button>
              <Button icon={<PrinterOutlined />} onClick={() => handlePrintTag(d)}>吊牌</Button>
              <Popconfirm
                title={d.status === 'ENABLED' ? '确定停用该成品？' : '确定启用该成品？'}
                onConfirm={() => handleToggleStatus(d)}
              >
                <Button icon={<SwapOutlined />}>{d.status === 'ENABLED' ? '停用' : '启用'}</Button>
              </Popconfirm>
            </Space>
          ) : undefined
        }
      >
        {d && (
          <>
            {d.cover && (
              <div style={{ textAlign: 'center', marginBottom: 16 }}>
                <AttachmentThumb
                  styleId={d.id!}
                  cover={d.cover}
                  width="100%"
                  height={200}
                  borderRadius={8}
                  imageStyle={{ objectFit: 'contain' }}
                />
              </div>
            )}

            <Descriptions column={3} size="small" bordered>
              <Descriptions.Item label="款号">{d.styleNo}</Descriptions.Item>
              <Descriptions.Item label="款名">{d.styleName}</Descriptions.Item>
              <Descriptions.Item label="品类">{toCategoryCn(d.category)}</Descriptions.Item>
              <Descriptions.Item label="季节">{toSeasonCn(d.season)}</Descriptions.Item>
              <Descriptions.Item label="SKC">{String(d.skc ?? '-')}</Descriptions.Item>
              <Descriptions.Item label="U编码">{String(d.uCode ?? '-')}</Descriptions.Item>
              <Descriptions.Item label="单价">{d.price != null ? formatMoney(d.price) : '-'}</Descriptions.Item>
              <Descriptions.Item label="生产周期">{d.cycle ? `${d.cycle}天` : '-'}</Descriptions.Item>
              <Descriptions.Item label="客户">{String(d.customer ?? '-')}</Descriptions.Item>
              <Descriptions.Item label="面料成分" span={3}>{String(d.fabricComposition ?? '-')}</Descriptions.Item>
              <Descriptions.Item label="状态">
                <span style={{ color: d.status === 'ENABLED' ? '#16a34a' : '#9ca3af', fontWeight: 500 }}>
                  {d.status === 'ENABLED' ? '启用' : d.status === 'DISABLED' ? '停用' : d.status || '-'}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="下单次数">{d.orderCount != null ? `${d.orderCount}次` : '-'}</Descriptions.Item>
              <Descriptions.Item label="入库总量">{d.totalWarehousedQuantity != null ? `${d.totalWarehousedQuantity}` : '-'}</Descriptions.Item>
            </Descriptions>

            <Divider style={{ fontSize: 14, marginTop: 20 }}>SKU 规格明细</Divider>
            {skuLoading ? (
              <div style={{ textAlign: 'center', padding: 24, color: 'var(--color-text-tertiary)' }}>加载中...</div>
            ) : skuList.length > 0 ? (
              <Table<SkuRow>
                columns={skuColumns}
                dataSource={skuList}
                rowKey={(r) => String(r.id || r.skuCode)}
                size="small"
                pagination={false}
                bordered
                style={{ marginBottom: 16 }}
              />
            ) : (
              <div style={{ textAlign: 'center', padding: 16, color: 'var(--color-text-tertiary)', background: 'var(--color-bg-subtle)', borderRadius: 8 }}>
                暂无SKU数据，请在样衣开发页面配置颜色尺码后同步
              </div>
            )}

            <Divider style={{ fontSize: 14, marginTop: 20 }}>吊牌信息</Divider>
            <Descriptions column={3} size="small" bordered>
              <Descriptions.Item label="质量等级">{String(d.qualityGrade ?? '-')}</Descriptions.Item>
              <Descriptions.Item label="执行标准">{String(d.executeStandard ?? '-')}</Descriptions.Item>
              <Descriptions.Item label="安全类别">{String(d.safetyCategory ?? '-')}</Descriptions.Item>
              <Descriptions.Item label="检验员">{String(d.inspector ?? '-')}</Descriptions.Item>
              <Descriptions.Item label="检验日期">{String(d.inspectionDate ?? '-')}</Descriptions.Item>
              <Descriptions.Item label="洗涤说明">{String(d.washInstructions ?? '-')}</Descriptions.Item>
            </Descriptions>
          </>
        )}
      </Drawer>

      <ResizableModal
        title={editingItem?.id ? '编辑成品资料' : '新增成品资料'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        width="40vw"
        footer={[
          <Button key="cancel" onClick={() => setModalOpen(false)}>取消</Button>,
          <Button key="submit" type="primary" loading={submitLoading} onClick={handleSubmit}>
            {editingItem?.id ? '保存' : '创建'}
          </Button>,
        ]}
      >
        <div style={{ padding: '0 4px' }}>
          <Form form={form} layout="vertical" size={isMobile ? 'small' : 'middle'}>
            <div style={{ marginBottom: 16, display: 'flex', alignItems: 'flex-start', gap: 16 }}>
              <ImageUploadBox
                value={coverUrl}
                onChange={setCoverUrl}
                width={100}
                height={100}
                label="封面图"
                uploadFn={async (file) => {
                  const formData = new FormData();
                  formData.append('file', file);
                  if (editingItem?.id) formData.append('styleId', String(editingItem.id));
                  const res = await api.post('/style/attachment/upload', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                  });
                  if ((res as any).code === 200 && (res as any).data?.fileUrl) {
                    return (res as any).data.fileUrl;
                  }
                  throw new Error((res as any).message || '上传失败');
                }}
              />
              <div style={{ flex: 1, color: 'var(--color-text-tertiary)', fontSize: 14, paddingTop: 4 }}>
                <div>点击上传成品图片</div>
                <div style={{ marginTop: 4 }}>支持 JPG/PNG，最大 5MB</div>
              </div>
            </div>
            <Row gutter={[12, 8]}>
              <Col xs={24} sm={12} md={8}>
                <Form.Item name="styleNo" label="款号" rules={[{ required: true, message: '请输入款号' }]}>
                  <Input placeholder="请输入款号" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <Form.Item name="styleName" label="款名" rules={[{ required: true, message: '请输入款名' }]}>
                  <Input placeholder="请输入款名" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <Form.Item name="category" label="品类">
                  <Select placeholder="请选择品类" allowClear showSearch optionFilterProp="label">
                    {CATEGORY_CODE_OPTIONS.map(opt => (
                      <Select.Option key={opt.value} value={opt.value} label={opt.label}>{opt.label}</Select.Option>
                    ))}
                  </Select>
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={[12, 8]}>
              <Col xs={24} sm={12} md={8}>
                <Form.Item name="season" label="季节">
                  <Select placeholder="请选择季节" allowClear>
                    {SEASON_CODE_OPTIONS.map(opt => (
                      <Select.Option key={opt.value} value={opt.value}>{opt.label}</Select.Option>
                    ))}
                  </Select>
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <Form.Item name="color" label="颜色">
                  <Input placeholder="请输入颜色" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <Form.Item name="size" label="尺码">
                  <Input placeholder="请输入尺码" />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={[12, 8]}>
              <Col xs={24} sm={12} md={8}>
                <Form.Item name="fabricComposition" label="面料成分">
                  <Input placeholder="如：100%棉" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <Form.Item name="uCode" label="U编码">
                  <Input placeholder="请输入U编码" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <Form.Item name="price" label="单价(元)">
                  <InputNumber placeholder="请输入单价" style={{ width: '100%' }} min={0} step={0.01} precision={2} />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={[12, 8]}>
              <Col xs={24} sm={12} md={8}>
                <Form.Item name="customer" label="客户">
                  <Input placeholder="请输入客户" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <Form.Item name="cycle" label="生产周期(天)">
                  <InputNumber placeholder="天数" style={{ width: '100%' }} min={0} />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <Form.Item name="status" label="状态">
                  <Select placeholder="请选择状态">
                    <Select.Option value="ENABLED">启用</Select.Option>
                    <Select.Option value="DISABLED">停用</Select.Option>
                  </Select>
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={[12, 8]}>
              <Col xs={24} sm={12} md={8}>
                <Form.Item name="qualityGrade" label="质量等级">
                  <Input placeholder="如：合格品" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <Form.Item name="executeStandard" label="执行标准">
                  <Input placeholder="如：GB/T 2660-2017" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <Form.Item name="safetyCategory" label="安全类别">
                  <Input placeholder="如：GB 18401 B类" />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={[12, 8]}>
              <Col xs={24} sm={12} md={8}>
                <Form.Item name="inspector" label="检验员">
                  <Input placeholder="请输入检验员" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <Form.Item name="washInstructions" label="洗涤说明">
                  <Input.TextArea placeholder="请输入洗涤说明" autoSize={{ minRows: 2 }} />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <Form.Item name="description" label="描述">
                  <Input.TextArea placeholder="请输入描述" autoSize={{ minRows: 2 }} />
                </Form.Item>
              </Col>
            </Row>
          </Form>
        </div>
      </ResizableModal>
    </>
  );
};

export default ProductInfoPage;
