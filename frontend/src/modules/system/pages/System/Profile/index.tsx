import React, { useEffect, useMemo, useState } from 'react';
import { App, Avatar, Button, Card, Form, Input, Select, Space, Spin, Upload } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import Layout from '@/components/Layout';
import api from '@/utils/api';
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
    const avatarUrl = Form.useWatch('avatarUrl', form);

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
            const res: unknown = await api.get('/system/user/me');
            if (res?.code === 200 && res?.data) {
                const data: ProfileMe = res.data;
                const avatar = (res.data as Record<string, unknown>).avatarUrl || (res.data as Record<string, unknown>).avatar || (res.data as Record<string, unknown>).headUrl || undefined;
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
        } catch (e: unknown) {
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
            avatarUrl: (user as Record<string, unknown>)?.avatarUrl,
        });
        loadProfile();
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
            updateUser({ avatarUrl: url } as Record<string, unknown>);
            message.success('上传成功');
        } catch (e: unknown) {
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
                name: values.name,
                phone: values.phone,
                email: values.email,
                avatarUrl: values.avatarUrl,
            };
            const res: unknown = await api.put('/system/user/me', payload);
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
            if (e?.errorFields?.length) return;
            message.error(e?.message || '保存失败');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Layout>
            <Card className="page-card">
                <div className="page-header">
                    <h2 className="page-title">个人中心</h2>
                    <Space>
                        <Button onClick={loadProfile} disabled={loading || saving}>
                            刷新
                        </Button>
                        <Button type="primary" onClick={saveProfile} loading={saving}>
                            保存
                        </Button>
                    </Space>
                </div>
                <Card size="small" className="filter-card mb-sm">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <Avatar
                                size={72}
                                src={String(avatarUrl || (user as Record<string, unknown>)?.avatarUrl || '').trim() || undefined}
                                style={{ fontWeight: 800 }}
                            >
                                {(initialName || 'U').slice(0, 1).toUpperCase()}
                            </Avatar>
                            <Upload showUploadList={false} beforeUpload={uploadAvatar}>
                                <Button icon={<UploadOutlined />} loading={avatarUploading} disabled={avatarUploading}>
                                    上传头像
                                </Button>
                            </Upload>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ fontWeight: 700 }}>主题</span>
                            <Select
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
                <Spin spinning={loading}>
                    <Form form={form} layout="vertical" requiredMark={false} style={{ maxWidth: 520 }}>
                        <Form.Item name="avatarUrl" hidden>
                            <Input />
                        </Form.Item>
                        <Form.Item label="用户名" name="username">
                            <Input disabled autoComplete="username" />
                        </Form.Item>
                        <Form.Item label="角色" name="roleName">
                            <Input disabled />
                        </Form.Item>
                        <Form.Item label="姓名" name="name" rules={[{ required: true, message: '请输入姓名' }]}>
                            <Input placeholder="请输入姓名" autoComplete="name" />
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
                        <Form.Item label="邮箱" name="email" rules={[{ type: 'email', message: '邮箱格式不正确' }]}>
                            <Input placeholder="请输入邮箱" autoComplete="email" />
                        </Form.Item>
                    </Form>
                </Spin>
            </Card>
        </Layout>
    );
};

export default Profile;
