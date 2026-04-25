import React, { useState, useEffect, useMemo } from 'react';
import { AutoComplete, Spin } from 'antd';
import type { AutoCompleteProps } from 'antd';
import { customerApi, type Customer } from '@/services/crm/customerApi';

interface CustomerSelectProps extends Omit<AutoCompleteProps, 'options' | 'onChange'> {
  value?: string;
  onChange?: (value: string, option?: {
    customerId: string;
    customer: Customer;
  }) => void;
  placeholder?: string;
  disabled?: boolean;
  style?: React.CSSProperties;
  id?: string;
  className?: string;
}

const CustomerSelect: React.FC<CustomerSelectProps> = ({
  value,
  onChange,
  placeholder = '请选择或输入客户',
  disabled = false,
  style,
  id,
  className,
  ...restProps
}) => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;

    const fetchCustomers = async () => {
      setLoading(true);
      try {
        const response = await customerApi.list({ pageSize: 1000, status: 'ACTIVE' });
        if (mounted && (response as any)?.data?.records) {
          setCustomers((response as any).data.records);
        }
      } catch {
        if (mounted) setCustomers([]);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchCustomers();

    return () => { mounted = false; };
  }, []);

  const options = useMemo(() => {
    return customers.map(c => {
      const extra = [c.contactPerson, c.contactPhone].filter(Boolean).join(' · ');
      return {
        value: c.companyName,
        label: extra ? `${c.companyName}（${extra}）` : c.companyName,
        customerId: c.id || '',
        customer: c,
      };
    });
  }, [customers]);

  const handleSelect = (_selectedValue: string, option: any) => {
    onChange?.(_selectedValue, {
      customerId: option.customerId,
      customer: option.customer,
    });
  };

  const handleChange = (changedValue: string) => {
    onChange?.(changedValue, undefined);
  };

  return (
    <AutoComplete
      id={id}
      className={className}
      value={value}
      options={options}
      onSelect={handleSelect}
      onChange={handleChange}
      placeholder={placeholder}
      disabled={disabled}
      style={style}
      notFoundContent={loading ? <Spin size="small" /> : '未找到匹配的客户（可直接输入客户名称）'}
      filterOption={(inputValue, option) => {
        const searchText = inputValue.toLowerCase();
        const companyName = (option?.customer?.companyName || '').toLowerCase();
        const contactPerson = (option?.customer?.contactPerson || '').toLowerCase();
        const customerNo = (option?.customer?.customerNo || '').toLowerCase();
        return (
          companyName.includes(searchText) ||
          contactPerson.includes(searchText) ||
          customerNo.includes(searchText)
        );
      }}
      allowClear
      {...restProps}
    />
  );
};

export default CustomerSelect;
