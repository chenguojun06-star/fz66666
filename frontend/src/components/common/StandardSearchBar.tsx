import React from 'react';
import { DatePicker, Input, Select, Space } from 'antd';
import type { Dayjs } from 'dayjs';
import './StandardSearchBar.css';

const { RangePicker } = DatePicker;

export type StandardSearchOption = { label: string; value: string };

export interface StandardSearchBarProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  dateValue?: [Dayjs | null, Dayjs | null] | null;
  onDateChange?: (value: [Dayjs | null, Dayjs | null] | null) => void;
  statusValue?: string;
  onStatusChange?: (value: string) => void;
  statusOptions?: StandardSearchOption[];
  showDate?: boolean;
  showStatus?: boolean;
}

const StandardSearchBar: React.FC<StandardSearchBarProps> = ({
  searchValue,
  onSearchChange,
  searchPlaceholder = '搜索',
  dateValue,
  onDateChange,
  statusValue = '',
  onStatusChange,
  statusOptions = [],
  showDate = true,
  showStatus = true,
}) => {
  return (
    <div className="standard-search-bar">
      <Space size={12} wrap className="standard-search-row">
        <Input
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="standard-search-input"
          allowClear
        />
        {showDate ? (
          <RangePicker
            value={dateValue || null}
            onChange={(value) => onDateChange && onDateChange(value as [Dayjs | null, Dayjs | null] | null)}
            className="standard-search-date"
          />
        ) : null}
        {showStatus ? (
          <Select
            value={statusValue}
            onChange={(value) => onStatusChange && onStatusChange(value)}
            options={statusOptions}
            className="standard-search-status"
            placeholder="状态"
            allowClear
          />
        ) : null}
      </Space>
    </div>
  );
};

export default StandardSearchBar;
