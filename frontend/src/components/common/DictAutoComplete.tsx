import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AutoComplete, AutoCompleteProps, Spin } from 'antd';
import { useAutoCollectDict } from '@/hooks/useAutoCollectDict';
import api from '@/utils/api';

interface DictAutoCompleteProps extends Omit<AutoCompleteProps, 'options'> {
  dictType: string; // 词典类型
  autoCollect?: boolean; // 是否启用自动收录，默认 true
  maxSuggestions?: number; // 最大建议数量，默认 50
  id?: string; // 表单元素 id，用于 label 的 for 属性
  className?: string; // 自定义样式类
}

interface DictOption {
  value: string;
  label: string;
  sortOrder?: number;
}

/**
 * 词典自动完成输入框
 * 功能：
 * 1. 点击/聚焦时自动展开全部词典选项
 * 2. 输入关键词实时过滤匹配项
 * 3. 支持自由输入（不在词典中的值同样接受）
 * 4. 自动收录新词汇
 * 5. 底部显示"字典管理"跳转链接，方便维护选项
 */
const DictAutoComplete: React.FC<DictAutoCompleteProps> = ({
  dictType,
  autoCollect = true,
  maxSuggestions = 50,
  value,
  onChange,
  onBlur,
  onFocus,
  id,
  className,
  ...restProps
}) => {
  const [allItems, setAllItems] = useState<DictOption[]>([]);
  const [options, setOptions] = useState<{ value: string; label?: React.ReactNode }[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const loadedRef = useRef(false);

  // 自动收录功能
  const { collectWord } = useAutoCollectDict({
    dictType,
    enabled: autoCollect,
    silent: true,
    debounceMs: 1000
  });

  // 加载全部词典项（组件挂载时加载一次）
  const loadAllItems = useCallback(async () => {
    if (loadedRef.current) return;
    setLoading(true);
    try {
      const response = await api.get('/system/dict/list', {
        params: { dictType, page: 1, pageSize: maxSuggestions }
      });
      const records: any[] = response.data?.records || response.data || [];
      const items: DictOption[] = records
        .filter((item: any) => item.dictLabel)
        .sort((a: any, b: any) => (a.sortOrder || 0) - (b.sortOrder || 0))
        .map((item: any) => ({ value: item.dictLabel, label: item.dictLabel, sortOrder: item.sortOrder }));
      setAllItems(items);
      loadedRef.current = true;
    } catch {
      setAllItems([]);
    } finally {
      setLoading(false);
    }
  }, [dictType, maxSuggestions]);

  useEffect(() => {
    loadAllItems();
  }, [loadAllItems]);

  // 构建 AutoComplete 的 options（含底部字典管理入口）
  const buildOptions = useCallback((keyword: string) => {
    const filtered = keyword
      ? allItems.filter(item => item.value.includes(keyword))
      : allItems;

    const items = filtered.slice(0, maxSuggestions).map(item => ({
      value: item.value,
      label: item.value,
    }));

    // 底部附加字典管理跳转
    const footer = {
      value: '__dict_manage__',
      disabled: true,
      label: (
        <div
          style={{
            borderTop: '1px solid var(--color-border, #f0f0f0)',
            padding: '4px 0 2px',
            fontSize: 11,
            color: 'var(--color-text-tertiary, #999)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>共 {allItems.length} 项</span>
          <a
            href="/system/dict"
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            style={{ color: 'var(--primary-color, #2D7FF9)', fontSize: 11 }}
          >
            + 字典管理维护选项 ↗
          </a>
        </div>
      ),
    };

    return [...items, footer];
  }, [allItems, maxSuggestions]);

  // 聚焦时展开全部
  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setOpen(true);
    setOptions(buildOptions(''));
    onFocus?.(e);
  };

  // 输入时实时过滤
  const handleSearch = (searchText: string) => {
    setOptions(buildOptions(searchText));
  };

  // 失焦时收录新词
  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    setOpen(false);
    if (autoCollect && value && typeof value === 'string' && value !== '__dict_manage__') {
      collectWord(value);
    }
    onBlur?.(e);
  };

  // 选中时关闭
  const handleSelect = (val: string) => {
    setOpen(false);
    if (val !== '__dict_manage__') {
      onChange?.(val, { value: val, label: val });
    }
  };

  return (
    <AutoComplete
      id={id}
      className={className}
      value={value}
      open={open}
      onDropdownVisibleChange={setOpen}
      options={open ? options : []}
      onChange={onChange}
      onSearch={handleSearch}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onSelect={handleSelect}
      placeholder={restProps.placeholder || `请选择或输入...`}
      filterOption={false}
      notFoundContent={loading ? <Spin size="small" /> : (allItems.length === 0 ? '暂无字典项，请前往字典管理添加' : '无匹配项')}
      {...restProps}
    />
  );
};

export default DictAutoComplete;

