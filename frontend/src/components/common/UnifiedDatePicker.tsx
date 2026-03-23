/**
 * 统一日期时间选择组件
 *
 * 使用方式：
 * - <UnifiedDatePicker /> - 日期选择器（默认）
 * - <UnifiedDatePicker showTime /> - 日期时间选择器
 * - <UnifiedRangePicker /> - 日期范围选择器
 * - <UnifiedRangePicker showTime /> - 日期时间范围选择器
 *
 * @example
 * import { UnifiedDatePicker, UnifiedRangePicker } from '@/components/common/UnifiedDatePicker';
 *
 * <Form.Item name="date" label="日期">
 *   <UnifiedDatePicker />
 * </Form.Item>
 *
 * <Form.Item name="datetime" label="日期时间">
 *   <UnifiedDatePicker showTime />
 * </Form.Item>
 *
 * <Form.Item name="dateRange" label="日期范围">
 *   <UnifiedRangePicker />
 * </Form.Item>
 */
import React from 'react';
import { DatePicker, DatePickerProps } from 'antd';
import type { RangePickerProps } from 'antd/es/date-picker';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';

const { RangePicker } = DatePicker;

// 日期格式配置
const DATE_FORMAT = 'YYYY-MM-DD';
const DATETIME_FORMAT = 'YYYY-MM-DD HH:mm:ss';
const TIME_FORMAT = 'HH:mm:ss';

// 日期选择器默认属性
const DEFAULT_DATE_PICKER_PROPS: Partial<DatePickerProps> = {
  style: { width: '100%' },
  placeholder: '请选择日期',
  format: DATE_FORMAT,
};

// 日期时间选择器默认属性
const DEFAULT_DATETIME_PICKER_PROPS: Partial<DatePickerProps> = {
  style: { width: '100%' },
  placeholder: '请选择日期时间',
  format: DATETIME_FORMAT,
  showTime: { format: TIME_FORMAT },
};

// 日期范围选择器默认属性
const DEFAULT_RANGE_PICKER_PROPS: Partial<RangePickerProps> = {
  style: { width: '100%' },
  placeholder: ['开始日期', '结束日期'],
  format: DATE_FORMAT,
};

// 日期时间范围选择器默认属性
const DEFAULT_DATETIME_RANGE_PICKER_PROPS: Partial<RangePickerProps> = {
  style: { width: '100%' },
  placeholder: ['开始时间', '结束时间'],
  format: DATETIME_FORMAT,
  showTime: { format: TIME_FORMAT },
};

export interface UnifiedDatePickerProps extends Omit<DatePickerProps, 'value' | 'onChange'> {
  value?: string | dayjs.Dayjs | null;
  onChange?: (date: dayjs.Dayjs | null, dateString: string | string[]) => void;
  id?: string;
}

/**
 * 统一日期选择器
 */
export const UnifiedDatePicker: React.FC<UnifiedDatePickerProps> = (props) => {
  const { showTime, value, onChange, id, ...restProps } = props;

  // 根据是否显示时间选择不同的默认配置
  const defaultProps = showTime
    ? DEFAULT_DATETIME_PICKER_PROPS
    : DEFAULT_DATE_PICKER_PROPS;

  const parsedValue = typeof value === 'string' ? dayjs(value) : value;

  return (
    <DatePicker
      {...defaultProps}
      {...restProps}
      id={id}
      value={parsedValue as any}
      onChange={onChange as any}
      showTime={showTime}
    />
  );
};

export interface UnifiedRangePickerProps extends Omit<RangePickerProps, 'value' | 'onChange'> {
  value?: [string | dayjs.Dayjs | null, string | dayjs.Dayjs | null] | null;
  onChange?: (dates: [dayjs.Dayjs | null, dayjs.Dayjs | null] | null, dateStrings: [string, string]) => void;
  id?: string;
}

/**
 * 统一日期范围选择器
 */
export const UnifiedRangePicker: React.FC<UnifiedRangePickerProps> = (props) => {
  const { showTime, value, onChange, id, ...restProps } = props;

  // 根据是否显示时间选择不同的默认配置
  const defaultProps = showTime
    ? DEFAULT_DATETIME_RANGE_PICKER_PROPS
    : DEFAULT_RANGE_PICKER_PROPS;

  const parsedValue = value ? [
    typeof value[0] === 'string' ? dayjs(value[0]) : value[0],
    typeof value[1] === 'string' ? dayjs(value[1]) : value[1]
  ] : null;

  return (
    <RangePicker
      {...defaultProps}
      {...restProps}
      id={id}
      value={parsedValue as any}
      onChange={onChange as any}
      showTime={showTime}
    />
  );
};

// 导出常用的日期处理工具
export { dayjs };
export type { Dayjs };

// 导出格式常量供外部使用
export const DateFormats = {
  DATE: DATE_FORMAT,
  DATETIME: DATETIME_FORMAT,
  TIME: TIME_FORMAT,
};
