import React, { useState, useCallback } from 'react';
import { Button, Space, Tag, Tooltip, Form, Input, InputNumber, Select, App, Modal } from 'antd';
import { TeamOutlined, PlusOutlined, DollarOutlined, ShoppingOutlined, AuditOutlined } from '@ant-design/icons';
import ResizableTable from '@/components/common/ResizableTable';
import ResizableModal from '@/components/common/ResizableModal';
import RowActions from '@/components/common/RowActions';
import { useDistributor } from './useDistributor';
import type { ColumnsType } from 'antd/es/table';
import type { DistributorProfile, DistributorLevel, DistributorPricePolicy, B2BOrder, DistributorBill, ReconcileResult } from './useDistributor';
import type { RowAction } from '@/components/common/RowActions';

const CycleMap: Record<string, { color: string; label: string }> = {
  CASH: { color: 'green', label: '现结' },
  MONTHLY: { color: 'blue', label: '月结' },
  QUARTERLY: { color: 'purple', label: '季结' },
};

const StatusMap: Record<string, { color: string; label: string }> = {
  ACTIVE: { color: 'success', label: '正常' },
  INACTIVE: { color: 'default', label: '停用' },
  FROZEN: { color: 'error', label: '冻结' },
};

// ==================== 分销商档案编辑弹窗 ====================
const ProfileModal: React.FC<{
  open: boolean;
  record: DistributorProfile | null;
  levels: DistributorLevel[];
  onClose: () => void;
  onOk: (profile: DistributorProfile) => Promise<void>;
}> = ({ open, record, levels, onClose, onOk }) => {
  const [form] = Form.useForm<DistributorProfile>();
  const [submitting, setSubmitting] = useState(false);
  React.useEffect(() => {
    if (open) {
      form.setFieldsValue(record ?? {
        settlementCycle: 'CASH', status: 'ACTIVE', creditLimit: 0,
      });
    }
  }, [open, record, form]);
  const handleOk = useCallback(async () => {
    const val = await form.validateFields();
    setSubmitting(true);
    try { await onOk({ ...record, ...val }); onClose(); }
    finally { setSubmitting(false); }
  }, [form, record, onOk, onClose]);
  return (
    <ResizableModal title={record?.id ? '编辑分销商' : '新增分销商'} open={open} onCancel={onClose} onOk={handleOk} confirmLoading={submitting} width="40vw">
      <Form form={form} layout="vertical">
        <Form.Item label="分销商名称" name="distributorName" rules={[{ required: true, message: '请输入名称' }]}>
          <Input placeholder="公司/品牌名称" />
        </Form.Item>
        <Form.Item label="等级" name="distributorLevel">
          <Select allowClear placeholder="选择等级" options={levels.map(l => ({ label: l.levelName, value: l.levelCode }))} />
        </Form.Item>
        <Form.Item label="联系人" name="contactPerson"><Input /></Form.Item>
        <Form.Item label="联系电话" name="contactPhone"><Input /></Form.Item>
        <Form.Item label="地址" name="address"><Input.TextArea rows={2} /></Form.Item>
        <Form.Item label="结算周期" name="settlementCycle" rules={[{ required: true }]}>
          <Select options={[
            { label: '现结', value: 'CASH' },
            { label: '月结', value: 'MONTHLY' },
            { label: '季结', value: 'QUARTERLY' },
          ]} />
        </Form.Item>
        <Form.Item label="信用额度（0=不限）" name="creditLimit">
          <InputNumber min={0} precision={2} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item label="状态" name="status">
          <Select options={[
            { label: '正常', value: 'ACTIVE' },
            { label: '停用', value: 'INACTIVE' },
            { label: '冻结', value: 'FROZEN' },
          ]} />
        </Form.Item>
        <Form.Item label="备注" name="remark"><Input.TextArea rows={2} /></Form.Item>
      </Form>
    </ResizableModal>
  );
};

// ==================== 等级编辑弹窗 ====================
const LevelModal: React.FC<{
  open: boolean;
  record: DistributorLevel | null;
  onClose: () => void;
  onOk: (level: DistributorLevel) => Promise<void>;
}> = ({ open, record, onClose, onOk }) => {
  const [form] = Form.useForm<DistributorLevel>();
  const [submitting, setSubmitting] = useState(false);
  React.useEffect(() => {
    if (open) form.setFieldsValue(record ?? { defaultDiscount: 100, sortOrder: 0, enabled: 1 });
  }, [open, record, form]);
  const handleOk = useCallback(async () => {
    const val = await form.validateFields();
    setSubmitting(true);
    try { await onOk({ ...record, ...val }); onClose(); }
    finally { setSubmitting(false); }
  }, [form, record, onOk, onClose]);
  return (
    <ResizableModal title={record?.id ? '编辑等级' : '新增等级'} open={open} onCancel={onClose} onOk={handleOk} confirmLoading={submitting} width="30vw">
      <Form form={form} layout="vertical">
        <Form.Item label="等级编码" name="levelCode" rules={[{ required: true, message: '请输入编码' }]}>
          <Input placeholder="如 VIP/A/B/C" disabled={!!record?.id} />
        </Form.Item>
        <Form.Item label="等级名称" name="levelName" rules={[{ required: true, message: '请输入名称' }]}>
          <Input placeholder="如 黄金分销商" />
        </Form.Item>
        <Form.Item label="默认折扣率（0-100）" name="defaultDiscount">
          <InputNumber min={0} max={100} precision={2} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item label="升级门槛（累计采购额）" name="minPurchaseAmount">
          <InputNumber min={0} precision={2} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item label="排序" name="sortOrder">
          <InputNumber min={0} precision={0} style={{ width: '100%' }} />
        </Form.Item>
      </Form>
    </ResizableModal>
  );
};

// ==================== 价格政策编辑弹窗 ====================
const PolicyModal: React.FC<{
  open: boolean;
  record: DistributorPricePolicy | null;
  levels: DistributorLevel[];
  onClose: () => void;
  onOk: (policy: DistributorPricePolicy) => Promise<void>;
}> = ({ open, record, levels, onClose, onOk }) => {
  const [form] = Form.useForm<DistributorPricePolicy>();
  const [submitting, setSubmitting] = useState(false);
  React.useEffect(() => {
    if (open) form.setFieldsValue(record ?? { policyType: 'FIXED', enabled: 1 });
  }, [open, record, form]);
  const handleOk = useCallback(async () => {
    const val = await form.validateFields();
    setSubmitting(true);
    try { await onOk({ ...record, ...val }); onClose(); }
    finally { setSubmitting(false); }
  }, [form, record, onOk, onClose]);
  return (
    <ResizableModal title={record?.id ? '编辑价格政策' : '新增价格政策'} open={open} onCancel={onClose} onOk={handleOk} confirmLoading={submitting} width="40vw">
      <Form form={form} layout="vertical">
        <Form.Item label="策略名称" name="policyName" rules={[{ required: true, message: '请输入名称' }]}>
          <Input placeholder="如 黄金分销商供货价" />
        </Form.Item>
        <Form.Item label="策略类型" name="policyType" rules={[{ required: true }]}>
          <Select options={[
            { label: '固定价（FIXED）', value: 'FIXED' },
            { label: '折扣价（DISCOUNT）', value: 'DISCOUNT' },
            { label: '阶梯价（TIERED）', value: 'TIERED' },
          ]} />
        </Form.Item>
        <Form.Item label="适用等级（空=全部）" name="distributorLevel">
          <Select allowClear options={levels.map(l => ({ label: l.levelName, value: l.levelCode }))} />
        </Form.Item>
        <Form.Item label="适用SKU（空=全部）" name="skuCode">
          <Input placeholder="SKU编码" />
        </Form.Item>
        <Form.Item label="供货价" name="supplyPrice">
          <InputNumber min={0} precision={2} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item label="最低零售价（限价）" name="minRetailPrice">
          <InputNumber min={0} precision={2} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item label="阶梯价JSON（TIERED类型填写）" name="tierJson" tooltip='格式：[{"minQty":1,"maxQty":99,"price":50},{"minQty":100,"price":45}]'>
          <Input.TextArea rows={3} placeholder='[{"minQty":1,"maxQty":99,"price":50},{"minQty":100,"price":45}]' />
        </Form.Item>
      </Form>
    </ResizableModal>
  );
};

// ==================== B2B 订单创建弹窗 ====================
const B2BOrderModal: React.FC<{
  open: boolean;
  profiles: DistributorProfile[];
  onClose: () => void;
  onOk: (order: B2BOrder) => Promise<void>;
}> = ({ open, profiles, onClose, onOk }) => {
  const [form] = Form.useForm<B2BOrder>();
  const [submitting, setSubmitting] = useState(false);
  React.useEffect(() => {
    if (open) form.resetFields();
  }, [open, form]);
  const handleOk = useCallback(async () => {
    const val = await form.validateFields();
    setSubmitting(true);
    try { await onOk(val); onClose(); }
    finally { setSubmitting(false); }
  }, [form, onOk, onClose]);
  return (
    <ResizableModal title="创建B2B订单" open={open} onCancel={onClose} onOk={handleOk} confirmLoading={submitting} width="40vw">
      <Form form={form} layout="vertical">
        <Form.Item label="分销商" name="distributorId" rules={[{ required: true, message: '请选择分销商' }]}>
          <Select showSearch optionFilterProp="label" options={profiles
            .filter(p => p.status === 'ACTIVE')
            .map(p => ({ label: `${p.distributorName}（${p.distributorNo}）`, value: p.id }))} />
        </Form.Item>
        <Form.Item label="SKU编码" name="skuCode" rules={[{ required: true, message: '请输入SKU编码' }]}>
          <Input placeholder="SKU编码" />
        </Form.Item>
        <Form.Item label="商品名称" name="productName"><Input /></Form.Item>
        <Form.Item label="数量" name="quantity" rules={[{ required: true, message: '请输入数量' }]}>
          <InputNumber min={1} precision={0} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item label="收货人" name="receiverName"><Input /></Form.Item>
        <Form.Item label="收货电话" name="receiverPhone"><Input /></Form.Item>
        <Form.Item label="收货地址" name="receiverAddress"><Input.TextArea rows={2} /></Form.Item>
        <Form.Item label="备注" name="buyerRemark"><Input.TextArea rows={2} /></Form.Item>
      </Form>
    </ResizableModal>
  );
};

// ==================== 主组件 ====================
const DistributorTab: React.FC = () => {
  const { message, modal } = App.useApp();
  const st = useDistributor();
  const [profileModal, setProfileModal] = useState<{ open: boolean; record: DistributorProfile | null }>({ open: false, record: null });
  const [levelModal, setLevelModal] = useState<{ open: boolean; record: DistributorLevel | null }>({ open: false, record: null });
  const [policyModal, setPolicyModal] = useState<{ open: boolean; record: DistributorPricePolicy | null }>({ open: false, record: null });
  const [b2bModal, setB2bModal] = useState(false);
  const [reconciling, setReconciling] = useState(false);

  const handleSaveProfile = useCallback(async (p: DistributorProfile) => {
    try { await st.saveProfile(p); message.success(p.id ? '已更新' : '已新增'); st.fetchProfiles(); }
    catch { message.error('保存失败'); }
  }, [st, message]);

  const handleDeleteProfile = useCallback((id: number) => {
    modal.confirm({
      title: '确认删除该分销商？',
      onOk: async () => {
        try { await st.deleteProfile(id); message.success('已删除'); st.fetchProfiles(); }
        catch { message.error('删除失败'); }
      },
    });
  }, [st, message, modal]);

  const handleSaveLevel = useCallback(async (l: DistributorLevel) => {
    try { await st.saveLevel(l); message.success(l.id ? '已更新' : '已新增'); st.fetchLevels(); }
    catch { message.error('保存失败'); }
  }, [st, message]);

  const handleDeleteLevel = useCallback((id: number) => {
    modal.confirm({
      title: '确认删除该等级？',
      onOk: async () => {
        try { await st.deleteLevel(id); message.success('已删除'); st.fetchLevels(); }
        catch { message.error('删除失败'); }
      },
    });
  }, [st, message, modal]);

  const handleSavePolicy = useCallback(async (p: DistributorPricePolicy) => {
    try { await st.savePolicy(p); message.success(p.id ? '已更新' : '已新增'); st.fetchPolicies(); }
    catch { message.error('保存失败'); }
  }, [st, message]);

  const handleDeletePolicy = useCallback((id: number) => {
    modal.confirm({
      title: '确认删除该价格政策？',
      onOk: async () => {
        try { await st.deletePolicy(id); message.success('已删除'); st.fetchPolicies(); }
        catch { message.error('删除失败'); }
      },
    });
  }, [st, message, modal]);

  const handleCreateB2B = useCallback(async (o: B2BOrder) => {
    try {
      const res = await st.createB2BOrder(o);
      message.success(`B2B 订单创建成功：${res?.data?.orderNo ?? ''}`);
      st.fetchB2BOrders();
    } catch {
      message.error('创建失败，请检查 SKU 价格政策是否已配置');
    }
  }, [st, message]);

  const handleCancelB2B = useCallback((id: number) => {
    modal.confirm({
      title: '确认取消该 B2B 订单？取消后信用额度将释放。',
      onOk: async () => {
        try { await st.cancelB2BOrder(id); message.success('已取消'); st.fetchB2BOrders(); }
        catch { message.error('取消失败'); }
      },
    });
  }, [st, message, modal]);

  const handleShipB2B = useCallback((id: number) => {
    let trackingNo = '';
    let expressCompany = '';
    modal.confirm({
      title: '订单发货',
      content: (
        <Form layout="vertical">
          <Form.Item label="快递公司" required>
            <Select
              placeholder="请选择快递公司"
              onChange={v => { expressCompany = v; }}
              options={[
                { value: 'SF', label: '顺丰速运' },
                { value: 'STO', label: '申通快递' },
                { value: 'YTO', label: '圆通速递' },
                { value: 'ZTO', label: '中通快递' },
                { value: 'YD', label: '韵达快递' },
                { value: 'JT', label: '极兔速递' },
                { value: 'EMS', label: 'EMS' },
              ]}
            />
          </Form.Item>
          <Form.Item label="快递单号" required>
            <Input placeholder="请输入快递单号" onChange={e => { trackingNo = e.target.value; }} />
          </Form.Item>
        </Form>
      ),
      onOk: async () => {
        if (!expressCompany || !trackingNo) {
          message.error('请填写快递公司和快递单号');
          return Promise.reject();
        }
        try {
          await st.shipB2BOrder(id, trackingNo, expressCompany);
          message.success('发货成功');
          st.fetchB2BOrders();
        } catch { message.error('发货失败'); }
      },
    });
  }, [st, message, modal]);

  const handleConfirmB2B = useCallback((id: number) => {
    modal.confirm({
      title: '确认收货？确认后订单将标记为已完成。',
      onOk: async () => {
        try { await st.confirmB2BOrder(id); message.success('已确认收货'); st.fetchB2BOrders(); }
        catch { message.error('操作失败'); }
      },
    });
  }, [st, message, modal]);

  const handleReconcile = useCallback(async () => {
    setReconciling(true);
    try {
      const res: ReconcileResult | undefined = await st.reconcileBills();
      if (res) {
        message.success(`对账完成：共 ${res.totalBills ?? 0} 条，匹配 ${res.matched ?? 0}，差异 ${(res.mismatched ?? 0) + (res.missingLocal ?? 0)}，新增 ${res.newBills ?? 0}`);
        st.fetchBills();
      } else {
        message.info('对账完成，无账单数据');
      }
    } catch {
      message.error('对账失败');
    } finally { setReconciling(false); }
  }, [st, message]);

  const handleHandleBill = useCallback((id: number, status: number) => {
    const label = status === 1 ? '确认' : status === 2 ? '申诉' : '忽略';
    let remark = '';
    modal.confirm({
      title: `处理分销账单 - ${label}`,
      content: <Input.TextArea placeholder="处理备注（可选）" rows={3} onChange={e => { remark = e.target.value; }} />,
      onOk: async () => {
        try {
          await st.handleBill(id, status, remark);
          message.success(`已${label}`);
          st.fetchBills();
        } catch { message.error('处理失败'); }
      },
    });
  }, [st, message, modal]);

  // ==================== 列定义 ====================
  const profileCols: ColumnsType<DistributorProfile> = [
    { title: '分销商编号', dataIndex: 'distributorNo', width: 140 },
    { title: '名称', dataIndex: 'distributorName', width: 160 },
    { title: '等级', dataIndex: 'distributorLevel', width: 90, render: (v?: string) => v ? <Tag color="blue">{v}</Tag> : '-' },
    { title: '联系人', dataIndex: 'contactPerson', width: 90 },
    { title: '电话', dataIndex: 'contactPhone', width: 120 },
    { title: '结算周期', dataIndex: 'settlementCycle', width: 90, render: (v?: string) => {
      const m = v ? CycleMap[v] : null; return m ? <Tag color={m.color}>{m.label}</Tag> : '-';
    }},
    { title: '信用额度', dataIndex: 'creditLimit', width: 110, align: 'right' as const, render: (v?: number) => v ? `¥${v.toFixed(2)}` : '-' },
    { title: '已用额度', dataIndex: 'usedCredit', width: 110, align: 'right' as const, render: (v?: number) => v ? `¥${v.toFixed(2)}` : '-' },
    { title: '状态', dataIndex: 'status', width: 80, render: (v?: string) => {
      const m = v ? StatusMap[v] : null; return m ? <Tag color={m.color}>{m.label}</Tag> : '-';
    }},
    { title: '操作', width: 200, render: (_: unknown, r: DistributorProfile) => (
      <RowActions actions={[
        { key: 'edit', label: '编辑', primary: true, onClick: () => setProfileModal({ open: true, record: r }) },
        { key: 'status', label: '切换状态', onClick: () => {
          const next = r.status === 'ACTIVE' ? 'FROZEN' : 'ACTIVE';
          st.changeProfileStatus(r.id!, next).then(() => { message.success('已切换'); st.fetchProfiles(); });
        }},
        { key: 'del', label: '删除', danger: true, onClick: () => handleDeleteProfile(r.id!) },
      ]} />
    )},
  ];

  const levelCols: ColumnsType<DistributorLevel> = [
    { title: '等级编码', dataIndex: 'levelCode', width: 100 },
    { title: '等级名称', dataIndex: 'levelName', width: 140 },
    { title: '默认折扣率', dataIndex: 'defaultDiscount', width: 110, align: 'right' as const, render: (v?: number) => v != null ? `${v}%` : '-' },
    { title: '升级门槛', dataIndex: 'minPurchaseAmount', width: 120, align: 'right' as const, render: (v?: number) => v ? `¥${v.toFixed(2)}` : '-' },
    { title: '排序', dataIndex: 'sortOrder', width: 70 },
    { title: '操作', width: 150, render: (_: unknown, r: DistributorLevel) => (
      <RowActions actions={[
        { key: 'edit', label: '编辑', primary: true, onClick: () => setLevelModal({ open: true, record: r }) },
        { key: 'del', label: '删除', danger: true, onClick: () => handleDeleteLevel(r.id!) },
      ]} />
    )},
  ];

  const policyCols: ColumnsType<DistributorPricePolicy> = [
    { title: '策略名称', dataIndex: 'policyName', width: 160 },
    { title: '类型', dataIndex: 'policyType', width: 90, render: (v?: string) => {
      const m: Record<string, { color: string; label: string }> = {
        FIXED: { color: 'blue', label: '固定价' },
        DISCOUNT: { color: 'green', label: '折扣价' },
        TIERED: { color: 'orange', label: '阶梯价' },
      };
      const it = v ? m[v] : null; return it ? <Tag color={it.color}>{it.label}</Tag> : '-';
    }},
    { title: '适用等级', dataIndex: 'distributorLevel', width: 100, render: (v?: string) => v ?? '全部' },
    { title: '适用SKU', dataIndex: 'skuCode', width: 120, render: (v?: string) => v ?? '全部' },
    { title: '供货价', dataIndex: 'supplyPrice', width: 100, align: 'right' as const, render: (v?: number) => v != null ? `¥${v.toFixed(2)}` : '-' },
    { title: '最低零售价', dataIndex: 'minRetailPrice', width: 110, align: 'right' as const, render: (v?: number) => v != null ? `¥${v.toFixed(2)}` : '-' },
    { title: '操作', width: 150, render: (_: unknown, r: DistributorPricePolicy) => (
      <RowActions actions={[
        { key: 'edit', label: '编辑', primary: true, onClick: () => setPolicyModal({ open: true, record: r }) },
        { key: 'del', label: '删除', danger: true, onClick: () => handleDeletePolicy(r.id!) },
      ]} />
    )},
  ];

  const b2bCols: ColumnsType<B2BOrder> = [
    { title: '订单号', dataIndex: 'orderNo', width: 180 },
    { title: 'SKU', dataIndex: 'skuCode', width: 130 },
    { title: '商品名称', dataIndex: 'productName', width: 160, ellipsis: true },
    { title: '数量', dataIndex: 'quantity', width: 70, align: 'right' as const },
    { title: '单价', dataIndex: 'unitPrice', width: 90, align: 'right' as const, render: (v?: number) => v != null ? `¥${v.toFixed(2)}` : '-' },
    { title: '总金额', dataIndex: 'totalAmount', width: 110, align: 'right' as const, render: (v?: number) => v != null ? `¥${v.toFixed(2)}` : '-' },
    { title: '状态', dataIndex: 'status', width: 90, render: (v?: number) => {
      const m: Record<number, { color: string; label: string }> = {
        0: { color: 'default', label: '待付款' },
        1: { color: 'orange', label: '待发货' },
        2: { color: 'blue', label: '已发货' },
        3: { color: 'success', label: '已完成' },
        4: { color: 'default', label: '已取消' },
      };
      const it = v != null ? m[v] : null; return it ? <Tag color={it.color}>{it.label}</Tag> : '-';
    }},
    { title: '操作', width: 200, render: (_: unknown, r: B2BOrder) => {
      const actions: RowAction[] = [];
      if (r.status === 1) {
        actions.push({ key: 'ship', label: '发货', primary: true, onClick: () => handleShipB2B(r.id!) });
      }
      if (r.status === 2) {
        actions.push({ key: 'confirm', label: '确认收货', primary: true, onClick: () => handleConfirmB2B(r.id!) });
      }
      if (r.status != null && r.status < 3) {
        actions.push({ key: 'cancel', label: '取消', danger: true, onClick: () => handleCancelB2B(r.id!) });
      }
      return <RowActions actions={actions} />;
    }},
  ];

  const billCols: ColumnsType<DistributorBill> = [
    { title: '账期', dataIndex: 'billPeriod', width: 90 },
    { title: '订单号', dataIndex: 'platformOrderNo', width: 150 },
    { title: '差异类型', dataIndex: 'diffType', width: 110, render: (v?: string) => {
      const m: Record<string, { color: string; label: string }> = {
        MISSING_LOCAL: { color: 'orange', label: '本地缺失' },
        AMOUNT_MISMATCH: { color: 'red', label: '金额不符' },
      };
      const it = v ? m[v] : null; return it ? <Tag color={it.color}>{it.label}</Tag> : <Tag>未知</Tag>;
    }},
    { title: '平台金额', dataIndex: 'platformAmount', width: 100, align: 'right' as const, render: (v?: number) => v != null ? `¥${v.toFixed(2)}` : '-' },
    { title: '本地金额', dataIndex: 'localAmount', width: 100, align: 'right' as const, render: (v?: number) => v != null ? `¥${v.toFixed(2)}` : '-' },
    { title: '差异金额', dataIndex: 'diffAmount', width: 100, align: 'right' as const, render: (v?: number) => {
      if (v == null) return '-';
      const color = Math.abs(v) < 0.01 ? 'var(--color-success)' : v > 0 ? 'var(--color-error)' : 'var(--color-warning)';
      return <span style={{ color, fontWeight: 500 }}>{v > 0 ? '+' : ''}{v.toFixed(2)}</span>;
    }},
    { title: 'AI 分析', dataIndex: 'aiAnalysis', width: 260, ellipsis: true, render: (v?: string | null, r?: DistributorBill) => {
      const text = v || '-';
      const conf = r?.aiConfidence;
      const color = conf == null ? 'var(--color-text-quaternary)' : conf >= 70 ? 'var(--color-success)' : conf >= 50 ? 'var(--color-warning)' : 'var(--color-error)';
      return (
        <Tooltip title={text}>
          <span style={{ color }}>
            {conf != null && <span style={{ marginRight: 4 }}>[{conf}%]</span>}
            {text}
          </span>
        </Tooltip>
      );
    }},
    { title: '操作', width: 200, render: (_: unknown, r: DistributorBill) => {
      const actions: RowAction[] = r.handledStatus === 0 ? [
        { key: 'confirm', label: '确认', primary: true, onClick: () => handleHandleBill(r.id!, 1) },
        { key: 'appeal', label: '申诉', onClick: () => handleHandleBill(r.id!, 2) },
        { key: 'ignore', label: '忽略', onClick: () => handleHandleBill(r.id!, 3) },
      ] : [];
      return <RowActions actions={actions} />;
    }},
  ];

  return (
    <div style={{ padding: '0 8px' }}>
      {/* 分销商档案 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '12px 0 8px' }}>
        <Space><TeamOutlined style={{ color: 'var(--color-primary)' }} /><strong>分销商档案</strong></Space>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setProfileModal({ open: true, record: null })}>新增分销商</Button>
      </div>
      <ResizableTable<DistributorProfile> dataSource={st.profiles} rowKey="id" size="small" columns={profileCols} pagination={{ pageSize: 5 }} />

      {/* 等级管理 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '20px 0 8px' }}>
        <Space><TeamOutlined style={{ color: 'var(--color-accent-purple)' }} /><strong>分销商等级</strong></Space>
        <Button icon={<PlusOutlined />} onClick={() => setLevelModal({ open: true, record: null })}>新增等级</Button>
      </div>
      <ResizableTable<DistributorLevel> dataSource={st.levels} rowKey="id" size="small" columns={levelCols} pagination={false} />

      {/* 价格政策 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '20px 0 8px' }}>
        <Space><DollarOutlined style={{ color: 'var(--color-success)' }} /><strong>价格政策</strong></Space>
        <Button icon={<PlusOutlined />} onClick={() => setPolicyModal({ open: true, record: null })}>新增政策</Button>
      </div>
      <ResizableTable<DistributorPricePolicy> dataSource={st.policies} rowKey="id" size="small" columns={policyCols} pagination={{ pageSize: 5 }} />

      {/* B2B 订单 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '20px 0 8px' }}>
        <Space><ShoppingOutlined style={{ color: 'var(--color-warning)' }} /><strong>B2B 分销订单</strong></Space>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setB2bModal(true)}>创建B2B订单</Button>
      </div>
      <ResizableTable<B2BOrder> dataSource={st.b2bOrders} rowKey="id" size="small" columns={b2bCols} pagination={{ pageSize: 5 }} />

      {/* 分销对账 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '20px 0 8px' }}>
        <Space><AuditOutlined style={{ color: 'var(--color-danger)' }} /><strong>分销对账</strong></Space>
        <Button loading={reconciling} onClick={handleReconcile}>触发对账</Button>
      </div>
      <ResizableTable<DistributorBill> dataSource={st.bills} rowKey="id" size="small" columns={billCols} pagination={{ pageSize: 5 }} />

      {/* 弹窗 */}
      <ProfileModal open={profileModal.open} record={profileModal.record} levels={st.levels} onClose={() => setProfileModal({ open: false, record: null })} onOk={handleSaveProfile} />
      <LevelModal open={levelModal.open} record={levelModal.record} onClose={() => setLevelModal({ open: false, record: null })} onOk={handleSaveLevel} />
      <PolicyModal open={policyModal.open} record={policyModal.record} levels={st.levels} onClose={() => setPolicyModal({ open: false, record: null })} onOk={handleSavePolicy} />
      <B2BOrderModal open={b2bModal} profiles={st.profiles} onClose={() => setB2bModal(false)} onOk={handleCreateB2B} />
    </div>
  );
};

export default DistributorTab;
