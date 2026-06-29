import React from 'react';

export const MaterialReconciliation = React.lazy(() => import('./pages/Finance/MaterialReconciliation'));
export const PayrollOperatorSummary = React.lazy(() => import('./pages/Finance/PayrollOperatorSummary'));
export const FinanceDashboard = React.lazy(() => import('./pages/FinanceDashboard'));
export const FinanceCenter = React.lazy(() => import('./pages/FinanceCenter'));
export const ExpenseReimbursement = React.lazy(() => import('./pages/Finance/ExpenseReimbursement'));
export const EmployeeAdvance = React.lazy(() => import('./pages/Finance/EmployeeAdvance'));
export const ExpenseManagement = React.lazy(() => import('./pages/Finance/ExpenseManagement'));
export const WagePayment = React.lazy(() => import('./pages/Finance/WagePayment'));
export const EcSalesRevenue = React.lazy(() => import('./pages/EcSalesRevenue'));
export const TaxExport = React.lazy(() => import('./pages/TaxExport'));
export const OrderWasteAnalysis = React.lazy(() => import('./pages/Finance/OrderWasteAnalysis'));
// 财税工具（合并：费用报销+员工借支+财税导出+EC收入+损耗分析）
export const TaxTools = React.lazy(() => import('./pages/Finance/TaxTools'));
