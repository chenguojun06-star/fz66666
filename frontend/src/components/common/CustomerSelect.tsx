import React, { useState, useEffect, useMemo, useRef } from 'react';
import { AutoComplete, Button, Tooltip } from 'antd';
import type { AutoCompleteProps } from 'antd';
import { SettingOutlined } from '@ant-design/icons';
import { BrandLoader } from '@/components/common/loading';
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
  const [loadError, setLoadError] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [manageOpen, setManageOpen] = useState(false);
  const debouncedSearch = useDebouncedValue(searchText, 300);
  const initialFetched = useRef(false);

  useEffect(() => {
    let mounted = true;

    const fetchCustomers = async () => {
      setLoading(true);
      try {
        const params: Record<string, unknown> = { pageSize: 50 };
        if (debouncedSearch.trim()) {
          params.keyword = debouncedSearch.trim();
        }
        // D-842：不再传 status:'ACTIVE' —— 后端是大小写敏感精确匹配，线上存在
        // 小写/历史状态值时会整表被过滤成 0 条，出库选客户全空（2026-10-23 报障）。
        // 未删除的客户全部可选，禁用与否交由业务侧判断。
        const response = await customerApi.list(params as any);
        // D-842 真正根因（2026-10-23）：customerApi.list 返回的是裸数据 PageResult
        // （顶层直接是 { records, total }），不是 wn 信封。此前读 response.data.records
        // 恒为 undefined，导致下拉永远「未找到匹配的客户」——而齿轮维护弹窗读
        // res.records 正常，所以出现「客户清清楚楚却选不到」的诡异现象。
        if (mounted && response?.records) {
          setCustomers(response.records);
        }
        if (mounted) setLoadError(false);
      } catch {
        // D-842：之前静默吞错——接口 500/403 时下拉显示「未找到匹配的客户」，
        // 用户根本分不清是没客户还是接口挂了。现在显式标错并给重试入口。
        if (mounted) { setCustomers([]); setLoadError(true); }
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
          onMouseDownCapture={(e) => { e.stopPropagation(); e.preventDefault(); }}
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
        open={manageOpen ? false : undefined}
        id={id}
        className={className}
        value={value}
        options={options}
        onSelect={handleSelect}
        onChange={handleChange}
        placeholder={placeholder}
        disabled={disabled}
        style={style}
        notFoundContent={loading ? <BrandLoader size={40} /> : (
          loadError ? (
            <div style={{ padding: '8px 0', textAlign: 'center' }}>
              <span style={{ color: 'var(--color-text-secondary, #999)' }}>客户列表加载失败</span>
              <Button type="link" size="small" onClick={() => setSearchText((v) => `${v} `)}>
                重试
              </Button>
            </div>
          ) : '未找到匹配的客户（可直接输入客户名称）'
        )}
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
