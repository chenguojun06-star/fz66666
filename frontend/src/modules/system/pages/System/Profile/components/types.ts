/**
 * ProfileInfoTab 共享类型定义
 */

export type ProfileMe = {
    id?: string | number;
    username?: string;
    name?: string;
    phone?: string;
    email?: string;
    roleName?: string;
    roleId?: string | number;
};

export type TenantInfo = {
    tenantCode?: string;
    tenantName?: string;
    contactName?: string;
    contactPhone?: string;
    wechatWorkWebhookUrl?: string;
};
