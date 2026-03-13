import React, { useState, useEffect } from 'react';
import { Card, Button, Modal, Tag, Space, Drawer, Spin, Empty, Alert } from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import { CheckCircleOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { intelligenceApi } from '@/services/intelligenceApi';
import './AiExecutionPanel.css';

/**
 * AI 智能执行面板组件
 *
 * 职责：
 *   1. 显示待审批的高风险命令
 *   2. 提供"执行"和"拒绝"操作
 *   3. 展示执行成功消息和级联任务
 *
 * 使用场景：
 *   - 仪表板：显示"待您审批的AI建议"卡片
 *   - 侧边栏：悬浮待审批命令数量和快捷操作
 *   - 全屏编辑模态：展示完整的命令详情和审批表单
 *
 * @author Intelligence Execution UI v1.0
 * @date 2026-03-08
 */
export default function AiExecutionPanel() {
  // =====================================================
  // 状态管理
  // =====================================================

  const [pendingCommands, setPendingCommands] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedCommand, setSelectedCommand] = useState<any>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [executeResult, setExecuteResult] = useState<any>(null);
  const [showResult, setShowResult] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // =====================================================
  // 生命周期：组件加载时获取待审批命令
  // =====================================================

  useEffect(() => {
    fetchPendingCommands();

    // 每 30 秒自动刷新一次
    const timer = setInterval(fetchPendingCommands, 30000);

    return () => clearInterval(timer);
  }, []);

  // =====================================================
  // 数据获取
  // =====================================================

  const fetchPendingCommands = async () => {
    try {
      setLoading(true);
      const response = await intelligenceApi.getPendingCommands();
      setPendingCommands(response?.pending ?? []);
      setError(null);
    } catch (err: any) {
      setError(err.message || '获取待审批命令失败');
      console.error('Failed to fetch pending commands:', err);
    } finally {
      setLoading(false);
    }
  };

  // =====================================================
  // 事件处理：查看命令详情
  // =====================================================

  const handleViewDetail = (command: any) => {
    setSelectedCommand(command);
    setShowDetail(true);
  };

  // =====================================================
  // 事件处理：执行命令
  // =====================================================

  const handleExecuteCommand = async () => {
    if (!selectedCommand) return;

    try {
      setExecuting(true);
      const result = await intelligenceApi.executeCommand(selectedCommand);

      setExecuteResult({
        success: result.status === 'SUCCESS',
        message: result.message || '命令执行成功',
        data: result.data,
        cascadedTasks: result.cascadedTasks,
        notifiedRecipients: result.notifiedRecipients
      });

      setShowResult(true);
      setShowDetail(false);

      // 刷新待审批列表
      await fetchPendingCommands();

    } catch (err: any) {
      setExecuteResult({
        success: false,
        message: err.message || '执行失败',
        error: err
      });
      setShowResult(true);
    } finally {
      setExecuting(false);
    }
  };

  // =====================================================
  // 事件处理：拒绝命令
  // =====================================================

  const handleRejectCommand = () => {
    if (!selectedCommand) return;

    Modal.confirm({
      width: '30vw',
      title: '确认拒绝',
      content: `确定要拒绝该命令吗？\n命令ID: ${selectedCommand.commandId}`,
      okText: '拒绝',
      okButtonProps: { danger: true, type: 'default' },
      cancelText: '取消',
      onOk: async () => {
        try {
          setExecuting(true);
          await intelligenceApi.rejectCommand(selectedCommand.commandId, {
            reason: '用户手动拒绝'
          });

          Modal.success({
            title: '已拒绝',
            content: '该命令已被拒绝'
          });

          setShowDetail(false);
          await fetchPendingCommands();

        } catch (err: any) {
          Modal.error({
            title: '拒绝失败',
            content: err.message || '拒绝命令出错'
          });
        } finally {
          setExecuting(false);
        }
      }
    });
  };

  // =====================================================
  // UI：表格列定义
  // =====================================================

  const columns = [
    {
      title: 'AI建议',
      dataIndex: 'action',
      key: 'action',
      width: 120,
      render: (action: string) => {
        const actionMap: any = {
          'order:hold': '暂停订单',
          'order:expedite': '加急订单',
          'order:approve': '审核通过',
          'order:reject': '退回订单',
          'style:approve': '款式通过',
          'style:return': '退回款式',
          'quality:reject': '质检退回',
          'settlement:approve': '结算审批',
          'purchase:create': '自动采购',
          'notification:push': '推送通知'
        };
        return actionMap[action] || action;
      }
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
      render: (text: string) => <span title={text}>{text?.substring(0, 30)}...</span>
    },
    {
      title: '风险等级',
      dataIndex: 'riskLevel',
      key: 'riskLevel',
      width: 100,
      render: (level: number) => {
        const colors = ['', 'green', 'green', 'orange', 'red', 'red'];
        const labels = ['', '低', '低', '中', '高', '高'];
        return <Tag color={colors[level]}>{labels[level]}</Tag>;
      }
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
        const duration = dayjs().diff(dayjs(createdAt), 'minute');
        const color = duration > 60 ? 'red' : duration > 10 ? 'orange' : 'green';
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
      fixed: 'right' as const,
      render: (_: any, record: any) => (
        <Space size="small">
          <Button
            type="primary"
            size="small"
            onClick={() => handleViewDetail(record)}
          >
            查看
          </Button>
        </Space>
      )
    }
  ];

  // =====================================================
  // 渲染：主面板
  // =====================================================

  return (
    <div className="ai-execution-panel">
      <Card
        title={`待您审批的AI建议 (${pendingCommands.length})`}
        extra={
          <Button
            type="link"
            size="small"
            loading={loading}
            onClick={fetchPendingCommands}
          >
            刷新
          </Button>
        }
        className="ai-panel-card"
      >
        {error && (
          <Alert
            message={error}
            type="error"
            closable
            style={{ marginBottom: '16px' }}
            onClose={() => setError(null)}
          />
        )}

        <Spin spinning={loading}>
          {pendingCommands.length === 0 ? (
            <Empty
              description="没有待审批的命令"
              style={{ marginTop: '40px' }}
            />
          ) : (
            <ResizableTable
              columns={columns}
              dataSource={pendingCommands}
              rowKey="commandId"
              pagination={{
                pageSize: 10,
                showSizeChanger: true,
                showQuickJumper: true,
                showTotal: (total) => `共 ${total} 条`
              }}
              scroll={{ x: 1200 }}
            />
          )}
        </Spin>
      </Card>

      {/* ===== 详情抽屉 ===== */}
      <Drawer
        title={`命令详情 - ${selectedCommand?.action}`}
        placement="right"
        onClose={() => setShowDetail(false)}
        open={showDetail}
        width={500}
      >
        {selectedCommand && (
          <div style={{ paddingTop: '16px' }}>
            {/* 命令基本信息 */}
            <div className="command-detail-section">
              <h4>命令信息</h4>
              <div className="detail-row">
                <span className="label">命令ID:</span>
                <span>{selectedCommand.commandId}</span>
              </div>
              <div className="detail-row">
                <span className="label">命令类型:</span>
                <Tag color="blue">{selectedCommand.action}</Tag>
              </div>
              <div className="detail-row">
                <span className="label">目标:</span>
                <strong>{selectedCommand.targetId}</strong>
              </div>
              <div className="detail-row">
                <span className="label">风险等级:</span>
                <Tag color={selectedCommand.riskLevel > 3 ? 'red' : 'orange'}>
                  {selectedCommand.riskLevel}/5
                </Tag>
              </div>
              <div className="detail-row">
                <span className="label">需要审批:</span>
                <Tag color="green">是</Tag>
              </div>
            </div>

            {/* AI 建议 */}
            <div className="command-detail-section">
              <h4>AI 建议</h4>
              <div style={{
                padding: '12px',
                background: '#f5f5f5',
                borderRadius: '4px',
                marginBottom: '16px'
              }}>
                {selectedCommand.reason}
              </div>
            </div>

            {/* 需要审批的角色 */}
            <div className="command-detail-section">
              <h4>需要以下角色审批</h4>
              <Space wrap>
                {selectedCommand.waitingFor?.map((role: string) => (
                  <Tag key={role} color="geekblue" style={{ fontSize: '13px' }}>
                    • {role}
                  </Tag>
                ))}
              </Space>
            </div>

            {/* 命令参数 */}
            {selectedCommand.params && (
              <div className="command-detail-section">
                <h4>命令参数</h4>
                <pre style={{
                  fontSize: '12px',
                  background: '#f5f5f5',
                  padding: '8px',
                  borderRadius: '4px',
                  overflow: 'auto'
                }}>
                  {JSON.stringify(selectedCommand.params, null, 2)}
                </pre>
              </div>
            )}

            {/* 预期影响 */}
            <div className="command-detail-section">
              <h4>预期影响</h4>
              <ul>
                <li>订单状态将变更为"暂停"</li>
                <li>相关工序将暂停推进</li>
                <li>财务部门将被通知评估已支付成本</li>
                <li>仓库团队将收到库存清点任务</li>
              </ul>
            </div>

            {/* 操作按钮 */}
            <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid #f0f0f0' }}>
              <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
                <Button
                  type="primary"
                  danger
                  onClick={handleRejectCommand}
                  disabled={executing}
                >
                  拒绝
                </Button>
                <Button
                  type="primary"
                  icon={<CheckCircleOutlined />}
                  onClick={handleExecuteCommand}
                  loading={executing}
                >
                  执行
                </Button>
              </Space>
            </div>
          </div>
        )}
      </Drawer>

      {/* ===== 执行结果模态框 ===== */}
      <Modal
        title={executeResult?.success ? '✅ 执行成功' : '❌ 执行失败'}
        open={showResult}
        onOk={() => setShowResult(false)}
        onCancel={() => setShowResult(false)}
        okText="关闭"
        cancelButtonProps={{ style: { display: 'none' } }}
        width="40vw"
      >
        <div className="result-content">
          {executeResult?.success ? (
            <>
              <Alert
                message={executeResult.message}
                type="success"
                style={{ marginBottom: '16px' }}
              />

              {executeResult.cascadedTasks > 0 && (
                <Alert
                  message={`已触发 ${executeResult.cascadedTasks} 个级联任务`}
                  type="info"
                  style={{ marginBottom: '16px' }}
                />
              )}

              {executeResult.notifiedRecipients && (
                <div>
                  <h4>已通知团队:</h4>
                  <Space wrap>
                    {executeResult.notifiedRecipients.map((recipient: string) => (
                      <Tag key={recipient} color="green">
                        {recipient}
                      </Tag>
                    ))}
                  </Space>
                </div>
              )}

              <div style={{ marginTop: '16px', padding: '12px', background: '#f6f8f9', borderRadius: '4px' }}>
                <p style={{ margin: 0, fontSize: '12px', color: '#666' }}>
                  命令已成功执行，相关团队将在3分钟内看到影响。
                </p>
              </div>
            </>
          ) : (
            <Alert
              message={executeResult?.message || '未知错误'}
              type="error"
              showIcon
            />
          )}
        </div>
      </Modal>
    </div>
  );
}
