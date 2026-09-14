import React, { useState, useEffect, useMemo } from 'react';
import { AutoComplete, Spin, Tooltip } from 'antd';
import type { AutoCompleteProps } from 'antd';
import { SettingOutlined } from '@ant-design/icons';
import factoryApi from '../../services/system/factoryApi';
import type { Factory } from '@/types/system';
import { subscribeDataUpdated } from '@/utils/dataEvents';
import QuickManageModal from './QuickManageModal';

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
  /** 输入框内是否显示"维护"齿轮图标（统一弹窗维护：名称/联系人/电话/地址），默认 true */
  enableQuickManage?: boolean;
}

/**
 * 供应商选择组件
 *
 * 功能：
 * 1. 下拉选择已有供应商（从工厂管理系统加载）
 * 2. 支持搜索过滤
 * 3. 支持手动输入新供应商名称（失焦时自动创建）
 * 4. 自动关联 supplierId
 * 5. 输入框内嵌"维护"齿轮图标，弹通用维护弹窗（左右分栏，含地址字段），
 *    与 DictAutoComplete 的齿轮做法完全一致，新增/编辑/删除即时同步下拉
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
  enableQuickManage = true,
  ...restProps
}) => {
  const [suppliers, setSuppliers] = useState<Factory[]>([]);
  const [loading, setLoading] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);

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

    // 供应商主数据在本页被快捷维护（齿轮弹窗增删改）后自动重拉
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
      const tag = (factory as any).supplierTag ? `【${(factory as any).supplierTag}】` : '';
      const extra = [factory.contactPerson, factory.contactPhone].filter(Boolean).join(' · ');
      return {
        value: factory.factoryName,
        label: extra ? `${factory.factoryName}${tag}（${extra}）` : `${factory.factoryName}${tag}`,
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

  // 失焦时才真正创建新供应商（明确的完成输入信号）。
  // 详细信息（联系人/电话/地址）可稍后通过齿轮维护弹窗补全。
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

  // "维护"齿轮：仅启用且未禁用时显示；外部显式传入的 suffix 优先。
  // 做法与 DictAutoComplete 完全一致：输入框内嵌齿轮 → 通用维护弹窗（含地址）
  const { suffix: externalSuffix, ...passProps } = restProps;
  const manageSuffix =
    enableQuickManage && !disabled && !externalSuffix ? (
      <Tooltip title="维护供应商（新增 / 编辑 / 地址等信息）">
        <SettingOutlined
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setManageOpen(true);
          }}
          style={{ color: 'rgba(0, 0, 0, 0.45)', cursor: 'pointer' }}
        />
      </Tooltip>
    ) : undefined;

  return (
    <>
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
        style={{ width: '100%', ...style }}
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
        suffix={manageSuffix ?? externalSuffix}
        {...passProps}
      />
      {manageSuffix ? (
        <QuickManageModal
          open={manageOpen}
          mode="supplier"
          title="供应商"
          onClose={() => setManageOpen(false)}
        />
      ) : null}
    </>
  );
};

export default SupplierSelect;
