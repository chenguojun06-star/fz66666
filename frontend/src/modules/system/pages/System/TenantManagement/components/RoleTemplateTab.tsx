import React, { useState, useEffect, useCallback } from 'react';
import { Tag } from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import tenantService from '@/services/tenantService';
import type { RoleTemplate } from '@/services/tenantService';
import type { ColumnsType } from 'antd/es/table';
import { message } from '@/utils/antdStatic';

const RoleTemplateTab: React.FC = () => {
  const [templates, setTemplates] = useState<RoleTemplate[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const res: any = await tenantService.listRoleTemplates();
      setTemplates(res?.data || res || []);
    } catch {
      message.error('加载模板失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  const columns: ColumnsType<RoleTemplate> = [
    { title: '排序', dataIndex: 'sortOrder', width: 60, align: 'center' },
    { title: '角色名称', dataIndex: 'roleName', width: 140 },
    { title: '角色编码', dataIndex: 'roleCode', width: 140 },
    { title: '说明', dataIndex: 'description', width: 200 },
    {
      title: '权限数量', dataIndex: 'permissionCount', width: 100, align: 'center',
      render: (v: number) => <Tag color="blue">{v}项</Tag>,
    },
    {
      title: '状态', dataIndex: 'status', width: 80, align: 'center',
      render: (s: string) => <Tag color={s === 'active' ? 'green' : 'default'}>{s === 'active' ? '启用' : '停用'}</Tag>,
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16, color: 'var(--color-text-secondary)', fontSize: 13 }}>
        角色模板是预设的权限方案，为新租户创建员工时从模板中选择角色。共 {templates.length} 个模板。
      </div>
      <ResizableTable
        storageKey="tenant-role-templates"
        rowKey="id"
        columns={columns}
        dataSource={templates}
        loading={loading}
        pagination={false}
       
      />
    </div>
  );
};

export default RoleTemplateTab;
