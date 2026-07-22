/**
 * ProfileInfoTab 业务逻辑 Hook
 * 集中管理：个人信息加载/保存、修改密码、主题切换、工厂信息、
 *           智能开关、智能经营画像、问题反馈
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App, Form } from 'antd';
import type { FormInstance } from 'antd';
import api from '@/utils/api';
import { useUser } from '@/utils/AuthContext';
import tenantService from '@/services/tenantService';
import { applyThemeToDocument } from './theme';
import type { ProfileMe, TenantInfo } from './types';
import useTheme from './useTheme';
import useSmartFeatureFlags from './useSmartFeatureFlags';
import useSmartProfile from './useSmartProfile';
import useFeedback from './useFeedback';
import { copyToClipboard, extractAvatar, isValidationError } from './utils';

const useProfileInfoData = () => {
    const { user, updateUser, isAdmin, isTenantOwner, isSuperAdmin } = useUser();
    const { message } = App.useApp();
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [form] = Form.useForm();
    const [pwdForm] = Form.useForm();
    const [savingPwd, setSavingPwd] = useState(false);
    const avatarUrl = Form.useWatch('avatarUrl', form);
    const [tenantInfo, setTenantInfo] = useState<TenantInfo | null>(null);
    const [tenantForm] = Form.useForm();
    const [savingWebhook, setSavingWebhook] = useState(false);

    const canManageSmartFlags = isAdmin || isTenantOwner || isSuperAdmin;

    const { theme, onThemeChange } = useTheme(user?.id);
    const {
        smartFlags,
        savingSmartFlags,
        updateSmartFlag,
        setAllSmartFlags,
        resetSmartFlags,
        enabledCount,
    } = useSmartFeatureFlags(canManageSmartFlags);
    const {
        smartProfileForm,
        smartProfile,
        loadingSmartProfile,
        savingSmartProfile,
        loadSmartProfile,
        saveSmartProfile,
        resetSmartProfile,
    } = useSmartProfile(canManageSmartFlags);
    const {
        feedbackVisible,
        setFeedbackVisible,
        feedbackForm,
        submittingFeedback,
        myFeedbacks,
        loadingFeedbacks,
        loadMyFeedbacks,
        submitFeedback,
    } = useFeedback();

    const userRef = useRef(user);
    userRef.current = user;

    const initialRoleName = useMemo(() => String(user?.role || '').trim(), [user?.role]);
    const initialRoleNameRef = useRef(initialRoleName);
    initialRoleNameRef.current = initialRoleName;

    const loadProfile = useCallback(async () => {
        setLoading(true);
        try {
            const res: any = await api.get('/system/user/me');
            if (res?.code === 200 && res?.data) {
                const data: ProfileMe = res.data;
                const avatar = extractAvatar(res.data);
                form.setFieldsValue({
                    username: data.username,
                    roleName: data.roleName || initialRoleNameRef.current,
                    name: data.name,
                    phone: data.phone,
                    email: data.email,
                    avatarUrl: avatar,
                });
                const cur = userRef.current;
                updateUser({
                    id: String(data.id ?? cur?.id ?? ''),
                    username: String(data.username ?? cur?.username ?? ''),
                    name: String(data.name ?? cur?.name ?? ''),
                    role: String(data.roleName ?? cur?.role ?? ''),
                    roleId: data.roleId != null ? String(data.roleId) : cur?.roleId,
                    phone: data.phone || undefined,
                    email: data.email || undefined,
                    avatarUrl: avatar,
                });
                return;
            }
            message.error(res?.message || '加载个人信息失败');
        } catch (e: unknown) {
            message.error(e instanceof Error ? e.message : '加载个人信息失败');
        } finally {
            setLoading(false);
        }
    }, [form, message, updateUser]);

    useEffect(() => {
        applyThemeToDocument(theme);
        const cur = userRef.current;
        form.setFieldsValue({
            username: cur?.username,
            roleName: initialRoleNameRef.current,
            name: cur?.name,
            phone: cur?.phone,
            email: cur?.email,
            avatarUrl: (cur as any)?.avatarUrl,
        });
        loadProfile();

        const tid = (cur as any)?.tenantId;
        if (tid) {
            const role = String((cur as any)?.role || '').toLowerCase();
            const isOwner = (cur as any)?.isTenantOwner;
            if (isOwner || role.includes('admin') || role.includes('manager') || role.includes('supervisor')) {
                api.get('/system/tenant/my').then((res: unknown) => {
                    const r = res as any;
                    if (r?.code === 200 && r?.data) {
                        const d = r.data as any;
                        const info: TenantInfo = {
                            tenantCode: String(d.tenantCode || ''),
                            tenantName: String(d.tenantName || ''),
                            contactName: String(d.contactName || ''),
                            contactPhone: String(d.contactPhone || ''),
                            wechatWorkWebhookUrl: String(d.wechatWorkWebhookUrl || ''),
                        };
                        setTenantInfo(info);
                        tenantForm.setFieldsValue({
                            tenantName: info.tenantName,
                            contactName: info.contactName,
                            contactPhone: info.contactPhone,
                            wechatWorkWebhookUrl: info.wechatWorkWebhookUrl,
                        });
                    }
                }).catch((err) => console.error('加载租户信息失败:', err));
            }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const onAvatarChange = useCallback(async (url: string) => {
        form.setFieldsValue({ avatarUrl: url });
        updateUser({ avatarUrl: url } as any);
        try { await api.put('/system/user/me', { avatarUrl: url }); } catch { /* ignore */ }
        message.success('上传成功');
    }, [form, updateUser, message]);

    const saveProfile = async () => {
        try {
            const values = await form.validateFields();
            setSaving(true);
            const payload: Record<string, unknown> = { phone: values.phone };
            const currentAvatarUrl = values.avatarUrl || (user as any)?.avatarUrl;
            if (currentAvatarUrl) payload.avatarUrl = currentAvatarUrl;
            const res: any = await api.put('/system/user/me', payload);
            if (res?.code === 200 && res?.data) {
                updateUser({
                    name: res.data.name,
                    phone: res.data.phone || undefined,
                    email: res.data.email || undefined,
                    avatarUrl: extractAvatar(res.data) || values.avatarUrl || undefined,
                });
                message.success('保存成功');
                return;
            }
            message.error(res?.message || '保存失败');
        } catch (e: unknown) {
            if (isValidationError(e)) return;
            message.error(e instanceof Error ? e.message : '保存失败');
        } finally {
            setSaving(false);
        }
    };

    const changePassword = async () => {
        try {
            const values = await pwdForm.validateFields();
            if (values.newPassword !== values.confirmPassword) {
                message.error('两次输入密码不一致');
                return;
            }
            setSavingPwd(true);
            const res: any = await api.post('/system/user/me/change-password', {
                oldPassword: values.oldPassword,
                newPassword: values.newPassword,
            });
            if (res?.code === 200) {
                message.success('密码修改成功，请重新登录');
                pwdForm.resetFields();
                return;
            }
            message.error(res?.message || '修改失败');
        } catch (e: unknown) {
            if (isValidationError(e)) return;
            message.error(e instanceof Error ? e.message : '修改失败');
        } finally {
            setSavingPwd(false);
        }
    };

    const saveWebhookUrl = async () => {
        try {
            setSavingWebhook(true);
            const values = tenantForm.getFieldsValue();
            const res: any = await tenantService.updateMyTenantInfo({
                wechatWorkWebhookUrl: String(values.wechatWorkWebhookUrl || '').trim(),
            });
            if (res?.code === 200) {
                message.success('企业微信 Webhook 已保存');
                return;
            }
            message.error(res?.message || '保存失败');
        } catch (e: unknown) {
            message.error(e instanceof Error ? e.message : '保存失败');
        } finally {
            setSavingWebhook(false);
        }
    };

    const handleCopyRegisterUrl = (registerUrl: string) => {
        copyToClipboard(registerUrl, '注册链接已复制', message);
    };

    const handleCopyTenantCode = (tenantCode: string) => {
        copyToClipboard(tenantCode, '工厂码已复制', message);
    };

    return {
        user,
        canManageSmartFlags,
        loading,
        saving,
        form,
        pwdForm,
        savingPwd,
        avatarUrl,
        loadProfile,
        saveProfile,
        changePassword,
        theme,
        onThemeChange,
        onAvatarChange,
        tenantInfo,
        tenantForm,
        savingWebhook,
        saveWebhookUrl,
        feedbackVisible,
        setFeedbackVisible,
        feedbackForm,
        submittingFeedback,
        myFeedbacks,
        loadingFeedbacks,
        loadMyFeedbacks,
        submitFeedback,
        smartFlags,
        savingSmartFlags,
        updateSmartFlag,
        setAllSmartFlags,
        resetSmartFlags,
        enabledCount,
        smartProfileForm,
        smartProfile,
        loadingSmartProfile,
        savingSmartProfile,
        loadSmartProfile,
        saveSmartProfile,
        resetSmartProfile,
        handleCopyRegisterUrl,
        handleCopyTenantCode,
    };
};

export type ProfileInfoData = ReturnType<typeof useProfileInfoData>;

export type ProfileInfoFormInstance = FormInstance;

export default useProfileInfoData;
