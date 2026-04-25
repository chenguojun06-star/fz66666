import { useState, useEffect } from 'react';
import { customerApi } from '@/services/crm/customerApi';

export interface CustomerOption {
  id: string;
  companyName: string;
  contactPerson?: string;
  customerNo?: string;
}

export function useCustomerOptions() {
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const resp = await customerApi.list({ pageSize: 1000, status: 'ACTIVE' });
        if (!cancelled && resp.data?.records) {
          setCustomers(
            resp.data.records.map((c: any) => ({
              id: c.id,
              companyName: c.companyName,
              contactPerson: c.contactPerson,
              customerNo: c.customerNo,
            })),
          );
        }
      } catch (err) {
        console.warn('[useCustomerOptions] 加载客户列表失败:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { customers, loading };
}
