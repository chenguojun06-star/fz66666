/**
 * 个人中心 — Tabs 容器
 * Tab 1: 个人信息（ProfileInfoTab）
 * Tab 2: 我的账单（MyBillingTab）— 仅租户主账号/管理员显示，工厂账号与普通员工不显示
 */
import React from 'react';
import { Card, Tabs, Typography } from 'antd';
import { UserOutlined, AccountBookOutlined } from '@ant-design/icons';
import Layout from '@/components/Layout';
import { useAuth } from '@/utils/AuthContext';
import ProfileInfoTab from './components/ProfileInfoTab';
import MyBillingTab from './components/MyBillingTab';
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
            key: 'billing',
            label: <span><AccountBookOutlined /> 我的账单</span>,
            children: <MyBillingTab />,
        }] : []),
    ];

    return (
        <Layout>
            <Card className="page-card">
                <div className="page-header">
                    <div>
                        <h2 className="page-title" style={{ marginBottom: 4 }}>个人中心</h2>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                            {canViewBilling ? '个人信息、账单与发票管理' : '个人信息管理'}
                        </Typography.Text>
                    </div>
                </div>
                <Tabs
                    defaultActiveKey="profile"
                    items={tabItems}
                />
            </Card>
        </Layout>
    );
};

export default Profile;
