import React, { useState, useEffect, useMemo } from 'react';
import { App, AutoComplete, Button, Form, Input, Popover, Spin } from 'antd';
import type { AutoCompleteProps } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
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
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm] = Form.useForm();
  const { message } = App.useApp();

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

  // 显式新建供应商：弹出迷你表单（名称/联系人/电话），创建成功后自动选中
  const handleCreateSubmit = async () => {
    try {
      const values = await createForm.validateFields();
      const name = String(values.factoryName || '').trim();
      if (suppliers.some(s => s.factoryName === name)) {
        message.warning('该供应商已存在，已自动选中');
        const existing = suppliers.find(s => s.factoryName === name)!;
        setCreateOpen(false);
        createForm.resetFields();
        onChange?.(name, {
          id: existing.id,
          factory: existing,
          supplierId: existing.id,
          supplierContactPerson: existing.contactPerson,
          supplierContactPhone: existing.contactPhone
        });
        return;
      }
      setCreating(true);
      const response = await factoryApi.create({
        factoryName: name,
        contactPerson: String(values.contactPerson || '').trim() || undefined,
        contactPhone: String(values.contactPhone || '').trim() || undefined,
        supplierType: 'MATERIAL',
        factoryType: 'EXTERNAL',
        status: 'active'
      });
      const newFactory = response?.data;
      if (!newFactory?.id) {
        message.error(response?.message || '创建供应商失败');
        return;
      }
      setSuppliers(prev => [...prev, newFactory]);
      setCreateOpen(false);
      createForm.resetFields();
      message.success(`供应商「${name}」创建成功`);
      onChange?.(name, {
        id: newFactory.id,
        factory: newFactory,
        supplierId: newFactory.id,
        supplierContactPerson: newFactory.contactPerson,
        supplierContactPhone: newFactory.contactPhone
      });
    } catch (error) {
      // validateFields 抛出时为表单校验错误，静默；其余提示
      if ((error as { errorFields?: unknown })?.errorFields) return;
      message.error('创建供应商失败，请稍后重试');
    } finally {
      setCreating(false);
    }
  };

  const createPopoverContent = (
    <Form form={createForm} layout="vertical" size="small" style={{ width: 260 }} onFinish={handleCreateSubmit}>
      <Form.Item name="factoryName" label="供应商名称" rules={[{ required: true, message: '请输入供应商名称' }]}>
        <Input placeholder="请输入供应商名称" maxLength={100} autoFocus />
      </Form.Item>
      <Form.Item name="contactPerson" label="联系人">
        <Input placeholder="请输入联系人（可选）" maxLength={50} />
      </Form.Item>
      <Form.Item name="contactPhone" label="联系电话">
        <Input placeholder="请输入联系电话（可选）" maxLength={20} />
      </Form.Item>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <Button size="small" onClick={() => setCreateOpen(false)}>取消</Button>
        <Button size="small" type="primary" htmlType="submit" loading={creating}>创建并选用</Button>
      </div>
    </Form>
  );

  return (
    <span className="supplier-select-wrapper" style={{ display: 'inline-flex', width: '100%', ...style }}>
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
        style={{ flex: 1, minWidth: 0 }}
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
      <Popover
        open={createOpen}
        onOpenChange={(open) => {
          if (!open) createForm.resetFields();
          setCreateOpen(open);
        }}
        trigger="click"
        placement="bottomRight"
        content={createPopoverContent}
        title="新建供应商"
      >
        <Button
          size="small"
          icon={<PlusOutlined />}
          disabled={disabled}
          title="新建供应商"
          style={{ marginLeft: 4, flexShrink: 0 }}
        />
      </Popover>
    </span>
  );
};

export default SupplierSelect;
