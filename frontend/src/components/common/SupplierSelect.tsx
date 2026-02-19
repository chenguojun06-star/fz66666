import React, { useState, useEffect, useMemo } from 'react';
import { AutoComplete, Spin } from 'antd';
import type { AutoCompleteProps } from 'antd';
import factoryApi, { type Factory } from '../../services/system/factoryApi';

interface SupplierSelectProps extends Omit<AutoCompleteProps, 'options' | 'onChange'> {
  value?: string;
  onChange?: (value: string, option?: {
    id: number;
    factory: Factory;
    supplierId?: number;
    supplierContactPerson?: string;
    supplierContactPhone?: string;
  }) => void;
  placeholder?: string;
  disabled?: boolean;
  style?: React.CSSProperties;
  id?: string;
  className?: string;
}

/**
 * 供应商选择组件
 *
 * 功能：
 * 1. 下拉选择已有供应商（从工厂管理系统加载）
 * 2. 支持搜索过滤
 * 3. 支持手动输入新供应商名称
 * 4. 自动关联 supplierId
 *
 * 使用示例：
 * ```tsx
 * <Form.Item name="supplierName" label="供应商">
 *   <SupplierSelect
 *     onChange={(value, option) => {
 *       form.setFieldsValue({
 *         supplierName: value,
 *         supplierId: option?.id,
 *         supplierContactPerson: option?.factory?.contactPerson,
 *         supplierContactPhone: option?.factory?.contactPhone
 *       });
 *     }}
 *   />
 * </Form.Item>
 * <Form.Item name="supplierId" hidden>
 *   <Input />
 * </Form.Item>
 * ```
 */
const SupplierSelect: React.FC<SupplierSelectProps> = ({
  value,
  onChange,
  placeholder = '请选择或输入供应商',
  disabled = false,
  style,
  id,
  className,
  ...restProps
}) => {
  const [suppliers, setSuppliers] = useState<Factory[]>([]);
  const [loading, setLoading] = useState(false);

  // 加载供应商列表
  useEffect(() => {
    let mounted = true;

    const fetchSuppliers = async () => {
      setLoading(true);
      try {
        const response = await factoryApi.list({
          pageSize: 1000,
          status: 1  // 只加载启用状态的供应商（1=启用,0=禁用）
        });
        if (mounted && response?.data?.records) {
          setSuppliers(response.data.records);
        }
      } catch (error) {
        console.error('加载供应商列表失败:', error);
        if (mounted) setSuppliers([]);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchSuppliers();

    return () => {
      mounted = false;
    };
  }, []);

  // 转换为 AutoComplete 选项格式
  const options = useMemo(() => {
    return suppliers.map(factory => ({
      value: factory.factoryName,
      label: (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{factory.factoryName}</span>
          {factory.contactPerson && (
            <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginLeft: 8 }}>
              {factory.contactPerson}
              {factory.contactPhone && ` · ${factory.contactPhone}`}
            </span>
          )}
        </div>
      ),
      id: factory.id,
      factory: factory,
      // 附加字段，方便表单自动填充
      supplierId: factory.id,
      supplierContactPerson: factory.contactPerson,
      supplierContactPhone: factory.contactPhone
    }));
  }, [suppliers]);

  const handleSelect = (_selectedValue: string, option: any) => {
    onChange?.(_selectedValue, {
      id: option.id,
      factory: option.factory,
      supplierId: option.supplierId,
      supplierContactPerson: option.supplierContactPerson,
      supplierContactPhone: option.supplierContactPhone
    });
  };

  const handleChange = (changedValue: string) => {
    // 用户手动输入时，清空 supplierId 和联系信息
    onChange?.(changedValue, undefined);
  };

  return (
    <AutoComplete
      id={id}
      className={className}
      value={value}
      options={options}
      onSelect={handleSelect}
      onChange={handleChange}
      placeholder={placeholder}
      disabled={disabled}
      style={style}
      notFoundContent={loading ? <Spin size="small" /> : '未找到匹配的供应商（可直接输入新供应商名称）'}
      filterOption={(inputValue, option) => {
        const searchText = inputValue.toLowerCase();
        const factoryName = (option?.factory?.factoryName || '').toLowerCase();
        const factoryCode = (option?.factory?.factoryCode || '').toLowerCase();
        const contactPerson = (option?.factory?.contactPerson || '').toLowerCase();
        return (
          factoryName.includes(searchText) ||
          factoryCode.includes(searchText) ||
          contactPerson.includes(searchText)
        );
      }}
      allowClear
      {...restProps}
    />
  );
};

export default SupplierSelect;
