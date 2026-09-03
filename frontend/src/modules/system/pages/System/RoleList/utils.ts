import { MODULE_SECTIONS } from './helpers';
import type { PermissionNode } from './helpers';

export function buildPermCodeMap(permTree: PermissionNode[]): Map<string, PermissionNode> {
  const map = new Map<string, PermissionNode>();
  const walk = (nodes: PermissionNode[]) => {
    for (const n of nodes) {
      const code = String(n.permissionCode || '').trim();
      if (code) map.set(code, n);
      if (n.children?.length) walk(n.children);
    }
  };
  walk(permTree);
  return map;
}

export type SectionComputedItem = {
  label: string;
  permNode: PermissionNode | null;
  /** 子模块自身菜单权限下的按钮级子节点（menu 类型子节点不算——历史数据有菜单嵌菜单，混进来就是"权限堆积"） */
  buttons: PermissionNode[];
  sharedWith: string | null;
  allIds: number[];
};

export type SectionComputed = {
  title: string;
  items: SectionComputedItem[];
  moduleTotal: number;
  moduleChecked: number;
};

/** 按钮级节点判定：permission_type 非 menu 都按按钮渲染（DB 里 menu/button 大小写不统一） */
function isButtonChild(child: PermissionNode): boolean {
  return String(child.permissionType || '').trim().toLowerCase() !== 'menu';
}

export function computeSections(
  permKeyword: string,
  permCodeMap: Map<string, PermissionNode>,
  checkedPermIds: Set<number>,
): SectionComputed[] {
  const kw = String(permKeyword || '').trim().toLowerCase();
  const firstCodeLabel = new Map<string, string>();
  const result = MODULE_SECTIONS.map((section) => {
    const items: SectionComputedItem[] = [];
    for (const item of section.items) {
      const sharedWith = firstCodeLabel.has(item.code) ? firstCodeLabel.get(item.code)! : null;
      if (!firstCodeLabel.has(item.code)) firstCodeLabel.set(item.code, item.label);
      const node = permCodeMap.get(item.code) || null;
      // D-279：只把按钮级子节点算进本子模块（allIds 同步收窄，保证全选/半选状态与所见一致）
      const buttons: PermissionNode[] = (!sharedWith && node?.children)
        ? node.children.filter(c => c.id != null && isButtonChild(c))
        : [];
      const childIds = buttons.map(c => Number(c.id));
      const selfId = node?.id != null && !sharedWith ? [Number(node.id)] : [];
      const allIds = [...selfId, ...childIds];
      items.push({ label: item.label, permNode: node, buttons, sharedWith, allIds });
    }
    let moduleTotal = 0;
    let moduleChecked = 0;
    for (const it of items) {
      for (const id of it.allIds) {
        moduleTotal++;
        if (checkedPermIds.has(id)) moduleChecked++;
      }
    }
    return { title: section.title, items, moduleTotal, moduleChecked };
  }).filter(s => s.items.length > 0);
  if (!kw) return result;
  return result.filter(s =>
    s.title.toLowerCase().includes(kw) ||
    s.items.some(it => it.label.toLowerCase().includes(kw) || (it.permNode?.children || []).some((c: PermissionNode) => String(c.permissionName || '').toLowerCase().includes(kw)))
  );
}

export function countPermNodes(permTree: PermissionNode[]): number {
  let total = 0;
  const walk = (nodes: PermissionNode[]) => {
    for (const n of nodes) {
      if (n.id != null) total++;
      if (n.children?.length) walk(n.children);
    }
  };
  walk(permTree);
  return total;
}

export function selectAllPerms(permTree: PermissionNode[], checkedPermIds: Set<number>): Set<number> {
  const next = new Set(checkedPermIds);
  const walk = (nodes: PermissionNode[]) => {
    for (const n of nodes) {
      if (n.id != null) next.add(Number(n.id));
      if (n.children?.length) walk(n.children);
    }
  };
  walk(permTree);
  return next;
}

export function deselectAllPerms(): Set<number> {
  return new Set();
}

export function togglePermIds(checkedPermIds: Set<number>, ids: number[], selected: boolean): Set<number> {
  const next = new Set(checkedPermIds);
  if (selected) ids.forEach(id => next.add(id));
  else ids.forEach(id => next.delete(id));
  return next;
}
