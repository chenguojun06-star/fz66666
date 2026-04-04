/**
 * 个人信息 Tab — 用户基本信息、修改密码、工厂信息、员工招募、问题反馈
 * 独立组件，在 Profile（个人中心）页面中作为 Tab 使用
 */
import React, { useEffect, useMemo, useState } from 'react';
import { App, Avatar, Button, Card, Form, Input, Select, Space, Spin, Typography } from 'antd';
import { LockOutlined, TeamOutlined } from '@ant-design/icons';
import ImageUploadBox from '@/components/common/ImageUploadBox';
import api from '@/utils/api';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import { useAuth } from '@/utils/AuthContext';
import tenantSmartFeatureService from '@/services/system/tenantSmartFeatureService';
import tenantIntelligenceProfileService from '@/services/system/tenantIntelligenceProfileService';
import type { TenantIntelligenceProfilePayload, TenantIntelligenceProfileResponse } from '@/services/system/tenantIntelligenceProfileService';
import {
    getSmartFeatureFlags,
    replaceSmartFeatureFlags,
    resetSmartFeatureFlags,
    type SmartFeatureKey,
} from '@/smart/core/featureFlags';
import feedbackService from '@/services/feedbackService';
import type { UserFeedback } from '@/services/feedbackService';
import ProfileSmartSettingsPanel, { SMART_FEATURE_KEYS } from './ProfileSmartSettingsPanel';
import ProfileTenantEngagementPanel from './ProfileTenantEngagementPanel';
import ProfileFeedbackModal from './ProfileFeedbackModal';

type ProfileMe = {
    id?: string | number;
    username?: string;
    name?: string;
    phone?: string;
    email?: string;
    roleName?: string;
    roleId?: string | number;
};

const ProfileInfoTab: React.FC = () => {
    const { user, updateUser, isAdmin, isTenantOwner, isSuperAdmin } = useAuth();
    const { message } = App.useApp();
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [form] = Form.useForm();
    const [pwdForm] = Form.useForm();
    const [savingPwd, setSavingPwd] = useState(false);
    const avatarUrl = Form.useWatch('avatarUrl', form);
    const [tenantInfo, setTenantInfo] = useState<{ tenantCode?: string; tenantName?: string; contactName?: string; contactPhone?: string } | null>(null);
    const [tenantForm] = Form.useForm();

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
    const fallbackTheme = 'white';

    // 主题
    const getUserThemeKey = () => {
        const userId = String(user?.id || '').trim();
        return userId ? `app.theme.user.${userId}` : 'app.theme';
    };

    const [theme, setTheme] = useState<string>(() => {
        try {
            const savedTheme = String(localStorage.getItem(getUserThemeKey()) || '').trim();
            return !savedTheme || savedTheme === 'default' ? fallbackTheme : savedTheme;
        } catch {
            return fallbackTheme;
        }
    });

    const initialRoleName = useMemo(() => String(user?.role || '').trim(), [user?.role]);
    const initialName = useMemo(() => String(user?.name || '').trim(), [user?.name]);

    const applyTheme = (nextTheme: string) => {
        if (typeof document === 'undefined') return;
        const root = document.documentElement;
        const t = String(nextTheme || '').trim();
        const resolvedTheme = !t || t === 'default' ? fallbackTheme : t;
        root.setAttribute('data-theme', resolvedTheme);
    };

    const loadProfile = async () => {
        setLoading(true);
        try {
            const res: any = await api.get('/system/user/me');
            if (res?.code === 200 && res?.data) {
                const data: ProfileMe = res.data;
                const avatar = (res.data as any).avatarUrl || (res.data as any).avatar || (res.data as any).headUrl || undefined;
                form.setFieldsValue({
                    username: data.username,
                    roleName: data.roleName || initialRoleName,
                    name: data.name,
                    phone: data.phone,
                    email: data.email,
                    avatarUrl: avatar,
                });
                updateUser({
                    id: String(data.id ?? user?.id ?? ''),
                    username: String(data.username ?? user?.username ?? ''),
                    name: String(data.name ?? user?.name ?? ''),
                    role: String(data.roleName ?? user?.role ?? ''),
                    roleId: data.roleId != null ? String(data.roleId) : user?.roleId,
                    phone: data.phone || undefined,
                    email: data.email || undefined,
                    avatarUrl: avatar,
                });
                return;
            }
            message.error(res?.message || '加载个人信息失败');
        } catch (e: any) {
            message.error(e?.message || '加载个人信息失败');
        } finally {
            setLoading(false);
        }
    };

    const syncSmartProfileForm = (profile: TenantIntelligenceProfileResponse) => {
        setSmartProfile(profile);
        smartProfileForm.setFieldsValue({
            primaryGoal: profile.primaryGoal,
            deliveryWarningDays: profile.deliveryWarningDays,
            anomalyWarningCount: profile.anomalyWarningCount,
            lowMarginThreshold: profile.lowMarginThreshold,
        });
    };

    const loadSmartProfile = async () => {
        setLoadingSmartProfile(true);
        try {
            const profile = await tenantIntelligenceProfileService.getCurrent();
            syncSmartProfileForm(profile);
        } catch (e: any) {
            message.error(e?.message || '加载智能经营画像失败');
        } finally {
            setLoadingSmartProfile(false);
        }
    };

    useEffect(() => {
        applyTheme(theme);
        form.setFieldsValue({
            username: user?.username,
            roleName: initialRoleName,
            name: user?.name,
            phone: user?.phone,
            email: user?.email,
            avatarUrl: (user as any)?.avatarUrl,
        });
        loadProfile();
        tenantSmartFeatureService.list().then((flags) => {
            setSmartFlags(replaceSmartFeatureFlags(flags));
        }).catch(() => {});

        // 加载租户信息
        const tid = (user as any)?.tenantId;
        if (tid) {
            const role = String((user as any)?.role || '').toLowerCase();
            const isOwner = (user as any)?.isTenantOwner;
            if (isOwner || role.includes('admin') || role.includes('manager') || role.includes('supervisor')) {
                api.get('/system/tenant/my').then((res: unknown) => {
                    const r = res as any;
                    if (r?.code === 200 && r?.data) {
                        const d = r.data as any;
                        const info = {
                            tenantCode: String(d.tenantCode || ''),
                            tenantName: String(d.tenantName || ''),
                            contactName: String(d.contactName || ''),
                            contactPhone: String(d.contactPhone || ''),
                        };
                        setTenantInfo(info);
                        tenantForm.setFieldsValue({
                            tenantName: info.tenantName,
                            contactName: info.contactName,
                            contactPhone: info.contactPhone,
                        });
                    }
                }).catch(() => {});
            }
        }
    }, []);

    useEffect(() => {
        if (!canManageSmartFlags) {
            return;
        }
        void loadSmartProfile();
    }, [canManageSmartFlags]);

    const onThemeChange = (next: string) => {
        const v = String(next || '').trim() || fallbackTheme;
        setTheme(v);
        applyTheme(v);
        try {
            const themeKey = getUserThemeKey();
            localStorage.setItem(themeKey, v);
            localStorage.setItem('app.theme', v);
            window.dispatchEvent(new Event('theme-change'));
        } catch {
            // ignore
        }
        message.success('主题已切换');
    };



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
        } catch (e: any) {
            if (e?.errorFields?.length) return;
            message.error(e?.message || '保存失败');
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
        } catch (e: any) {
            if (e?.errorFields?.length) return;
            message.error(e?.message || '修改失败');
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
        } catch (e: any) {
            if (e?.errorFields) return;
            message.error(e?.message || '提交失败');
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
        } catch (e: any) {
            message.error(e?.message || '保存智能开关失败');
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
        } catch (e: any) {
            if (e?.errorFields?.length) return;
            message.error(e?.message || '保存智能经营画像失败');
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
        } catch (e: any) {
            message.error(e?.message || '恢复学习建议失败');
        } finally {
            setSavingSmartProfile(false);
        }
    };

    return (
        <>
            {/* 顶部操作栏 */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
                <Space>
                    <Button onClick={loadProfile} disabled={loading || saving}>刷新</Button>
                    <Button type="primary" onClick={saveProfile} loading={saving}>保存手机号</Button>
                </Space>
            </div>

            {/* 头像 + 主题选择 */}
            <Card size="small" className="filter-card mb-sm">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <ImageUploadBox
                            shape="round"
                            size={72}
                            label="头像"
                            showClear={false}
                            value={getFullAuthedFileUrl(String(avatarUrl || (user as any)?.avatarUrl || '').trim()) || null}
                            uploadFn={async (file) => {
                                if (!file.type.startsWith('image/')) throw new Error('仅支持图片文件');
                                if (file.size > 5 * 1024 * 1024) throw new Error('图片过大，最大5MB');
                                const formData = new FormData();
                                formData.append('file', file);
                                const res = await api.post<{ code: number; message: string; data: string }>('/common/upload', formData);
                                if (res.code !== 200) throw new Error(res.message || '上传失败');
                                const url = String(res.data || '').trim();
                                if (!url) throw new Error('上传失败');
                                return url;
                            }}
                            onChange={async (url) => {
                                if (!url) return;
                                form.setFieldsValue({ avatarUrl: url });
                                updateUser({ avatarUrl: url } as any);
                                try { await api.put('/system/user/me', { avatarUrl: url }); } catch { /* ignore */ }
                                message.success('上传成功');
                            }}
                        />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <label htmlFor="profile-theme-select" style={{ fontWeight: 700 }}>主题</label>
                        <Select
                            id="profile-theme-select"
                            style={{ width: 220 }}
                            value={theme}
                            onChange={onThemeChange}
                            options={[
                                { value: 'white', label: '默认主题（纯白）' },
                                { value: 'blue', label: '经典蓝主题（深蓝侧栏）' },
                                { value: 'lightblue', label: '浅蓝主题（浅色）' },
                                { value: 'dark', label: '深色主题（雾黑）' },
                            ]}
                        />
                    </div>
                </div>
            </Card>

            {/* 2列布局：左列用户信息+密码，右列工厂信息+员工招募 */}
            <div style={{ display: 'grid', gridTemplateColumns: '480px 1fr', gap: '0 64px', alignItems: 'start' }}>
                {/* 左列：用户信息 + 修改密码 */}
                <div>
                    <Spin spinning={loading}>
                        <Form form={form} layout="vertical" requiredMark={false}>
                            <Form.Item name="avatarUrl" hidden><Input /></Form.Item>
                            <Form.Item label="用户名" name="username"><Input disabled autoComplete="username" /></Form.Item>
                            <Form.Item label="角色" name="roleName"><Input disabled autoComplete="off" /></Form.Item>
                            <Form.Item label="姓名" name="name"><Input disabled autoComplete="name" /></Form.Item>
                            <Form.Item
                                label="手机号" name="phone"
                                rules={[{
                                    validator: async (_, value) => {
                                        const v = String(value || '').trim();
                                        if (!v) return;
                                        if (!/^1\d{10}$/.test(v)) throw new Error('手机号格式不正确');
                                    },
                                }]}
                            >
                                <Input placeholder="请输入手机号" autoComplete="tel" />
                            </Form.Item>
                            <Form.Item label="邮箱" name="email"><Input disabled autoComplete="email" /></Form.Item>
                        </Form>
                    </Spin>

                    {/* 修改密码 */}
                    <div style={{ marginTop: 32 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                            <LockOutlined style={{ color: 'var(--primary-color)' }} />
                            <span style={{ fontWeight: 600, fontSize: 15 }}>修改密码</span>
                        </div>
                        <Form form={pwdForm} layout="vertical" requiredMark={false}>
                            <Form.Item label="原密码" name="oldPassword" rules={[{ required: true, message: '请输入原密码' }]}>
                                <Input.Password id="oldPassword" placeholder="请输入当前密码" autoComplete="current-password" />
                            </Form.Item>
                            <Form.Item label="新密码" name="newPassword" rules={[{ required: true, min: 6, message: '新密码不能少于6位' }]}>
                                <Input.Password id="newPassword" placeholder="请输入新密码（至少6位）" autoComplete="new-password" />
                            </Form.Item>
                            <Form.Item label="确认新密码" name="confirmPassword" dependencies={['newPassword']} rules={[
                                { required: true, message: '请再次输入新密码' },
                                ({ getFieldValue }) => ({
                                    validator(_, value) {
                                        if (!value || getFieldValue('newPassword') === value) return Promise.resolve();
                                        return Promise.reject(new Error('两次输入的密码不一致!'));
                                    },
                                }),
                            ]}>
                                <Input.Password id="confirmPassword" placeholder="请再次输入新密码" autoComplete="new-password" />
                            </Form.Item>
                            <Form.Item>
                                <Button type="primary" onClick={changePassword} loading={savingPwd} icon={<LockOutlined />}>
                                    确认修改密码
                                </Button>
                            </Form.Item>
                        </Form>
                    </div>
                </div>

                {/* 右列：工厂信息 + 员工招募 + 问题反馈 */}
                <div>
                    {/* 工厂信息 */}
                    {tenantInfo?.tenantCode && (
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                                <TeamOutlined style={{ color: 'var(--primary-color)' }} />
                                <span style={{ fontWeight: 600, fontSize: 15 }}>工厂信息</span>
                                <Typography.Text type="secondary" style={{ fontSize: 12 }}>（如需修改请联系管理员）</Typography.Text>
                            </div>
                            <Form form={tenantForm} layout="vertical" requiredMark={false}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 16px' }}>
                                    <Form.Item label="工厂名称" name="tenantName"><Input disabled autoComplete="organization" /></Form.Item>
                                    <Form.Item label="联系人" name="contactName"><Input disabled autoComplete="name" /></Form.Item>
                                    <Form.Item label="联系电话" name="contactPhone"><Input disabled autoComplete="tel" /></Form.Item>
                                </div>
                            </Form>
                            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                工厂码：<Typography.Text code copyable>{tenantInfo.tenantCode}</Typography.Text>（不可修改）
                            </Typography.Text>
                        </div>
                    )}

                    {/* 员工招募 + 问题反馈（左）+ 智能开关（右）— 仅管理员/租户主账号可见 */}
                    {canManageSmartFlags && (
                    <div
                        style={{
                            marginTop: 32,
                            display: 'grid',
                            gridTemplateColumns: tenantInfo?.tenantCode ? 'minmax(260px, 1fr) minmax(360px, 1fr)' : '1fr',
                            gap: 16,
                            alignItems: 'start',
                        }}
                    >
                        {tenantInfo?.tenantCode && (
                            <ProfileTenantEngagementPanel
                                tenantInfo={tenantInfo}
                                myFeedbacks={myFeedbacks}
                                loadingFeedbacks={loadingFeedbacks}
                                onOpenFeedback={() => setFeedbackVisible(true)}
                                onLoadFeedbacks={() => { void loadMyFeedbacks(); }}
                                onCopyRegisterUrl={(registerUrl) => {
                                    navigator.clipboard.writeText(registerUrl).then(() => {
                                        message.success('注册链接已复制');
                                    }).catch(() => {
                                        message.error('复制失败');
                                    });
                                }}
                                onCopyTenantCode={(tenantCode) => {
                                    navigator.clipboard.writeText(tenantCode).then(() => {
                                        message.success('工厂码已复制');
                                    }).catch(() => {
                                        message.error('复制失败');
                                    });
                                }}
                            />
                        )}

                        <ProfileSmartSettingsPanel
                            canManageSmartFlags={canManageSmartFlags}
                            smartFlags={smartFlags as Record<SmartFeatureKey, boolean>}
                            savingSmartFlags={savingSmartFlags}
                            enabledCount={enabledCount}
                            onEnableAll={() => setAllSmartFlags(true)}
                            onDisableAll={() => setAllSmartFlags(false)}
                            onResetFlags={resetSmartFlags}
                            onToggleFlag={updateSmartFlag}
                            smartProfileForm={smartProfileForm}
                            smartProfile={smartProfile}
                            loadingSmartProfile={loadingSmartProfile}
                            savingSmartProfile={savingSmartProfile}
                            onRefreshProfile={() => void loadSmartProfile()}
                            onResetProfile={resetSmartProfile}
                            onSaveProfile={saveSmartProfile}
                        />
                    </div>
                    )}

                    <ProfileFeedbackModal
                        open={feedbackVisible}
                        feedbackForm={feedbackForm}
                        submitting={submittingFeedback}
                        onCancel={() => setFeedbackVisible(false)}
                        onSubmit={submitFeedback}
                    />
                </div>
            </div>
        </>
    );
};

export default ProfileInfoTab;
