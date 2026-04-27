import React, { useMemo } from 'react';
import { Button, Card, Col, Form, Input, InputNumber, Row, Select, Space, Tabs, Tag, Tooltip } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';
import PageLayout from '@/components/common/PageLayout';
import ResizableModal from '@/components/common/ResizableModal';
import RowActions from '@/components/common/RowActions';
import ResizableTable from '@/components/common/ResizableTable';
import PaymentAccountManager from '@/components/common/PaymentAccountManager';
import RejectReasonModal from '@/components/common/RejectReasonModal';
import { Factory as FactoryType, OrganizationUnit } from '@/types/system';
import ImageUploadBox from '@/components/common/ImageUploadBox';
import { formatDateTime } from '@/utils/datetime';
import { useViewport } from '@/utils/useViewport';
import { useNavigate } from 'react-router-dom';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import { paths } from '@/routeConfig';
import { DEFAULT_PAGE_SIZE_OPTIONS } from '@/utils/pageSizeStore';
import CustomerManagementTab from './CustomerManagementTab';
import SupplierUserManager from './SupplierUserManager';
import { useFactoryListData } from './useFactoryListData';

const getDepartmentLabel = (item?: OrganizationUnit | null) => {
  const pathLabel = String(item?.pathNames ?? '').trim();
  const nodeLabel = String(item?.unitName ?? item?.nodeName ?? '').trim();
  return pathLabel || nodeLabel || '未命名部门';
};

const FactoryList: React.FC = () => {
  const { isMobile, modalWidth } = useViewport();
  const navigate = useNavigate();
  const tierColorMap: Record<string, string> = { S: '#f7a600', A: '#39ff14', B: '#4fc3f7', C: '#ff4136' };

  const {
    form, factoryModal, logModal, remarkModalState, setRemarkModalState, remarkLoading,
    dialogMode, managementTab, setManagementTab, activeTab, setActiveTab,
    queryParams, setQueryParams, factoryCodeInput, setFactoryCodeInput, factoryNameInput, setFactoryNameInput,
    factoryList, total, loading, smartError, showSmartErrorNotice, submitLoading,
    logLoading, logRecords, logTitle, departmentOptions, userOptions,
    accountModalOpen, setAccountModalOpen, accountFactory, setAccountFactory,
    supplierUserModalOpen, setSupplierUserModalOpen, supplierUserFactory, setSupplierUserFactory,
    scorecardMap, scorecardLoading, loadScorecardOnce,
    openDialog, closeDialog, handleRemarkConfirm, openLogModal,
    handleSave, handleDelete, fetchFactories,
    handleTabChange, handleManagementTabChange,
  } = useFactoryListData();

  const businessLicenseUrl = Form.useWatch('businessLicense', form) as string | undefined;

  const getStatusText = (status: string) => {
    const statusMap: Record<string, string> = { active: '启用', inactive: '停用' };
    return statusMap[status] || '未知';
  };

  const logColumns = [
    { title: '动作', dataIndex: 'action', key: 'action', width: 120, render: (v: string) => v || '-' },
    { title: '操作人', dataIndex: 'operator', key: 'operator', width: 120, render: (v: string) => v || '-' },
    { title: '原因', dataIndex: 'remark', key: 'remark', render: (v: string) => v || '-' },
    { title: '时间', dataIndex: 'createTime', key: 'createTime', width: 180, render: (v: string) => formatDateTime(v) },
  ];

  const columns = [
    { title: '供应商编码', dataIndex: 'factoryCode', key: 'factoryCode', width: 140 },
    {
      title: '供应商名称', dataIndex: 'factoryName', key: 'factoryName', width: 200, ellipsis: true,
      render: (name: string) => {
        const score = scorecardMap[name];
        const tooltipContent = scorecardLoading ? (
          <span style={{ color: 'rgba(255,255,255,0.6)' }}>加载中...</span>
        ) : score ? (
          <div style={{ fontSize: 12, lineHeight: 1.8, minWidth: 160 }}>
            <div style={{ marginBottom: 4 }}>
              <Tag color={tierColorMap[score.tier] ?? '#888'} style={{ fontWeight: 700, fontSize: 12 }}>{score.tier}级</Tag>
              <span style={{ color: tierColorMap[score.tier] ?? '#ccc', fontWeight: 600 }}>综合分 {score.overallScore?.toFixed(1)}</span>
            </div>
            <div>准时率：<span style={{ color: score.onTimeRate >= 0.9 ? '#39ff14' : score.onTimeRate >= 0.75 ? '#f7a600' : '#ff4136' }}>{(score.onTimeRate * 100).toFixed(0)}%</span></div>
            <div>质量分：<span style={{ color: score.qualityScore >= 90 ? '#39ff14' : score.qualityScore >= 75 ? '#f7a600' : '#ff4136' }}>{score.qualityScore?.toFixed(1)}</span></div>
            <div>已完成 / 总接单：{score.completedOrders} / {score.totalOrders} 单</div>
            <div>逾期：{score.overdueOrders} 单</div>
          </div>
        ) : (<span style={{ color: 'rgba(255,255,255,0.5)' }}>暂无评分数据</span>);
        return (
          <Tooltip title={tooltipContent} onOpenChange={(open) => { if (open) void loadScorecardOnce(); }} mouseEnterDelay={0.3} styles={{ container: { minWidth: 180 } }}>
            <span style={{ cursor: 'default', borderBottom: '1px dashed rgba(0,0,0,0.25)', paddingBottom: 1 }}>{name}</span>
          </Tooltip>
        );
      },
    },
    { title: '归属架构', dataIndex: 'orgPath', key: 'orgPath', width: 260, ellipsis: true, render: (_: string, record: FactoryType) => record.orgPath || record.parentOrgUnitName || '-' },
    { title: '内外标签', dataIndex: 'factoryType', key: 'factoryType', width: 110, render: (v: string) => { if (v === 'INTERNAL') return <Tag color="blue">内部</Tag>; if (v === 'EXTERNAL') return <Tag color="purple">外部</Tag>; return <Tag>未标记</Tag>; } },
    { title: '类型', dataIndex: 'supplierType', key: 'supplierType', width: 110, render: (v: string) => { if (v === 'MATERIAL') return <Tag color="blue">面辅料</Tag>; if (v === 'OUTSOURCE') return <Tag color="orange">外发厂</Tag>; return <Tag>未分类</Tag>; } },
    { title: '评级', dataIndex: 'supplierTier', key: 'supplierTier', width: 70, render: (v: string) => { if (!v) return '-'; const colorMap: Record<string, string> = { S: 'gold', A: 'green', B: 'blue', C: 'red' }; return <Tag color={colorMap[v] || 'default'} style={{ fontWeight: 700 }}>{v}</Tag>; } },
    { title: '准入', dataIndex: 'admissionStatus', key: 'admissionStatus', width: 90, render: (v: string) => { const map: Record<string, { color: string; text: string }> = { approved: { color: 'green', text: '已通过' }, pending: { color: 'orange', text: '待审核' }, probation: { color: 'blue', text: '试用中' }, rejected: { color: 'red', text: '已拒绝' }, suspended: { color: 'default', text: '已暂停' } }; const item = map[v] || { color: 'default', text: v || '-' }; return <Tag color={item.color}>{item.text}</Tag>; } },
    { title: '综合分', dataIndex: 'overallScore', key: 'overallScore', width: 80, render: (v: number) => v != null ? <span style={{ fontWeight: 600, color: v >= 90 ? '#52c41a' : v >= 75 ? '#1890ff' : v >= 60 ? '#faad14' : '#ff4d4f' }}>{v.toFixed(1)}</span> : '-' },
    { title: '联系人', dataIndex: 'contactPerson', key: 'contactPerson', width: 120 },
    { title: '联系电话', dataIndex: 'contactPhone', key: 'contactPhone', width: 140 },
    { title: '地址', dataIndex: 'address', key: 'address', ellipsis: true },
    { title: '状态', dataIndex: 'status', key: 'status', width: 110, render: (v: unknown) => { const status = String(v || '').trim() || 'inactive'; if (status === 'active') return <Tag color="success">{getStatusText(status)}</Tag>; return <Tag>{getStatusText(status)}</Tag>; } },
    { title: '创建时间', dataIndex: 'createTime', key: 'createTime', width: 180, render: (v: unknown) => formatDateTime(v) },
    {
      title: '操作', key: 'actions', width: 220, fixed: 'right' as const,
      render: (_: any, factory: FactoryType) => (
        <RowActions className="table-actions" maxInline={2} actions={[
          { key: 'view', label: '查看', title: '查看', onClick: () => openDialog('view', factory), primary: true },
          { key: 'edit', label: '编辑', title: '编辑', onClick: () => openDialog('edit', factory), primary: true },
          ...(factory.supplierType === 'OUTSOURCE' ? [{ key: 'workers', label: '工人管理', title: '工人管理', onClick: () => { const params = new URLSearchParams(); if (factory.id) params.set('factoryId', String(factory.id)); if (factory.factoryName) params.set('factoryName', factory.factoryName); navigate(`${paths.factoryWorkers}?${params.toString()}`); } }] : []),
          ...(factory.supplierType === 'MATERIAL' ? [{ key: 'supplierUser', label: '账号管理', title: '供应商登录账号管理', onClick: () => { setSupplierUserFactory({ id: String(factory.id || ''), name: factory.factoryName || '' }); setSupplierUserModalOpen(true); } }] : []),
          { key: 'account', label: '收款账户', title: '收款账户', onClick: () => { setAccountFactory({ id: String(factory.id || ''), name: factory.factoryName || '' }); setAccountModalOpen(true); } },
          { key: 'log', label: '日志', title: '日志', onClick: () => openLogModal('factory', String(factory.id || ''), `供应商 ${factory.factoryName} 操作日志`) },
          { key: 'delete', label: '删除', title: '删除', danger: true, onClick: () => handleDelete(factory.id) },
        ]} />
      ),
    },
  ];

  const modalInitialHeight = typeof window !== 'undefined' ? window.innerHeight * 0.85 : 800;

  return (
    <>
      <PageLayout title={managementTab === 'customer' ? '客户管理' : '供应商管理'} headerContent={showSmartErrorNotice && smartError ? (<Card size="small" style={{ marginBottom: 12 }}><SmartErrorNotice error={smartError} onFix={() => { void fetchFactories(); }} /></Card>) : null}>
        <Tabs activeKey={managementTab} onChange={handleManagementTabChange} items={[
          { key: 'supplier', label: '供应商管理', children: (
            <>
              <Tabs activeKey={activeTab} onChange={handleTabChange} style={{ marginBottom: 8 }} items={[{ key: 'ALL', label: '全部' }, { key: 'MATERIAL', label: '面辅料供应商' }, { key: 'OUTSOURCE', label: '外发供应商' }]} />
              <Card size="small" className="filter-card mb-sm">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', flexWrap: 'wrap', gap: 16 }}>
                  <Space wrap size={12}>
                    <Input placeholder="供应商编码" style={{ width: 180 }} allowClear value={String((queryParams as any)?.factoryCode || '')} onChange={(e) => setFactoryCodeInput(e.target.value)} />
                    <Input placeholder="供应商名称" style={{ width: 220 }} allowClear value={String((queryParams as any)?.factoryName || '')} onChange={(e) => setFactoryNameInput(e.target.value)} />
                    <Select placeholder="状态" style={{ width: 140 }} allowClear value={String((queryParams as any)?.status || '') || undefined} options={[{ value: 'active', label: '启用' }, { value: 'inactive', label: '停用' }]} onChange={(value) => setQueryParams((prev) => ({ ...prev, status: value, page: 1 }))} />
                    <Select placeholder="内外标签" style={{ width: 140 }} allowClear value={String((queryParams as any)?.factoryType || '') || undefined} options={[{ value: 'INTERNAL', label: '内部' }, { value: 'EXTERNAL', label: '外部' }]} onChange={(value) => setQueryParams((prev) => ({ ...prev, factoryType: value, page: 1 }))} />
                    <Select placeholder="归属部门" style={{ width: 220 }} allowClear value={String((queryParams as any)?.parentOrgUnitId || '') || undefined} options={departmentOptions.map((item) => ({ value: String(item.id || ''), label: getDepartmentLabel(item) }))} onChange={(value) => setQueryParams((prev) => ({ ...prev, parentOrgUnitId: value, page: 1 }))} />
                    <Button type="primary" onClick={() => setQueryParams((prev) => ({ ...prev, page: 1 }))}>查询</Button>
                    <Button onClick={() => setQueryParams({ page: 1, pageSize: queryParams.pageSize, supplierType: activeTab === 'ALL' ? undefined : activeTab })}>重置</Button>
                  </Space>
                  <Button type="primary" onClick={() => openDialog('create')}>{activeTab === 'OUTSOURCE' ? '新增外发供应商' : '新增面辅料供应商'}</Button>
                </div>
              </Card>
              <ResizableTable<FactoryType> storageKey="system-factory-table" rowKey={(r) => String(r.id || r.factoryCode)} columns={columns as any} dataSource={factoryList} loading={loading} pagination={{ current: queryParams.page, pageSize: queryParams.pageSize, total, showSizeChanger: true, showQuickJumper: true, showTotal: (t) => `共 ${t} 条`, pageSizeOptions: [...DEFAULT_PAGE_SIZE_OPTIONS], onChange: (page, pageSize) => setQueryParams((prev) => ({ ...prev, page, pageSize })) }} stickyHeader scroll={{ x: 'max-content' }} />
            </>
          )},
          { key: 'customer', label: '客户管理', children: <CustomerManagementTab active={managementTab === 'customer'} /> },
        ]} />
      </PageLayout>
      <ResizableModal open={factoryModal.visible} title={dialogMode === 'create' ? '新增供应商' : dialogMode === 'edit' ? '编辑供应商' : '查看供应商'} onCancel={closeDialog} width={modalWidth} initialHeight={modalInitialHeight} footer={dialogMode === 'view' ? [<Button key="close" onClick={closeDialog}>关闭</Button>] : [<Button key="cancel" onClick={closeDialog}>取消</Button>, <Button key="submit" type="primary" loading={submitLoading} onClick={() => handleSave()}>保存</Button>]}>
        <Form form={form} layout="vertical" disabled={dialogMode === 'view'} size={isMobile ? 'small' : 'middle'}>
          <Row gutter={16}>
            <Col xs={24} sm={12}><Form.Item name="factoryCode" label="供应商编码" rules={[{ required: true, message: '请输入供应商编码' }]}><Input placeholder="请输入供应商编码" /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="factoryName" label="供应商名称" rules={[{ required: true, message: '请输入供应商名称' }]}><Input placeholder="请输入供应商名称" /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="factoryType" label="内外标签" rules={[{ required: true, message: '请选择内外标签' }]}><Select placeholder="请选择" options={[{ value: 'INTERNAL', label: '内部' }, { value: 'EXTERNAL', label: '外部' }]} /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="supplierType" label="供应商类型" rules={[{ required: true, message: '请选择供应商类型' }]}><Select placeholder="请选择" options={[{ value: 'MATERIAL', label: '面辅料供应商' }, { value: 'OUTSOURCE', label: '外发供应商' }]} /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="supplierTier" label="评级"><Select placeholder="请选择评级" allowClear options={[{ value: 'S', label: 'S级' }, { value: 'A', label: 'A级' }, { value: 'B', label: 'B级' }, { value: 'C', label: 'C级' }]} /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="admissionStatus" label="准入状态"><Select placeholder="请选择准入状态" allowClear options={[{ value: 'approved', label: '已通过' }, { value: 'pending', label: '待审核' }, { value: 'probation', label: '试用中' }, { value: 'rejected', label: '已拒绝' }, { value: 'suspended', label: '已暂停' }]} /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="parentOrgUnitId" label="归属部门"><Select placeholder="请选择归属部门" allowClear showSearch optionFilterProp="label" options={departmentOptions.map((item) => ({ value: String(item.id || ''), label: getDepartmentLabel(item) }))} /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="contactPerson" label="联系人"><Input placeholder="请输入联系人" /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="contactPhone" label="联系电话"><Input placeholder="请输入联系电话" /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="email" label="邮箱"><Input placeholder="请输入邮箱" /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="bankName" label="开户行"><Input placeholder="请输入开户行" /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="bankAccount" label="银行账号"><Input placeholder="请输入银行账号" /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="taxNumber" label="税号"><Input placeholder="请输入税号" /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="status" label="状态" initialValue="active"><Select placeholder="请选择状态" options={[{ value: 'active', label: '启用' }, { value: 'inactive', label: '停用' }]} /></Form.Item></Col>
            <Col xs={24}><Form.Item name="address" label="地址"><Input placeholder="请输入地址" /></Form.Item></Col>
            <Col xs={24}><Form.Item name="businessLicense" label="营业执照"><ImageUploadBox value={businessLicenseUrl} onChange={(url) => form.setFieldsValue({ businessLicense: url })} /></Form.Item></Col>
            <Col xs={24}><Form.Item name="remark" label="备注"><Input.TextArea placeholder="请输入备注" autoSize={{ minRows: 2, maxRows: 6 }} /></Form.Item></Col>
          </Row>
        </Form>
      </ResizableModal>

      <ResizableModal open={logModal.visible} title={logTitle} onCancel={() => logModal.close()} width="60vw" initialHeight={Math.round(window.innerHeight * 0.7)} footer={<Button onClick={() => logModal.close()}>关闭</Button>}>
        <ResizableTable storageKey="factory-log-table" rowKey={(r: any) => String(r.id || r.createTime)} columns={logColumns as any} dataSource={logRecords} loading={logLoading} pagination={false} size="small" />
      </ResizableModal>

      <RejectReasonModal open={remarkModalState.open} title="停用原因" description="请填写停用该供应商的原因" fieldLabel="停用原因" placeholder="请输入停用原因" required loading={remarkLoading} onOk={handleRemarkConfirm} onCancel={() => setRemarkModalState((prev: any) => ({ ...prev, open: false }))} />

      {accountFactory && <PaymentAccountManager open={accountModalOpen} onClose={() => { setAccountModalOpen(false); setAccountFactory(null); }} ownerType="FACTORY" ownerId={accountFactory.id} ownerName={accountFactory.name} />}

      {supplierUserFactory && <SupplierUserManager open={supplierUserModalOpen} onClose={() => { setSupplierUserModalOpen(false); setSupplierUserFactory(null); }} supplierId={supplierUserFactory.id} supplierName={supplierUserFactory.name} />}
    </>
  );
};

export default FactoryList;
