/**
 * 个人信息 Tab — 用户基本信息、修改密码、工厂信息、员工招募、问题反馈
 * 独立组件，在 Profile（个人中心）页面中作为 Tab 使用
 *
 * 本文件仅负责渲染和组合，业务逻辑见 useProfileInfoData，子区块见 components/
 */
import React from 'react';
import ProfileActionBar from './components/ProfileActionBar';
import ProfileAvatarThemeCard from './components/ProfileAvatarThemeCard';
import ProfileUserColumn from './components/ProfileUserColumn';
import ProfileTenantInfoBlock from './components/ProfileTenantInfoBlock';
import ProfileAdminSection from './components/ProfileAdminSection';
import useProfileInfoData from './useProfileInfoData';

const ProfileInfoTab: React.FC = () => {
    const data = useProfileInfoData();

    return (
        <>
            {/* 顶部操作栏 */}
            <ProfileActionBar
                loading={data.loading}
                saving={data.saving}
                onRefresh={data.loadProfile}
                onSave={data.saveProfile}
            />

            {/* 头像 + 主题选择 */}
            <ProfileAvatarThemeCard
                avatarUrl={data.avatarUrl}
                userAvatarUrl={(data.user as any)?.avatarUrl}
                theme={data.theme}
                onThemeChange={data.onThemeChange}
                onAvatarChange={data.onAvatarChange}
            />

            {/* 2列布局：左列用户信息+密码，右列工厂信息+员工招募 */}
            <div style={{ display: 'grid', gridTemplateColumns: '480px 1fr', gap: '0 64px', alignItems: 'start' }}>
                {/* 左列：用户信息 + 修改密码 */}
                <ProfileUserColumn
                    loading={data.loading}
                    form={data.form}
                    pwdForm={data.pwdForm}
                    username={data.user?.username}
                    savingPwd={data.savingPwd}
                    onChangePassword={data.changePassword}
                />

                {/* 右列：工厂信息 + 员工招募 + 问题反馈 */}
                <div>
                    <ProfileTenantInfoBlock
                        tenantInfo={data.tenantInfo}
                        tenantForm={data.tenantForm}
                        savingWebhook={data.savingWebhook}
                        onSaveWebhook={data.saveWebhookUrl}
                    />

                    <ProfileAdminSection
                        canManageSmartFlags={data.canManageSmartFlags}
                        tenantInfo={data.tenantInfo}
                        myFeedbacks={data.myFeedbacks}
                        loadingFeedbacks={data.loadingFeedbacks}
                        onOpenFeedback={() => data.setFeedbackVisible(true)}
                        onLoadFeedbacks={() => { void data.loadMyFeedbacks(); }}
                        onCopyRegisterUrl={data.handleCopyRegisterUrl}
                        onCopyTenantCode={data.handleCopyTenantCode}
                        smartFlags={data.smartFlags}
                        savingSmartFlags={data.savingSmartFlags}
                        enabledCount={data.enabledCount}
                        onEnableAll={() => data.setAllSmartFlags(true)}
                        onDisableAll={() => data.setAllSmartFlags(false)}
                        onResetFlags={data.resetSmartFlags}
                        onToggleFlag={data.updateSmartFlag}
                        smartProfileForm={data.smartProfileForm}
                        smartProfile={data.smartProfile}
                        loadingSmartProfile={data.loadingSmartProfile}
                        savingSmartProfile={data.savingSmartProfile}
                        onRefreshProfile={() => void data.loadSmartProfile()}
                        onResetProfile={data.resetSmartProfile}
                        onSaveProfile={data.saveSmartProfile}
                        feedbackVisible={data.feedbackVisible}
                        feedbackForm={data.feedbackForm}
                        submittingFeedback={data.submittingFeedback}
                        onCancelFeedback={() => data.setFeedbackVisible(false)}
                        onSubmitFeedback={data.submitFeedback}
                    />
                </div>
            </div>
        </>
    );
};

export default ProfileInfoTab;
