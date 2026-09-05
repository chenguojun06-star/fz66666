import React, { Suspense, useState } from 'react';
import { Card, Spin, Tabs } from 'antd';
import { DollarOutlined } from '@ant-design/icons';
import { useUser } from '@/utils/AuthContext';
import { hasPermission } from '@/utils/permission';
import { permissionCodes } from '@/routeConfig';

// D-301：借支与费用报销合并为一页（用户反馈页面太多）。
// 两个原页面组件原样挂载为零改动零回归；页签按权限码显隐，路径直达由 App 路由传 initialTab 兼容收藏。
const ExpenseReimbursement = React.lazy(() => import('../ExpenseReimbursement'));
const EmployeeAdvance = React.lazy(() => import('../EmployeeAdvance'));

const tabSuspense = (
  <div style={{ textAlign: 'center', padding: 80 }}>
    <Spin />
  </div>
);

export interface ExpenseAdvanceCenterProps {
  /** 路径直达时定位的初始页签（/finance/employee-advance → advance） */
  initialTab?: 'expense' | 'advance';
}

const ExpenseAdvanceCenter: React.FC<ExpenseAdvanceCenterProps> = ({ initialTab = 'expense' }) => {
  const { user } = useUser();
  const canExpense = hasPermission(user, permissionCodes.expenseReimbursement);
  const canAdvance = hasPermission(user, permissionCodes.employeeAdvance);
  const [activeTab, setActiveTab] = useState<string>(
    initialTab === 'advance' && canAdvance ? 'advance' : canExpense ? 'expense' : canAdvance ? 'advance' : 'expense',
  );

  const items: Array<{ key: string; label: string; children: JSX.Element }> = [];
  if (canExpense) {
    items.push({
      key: 'expense',
      label: '费用报销',
      children: <Suspense fallback={tabSuspense}><ExpenseReimbursement /></Suspense>,
    });
  }
  if (canAdvance) {
    items.push({
      key: 'advance',
      label: '员工借支',
      children: <Suspense fallback={tabSuspense}><EmployeeAdvance /></Suspense>,
    });
  }

  return (
    <>
      <Card className="page-card" size="small" style={{ marginBottom: 12, border: '1px solid var(--color-border-secondary)' }} styles={{ body: { padding: '10px 16px' } }}>
        <h2 style={{ margin: 0, fontSize: 16 }}>
          <DollarOutlined style={{ marginRight: 8 }} />
          费用与借支
        </h2>
        <span style={{ color: 'var(--color-text-tertiary)', fontSize: 13 }}>
          员工费用报销与借支/还款的登记、审批、明细都在这里；审批通过后进入收付款中心打款
        </span>
      </Card>
      <Card className="page-card" style={{ border: '1px solid var(--color-border-secondary)', borderRadius: 6 }} styles={{ body: { padding: '12px 16px' } }}>
        <Tabs activeKey={activeTab} onChange={setActiveTab} destroyOnHidden={false} size="small" items={items} />
      </Card>
    </>
  );
};

export default ExpenseAdvanceCenter;
