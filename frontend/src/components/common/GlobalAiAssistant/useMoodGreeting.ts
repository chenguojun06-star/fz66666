import { useState, useEffect } from 'react';
import type { SetStateAction, Dispatch } from 'react';
import api from '@/utils/api';
import type { XiaoyunCloudMood } from '@/components/common/XiaoyunCloudAvatar';
import type { Message } from './types';
import { INITIAL_MSG } from './constants';

export function useMoodGreeting(
  user: unknown,
  setMessages: Dispatch<SetStateAction<Message[]>>,
) {
  const [mood, setMood] = useState<XiaoyunCloudMood>('normal');
  const [hasFetchedMood, setHasFetchedMood] = useState(false);

  useEffect(() => {
    if (hasFetchedMood) return;
    const fetchStatus = async () => {
      try {
        setHasFetchedMood(true);
        const factoryId = (user as any)?.factoryId;
        const isManagerLevel = !!(user as any)?.isSuperAdmin || !!(user as any)?.isTenantOwner
          || ['admin', '管理员', '管理'].some(k => ((user as any)?.role || '').toLowerCase().includes(k));
        if (!factoryId && !isManagerLevel) return;
        const res = await api.get('/dashboard/daily-brief', factoryId ? { params: { factoryId } } : undefined);
        // @ts-ignore
        const actualData = res?.code === 200 ? res.data : (res?.data || res);
        if (actualData) {
          const { overdueOrderCount = 0, highRiskOrderCount = 0, todayScanCount = 0 } = actualData;
          let newMood: XiaoyunCloudMood = 'normal';
          let greeting = INITIAL_MSG.text;
          const hour = new Date().getHours();
          const timeGreet = hour >= 0 && hour < 6 ? '夜深了还在忙呀🌙'
            : hour >= 6 && hour < 12 ? '早上好☀️'
            : hour >= 12 && hour < 14 ? '中午好🍱'
            : hour >= 14 && hour < 18 ? '下午好🌤️'
            : '晚上好🌸';

          if (overdueOrderCount >= 5 || highRiskOrderCount >= 3) {
            newMood = 'urgent';
            greeting = `${timeGreet} 我是小云～有什么需要帮忙的，直接问我就好！`;
          } else if (overdueOrderCount > 0 || highRiskOrderCount > 0) {
            newMood = 'curious';
            greeting = `${timeGreet} 我是小云～订单、生产、仓库的问题都可以问我哦！`;
          } else if (todayScanCount > 100) {
            newMood = 'success';
            greeting = `${timeGreet} 我是小云～今天运行挺稳的，有什么想了解的随时说！`;
          } else {
            newMood = 'normal';
            greeting = `${timeGreet} 我是小云～有什么可以帮你的，尽管问！`;
          }
          setMood(newMood);
          setMessages([{ ...INITIAL_MSG, text: greeting }]);
        }
      } catch {
        setMood('normal');
        setMessages([{ ...INITIAL_MSG, text: '你好呀～我是小云，有什么可以帮你的吗？' }]);
      }
    };
    fetchStatus();
  }, [hasFetchedMood, setMessages, user]);

  return { mood, hasFetchedMood, setHasFetchedMood };
}