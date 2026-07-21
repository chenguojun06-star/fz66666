import { Card, Button, Spin, Empty, Alert } from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import { readPageSize } from '@/utils/pageSizeStore';
import './AiExecutionPanel.css';
import { useAiExecutionPanelData } from './useAiExecutionPanelData';
import { buildColumns } from './columns';
import DetailDrawer from './DetailDrawer';
import ResultModal from './ResultModal';

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
  const {
    pendingCommands,
    loading,
    selectedCommand,
    showDetail,
    executing,
    executeResult,
    showResult,
    error,
    setShowDetail,
    setShowResult,
    setError,
    fetchPendingCommands,
    handleViewDetail,
    handleApproveCommand,
    handleRejectCommand
  } = useAiExecutionPanelData();

  const columns = buildColumns(handleViewDetail);

  return (
    <div className="ai-execution-panel">
      <Card
        title={`待您审批的AI建议 (${pendingCommands.length})`}
        extra={
          <Button
            type="link"
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
            title={error}
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
              emptyDescription="暂无数据"
              pagination={{
                defaultPageSize: readPageSize(10),
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
      <DetailDrawer
        selectedCommand={selectedCommand}
        open={showDetail}
        executing={executing}
        onClose={() => setShowDetail(false)}
        onApprove={handleApproveCommand}
        onReject={handleRejectCommand}
      />

      {/* ===== 执行结果模态框 ===== */}
      <ResultModal
        executeResult={executeResult}
        open={showResult}
        onClose={() => setShowResult(false)}
      />
    </div>
  );
}
