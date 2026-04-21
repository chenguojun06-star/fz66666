/**
 * 个人中心 — Tabs 容器
 * Tab 1: 个人信息（ProfileInfoTab）
 * Tab 2: 我的账单（MyBillingTab）— 仅租户主账号/管理员显示，工厂账号与普通员工不显示
 */
import React from 'react';
import { Tabs, Typography } from 'antd';
import { UserOutlined, AppstoreOutlined } from '@ant-design/icons';
import PageLayout from '@/components/common/PageLayout';
import { useAuth } from '@/utils/AuthContext';
import ProfileInfoTab from './components/ProfileInfoTab';
import MyModulesTab from './components/MyModulesTab';
import './styles.css';

const Profile: React.FC = () => {
    const { user } = useAuth();
    const isFactoryAccount = !!user?.factoryId;
    const role = String(user?.role || '').trim();
    const isTenantBillingAdmin = user?.isTenantOwner === true
        || role === 'admin'
        || role === 'ADMIN'
        || role === '1'
        || user?.roleId === '1';
    const canViewBilling = !isFactoryAccount && user?.isSuperAdmin !== true && isTenantBillingAdmin;

    const tabItems = [
        {
            key: 'profile',
            label: <span><UserOutlined /> 个人信息</span>,
            children: <ProfileInfoTab />,
        },
        ...(canViewBilling ? [{
            key: 'modules',
            label: <span><AppstoreOutlined /> 已开通模块与账单</span>,
            children: <MyModulesTab />,
        }] : []),
    ];

    return (
        <>
            <PageLayout
                title="个人中心"
                headerContent={
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {canViewBilling ? '个人信息与模块账单管理' : '个人信息管理'}
                    </Typography.Text>
                }
            >
                <Tabs
                    defaultActiveKey="profile"
                    items={tabItems}
                />
            </PageLayout>
        </>
    );
};

export default Profile;
