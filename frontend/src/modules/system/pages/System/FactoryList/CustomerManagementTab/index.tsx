import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Form } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useViewport } from '@/utils/useViewport';
import { DEFAULT_PAGE_SIZE, readPageSize } from '@/utils/pageSizeStore';
import { customerApi, type Customer } from '@/services/crm/customerApi';
import { useDebouncedValue } from '@/hooks/usePerformance';
import { useFieldConfig } from '@/hooks/useFieldConfig';
import { paths } from '@/routeConfig';
import { collectExtValues } from '@/components/common/SchemaForm/ExtFieldsSection';
import CustomerFilterBar from './CustomerFilterBar';
import CustomerTable from './CustomerTable';
import CustomerDialog from './CustomerDialog';
import { type DialogMode, type CustomerQueryParams } from './customerHelpers';

interface Props {
  active: boolean;
}

const CustomerManagementTab: React.FC<Props> = ({ active }) => {
  const { message, modal } = App.useApp();
  const [form] = Form.useForm<Customer>();
  const { isMobile, modalWidth } = useViewport();
  const navigate = useNavigate();
  const [dialogMode, setDialogMode] = useState<DialogMode>('view');
  const [modalOpen, setModalOpen] = useState(false);
  const [currentRecord, setCurrentRecord] = useState<Customer | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [queryParams, setQueryParams] = useState<CustomerQueryParams>({
    page: 1,
    pageSize: readPageSize(DEFAULT_PAGE_SIZE),
    keyword: '',
    status: '',
    customerLevel: '',
  });
  const [keywordInput, setKeywordInput] = useState('');
  const debouncedKeyword = useDebouncedValue(keywordInput, 300);

  useEffect(() => {
    if (debouncedKeyword !== (queryParams.keyword || '')) {
      setQueryParams((prev) => ({ ...prev, keyword: debouncedKeyword, page: 1 }));
    }
  }, [debouncedKeyword, queryParams.keyword]);

  const fetchCustomers = useCallback(async () => {
    if (!active) return;
    setLoading(true);
    try {
      const response = await customerApi.list(queryParams);
      if (response.code === 200) {
        setCustomers(response.data.records || []);
        setTotal(response.data.total || 0);
        return;
      }
      message.error(response.message || '获取客户列表失败');
    } catch (error: unknown) {
      message.error(error instanceof Error ? error.message : '获取客户列表失败');
    } finally {
      setLoading(false);
    }
  }, [active, message, queryParams]);

  useEffect(() => {
    void fetchCustomers();
  }, [fetchCustomers]);

  const { fields: fieldConfigs, loading: fieldConfigLoading, refresh: refreshFieldConfigs } = useFieldConfig({
    bizType: 'customer',
    platform: 'pc',
  });

  const customFields = useMemo(
    () => fieldConfigs.filter(f => f.isSystem === 0),
    [fieldConfigs]
  );

  const openDialog = (mode: DialogMode, record?: Customer) => {
    setDialogMode(mode);
    setCurrentRecord(record || null);
    setModalOpen(true);
  };

  const closeDialog = () => {
    setModalOpen(false);
    setCurrentRecord(null);
    form.resetFields();
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      const extJson = collectExtValues(form, customFields, { extJson: currentRecord?.extJson });
      const payload = { ...values, extJson };

      if (dialogMode === 'edit' && currentRecord?.id) {
        const response = await customerApi.update(currentRecord.id, payload);
        if (response.code !== 200) {
          message.error(response.message || '保存失败');
          return;
        }
      } else {
        const response = await customerApi.create(payload);
        if (response.code !== 200) {
          message.error(response.message || '保存失败');
          return;
        }
      }
      message.success('保存成功');
      closeDialog();
      void fetchCustomers();
    } catch (error: unknown) {
      message.error(error instanceof Error ? error.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (record: Customer) => {
    if (!record.id) return;
    modal.confirm({
      title: `确认删除客户「${record.companyName || '未命名客户'}」吗？`,
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        const response = await customerApi.delete(record.id!);
        if (response.code === 200) {
          message.success('删除成功');
          setQueryParams((prev) => ({ ...prev, page: 1 }));
          return;
        }
        throw new Error(response.message || '删除失败');
      },
    });
  };

  const goToFieldConfig = () => {
    navigate(`${paths.fieldConfig}?bizType=customer`);
  };

  return (
    <>
      <CustomerFilterBar
        queryParams={queryParams}
        setQueryParams={setQueryParams}
        setKeywordInput={setKeywordInput}
        fieldConfigs={fieldConfigs}
        customers={customers}
        total={total}
        onGoToFieldConfig={goToFieldConfig}
        onCreate={() => openDialog('create')}
      />
      <CustomerTable
        fieldConfigs={fieldConfigs}
        fieldConfigLoading={fieldConfigLoading}
        customers={customers}
        total={total}
        loading={loading}
        queryParams={queryParams}
        setQueryParams={setQueryParams}
        onView={(record) => openDialog('view', record)}
        onEdit={(record) => openDialog('edit', record)}
        onDelete={handleDelete}
      />
      <CustomerDialog
        open={modalOpen}
        mode={dialogMode}
        form={form}
        currentRecord={currentRecord}
        saving={saving}
        modalWidth={modalWidth}
        isMobile={isMobile}
        fieldConfigs={fieldConfigs}
        customFields={customFields}
        onCancel={closeDialog}
        onSave={handleSave}
        onEdit={() => openDialog('edit', currentRecord!)}
      />
    </>
  );
};

export default CustomerManagementTab;
