import React, { useState, useEffect } from 'react';
import { Form, Input, Switch, Space, Alert } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';

interface OperatorSelectorProps {
  /**
   * 工厂名称（用于自动识别是否为外协工厂）
   */
  factoryName?: string;

  /**
   * 是否禁用
   */
  disabled?: boolean;

  /**
   * 表单实例（用于设置字段值）
   */
  form?: any;

  /**
   * 是否显示外协模式切换开关（默认自动识别）
   */
  showSwitch?: boolean;
}

/**
 * 操作人选择器组件
 *
 * 功能：
 * 1. 自动记录系统登录用户为操作人
 * 2. 外协工厂场景允许手动填写操作人姓名
 * 3. 自动识别工厂名称中的外协关键字
 *
 * 使用示例：
 * ```tsx
 * <Form form={form}>
 *   <Form.Item label="工厂" name="factoryName">
 *     <Select options={factoryOptions} />
 *   </Form.Item>
 *
 *   <OperatorSelector
 *     factoryName={form.getFieldValue('factoryName')}
 *     form={form}
 *   />
 * </Form>
 * ```
 *
 * @author System
 * @since 2026-02-05
 */
export const OperatorSelector: React.FC<OperatorSelectorProps> = ({
  factoryName,
  disabled = false,
  form,
  showSwitch = true
}) => {
  const [isOutsourced, setIsOutsourced] = useState(false);

  // 外协工厂关键字列表
  const OUTSOURCED_KEYWORDS = ['外协', '外发', '外包', '代工', '外厂', 'outsource'];

  /**
   * 检查是否为外协工厂
   */
  const checkIsOutsourced = (name: string): boolean => {
    if (!name) return false;

    const lowerName = name.toLowerCase();
    return OUTSOURCED_KEYWORDS.some(keyword =>
      lowerName.includes(keyword.toLowerCase())
    );
  };

  /**
   * 监听工厂名称变化，自动识别外协模式
   */
  useEffect(() => {
    if (factoryName) {
      const detected = checkIsOutsourced(factoryName);
      setIsOutsourced(detected);

      // 自动设置表单字段
      if (form) {
        form.setFieldsValue({ isOutsourced: detected });

        // 如果是外协工厂，清空自动操作人字段
        if (detected) {
          form.setFieldsValue({ manualOperatorName: undefined });
        }
      }
    }
  }, [factoryName, form]);

  /**
   * 手动切换外协模式
   */
  const handleSwitchChange = (checked: boolean) => {
    setIsOutsourced(checked);

    if (form) {
      form.setFieldsValue({ isOutsourced: checked });

      // 清空手动操作人字段
      if (!checked) {
        form.setFieldsValue({ manualOperatorName: undefined });
      }
    }
  };

  return (
    <Space orientation="vertical" style={{ width: '100%' }} size="middle">
      {/* 外协模式提示 */}
      {isOutsourced && (
        <Alert
          title="外协工厂模式"
          description="系统检测到外协工厂，请手动填写操作人姓名（外协员工可能没有系统账号）"
          type="info"
          icon={<InfoCircleOutlined />}
          showIcon
        />
      )}

      {/* 外协模式开关（可选） */}
      {showSwitch && (
        <Form.Item
          label="外协模式"
          name="isOutsourced"
          valuePropName="checked"
          tooltip="外协工厂的操作人可能没有系统账号，开启后允许手动填写"
        >
          <Switch
            checked={isOutsourced}
            onChange={handleSwitchChange}
            disabled={disabled}
            checkedChildren="外协"
            unCheckedChildren="自营"
          />
        </Form.Item>
      )}

      {/* 外协模式：手动填写操作人 */}
      {isOutsourced ? (
        <Form.Item
          label="操作人"
          name="manualOperatorName"
          rules={[
            { required: true, message: '请输入外协工厂操作人姓名' },
            { max: 50, message: '操作人姓名不能超过50个字符' }
          ]}
          tooltip="外协工厂员工的真实姓名"
        >
          <Input
            placeholder="请输入外协工厂操作人姓名（如：张三）"
            disabled={disabled}
            maxLength={50}
          />
        </Form.Item>
      ) : (
        /* 正常模式：显示自动记录 */
        <Form.Item
          label="操作人"
          tooltip="系统将自动记录当前登录用户"
        >
          <Input
            value="✅ 系统自动记录当前登录用户"
            disabled
            style={{
              background: '#f0f0f0',
              color: 'var(--color-success)',
              fontWeight: 500
            }}
          />
        </Form.Item>
      )}
    </Space>
  );
};

export default OperatorSelector;
