import type { ColumnsType } from 'antd/es/table';
import { Tag, Tooltip } from 'antd';
import RowActions from '@/components/common/RowActions';
import type { Factory as FactoryType } from '@/types/system';
import type { SupplierScore } from '@/services/intelligence/intelligenceApi';
import { formatDateTime } from '@/utils/datetime';
import { paths } from '@/routeConfig';

const tierColorMap: Record<string, string> = { S: '#f7a600', A: '#39ff14', B: '#4fc3f7', C: '#ff4136' };

const getStatusText = (status: string) => {
  const statusMap: Record<string, string> = { active: '启用', inactive: '停用' };
  return statusMap[status] || '未知';
};

export interface FactoryColumnActions {
  openDialog: (mode: 'create' | 'view' | 'edit', factory?: FactoryType) => void;
  handleDelete: (id?: string) => void;
  openLogModal: (bizType: string, bizId: string, title: string) => void;
  setAccountFactory: (f: { id: string; name: string }) => void;
  setAccountModalOpen: (v: boolean) => void;
  setSupplierUserFactory: (f: { id: string; name: string }) => void;
  setSupplierUserModalOpen: (v: boolean) => void;
  loadScorecardOnce: () => void;
  scorecardMap: Record<string, SupplierScore>;
  scorecardLoading: boolean;
  navigate: (to: string) => void;
}

export const getFactoryColumns = (actions: FactoryColumnActions): ColumnsType<FactoryType> => {
  const {
    openDialog, handleDelete, openLogModal,
    setAccountFactory, setAccountModalOpen,
    setSupplierUserFactory, setSupplierUserModalOpen,
    loadScorecardOnce, scorecardMap, scorecardLoading, navigate,
  } = actions;

  return [
    { title: '供应商编码', dataIndex: 'factoryCode', key: 'factoryCode', width: 140 },
    {
      title: '供应商名称',
      dataIndex: 'factoryName',
      key: 'factoryName',
      width: 200,
      ellipsis: true,
      render: (name: string) => {
        const score = scorecardMap[name];
        const tooltipContent = scorecardLoading ? (
          <span style={{ color: 'rgba(255,255,255,0.6)' }}>加载中...</span>
        ) : score ? (
          <div style={{ fontSize: 12, lineHeight: 1.8, minWidth: 160 }}>
            <div style={{ marginBottom: 4 }}>
              <Tag color={tierColorMap[score.tier] ?? '#888'} style={{ fontWeight: 700, fontSize: 12 }}>
                {score.tier}级
              </Tag>
              <span style={{ color: tierColorMap[score.tier] ?? '#ccc', fontWeight: 600 }}>
                综合分 {score.overallScore?.toFixed(1)}
              </span>
            </div>
            <div>准时率：<span style={{ color: score.onTimeRate >= 0.9 ? '#39ff14' : score.onTimeRate >= 0.75 ? '#f7a600' : '#ff4136' }}>{(score.onTimeRate * 100).toFixed(0)}%</span></div>
            <div>质量分：<span style={{ color: score.qualityScore >= 90 ? '#39ff14' : score.qualityScore >= 75 ? '#f7a600' : '#ff4136' }}>{score.qualityScore?.toFixed(1)}</span></div>
            <div>已完成 / 总接单：{score.completedOrders} / {score.totalOrders} 单</div>
            <div>逾期：{score.overdueOrders} 单</div>
          </div>
        ) : (
          <span style={{ color: 'rgba(255,255,255,0.5)' }}>暂无评分数据</span>
        );
        return (
          <Tooltip
            title={tooltipContent}
            onOpenChange={(open) => { if (open) void loadScorecardOnce(); }}
            mouseEnterDelay={0.3}
            styles={{ container: { minWidth: 180 } }}
          >
            <span style={{ cursor: 'default', borderBottom: '1px dashed rgba(0,0,0,0.25)', paddingBottom: 1 }}>
              {name}
            </span>
          </Tooltip>
        );
      },
    },
    {
      title: '归属架构',
      dataIndex: 'orgPath',
      key: 'orgPath',
      width: 260,
      ellipsis: true,
      render: (_: string, record: FactoryType) => record.orgPath || record.parentOrgUnitName || '-',
    },
    {
      title: '内外标签',
      dataIndex: 'factoryType',
      key: 'factoryType',
      width: 110,
      render: (v: string) => {
        if (v === 'INTERNAL') return <Tag color="blue">内部</Tag>;
        if (v === 'EXTERNAL') return <Tag color="purple">外部</Tag>;
        return <Tag>未标记</Tag>;
      },
    },
    {
      title: '类型',
      dataIndex: 'supplierType',
      key: 'supplierType',
      width: 110,
      render: (v: string) => {
        if (v === 'MATERIAL') return <Tag color="blue">面辅料</Tag>;
        if (v === 'OUTSOURCE') return <Tag color="orange">外发厂</Tag>;
        return <Tag>未分类</Tag>;
      },
    },
    {
      title: '评级',
      dataIndex: 'supplierTier',
      key: 'supplierTier',
      width: 70,
      render: (v: string) => {
        if (!v) return '-';
        const colorMap: Record<string, string> = { S: 'gold', A: 'green', B: 'blue', C: 'red' };
        return <Tag color={colorMap[v] || 'default'} style={{ fontWeight: 700 }}>{v}</Tag>;
      },
    },
    {
      title: '准入',
      dataIndex: 'admissionStatus',
      key: 'admissionStatus',
      width: 90,
      render: (v: string) => {
        const map: Record<string, { color: string; text: string }> = {
          approved: { color: 'green', text: '已通过' },
          pending: { color: 'orange', text: '待审核' },
          probation: { color: 'blue', text: '试用中' },
          rejected: { color: 'red', text: '已拒绝' },
          suspended: { color: 'default', text: '已暂停' },
        };
        const item = map[v] || { color: 'default', text: v || '-' };
        return <Tag color={item.color}>{item.text}</Tag>;
      },
    },
    {
      title: '综合分',
      dataIndex: 'overallScore',
      key: 'overallScore',
      width: 80,
      render: (v: number) => v != null ? <span style={{ fontWeight: 600, color: v >= 90 ? '#52c41a' : v >= 75 ? '#1890ff' : v >= 60 ? '#faad14' : '#ff4d4f' }}>{v.toFixed(1)}</span> : '-',
    },
    { title: '联系人', dataIndex: 'contactPerson', key: 'contactPerson', width: 120 },
    { title: '联系电话', dataIndex: 'contactPhone', key: 'contactPhone', width: 140 },
    { title: '地址', dataIndex: 'address', key: 'address', ellipsis: true },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (v: unknown) => {
        const status = String(v || '').trim() || 'inactive';
        if (status === 'active') return <Tag color="success">{getStatusText(status)}</Tag>;
        return <Tag>{getStatusText(status)}</Tag>;
      },
    },
    {
      title: '创建时间',
      dataIndex: 'createTime',
      key: 'createTime',
      width: 180,
      render: (v: unknown) => formatDateTime(v),
    },
    {
      title: '操作',
      key: 'actions',
      width: 220,
      fixed: 'right' as const,
      render: (_: any, factory: FactoryType) => (
        <RowActions
          className="table-actions"
          maxInline={2}
          actions={[
            { key: 'view', label: '查看', title: '查看', onClick: () => openDialog('view', factory), primary: true },
            { key: 'edit', label: '编辑', title: '编辑', onClick: () => openDialog('edit', factory), primary: true },
            ...(factory.supplierType === 'OUTSOURCE'
              ? [{
                  key: 'workers',
                  label: '工人管理',
                  title: '工人管理',
                  onClick: () => {
                    const params = new URLSearchParams();
                    if (factory.id) params.set('factoryId', String(factory.id));
                    if (factory.factoryName) params.set('factoryName', factory.factoryName);
                    navigate(`${paths.factoryWorkers}?${params.toString()}`);
                  },
                }]
              : []),
            ...(factory.supplierType === 'MATERIAL'
              ? [{
                  key: 'supplierUser',
                  label: '账号管理',
                  title: '供应商登录账号管理',
                  onClick: () => {
                    setSupplierUserFactory({ id: String(factory.id || ''), name: factory.factoryName || '' });
                    setSupplierUserModalOpen(true);
                  },
                }]
              : []),
            {
              key: 'account',
              label: '收款账户',
              title: '收款账户',
              onClick: () => {
                setAccountFactory({ id: String(factory.id || ''), name: factory.factoryName || '' });
                setAccountModalOpen(true);
              },
            },
            {
              key: 'log',
              label: '日志',
              title: '日志',
              onClick: () => openLogModal('factory', String(factory.id || ''), `供应商 ${factory.factoryName} 操作日志`),
            },
            {
              key: 'delete',
              label: '删除',
              title: '删除',
              danger: true,
              onClick: () => handleDelete(factory.id),
            },
          ]}
        />
      ),
    },
  ];
};

export const logColumns = [
  { title: '动作', dataIndex: 'action', key: 'action', width: 120, render: (v: string) => v || '-' },
  { title: '操作人', dataIndex: 'operator', key: 'operator', width: 120, render: (v: string) => v || '-' },
  { title: '原因', dataIndex: 'remark', key: 'remark', render: (v: string) => v || '-' },
  { title: '时间', dataIndex: 'createTime', key: 'createTime', width: 180, render: (v: string) => formatDateTime(v) },
];
