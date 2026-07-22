import { useMemo, useState } from 'react';
import { Form, App } from 'antd';
import { useNavigate, useSearchParams } from 'react-router-dom';
import tenantService from '../../services/tenantService';

declare const __BUILD_COMMIT__: string;
declare const __BUILD_TIME__: string;

export const useRegister = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const { message } = App.useApp();

  const tenantCode = searchParams.get('tenantCode') || '';
  const factoryId = searchParams.get('factoryId') || '';
  const factoryName = searchParams.get('factoryName') || searchParams.get('tenantName') || '';
  const orgUnitId = searchParams.get('orgUnitId') || '';
  const inviteType = searchParams.get('type') || '';
  const isFactoryInvite = inviteType === 'FACTORY_INVITE';
  const isWorkerInvite = !!tenantCode;

  const year = useMemo(() => new Date().getFullYear(), []);
  const buildCommit = typeof __BUILD_COMMIT__ === 'string' ? __BUILD_COMMIT__ : 'unknown';
  const buildTime = typeof __BUILD_TIME__ === 'string' ? __BUILD_TIME__ : '';
  const buildTimeText = useMemo(() => {
    if (!buildTime) return '-';
    const d = new Date(buildTime);
    if (Number.isNaN(d.getTime())) return buildTime;
    return d.toLocaleString('zh-CN', { hour12: false });
  }, [buildTime]);

  const belongLabel = isWorkerInvite
    ? isFactoryInvite
      ? `外发工厂：${factoryName}`
      : `工厂：${factoryName}`
    : '';

  const handleApplyTenant = async (values: any) => {
    const res: any = await tenantService.applyForTenant({
      tenantName: values.tenantName,
      contactName: values.contactName,
      contactPhone: values.contactPhone,
      applyUsername: values.username,
      applyPassword: values.password,
    });
    if (res?.code === 200 || res?.data) {
      message.success(`入驻申请已提交${values.tenantName ? `，欢迎「${values.tenantName}」加入云裳智链` : ''}，请等待平台审核，审核通过后可登录使用`);
      setTimeout(() => navigate('/login'), 2500);
    } else {
      message.error(res?.message || '申请失败');
    }
  };

  const handleWorkerRegister = async (values: any) => {
    const res: any = await tenantService.workerRegister({
      tenantCode,
      factoryId: factoryId || undefined,
      orgUnitId: orgUnitId || undefined,
      username: values.username,
      password: values.password,
      name: values.name,
      phone: values.phone || undefined,
    });
    if (res?.code === 200 || res?.data) {
      message.success(factoryName ? `注册申请已提交，欢迎加入「${factoryName}」，请耐心等待管理员审批通过后即可登录` : '注册申请已提交，请等待管理员审批通过后即可登录');
      setTimeout(() => navigate('/login'), 2500);
    } else {
      message.error(res?.message || '注册失败，请联系管理员');
    }
  };

  const handleSubmit = async (values: any) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      if (isWorkerInvite) {
        await handleWorkerRegister(values);
      } else {
        await handleApplyTenant(values);
      }
    } catch (error: unknown) {
      message.error(error instanceof Error ? error.message : '操作失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  };

  return {
    form,
    submitting,
    navigate,
    message,
    isWorkerInvite,
    isFactoryInvite,
    factoryName,
    belongLabel,
    year,
    buildCommit,
    buildTimeText,
    handleSubmit,
  };
};
