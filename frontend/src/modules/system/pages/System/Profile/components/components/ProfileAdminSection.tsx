/**
 * 管理员区域 — 员工招募面板 + 智能开关面板 + 问题反馈 Modal
 * 仅 canManageSmartFlags 时展示面板；反馈 Modal 始终渲染
 */
import React from 'react';
import type { FormInstance } from 'antd';
import type { SmartFeatureKey } from '@/smart/core/featureFlags';
import type {
    TenantIntelligenceProfilePayload,
    TenantIntelligenceProfileResponse,
} from '@/services/system/tenantIntelligenceProfileService';
import type { UserFeedback } from '@/services/feedbackService';
import ProfileSmartSettingsPanel from '../ProfileSmartSettingsPanel';
import ProfileTenantEngagementPanel from '../ProfileTenantEngagementPanel';
import ProfileFeedbackModal from '../ProfileFeedbackModal';
import type { TenantInfo } from '../types';

interface ProfileAdminSectionProps {
    canManageSmartFlags: boolean;
    tenantInfo: TenantInfo | null;
    // feedback list
    myFeedbacks: UserFeedback[];
    loadingFeedbacks: boolean;
    onOpenFeedback: () => void;
    onLoadFeedbacks: () => void;
    onCopyRegisterUrl: (registerUrl: string) => void;
    onCopyTenantCode: (tenantCode: string) => void;
    // smart flags
    smartFlags: Record<SmartFeatureKey, boolean>;
    savingSmartFlags: boolean;
    enabledCount: number;
    onEnableAll: () => void;
    onDisableAll: () => void;
    onResetFlags: () => void;
    onToggleFlag: (key: SmartFeatureKey, enabled: boolean) => void;
    // smart profile
    smartProfileForm: FormInstance<TenantIntelligenceProfilePayload>;
    smartProfile: TenantIntelligenceProfileResponse | null;
    loadingSmartProfile: boolean;
    savingSmartProfile: boolean;
    onRefreshProfile: () => void;
    onResetProfile: () => void;
    onSaveProfile: () => void;
    // feedback modal
    feedbackVisible: boolean;
    feedbackForm: FormInstance;
    submittingFeedback: boolean;
    onCancelFeedback: () => void;
    onSubmitFeedback: () => void;
}

const ProfileAdminSection: React.FC<ProfileAdminSectionProps> = ({
    canManageSmartFlags,
    tenantInfo,
    myFeedbacks,
    loadingFeedbacks,
    onOpenFeedback,
    onLoadFeedbacks,
    onCopyRegisterUrl,
    onCopyTenantCode,
    smartFlags,
    savingSmartFlags,
    enabledCount,
    onEnableAll,
    onDisableAll,
    onResetFlags,
    onToggleFlag,
    smartProfileForm,
    smartProfile,
    loadingSmartProfile,
    savingSmartProfile,
    onRefreshProfile,
    onResetProfile,
    onSaveProfile,
    feedbackVisible,
    feedbackForm,
    submittingFeedback,
    onCancelFeedback,
    onSubmitFeedback,
}) => {
    return (
        <>
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
                            onOpenFeedback={onOpenFeedback}
                            onLoadFeedbacks={onLoadFeedbacks}
                            onCopyRegisterUrl={onCopyRegisterUrl}
                            onCopyTenantCode={onCopyTenantCode}
                        />
                    )}

                    <ProfileSmartSettingsPanel
                        canManageSmartFlags={canManageSmartFlags}
                        smartFlags={smartFlags}
                        savingSmartFlags={savingSmartFlags}
                        enabledCount={enabledCount}
                        onEnableAll={onEnableAll}
                        onDisableAll={onDisableAll}
                        onResetFlags={onResetFlags}
                        onToggleFlag={onToggleFlag}
                        smartProfileForm={smartProfileForm}
                        smartProfile={smartProfile}
                        loadingSmartProfile={loadingSmartProfile}
                        savingSmartProfile={savingSmartProfile}
                        onRefreshProfile={onRefreshProfile}
                        onResetProfile={onResetProfile}
                        onSaveProfile={onSaveProfile}
                    />
                </div>
            )}

            <ProfileFeedbackModal
                open={feedbackVisible}
                feedbackForm={feedbackForm}
                submitting={submittingFeedback}
                onCancel={onCancelFeedback}
                onSubmit={onSubmitFeedback}
            />
        </>
    );
};

export default ProfileAdminSection;
