import React, { useCallback, useEffect, useMemo, useState } from 'react';
import PageLayout from '@/components/common/PageLayout';
import ResizableModal from '@/components/common/ResizableModal';
import ResizableTable from '@/components/common/ResizableTable';
import RowActions from '@/components/common/RowActions';
import { organizationApi } from '@/services/system/organizationApi';
import tenantService from '@/services/tenantService';
import type { ApiResult } from '@/utils/api';
import type { OrganizationUnit, User } from '@/types/system';
import { useUser } from '@/utils/AuthContext';
import {
  App, Avatar, Button, Empty, Input, Space, Spin, Tag,
} from 'antd';
import type { TableColumnsType } from 'antd';
import { DEFAULT_PAGE_SIZE, DEFAULT_PAGE_SIZE_OPTIONS } from '@/utils/pageSizeStore';
import {
  BankOutlined, CrownFilled, QrcodeOutlined, UserAddOutlined, UserOutlined,
} from '@ant-design/icons';
import AssignMemberModal from '../OrganizationTree/AssignMemberModal';
import QrCodeModal from '../OrganizationTree/components/QrCodeModal';
import ProfileModal from '../OrganizationTree/components/ProfileModal';
import { useMemberActions } from '../OrganizationTree/hooks/useMemberActions';
import { getEmploymentStatusConfig } from '../UserList/hooks/useUserListColumns';
import './styles.css';

function findUnit(nodes: OrganizationUnit[], id: string | null): OrganizationUnit | null {
  if (!id) return null;
  for (const node of nodes) {
    if (String(node.id) === id) return node;
    if (node.children?.length) {
      const found = findUnit(node.children, id);
      if (found) return found;
    }
  }
  return null;
}

function getDescendantIds(node: OrganizationUnit): string[] {
  const ids: string[] = [String(node.id)];
  if (Array.isArray(node.children)) {
    node.children.forEach(child => ids.push(...getDescendantIds(child)));
  }
  return ids;
}

const ExternalTreeItem: React.FC<{
  node: OrganizationUnit;
  depth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
}> = ({ node, depth, selectedId, onSelect }) => {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = Array.isArray(node.children) && node.children.length > 0;
  const isSelected = String(node.id) === selectedId;

  return (
    <div>
      <div
        className={`partner-tree-item${isSelected ? ' partner-tree-item-selected' : ''}`}
        style={{ paddingLeft: depth * 16 + 8 }}
      >
        <span
          className="partner-tree-chevron"
          onClick={() => hasChildren && setExpanded(v => !v)}
          style={{ cursor: hasChildren ? 'pointer' : 'default', opacity: hasChildren ? 1 : 0 }}
        >
          {expanded ? '▼' : '▶'}
        </span>
        <span className="partner-tree-label" onClick={() => onSelect(String(node.id))}>
          <BankOutlined style={{ color: 'var(--primary-color, #1677ff)', marginRight: 4 }} />
          <span className="partner-tree-name">{node.unitName}</span>
        </span>
      </div>
      {hasChildren && expanded && (
        <div>
          {node.children!.map((child: OrganizationUnit) => (
            <ExternalTreeItem
              key={child.id ?? child.unitName}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const PartnerManagement: React.FC = () => {
  const { message } = App.useApp();
  const { user } = useUser();

  const [loading, setLoading] = useState(false);
  const [treeData, setTreeData] = useState<OrganizationUnit[]>([]);
  const [membersMap, setMembersMap] = useState<Record<string, User[]>>({});
  const [assignableUsers, setAssignableUsers] = useState<User[]>([]);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [memberSearch, setMemberSearch] = useState('');
  const [departments, setDepartments] = useState<OrganizationUnit[]>([]);
  const [qrModal, setQrModal] = useState<{ open: boolean; unit: OrganizationUnit | null; tenantCode: string }>(
    { open: false, unit: null, tenantCode: '' },
  );
  const [profileUser, setProfileUser] = useState<User | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [tree, deptList, members] = await Promise.all([
        organizationApi.externalTree().catch(() => []),
        organizationApi.departments().catch(() => []),
        organizationApi.members().catch(() => ({})),
      ]);
      setTreeData(Array.isArray(tree) ? tree : []);
      setDepartments(Array.isArray(deptList) ? deptList : []);
      setMembersMap((members && typeof members === 'object' ? members : {}) as Record<string, User[]>);
    } catch (error: unknown) {
      message.error(error instanceof Error ? error.message : '加载合作企业数据失败');
    } finally {
      setLoading(false);
    }
  }, [message]);

  const loadAssignableUsers = useCallback(async () => {
    try {
      const users = await organizationApi.assignableUsers();
      setAssignableUsers(Array.isArray(users) ? users : []);
    } catch {
      setAssignableUsers([]);
    }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  const {
    assignModal, setAssignModal,
    assignSearch, setAssignSearch,
    batchSelectedIds, setBatchSelectedIds,
    batchAssignLoading,
    setOwnerLoading,
    handleOpenAssign,
    handleBatchAssign,
    handleRemoveMember,
    handleSetFactoryOwner,
    currentNodeMemberIds,
    filteredAssignableUsers,
  } = useMemberActions(membersMap, setMembersMap, assignableUsers, loadAssignableUsers);

  const unitNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    departments.forEach(d => {
      if (d.id) map[String(d.id)] = d.unitName || '';
    });
    return map;
  }, [departments]);

  const selectedUnit = useMemo(() => findUnit(treeData, selectedUnitId), [treeData, selectedUnitId]);

  const displayedMembers = useMemo(() => {
    if (!selectedUnitId || !selectedUnit) return [];
    const unitIds = getDescendantIds(selectedUnit);
    const allMembers = unitIds.flatMap(id => membersMap[id] || []);
    if (!memberSearch.trim()) return allMembers;
    const q = memberSearch.toLowerCase();
    return allMembers.filter(m =>
      (m.name || '').toLowerCase().includes(q) ||
      (m.phone || '').includes(q)
    );
  }, [selectedUnitId, selectedUnit, membersMap, memberSearch]);

  const handleShowQRCode = useCallback(async (node: OrganizationUnit) => {
    let tenantCode = '';
    try {
      const res = await (tenantService as any).myTenant() as ApiResult<{ tenantCode?: string }> & { tenantCode?: string };
      tenantCode = res?.data?.tenantCode || res?.tenantCode || '';
    } catch { /* ignore */ }
    setQrModal({ open: true, unit: node, tenantCode });
  }, []);

  const totalExternalMembers = useMemo(() => {
    return Object.values(membersMap).flat().length;
  }, [membersMap]);

  const memberColumns: TableColumnsType<User> = [
    {
      title: '姓名',
      dataIndex: 'name',
      width: 140,
      render: (v: string, r: User) => (
        <Space size={6}>
          <Avatar
            size={24}
            icon={<UserOutlined />}
            style={{ backgroundColor: r.isFactoryOwner ? 'var(--color-warning, #faad14)' : 'var(--color-success, #52c41a)', flexShrink: 0, cursor: 'pointer' }}
            onClick={() => setProfileUser(r)}
          />
          {v || r.username}
          {r.isFactoryOwner && (
            <Tag icon={<CrownFilled />} color="gold" style={{ marginLeft: 2 }}>老板</Tag>
          )}
        </Space>
      ),
    },
    { title: '手机号码', dataIndex: 'phone', width: 130, render: (v: string) => v || '—' },
    { title: '所属部门', dataIndex: 'orgUnitId', width: 120, render: (v: string) => v ? (unitNameMap[v] || '未知部门') : '—' },
    {
      title: '在职状态',
      dataIndex: 'employmentStatus',
      width: 90,
      render: (v: string) => {
        const cfg = getEmploymentStatusConfig(v);
        return <Tag color={cfg.color}>{cfg.text}</Tag>;
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 160,
      render: (_: unknown, r: User) => r.isFactoryOwner ? (
        <Tag color="gold"><CrownFilled /> 主账号</Tag>
      ) : (
        <RowActions
          maxInline={2}
          actions={[
            {
              key: 'setOwner',
              label: '设为老板',
              title: '设为工厂老板',
              onClick: () => handleSetFactoryOwner(r),
              loading: setOwnerLoading === String(r.id),
            },
            {
              key: 'remove',
              label: '移出',
              title: '移出工厂',
              danger: true,
              onClick: () => handleRemoveMember(String(r.id), r.name || r.username || ''),
            },
          ]}
        />
      ),
    },
  ];

  return (
    <>
      <PageLayout
        title={
          <span style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
            <BankOutlined style={{ marginRight: 8, color: 'var(--primary-color, #1677ff)', fontSize: 20 }} />
            合作企业管理
          </span>
        }
        headerContent={
          <div style={{ color: 'var(--color-text-secondary, #666)', marginTop: 4 }}>
            管理外部合作工厂及其成员，支持添加成员、设置工厂老板、注册二维码等操作。
            <span style={{ marginLeft: 12 }}>
              共 <strong>{treeData.length}</strong> 家合作企业 · <strong>{totalExternalMembers}</strong> 名外部人员
            </span>
          </div>
        }
      >
        <Spin spinning={loading}>
          {treeData.length === 0 && !loading ? (
            <Empty description="暂无合作企业数据" style={{ padding: '60px 0' }} />
          ) : (
            <div className="partner-split-layout" style={{ height: 'calc(100vh - 180px)' }}>
              <div className="partner-tree-panel" style={{ width: 240 }}>
                <div className="partner-tree-header">合作工厂</div>
                {treeData.map((node) => (
                  <ExternalTreeItem
                    key={node.id ?? node.unitName}
                    node={node}
                    depth={0}
                    selectedId={selectedUnitId}
                    onSelect={setSelectedUnitId}
                  />
                ))}
              </div>

              <div className="partner-member-panel">
                {!selectedUnitId ? (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description="请点击左侧选择一个合作工厂"
                    style={{ paddingTop: 80 }}
                  />
                ) : (
                  <>
                    <div className="partner-member-header">
                      <div style={{ fontWeight: 600, fontSize: 15 }}>
                        {selectedUnit?.unitName} · 成员列表
                        <span style={{ color: 'var(--color-text-tertiary, #999)', fontWeight: 400, marginLeft: 8, fontSize: 13 }}>
                          共 {displayedMembers.length} 人
                        </span>
                      </div>
                      <Space>
                        <Button
                          type="primary"
                          icon={<UserAddOutlined />}
                          onClick={() => selectedUnit && handleOpenAssign(selectedUnit)}
                        >
                          添加成员
                        </Button>
                        <Button
                          icon={<QrcodeOutlined />}
                          onClick={() => selectedUnit && handleShowQRCode(selectedUnit)}
                        >
                          注册二维码
                        </Button>
                      </Space>
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                      <Input
                        placeholder="搜索姓名或手机号"
                        allowClear
                        value={memberSearch}
                        onChange={e => setMemberSearch(e.target.value)}
                        style={{ width: 220 }}
                      />
                    </div>
                    <ResizableTable<User>
                      storageKey="partner-management-members"
                      rowKey={r => String(r.id ?? r.username)}
                      columns={memberColumns}
                      dataSource={displayedMembers}
                      pagination={displayedMembers.length > DEFAULT_PAGE_SIZE ? {
                        showSizeChanger: true,
                        pageSizeOptions: [...DEFAULT_PAGE_SIZE_OPTIONS],
                      } : false}
                      locale={{ emptyText: '暂无成员，可点击「添加成员」或通过扫码二维码注册' }}
                    />
                  </>
                )}
              </div>
            </div>
          )}
        </Spin>
      </PageLayout>

      <AssignMemberModal
        assignModal={assignModal}
        setAssignModal={setAssignModal}
        assignSearch={assignSearch}
        setAssignSearch={setAssignSearch}
        filteredAssignableUsers={filteredAssignableUsers}
        batchSelectedIds={batchSelectedIds}
        setBatchSelectedIds={setBatchSelectedIds}
        currentNodeMemberIds={currentNodeMemberIds}
        unitNameMap={unitNameMap}
        batchAssignLoading={batchAssignLoading}
        handleBatchAssign={handleBatchAssign}
      />

      <QrCodeModal
        open={qrModal.open}
        unit={qrModal.unit}
        tenantCode={qrModal.tenantCode}
        onClose={() => setQrModal({ open: false, unit: null, tenantCode: '' })}
      />

      <ProfileModal
        open={!!profileUser}
        user={profileUser}
        unitNameMap={unitNameMap}
        onClose={() => setProfileUser(null)}
        onResetPwd={async (userId, newPwd) => {
          await organizationApi.adminResetMemberPwd(userId, newPwd);
        }}
      />
    </>
  );
};

export default PartnerManagement;