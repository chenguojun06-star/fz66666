import React, { useCallback, useEffect, useState } from 'react';
import { Button, Card, Input, Select, Space, Tag, Form, Row, Col, InputNumber, Upload, message, Modal } from 'antd';
import type { MenuProps } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined, SearchOutlined, EditOutlined, UploadOutlined } from '@ant-design/icons';
import type { UploadFile } from 'antd/es/upload/interface';
import Layout from '@/components/Layout';
import ResizableModal from '@/components/common/ResizableModal';
import ResizableTable from '@/components/common/ResizableTable';
import RowActions from '@/components/common/RowActions';
import { MaterialDatabase, MaterialDatabaseQueryParams } from '@/types/production';
import api, { unwrapApiData } from '@/utils/api';
import { formatDateTime } from '@/utils/datetime';
import { getMaterialTypeCategory, getMaterialTypeLabel, normalizeMaterialType } from '@/utils/materialType';
import { useViewport } from '@/utils/useViewport';

const { Option } = Select;

const MATERIAL_DB_QUERY_STORAGE_KEY = 'MaterialDatabase.queryParams';

// 转换为本地日期时间输入值格式
const toLocalDateTimeInputValue = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

const MaterialDatabasePage: React.FC = () => {
  const [_messageApi, contextHolder] = message.useMessage();
  const { isMobile, modalWidth } = useViewport();

  // 面辅料数据库相关状态
  const [visible, setVisible] = useState(false);
  const [currentMaterial, setCurrentMaterial] = useState<MaterialDatabase | null>(null);
  const [mode, setMode] = useState<'create' | 'edit'>('create');
  const [dataList, setDataList] = useState<MaterialDatabase[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [queryParams, setQueryParams] = useState<MaterialDatabaseQueryParams>(() => {
    const base: MaterialDatabaseQueryParams = { page: 1, pageSize: 10 };
    if (typeof window === 'undefined') return base;
    try {
      const raw = sessionStorage.getItem(MATERIAL_DB_QUERY_STORAGE_KEY);
      if (!raw) return base;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return base;
      const page = Number((parsed as Record<string, unknown>).page);
      const pageSize = Number((parsed as Record<string, unknown>).pageSize);
      return {
        ...base,
        ...(parsed as Record<string, unknown>),
        page: Number.isFinite(page) && page > 0 ? Math.floor(page) : base.page,
        pageSize: Number.isFinite(pageSize) && pageSize > 0 ? Math.floor(pageSize) : base.pageSize,
      };
    } catch {
      return base;
    }
  });
  const [form] = Form.useForm();
  const [imageFiles, setImageFiles] = useState<UploadFile[]>([]);

  const modalInitialHeight = typeof window !== 'undefined' ? window.innerHeight * 0.85 : 800;

  // 保存查询参数到sessionStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      sessionStorage.setItem(MATERIAL_DB_QUERY_STORAGE_KEY, JSON.stringify(queryParams));
    } catch {
      // 忽略错误
    }
  }, [queryParams]);

  // 获取面辅料数据库列表
  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ code: number; data: { records: MaterialDatabase[]; total: number } }>('/material/database/list', { params: queryParams });
      const data = unwrapApiData<{ records?: MaterialDatabase[]; total?: number }>(res as Record<string, unknown>, '获取面辅料数据库列表失败');
      const records = Array.isArray(data?.records) ? data.records : [];
      setDataList(records as MaterialDatabase[]);
      setTotal(Number(data?.total || 0) || 0);
    } catch (error) {
      const errMessage = (error as Error)?.message;
      message.error(errMessage || '获取面辅料数据库列表失败');
    } finally {
      setLoading(false);
    }
  }, [queryParams]);

  // 页面加载时获取列表
  useEffect(() => {
    fetchList();
  }, [fetchList]);

  // 上传物料图片
  const uploadImage = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await api.post<{ code: number; data: string; message?: string }>('/common/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (res.code === 200 && res.data) {
        form.setFieldsValue({ image: res.data });
        setImageFiles([
          {
            uid: '-1',
            name: file.name,
            status: 'done',
            url: res.data,
          },
        ]);
      } else {
        message.error(res.message || '上传失败');
      }
    } catch (e) {
      message.error((e as Error)?.message || '上传失败');
    }
  };

  // 打开新建/编辑弹窗
  const openDialog = (dialogMode: 'create' | 'edit', record?: MaterialDatabase) => {
    setMode(dialogMode);
    setVisible(true);

    if (dialogMode === 'edit' && record) {
      setCurrentMaterial(record);
      form.setFieldsValue({
        ...record,
        materialType: normalizeMaterialType(record.materialType || 'accessory'),
      });
      if (record.image) {
        setImageFiles([
          {
            uid: '-1',
            name: 'image',
            status: 'done',
            url: record.image,
          },
        ]);
      }
    } else {
      setCurrentMaterial(null);
      form.resetFields();
      setImageFiles([]);
    }
  };

  // 关闭弹窗
  const closeDialog = () => {
    setVisible(false);
    setCurrentMaterial(null);
    form.resetFields();
    setImageFiles([]);
  };

  // 提交表单
  const handleSubmit = async () => {
    try {
      setSubmitLoading(true);
      const values = (await form.validateFields()) as Record<string, unknown>;
      const status = String(values?.status || 'pending').trim();

      const { createTime: _createTime, completedTime: _completedTime, ...rest } = values as Record<string, unknown>;
      const payload: Record<string, unknown> = {
        ...rest,
        materialType: normalizeMaterialType(values?.materialType || 'accessory'),
        status: status === 'completed' ? 'completed' : 'pending',
        image: String(values?.image || '').trim() || undefined,
      };

      if (mode === 'create') {
        unwrapApiData<boolean>(await api.post<{ code: number; message: string; data: boolean }>('/material/database', payload), '新增失败');
      } else {
        unwrapApiData<boolean>(
          await api.put<{ code: number; message: string; data: boolean }>('/material/database', { ...payload, id: currentMaterial?.id }),
          '保存失败'
        );
      }

      message.success(mode === 'edit' ? '保存成功' : '新增成功');
      closeDialog();
      fetchList();
    } catch (error) {
      const formError = error as { errorFields?: Array<{ errors?: string[] }> };
      if (formError?.errorFields?.length) {
        const firstError = formError.errorFields[0];
        message.error(firstError?.errors?.[0] || '表单验证失败');
      } else {
        message.error((error as Error).message || '保存失败');
      }
    } finally {
      setSubmitLoading(false);
    }
  };

  // 删除物料
  const handleDelete = async (record: MaterialDatabase) => {
    const id = String(record?.id || '').trim();
    if (!id) {
      message.error('记录缺少ID');
      return;
    }
    Modal.confirm({
      title: '确认删除',
      content: '删除后不可恢复，是否继续？',
      okText: '删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        unwrapApiData<boolean>(await api.delete<{ code: number; message: string; data: boolean }>(`/material/database/${encodeURIComponent(id)}`), '删除失败');
        message.success('删除成功');
        fetchList();
      },
    });
  };

  // 标记完成
  const handleComplete = async (record: MaterialDatabase) => {
    const id = String(record?.id || '').trim();
    if (!id) {
      message.error('记录缺少ID');
      return;
    }
    Modal.confirm({
      title: '确认完成',
      content: '确认将该物料标记为已完成？',
      okText: '确认',
      cancelText: '取消',
      onOk: async () => {
        unwrapApiData<boolean>(
          await api.put<{ code: number; message: string; data: boolean }>(`/material/database/${encodeURIComponent(id)}/complete`),
          '标记完成失败'
        );
        message.success('标记完成成功');
        fetchList();
      },
    });
  };

  // 退回编辑
  const handleReturn = async (record: MaterialDatabase) => {
    const id = String(record?.id || '').trim();
    if (!id) {
      message.error('记录缺少ID');
      return;
    }
    Modal.confirm({
      title: '确认退回',
      content: '确认将该物料退回编辑状态？',
      okText: '确认',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        unwrapApiData<boolean>(
          await api.put<{ code: number; message: string; data: boolean }>(`/material/database/${encodeURIComponent(id)}/return`),
          '退回失败'
        );
        message.success('退回成功');
        fetchList();
      },
    });
  };

  // 表格列定义
  const columns: ColumnsType<MaterialDatabase> = [
    {
      title: '图片',
      dataIndex: 'image',
      key: 'image',
      width: 80,
      render: (image: string) => {
        if (!image) return null;
        return (
          <img
            src={image}
            alt="物料图片"
            style={{
              width: 40,
              height: 40,
              borderRadius: 4,
              objectFit: 'cover'
            }}
          />
        );
      }
    },
    {
      title: '面料编号',
      dataIndex: 'materialCode',
      key: 'materialCode',
      width: 120,
    },
    {
      title: '面料名称',
      dataIndex: 'materialName',
      key: 'materialName',
      width: 150,
      ellipsis: true,
    },
    {
      title: '款号',
      dataIndex: 'styleNo',
      key: 'styleNo',
      width: 100,
      ellipsis: true,
    },
    {
      title: '物料类型',
      dataIndex: 'materialType',
      key: 'materialType',
      width: 120,
      render: (v: unknown) => {
        const type = String(v || '').trim();
        const category = getMaterialTypeCategory(type);
        const text = getMaterialTypeLabel(type);
        const color = category === 'accessory' ? 'purple' : category === 'lining' ? 'cyan' : 'geekblue';
        return <Tag color={color}>{text}</Tag>;
      },
    },
    {
      title: '规格',
      dataIndex: 'specifications',
      key: 'specifications',
      width: 120,
      ellipsis: true,
    },
    {
      title: '单位',
      dataIndex: 'unit',
      key: 'unit',
      width: 80,
    },
    {
      title: '供应商',
      dataIndex: 'supplierName',
      key: 'supplierName',
      width: 120,
      ellipsis: true,
    },
    {
      title: '单价(元)',
      dataIndex: 'unitPrice',
      key: 'unitPrice',
      width: 100,
      align: 'right' as const,
      render: (value: unknown) => {
        const n = Number(value);
        return Number.isFinite(n) ? n.toFixed(2) : '-';
      },
    },
    {
      title: '备注',
      dataIndex: 'remark',
      key: 'remark',
      ellipsis: true,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (v: unknown) => {
        const st = String(v || 'pending').trim().toLowerCase();
        if (st === 'completed') return <Tag color="default">已完成</Tag>;
        return <Tag color="warning">待完成</Tag>;
      },
    },
    {
      title: '完成时间',
      dataIndex: 'completedTime',
      key: 'completedTime',
      width: 160,
      render: (v: unknown) => {
        const raw = String(v ?? '').trim();
        if (!raw) return '-';
        return formatDateTime(v) || '-';
      },
    },
    {
      title: '创建时间',
      dataIndex: 'createTime',
      key: 'createTime',
      width: 160,
      render: (v: unknown) => {
        const raw = String(v ?? '').trim();
        if (!raw) return '-';
        return formatDateTime(v) || '-';
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 130,
      fixed: 'right',
      render: (_: unknown, record: MaterialDatabase) => {
        const isCompleted = record.status === 'completed';
        const moreItems = (() => {
          const items: MenuProps['items'] = [];
          if (!isCompleted) {
            items.push({
              key: 'complete',
              label: '标记完成',
              onClick: () => void handleComplete(record),
            });
            items.push({
              key: 'delete',
              label: '删除',
              danger: true,
              onClick: () => void handleDelete(record),
            });
          }
          if (isCompleted) {
            items.push({
              key: 'return',
              label: '退回编辑',
              danger: true,
              onClick: () => void handleReturn(record),
            });
          }
          return items;
        })();

        return (
          <RowActions
            actions={[
              {
                key: 'edit',
                label: '编辑',
                title: isCompleted ? '已完成，需先退回后编辑' : '编辑',
                icon: <EditOutlined />,
                disabled: isCompleted,
                onClick: () => openDialog('edit', record),
                primary: true,
              },
              ...(moreItems.length
                ? [
                  {
                    key: 'more',
                    label: '更多',
                    children: moreItems,
                  },
                ]
                : []),
            ]}
          />
        );
      },
    },
  ];

  return (
    <Layout>
      {contextHolder}
      <div style={{ padding: '16px 24px' }}>
        <Card>
          {/* 页面标题和操作区 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ margin: 0 }}>📦 面辅料数据库</h2>
            <Space wrap>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => openDialog('create')}>
                新增面辅料
              </Button>
            </Space>
          </div>

          {/* 筛选区 */}
          <Card size="small" style={{ marginBottom: 16, background: '#fafafa' }}>
            <Form layout="inline" size="small">
              <Form.Item label="面料编号">
                <Input
                  placeholder="请输入面料编号"
                  value={queryParams.materialCode}
                  onChange={(e) => setQueryParams({ ...queryParams, materialCode: e.target.value, page: 1 })}
                  style={{ width: 120 }}
                />
              </Form.Item>
              <Form.Item label="面料名称">
                <Input
                  placeholder="请输入面料名称"
                  value={queryParams.materialName}
                  onChange={(e) => setQueryParams({ ...queryParams, materialName: e.target.value, page: 1 })}
                  style={{ width: 120 }}
                />
              </Form.Item>
              <Form.Item label="款号">
                <Input
                  placeholder="请输入款号"
                  value={queryParams.styleNo}
                  onChange={(e) => setQueryParams({ ...queryParams, styleNo: e.target.value, page: 1 })}
                  style={{ width: 100 }}
                />
              </Form.Item>
              <Form.Item label="物料类型">
                <Select
                  placeholder="请选择物料类型"
                  value={queryParams.materialType || ''}
                  onChange={(value) => setQueryParams({ ...queryParams, materialType: value, page: 1 })}
                  style={{ width: 120 }}
                >
                  <Option value="">全部</Option>
                  <Option value="fabric">面料</Option>
                  <Option value="fabricA">面料A</Option>
                  <Option value="fabricB">面料B</Option>
                  <Option value="fabricC">面料C</Option>
                  <Option value="fabricD">面料D</Option>
                  <Option value="fabricE">面料E</Option>
                  <Option value="lining">里料</Option>
                  <Option value="liningA">里料A</Option>
                  <Option value="liningB">里料B</Option>
                  <Option value="liningC">里料C</Option>
                  <Option value="liningD">里料D</Option>
                  <Option value="liningE">里料E</Option>
                  <Option value="accessory">辅料</Option>
                  <Option value="accessoryA">辅料A</Option>
                  <Option value="accessoryB">辅料B</Option>
                  <Option value="accessoryC">辅料C</Option>
                  <Option value="accessoryD">辅料D</Option>
                  <Option value="accessoryE">辅料E</Option>
                </Select>
              </Form.Item>
              <Form.Item label="供应商">
                <Input
                  placeholder="请输入供应商"
                  value={queryParams.supplierName}
                  onChange={(e) => setQueryParams({ ...queryParams, supplierName: e.target.value, page: 1 })}
                  style={{ width: 120 }}
                />
              </Form.Item>
              <Form.Item>
                <Space>
                  <Button type="primary" icon={<SearchOutlined />} onClick={() => fetchList()}>
                    查询
                  </Button>
                  <Button onClick={() => {
                    setQueryParams({ page: 1, pageSize: 10 });
                  }}>
                    重置
                  </Button>
                </Space>
              </Form.Item>
            </Form>
          </Card>

          {/* 表格区 */}
          <ResizableTable<MaterialDatabase>
            columns={columns}
            dataSource={dataList}
            rowKey={(r) => String(r?.id || r?.materialCode || '')}
            loading={loading}
            scroll={{ x: 'max-content', y: isMobile ? 360 : 560 }}
            size={isMobile ? 'small' : 'middle'}
            pagination={{
              current: queryParams.page,
              pageSize: queryParams.pageSize,
              total,
              showSizeChanger: true,
              showTotal: (t) => `共 ${t} 条`,
              onChange: (page, size) => setQueryParams({ ...queryParams, page, pageSize: size }),
              size: isMobile ? 'small' : 'default',
            }}
          />
        </Card>

        {/* 新增/编辑弹窗 */}
        <ResizableModal
          title={mode === 'create' ? '新增面辅料' : '编辑面辅料'}
          open={visible}
          onCancel={closeDialog}
          width={modalWidth}
          initialHeight={modalInitialHeight}
          minWidth={isMobile ? 320 : 520}
          footer={[
            <Button key="cancel" onClick={closeDialog}>
              取消
            </Button>,
            <Button key="submit" type="primary" loading={submitLoading} onClick={handleSubmit}>
              {mode === 'create' ? '创建' : '保存'}
            </Button>,
          ]}
        >
          <Form form={form} layout="vertical" size={isMobile ? 'small' : 'middle'}>
            <Row gutter={[16, 12]}>
              <Col xs={24} sm={12} lg={6}>
                <Form.Item
                  name="image"
                  label="物料图片"
                >
                  <Upload
                    accept="image/*"
                    listType="picture-card"
                    maxCount={1}
                    fileList={imageFiles}
                    onRemove={() => {
                      form.setFieldsValue({ image: undefined });
                      setImageFiles([]);
                      return true;
                    }}
                    beforeUpload={(file) => {
                      void uploadImage(file as File);
                      return Upload.LIST_IGNORE;
                    }}
                  >
                    {imageFiles.length ? null : (
                      <div>
                        <UploadOutlined />
                        <div style={{ marginTop: 8, fontSize: 'var(--font-size-sm)' }}>上传</div>
                      </div>
                    )}
                  </Upload>
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} lg={6}>
                <Form.Item
                  name="materialCode"
                  label="面料编号"
                  rules={[{ required: true, message: '请输入面料编号' }]}
                >
                  <Input placeholder="请输入面料编号" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} lg={6}>
                <Form.Item
                  name="materialName"
                  label="面料名称"
                  rules={[{ required: true, message: '请输入面料名称' }]}
                >
                  <Input placeholder="请输入面料名称" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} lg={6}>
                <Form.Item name="styleNo" label="款号">
                  <Input placeholder="请输入款号" />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={[16, 12]}>
              <Col xs={24} sm={12} lg={6}>
                <Form.Item
                  name="materialType"
                  label="物料类型"
                  rules={[{ required: true, message: '请选择物料类型' }]}
                >
                  <Select placeholder="请选择物料类型">
                    <Option value="fabric">面料</Option>
                    <Option value="fabricA">面料A</Option>
                    <Option value="fabricB">面料B</Option>
                    <Option value="fabricC">面料C</Option>
                    <Option value="fabricD">面料D</Option>
                    <Option value="fabricE">面料E</Option>
                    <Option value="lining">里料</Option>
                    <Option value="liningA">里料A</Option>
                    <Option value="liningB">里料B</Option>
                    <Option value="liningC">里料C</Option>
                    <Option value="liningD">里料D</Option>
                    <Option value="liningE">里料E</Option>
                    <Option value="accessory">辅料</Option>
                    <Option value="accessoryA">辅料A</Option>
                    <Option value="accessoryB">辅料B</Option>
                    <Option value="accessoryC">辅料C</Option>
                    <Option value="accessoryD">辅料D</Option>
                    <Option value="accessoryE">辅料E</Option>
                  </Select>
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} lg={6}>
                <Form.Item name="specifications" label="规格">
                  <Input placeholder="请输入规格" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} lg={6}>
                <Form.Item
                  name="unit"
                  label="单位"
                  rules={[{ required: true, message: '请输入单位' }]}
                >
                  <Input placeholder="请输入单位" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} lg={6}>
                <Form.Item
                  name="supplierName"
                  label="供应商"
                  rules={[{ required: true, message: '请输入供应商' }]}
                >
                  <Input placeholder="请输入供应商" />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={[16, 12]}>
              <Col xs={24} sm={12} lg={6}>
                <Form.Item name="unitPrice" label="单价(元)">
                  <InputNumber
                    placeholder="请输入单价"
                    style={{ width: '100%' }}
                    min={0}
                    step={0.01}
                    precision={2}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} lg={6}>
                <Form.Item name="description" label="描述">
                  <Input.TextArea placeholder="请输入描述" autoSize={{ minRows: 1, maxRows: 3 }} />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} lg={6}>
                <Form.Item name="createTime" label="创建时间">
                  <Input type="datetime-local" placeholder="系统自动生成" disabled />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} lg={6}>
                <Form.Item name="completedTime" label="完成时间">
                  <Input type="datetime-local" placeholder="完成后自动生成" disabled />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={[16, 12]}>
              <Col xs={24} lg={12}>
                <Form.Item name="remark" label="备注">
                  <Input.TextArea
                    placeholder="请输入备注"
                    autoSize={{ minRows: 3, maxRows: 6 }}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} lg={12}>
                <Form.Item name="status" label="状态">
                  <Select
                    placeholder="请选择状态"
                    onChange={(v) => {
                      const st = String(v || 'pending').trim().toLowerCase();
                      if (st === 'completed') {
                        const existed = String(form.getFieldValue('completedTime') || '').trim();
                        if (!existed) {
                          form.setFieldsValue({ completedTime: toLocalDateTimeInputValue() });
                        }
                        return;
                      }
                      form.setFieldsValue({ completedTime: undefined });
                    }}
                  >
                    <Option value="pending">待完成</Option>
                    <Option value="completed">已完成</Option>
                  </Select>
                </Form.Item>
              </Col>
            </Row>
          </Form>
        </ResizableModal>
      </div>
    </Layout>
  );
};

export default MaterialDatabasePage;
