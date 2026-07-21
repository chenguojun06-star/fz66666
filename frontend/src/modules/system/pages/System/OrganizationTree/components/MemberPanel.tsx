import React, { useMemo } from 'react';
import { App, Button, Card, Checkbox, Col, Empty, Input, Row, Select, Space, Tag } from 'antd';
import {
  ApartmentOutlined, BankOutlined, PlusOutlined, QrcodeOutlined,
  SafetyCertificateOutlined, UserAddOutlined,
} from '@ant-design/icons';
import type { TableColumnsType } from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import { DEFAULT_PAGE_SIZE, DEFAULT_PAGE_SIZE_OPTIONS } from '@/utils/pageSizeStore';
import type { OrganizationUnit, User } from '@/types/system';
import { isUnitEnabled } from '../helpers';
import { buildExternalMemberColumns, buildInternalMemberColumns } from './MemberColumns';

interface MemberPanelProps {
  selectedUnitId: string | null;
  selectedUnit: OrganizationUnit | null;
  isExternalSelected: boolean;
  isFactoryAccount: boolean;
  canManageUsers: boolean;
  unitMemberCount: { countMap: Record<string, number>; subUnitsMap: Record<string, number> };
  displayedMembers: User[];
  memberSearch: string;
  setMemberSearch: (v: string) => void;
  includeSubUnits: boolean;
  setIncludeSubUnits: (v: boolean) => void;
  selectedRowKeys: string[];
  setSelectedRowKeys: (keys: string[]) => void;
  // 审批负责人设置
  managerLoading: boolean;
  managerSelectOptions: { value: string; label: string }[];
  loadAssignableUsers: () => Promise<void>;
  handleSetManager: (unitId: string, managerUserId: string) => Promise<void>;
  // 成员操作
  handleOpenAssign: (node: OrganizationUnit) => void;
  handleShowQRCode: (node: OrganizationUnit) => void;
  handleGenerateInvite: () => void;
  openUserDialog: (u?: User) => void;
  // 列定义需要的 handlers
  columnHandlers: {
    openUserDialog: (u?: User) => void;
    handleResetPassword: (record: User) => void;
    handleToggleUserStatus: (userId: string, currentStatus: string) => void;
    handleRemoveMember: (userId: string, userName: string) => void;
    handleSetFactoryOwner: (user: User) => void;
    setOwnerLoading: string | null;
    setProfileUser: (u: User | null) => void;
    unitNameMap: Record<string, string>;
  };
}

/** 右侧成员面板：部门信息 + 成员列表 */
const MemberPanel: React.FC<MemberPanelProps> = ({
  selectedUnitId, selectedUnit, isExternalSelected, isFactoryAccount, canManageUsers,
  unitMemberCount, displayedMembers,
  memberSearch, setMemberSearch, includeSubUnits, setIncludeSubUnits,
  selectedRowKeys, setSelectedRowKeys,
  managerLoading, managerSelectOptions, loadAssignableUsers, handleSetManager,
  handleOpenAssign, handleShowQRCode, handleGenerateInvite, openUserDialog,
  columnHandlers,
}) => {
  const { modal } = App.useApp();

  const columns: TableColumnsType<User> = useMemo(() => {
    const params = { ...columnHandlers, selectedUnit };
    return isExternalSelected
      ? buildExternalMemberColumns(params)
      : buildInternalMemberColumns(params);
  }, [isExternalSelected, selectedUnit, columnHandlers]);

  if (!selectedUnitId) {
    return (
      <div className="org-member-panel">
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="请点击左侧节点查看成员"
          style={{ paddingTop: 80 }}
        />
      </div>
    );
  }

  const handleOpenManagerDialog = async () => {
    await loadAssignableUsers();
    modal.confirm({
      width: '30vw',
      title: `设置「${selectedUnit?.unitName}」的审批负责人`,
      content: (
        <div style={{ marginTop: 12 }}>
          <p style={{ color: 'var(--neutral-text-secondary)', marginBottom: 12 }}>
            审批负责人将负责审批该部门下成员发起的重要操作（删除/撤回/报废等）。
          </p>
          <Select
            id="managerSelect"
            style={{ width: '100%' }}
            showSearch
            allowClear
            optionFilterProp="label"
            placeholder="选择审批负责人"
            defaultValue={selectedUnit?.managerUserId || undefined}
            options={managerSelectOptions}
          />
        </div>
      ),
      okText: '确认',
      cancelText: '取消',
      onOk: async () => {
        const selectEl = document.querySelector('.ant-select-selection-item') as HTMLElement;
        const selectedValue = selectEl?.getAttribute('title') || '';
        const matchingOpt = managerSelectOptions.find(o => o.label === selectedValue);
        const managerId = matchingOpt?.value || '';
        if (selectedUnit?.id) {
          await handleSetManager(selectedUnit.id, managerId);
        }
      },
    });
  };

  return (
    <div className="org-member-panel">
      {/* 部门信息概览 */}
      <Card
        size="small"
        style={{ marginBottom: 12, borderColor: 'var(--color-border-antd)' }}
        bodyStyle={{ padding: 12 }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 16, fontWeight: 600 }}>
              {selectedUnit?.nodeType === 'FACTORY' || selectedUnit?.ownerType === 'EXTERNAL'
                ? <BankOutlined style={{ color: 'var(--color-primary)', marginRight: 4 }} />
                : <ApartmentOutlined style={{ color: 'var(--color-accent-purple, var(--color-accent-purple))', marginRight: 4 }} />
              }
              {selectedUnit?.unitName}
            </span>
            {selectedUnit?.nodeType === 'FACTORY' && (
              <Tag color="orange" style={{ margin: 0 }}>工厂</Tag>
            )}
            {selectedUnit?.ownerType === 'EXTERNAL' && (
              <Tag color="purple" style={{ margin: 0 }}>外协</Tag>
            )}
          </div>
          <div style={{ color: 'var(--color-text-tertiary)', fontSize: 13 }}>
            <Space>
              <span>成员 {unitMemberCount.countMap[String(selectedUnit?.id)] ?? 0} 人</span>
              <span style={{ color: 'var(--color-border-antd)' }}>|</span>
              <span>子部门 {unitMemberCount.subUnitsMap[String(selectedUnit?.id)] ?? 0} 个</span>
            </Space>
          </div>
        </div>

        <Row gutter={12} style={{ marginTop: 8 }}>
          <Col xs={24} sm={12} md={8} style={{ paddingTop: 4, paddingBottom: 4 }}>
            <span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}>部门类型:</span>
            <span style={{ marginLeft: 8, fontSize: 13 }}>
              {selectedUnit?.nodeType === 'FACTORY' || selectedUnit?.ownerType === 'EXTERNAL' ? '外协工厂' : '内部部门'}
            </span>
          </Col>
          <Col xs={24} sm={12} md={8} style={{ paddingTop: 4, paddingBottom: 4 }}>
            <span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}>审批人:</span>
            <span style={{ marginLeft: 8, fontSize: 13 }}>
              {selectedUnit?.managerUserName
                ? <Tag icon={<SafetyCertificateOutlined />} color="blue" style={{ margin: 0 }}>{selectedUnit.managerUserName}</Tag>
                : <span style={{ color: 'var(--color-text-tertiary)' }}>未设置</span>}
            </span>
          </Col>
          <Col xs={24} sm={12} md={8} style={{ paddingTop: 4, paddingBottom: 4 }}>
            <span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}>状态:</span>
            <span style={{ marginLeft: 8, fontSize: 13 }}>
              {selectedUnit && isUnitEnabled(selectedUnit)
                ? <Tag color="success" style={{ margin: 0 }}>启用</Tag>
                : <Tag color="default" style={{ margin: 0 }}>未启用</Tag>}
            </span>
          </Col>
        </Row>
      </Card>

      <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontWeight: 600, fontSize: 15 }}>
          成员列表
          <span style={{ color: 'var(--color-text-tertiary, #999)', fontWeight: 400, marginLeft: 8, fontSize: 14 }}>
            共 {displayedMembers.length} 人
          </span>
        </div>
        {!isFactoryAccount && (
          <Button
            icon={<SafetyCertificateOutlined />}
            loading={managerLoading}
            onClick={handleOpenManagerDialog}
          >
            设置审批人
          </Button>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <Input
          placeholder="搜索姓名或手机号"
          allowClear
          value={memberSearch}
          onChange={e => setMemberSearch(e.target.value)}
          style={{ width: 200 }}
        />
        <Checkbox
          checked={includeSubUnits}
          onChange={e => setIncludeSubUnits(e.target.checked)}
        >
          包括下级成员
        </Checkbox>
        {!isFactoryAccount && (
          <>
            <Button
              type="primary"
              icon={<UserAddOutlined />}
              onClick={() => selectedUnit && handleOpenAssign(selectedUnit)}
            >
              添加成员
            </Button>
            {canManageUsers && (
              <Button
                ghost
                icon={<PlusOutlined />}
                onClick={() => openUserDialog()}
              >
                新增人员
              </Button>
            )}
            {canManageUsers && (
              <Button ghost icon={<QrcodeOutlined />} onClick={handleGenerateInvite}>
                  邀请成员
                </Button>
            )}
            {isExternalSelected && (
              <Button
                icon={<QrcodeOutlined />}
                onClick={() => selectedUnit && handleShowQRCode(selectedUnit)}
              >
                注册二维码
              </Button>
            )}
          </>
        )}
      </div>
      <ResizableTable<User>
        storageKey={isExternalSelected ? 'organization-tree-external-members' : 'organization-tree-members'}
        rowKey={r => String(r.id ?? r.username)}
        columns={columns}
        dataSource={displayedMembers}
        rowSelection={canManageUsers && !isExternalSelected ? {
          selectedRowKeys,
          onChange: (keys) => setSelectedRowKeys(keys as string[]),
        } : undefined}
        pagination={displayedMembers.length > DEFAULT_PAGE_SIZE ? {
          showSizeChanger: true,
          pageSizeOptions: [...DEFAULT_PAGE_SIZE_OPTIONS],
        } : false}
        locale={{ emptyText: isExternalSelected ? '暂无成员，可点击「添加成员」或通过扫码二维码注册' : '暂无成员，点击「添加成员」或「新增人员」' }}
      />
    </div>
  );
};

export default MemberPanel;
