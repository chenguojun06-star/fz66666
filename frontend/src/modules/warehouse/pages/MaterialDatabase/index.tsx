import React, { useEffect, useState } from 'react';
import { Button, Card, Input, Select, Form, Row, Col, InputNumber, Upload } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import StandardModal from '@/components/common/StandardModal';
import StandardSearchBar from '@/components/common/StandardSearchBar';
import RejectReasonModal from '@/components/common/RejectReasonModal';
import StandardToolbar from '@/components/common/StandardToolbar';
import { useUser } from '@/utils/AuthContext';
import ResizableTable from '@/components/common/ResizableTable';
import { MaterialDatabase } from '@/types/production';
import api from '@/utils/api';
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

  const fetchList = async () => {
    setLoading(true);
    try {
      const params: any = {
        page: pagination.current,
        pageSize: pagination.pageSize,
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
  };

  useEffect(() => { fetchList(); }, [pagination.current, pagination.pageSize, searchKeyword, statusValue]);

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

  return (
    <>
      {showSmartErrorNotice && smartError ? (
        <Card size="small" style={{ marginBottom: 12 }}>
          <SmartErrorNotice error={smartError} onFix={() => { void fetchList(); }} />
        </Card>
      ) : null}
      <Card>
        <div style={{ marginBottom: 16 }}><h2 style={{ margin: 0 }}> 物料资料库</h2></div>
        <Card size="small" style={{ marginBottom: 16, background: '#fafafa' }}>
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
                <Upload accept="image/*" listType="picture-card" maxCount={1} fileList={imageFiles}
                  onRemove={() => { form.setFieldsValue({ image: undefined }); setImageFiles([]); return true; }}
                  beforeUpload={(file) => { void uploadImage(file as File); return Upload.LIST_IGNORE; }}>
                  {imageFiles.length ? null : (<div><UploadOutlined /><div style={{ marginTop: 8, fontSize: 'var(--font-size-sm)' }}>上传</div></div>)}
                </Upload>
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
              <Form.Item name="remark" label="备注"><Input.TextArea placeholder="请输入备注" autoSize={{ minRows: 2, maxRows: 4 }} /></Form.Item>
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
