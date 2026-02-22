/**
 * 个人中心 — Tabs 容器
 * Tab 1: 个人信息（ProfileInfoTab）
 * Tab 2: 我的账单（MyBillingTab）
 */
import React from 'react';
import { Card, Tabs, Typography } from 'antd';
import { UserOutlined, AccountBookOutlined } from '@ant-design/icons';
import Layout from '@/components/Layout';
import ProfileInfoTab from './components/ProfileInfoTab';
import MyBillingTab from './components/MyBillingTab';
import './styles.css';

const Profile: React.FC = () => {
    return (
        <Layout>
            <Card className="page-card">
                <div className="page-header">
                    <div>
                        <h2 className="page-title" style={{ marginBottom: 4 }}>个人中心</h2>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                            个人信息、账单与发票管理
                        </Typography.Text>
                    </div>
                </div>
                <Tabs
                    defaultActiveKey="profile"
                    items={[
                        {
                            key: 'profile',
                            label: <span><UserOutlined /> 个人信息</span>,
                            children: <ProfileInfoTab />,
                        },
                        {
                            key: 'billing',
                            label: <span><AccountBookOutlined /> 我的账单</span>,
                            children: <MyBillingTab />,
                        },
                    ]}
                />
            </Card>
        </Layout>
    );
};

export default Profile;
