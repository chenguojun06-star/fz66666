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
    return [
      { label: '全部部门', value: '' },
      ...departments.map((item) => ({
        label: item.nodeName,
        value: String(item.id || ''),
      })).filter((item) => item.value),
    ];
  }, [departments]);

  return {
    departments,
    departmentOptions,
    factoryTypeOptions: FACTORY_TYPE_FILTER_OPTIONS,
  };
};