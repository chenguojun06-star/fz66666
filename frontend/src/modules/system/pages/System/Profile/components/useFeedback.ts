import { useState } from 'react';
import { App, Form } from 'antd';
import feedbackService from '@/services/feedbackService';
import type { UserFeedback } from '@/services/feedbackService';
import { isValidationError } from './utils';

const useFeedback = () => {
    const { message } = App.useApp();
    const [feedbackVisible, setFeedbackVisible] = useState(false);
    const [feedbackForm] = Form.useForm();
    const [submittingFeedback, setSubmittingFeedback] = useState(false);
    const [myFeedbacks, setMyFeedbacks] = useState<UserFeedback[]>([]);
    const [loadingFeedbacks, setLoadingFeedbacks] = useState(false);

    const loadMyFeedbacks = async () => {
        setLoadingFeedbacks(true);
        try {
            const res: any = await feedbackService.myList({ page: 1, pageSize: 10 });
            const d = res?.data || res;
            setMyFeedbacks(d?.records || []);
        } catch { /* ignore */ } finally {
            setLoadingFeedbacks(false);
        }
    };

    const submitFeedback = async () => {
        try {
            const values = await feedbackForm.validateFields();
            setSubmittingFeedback(true);
            const res: any = await feedbackService.submit(values);
            if (res?.code === 200) {
                message.success('反馈提交成功，感谢您的意见！');
                feedbackForm.resetFields();
                setFeedbackVisible(false);
                loadMyFeedbacks();
                return;
            }
            message.error(res?.message || '提交失败');
        } catch (e: unknown) {
            if (isValidationError(e)) return;
            message.error(e instanceof Error ? e.message : '提交失败');
        } finally {
            setSubmittingFeedback(false);
        }
    };

    return {
        feedbackVisible,
        setFeedbackVisible,
        feedbackForm,
        submittingFeedback,
        myFeedbacks,
        loadingFeedbacks,
        loadMyFeedbacks,
        submitFeedback,
    };
};

export default useFeedback;
