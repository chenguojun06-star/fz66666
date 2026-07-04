import { useState, useEffect, useCallback } from 'react';
import api, { type ApiResult } from '@/utils/api';

// ==================== 类型定义 ====================

export interface DistributorLevel {
  id?: number;
  tenantId?: number;
  levelCode: string;
  levelName: string;
  defaultDiscount?: number;
  minPurchaseAmount?: number;
  sortOrder?: number;
  enabled?: number;
}

export interface DistributorProfile {
  id?: number;
  tenantId?: number;
  customerId?: string;
  distributorNo?: string;
  distributorName: string;
  distributorLevel?: string;
  contactPerson?: string;
  contactPhone?: string;
  address?: string;
  settlementCycle?: string;
  creditLimit?: number;
  usedCredit?: number;
  status?: string;
  remark?: string;
}

export interface DistributorPricePolicy {
  id?: number;
  tenantId?: number;
  policyName: string;
  policyType: 'FIXED' | 'DISCOUNT' | 'TIERED';
  distributorLevel?: string;
  skuCode?: string;
  supplyPrice?: number;
  minRetailPrice?: number;
  tierJson?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  enabled?: number;
}

export interface B2BOrder {
  id?: number;
  orderNo?: string;
  distributorId: number;
  skuCode: string;
  quantity: number;
  unitPrice?: number;
  totalAmount?: number;
  payAmount?: number;
  freight?: number;
  discount?: number;
  status?: number;
  receiverName?: string;
  receiverPhone?: string;
  receiverAddress?: string;
  buyerRemark?: string;
  sellerRemark?: string;
  productName?: string;
  trackingNo?: string;
  expressCompany?: string;
  createTime?: string;
}

export interface DistributorBill {
  id?: number;
  billSource?: string;
  distributorId?: number;
  platform?: string;
  billPeriod?: string;
  billNo?: string;
  platformOrderNo?: string;
  localRevenueId?: number;
  localRevenueNo?: string;
  platformAmount?: number;
  localAmount?: number;
  diffAmount?: number;
  diffType?: string;
  aiAnalysis?: string;
  aiConfidence?: number;
  handledStatus?: number;
  handledBy?: string;
  handledTime?: string;
  handledRemark?: string;
  fetchedTime?: string;
  createTime?: string;
}

export interface ReconcileResult {
  billPeriod?: string;
  totalBills?: number;
  matched?: number;
  mismatched?: number;
  missingLocal?: number;
  newBills?: number;
}

// ==================== Hook ====================

export function useDistributor() {
  const [levels, setLevels] = useState<DistributorLevel[]>([]);
  const [profiles, setProfiles] = useState<DistributorProfile[]>([]);
  const [policies, setPolicies] = useState<DistributorPricePolicy[]>([]);
  const [b2bOrders, setB2bOrders] = useState<B2BOrder[]>([]);
  const [bills, setBills] = useState<DistributorBill[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchLevels = useCallback(async () => {
    try {
      const res = await api.get('/api/ecommerce/distributor/levels');
      setLevels(res?.data ?? []);
    } catch { setLevels([]); }
  }, []);

  const fetchProfiles = useCallback(async (keyword?: string, level?: string, status?: string) => {
    try {
      const res = await api.get('/api/ecommerce/distributor/profiles', { params: { keyword, level, status } });
      setProfiles(res?.data ?? []);
    } catch { setProfiles([]); }
  }, []);

  const fetchPolicies = useCallback(async (level?: string, skuCode?: string, policyType?: string) => {
    try {
      const res = await api.get('/api/ecommerce/distributor/policies', { params: { level, skuCode, policyType } });
      setPolicies(res?.data ?? []);
    } catch { setPolicies([]); }
  }, []);

  const fetchB2BOrders = useCallback(async (keyword?: string, distributorLevel?: string, status?: number) => {
    try {
      const res = await api.get('/api/ecommerce/b2b/orders', { params: { keyword, distributorLevel, status } });
      setB2bOrders(res?.data ?? []);
    } catch { setB2bOrders([]); }
  }, []);

  const fetchBills = useCallback(async (distributorId?: number, billPeriod?: string, pendingOnly?: boolean) => {
    try {
      const res = await api.get('/api/ecommerce/distributor/bills', { params: { distributorId, billPeriod, pendingOnly } });
      setBills(res?.data ?? []);
    } catch { setBills([]); }
  }, []);

  const saveProfile = useCallback(async (profile: DistributorProfile) => {
    if (profile.id) {
      await api.put(`/api/ecommerce/distributor/profiles/${profile.id}`, profile);
    } else {
      await api.post('/api/ecommerce/distributor/profiles', profile);
    }
  }, []);

  const deleteProfile = useCallback(async (id: number) => {
    await api.delete(`/api/ecommerce/distributor/profiles/${id}`);
  }, []);

  const changeProfileStatus = useCallback(async (id: number, status: string) => {
    await api.post(`/api/ecommerce/distributor/profiles/${id}/status`, null, { params: { status } });
  }, []);

  const saveLevel = useCallback(async (level: DistributorLevel) => {
    if (level.id) {
      await api.put(`/api/ecommerce/distributor/levels/${level.id}`, level);
    } else {
      await api.post('/api/ecommerce/distributor/levels', level);
    }
  }, []);

  const deleteLevel = useCallback(async (id: number) => {
    await api.delete(`/api/ecommerce/distributor/levels/${id}`);
  }, []);

  const savePolicy = useCallback(async (policy: DistributorPricePolicy) => {
    if (policy.id) {
      await api.put(`/api/ecommerce/distributor/policies/${policy.id}`, policy);
    } else {
      await api.post('/api/ecommerce/distributor/policies', policy);
    }
  }, []);

  const deletePolicy = useCallback(async (id: number) => {
    await api.delete(`/api/ecommerce/distributor/policies/${id}`);
  }, []);

  const createB2BOrder = useCallback(async (order: B2BOrder) => {
    return await api.post('/api/ecommerce/b2b/orders', order);
  }, []);

  const cancelB2BOrder = useCallback(async (id: number) => {
    await api.post(`/api/ecommerce/b2b/orders/${id}/cancel`);
  }, []);

  const reconcileBills = useCallback(async (distributorId?: number, billPeriod?: string) => {
    const res = await api.post<ApiResult<ReconcileResult>>('/api/ecommerce/distributor/bill/reconcile', null, {
      params: { distributorId, billPeriod },
    });
    return res?.data;
  }, []);

  const handleBill = useCallback(async (id: number, status: number, remark?: string) => {
    await api.post(`/api/ecommerce/distributor/bills/${id}/handle`, { status, remark });
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([fetchLevels(), fetchProfiles(), fetchPolicies(), fetchB2BOrders(), fetchBills()]);
    } finally { setLoading(false); }
  }, [fetchLevels, fetchProfiles, fetchPolicies, fetchB2BOrders, fetchBills]);

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    levels, profiles, policies, b2bOrders, bills, loading,
    fetchLevels, fetchProfiles, fetchPolicies, fetchB2BOrders, fetchBills, fetchAll,
    saveProfile, deleteProfile, changeProfileStatus,
    saveLevel, deleteLevel,
    savePolicy, deletePolicy,
    createB2BOrder, cancelB2BOrder,
    reconcileBills, handleBill,
  };
}
