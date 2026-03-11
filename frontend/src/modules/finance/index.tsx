import React from 'react';

export const MaterialReconciliation = React.lazy(() => import('./pages/Finance/MaterialReconciliation'));
export const PayrollOperatorSummary = React.lazy(() => import('./pages/Finance/PayrollOperatorSummary'));
export const FinanceDashboard = React.lazy(() => import('./pages/FinanceDashboard'));
export const FinanceCenter = React.lazy(() => import('./pages/FinanceCenter'));
export const ExpenseReimbursement = React.lazy(() => import('./pages/Finance/ExpenseReimbursement'));
export const WagePayment = React.lazy(() => import('./pages/Finance/WagePayment'));
export const EcSalesRevenue = React.lazy(() => import('./pages/EcSalesRevenue'));
export const TaxExport = React.lazy(() => import('./pages/TaxExport'));
export const InvoicePage = React.lazy(() => import('./pages/Invoice'));
export const PayablePage = React.lazy(() => import('./pages/Payable'));
export const TaxConfigPage = React.lazy(() => import('./pages/TaxConfig'));
export const FinancialReportPage = React.lazy(() => import('./pages/FinancialReport'));
