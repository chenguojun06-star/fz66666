import { useState, useCallback, useEffect } from 'react';
import { App } from 'antd';
import { organizationApi } from '@/services/system/organizationApi';
import { factoryApi } from '@/services/system/factoryApi';
import tenantService from '@/services/tenantService';
import type { Factory, OrganizationUnit } from '@/types/system';
import type { ApiResult } from '@/utils/api';
import api from '@/utils/api';

export interface TplModalState {
  open: boolean;
  type: 'FACTORY' | 'INTERNAL' | null;
  rootName: string;
  factoryId?: string;
}

export interface QrModalState {
  open: boolean;
  unit: OrganizationUnit | null;
  tenantCode: string;
}

export interface InviteQrState {
  open: boolean;
  loading: boolean;
  qrBase64?: string;
  expiresAt?: string;
}

/**
 * 模板初始化 + 二维码（注册码 / 邀请码）相关 Hook
 * 拆自原 OrganizationTree/index.tsx（行 119-145, 183-197, 270-293）
 */
export function useTemplateAndQr(loadData: () => Promise<void>) {
  const { message } = App.useApp();

  const [tplModal, setTplModal] = useState<TplModalState>({ open: false, type: null, rootName: '' });
  const [tplLoading, setTplLoading] = useState(false);
  const [factories, setFactories] = useState<Factory[]>([]);

  const [qrModal, setQrModal] = useState<QrModalState>({ open: false, unit: null, tenantCode: '' });

  const [inviteQr, setInviteQr] = useState<InviteQrState>({ open: false, loading: false });

  // 模板弹窗打开时加载工厂列表
  useEffect(() => {
    if (tplModal.open) {
      factoryApi.list({ pageSize: 500, status: 'active' }).then((res: ApiResult<{ records: Factory[] }>) => {
        setFactories(res?.data?.records ?? []);
      }).catch(() => setFactories([]));
    }
  }, [tplModal.open]);

  const handleInitTemplate = async () => {
    if (!tplModal.type) { message.warning('请选择一个模板类型'); return; }
    if (!tplModal.rootName.trim()) { message.warning('请输入根节点名称'); return; }
    setTplLoading(true);
    try {
      await organizationApi.initTemplate(tplModal.type, tplModal.rootName.trim(), tplModal.factoryId);
      message.success('模板初始化成功！组织架构已创建');
      setTplModal({ open: false, type: null, rootName: '' });
      loadData();
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '创建失败');
    } finally {
      setTplLoading(false);
    }
  };

  const handleShowQRCode = useCallback(async (node: OrganizationUnit) => {
    let tenantCode = '';
    try {
      const res = await (tenantService as any).myTenant() as ApiResult<{ tenantCode?: string }> & { tenantCode?: string };
      tenantCode = res?.data?.tenantCode || res?.tenantCode || '';
    } catch { /* 静默 */ }
    setQrModal({ open: true, unit: node, tenantCode });
  }, []);

  const handleGenerateInvite = useCallback(async () => {
    setInviteQr({ open: true, loading: true });
    try {
      const res: any = await api.post('/system/user/invite-qr');
      if (res?.code === 200 && res?.data) {
        setInviteQr({ open: true, loading: false, qrBase64: res.data.qrCodeBase64 || res.data.qrBase64, expiresAt: res.data.expiresAt });
      } else {
        message.error(res?.message || '生成邀请二维码失败');
        setInviteQr({ open: false, loading: false });
      }
    } catch {
      message.error('生成邀请二维码失败');
      setInviteQr({ open: false, loading: false });
    }
  }, [message]);

  return {
    // 模板
    tplModal, setTplModal, tplLoading, factories,
    handleInitTemplate,
    // 注册二维码
    qrModal, setQrModal, handleShowQRCode,
    // 邀请二维码
    inviteQr, setInviteQr, handleGenerateInvite,
  };
}
