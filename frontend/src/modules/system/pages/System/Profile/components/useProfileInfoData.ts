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
import tenantSmartFeatureService from '@/services/system/tenantSmartFeatureService';
import tenantIntelligenceProfileService from '@/services/system/tenantIntelligenceProfileService';
import type {
    TenantIntelligenceProfilePayload,
    TenantIntelligenceProfileResponse,
} from '@/services/system/tenantIntelligenceProfileService';
import {
    getSmartFeatureFlags,
    replaceSmartFeatureFlags,
    resetSmartFeatureFlags,
    type SmartFeatureKey,
} from '@/smart/core/featureFlags';
import feedbackService from '@/services/feedbackService';
import tenantService from '@/services/tenantService';
import type { UserFeedback } from '@/services/feedbackService';
import { SMART_FEATURE_KEYS } from './ProfileSmartSettingsPanel';
import {
    FALLBACK_THEME,
    applyThemeToDocument,
    getUserThemeKey,
    resolveInitialTheme,
} from './theme';
import type { ProfileMe, TenantInfo } from './types';

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

    // 问题反馈
    const [feedbackVisible, setFeedbackVisible] = useState(false);
    const [feedbackForm] = Form.useForm();
    const [submittingFeedback, setSubmittingFeedback] = useState(false);
    const [myFeedbacks, setMyFeedbacks] = useState<UserFeedback[]>([]);
    const [loadingFeedbacks, setLoadingFeedbacks] = useState(false);
    const [smartFlags, setSmartFlags] = useState(() => getSmartFeatureFlags());
    const [savingSmartFlags, setSavingSmartFlags] = useState(false);
    const [smartProfileForm] = Form.useForm<TenantIntelligenceProfilePayload>();
    const [smartProfile, setSmartProfile] = useState<TenantIntelligenceProfileResponse | null>(null);
    const [loadingSmartProfile, setLoadingSmartProfile] = useState(false);
    const [savingSmartProfile, setSavingSmartProfile] = useState(false);
    const canManageSmartFlags = isAdmin || isTenantOwner || isSuperAdmin;

    // 主题
    const [theme, setTheme] = useState<string>(() => resolveInitialTheme(user?.id));

    const userRef = useRef(user);
    userRef.current = user;

    const initialRoleName = useMemo(() => String(user?.role || '').trim(), [user?.role]);
    const initialRoleNameRef = useRef(initialRoleName);
    initialRoleNameRef.current = initialRoleName;

    const syncSmartProfileForm = useCallback((profile: TenantIntelligenceProfileResponse) => {
        setSmartProfile(profile);
        smartProfileForm.setFieldsValue({
            primaryGoal: profile.primaryGoal,
            deliveryWarningDays: profile.deliveryWarningDays,
            anomalyWarningCount: profile.anomalyWarningCount,
            lowMarginThreshold: profile.lowMarginThreshold,
        });
    }, [smartProfileForm]);

    const loadProfile = useCallback(async () => {
        setLoading(true);
        try {
            const res: any = await api.get('/system/user/me');
            if (res?.code === 200 && res?.data) {
                const data: ProfileMe = res.data;
                const avatar = (res.data as any).avatarUrl || (res.data as any).avatar || (res.data as any).headUrl || undefined;
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

    const loadSmartProfile = useCallback(async () => {
        setLoadingSmartProfile(true);
        try {
            const profile = await tenantIntelligenceProfileService.getCurrent();
            syncSmartProfileForm(profile);
        } catch (e: unknown) {
            message.error(e instanceof Error ? e.message : '加载智能经营画像失败');
        } finally {
            setLoadingSmartProfile(false);
        }
    }, [message, syncSmartProfileForm]);

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
        tenantSmartFeatureService.list().then((flags) => {
            setSmartFlags(replaceSmartFeatureFlags(flags));
        }).catch((err) => console.error('加载智能功能开关失败:', err));

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

    useEffect(() => {
        if (!canManageSmartFlags) {
            return;
        }
        void loadSmartProfile();
    }, [canManageSmartFlags, loadSmartProfile]);

    const onThemeChange = (next: string) => {
        const v = String(next || '').trim() || FALLBACK_THEME;
        setTheme(v);
        applyThemeToDocument(v);
        try {
            const themeKey = getUserThemeKey(userRef.current?.id);
            localStorage.setItem(themeKey, v);
            localStorage.setItem('app.theme', v);
            window.dispatchEvent(new Event('theme-change'));
        } catch {
            // ignore
        }
        message.success('主题已切换');
    };

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
                    avatarUrl: res.data.avatarUrl || res.data.avatar || res.data.headUrl || values.avatarUrl || undefined,
                });
                message.success('保存成功');
                return;
            }
            message.error(res?.message || '保存失败');
        } catch (e: unknown) {
            if (e && typeof e === 'object' && 'errorFields' in e) return;
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
            if (e && typeof e === 'object' && 'errorFields' in e) return;
            message.error(e instanceof Error ? e.message : '修改失败');
        } finally {
            setSavingPwd(false);
        }
    };

    // ========== 问题反馈 ==========
    const loadMyFeedbacks = async () => {
        setLoadingFeedbacks(true);
        try {
            const res: any = await feedbackService.myList({ page: 1, pageSize: 10 });
            const d = res?.data || res;
            setMyFeedbacks(d?.records || []);
        } catch { /* ignore */ } finally {
            setLoadingFeedbacks(false);
        }
    };

    const submitFeedback = async () => {
        try {
            const values = await feedbackForm.validateFields();
            setSubmittingFeedback(true);
            const res: any = await feedbackService.submit(values);
            if (res?.code === 200) {
                message.success('反馈提交成功，感谢您的意见！');
                feedbackForm.resetFields();
                setFeedbackVisible(false);
                loadMyFeedbacks();
                return;
            }
            message.error(res?.message || '提交失败');
        } catch (e: unknown) {
            if (e && typeof e === 'object' && 'errorFields' in e) return;
            message.error(e instanceof Error ? e.message : '提交失败');
        } finally {
            setSubmittingFeedback(false);
        }
    };

    const saveSmartFlags = async (nextFlags: Record<SmartFeatureKey, boolean>, successText: string) => {
        if (!canManageSmartFlags) {
            message.error('仅租户管理员可修改智能开关');
            return;
        }
        try {
            setSavingSmartFlags(true);
            const saved = await tenantSmartFeatureService.save(nextFlags);
            setSmartFlags(replaceSmartFeatureFlags(saved));
            message.success(successText);
        } catch (e: unknown) {
            message.error(e instanceof Error ? e.message : '保存智能开关失败');
        } finally {
            setSavingSmartFlags(false);
        }
    };

    const updateSmartFlag = (key: SmartFeatureKey, enabled: boolean) => {
        const next = { ...smartFlags, [key]: enabled } as Record<SmartFeatureKey, boolean>;
        void saveSmartFlags(next, `智能开关已${enabled ? '开启' : '关闭'}`);
    };

    const setAllSmartFlags = (enabled: boolean) => {
        let nextFlags = { ...smartFlags } as Record<SmartFeatureKey, boolean>;
        SMART_FEATURE_KEYS.forEach((featureKey) => {
            nextFlags = { ...nextFlags, [featureKey]: enabled };
        });
        void saveSmartFlags(nextFlags, `智能开关已${enabled ? '全部开启' : '全部关闭'}`);
    };

    const resetSmartFlags = () => {
        const next = resetSmartFeatureFlags();
        void saveSmartFlags(next as Record<SmartFeatureKey, boolean>, '已恢复智能开关默认值');
    };

    const enabledCount = SMART_FEATURE_KEYS.filter((key) => smartFlags[key]).length;

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

    const saveSmartProfile = async () => {
        if (!canManageSmartFlags) {
            message.error('仅租户管理员可修改智能经营画像');
            return;
        }
        try {
            const values = await smartProfileForm.validateFields();
            setSavingSmartProfile(true);
            const profile = await tenantIntelligenceProfileService.save({
                primaryGoal: values.primaryGoal,
                deliveryWarningDays: Number(values.deliveryWarningDays),
                anomalyWarningCount: Number(values.anomalyWarningCount),
                lowMarginThreshold: Number(values.lowMarginThreshold),
            });
            syncSmartProfileForm(profile);
            message.success('智能经营画像已保存');
        } catch (e: unknown) {
            if (e && typeof e === 'object' && 'errorFields' in e) return;
            message.error(e instanceof Error ? e.message : '保存智能经营画像失败');
        } finally {
            setSavingSmartProfile(false);
        }
    };

    const resetSmartProfile = async () => {
        if (!canManageSmartFlags) {
            message.error('仅租户管理员可修改智能经营画像');
            return;
        }
        try {
            setSavingSmartProfile(true);
            const profile = await tenantIntelligenceProfileService.reset();
            syncSmartProfileForm(profile);
            message.success('已恢复为系统学习建议');
        } catch (e: unknown) {
            message.error(e instanceof Error ? e.message : '恢复学习建议失败');
        } finally {
            setSavingSmartProfile(false);
        }
    };

    const handleCopyRegisterUrl = (registerUrl: string) => {
        navigator.clipboard.writeText(registerUrl).then(() => {
            message.success('注册链接已复制');
        }).catch(() => {
            message.error('复制失败');
        });
    };

    const handleCopyTenantCode = (tenantCode: string) => {
        navigator.clipboard.writeText(tenantCode).then(() => {
            message.success('工厂码已复制');
        }).catch(() => {
            message.error('复制失败');
        });
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
