import React, { useState, useCallback } from 'react';
import { App, Avatar, Button, Descriptions, Input, Space, Tag } from 'antd';
import { CrownFilled, LockOutlined, UserOutlined } from '@ant-design/icons';
import SmallModal from '@/components/common/SmallModal';
import type { User } from '@/types/system';

interface ProfileModalProps {
  open: boolean;
  user: User | null;
  unitNameMap: Record<string, string>;
  onClose: () => void;
  onResetPwd: (userId: string, newPassword: string) => Promise<void>;
}

const ProfileModal: React.FC<ProfileModalProps> = ({ open, user, unitNameMap, onClose, onResetPwd }) => {
  const { message } = App.useApp();
  const [resetPwdVisible, setResetPwdVisible] = useState(false);
  const [resetPwdValue, setResetPwdValue] = useState('');
  const [resetPwdLoading, setResetPwdLoading] = useState(false);

  const handleClose = useCallback(() => {
    setResetPwdVisible(false);
    setResetPwdValue('');
    onClose();
  }, [onClose]);

  const handleResetPwd = useCallback(async () => {
    if (!user?.id) return;
    if (!resetPwdValue || resetPwdValue.length < 6) {
      message.warning('新密码不能少于6位');
      return;
    }
    setResetPwdLoading(true);
    try {
      await onResetPwd(String(user.id), resetPwdValue);
      message.success('密码已重置');
      setResetPwdVisible(false);
      setResetPwdValue('');
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '重置失败');
    } finally {
      setResetPwdLoading(false);
    }
  }, [user, resetPwdValue, onResetPwd, message]);

  return (
    <SmallModal
      open={open}
      onCancel={handleClose}
      footer={null}
      width={360}
      title="成员资料"
      centered
    >
      {user && (
        <div>
          <div style={{ textAlign: 'center', paddingBottom: 16, borderBottom: `1px solid var(--color-border-light, #f0f0f0)`, marginBottom: 16 }}>
            <Avatar
              size={64}
              icon={<UserOutlined />}
              style={{ backgroundColor: user.isFactoryOwner ? 'var(--color-warning, #faad14)' : 'var(--primary-color, #1677ff)', display: 'block', margin: '0 auto 12px' }}
            />
            <div style={{ fontSize: 16, fontWeight: 600 }}>
              {user.name || user.username}
              {user.isFactoryOwner && (
                <Tag icon={<CrownFilled />} color="gold" style={{ marginLeft: 8 }}>老板</Tag>
              )}
            </div>
            <div style={{ color: 'var(--neutral-text-tertiary, #999)', fontSize: 13, marginTop: 4 }}>@{user.username}</div>
          </div>
          <Descriptions column={1}>
            <Descriptions.Item label="手机">{user.phone || '—'}</Descriptions.Item>
            <Descriptions.Item label="角色">{user.roleName || '—'}</Descriptions.Item>
            <Descriptions.Item label="所属部门">
              {user.orgUnitId ? (unitNameMap[user.orgUnitId] || '—') : '—'}
            </Descriptions.Item>
            <Descriptions.Item label="帐号状态">
              <Tag color={user.status === 'active' ? 'green' : 'default'}>
                {user.status === 'active' ? '正常' : '已停用'}
              </Tag>
            </Descriptions.Item>
          </Descriptions>
          {user.factoryId && (
            <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px solid var(--color-border-light, #f0f0f0)` }}>
              {!resetPwdVisible ? (
                <Button block icon={<LockOutlined />} onClick={() => { setResetPwdValue(''); setResetPwdVisible(true); }}>
                  重置密码
                </Button>
              ) : (
                <div>
                  <Input.Password
                    placeholder="请输入新密码（至少6位）"
                    autoComplete="new-password"
                    value={resetPwdValue}
                    onChange={e => setResetPwdValue(e.target.value)}
                    style={{ marginBottom: 8 }}
                  />
                  <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
                    <Button onClick={() => { setResetPwdVisible(false); setResetPwdValue(''); }}>取消</Button>
                    <Button type="primary" loading={resetPwdLoading} onClick={handleResetPwd}>确认重置</Button>
                  </Space>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </SmallModal>
  );
};

export default ProfileModal;
