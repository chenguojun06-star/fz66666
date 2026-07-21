/**
 * 头像上传 + 主题选择卡片
 */
import React from 'react';
import { Card, Select } from 'antd';
import ImageUploadBox from '@/components/common/ImageUploadBox';
import api from '@/utils/api';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import { THEME_OPTIONS } from '../theme';

interface ProfileAvatarThemeCardProps {
    avatarUrl: unknown;
    userAvatarUrl?: string;
    theme: string;
    onThemeChange: (next: string) => void;
    onAvatarChange: (url: string) => void;
}

const ProfileAvatarThemeCard: React.FC<ProfileAvatarThemeCardProps> = ({
    avatarUrl,
    userAvatarUrl,
    theme,
    onThemeChange,
    onAvatarChange,
}) => {
    return (
        <Card className="filter-card mb-sm">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <ImageUploadBox
                        shape="round"
                        size={72}
                        label="头像"
                        showClear={false}
                        value={getFullAuthedFileUrl(String(avatarUrl || userAvatarUrl || '').trim()) || null}
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
                            onAvatarChange(url);
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
                        options={THEME_OPTIONS}
                    />
                </div>
            </div>
        </Card>
    );
};

export default ProfileAvatarThemeCard;
