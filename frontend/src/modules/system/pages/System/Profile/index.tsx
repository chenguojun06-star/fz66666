import React, { useEffect, useMemo, useState } from 'react';
import { App, Avatar, Button, Card, Form, Input, QRCode, Select, Space, Spin, Typography, Upload } from 'antd';
import { LockOutlined, LinkOutlined, QrcodeOutlined, TeamOutlined, UploadOutlined } from '@ant-design/icons';
import Layout from '@/components/Layout';
import api from '@/utils/api';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import { useAuth } from '@/utils/AuthContext';
import './styles.css';

type ProfileMe = {
    id?: string | number;
    username?: string;
    name?: string;
    phone?: string;
    email?: string;
    roleName?: string;
    roleId?: string | number;
};

const Profile: React.FC = () => {
    const { user, updateUser } = useAuth();
    const { message } = App.useApp();
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [avatarUploading, setAvatarUploading] = useState(false);
    const [form] = Form.useForm();
    const [pwdForm] = Form.useForm();
    const [savingPwd, setSavingPwd] = useState(false);
    const avatarUrl = Form.useWatch('avatarUrl', form);
    const [tenantInfo, setTenantInfo] = useState<{ tenantCode?: string; tenantName?: string; contactName?: string; contactPhone?: string } | null>(null);
    const [tenantForm] = Form.useForm();
    const [savingTenant, setSavingTenant] = useState(false);

    // 获取当前用户的主题存储key（每个账号独立）
    const getUserThemeKey = () => {
        const userId = String(user?.id || '').trim();
        return userId ? `app.theme.user.${userId}` : 'app.theme';
    };

    const [theme, setTheme] = useState<string>(() => {
        try {
            return localStorage.getItem(getUserThemeKey()) || 'default';
        } catch {
    // Intentionally empty
      // 忽略错误
            return 'default';
        }
    });

    const initialRoleName = useMemo(() => String(user?.role || '').trim(), [user?.role]);
    const initialName = useMemo(() => String(user?.name || '').trim(), [user?.name]);

    const applyTheme = (nextTheme: string) => {
        if (typeof document === 'undefined') return;
        const root = document.documentElement;
        const t = String(nextTheme || '').trim();
        if (!t || t === 'default') {
            root.removeAttribute('data-theme');
            return;
        }
        root.setAttribute('data-theme', t);
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

        // 加载租户信息（用于工厂信息编辑和员工招募），超管无 tenantId 不加载
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

    const onThemeChange = (next: string) => {
        const v = String(next || '').trim() || 'default';
        setTheme(v);
        applyTheme(v);
        try {
            const themeKey = getUserThemeKey();
            localStorage.setItem(themeKey, v);
            // 同时设置全局主题key供其他地方使用
            localStorage.setItem('app.theme', v);
            // 触发自定义事件通知 ConfigProvider 更新主题
            window.dispatchEvent(new Event('theme-change'));
        } catch {
    // Intentionally empty
      // 忽略错误
        }
        message.success('主题已切换');
    };

    const uploadAvatar = async (file: File) => {
        if (!file.type.startsWith('image/')) {
            message.error('仅支持图片文件');
            return Upload.LIST_IGNORE;
        }
        if (file.size > 5 * 1024 * 1024) {
            message.error('图片过大，最大5MB');
            return Upload.LIST_IGNORE;
        }
        setAvatarUploading(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            const res = await api.post<{ code: number; message: string; data: string }>('/common/upload', formData);
            if (res.code !== 200) {
                message.error(res.message || '上传失败');
                return Upload.LIST_IGNORE;
            }
            const url = String(res.data || '').trim();
            if (!url) {
                message.error('上传失败');
                return Upload.LIST_IGNORE;
            }
            form.setFieldsValue({ avatarUrl: url });
            updateUser({ avatarUrl: url } as any);
            message.success('上传成功');
        } catch (e: any) {
            message.error(e?.message || '上传失败');
        } finally {
            setAvatarUploading(false);
        }
        return Upload.LIST_IGNORE;
    };

    const saveProfile = async () => {
        try {
            const values = await form.validateFields();
            setSaving(true);
            const payload = {
                phone: values.phone,
            };
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

    return (
        <Layout>
            <Card className="page-card">
                <div className="page-header">
                    <div>
                        <h2 className="page-title" style={{ marginBottom: 4 }}>个人中心</h2>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>仅手机号和密码可自助修改，其他信息需管理员操作</Typography.Text>
                    </div>
                    <Space>
                        <Button onClick={loadProfile} disabled={loading || saving}>
                            刷新
                        </Button>
                        <Button type="primary" onClick={saveProfile} loading={saving}>
                            保存手机号
                        </Button>
                    </Space>
                </div>
                <Card size="small" className="filter-card mb-sm">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <Avatar
                                size={72}
                                src={getFullAuthedFileUrl(String(avatarUrl || (user as any)?.avatarUrl || '').trim()) || undefined}
                                style={{ fontWeight: 800 }}
                            >
                                {(initialName || 'U').slice(0, 1).toUpperCase()}
                            </Avatar>

                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <label htmlFor="profile-theme-select" style={{ fontWeight: 700 }}>主题</label>
                            <Select
                                id="profile-theme-select"
                                style={{ width: 220 }}
                                value={theme}
                                onChange={onThemeChange}
                                options={[
                                    { value: 'default', label: '默认主题（浅色）' },
                                    { value: 'lightblue', label: '浅蓝主题（浅色）' },
                                    { value: 'white', label: '纯白主题（浅色）' },
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
                        <Form.Item name="avatarUrl" hidden>
                            <Input />
                        </Form.Item>
                        <Form.Item label="用户名" name="username">
                            <Input disabled autoComplete="username" />
                        </Form.Item>
                        <Form.Item label="角色" name="roleName">
                            <Input disabled autoComplete="off" />
                        </Form.Item>
                        <Form.Item label="姓名" name="name">
                            <Input disabled autoComplete="name" />
                        </Form.Item>
                        <Form.Item
                            label="手机号"
                            name="phone"
                            rules={[
                                {
                                    validator: async (_, value) => {
                                        const v = String(value || '').trim();
                                        if (!v) return;
                                        if (!/^1\d{10}$/.test(v)) {
                                            throw new Error('手机号格式不正确');
                                        }
                                    },
                                },
                            ]}
                        >
                            <Input placeholder="请输入手机号" autoComplete="tel" />
                        </Form.Item>
                        <Form.Item label="邮箱" name="email">
                            <Input disabled autoComplete="email" />
                        </Form.Item>
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
                            <Input.Password placeholder="请输入当前密码" autoComplete="current-password" />
                        </Form.Item>
                        <Form.Item label="新密码" name="newPassword" rules={[{ required: true, min: 6, message: '新密码不能少于6位' }]}>
                            <Input.Password placeholder="请输入新密码（至少6位）" autoComplete="new-password" />
                        </Form.Item>
                        <Form.Item label="确认新密码" name="confirmPassword" rules={[{ required: true, message: '请再次输入新密码' }]}>
                            <Input.Password placeholder="请再次输入新密码" autoComplete="new-password" />
                        </Form.Item>
                        <Form.Item>
                            <Button type="primary" onClick={changePassword} loading={savingPwd} icon={<LockOutlined />}>
                                确认修改密码
                            </Button>
                        </Form.Item>
                    </Form>
                </div>
                  </div>{/* end 左列 */}

                  {/* 右列：工厂信息 + 员工招募 */}
                  <div>
                {/* 工厂信息（租户用户可见，可自行修改工厂名称等） */}
                {tenantInfo?.tenantCode && (
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                            <TeamOutlined style={{ color: 'var(--primary-color)' }} />
                            <span style={{ fontWeight: 600, fontSize: 15 }}>工厂信息</span>
                            <Typography.Text type="secondary" style={{ fontSize: 12 }}>（如需修改请联系管理员）</Typography.Text>
                        </div>
                        <Form form={tenantForm} layout="vertical" requiredMark={false}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 16px' }}>
                                <Form.Item label="工厂名称" name="tenantName">
                                    <Input disabled autoComplete="organization" />
                                </Form.Item>
                                <Form.Item label="联系人" name="contactName">
                                    <Input disabled autoComplete="name" />
                                </Form.Item>
                                <Form.Item label="联系电话" name="contactPhone">
                                    <Input disabled autoComplete="tel" />
                                </Form.Item>
                            </div>
                        </Form>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                            工厂码：<Typography.Text code copyable>{tenantInfo.tenantCode}</Typography.Text>（不可修改）
                        </Typography.Text>
                    </div>
                )}

                {/* 员工招募（租户主账号和管理员可见） */}
                {tenantInfo?.tenantCode && (() => {
                    const origin = window.location.origin;
                    const registerUrl = `${origin}/register?tenantCode=${encodeURIComponent(tenantInfo.tenantCode!)}&tenantName=${encodeURIComponent(tenantInfo.tenantName || '')}`;
                    return (
                        <div style={{ marginTop: 32 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                                <TeamOutlined style={{ color: 'var(--primary-color)' }} />
                                <span style={{ fontWeight: 600, fontSize: 15 }}>员工招募</span>
                            </div>
                            <Card size="small" style={{ borderRadius: 10, background: 'var(--card-bg, #f8f9ff)' }}>
                                <div style={{ textAlign: 'center', marginBottom: 12 }}>
                                    <QRCode value={registerUrl} size={160} />
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, justifyContent: 'center' }}>
                                    <span style={{ color: '#888', fontSize: 13, whiteSpace: 'nowrap' }}>工厂码</span>
                                    <Typography.Text code copyable={{ text: tenantInfo.tenantCode }} style={{ fontSize: 18, fontWeight: 700 }}>
                                        {tenantInfo.tenantCode}
                                    </Typography.Text>
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                                    <Button
                                        size="small"
                                        icon={<LinkOutlined />}
                                        onClick={() => {
                                            navigator.clipboard.writeText(registerUrl);
                                            message.success('注册链接已复制');
                                        }}
                                    >
                                        复制注册链接
                                    </Button>
                                    <Button
                                        size="small"
                                        icon={<QrcodeOutlined />}
                                        onClick={() => {
                                            navigator.clipboard.writeText(tenantInfo.tenantCode!);
                                            message.success('工厂码已复制');
                                        }}
                                    >
                                        复制工厂码
                                    </Button>
                                </div>
                                <Typography.Text type="secondary" style={{ fontSize: 11, marginTop: 10, display: 'block', wordBreak: 'break-all', textAlign: 'center' }}>
                                    员工扫码二维码或输入工厂码即可申请加入，审批通过后可登录
                                </Typography.Text>
                            </Card>
                        </div>
                    );
                })()}
                  </div>{/* end 右列 */}
                </div>{/* end 2列布局 */}
            </Card>
        </Layout>
    );
};

export default Profile;
