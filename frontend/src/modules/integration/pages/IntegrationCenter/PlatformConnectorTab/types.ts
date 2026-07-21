import type { ShopStats } from '../usePlatformConnector';

export interface ShopInfo {
  shopId: string;
  shopName: string;
  platform: string;
  status: string;
}

export interface StatusMapEntry {
  configured: boolean;
  status: string;
}

export type StatusMap = Record<string, StatusMapEntry>;
export type StatsMap = Record<string, ShopStats | null>;

export interface TestResultState {
  success: boolean;
  message: string;
  shops?: ShopInfo[];
  supportedActions?: string[];
  webhookUrl?: string;
  credentialGuide?: string;
}

export interface SyncResultState {
  synced?: number;
  skipped?: number;
}
