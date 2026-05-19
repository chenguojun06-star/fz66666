import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Button, DatePicker, Input, Select, Space, Radio } from 'antd';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import './StandardSearchBar.css';

const { RangePicker } = DatePicker;

export type StandardSearchOption = { label: string; value: string };

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
  debounceMs?: number;
}

const StandardSearchBar: React.FC<StandardSearchBarProps> = ({
  searchValue,
  onSearchChange,
  searchPlaceholder = '搜索关键词...',
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
  showResetButton = true,
  onReset,
  debounceMs = 300,
}) => {
  const [presetValue, setPresetValue] = useState<string>('');
  const [localSearchValue, setLocalSearchValue] = useState(searchValue ?? '');
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (searchValue !== undefined && searchValue !== localSearchValue) {
      setLocalSearchValue(searchValue);
    }
  }, [searchValue]);

  const debouncedOnChange = useCallback((value: string) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      onSearchChange(value);
    }, debounceMs);
  }, [onSearchChange, debounceMs]);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setLocalSearchValue(val);
    debouncedOnChange(val);
  };

  const handlePressEnter = () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    onSearchChange(localSearchValue);
    onSearch?.();
  };

  const handlePresetChange = (e: any) => {
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
  };

  const handleDateChange = (value: any) => {
    setPresetValue('');
    if (onDateChange) onDateChange(value as [Dayjs | null, Dayjs | null] | null);
  };

  const hasActiveFilters = localSearchValue || dateValue || statusValue;

  const handleReset = () => {
    setPresetValue('');
    setLocalSearchValue('');
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    onSearchChange('');
    onReset?.();
  };

  return (
    <div className="standard-search-bar">
      <Space size={12} wrap className="standard-search-row">
        {searchValue !== undefined && (
          <Input
            id="standard-search-keyword"
            name="keyword"
            value={localSearchValue}
            onChange={handleSearchChange}
            placeholder={searchPlaceholder}
            className="standard-search-input"
            allowClear
            onClear={() => {
              setLocalSearchValue('');
              if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
              onSearchChange('');
            }}
            onPressEnter={handlePressEnter}
          />
        )}
        {showDate ? (
          <Space size={8}>
            {showDatePresets && (
              <Radio.Group
                value={presetValue}
                onChange={handlePresetChange}
                optionType="button"
                buttonStyle="solid"
              >
                <Radio.Button value="today">日</Radio.Button>
                <Radio.Button value="week">周</Radio.Button>
                <Radio.Button value="month">月</Radio.Button>
                <Radio.Button value="year">年</Radio.Button>
              </Radio.Group>
            )}
            <RangePicker
              id="standard-search-date"
              value={dateValue || null}
              onChange={handleDateChange}
              className="standard-search-date"
            />
          </Space>
        ) : null}
        {showStatus ? (
          <Select
            id="standard-search-status"
            value={statusValue}
            onChange={(value) => onStatusChange && onStatusChange(value)}
            options={statusOptions}
            className="standard-search-status"
            placeholder="全部状态"
            allowClear
          />
        ) : null}
        {showSearchButton && (
          <Button type="primary" onClick={onSearch}>
            查询
          </Button>
        )}
        {showResetButton && hasActiveFilters ? (
          <Button onClick={handleReset}>
            重置
          </Button>
        ) : null}
      </Space>
    </div>
  );
};

export default StandardSearchBar;
