import { useState, useCallback } from 'react';
import { App, Form, Input, Select } from 'antd';
import { useDistributor } from './useDistributor';
import type {
  DistributorProfile,
  DistributorLevel,
  DistributorPricePolicy,
  B2BOrder,
  ReconcileResult,
} from './useDistributor';
import { B2B_EXPRESS_COMPANY_OPTIONS, getBillHandleLabel } from './distributorHelpers';

/** useDistributorTabData 返回值（供 DistributorTab 主组件消费） */
export interface UseDistributorTabDataReturn {
  st: ReturnType<typeof useDistributor>;
  // 弹窗状态
  profileModal: { open: boolean; record: DistributorProfile | null };
  setProfileModal: React.Dispatch<React.SetStateAction<{ open: boolean; record: DistributorProfile | null }>>;
  levelModal: { open: boolean; record: DistributorLevel | null };
  setLevelModal: React.Dispatch<React.SetStateAction<{ open: boolean; record: DistributorLevel | null }>>;
  policyModal: { open: boolean; record: DistributorPricePolicy | null };
  setPolicyModal: React.Dispatch<React.SetStateAction<{ open: boolean; record: DistributorPricePolicy | null }>>;
  b2bModal: boolean;
  setB2bModal: React.Dispatch<React.SetStateAction<boolean>>;
  reconciling: boolean;
  // 事件处理
  handleSaveProfile: (p: DistributorProfile) => Promise<void>;
  handleDeleteProfile: (id: number) => void;
  handleChangeProfileStatus: (record: DistributorProfile) => void;
  handleSaveLevel: (l: DistributorLevel) => Promise<void>;
  handleDeleteLevel: (id: number) => void;
  handleSavePolicy: (p: DistributorPricePolicy) => Promise<void>;
  handleDeletePolicy: (id: number) => void;
  handleCreateB2B: (o: B2BOrder) => Promise<void>;
  handleCancelB2B: (id: number) => void;
  handleShipB2B: (id: number) => void;
  handleConfirmB2B: (id: number) => void;
  handleReconcile: () => Promise<void>;
  handleHandleBill: (id: number, status: number) => void;
}

export function useDistributorTabData(): UseDistributorTabDataReturn {
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

  const handleChangeProfileStatus = useCallback((record: DistributorProfile) => {
    const next = record.status === 'ACTIVE' ? 'FROZEN' : 'ACTIVE';
    st.changeProfileStatus(record.id!, next).then(() => {
      message.success('已切换');
      st.fetchProfiles();
    }).catch(() => {
      message.error('切换失败');
    });
  }, [st, message]);

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
              options={B2B_EXPRESS_COMPANY_OPTIONS}
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
    const label = getBillHandleLabel(status);
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

  return {
    st,
    profileModal, setProfileModal,
    levelModal, setLevelModal,
    policyModal, setPolicyModal,
    b2bModal, setB2bModal,
    reconciling,
    handleSaveProfile,
    handleDeleteProfile,
    handleChangeProfileStatus,
    handleSaveLevel,
    handleDeleteLevel,
    handleSavePolicy,
    handleDeletePolicy,
    handleCreateB2B,
    handleCancelB2B,
    handleShipB2B,
    handleConfirmB2B,
    handleReconcile,
    handleHandleBill,
  };
}
