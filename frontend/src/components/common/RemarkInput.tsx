import React from 'react';
import { Input } from 'antd';
import type { TextAreaProps } from 'antd/es/input/TextArea';

/**
 * 统一备注输入框组件
 *
 * 规范：
 * - autoSize 自动扩展（minRows=3, maxRows=8），输入多了不会出现滚动条
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
  autoSize = { minRows: 3, maxRows: 8 },
  ...rest
}) => {
  return (
    <Input.TextArea
      placeholder={placeholder}
      maxLength={maxLength}
      showCount={showCount}
      autoSize={autoSize}
      {...rest}
    />
  );
};

export default RemarkInput;
