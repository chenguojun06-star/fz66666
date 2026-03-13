import { useEffect, useMemo, useState } from 'react';

import { organizationApi } from '@/services/system/organizationApi';
import type { OrganizationUnit } from '@/types/system';

export const FACTORY_TYPE_FILTER_OPTIONS = [
  { label: '全部标签', value: '' },
  { label: '内部工厂', value: 'INTERNAL' },
  { label: '外部工厂', value: 'EXTERNAL' },
];

export const useOrganizationFilterOptions = () => {
  const [departments, setDepartments] = useState<OrganizationUnit[]>([]);

  useEffect(() => {
    let active = true;
    organizationApi.departments()
      .then((list) => {
        if (!active) return;
        setDepartments(Array.isArray(list) ? list : []);
      })
      .catch(() => {
        if (!active) return;
        setDepartments([]);
      });
    return () => {
      active = false;
    };
  }, []);

  const departmentOptions = useMemo(() => {
    const factories = departments
      .filter((item) => item.nodeType === 'FACTORY')
      .map((item) => ({
        label: item.unitName || item.nodeName || '',
        value: String(item.id || ''),
      }))
      .filter((item) => item.value);

    // 内部组别（DEPARTMENT），只保留与生产相关的部门（名称或路径含"生产"），
    // 过滤掉财务、行政等非生产部门。value 前缀 "dept:" 用于区分过滤参数
    const depts = departments
      .filter((item) => {
        if (item.nodeType !== 'DEPARTMENT') return false;
        const name = item.unitName || item.nodeName || '';
        const path = item.pathNames || '';
        return name.includes('生产') || path.includes('生产');
      })
      .map((item) => ({
        label: `  └ ${item.unitName || item.nodeName || ''}`,
        value: `dept:${item.id || ''}`,
      }))
      .filter((item) => item.value !== 'dept:');

    return [
      { label: '全部生产方', value: '' },
      ...factories,
      ...depts,
    ];
  }, [departments]);

  return {
    departments,
    departmentOptions,
    factoryTypeOptions: FACTORY_TYPE_FILTER_OPTIONS,
  };
};
