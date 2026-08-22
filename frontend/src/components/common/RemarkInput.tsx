import React from 'react';
import { Input } from 'antd';
import type { TextAreaProps } from 'antd/es/input/TextArea';

/**
 * 统一备注输入框组件
 *
 * 规范：
 * - 默认固定 rows=3，右下角可拖拽调整高度（autoSize 会锁死高度导致拖拽失效）
 * - 如需自动扩展可显式传入 autoSize
 * - 默认 placeholder "请输入备注"
 * - 默认 maxLength=500 + showCount
 *
 * 用法：
 *   <Form.Item name="remark" label="备注"><RemarkInput /></Form.Item>
 *   <RemarkInput placeholder="支付备注" maxLength={200} />
 */
const RemarkInput: React.FC<TextAreaProps> = ({
  placeholder = '请输入备注',
  maxLength = 500,
  showCount = true,
  autoSize,
  rows,
  ...rest
}) => {
  return (
    <Input.TextArea
      placeholder={placeholder}
      maxLength={maxLength}
      showCount={showCount}
      autoSize={autoSize}
      rows={rows ?? 3}
      {...rest}
    />
  );
};

export default RemarkInput;
