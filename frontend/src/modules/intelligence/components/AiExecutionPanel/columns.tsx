/**
 * AI 智能执行面板 - 待审批命令表格列定义
 */
import { Button, Space, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { PendingCommand, ViewDetailHandler } from './types';
import {
  getActionLabel,
  getRiskColor,
  getRiskLabel,
  getWaitingColor,
  getWaitingMinutes,
  truncateText
} from './helpers';

/**
 * 构建待审批命令表格列
 * @param onViewDetail 点击"查看"按钮回调
 */
export function buildColumns(onViewDetail: ViewDetailHandler): ColumnsType<PendingCommand> {
  return [
    {
      title: 'AI建议',
      dataIndex: 'action',
      key: 'action',
      width: 120,
      render: (action: string) => getActionLabel(action)
    },
    {
      title: '目标',
      dataIndex: 'targetId',
      key: 'targetId',
      width: 120,
      render: (text: string) => <strong>{text}</strong>
    },
    {
      title: '理由',
      dataIndex: 'reason',
      key: 'reason',
      width: 200,
      render: (text: string) => <span title={text}>{truncateText(text, 30)}</span>
    },
    {
      title: '风险等级',
      dataIndex: 'riskLevel',
      key: 'riskLevel',
      width: 100,
      render: (level: number) => <Tag color={getRiskColor(level)}>{getRiskLabel(level)}</Tag>
    },
    {
      title: '需要角色',
      dataIndex: 'waitingFor',
      key: 'waitingFor',
      width: 150,
      render: (roles: string[]) => (
        <Space wrap>
          {roles?.map((role: string) => (
            <Tag key={role} color="blue" style={{ fontSize: '12px' }}>
              {role}
            </Tag>
          ))}
        </Space>
      )
    },
    {
      title: '等待时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 150,
      render: (createdAt: string) => {
        const duration = getWaitingMinutes(createdAt);
        const color = getWaitingColor(duration);
        return (
          <span style={{ color }}>
            {duration} 分钟前
          </span>
        );
      }
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      fixed: 'right',
      render: (_, record: PendingCommand) => (
        <Space>
          <Button
            type="primary"
            onClick={() => onViewDetail(record)}
          >
            查看
          </Button>
        </Space>
      )
    }
  ];
}
