import type { OrganizationUnit } from '@/types/system';

export const getDepartmentLabel = (item?: OrganizationUnit | null) => {
  const pathLabel = String(item?.pathNames ?? '').trim();
  const nodeLabel = String(item?.unitName ?? item?.nodeName ?? '').trim();
  return pathLabel || nodeLabel || '未命名部门';
};
