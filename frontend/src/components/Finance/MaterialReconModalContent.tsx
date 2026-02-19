import React, { useEffect, useMemo, useState } from 'react';
import { AutoComplete, Form, Row, Col, Input, Select } from 'antd';
import { MaterialReconciliation as MaterialReconType } from '../../types/finance';
import { formatDateTime } from '../../utils/datetime';
import { getMaterialReconStatusConfig } from '../../constants/finance';
import api from '../../utils/api';
import { Factory } from '../../types/system';

interface MaterialReconModalContentProps {
  currentRecon: MaterialReconType | null;
  onSubmit: (values: any) => Promise<void>;
  onSave: (saveFn: () => Promise<void>) => void;
}

const { Option } = Select;

/**
 * 物料对账弹窗内容组件
 * 负责渲染弹窗内的表单内容和逻辑
 */
const MaterialReconModalContent: React.FC<MaterialReconModalContentProps> = ({
  currentRecon,
  onSubmit,
  onSave
}) => {
  const [form] = Form.useForm();
  const [suppliers, setSuppliers] = useState<Factory[]>([]);
  const [supplierLoading, setSupplierLoading] = useState(false);

  const supplierOptions = useMemo(() => {
    const list = Array.isArray(suppliers) ? suppliers : [];
    return list
      .map((s) => ({
        value: String(s.factoryName || '').trim(),
        label: `${String(s.factoryName || '').trim()}（${String(s.factoryCode || '').trim()}）`,
        id: s.id,
      }))
      .filter((o) => o.value);
  }, [suppliers]);

  /**
   * 当前对账单变化时，更新表单数据
   * - 编辑模式：填充现有数据
   * - 新增模式：重置表单
   */
  useEffect(() => {
    if (currentRecon) {
      form.setFieldsValue(currentRecon);
    } else {
      form.resetFields();
    }
  }, [currentRecon, form]);

  useEffect(() => {
    let mounted = true;
    const fetchSuppliers = async () => {
      setSupplierLoading(true);
      try {
        const response = await api.get<{ code: number; data: { records: Factory[] } }>('/system/factory/list', { params: { page: 1, pageSize: 1000 } });
        if (!mounted) return;
        if (response.code === 200) {
          setSuppliers(response.data.records || []);
        } else {
          setSuppliers([]);
        }
      } catch {
        if (mounted) setSuppliers([]);
      } finally {
        if (mounted) setSupplierLoading(false);
      }
    };
    fetchSuppliers();
    return () => {
      mounted = false;
    };
  }, []);

  /**
   * 暴露保存方法给父组件
   * 父组件可通过调用此方法触发表单验证和提交
   */
  useEffect(() => {
    if (onSave) {
      onSave(() => {
        return form.validateFields().then(values => {
          return onSubmit(values);
        });
      });
    }
  }, [form, onSubmit, onSave]);

  return (
    <Form form={form} layout="vertical">
      {currentRecon ? (
        <div className="modal-detail-header">
          <div className="modal-detail-cover" />
          <div className="modal-detail-grid">
            <div className="modal-detail-item"><span className="modal-detail-label">对账单号：</span><span className="modal-detail-value">{String(currentRecon.reconciliationNo || '').trim() || '-'}</span></div>
            <div className="modal-detail-item"><span className="modal-detail-label">供应商：</span><span className="modal-detail-value">{String((currentRecon as any).supplierName || '').trim() || '-'}</span></div>
            <div className="modal-detail-item"><span className="modal-detail-label">订单号：</span><span className="modal-detail-value">{String((currentRecon as any).orderNo || '').trim() || '-'}</span></div>
            <div className="modal-detail-item"><span className="modal-detail-label">款号：</span><span className="modal-detail-value">{String((currentRecon as any).styleNo || '').trim() || '-'}</span></div>
            <div className="modal-detail-item"><span className="modal-detail-label">采购单号：</span><span className="modal-detail-value">{String((currentRecon as any).purchaseNo || '').trim() || '-'}</span></div>
            <div className="modal-detail-item"><span className="modal-detail-label">物料编码：</span><span className="modal-detail-value">{String((currentRecon as any).materialCode || '').trim() || '-'}</span></div>
            <div className="modal-detail-item"><span className="modal-detail-label">物料名称：</span><span className="modal-detail-value">{String((currentRecon as any).materialName || '').trim() || '-'}</span></div>
            <div className="modal-detail-item"><span className="modal-detail-label">数量：</span><span className="modal-detail-value">{String((currentRecon as any).quantity ?? '-')}</span></div>
            <div className="modal-detail-item"><span className="modal-detail-label">生产完成数：</span><span className="modal-detail-value">{String((currentRecon as any).productionCompletedQuantity ?? '-')}</span></div>
            <div className="modal-detail-item"><span className="modal-detail-label">单价：</span><span className="modal-detail-value">{Number((currentRecon as any).unitPrice || 0).toFixed(2)} 元</span></div>
            <div className="modal-detail-item"><span className="modal-detail-label">总金额：</span><span className="modal-detail-value">{Number((currentRecon as any).totalAmount || 0).toFixed(2)} 元</span></div>
            <div className="modal-detail-item"><span className="modal-detail-label">扣款项：</span><span className="modal-detail-value">{Number((currentRecon as any).deductionAmount || 0).toFixed(2)} 元</span></div>
            <div className="modal-detail-item"><span className="modal-detail-label">最终金额：</span><span className="modal-detail-value">{Number((currentRecon as any).finalAmount || 0).toFixed(2)} 元</span></div>
            <div className="modal-detail-item"><span className="modal-detail-label">对账日期：</span><span className="modal-detail-value">{formatDateTime((currentRecon as any).reconciliationDate)}</span></div>
            <div className="modal-detail-item"><span className="modal-detail-label">状态：</span><span className="modal-detail-value">{getMaterialReconStatusConfig((currentRecon as any).status).text}</span></div>
          </div>
        </div>
      ) : (
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item name="reconciliationNo" label="对账单号">
              <Input placeholder="自动生成" disabled />
            </Form.Item>
            <Form.Item
              name="supplierName"
              label="供应商"
              rules={[
                { required: true, message: '请选择供应商' },
                { type: 'string', min: 1, message: '供应商名称不能为空' }
              ]}>
              <AutoComplete
                placeholder="请选择或输入供应商"
                options={supplierOptions}
                notFoundContent={supplierLoading ? '加载中...' : undefined}
                onSelect={(_, option) => {
                  form.setFieldsValue({
                    supplierId: (option as any)?.id,
                    supplierName: String((option as any)?.value || '').trim(),
                  });
                }}
                onChange={(value) => {
                  form.setFieldsValue({ supplierId: undefined, supplierName: String(value || '').trim() });
                }}
                filterOption={(inputValue, option) =>
                  String((option as any)?.value || '').toLowerCase().includes(String(inputValue || '').toLowerCase())
                  || String((option as any)?.label || '').toLowerCase().includes(String(inputValue || '').toLowerCase())
                }
              />
            </Form.Item>
            <Form.Item name="supplierId" hidden>
              <Input />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item
              name="purchaseId"
              label="采购单号"
              rules={[
                { required: true, message: '请选择采购单号' },
                { type: 'string', min: 1, message: '采购单ID不能为空' }
              ]}>
              <Select placeholder="请选择采购单号">
                <Option value="1">MC2024001</Option>
                <Option value="2">MC2024002</Option>
              </Select>
            </Form.Item>
            <Form.Item
              name="reconciliationDate"
              label="对账日期"
              rules={[
                { required: true, message: '请选择对账日期' },
                { type: 'string', min: 10, message: '请选择有效的对账日期' }
              ]}>
              <Input type="date" style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item
              name="remark"
              label="备注"
              rules={[
                { type: 'string', max: 500, message: '备注长度不能超过500个字符' }
              ]}>
              <Input placeholder="请输入备注" />
            </Form.Item>
          </Col>
        </Row>
      )}
    </Form>
  );
};

export default MaterialReconModalContent;
