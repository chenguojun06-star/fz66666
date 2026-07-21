/**
 * 顶部操作栏 — 刷新 / 保存手机号
 */
import React from 'react';
import { Button, Space } from 'antd';

interface ProfileActionBarProps {
    loading: boolean;
    saving: boolean;
    onRefresh: () => void;
    onSave: () => void;
}

const ProfileActionBar: React.FC<ProfileActionBarProps> = ({ loading, saving, onRefresh, onSave }) => {
    return (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
            <Space>
                <Button onClick={onRefresh} disabled={loading || saving}>刷新</Button>
                <Button type="primary" onClick={onSave} loading={saving}>保存手机号</Button>
            </Space>
        </div>
    );
};

export default ProfileActionBar;
