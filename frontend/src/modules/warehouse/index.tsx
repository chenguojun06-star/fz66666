import React from 'react';

// 仓库模块导出
export const WarehouseDashboard = React.lazy(() => import('./pages/Dashboard'));
export const MaterialInventory = React.lazy(() => import('./pages/MaterialInventory'));
export const MaterialDatabase = React.lazy(() => import('./pages/MaterialDatabase'));
export const FinishedInventory = React.lazy(() => import('./pages/FinishedInventory'));
export const SampleInventory = React.lazy(() => import('./pages/SampleInventory'));
