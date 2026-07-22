import React from 'react';
import PageLayout from '@/components/common/PageLayout';
import ResizableModal from '@/components/common/ResizableModal';
import ResizableTable from '@/components/common/ResizableTable';
import PaymentAccountManager from '@/components/common/PaymentAccountManager';
import RejectReasonModal from '@/components/common/RejectReasonModal';
import StandardSearchBar from '@/components/common/StandardSearchBar';
import StandardToolbar from '@/components/common/StandardToolbar';
import SchemaPrint from '@/components/common/SchemaPrint';
import { Button, Card, Space, Tabs, Tag } from 'antd';
import { PlusOutlined, SettingOutlined, ShopOutlined } from '@ant-design/icons';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import { DEFAULT_PAGE_SIZE_OPTIONS } from '@/utils/pageSizeStore';
import { Factory as FactoryType } from '@/types/system';
import CustomerManagementTab from './CustomerManagementTab';
import SupplierUserManager from './SupplierUserManager';
import FactoryFormModal from './components/FactoryFormModal';
import FactoryStatsCards from './components/FactoryStatsCards';
import { logColumns } from './factoryListColumns';
import { getDepartmentLabel } from './factoryListHelpers';
import { useFactoryListData } from './useFactoryListData';

const FactoryList: React.FC = () => {
  const {
    isMobile, modalWidth, modalInitialHeight,
    form, businessLicenseUrl,
    factoryModal, logModal,
    remarkModalState, setRemarkModalState, remarkLoading,
    dialogMode, setDialogMode,
    managementTab, activeTab,
    handleManagementTabChange, handleTabChange,
    queryParams, setQueryParams,
    factoryCodeInput: _factoryCodeInput, setFactoryCodeInput,
    factoryNameInput, setFactoryNameInput,
    factoryList, total, loading,
    smartError, showSmartErrorNotice, fetchFactories,
    submitLoading,
    logLoading, logRecords, logTitle, setLogRecords,
    departmentOptions, userOptions,
    fieldConfigs, customFields,
    accountModalOpen, setAccountModalOpen, accountFactory,
    supplierUserModalOpen, setSupplierUserModalOpen, supplierUserFactory,
    factoryStats,
    columns,
    openDialog, closeDialog,
    handleRemarkConfirm,
    handleSave,
    goToFieldConfig,
  } = useFactoryListData();

  return (
    <>
      <PageLayout
        title={
          <span style={{ display: 'flex', alignItems: 'center' }}>
            <ShopOutlined style={{ marginRight: 8, fontSize: 22, color: 'var(--primary-color, var(--color-primary))' }} />
            <span style={{ fontSize: 22, fontWeight: 700 }}>
              {managementTab === 'customer' ? '客户管理' : '供应商管理'}
            </span>
          </span>
        }
        headerContent={
          <>
            {showSmartErrorNotice && smartError ? (
              <Card style={{ marginBottom: 12 }}>
                <SmartErrorNotice error={smartError} onFix={() => { void fetchFactories(); }} />
              </Card>
            ) : null}

            {/* ===== 供应商统计卡片 ===== */}
            {managementTab === 'supplier' && (
              <FactoryStatsCards total={total} factoryStats={factoryStats} />
            )}
          </>
        }
        titleExtra={
          managementTab === 'supplier' && (
            <Space>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => openDialog('create')}>
                新增供应商
              </Button>
            </Space>
          )
        }
      >
        <Tabs
          activeKey={managementTab}
          onChange={handleManagementTabChange}
          items={[
            {
              key: 'supplier',
              label: '供应商管理',
              children: (
                <>
                  <Tabs
                    activeKey={activeTab}
                    onChange={handleTabChange}
                    style={{ marginBottom: 8 }}
                    items={[
                      { key: 'ALL', label: '全部' },
                      { key: 'MATERIAL', label: '面辅料供应商' },
                      { key: 'OUTSOURCE', label: '外发供应商' },
                    ]}
                  />
                  <StandardToolbar
                    left={
                      <StandardSearchBar
                        searchValue={factoryNameInput}
                        onSearchChange={(value) => setFactoryNameInput(value)}
                        searchPlaceholder="搜索供应商名称"
                        showDate={false}
                        showStatus={true}
                        statusValue={((queryParams as any)?.status || '') as string}
                        onStatusChange={(value: string) => setQueryParams((prev) => ({ ...prev, status: value || undefined, page: 1 }))}
                        statusOptions={[
                          { value: '', label: '全部状态' },
                          { value: 'active', label: '启用' },
                          { value: 'inactive', label: '停用' },
                        ]}
                        showSearchButton={true}
                        onSearch={() => setQueryParams((prev) => ({ ...prev, page: 1 }))}
                        showResetButton={true}
                        onReset={() => {
                          setFactoryCodeInput('');
                          setFactoryNameInput('');
                          setQueryParams({
                            page: 1,
                            pageSize: queryParams.pageSize,
                            supplierType: activeTab === 'ALL' ? undefined : activeTab,
                          });
                        }}
                        extraFilters={[
                          {
                            key: 'factoryCode',
                            label: '供应商编码',
                            type: 'text' as const,
                            placeholder: '供应商编码',
                            width: 140,
                          },
                          {
                            key: 'factoryType',
                            label: '内外标签',
                            type: 'select' as const,
                            placeholder: '内外标签',
                            width: 120,
                            options: [
                              { value: 'INTERNAL', label: '内部' },
                              { value: 'EXTERNAL', label: '外部' },
                            ],
                          },
                          {
                            key: 'parentOrgUnitId',
                            label: '归属部门',
                            type: 'select' as const,
                            placeholder: '归属部门',
                            width: 180,
                            options: departmentOptions.map((item) => ({
                              value: String(item.id || ''),
                              label: getDepartmentLabel(item),
                            })),
                          },
                        ]}
                        onFilterChange={(key: string, value: any) => {
                          if (key === 'factoryCode') setFactoryCodeInput(value || '');
                          if (key === 'factoryType') setQueryParams((prev) => ({ ...prev, factoryType: value || undefined, page: 1 }));
                          if (key === 'parentOrgUnitId') setQueryParams((prev) => ({ ...prev, parentOrgUnitId: value || undefined, page: 1 }));
                        }}
                        collapsed={true}
                      />
                    }
                    right={
                      <Space size={8}>
                        <a onClick={goToFieldConfig} style={{ fontSize: 13 }}>
                          <SettingOutlined /> 字段配置
                        </a>
                        <SchemaPrint
                          mode="list"
                          fields={fieldConfigs}
                          data={factoryList as unknown as Record<string, unknown>[]}
                          title="供应商列表"
                          subtitle={`${activeTab === 'ALL' ? '全部' : activeTab === 'MATERIAL' ? '面辅料' : '外发'} · 共 ${total} 家`}
                          buttonText="打印列表"
                          type="default"
                        />
                        <Tag color="blue" style={{ marginRight: 0 }}>
                          {activeTab === 'ALL' ? '全部' : activeTab === 'MATERIAL' ? '面辅料' : '外发'} · 共 {total} 家
                        </Tag>
                        <Button type="primary" onClick={() => openDialog('create')}>
                          {activeTab === 'OUTSOURCE' ? '新增外发供应商' : '新增面辅料供应商'}
                        </Button>
                      </Space>
                    }
                  />
                  <ResizableTable<FactoryType>
                    storageKey="system-factory-table"
                    rowKey={(r) => String(r.id || r.factoryCode)}
                    columns={columns as any}
                    dataSource={factoryList}
                    loading={loading}
                    pagination={{
                      current: queryParams.page,
                      pageSize: queryParams.pageSize,
                      total,
                      showSizeChanger: true,
                      showQuickJumper: true,
                      showTotal: (t) => `共 ${t} 条`,
                      pageSizeOptions: [...DEFAULT_PAGE_SIZE_OPTIONS],
                      onChange: (page, pageSize) => setQueryParams((prev) => ({ ...prev, page, pageSize })),
                    }}
                    stickyHeader
                    scroll={{ x: 'max-content' }}
                    showExport={true}
                    exportFilename="供应商列表.xlsx"
                    emptyDescription="暂无供应商数据"
                  />
                </>
              ),
            },
            {
              key: 'customer',
              label: '客户管理',
              children: <CustomerManagementTab active={managementTab === 'customer'} />,
            },
          ]}
        />
      </PageLayout>

      <FactoryFormModal
        open={factoryModal.visible}
        mode={dialogMode}
        form={form}
        submitLoading={submitLoading}
        modalWidth={modalWidth}
        isMobile={isMobile}
        initialHeight={modalInitialHeight}
        departmentOptions={departmentOptions}
        userOptions={userOptions}
        businessLicenseUrl={businessLicenseUrl}
        customFields={customFields}
        fieldConfigs={fieldConfigs}
        factoryData={factoryModal.data ?? null}
        onCancel={closeDialog}
        onOk={handleSave}
        onEdit={() => setDialogMode('edit')}
      />

      <ResizableModal
        open={logModal.visible}
        title={logTitle}
        onCancel={() => { logModal.close(); setLogRecords([]); }}
        footer={null}
        width={modalWidth}
        initialHeight={typeof window !== 'undefined' ? window.innerHeight * 0.85 : 800}
        minWidth={isMobile ? 320 : 520}
        scaleWithViewport
      >
        <ResizableTable
          columns={logColumns as any}
          dataSource={logRecords}
          rowKey={(r) => String(r.id || `${r.bizType}-${r.bizId}-${r.createTime}`)}
          loading={logLoading}
          pagination={false}
          scroll={{ x: 'max-content' }}
          emptyDescription="暂无日志数据"
        />
      </ResizableModal>

      <PaymentAccountManager
        open={accountModalOpen}
        ownerType="FACTORY"
        ownerId={accountFactory.id}
        ownerName={accountFactory.name}
        onClose={() => setAccountModalOpen(false)}
      />

      <SupplierUserManager
        open={supplierUserModalOpen}
        supplierId={supplierUserFactory.id}
        supplierName={supplierUserFactory.name}
        onClose={() => setSupplierUserModalOpen(false)}
      />

      <RejectReasonModal
        open={remarkModalState?.open === true}
        title={remarkModalState?.title ?? ''}
        okText={remarkModalState?.okText}
        okDanger={remarkModalState?.okDanger ?? false}
        fieldLabel="操作原因"
        placeholder="请输入操作原因（必填）"
        required
        loading={remarkLoading}
        onOk={handleRemarkConfirm}
        onCancel={() => setRemarkModalState(null)}
      />
    </>
  );
};

export default FactoryList;
