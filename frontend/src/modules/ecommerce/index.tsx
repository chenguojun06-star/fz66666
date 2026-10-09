import React from 'react';

export const EcommerceCenter = React.lazy(() => import('./pages/EcommerceCenter'));
export const PlatformDetail = React.lazy(() => import('./pages/PlatformDetail'));
export const ShopManage = React.lazy(() => import('./pages/ShopManage'));
export const ShopListing = React.lazy(() => import('./pages/ShopListing'));
// P0：平台级商城只读总览（仅平台超管）
export const PlatformShopOverview = React.lazy(() => import('./pages/PlatformShopOverview'));
