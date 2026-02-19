import React from 'react';

export const ProductionList = React.lazy(() => import('./pages/Production/List'));
export const CuttingManagement = React.lazy(() => import('./pages/Production/Cutting'));
export const MaterialPurchase = React.lazy(() => import('./pages/Production/MaterialPurchase'));
export const MaterialPurchaseDetail = React.lazy(() => import('./pages/Production/MaterialPurchaseDetail'));
export const ProductWarehousing = React.lazy(() => import('./pages/Production/ProductWarehousing'));
export const InspectionDetail = React.lazy(() => import('./pages/Production/ProductWarehousing/pages/InspectionDetail'));
export const OrderTransfer = React.lazy(() => import('./pages/Production/OrderTransfer'));
export const OrderFlow = React.lazy(() => import('./pages/Production/OrderFlow'));
export const ProgressDetail = React.lazy(() => import('./pages/Production/ProgressDetail'));
export const PatternProduction = React.lazy(() => import('./pages/Production/PatternProduction'));
export const MaterialPicking = React.lazy(() => import('./pages/Production/MaterialPicking'));
