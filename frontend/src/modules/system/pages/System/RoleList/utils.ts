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
  sharedWith: string | null;
  allIds: number[];
};

export type SectionComputed = {
  title: string;
  items: SectionComputedItem[];
  moduleTotal: number;
  moduleChecked: number;
};

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
      const childIds: number[] = (!sharedWith && node?.children) ? node.children.filter(c => c.id != null).map(c => Number(c.id)) : [];
      const selfId = node?.id != null && !sharedWith ? [Number(node.id)] : [];
      const allIds = [...selfId, ...childIds];
      items.push({ label: item.label, permNode: node, sharedWith, allIds });
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
