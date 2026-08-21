import React, { useState, useEffect, useMemo, useRef } from 'react';
import { AutoComplete, Spin, Tooltip } from 'antd';
import type { AutoCompleteProps } from 'antd';
import { SettingOutlined } from '@ant-design/icons';
import { customerApi, type Customer } from '@/services/crm/customerApi';
import { useDebouncedValue } from '@/hooks/usePerformance';
import { subscribeDataUpdated } from '@/utils/dataEvents';
import QuickManageModal from './QuickManageModal';

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
  /** 输入框内是否显示"维护"齿轮图标（统一弹窗维护：名称/联系人/电话/地址），默认 true */
  enableQuickManage?: boolean;
}

const CustomerSelect: React.FC<CustomerSelectProps> = ({
  value,
  onChange,
  placeholder = '请选择或输入客户',
  disabled = false,
  style,
  id,
  className,
  enableQuickManage = true,
  ...restProps
}) => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [manageOpen, setManageOpen] = useState(false);
  const debouncedSearch = useDebouncedValue(searchText, 300);
  const initialFetched = useRef(false);

  useEffect(() => {
    let mounted = true;

    const fetchCustomers = async () => {
      setLoading(true);
      try {
        const params: Record<string, unknown> = { pageSize: 50, status: 'ACTIVE' };
        if (debouncedSearch.trim()) {
          params.keyword = debouncedSearch.trim();
        }
        const response = await customerApi.list(params as any);
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

    // 客户主数据在本页被快捷维护（新建客户）后自动重拉
    const unsubscribe = subscribeDataUpdated('customer', fetchCustomers);

    return () => { mounted = false; unsubscribe(); };
  }, [debouncedSearch]);

  useEffect(() => {
    if (!initialFetched.current) {
      initialFetched.current = true;
    }
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
    setSearchText(changedValue);
    onChange?.(changedValue, undefined);
  };

  // "维护"齿轮：仅启用且未禁用时显示；外部显式传入的 suffix 优先。
  // 做法与 DictAutoComplete / SupplierSelect 完全一致：输入框内嵌齿轮 → 通用维护弹窗（含地址）
  const { suffix: externalSuffix, ...passProps } = restProps;
  const manageSuffix =
    enableQuickManage && !disabled && !externalSuffix ? (
      <Tooltip title="维护客户（新增 / 编辑 / 联系人 / 地址等）">
        <SettingOutlined
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setManageOpen(true);
          }}
          style={{ color: 'rgba(0, 0, 0, 0.45)', cursor: 'pointer' }}
        />
      </Tooltip>
    ) : undefined;

  return (
    <>
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
        notFoundContent={loading ? <Spin /> : '未找到匹配的客户（可直接输入客户名称）'}
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
        suffix={manageSuffix ?? externalSuffix}
        {...passProps}
      />
      {manageSuffix ? (
        <QuickManageModal
          open={manageOpen}
          mode="customer"
          title="客户"
          onClose={() => setManageOpen(false)}
        />
      ) : null}
    </>
  );
};

export default CustomerSelect;
