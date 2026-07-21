import { useEffect, useState } from 'react';
import { appStoreService } from '@/services/system/appStore';
import { useUser } from '@/utils/AuthContext';
import { CRM_APP_CODE_ALIASES, hasActiveSubscription } from '../helpers';

// CRM 模块订阅检测 Hook
export const useSubscription = () => {
  const { user } = useUser();
  const isSuperAdmin = user?.isSuperAdmin === true;
  const [subscribed, setSubscribed] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (isSuperAdmin) { setSubscribed(true); setChecking(false); return; }
    const checkSubscribed = async () => {
      try {
        const apps = await appStoreService.getMyApps();
        const appList = Array.isArray(apps) ? apps : ((apps as any)?.data ?? []);
        const activeFromApps = appList.some((a: any) =>
          hasActiveSubscription(a, CRM_APP_CODE_ALIASES)
        );
        if (activeFromApps) { setSubscribed(true); return; }
        const subscriptions = await appStoreService.getMySubscriptions();
        const subList = Array.isArray(subscriptions) ? subscriptions : ((subscriptions as any)?.data ?? []);
        const activeFromSubs = subList.some((s: any) =>
          hasActiveSubscription(s, CRM_APP_CODE_ALIASES)
        );
        setSubscribed(activeFromSubs);
      } catch {
        setSubscribed(false);
      } finally {
        setChecking(false);
      }
    };
    checkSubscribed();
  }, [isSuperAdmin]);

  return { subscribed, checking };
};
