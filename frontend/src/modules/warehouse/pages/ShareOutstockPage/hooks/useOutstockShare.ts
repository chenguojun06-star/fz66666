import { useEffect, useState } from 'react';
import axios from 'axios';
import type { OutstockShareData } from '../types';

export const useOutstockShare = (token: string | undefined) => {
  const [data, setData] = useState<OutstockShareData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError('无效的分享链接');
      setLoading(false);
      return;
    }
    axios
      .get(`/api/public/share/outstock/${token}`)
      .then((res) => {
        const d = res.data?.data || res.data;
        setData(d);
      })
      .catch((err) => {
        const msg = err.response?.data?.message || err.message || '链接已失效或不存在';
        setError(msg);
      })
      .finally(() => setLoading(false));
  }, [token]);

  return { data, loading, error };
};
