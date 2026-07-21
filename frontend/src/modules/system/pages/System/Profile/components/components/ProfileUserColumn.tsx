/**
 * 左列 — 用户信息表单 + 修改密码
 */
import React from 'react';
import { Button, Form, Input, Spin } from 'antd';
import { LockOutlined } from '@ant-design/icons';
import type { FormInstance } from 'antd';

interface ProfileUserColumnProps {
    loading: boolean;
    form: FormInstance;
    pwdForm: FormInstance;
    username?: string;
    savingPwd: boolean;
    onChangePassword: () => void;
}

const ProfileUserColumn: React.FC<ProfileUserColumnProps> = ({
    loading,
    form,
    pwdForm,
    username,
    savingPwd,
    onChangePassword,
}) => {
    return (
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
                    {/* Hidden username field for browser password manager accessibility */}
                    <input type="text" name="username" autoComplete="username" defaultValue={username ?? ''} style={{ display: 'none' }} readOnly aria-hidden="true" />
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
                        <Button type="primary" onClick={onChangePassword} loading={savingPwd} icon={<LockOutlined />}>
                            确认修改密码
                        </Button>
                    </Form.Item>
                </Form>
            </div>
        </div>
    );
};

export default ProfileUserColumn;
