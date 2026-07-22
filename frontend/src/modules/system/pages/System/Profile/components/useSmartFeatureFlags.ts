import { useState, useEffect, useCallback } from 'react';
import { App } from 'antd';
import tenantSmartFeatureService from '@/services/system/tenantSmartFeatureService';
import {
    getSmartFeatureFlags,
    replaceSmartFeatureFlags,
    resetSmartFeatureFlags,
    type SmartFeatureKey,
} from '@/smart/core/featureFlags';
import { SMART_FEATURE_KEYS } from './ProfileSmartSettingsPanel';

const useSmartFeatureFlags = (canManage: boolean) => {
    const { message } = App.useApp();
    const [smartFlags, setSmartFlags] = useState(() => getSmartFeatureFlags());
    const [savingSmartFlags, setSavingSmartFlags] = useState(false);

    useEffect(() => {
        tenantSmartFeatureService.list().then((flags) => {
            setSmartFlags(replaceSmartFeatureFlags(flags));
        }).catch((err) => console.error('加载智能功能开关失败:', err));
    }, []);

    const saveSmartFlags = useCallback(async (nextFlags: Record<SmartFeatureKey, boolean>, successText: string) => {
        if (!canManage) {
            message.error('仅租户管理员可修改智能开关');
            return;
        }
        try {
            setSavingSmartFlags(true);
            const saved = await tenantSmartFeatureService.save(nextFlags);
            setSmartFlags(replaceSmartFeatureFlags(saved));
            message.success(successText);
        } catch (e: unknown) {
            message.error(e instanceof Error ? e.message : '保存智能开关失败');
        } finally {
            setSavingSmartFlags(false);
        }
    }, [canManage, message]);

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

    return {
        smartFlags,
        savingSmartFlags,
        updateSmartFlag,
        setAllSmartFlags,
        resetSmartFlags,
        enabledCount,
    };
};

export default useSmartFeatureFlags;
