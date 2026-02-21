import React from 'react';

export const UserList = React.lazy(() => import('./pages/System/UserList'));
export const UserApproval = React.lazy(() => import('./pages/System/UserApproval'));
export const RoleList = React.lazy(() => import('./pages/System/RoleList'));
export const FactoryList = React.lazy(() => import('./pages/System/FactoryList'));
export const LoginLogList = React.lazy(() => import('./pages/System/LoginLogList'));
export const SystemLogs = React.lazy(() => import('./pages/System/SystemLogs'));
export const Profile = React.lazy(() => import('./pages/System/Profile'));
export const DictManage = React.lazy(() => import('./pages/System/DictManage'));
export const Tutorial = React.lazy(() => import('./pages/System/Tutorial'));
export const TenantManagement = React.lazy(() => import('./pages/System/TenantManagement'));
export const CustomerManagement = React.lazy(() => import('./pages/System/CustomerManagement'));
export const AppStore = React.lazy(() => import('./pages/AppStore'));
