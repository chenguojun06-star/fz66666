import React from 'react';

export const MaterialReconciliation = React.lazy(() => import('./pages/Finance/MaterialReconciliation'));
export const PayrollOperatorSummary = React.lazy(() => import('./pages/Finance/PayrollOperatorSummary'));
export const FinanceDashboard = React.lazy(() => import('./pages/FinanceDashboard'));
export const DailyFlow = React.lazy(() => import('./pages/Finance/DailyFlow'));
export const FinanceCenter = React.lazy(() => import('./pages/FinanceCenter'));
export const ExpenseReimbursement = React.lazy(() => import('./pages/Finance/ExpenseReimbursement'));
export const EmployeeAdvance = React.lazy(() => import('./pages/Finance/EmployeeAdvance'));
export const ExpenseAdvanceCenter = React.lazy(() => import('./pages/Finance/ExpenseAdvanceCenter'));
export const WagePayment = React.lazy(() => import('./pages/Finance/WagePayment'));
export const EcSalesRevenue = React.lazy(() => import('./pages/EcSalesRevenue'));
export const TaxExport = React.lazy(() => import('./pages/TaxExport'));
export const PaymentSchedule = React.lazy(() => import('./pages/Finance/PaymentSchedule'));
