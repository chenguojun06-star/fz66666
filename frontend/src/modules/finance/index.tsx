import React from 'react';

export const MaterialReconciliation = React.lazy(() => import('./pages/Finance/MaterialReconciliation'));
export const PaymentApproval = React.lazy(() => import('./pages/Finance/PaymentApproval'));
export const OrderReconciliationApproval = React.lazy(() => import('./pages/Finance/OrderReconciliationApproval'));
export const PayrollOperatorSummary = React.lazy(() => import('./pages/Finance/PayrollOperatorSummary'));
export const FinanceDashboard = React.lazy(() => import('./pages/FinanceDashboard'));
export const FinanceCenter = React.lazy(() => import('./pages/FinanceCenter'));
