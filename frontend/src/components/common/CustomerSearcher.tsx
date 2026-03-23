import React, { useState, useRef, useCallback, useEffect } from 'react';
import { AutoComplete, Spin } from 'antd';
import { customerApi, Customer } from '@/services/crm/customerApi';
import { factoryApi, Factory } from '@/services/system/factoryApi';
import type { FormInstance } from 'antd/es/form';

interface Props {
  form?: FormInstance | null;
  disabled?: boolean;
}


const CustomerSearcher: React.FC<Props> = ({ form, disabled }) => {
  const [options, setOptions] = useState<{ value: string; label: string; key?: string; type?: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<number | null>(null);

  // 合并客户和供应商搜索
  const fetch = useCallback(async (keyword: string) => {
    setLoading(true);
    try {
      // 客户
      const customerRes = await customerApi.list({ page: 1, pageSize: 8, keyword });
      const customerRecords = customerRes.data?.data?.records || customerRes.data?.records || [];
      const customerOpts = (customerRecords as Customer[]).map(r => ({
        value: r.companyName || '',
        label: `客户: ${r.companyName || ''}`,
        key: r.id,
        type: 'customer',
      }));
      // 供应商（工厂）
      const factoryRes = await factoryApi.list({ page: 1, pageSize: 8, factoryName: keyword, supplierType: 'OUTSOURCE' });
      const factoryRecords = factoryRes.data?.data?.records || factoryRes.data?.records || [];
      const factoryOpts = (factoryRecords as Factory[]).map(f => ({
        value: f.factoryName || '',
        label: `供应商: ${f.factoryName || ''}`,
        key: f.id,
        type: 'supplier',
      }));
      setOptions([...customerOpts, ...factoryOpts]);
    } catch (e) {
      setOptions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSearch = (val: string) => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      fetch(val);
    }, 300);
  };

  useEffect(() => {
    fetch('');
  }, [fetch]);

  return (
    <AutoComplete
      disabled={disabled}
      options={options}
      onSearch={handleSearch}
      onSelect={(value, option) => {
        const id = (option as any).key || (option as any).id;
        const type = (option as any).type;
        try {
          form?.setFieldsValue({ customer: value, customerId: id, customerType: type });
        } catch (e) {
          // noop
        }
      }}
      onBlur={(e) => {
        const val = (e.target as HTMLInputElement).value;
        const currentId = form?.getFieldValue?.('customerId');
        if (!val) {
          form?.setFieldsValue?.({ customerId: undefined, customerType: undefined });
        } else if (!currentId) {
          // free text
          form?.setFieldsValue?.({ customerId: undefined, customerType: undefined });
        }
      }}
      placeholder="请选择客户/供应商或直接输入"
      notFoundContent={loading ? <Spin size="small" /> : '无匹配项'}
      allowClear
      style={{ width: '100%' }}
    />
  );
};

export default CustomerSearcher;
