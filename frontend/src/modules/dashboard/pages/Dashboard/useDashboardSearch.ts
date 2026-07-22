import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/utils/api';

export interface SearchOption {
  value: string;
  label: string;
  desc: string;
}

export const useDashboardSearch = () => {
  const navigate = useNavigate();

  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchOptions, setSearchOptions] = useState<SearchOption[]>([]);

  useEffect(() => {
    const keyword = searchKeyword.trim();
    if (!keyword || keyword.length < 2) {
      setSearchOptions([]);
      return;
    }

    const timer = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const [styleRes, orderRes, factoryRes] = await Promise.all([
          api.get('/style/info/list', { params: { keyword, page: 1, pageSize: 5 } }),
          api.get('/production/order/list', { params: { keyword, page: 1, pageSize: 5 } }),
          api.get('/system/factory/list', { params: { factoryName: keyword, page: 1, pageSize: 5 } }),
        ]);

        const options: SearchOption[] = [];

        const styleRecords = styleRes?.data?.records || [];
        styleRecords.forEach((item: any) => {
          options.push({
            value: `style:${item.styleNo}`,
            label: `款式：${item.styleNo}`,
            desc: item.styleName || '款式名未填写',
          });
        });

        const orderRecords = orderRes?.data?.records || [];
        orderRecords.forEach((item: any) => {
          options.push({
            value: `order:${item.orderNo}`,
            label: `订单：${item.orderNo}`,
            desc: `款号：${item.styleNo} | 工厂：${item.factoryName || '未指定'}`,
          });
        });

        const factoryRecords = factoryRes?.data?.records || [];
        factoryRecords.forEach((item: any) => {
          options.push({
            value: `factory:${item.factoryName}`,
            label: `工厂：${item.factoryName}`,
            desc: item.contactPerson || '未填写联系人',
          });
        });

        setSearchOptions(options);
      } catch (error: unknown) {
        console.error('搜索失败:', error);
        setSearchOptions([]);
      } finally {
        setSearchLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchKeyword]);

  const handleSearchChange = (value: string) => {
    setSearchKeyword(value);
  };

  const handleSearchSelect = (value: string) => {
    if (value.startsWith('style:')) {
      const styleNo = value.replace('style:', '');
      navigate(`/style-info?styleNo=${encodeURIComponent(styleNo)}`);
    } else if (value.startsWith('order:')) {
      const orderNo = value.replace('order:', '');
      navigate(`/production?orderNo=${encodeURIComponent(orderNo)}`);
    } else if (value.startsWith('factory:')) {
      const factoryName = value.replace('factory:', '');
      navigate(`/system/factory?factoryName=${encodeURIComponent(factoryName)}`);
    }
    setSearchKeyword('');
    setSearchOptions([]);
  };

  return {
    searchKeyword,
    searchLoading,
    searchOptions,
    handleSearchChange,
    handleSearchSelect,
  };
};
