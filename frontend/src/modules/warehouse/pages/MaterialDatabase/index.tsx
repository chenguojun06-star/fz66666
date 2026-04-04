import React, { useEffect, useState } from 'react';
import { Button, Card, Input, Select, Tag, Form, Row, Col, InputNumber, Upload, App } from 'antd';
import type { MenuProps } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { UploadOutlined } from '@ant-design/icons';
import type { UploadFile } from 'antd/es/upload/interface';
import Layout from '@/components/Layout';
import MaterialTypeTag from '@/components/common/MaterialTypeTag';
import StandardModal from '@/components/common/StandardModal';
import StandardSearchBar from '@/components/common/StandardSearchBar';
import RejectReasonModal from '@/components/common/RejectReasonModal';
import StandardToolbar from '@/components/common/StandardToolbar';
import SupplierNameTooltip from '@/components/common/SupplierNameTooltip';
import { useAuth } from '@/utils/AuthContext';
import { renderMaskedNumber } from '@/utils/sensitiveDataMask';
import ResizableTable from '@/components/common/ResizableTable';
import RowActions from '@/components/common/RowActions';
import { MaterialDatabase, MaterialDatabaseQueryParams } from '@/types/production';
import api, { unwrapApiData } from '@/utils/api';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import { formatDateTime } from '@/utils/datetime';
import { formatMaterialSpecWidth, getBaseMaterialType } from '@/utils/materialType';
import { useViewport } from '@/utils/useViewport';
import { useModal, useRequest, useTablePagination } from '@/hooks';
import type { Dayjs } from 'dayjs';
import SupplierSelect from '@/components/common/SupplierSelect';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import { isSmartFeatureEnabled } from '@/smart/core/featureFlags';
import type { SmartErrorInfo } from '@/smart/core/types';

const { Option } = Select;

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
  const { message, modal } = App.useApp();
  const { isMobile } = useViewport();
  const { user } = useAuth();

  // ===== 使用 Hooks 优化状态管理 =====
  // Modal 状态管理（替代 visible, currentMaterial, mode）
  const { visible, data: currentMaterial, open, close } = useModal<MaterialDatabase>();

  // 分页状态管理（替代 queryParams, total）
  const { pagination, onChange, setTotal } = useTablePagination(20);

  // ===== 保留的状态 =====
  const [dataList, setDataList] = useState<MaterialDatabase[]>([]);
  const [loading, setLoading] = useState(false);
  const [smartError, setSmartError] = useState<SmartErrorInfo | null>(null);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [statusValue, setStatusValue] = useState('');
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [form] = Form.useForm();
  const [imageFiles, setImageFiles] = useState<UploadFile[]>([]);
  const [returnTarget, setReturnTarget] = useState<MaterialDatabase | null>(null);
  const [returnLoading, setReturnLoading] = useState(false);
  const showSmartErrorNotice = React.useMemo(() => isSmartFeatureEnabled('smart.production.precheck.enabled'), []);

  const reportSmartError = (title: string, reason?: string, code?: string) => {
    if (!showSmartErrorNotice) return;
    setSmartError({
      title,
      reason,
      code,
      actionText: '刷新重试',
    });
  };

  // ===== 获取列表函数 =====
  const fetchList = async () => {
    setLoading(true);
    try {
      const fullQueryParams: MaterialDatabaseQueryParams = {
        page: pagination.current,
        pageSize: pagination.pageSize,
        keyword: searchKeyword || undefined,
        materialType: statusValue || undefined,
      };

      const res = await api.get<{ code: number; data: { records: MaterialDatabase[]; total: number } }>(
        '/material/database/list',
        { params: fullQueryParams }
      );
      const data = unwrapApiData<{ records?: MaterialDatabase[]; total?: number }>(
        res as any,
        '获取物料资料库列表失败'
      );
      const records = Array.isArray(data?.records) ? data.records : [];
      setDataList(records as MaterialDatabase[]);
      setTotal(Number(data?.total || 0) || 0);
      if (showSmartErrorNotice) setSmartError(null);
    } catch (error) {
      const errMessage = (error as Error)?.message || '获取物料资料库列表失败';
      reportSmartError('物料资料库加载失败', errMessage, 'MATERIAL_DATABASE_LOAD_FAILED');
      message.error(errMessage);
    } finally {
      setLoading(false);
    }
  };

  // 当分页或筛选条件变化时重新获取列表
  useEffect(() => {
    fetchList();

  }, [
    pagination.current,
    pagination.pageSize,
    searchKeyword,
    statusValue,
  ]);

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

  // ===== 优化弹窗打开/关闭逻辑 =====
  // 打开新建/编辑弹窗
  const openDialog = (dialogMode: 'create' | 'edit', record?: MaterialDatabase) => {
    if (dialogMode === 'edit' && record) {
      open(record); // 自动设置 visible=true + data=record
      form.setFieldsValue({
        ...record,
        materialType: getBaseMaterialType(record.materialType || 'accessory'),
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
      open(); // 仅设置 visible=true（create模式）
      form.resetFields();
      setImageFiles([]);
    }
  };

  // 关闭弹窗
  const closeDialog = () => {
    close(); // 自动设置 visible=false + data=null
    form.resetFields();
    setImageFiles([]);
  };

  // ===== 使用 useRequest 优化表单提交 =====
  const { run: handleSubmit, loading: submitLoading } = useRequest(
    async () => {
      const values = (await form.validateFields()) as any;
      const status = String(values?.status || 'pending').trim();

      const { createTime: _createTime, completedTime: _completedTime, ...rest } = values as any;
      const payload: Record<string, unknown> = {
        ...rest,
        materialType: getBaseMaterialType(values?.materialType || 'accessory'),
        status: status === 'completed' ? 'completed' : 'pending',
        image: String(values?.image || '').trim() || undefined,
      };

      const mode = currentMaterial ? 'edit' : 'create';

      if (mode === 'create') {
        unwrapApiData<boolean>(
          await api.post<{ code: number; message: string; data: boolean }>('/material/database', payload),
          '新增失败'
        );
        return '新增成功';
      } else {
        unwrapApiData<boolean>(
          await api.put<{ code: number; message: string; data: boolean }>('/material/database', {
            ...payload,
            id: currentMaterial?.id,
          }),
          '保存失败'
        );
        return '保存成功';
      }
    },
    {
      manual: true,
      onSuccess: () => {
        close();
        fetchList();
      },
      onError: (error) => {
        const formError = error as { errorFields?: Array<{ errors?: string[] }> };
        if (formError?.errorFields?.length) {
          const firstError = formError.errorFields[0];
          message.error(firstError?.errors?.[0] || '表单验证失败');
        }
      },
    }
  );

  // 删除物料
  const handleDelete = async (record: MaterialDatabase) => {
    const id = String(record?.id || '').trim();
    if (!id) {
      message.error('记录缺少ID');
      return;
    }
    modal.confirm({
      width: '30vw',
      title: '确认删除',
      content: '删除后不可恢复，是否继续？',
      okText: '删除',
      cancelText: '取消',
      okButtonProps: { danger: true, type: 'default' },
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
    modal.confirm({
      width: '30vw',
      title: '确认完成',
      content: '确认将该物料标记为已完成？完成后需退回才能再次编辑。',
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

  // 退回编辑 - 打开 RejectReasonModal
  const handleReturn = (record: MaterialDatabase) => {
    setReturnTarget(record);
  };

  // 退回确认回调
  const handleReturnConfirm = async (reason: string) => {
    const id = String(returnTarget?.id || '').trim();
    if (!id) return;
    setReturnLoading(true);
    try {
      unwrapApiData<boolean>(
        await api.put<{ code: number; message: string; data: boolean }>(
          `/material/database/${encodeURIComponent(id)}/return`,
          reason ? { reason } : {}
        ),
        '退回失败'
      );
      message.success('退回成功');
      setReturnTarget(null);
      fetchList();
    } finally {
      setReturnLoading(false);
    }
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
            src={getFullAuthedFileUrl(image)}
            alt="物料图片"
            style={{
              width: 40,
              height: 'auto',
              display: 'block',
            }}
          />
        );
      }
    },
    {
      title: '物料编号',
      dataIndex: 'materialCode',
      key: 'materialCode',
      width: 120,
    },
    {
      title: '物料名称',
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
      render: (v: unknown) => <MaterialTypeTag value={v} />,
    },
    {
      title: '颜色',
      dataIndex: 'color',
      key: 'color',
      width: 100,
      ellipsis: true,
    },
    {
      title: '规格/幅宽',
      key: 'specWidth',
      width: 140,
      ellipsis: true,
      render: (_: unknown, record: MaterialDatabase) => formatMaterialSpecWidth(record.specifications, record.fabricWidth),
    },
    {
      title: '克重',
      dataIndex: 'fabricWeight',
      key: 'fabricWeight',
      width: 90,
      ellipsis: true,
    },
    {
      title: '成分',
      dataIndex: 'fabricComposition',
      key: 'fabricComposition',
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
      render: (_: unknown, record: MaterialDatabase) => (
        <SupplierNameTooltip
          name={record.supplierName}
          contactPerson={(record as any).supplierContactPerson}
          contactPhone={(record as any).supplierContactPhone}
        />
      ),
    },
    {
      title: '单价(元)',
      dataIndex: 'unitPrice',
      key: 'unitPrice',
      width: 100,
      align: 'right' as const,
      render: (value: unknown) => renderMaskedNumber(value, user),
    },
    {
      title: '换算',
      dataIndex: 'conversionRate',
      key: 'conversionRate',
      width: 130,
      align: 'right' as const,
      render: (value: unknown) => {
        const num = Number(value);
        return Number.isFinite(num) && num > 0 ? `${num} 米/公斤` : '-';
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
      {showSmartErrorNotice && smartError ? (
        <Card size="small" style={{ marginBottom: 12 }}>
          <SmartErrorNotice
            error={smartError}
            onFix={() => {
              void fetchList();
            }}
          />
        </Card>
      ) : null}
        <Card>
          {/* 页面标题 */}
          <div style={{ marginBottom: 16 }}>
            <h2 style={{ margin: 0 }}> 物料资料库</h2>
          </div>

          {/* 筛选区 */}
          <Card size="small" style={{ marginBottom: 16, background: '#fafafa' }}>
            <StandardToolbar
              left={(
                <StandardSearchBar
                  searchValue={searchKeyword}
                  onSearchChange={setSearchKeyword}
                  searchPlaceholder="搜索物料编号/名称"
                  dateValue={dateRange}
                  onDateChange={setDateRange}
                  statusValue={statusValue}
                  onStatusChange={setStatusValue}
                  showDatePresets={false}
                  statusOptions={[
                    { label: '全部', value: '' },
                    { label: '面料', value: 'fabric' },
                    { label: '里料', value: 'lining' },
                    { label: '辅料', value: 'accessory' },
                  ]}
                />
              )}
              right={(
                <Button type="primary" onClick={() => openDialog('create')}>
                  新增物料信息
                </Button>
              )}
            />
          </Card>

          {/* 表格区 */}
          <ResizableTable<MaterialDatabase>
            columns={columns}
            dataSource={dataList}
            rowKey={(r) => String(r?.id || r?.materialCode || '')}
            loading={loading}
            stickyHeader
            scroll={{ x: 'max-content' }}
            size={isMobile ? 'small' : 'middle'}
            pagination={{
              ...pagination,
              simple: false,
              showTotal: (t) => `共 ${t} 条`,
              showSizeChanger: true,
              pageSizeOptions: ['20', '50', '100', '200'],
              onChange,
              size: isMobile ? 'small' : 'default',
            }}
          />
        </Card>

        {/* 新增/编辑弹窗 */}
        <StandardModal
          title={currentMaterial ? '编辑物料信息' : '新增物料信息'}
          open={visible}
          onCancel={closeDialog}
          size="lg"
          footer={[
            <Button key="cancel" onClick={closeDialog}>
              取消
            </Button>,
            <Button key="submit" type="primary" loading={submitLoading} onClick={() => handleSubmit()}>
              {currentMaterial ? '保存' : '创建'}
            </Button>,
          ]}
        >
          <Form form={form} layout="vertical" size={isMobile ? 'small' : 'middle'}>
            <Row gutter={[12, 8]}>
              <Col xs={24} sm={8} md={6} lg={4} xl={4}>
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
              <Col xs={24} sm={8} md={6} lg={5} xl={4}>
                <Form.Item
                  name="materialCode"
                  label="物料编号"
                  rules={[{ required: true, message: '请输入物料编号' }]}
                >
                  <Input placeholder="请输入物料编号" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={8} md={6} lg={5} xl={4}>
                <Form.Item
                  name="materialName"
                  label="物料名称"
                  rules={[{ required: true, message: '请输入物料名称' }]}
                >
                  <Input placeholder="请输入物料名称" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={8} md={6} lg={5} xl={4}>
                <Form.Item name="styleNo" label="款号">
                  <Input placeholder="请输入款号" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={8} md={6} lg={5} xl={4}>
                <Form.Item
                  name="materialType"
                  label="物料类型"
                  rules={[{ required: true, message: '请选择物料类型' }]}
                >
                  <Select placeholder="请选择物料类型">
                    <Option value="fabric">面料</Option>
                    <Option value="lining">里料</Option>
                    <Option value="accessory">辅料</Option>
                  </Select>
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={[12, 8]}>
              <Col xs={24} sm={8} md={6} lg={5} xl={4}>
                <Form.Item name="color" label="颜色">
                  <Input placeholder="请输入颜色" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={8} md={6} lg={5} xl={4}>
                <Form.Item name="specifications" label="规格/幅宽">
                  <Input placeholder="如：150cm 或请输入规格" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={8} md={6} lg={5} xl={4}>
                <Form.Item
                  name="unit"
                  label="单位"
                  rules={[{ required: true, message: '请输入单位' }]}
                >
                  <Input placeholder="请输入单位" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={8} md={6} lg={5} xl={4}>
                <Form.Item
                  name="supplierName"
                  label="供应商"
                  rules={[{ required: true, message: '请输入供应商' }]}
                >
                  <SupplierSelect
                    placeholder="请选择或输入供应商"
                    onChange={(value, option) => {
                      form.setFieldsValue({
                        supplierName: value,
                        supplierId: option?.supplierId,
                        supplierContactPerson: option?.supplierContactPerson,
                        supplierContactPhone: option?.supplierContactPhone
                      });
                    }}
                  />
                </Form.Item>
                {/* 隐藏字段：供应商ID和联系信息 */}
                <Form.Item name="supplierId" hidden>
                  <Input />
                </Form.Item>
                <Form.Item name="supplierContactPerson" hidden>
                  <Input />
                </Form.Item>
                <Form.Item name="supplierContactPhone" hidden>
                  <Input />
                </Form.Item>
              </Col>
              <Col xs={24} sm={8} md={6} lg={4} xl={4}>
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
              <Col xs={24} sm={8} md={6} lg={4} xl={4}>
                <Form.Item name="conversionRate" label="换算">
                  <InputNumber
                    placeholder="如：3"
                    style={{ width: '100%' }}
                    min={0}
                    step={0.01}
                    precision={4}
                  />
                </Form.Item>
              </Col>
            </Row>

            {/* 面料属性（仅面料类型显示） */}
            <Form.Item noStyle shouldUpdate={(prevValues, currentValues) => prevValues.materialType !== currentValues.materialType}>
              {({ getFieldValue }) => {
                const materialType = getFieldValue('materialType');
                const mt = String(materialType || '').toLowerCase();
                const showAttributes = mt === 'fabric' || mt === 'lining' || mt === 'accessory';
                if (!showAttributes) return null;
                return (
                  <Row gutter={[12, 8]}>
                    <Col xs={24}>
                      <div style={{
                        fontSize: 'var(--font-size-sm)',
                        fontWeight: 600,
                        marginTop: 4,
                        marginBottom: 8,
                        color: 'var(--primary-color)'
                      }}>
                         面料属性
                      </div>
                    </Col>
                    <Col xs={24} sm={8} md={6} lg={5} xl={4}>
                      <Form.Item name="fabricWeight" label="克重">
                        <Input placeholder="如：200g/m²" />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={8} md={6} lg={5} xl={4}>
                      <Form.Item name="fabricComposition" label="成分">
                        <Input placeholder="如：100%棉" />
                      </Form.Item>
                    </Col>
                  </Row>
                );
              }}
            </Form.Item>

            <Row gutter={[12, 8]}>
              <Col xs={24} sm={12} md={8} lg={6} xl={5}>
                <Form.Item name="description" label="描述">
                  <Input placeholder="请输入描述" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} md={8} lg={6} xl={5}>
                <Form.Item name="createTime" label="创建时间">
                  <Input type="datetime-local" placeholder="系统自动生成" disabled />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} md={8} lg={6} xl={5}>
                <Form.Item name="completedTime" label="完成时间">
                  <Input type="datetime-local" placeholder="完成后自动生成" disabled />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} md={8} lg={6} xl={5}>
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

            <Row gutter={[12, 8]}>
              <Col xs={24}>
                <Form.Item name="remark" label="备注">
                  <Input.TextArea
                    placeholder="请输入备注"
                    autoSize={{ minRows: 2, maxRows: 4 }}
                  />
                </Form.Item>
              </Col>
            </Row>
          </Form>
        </StandardModal>

        {/* 退回原因弹窗 */}
        <RejectReasonModal
          open={returnTarget !== null}
          title="确认退回编辑"
          description="退回后该物料将恢复为待处理状态，可重新编辑。"
          fieldLabel="退回原因"
          placeholder="请填写退回原因（可选）"
          required={false}
          okText="确认退回"
          loading={returnLoading}
          onOk={handleReturnConfirm}
          onCancel={() => setReturnTarget(null)}
        />
    </Layout>
  );
};

export default MaterialDatabasePage;
