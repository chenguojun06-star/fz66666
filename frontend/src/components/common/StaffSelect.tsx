import React, { useEffect, useMemo, useState } from 'react';
import { Select } from 'antd';
import api from '@/utils/api';
import tenantService from '@/services/tenantService';
import { useUser } from '@/utils/AuthContext';

interface StaffSelectProps {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  style?: React.CSSProperties;
  allowClear?: boolean;
}

/**
 * 内部人员选择器（跟单员/设计师等场景）
 *
 * 数据源（自动按身份切换）：
 * - 超级管理员：GET /system/user/list（全量用户，排除工厂工人）
 * - 租户用户：POST /system/tenant/sub/list（本租户子账号 + 租户主，排除工厂工人）
 *
 * 支持关键词搜索；接口失败时静默降级为至少可选"当前登录人"。
 */
const StaffSelect: React.FC<StaffSelectProps> = ({
  value,
  onChange,
  placeholder = '搜索或选择人员',
  disabled,
  id,
  style,
  allowClear = true,
}) => {
  const { isSuperAdmin, user } = useUser();
  const [options, setOptions] = useState<{ label: string; value: string }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    const loadStaff = async () => {
      setLoading(true);
      try {
        let names: string[] = [];
        if (isSuperAdmin) {
          const res: any = await api.get('/system/user/list', {
            params: { page: 1, pageSize: 500, excludeFactoryUsers: true },
          });
          if (res?.code === 200 && Array.isArray(res.data?.list)) {
            names = res.data.list.map((u: any) => u.name || u.username).filter(Boolean);
          }
        } else {
          const res: any = await tenantService.listSubAccounts({
            page: 1,
            pageSize: 500,
            excludeFactoryUsers: true,
          });
          if (res?.code === 200) {
            const records = res.data?.records || [];
            names = records.map((u: any) => u.name || u.username).filter(Boolean);
          }
        }
        // 接口不可用/权限不足时，至少保证当前登录人可选（跟单员常见为本人）
        const currentName = user?.name || user?.username || '';
        if (currentName && !names.includes(currentName)) {
          names.push(currentName);
        }
        if (mounted) {
          setOptions([...new Set(names)].map((n) => ({ label: n, value: n })));
        }
      } catch {
        const currentName = user?.name || user?.username || '';
        if (mounted) {
          setOptions(currentName ? [{ label: currentName, value: currentName }] : []);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };
    loadStaff();
    return () => {
      mounted = false;
    };
  }, [isSuperAdmin, user?.name, user?.username]);

  // 当前值不在选项中（历史数据人名已离职等）时补进选项，避免 Select 显示裸 id/空
  const finalOptions = useMemo(() => {
    if (value && !options.some((o) => o.value === value)) {
      return [{ label: value, value }, ...options];
    }
    return options;
  }, [options, value]);

  return (
    <Select
      id={id}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      disabled={disabled}
      style={{ width: '100%', ...style }}
      showSearch
      allowClear={allowClear}
      loading={loading}
      optionFilterProp="label"
      options={finalOptions}
    />
  );
};

export default StaffSelect;
