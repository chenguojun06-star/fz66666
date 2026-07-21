import type { OrganizationUnit } from '@/types/system';

/** 部门内外标签选项 */
export const ownerTypeOptions = [
  { value: 'NONE', label: '通用部门' },
  { value: 'INTERNAL', label: '内部' },
  { value: 'EXTERNAL', label: '外部' },
];

/** 部门分类选项 */
export const categoryOptions = [
  { value: '生产', label: '生产' },
  { value: '管理', label: '管理' },
  { value: '财务', label: '财务' },
  { value: '行政', label: '行政' },
  { value: '质检', label: '质检' },
  { value: '仓储', label: '仓储' },
  { value: '采购', label: '采购' },
  { value: '设计', label: '设计' },
];

/** 递归查找组织节点 */
export function findUnit(nodes: OrganizationUnit[], id: string | null): OrganizationUnit | null {
  if (!id) return null;
  for (const node of nodes) {
    if (String(node.id) === id) return node;
    if (node.children?.length) {
      const found = findUnit(node.children, id);
      if (found) return found;
    }
  }
  return null;
}

/** 获取节点及其所有后代 ID（用于"包括下级成员"筛选） */
export function getDescendantIds(node: OrganizationUnit): string[] {
  const ids: string[] = [String(node.id)];
  if (Array.isArray(node.children)) {
    node.children.forEach(child => ids.push(...getDescendantIds(child)));
  }
  return ids;
}

/** 判断部门是否处于启用状态 */
export function isUnitEnabled(d: OrganizationUnit): boolean {
  return String(d.status) === '1' || String(d.enabled) === '1' || d.isEnabled === true;
}

/** 判断部门是否为工厂/外协 */
export function isFactoryOrExternal(d: OrganizationUnit): boolean {
  return d.nodeType === 'FACTORY' || d.ownerType === 'EXTERNAL';
}
