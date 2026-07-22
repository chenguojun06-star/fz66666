import { useState, useEffect, useCallback } from 'react';
import { App, Form } from 'antd';
import tenantIntelligenceProfileService from '@/services/system/tenantIntelligenceProfileService';
import type {
    TenantIntelligenceProfilePayload,
    TenantIntelligenceProfileResponse,
} from '@/services/system/tenantIntelligenceProfileService';
import { isValidationError } from './utils';

const useSmartProfile = (canManage: boolean) => {
    const { message } = App.useApp();
    const [smartProfileForm] = Form.useForm<TenantIntelligenceProfilePayload>();
    const [smartProfile, setSmartProfile] = useState<TenantIntelligenceProfileResponse | null>(null);
    const [loadingSmartProfile, setLoadingSmartProfile] = useState(false);
    const [savingSmartProfile, setSavingSmartProfile] = useState(false);

    const syncSmartProfileForm = useCallback((profile: TenantIntelligenceProfileResponse) => {
        setSmartProfile(profile);
        smartProfileForm.setFieldsValue({
            primaryGoal: profile.primaryGoal,
            deliveryWarningDays: profile.deliveryWarningDays,
            anomalyWarningCount: profile.anomalyWarningCount,
            lowMarginThreshold: profile.lowMarginThreshold,
        });
    }, [smartProfileForm]);

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
        if (!canManage) {
            return;
        }
        void loadSmartProfile();
    }, [canManage, loadSmartProfile]);

    const saveSmartProfile = async () => {
        if (!canManage) {
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
            if (isValidationError(e)) return;
            message.error(e instanceof Error ? e.message : '保存智能经营画像失败');
        } finally {
            setSavingSmartProfile(false);
        }
    };

    const resetSmartProfile = async () => {
        if (!canManage) {
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

    return {
        smartProfileForm,
        smartProfile,
        loadingSmartProfile,
        savingSmartProfile,
        loadSmartProfile,
        saveSmartProfile,
        resetSmartProfile,
    };
};

export default useSmartProfile;
