import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Layout from '@/components/Layout';
import PageLayout from '@/components/common/PageLayout';
import ResizableModal from '@/components/common/ResizableModal';
import SmallModal from '@/components/common/SmallModal';
import { organizationApi } from '@/services/system/organizationApi';
import { factoryApi } from '@/services/system/factoryApi';
import tenantService from '@/services/tenantService';
import type { Factory } from '@/services/system/factoryApi';
import type { ApiResult } from '@/utils/api';
import type { OrganizationUnit, User } from '@/types/system';
import { useAuth } from '@/utils/AuthContext';
import {
  App, Avatar, Button, Checkbox, Col, Descriptions, Empty, Form, Input,
  InputNumber, QRCode, Row, Select, Space, Spin, Tag, Typography,
} from 'antd';
import type { TableColumnsType } from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import { DEFAULT_PAGE_SIZE, DEFAULT_PAGE_SIZE_OPTIONS } from '@/utils/pageSizeStore';
import {
  ApartmentOutlined, BankOutlined, CrownFilled,
  LockOutlined, PlusOutlined, QrcodeOutlined,
  SnippetsOutlined, UserAddOutlined, UserOutlined,
} from '@ant-design/icons';
import './styles.css';

// import type { DialogMode } from './hooks/useOrganizationModals'; // 暂时不用

const ownerTypeOptions = [
  { value: 'NONE', label: '通用部门' },
  { value: 'INTERNAL', label: '内部' },
  { value: 'EXTERNAL', label: '外部' },
];

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

import { useOrganizationTreeData } from './hooks/useOrganizationTreeData';
import { useOrganizationModals } from './hooks/useOrganizationModals';
import { useMemberActions } from './hooks/useMemberActions';
import { TreeItem } from './components/TreeItem';

const OrganizationTreePage: React.FC = () => {
  const { message, modal } = App.useApp();
  const { user } = useAuth();

  const {
    loading,
    treeData,
    visibleTreeData,
    departments,
    membersMap,
    setMembersMap,
    assignableUsers,
    loadData,
    loadAssignableUsers,
    totalMembers,
    unitNameMap,
    isFactoryAccount,
  } = useOrganizationTreeData();

  const {
    form,
    dialogOpen,
    dialogMode,
    currentRecord,
    submitLoading,
    openCreate,
    openEdit,
    closeDialog,
    handleSubmit,
  } = useOrganizationModals(loadData);

  // 左树选中节点
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  // 右侧成员搜索
  const [memberSearch, setMemberSearch] = useState('');
  // 包括下级成员
  const [includeSubUnits, setIncludeSubUnits] = useState(false);

  // 外发工厂注册二维码弹窗
  const [qrModal, setQrModal] = useState<{ open: boolean; unit: OrganizationUnit | null; tenantCode: string }>(
    { open: false, unit: null, tenantCode: '' },
  );

  // 模板创建弹窗状态
  const [tplModal, setTplModal] = useState<{ open: boolean; type: 'FACTORY' | 'INTERNAL' | null; rootName: string; factoryId?: string }>(
    { open: false, type: null, rootName: '' },
  );
  const [tplLoading, setTplLoading] = useState(false);
  const [factories, setFactories] = useState<Factory[]>([]);

  // 打开模板弹窗时加载工厂列表
  useEffect(() => {
    if (tplModal.open) {
      factoryApi.list({ pageSize: 500, status: 'active' }).then((res: ApiResult<{ records: Factory[] }>) => {
        setFactories(res?.data?.records ?? []);
      }).catch(() => setFactories([]));
    }
  }, [tplModal.open]);

  // 成员分配、操作相关的逻辑
  const {
    assignModal, setAssignModal,
    assignSearch, setAssignSearch,
    batchSelectedIds, setBatchSelectedIds,
    batchAssignLoading,
    setOwnerLoading,
    profileUser, setProfileUser,
    resetPwdVisible, setResetPwdVisible,
    resetPwdLoading,
    resetPwdValue, setResetPwdValue,
    handleResetMemberPwd,
    handleOpenAssign,
    handleBatchAssign,
    handleRemoveMember,
    handleSetFactoryOwner,
    currentNodeMemberIds,
    filteredAssignableUsers,
  } = useMemberActions(membersMap, setMembersMap, assignableUsers, loadAssignableUsers);

  const currentFactoryName = String((user as any)?.tenantName || '').trim();

  const handleInitTemplate = async () => {
    if (!tplModal.type) { message.warning('请选择一个模板类型'); return; }
    if (!tplModal.rootName.trim()) { message.warning('请输入根节点名称'); return; }
    setTplLoading(true);
    try {
      await organizationApi.initTemplate(tplModal.type, tplModal.rootName.trim(), tplModal.factoryId);
      message.success('模板初始化成功！组织架构已创建');
      setTplModal({ open: false, type: null, rootName: '' });
      loadData();
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '创建失败');
    } finally {
      setTplLoading(false);
    }
  };

  const departmentOptions = useMemo(() => {
    return departments
      .map((item) => ({
        value: String(item.id ?? '').trim(),
        label: String(item.unitName ?? '未命名'),
      }))
      .filter((item) => item.value);
  }, [departments]);

  const handleDelete = (record: OrganizationUnit) => {
    let remarkValue = '';
    modal.confirm({
      width: '30vw',
      title: `删除部门「${record.unitName}」`,
      content: (
        <div>
          <p>仅允许删除没有子节点的部门，删除后该部门下成员将自动释放。</p>
          <div style={{ marginTop: 16 }}>
            <span style={{ color: 'red' }}>*</span> 删除原因：
            <Input.TextArea
              rows={3}
              placeholder="请输入删除原因（必填）"
              onChange={e => { remarkValue = e.target.value; }}
            />
          </div>
        </div>
      ),
      okText: '删除',
      okButtonProps: { danger: true, type: 'default' },
      cancelText: '取消',
      onOk: async () => {
        if (!remarkValue.trim()) {
          message.error('请填写删除原因');
          return Promise.reject(new Error('未填写原因'));
        }
        try {
          const remark = remarkValue.trim();
          await organizationApi.delete(String(record.id), remark);
          message.success('删除成功');
          await loadData();
        } catch (error: unknown) {
          console.error('Failed to delete organization unit:', error);
          const errorMsg = error instanceof Error ? error.message : '删除失败，请检查该部门是否还有子节点或成员';
          message.error(errorMsg);
        }
      },
    });
  };

  // 显示外发工厂注册二维码
  const handleShowQRCode = useCallback(async (node: OrganizationUnit) => {
    let tenantCode = '';
    try {
      const res: ApiResult<{ tenantCode?: string }> = await (tenantService as any).myTenant();
      tenantCode = res?.data?.tenantCode || res?.tenantCode || '';
    } catch { /* 静默，二维码依然可以展示 */ }
    setQrModal({ open: true, unit: node, tenantCode });
  }, []);

  // 当前选中的 OrganizationUnit 对象
  const selectedUnit = useMemo(() => findUnit(treeData, selectedUnitId), [treeData, selectedUnitId]);
  // 当前选中节点是否为外发工厂（ownerType=EXTERNAL）
  const isExternalSelected = selectedUnit?.ownerType === 'EXTERNAL';

  // 右侧展示的成员列表
  const displayedMembers = useMemo(() => {
    if (!selectedUnitId || !selectedUnit) return [];
    const unitIds = includeSubUnits ? getDescendantIds(selectedUnit) : [selectedUnitId];
    const allMembers = unitIds.flatMap(id => membersMap[id] || []);
    if (!memberSearch.trim()) return allMembers;
    const q = memberSearch.toLowerCase();
    return allMembers.filter(m =>
      (m.name || '').toLowerCase().includes(q) ||
      (m.phone || '').includes(q)
    );
  }, [selectedUnitId, selectedUnit, includeSubUnits, membersMap, memberSearch]);

  // 外发工厂只读成员表格列（无操作列）
  const readOnlyMemberColumns: TableColumnsType<User> = [
    {
      title: '姓名',
      dataIndex: 'name',
      render: (v: string, r: User) => (
        <Space size={6}>
          <Avatar
            size={24}
            icon={<UserOutlined />}
            style={{ backgroundColor: r.isFactoryOwner ? '#faad14' : '#52c41a', flexShrink: 0, cursor: 'pointer' }}
            onClick={() => setProfileUser(r)}
          />
          {v || r.username}
          {r.isFactoryOwner && (
            <Tag icon={<CrownFilled />} color="gold" style={{ marginLeft: 2 }}>老板</Tag>
          )}
        </Space>
      ),
    },
    { title: '手机号码', dataIndex: 'phone', render: (v: string) => v || '—' },
    { title: '所属部门', dataIndex: 'orgUnitId', render: (v: string) => v ? (unitNameMap[v] || '未知部门') : '—' },
    {
      title: '操作',
      width: 100,
      render: (_: unknown, r: User) => r.isFactoryOwner ? (
        <Tag color="gold"><CrownFilled /> 主账号</Tag>
      ) : (
        <Button
          size="small"
          icon={<CrownFilled />}
          loading={setOwnerLoading === String(r.id)}
          onClick={() => handleSetFactoryOwner(r)}
        >
          设为老板
        </Button>
      ),
    },
  ];

  // 成员表格列定义
  const memberColumns: TableColumnsType<User> = [
    {
      title: '姓名',
      dataIndex: 'name',
      render: (v: string, r: User) => (
        <Space size={6}>
          <Avatar size={24} icon={<UserOutlined />} style={{ backgroundColor: '#1677ff', flexShrink: 0, cursor: 'pointer' }} onClick={() => setProfileUser(r)} />
          {v || r.username}
        </Space>
      ),
    },
    {
      title: '手机号码',
      dataIndex: 'phone',
      render: (v: string) => v || '—',
    },
    {
      title: '所属部门',
      dataIndex: 'orgUnitId',
      render: (v: string) => v ? (unitNameMap[v] || '未知部门') : '—',
    },
    {
      title: '操作',
      width: 80,
      render: (_: unknown, r: User) => (
        <Button
          size="small"
          danger
          onClick={() => handleRemoveMember(String(r.id), r.name || r.username || '')}
        >
          移出
        </Button>
      ),
    },
  ];

  return (
    <Layout>
      <PageLayout
        title={
          <span style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
            {currentFactoryName ? (
              <>
                <BankOutlined style={{ marginRight: 6, color: '#1677ff', fontSize: 22 }} />
                <span style={{ fontSize: 22, fontWeight: 700, color: '#1677ff', marginRight: 14 }}>
                  {currentFactoryName}
                </span>
                <span style={{ color: '#d9d9d9', fontWeight: 300, fontSize: 20, marginRight: 14 }}>|</span>
              </>
            ) : null}
            <ApartmentOutlined style={{ marginRight: 8 }} />
            组织架构
          </span>
        }
        titleExtra={
          !isFactoryAccount ? (
            <Space>
              <Button
                icon={<SnippetsOutlined />}
                onClick={() => setTplModal({ open: true, type: null, rootName: '' })}
              >
                使用模板
              </Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => openCreate()}>
                新增部门
              </Button>
            </Space>
          ) : undefined
        }
        headerContent={
          !isFactoryAccount ? (
            <div style={{ color: 'var(--neutral-text-secondary)', marginTop: 4 }}>
              管理公司组织结构，包含部门、工厂及人员分配。
              <span style={{ marginLeft: 12 }}>
                共 <strong>{departments.length}</strong> 个部门 · <strong>{totalMembers}</strong> 名人员
              </span>
            </div>
          ) : undefined
        }
      >
        <Spin spinning={loading}>
        {visibleTreeData.length === 0 && !loading ? (
          <Empty description="暂无组织架构数据" style={{ padding: '60px 0' }} />
        ) : (
          <div className="org-split-layout">
            {/* 左侧：组织架构树 */}
            <div className="org-tree-panel">
              {visibleTreeData.map((node) => (
                <TreeItem
                  key={node.id ?? node.unitName}
                  node={node}
                  depth={0}
                  selectedId={selectedUnitId}
                  onSelect={setSelectedUnitId}
                  onAdd={openCreate}
                  onEdit={openEdit}
                  onDelete={handleDelete}
                  onAddMember={handleOpenAssign}
                  onShowQRCode={handleShowQRCode}
                  readOnly={isFactoryAccount}
                />
              ))}
            </div>

            {/* 右侧：成员面板 */}
            <div className="org-member-panel">
              {!selectedUnitId ? (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="请点击左侧节点查看成员"
                  style={{ paddingTop: 80 }}
                />
              ) : (
                <>
                  <div style={{ marginBottom: 12, fontWeight: 600, fontSize: 15 }}>
                    {selectedUnit?.unitName} · 成员列表
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
                    {!isFactoryAccount && (isExternalSelected ? (
                      <>
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
                      </>
                    ) : (
                      <Button
                        type="primary"
                        icon={<UserAddOutlined />}
                        onClick={() => selectedUnit && handleOpenAssign(selectedUnit)}
                      >
                        添加成员
                      </Button>
                    ))}
                  </div>
                  <ResizableTable<User>
                    storageKey={isExternalSelected ? 'organization-tree-external-members' : 'organization-tree-members'}
                    size="small"
                    rowKey={r => String(r.id ?? r.username)}
                    columns={isExternalSelected ? readOnlyMemberColumns : memberColumns}
                    dataSource={displayedMembers}
                    pagination={displayedMembers.length > DEFAULT_PAGE_SIZE ? {
                      showSizeChanger: true,
                      pageSizeOptions: [...DEFAULT_PAGE_SIZE_OPTIONS],
                    } : false}
                    locale={{ emptyText: isExternalSelected ? '暂无成员，可点击「添加成员」或通过扫码二维码注册' : '暂无成员，点击「添加成员」分配' }}
                  />
                </>
              )}
            </div>
          </div>
        )}
        </Spin>
      </PageLayout>

      {/* 新增/编辑部门弹窗 */}
      <ResizableModal
        open={dialogOpen}
        title={dialogMode === 'edit' ? '编辑部门' : '新增部门'}
        onCancel={closeDialog}
        onOk={handleSubmit}
        confirmLoading={submitLoading}
        okText="保存"
        cancelText="取消"
        width="30vw"
        initialHeight={260}
      >
        <Form form={form} layout="vertical" style={{ padding: '4px 0' }}>
          <Form.Item name="id" hidden><Input /></Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="unitName" label="部门名称" rules={[{ required: true, message: '请输入部门名称' }]}>
                <Input placeholder="例如：版房中心" maxLength={50} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="parentId" label="上级部门">
                <Select
                  showSearch
                  allowClear
                  optionFilterProp="label"
                  placeholder="不选则为顶级部门"
                  options={departmentOptions}
                  notFoundContent={departmentOptions.length === 0 ? '暂无部门' : '无匹配'}
                  style={{ width: '100%' }}
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="ownerType" label="内外标签" rules={[{ required: true, message: '请选择' }]}>
                <Select options={ownerTypeOptions} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="sortOrder" label="排序">
                <InputNumber min={0} precision={0} placeholder="默认 0" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          {currentRecord?.pathNames && (
            <div style={{ color: 'var(--neutral-text-secondary)', padding: '0 16px', marginTop: 8 }}>
              当前路径：{currentRecord.pathNames}
            </div>
          )}
        </Form>
      </ResizableModal>

      {/* 分配成员弹窗（竖向布局 + 批量勾选） */}
      <ResizableModal
        open={assignModal.open}
        title={`为「${assignModal.node?.unitName || ''}」添加成员`}
        onCancel={() => { setAssignModal({ open: false, node: null }); setBatchSelectedIds([]); }}
        footer={null}
        width="40vw"
        initialHeight={580}
      >
        <div style={{ padding: '8px 0' }}>
          <Input.Search
            placeholder="搜索姓名或账号"
            allowClear
            value={assignSearch}
            onChange={(e) => setAssignSearch(e.target.value)}
            style={{ marginBottom: 12 }}
          />
          {filteredAssignableUsers.length === 0 ? (
            <Empty description="暂无用户（该租户下尚无活跃账号）" style={{ padding: '32px 0' }} />
          ) : (
            <ResizableTable<User>
              size="small"
              rowKey={(r) => String(r.id)}
              dataSource={filteredAssignableUsers}
              scroll={{ y: 300 }}
              pagination={false}
              rowSelection={{
                type: 'checkbox',
                selectedRowKeys: batchSelectedIds,
                onChange: (keys) => setBatchSelectedIds(keys as string[]),
                getCheckboxProps: (r) => ({ disabled: currentNodeMemberIds.has(String(r.id)) }),
              }}
              columns={[
                {
                  title: '用户',
                  render: (_: unknown, r: User) => {
                    const alreadyIn = currentNodeMemberIds.has(String(r.id));
                    return (
                      <Space size={6}>
                        <Avatar size={28} icon={<UserOutlined />}
                          style={{ backgroundColor: alreadyIn ? '#ccc' : '#1677ff', flexShrink: 0 }} />
                        <div>
                          <div style={{ fontWeight: 500 }}>{r.name || r.username}</div>
                          <div style={{ fontSize: 12, color: 'var(--neutral-text-secondary)' }}>
                            {r.username}
                            {!alreadyIn && r.orgUnitId && (
                              <Tag color="orange" style={{ marginLeft: 6, fontSize: 11 }}>
                                已在: {unitNameMap[String(r.orgUnitId)] || '其他组织'}
                              </Tag>
                            )}
                          </div>
                        </div>
                      </Space>
                    );
                  },
                },
                { title: '手机号', dataIndex: 'phone', width: 110, render: (v: string) => v || '—' },
                {
                  title: '状态', width: 72,
                  render: (_: unknown, r: User) => currentNodeMemberIds.has(String(r.id))
                    ? <Tag color="success" style={{ fontSize: 11 }}>已添加</Tag>
                    : null,
                },
              ]}
            />
          )}
          {/* 底部批量确认区 */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginTop: 16, paddingTop: 12, borderTop: '1px solid #f0f0f0',
          }}>
            <span style={{ color: 'var(--neutral-text-secondary)', fontSize: 13 }}>
              {batchSelectedIds.length > 0 ? `已勾选 ${batchSelectedIds.length} 人` : '勾选后批量添加'}
            </span>
            <Space>
              <Button onClick={() => { setAssignModal({ open: false, node: null }); setBatchSelectedIds([]); }}>取消</Button>
              <Button
                type="primary"
                disabled={batchSelectedIds.length === 0}
                loading={batchAssignLoading}
                onClick={handleBatchAssign}
              >
                确认添加{batchSelectedIds.length > 0 ? ` (${batchSelectedIds.length} 人)` : ''}
              </Button>
            </Space>
          </div>
        </div>
      </ResizableModal>

      {/* 外发工厂注册二维码弹窗 */}
      <ResizableModal
        open={qrModal.open}
        title={`${qrModal.unit?.unitName || ''} · 注册二维码`}
        onCancel={() => setQrModal({ open: false, unit: null, tenantCode: '' })}
        footer={null}
        width="30vw"
        initialHeight={420}
      >
        <div style={{ textAlign: 'center', padding: '24px 0' }}>
          <QRCode
            value={
              qrModal.unit
                ? `${window.location.origin}/register?type=FACTORY_INVITE&tenantCode=${encodeURIComponent(qrModal.tenantCode)}&factoryId=${encodeURIComponent(qrModal.unit.factoryId || String(qrModal.unit.id))}&factoryName=${encodeURIComponent(qrModal.unit.unitName)}&orgUnitId=${encodeURIComponent(String(qrModal.unit.id))}`
                : ' '
            }
            size={220}
            style={{ margin: '0 auto' }}
          />
          <Typography.Text type="secondary" style={{ display: 'block', marginTop: 16, fontSize: 13 }}>
            外发工厂工人扫码注册，自动归属到「{qrModal.unit?.unitName}」
          </Typography.Text>
        </div>
      </ResizableModal>

      {/* 模板初始化弹窗 */}
      <ResizableModal
        open={tplModal.open}
        title="从模板创建组织架构"
        onCancel={() => setTplModal({ open: false, type: null, rootName: '' })}
        onOk={handleInitTemplate}
        confirmLoading={tplLoading}
        okText="立即创建"
        cancelText="取消"
        width="40vw"
        initialHeight={500}
      >
        <div style={{ padding: '16px 0' }}>
          <div style={{ marginBottom: 12, fontWeight: 500 }}>第一步：选择模板类型</div>
          <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
            {(
              [
                {
                  type: 'FACTORY' as const,
                  icon: '',
                  label: '工厂 / 车间',
                  desc: '适合外发工厂、合作供应商',
                  children: ['车间一', '车间二', '车间三'],
                },
                {
                  type: 'INTERNAL' as const,
                  icon: '',
                  label: '公司内部',
                  desc: '适合公司内部管理部门',
                  children: ['生产部门', '财务部门', '行政部门'],
                },
              ]
            ).map((tpl) => (
              <div
                key={tpl.type}
                onClick={() => setTplModal((prev) => ({ ...prev, type: tpl.type }))}
                style={{
                  flex: 1,
                  border: `2px solid ${tplModal.type === tpl.type ? 'var(--primary-color, #1677ff)' : '#d9d9d9'}`,
                  borderRadius: 8,
                  padding: '14px 16px',
                  cursor: 'pointer',
                  background: tplModal.type === tpl.type ? '#f0f5ff' : '#fafafa',
                  transition: 'border-color .2s, background .2s',
                }}
              >
                <div style={{ fontSize: 28, marginBottom: 6 }}>{tpl.icon}</div>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{tpl.label}</div>
                <div style={{ fontSize: 12, color: 'var(--neutral-text-secondary)', marginBottom: 10 }}>
                  {tpl.desc}
                </div>
                <div style={{ fontSize: 12 }}>
                  {tpl.children.map((c) => (
                    <Tag key={c} style={{ marginBottom: 4 }}>{c}</Tag>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginBottom: 8, fontWeight: 500 }}>第二步：输入根节点名称</div>
          <Input
            placeholder={
              tplModal.type === 'FACTORY'
                ? '例如：嘉兴市合作工厂'
                : '例如：公司生产中心'
            }
            value={tplModal.rootName}
            maxLength={40}
            allowClear
            onChange={(e) => setTplModal((prev) => ({ ...prev, rootName: e.target.value }))}
            style={{ marginBottom: 16 }}
          />

          {tplModal.type === 'FACTORY' && (
            <>
              <div style={{ marginBottom: 8, fontWeight: 500 }}>第三步：关联现有工厂（可选）</div>
              <Select
                allowClear
                placeholder="选择已有工厂，可跳过"
                value={tplModal.factoryId}
                onChange={(v) => setTplModal((prev) => ({ ...prev, factoryId: v }))}
                options={factories.map((f) => ({
                  value: f.id,
                  label: f.factoryName + (f.contactPerson ? ' · ' + f.contactPerson : ''),
                }))}
                style={{ width: '100%', marginBottom: 16 }}
              />
            </>
          )}

          {tplModal.type && (
            <div style={{ background: '#f8f9fa', borderRadius: 6, padding: '12px 16px', fontSize: 13 }}>
              <div style={{ fontWeight: 500, marginBottom: 8, color: 'var(--neutral-text-secondary)' }}>
                创建预览
              </div>
              <div style={{ marginBottom: 4 }}>
                 <strong>{tplModal.rootName || '(待填写)'}</strong>
              </div>
              {(tplModal.type === 'FACTORY'
                ? ['车间一', '车间二', '车间三']
                : ['生产部门', '财务部门', '行政部门']
              ).map((c) => (
                <div key={c} style={{ paddingLeft: 20, color: 'var(--neutral-text-secondary)', lineHeight: 1.8 }}>
                  └ {c}
                </div>
              ))}
            </div>
          )}
        </div>
      </ResizableModal>

      {/* 成员资料 mini 弹窗 */}
      <SmallModal
        open={!!profileUser}
        onCancel={() => { setProfileUser(null); setResetPwdVisible(false); setResetPwdValue(''); }}
        footer={null}
        width={360}
        title="成员资料"
        centered
      >
        {profileUser && (
          <div>
            <div style={{ textAlign: 'center', paddingBottom: 16, borderBottom: '1px solid #f0f0f0', marginBottom: 16 }}>
              <Avatar
                size={64}
                icon={<UserOutlined />}
                style={{ backgroundColor: profileUser.isFactoryOwner ? '#faad14' : '#1677ff', display: 'block', margin: '0 auto 12px' }}
              />
              <div style={{ fontSize: 16, fontWeight: 600 }}>
                {profileUser.name || profileUser.username}
                {profileUser.isFactoryOwner && (
                  <Tag icon={<CrownFilled />} color="gold" style={{ marginLeft: 8 }}>老板</Tag>
                )}
              </div>
              <div style={{ color: '#999', fontSize: 13, marginTop: 4 }}>@{profileUser.username}</div>
            </div>
            <Descriptions column={1} size="small">
              <Descriptions.Item label="手机">{profileUser.phone || '—'}</Descriptions.Item>
              <Descriptions.Item label="角色">{profileUser.roleName || '—'}</Descriptions.Item>
              <Descriptions.Item label="所属部门">
                {profileUser.orgUnitId ? (unitNameMap[profileUser.orgUnitId] || '—') : '—'}
              </Descriptions.Item>
              <Descriptions.Item label="帐号状态">
                <Tag color={profileUser.status === 'active' ? 'green' : 'default'}>
                  {profileUser.status === 'active' ? '正常' : '已停用'}
                </Tag>
              </Descriptions.Item>
            </Descriptions>
            {/* 重置密码（仅对工厂成员显示，由管理员操作） */}
            {(profileUser as any)?.factoryId && (
              <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid #f0f0f0' }}>
                {!resetPwdVisible ? (
                  <Button block icon={<LockOutlined />} onClick={() => { setResetPwdValue(''); setResetPwdVisible(true); }}>
                    重置密码
                  </Button>
                ) : (
                  <div>
                    <Input.Password
                      placeholder="请输入新密码（至少6位）"
                      value={resetPwdValue}
                      onChange={e => setResetPwdValue(e.target.value)}
                      style={{ marginBottom: 8 }}
                    />
                    <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
                      <Button size="small" onClick={() => { setResetPwdVisible(false); setResetPwdValue(''); }}>取消</Button>
                      <Button size="small" type="primary" loading={resetPwdLoading} onClick={handleResetMemberPwd}>确认重置</Button>
                    </Space>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </SmallModal>
    </Layout>
  );
};

export default OrganizationTreePage;
