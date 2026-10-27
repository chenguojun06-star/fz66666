/**
 * 供应商目录（工厂主数据）本地缓存
 *
 * 背景：业务列表行通常只带 supplierName，地址/联系方式只存在于工厂主数据 t_factory，
 * 散落到每个业务列各查一次接口不现实（一次查询打全站 N 次）。
 * 这里做一份租户内全量目录缓存，按 id / 名称双索引，供 SupplierNameTooltip 同步取数。
 *
 * 数据源：GET /system/factory/list
 *   - 后端 FactoryOrchestrator.list 已按 tenant_id + delete_flag=0 过滤（多租户安全，P0 铁律 4）
 *   - FactoryController 类级 isAuthenticated()，登录用户即可读，无需细分权限码
 * 失效：QuickManageModal 保存供应商后 emit notifyDataUpdated('supplier') → 本 store 清缓存重拉
 */
import { create } from 'zustand';
import { factoryApi } from '@/services/system/factoryApi';
import { subscribeDataUpdated } from '@/utils/dataEvents';
import { clearApiCache } from '@/utils/api/core';
import type { Factory } from '@/types/system';

export interface SupplierDirectoryEntry {
  id: string;
  name: string;
  contactPerson?: string;
  contactPhone?: string;
  address?: string;
}

interface SupplierDirectoryState {
  /** 按主数据 id 索引 */
  byId: Record<string, SupplierDirectoryEntry>;
  /** 按名称索引（同名多条时合并，优先保留非空字段） */
  byName: Record<string, SupplierDirectoryEntry>;
  loaded: boolean;
  loading: boolean;
  replaceAll: (entries: SupplierDirectoryEntry[]) => void;
  clear: () => void;
}

const EMPTY_INDEX = { byId: {} as Record<string, SupplierDirectoryEntry>, byName: {} as Record<string, SupplierDirectoryEntry> };

export const useSupplierDirectoryStore = create<SupplierDirectoryState>()((set) => ({
  ...EMPTY_INDEX,
  loaded: false,
  loading: false,
  replaceAll: (entries) => {
    const { byId, byName } = buildIndex(entries);
    set({ byId, byName, loaded: true, loading: false });
  },
  clear: () => set({ ...EMPTY_INDEX, loaded: false, loading: false }),
}));

/** 合并两条记录：缺失字段用另一条补齐，已有非空字段优先保留 */
function mergeEntry(prev: SupplierDirectoryEntry | undefined, next: SupplierDirectoryEntry): SupplierDirectoryEntry {
  if (!prev) return next;
  return {
    id: next.id || prev.id,
    name: next.name || prev.name,
    contactPerson: next.contactPerson || prev.contactPerson,
    contactPhone: next.contactPhone || prev.contactPhone,
    address: next.address || prev.address,
  };
}

function buildIndex(entries: SupplierDirectoryEntry[]) {
  const byId: Record<string, SupplierDirectoryEntry> = {};
  const byName: Record<string, SupplierDirectoryEntry> = {};
  entries.forEach((entry) => {
    if (entry.id) byId[entry.id] = mergeEntry(byId[entry.id], entry);
    byName[entry.name] = mergeEntry(byName[entry.name], entry);
  });
  return { byId, byName };
}

function toEntry(f: Factory): SupplierDirectoryEntry | null {
  const name = String(f.factoryName || '').trim();
  if (!name) return null;
  return {
    id: String(f.id ?? ''),
    name,
    contactPerson: f.contactPerson || undefined,
    contactPhone: f.contactPhone || undefined,
    address: f.address || undefined,
  };
}

/** 拉取失败后的冷却时间，避免网络抖动时反复重试打接口 */
const FAILURE_COOLDOWN_MS = 30_000;

let inflight: Promise<void> | null = null;
let lastFailedAt = 0;
let subscribed = false;

function subscribeOnce() {
  if (subscribed) return;
  subscribed = true;
  subscribeDataUpdated('supplier', () => {
    // 供应商主数据刚被维护过 → GET 缓存 + 本地目录同时失效
    clearApiCache('/factory');
    void ensureSupplierDirectory(true);
  });
}

/**
 * 确保供应商目录已加载（幂等，多组件并发调用只发一次请求）
 * @param force 强制重新拉取（主数据变更后使用）
 */
export function ensureSupplierDirectory(force = false): Promise<void> {
  const state = useSupplierDirectoryStore.getState();
  if (!force && state.loaded) return Promise.resolve();
  if (inflight) return inflight;
  if (!force && lastFailedAt > 0 && Date.now() - lastFailedAt < FAILURE_COOLDOWN_MS) {
    return Promise.resolve();
  }

  subscribeOnce();
  useSupplierDirectoryStore.setState({ loading: true });

  inflight = (async () => {
    try {
      const resp = await factoryApi.list({ pageSize: 1000 });
      const records = resp?.records ?? [];
      const entries = records
        .map(toEntry)
        .filter((e): e is SupplierDirectoryEntry => !!e);
      useSupplierDirectoryStore.getState().replaceAll(entries);
      lastFailedAt = 0;
    } catch (err) {
      lastFailedAt = Date.now();
      console.warn('[supplierDirectory] 加载供应商目录失败:', err);
    } finally {
      inflight = null;
      useSupplierDirectoryStore.setState({ loading: false });
    }
  })();

  return inflight;
}

/** 按 id 优先、名称兜底查目录 */
export function lookupSupplierDirectory(
  state: Pick<SupplierDirectoryState, 'byId' | 'byName'>,
  supplierId: unknown,
  name: unknown,
): SupplierDirectoryEntry | undefined {
  const id = String(supplierId ?? '').trim();
  const key = String(name ?? '').trim();
  if (id && state.byId[id]) return state.byId[id];
  if (key && state.byName[key]) return state.byName[key];
  return undefined;
}

export default useSupplierDirectoryStore;
