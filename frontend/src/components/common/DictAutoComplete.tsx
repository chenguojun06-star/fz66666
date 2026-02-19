import React, { useState } from 'react';
import { AutoComplete, AutoCompleteProps } from 'antd';
import { useAutoCollectDict } from '@/hooks/useAutoCollectDict';
import api from '@/utils/api';

interface DictAutoCompleteProps extends Omit<AutoCompleteProps, 'options'> {
  dictType: string; // 词典类型
  autoCollect?: boolean; // 是否启用自动收录，默认 true
  maxSuggestions?: number; // 最大建议数量，默认 10
  id?: string; // 表单元素 id，用于 label 的 for 属性
  className?: string; // 自定义样式类
}

/**
 * 词典自动完成输入框
 * 功能：
 * 1. 输入时自动从词典中搜索匹配项
 * 2. 点击选择或自由输入
 * 3. 自动收录新词汇
 */
const DictAutoComplete: React.FC<DictAutoCompleteProps> = ({
  dictType,
  autoCollect = true,
  maxSuggestions = 10,
  value,
  onChange,
  onBlur,
  id,
  className,
  ...restProps
}) => {
  const [options, setOptions] = useState<{ value: string }[]>([]);
  const [loading, setLoading] = useState(false);

  // 自动收录功能
  const { collectWord } = useAutoCollectDict({
    dictType,
    enabled: autoCollect,
    silent: true,
    debounceMs: 1000
  });

  /**
   * 从词典中搜索匹配项
   */
  const searchDict = async (searchText: string) => {
    if (!searchText || searchText.trim() === '') {
      setOptions([]);
      return;
    }

    setLoading(true);
    try {
      const response = await api.get('/system/dict/list', {
        params: {
          dictType,
          pageSize: maxSuggestions
        }
      });

      const records = response.data?.records || [];

      // 过滤匹配的词汇（包含搜索文本）
      const filtered = records
        .filter((item: any) => item.dictLabel.includes(searchText))
        .map((item: any) => ({
          value: item.dictLabel
        }));

      setOptions(filtered);
    } catch (error) {
      // 搜索词典失败，使用空列表
      setOptions([]);
    } finally {
      setLoading(false);
    }
  };

  /**
   * 处理输入变化
   */
  const handleSearch = (searchText: string) => {
    searchDict(searchText);
  };

  /**
   * 处理失焦事件
   */
  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    if (autoCollect && value) {
      collectWord(value as string);
    }
    onBlur?.(e);
  };

  return (
    <AutoComplete
      id={id}
      className={className}
      value={value}
      options={options}
      onChange={onChange}
      onSearch={handleSearch}
      onBlur={handleBlur}
      placeholder={restProps.placeholder || `输入${dictType}...`}
      filterOption={false} // 使用服务端过滤
      notFoundContent={loading ? '搜索中...' : '暂无匹配项'}
      {...restProps}
    />
  );
};

export default DictAutoComplete;
