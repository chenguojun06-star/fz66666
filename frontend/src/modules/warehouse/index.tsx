import React from 'react';

export const MaterialInventory = React.lazy(() => import('./pages/MaterialInventory'));
export const MaterialDatabase = React.lazy(() => import('./pages/MaterialDatabase'));
export const FinishedInventory = React.lazy(() => import('./pages/FinishedInventory'));
export const SampleInventory = React.lazy(() => import('./pages/SampleInventory'));
export const EcommerceOrders = React.lazy(() => import('./pages/EcommerceOrders'));
export const InventoryCheck = React.lazy(() => import('./pages/InventoryCheck'));
