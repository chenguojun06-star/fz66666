import type { MessageInstance } from 'antd/es/message/interface';

export const copyToClipboard = (text: string, successText: string, message: MessageInstance): void => {
    navigator.clipboard.writeText(text).then(() => {
        message.success(successText);
    }).catch(() => {
        message.error('复制失败');
    });
};

export const extractAvatar = (data: any): string | undefined => {
    return data?.avatarUrl || data?.avatar || data?.headUrl || undefined;
};

export const isValidationError = (e: unknown): boolean => {
    return !!(e && typeof e === 'object' && 'errorFields' in e);
};
