import React from 'react';
import { Avatar, Button, Empty, Input, Space, Tag } from 'antd';
import { UserOutlined } from '@ant-design/icons';
import ResizableModal from '@/components/common/ResizableModal';
import ResizableTable from '@/components/common/ResizableTable';
import type { User } from '@/types/system';

interface AssignMemberModalProps {
  assignModal: {
    open: boolean;
    node: { unitName?: string } | null;
  };
  setAssignModal: React.Dispatch<React.SetStateAction<{ open: boolean; node: { unitName?: string } | null }>>;
  assignSearch: string;
  setAssignSearch: React.Dispatch<React.SetStateAction<string>>;
  filteredAssignableUsers: User[];
  batchSelectedIds: string[];
  setBatchSelectedIds: React.Dispatch<React.SetStateAction<string[]>>;
  currentNodeMemberIds: Set<string>;
  unitNameMap: Record<string, string>;
  batchAssignLoading: boolean;
  handleBatchAssign: () => void;
}

const AssignMemberModal: React.FC<AssignMemberModalProps> = ({
  assignModal, setAssignModal,
  assignSearch, setAssignSearch,
  filteredAssignableUsers,
  batchSelectedIds, setBatchSelectedIds,
  currentNodeMemberIds, unitNameMap,
  batchAssignLoading, handleBatchAssign,
}) => (
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
);

export default AssignMemberModal;
