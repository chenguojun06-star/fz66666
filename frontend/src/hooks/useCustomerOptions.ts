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
        // D-842：去掉 status:'ACTIVE' 硬过滤 —— 后端大小写敏感精确匹配，
        // 存量小写状态值会导致整表被过滤成 0 条。
        const resp = await customerApi.list({ pageSize: 1000 });
        if (!cancelled && resp?.records) {
          setCustomers(
            resp.records.map((c: any) => ({
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
