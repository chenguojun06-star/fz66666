import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Button, DatePicker, Input, Select, Space, Radio } from 'antd';
import { SearchOutlined, ReloadOutlined, DownOutlined, UpOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import './StandardSearchBar.css';

const { RangePicker } = DatePicker;

const DEBOUNCE_MS = 300;

export type StandardSearchOption = { label: string; value: string };

export interface SearchFilterField {
  key: string;
  label: string;
  type: 'text' | 'select' | 'dateRange' | 'custom';
  placeholder?: string;
  options?: StandardSearchOption[];
  width?: number;
  render?: () => React.ReactNode;
}

export interface StandardSearchBarProps {
  searchValue?: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  dateValue?: [Dayjs | null, Dayjs | null] | null;
  onDateChange?: (value: [Dayjs | null, Dayjs | null] | null) => void;
  statusValue?: string;
  onStatusChange?: (value: string) => void;
  statusOptions?: StandardSearchOption[];
  showDate?: boolean;
  showDatePresets?: boolean;
  showStatus?: boolean;
  showSearchButton?: boolean;
  onSearch?: () => void;
  showResetButton?: boolean;
  onReset?: () => void;
  extraFilters?: SearchFilterField[];
  onFilterChange?: (key: string, value: any) => void;
  collapsed?: boolean;
}

const DATE_PRESETS: { label: string; value: string }[] = [
  { label: '今天', value: 'today' },
  { label: '本周', value: 'week' },
  { label: '本月', value: 'month' },
  { label: '本年', value: 'year' },
];

const StandardSearchBar: React.FC<StandardSearchBarProps> = ({
  searchValue,
  onSearchChange,
  searchPlaceholder = '搜索关键词',
  dateValue,
  onDateChange,
  statusValue = '',
  onStatusChange,
  statusOptions = [],
  showDate = true,
  showDatePresets = false,
  showStatus = true,
  showSearchButton = false,
  onSearch,
  showResetButton = false,
  onReset,
  extraFilters = [],
  onFilterChange,
  collapsed: initialCollapsed = false,
}) => {
  const [presetValue, setPresetValue] = useState<string>('');
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const hasExtraFilters = extraFilters.length > 0;

  const [localSearch, setLocalSearch] = useState(searchValue ?? '');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (searchValue !== undefined && searchValue !== localSearch) {
      setLocalSearch(searchValue);
    }
  }, [searchValue]);

  const flushSearch = useCallback((value: string) => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    onSearchChange(value);
  }, [onSearchChange]);

  const handleSearchChange = useCallback((value: string) => {
    setLocalSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onSearchChange(value);
    }, DEBOUNCE_MS);
  }, [onSearchChange]);

  const handlePressEnter = useCallback(() => {
    flushSearch(localSearch);
    onSearch?.();
  }, [flushSearch, localSearch, onSearch]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handlePresetChange = useCallback((e: any) => {
    const val = e.target.value;
    setPresetValue(val);
    if (!onDateChange) return;
    const today = dayjs();
    switch (val) {
      case 'today':
        onDateChange([today.startOf('day'), today.endOf('day')]);
        break;
      case 'week':
        onDateChange([today.startOf('week'), today.endOf('week')]);
        break;
      case 'month':
        onDateChange([today.startOf('month'), today.endOf('month')]);
        break;
      case 'year':
        onDateChange([today.startOf('year'), today.endOf('year')]);
        break;
      default:
        onDateChange(null);
    }
  }, [onDateChange]);

  const handleDateChange = useCallback((value: any) => {
    setPresetValue('');
    if (onDateChange) onDateChange(value as [Dayjs | null, Dayjs | null] | null);
  }, [onDateChange]);

  const handleReset = useCallback(() => {
    setPresetValue('');
    onReset?.();
  }, [onReset]);

  const handleFilterChange = useCallback((key: string, value: any) => {
    onFilterChange?.(key, value);
  }, [onFilterChange]);

  const renderExtraFilter = (filter: SearchFilterField) => {
    switch (filter.type) {
      case 'text':
        return (
          <Input
            key={filter.key}
            placeholder={filter.placeholder || filter.label}
            allowClear
            style={{ width: filter.width || 160 }}
            onChange={(e) => handleFilterChange(filter.key, e.target.value)}
            onPressEnter={onSearch}
          />
        );
      case 'select':
        return (
          <Select
            key={filter.key}
            placeholder={filter.placeholder || filter.label}
            allowClear
            style={{ width: filter.width || 140 }}
            options={filter.options}
            onChange={(value) => handleFilterChange(filter.key, value)}
          />
        );
      case 'dateRange':
        return (
          <RangePicker
            key={filter.key}
            style={{ width: filter.width || 240 }}
            onChange={(value) => handleFilterChange(filter.key, value)}
          />
        );
      case 'custom':
        return filter.render ? (
          <React.Fragment key={filter.key}>{filter.render()}</React.Fragment>
        ) : null;
      default:
        return null;
    }
  };

  return (
    <div className="standard-search-bar-v2">
      <Space size={12} wrap className="standard-search-row">
        {searchValue !== undefined && (
          <Input
            prefix={<SearchOutlined style={{ color: 'var(--color-text-tertiary)' }} />}
            value={localSearch}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="standard-search-input-v2"
            allowClear
            onPressEnter={handlePressEnter}
          />
        )}

        {showDate && (
          <Space size={8}>
            {showDatePresets && (
              <Radio.Group
                value={presetValue}
                onChange={handlePresetChange}
                optionType="button"
                buttonStyle="solid"
                size="small"
              >
                {DATE_PRESETS.map((p) => (
                  <Radio.Button key={p.value} value={p.value}>{p.label}</Radio.Button>
                ))}
              </Radio.Group>
            )}
            <RangePicker
              value={dateValue || null}
              onChange={handleDateChange}
              className="standard-search-date-v2"
            />
          </Space>
        )}

        {showStatus && statusOptions.length > 0 && (
          <Select
            value={statusValue || undefined}
            onChange={(value) => onStatusChange?.(value || '')}
            options={statusOptions}
            className="standard-search-status-v2"
            placeholder="全部状态"
            allowClear
          />
        )}

        {!collapsed && extraFilters.map(renderExtraFilter)}

        <Space size={8} className="standard-search-actions">
          {showSearchButton && (
            <Button type="primary" icon={<SearchOutlined />} onClick={onSearch}>
              查询
            </Button>
          )}
          {showResetButton && (
            <Button icon={<ReloadOutlined />} onClick={handleReset}>
              重置
            </Button>
          )}
          {hasExtraFilters && (
            <Button
              type="link"
              icon={collapsed ? <DownOutlined /> : <UpOutlined />}
              onClick={() => setCollapsed(!collapsed)}
              style={{ padding: '0 4px' }}
            >
              {collapsed ? '更多筛选' : '收起'}
            </Button>
          )}
        </Space>
      </Space>

      {hasExtraFilters && collapsed && (
        <div className="standard-search-extra-filters">
          <Space size={12} wrap>
            {extraFilters.map(renderExtraFilter)}
          </Space>
        </div>
      )}
    </div>
  );
};

export default StandardSearchBar;