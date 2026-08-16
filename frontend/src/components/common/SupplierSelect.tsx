import React, { useState, useEffect, useMemo } from 'react';
import { AutoComplete, Spin } from 'antd';
import type { AutoCompleteProps } from 'antd';
import factoryApi from '../../services/system/factoryApi';
import type { Factory } from '@/types/system';
import { subscribeDataUpdated } from '@/utils/dataEvents';

interface SupplierSelectProps extends Omit<AutoCompleteProps, 'options' | 'onChange'> {
  value?: string;
  onChange?: (value: string, option?: {
    id?: string;
    factory?: Factory;
    supplierId?: string;
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
          pageSize: 1000, supplierType: 'MATERIAL', status: 'active'
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

    // 供应商主数据在本页被快捷维护后自动重拉
    const unsubscribe = subscribeDataUpdated('supplier', fetchSuppliers);

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  // 转换为 AutoComplete 选项格式
  // 注意：label 必须是纯字符串，不能用 JSX 元素。
  // antd 6.x 内部在 selectionchange 事件中会对 label 调用 nodeName.toLowerCase()，
  // 若 label 是 React 元素（没有 nodeName 属性）会抛出 "nodeName.toLowerCase is not a function"。
  const options = useMemo(() => {
    return suppliers.map(factory => {
      const extra = [factory.contactPerson, factory.contactPhone].filter(Boolean).join(' · ');
      return {
        value: factory.factoryName,
        label: extra ? `${factory.factoryName}（${extra}）` : factory.factoryName,
        id: factory.id,
        factory: factory,
        // 附加字段，方便表单自动填充
        supplierId: factory.id,
        supplierContactPerson: factory.contactPerson,
        supplierContactPhone: factory.contactPhone,
      };
    });
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
    if (!changedValue?.trim()) {
      onChange?.(changedValue, undefined);
      return;
    }
    // 输入过程只做已有供应商匹配回填；不匹配时仅携带名称（后端保存兜底）。
    // 禁止在 onChange 里创建：AutoComplete 每个键入中间态都会触发，
    // 会创建"杭/杭州/杭州纺…"等一堆垃圾供应商
    const existing = suppliers.find(s => s.factoryName === changedValue.trim());
    if (existing) {
      onChange?.(changedValue, {
        id: existing.id,
        factory: existing,
        supplierId: existing.id,
        supplierContactPerson: existing.contactPerson,
        supplierContactPhone: existing.contactPhone
      });
    } else {
      onChange?.(changedValue, undefined);
    }
  };

  // 失焦时才真正创建新供应商（明确的完成输入信号）
  const handleBlur = async () => {
    const name = String(value ?? '').trim();
    if (!name) return;
    if (suppliers.some(s => s.factoryName === name)) return;
    try {
      const response = await factoryApi.create({
        factoryName: name,
        supplierType: 'MATERIAL',
        factoryType: 'EXTERNAL',
        status: 'active'
      });
      if (response?.data?.id) {
        const newFactory = response.data;
        setSuppliers(prev => [...prev, newFactory]);
        onChange?.(name, {
          id: newFactory.id,
          factory: newFactory,
          supplierId: newFactory.id,
          supplierContactPerson: newFactory.contactPerson,
          supplierContactPhone: newFactory.contactPhone
        });
      }
    } catch (error) {
      // 创建失败（无权限/网络）不打扰输入，名称仍会随表单保存
      console.warn('自动创建供应商失败（将在保存时兜底）:', error);
    }
  };

  return (
    <AutoComplete
      id={id}
      className={className}
      value={value}
      options={options}
      onSelect={handleSelect}
      onBlur={handleBlur}
      onChange={handleChange}
      placeholder={placeholder}
      disabled={disabled}
      style={style}
      notFoundContent={loading ? <Spin /> : '未找到匹配的供应商（可直接输入新供应商名称）'}
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
