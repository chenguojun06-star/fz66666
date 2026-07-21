import React, { useMemo } from 'react';
import { Avatar, Button, Space, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { UserOutlined } from '@ant-design/icons';
import ResizableModal from '@/components/common/ResizableModal';
import ResizableTable from '@/components/common/ResizableTable';

interface EmployeeRecord {
  id?: string | number;
  username?: string;
  name?: string;
  phone?: string;
  status?: string;
}

interface EmployeeListModalProps {
  open: boolean;
  roleName: string;
  employeeList: EmployeeRecord[];
  loading: boolean;
  onCancel: () => void;
  onRemoveEmployee: (userId: string, userName: string) => void;
}

/**
 * 角色对应的员工列表弹窗
 */
const EmployeeListModal: React.FC<EmployeeListModalProps> = ({
  open,
  roleName,
  employeeList,
  loading,
  onCancel,
  onRemoveEmployee,
}) => {
  const columns: ColumnsType<EmployeeRecord> = useMemo(() => [
    {
      title: '姓名', dataIndex: 'name', key: 'name',
      render: (v: string, r: EmployeeRecord) => (
        <Space size={6}>
          <Avatar size={24} icon={<UserOutlined />} style={{ backgroundColor: 'var(--primary-color, var(--color-primary))', flexShrink: 0 }} />
          {v || r.username}
        </Space>
      ),
    },
    { title: '手机号', dataIndex: 'phone', key: 'phone', render: (v: string) => v || '-' },
    { title: '状态', dataIndex: 'status', key: 'status', render: (v: string) => <Tag color={v === 'active' ? 'green' : 'red'}>{v === 'active' ? '启用' : '停用'}</Tag> },
    {
      title: '操作', key: 'action', width: 80,
      render: (_: unknown, r: EmployeeRecord) => (
        <Button danger size="small" onClick={() => onRemoveEmployee(String(r.id || ''), r.name || r.username || '')}>移除</Button>
      ),
    },
  ], [onRemoveEmployee]);

  return (
    <ResizableModal
      open={open}
      title={`「${roleName || ''}」的员工列表`}
      onCancel={onCancel}
      footer={null}
      width="40vw"
      initialHeight={typeof window !== 'undefined' ? window.innerHeight * 0.7 : 600}
    >
      <ResizableTable
        columns={columns}
        dataSource={employeeList}
        rowKey={(r) => String(r.id || r.username)}
        loading={loading}
        pagination={employeeList.length > 10 ? { pageSize: 10 } : false}
        emptyDescription="暂无用户数据"
      />
    </ResizableModal>
  );
};

export default EmployeeListModal;
