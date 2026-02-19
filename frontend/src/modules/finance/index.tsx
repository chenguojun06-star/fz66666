import React from 'react';

export const MaterialReconciliation = React.lazy(() => import('./pages/Finance/MaterialReconciliation'));
export const PayrollOperatorSummary = React.lazy(() => import('./pages/Finance/PayrollOperatorSummary'));
export const FinanceDashboard = React.lazy(() => import('./pages/FinanceDashboard'));
export const FinanceCenter = React.lazy(() => import('./pages/FinanceCenter'));
export const ExpenseReimbursement = React.lazy(() => import('./pages/Finance/ExpenseReimbursement'));
export const WagePayment = React.lazy(() => import('./pages/Finance/WagePayment'));
