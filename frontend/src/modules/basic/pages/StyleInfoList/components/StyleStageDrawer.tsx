import React from 'react';
import { Button, Drawer, Progress, QRCode, Skeleton, Tag } from 'antd';
import SampleProcessList from './SampleProcessList';
import SampleScanRecordsTable from './SampleScanRecordsTable';
import PatternRemarkPreview from './PatternRemarkPreview';
import { STATUS_COLORS, STATUS_LABELS } from './useSampleProcurementQuickActions';
import type { UseStyleTableViewDataReturn } from './useStyleTableViewData';

type StyleStageDrawerProps = Pick<
  UseStyleTableViewDataReturn,
  | 'selectedStage'
  | 'setSelectedStage'
  | 'expandedParentStage'
  | 'setExpandedParentStage'
  | 'panel'
  | 'sample'
  | 'confirm'
  | 'sampleProcessProgress'
  | 'procurement'
  | 'setRemarkTarget'
  | 'setPatternRemarkTarget'
  | 'onRefresh'
>;

/**
 * 样衣阶段详情 Drawer（原 StyleTableView 中最大的渲染块）。
 * 包含：阶段摘要、操作按钮、扫码记录、备注日志、快捷采购表、样衣生产信息、审核/入库信息。
 */
const StyleStageDrawer: React.FC<StyleStageDrawerProps> = ({
  selectedStage,
  setSelectedStage,
  setExpandedParentStage,
  panel,
  sample,
  confirm,
  sampleProcessProgress,
  procurement,
  setRemarkTarget,
  setPatternRemarkTarget,
  onRefresh,
}) => {
  const handleClose = () => {
    setSelectedStage(null);
    setExpandedParentStage(null);
  };

  return (
    <Drawer
      open={Boolean(selectedStage)}
      title={selectedStage ? `${selectedStage.record.styleNo} · ${selectedStage.stage.label}` : ''}
      onClose={handleClose}
      size="large"
      styles={{ wrapper: { width: '85%' }, body: { padding: 16 } }}
      footer={
        <Button key="close" onClick={handleClose}>
          关闭
        </Button>
      }
      destroyOnHidden
    >
      {selectedStage && panel.selectedStageTag ? (
        <div className="style-smart-stage-modal">
          {(selectedStage.stage.key === 'sample' && sample.sampleStageSummary) || (selectedStage.stage.key === 'confirm' && confirm.confirmStageSummary) ? (
            <div className="style-smart-stage-modal__summary style-smart-stage-modal__summary--compact">
              <div className="style-smart-stage-modal__meta">
                <Tag color={(selectedStage.stage.key === 'sample' ? sample.sampleStageSummary : confirm.confirmStageSummary)?.tag.color}>
                  {(selectedStage.stage.key === 'sample' ? sample.sampleStageSummary : confirm.confirmStageSummary)?.tag.text}
                </Tag>
                <div className="style-smart-stage-modal__helper">
                  {(selectedStage.stage.key === 'sample' ? sample.sampleStageSummary : confirm.confirmStageSummary)?.helper}
                </div>
                <div className="style-smart-stage-modal__time">
                  {(selectedStage.stage.key === 'sample' ? sample.sampleStageSummary : confirm.confirmStageSummary)?.time}
                </div>
              </div>
            </div>
          ) : (
            <div className="style-smart-stage-modal__summary">
              <div className="style-smart-stage-modal__score">
                <span>{selectedStage.stage.progress}%</span>
                <Progress
                  percent={selectedStage.stage.progress}
                  showInfo={false}

                  strokeColor="var(--color-primary)"
                />
              </div>
              <div className="style-smart-stage-modal__meta">
                <Tag color={panel.selectedStageTag.color}>{panel.selectedStageTag.text}</Tag>
                <div className="style-smart-stage-modal__helper">{selectedStage.stage.helper}</div>
                <div className="style-smart-stage-modal__time">{selectedStage.stage.timeLabel}</div>
              </div>
            </div>
          )}
          <div className="style-smart-stage-modal__insight">{panel.selectedStageInsightText}</div>
          <div className="style-smart-stage-modal__actions">
            {panel.selectedStageActions.map((action) => (
              <Button
                key={action.key}
                type={action.type}
                danger={action.danger}
                disabled={action.disabled}
                loading={(sample.sampleActionLoading && ['receive-sample', 'update-progress'].includes(action.key)) || (confirm.reviewSaving && action.key === 'review')}
                onClick={action.onClick}
              >
                {action.label}
              </Button>
            ))}
          </div>
          {selectedStage.stage.key !== 'sample' && selectedStage.stage.key !== 'confirm' ? (
            <>
              <div className="style-smart-stage-modal__details">
                {selectedStage.stage.details.map((item) => (
                  <div key={item} className="style-smart-stage-modal__detail-item">
                    {item}
                  </div>
                ))}
              </div>
              {(selectedStage.stage.key === 'procurement' || selectedStage.stage.key === 'cutting' || selectedStage.stage.key === 'secondary' || selectedStage.stage.key === 'sewing' || selectedStage.stage.key === 'tail' || selectedStage.stage.key === 'warehousing') && sample.sampleSnapshot ? (
                <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid var(--color-border-light)' }}>
                  <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '10px', color: 'var(--color-text-primary)' }}>
                    扫码记录
                    <span style={{ fontWeight: 400, fontSize: '12px', color: 'var(--color-text-secondary)', marginLeft: 8 }}>
                      — {selectedStage.stage.label} 环节
                    </span>
                  </div>
                  <SampleScanRecordsTable
                    patternId={sample.sampleSnapshot.id}
                    stageKey={selectedStage.stage.key}
                  />
                </div>
              ) : null}
              {sample.sampleSnapshot ? (
                <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid var(--color-border-light)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-primary)' }}>
                      备注日志
                      <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--color-text-secondary)', marginLeft: 8 }}>
                        — 样衣 {sample.sampleSnapshot.id}
                      </span>
                    </div>
                    <Button
                      size="small"
                      onClick={() => setPatternRemarkTarget({ open: true, patternId: String(sample.sampleSnapshot?.id || '') })}
                    >
                      查看全部
                    </Button>
                  </div>
                  <PatternRemarkPreview patternId={String(sample.sampleSnapshot.id)} />
                </div>
              ) : null}
              {selectedStage.stage.key === 'procurement' ? (
                <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid var(--color-border-light)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-primary)' }}>
                      快捷采购
                      <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--color-text-secondary)', marginLeft: 8 }}>
                        — 款号 {selectedStage.record.styleNo}
                      </span>
                    </div>
                    <Button size="small" onClick={procurement.reload} loading={procurement.loading}>
                      刷新
                    </Button>
                  </div>
                  {procurement.loading ? (
                    <Skeleton active paragraph={{ rows: 3 }} />
                  ) : procurement.error ? (
                    <div style={{ color: 'var(--color-error)', padding: '8px 0' }}>{procurement.error}</div>
                  ) : procurement.items.length === 0 ? (
                    <div style={{ color: 'var(--color-text-tertiary)', padding: '16px', textAlign: 'center', background: 'var(--color-bg-light)', borderRadius: 6 }}>
                      暂无采购物料，请先在BOM中配置物料并生成采购单
                    </div>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                          <tr style={{ background: 'var(--color-bg-light)', borderBottom: '2px solid var(--color-border-light)' }}>
                            <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600 }}>物料名称</th>
                            <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600 }}>规格</th>
                            <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>采购数量</th>
                            <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600 }}>供应商</th>
                            <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600 }}>状态</th>
                            <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600 }}>操作</th>
                          </tr>
                        </thead>
                        <tbody>
                          {procurement.items.map((item) => (
                            <tr key={item.id} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                              <td style={{ padding: '8px 12px' }}>{item.materialName}</td>
                              <td style={{ padding: '8px 12px', color: 'var(--color-text-secondary)' }}>{item.specifications || '-'}</td>
                              <td style={{ padding: '8px 12px', textAlign: 'right' }}>{item.purchaseQuantity} {item.unit}</td>
                              <td style={{ padding: '8px 12px', color: 'var(--color-text-secondary)' }}>{item.supplierName || '-'}</td>
                              <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                                <Tag color={STATUS_COLORS[item.status] ?? 'default'}>{STATUS_LABELS[item.status] ?? '未知'}</Tag>
                              </td>
                              <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                                {item.status === 'pending' ? (
                                  <Button size="small" type="primary" onClick={() => procurement.receiveItem(item.id)}>
                                    领取
                                  </Button>
                                ) : (item.status === 'received' || item.status === 'awaiting_confirm') ? (
                                  <Button size="small" type="primary" onClick={() => procurement.completeItem(item.id)}>
                                    确认完成
                                  </Button>
                                ) : null}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ) : null}
            </>
          ) : null}
          {selectedStage.stage.key === 'sample' ? (
            <div className="style-smart-stage-modal__panel">
              <div className="style-smart-stage-modal__panel-title">样衣生产信息</div>
              {sample.sampleSnapshotLoading ? (
                <Skeleton active paragraph={{ rows: 4 }} />
              ) : sample.sampleSnapshot ? (
                <>
                  <div className="style-smart-stage-modal__facts">
                    <div className="style-smart-stage-modal__fact">
                      <span>领取人</span>
                      <strong
                        style={{ cursor: sample.sampleReceiverLabel !== '-' ? 'pointer' : 'default', color: sample.sampleReceiverLabel !== '-' ? 'var(--color-primary)' : undefined, textDecoration: sample.sampleReceiverLabel !== '-' ? 'underline' : undefined }}
                        onClick={() => sample.sampleReceiverLabel !== '-' && setRemarkTarget({ open: true, styleNo: selectedStage?.record?.styleNo || '', defaultRole: '领取人 — ' + sample.sampleReceiverLabel })}
                      >{sample.sampleReceiverLabel}</strong>
                    </div>
                    <div className="style-smart-stage-modal__fact">
                      <span>领取时间</span>
                      <strong>{sample.sampleReceiveTimeLabel}</strong>
                    </div>
                    <div className="style-smart-stage-modal__fact">
                      <span>完成时间</span>
                      <strong>{sample.sampleCompletedTimeLabel}</strong>
                    </div>
                    <div className="style-smart-stage-modal__fact">
                      <span>颜色</span>
                      <strong>
                        {sample.sampleSnapshot?.colors && sample.sampleSnapshot.colors.length > 0
                          ? sample.sampleSnapshot.colors.map((c, i) => (
                              <Tag key={i} color="blue" style={{ marginRight: 4 }}>{c}</Tag>
                            ))
                          : sample.sampleSnapshot?.color
                            ? <Tag color="blue">{sample.sampleSnapshot.color}</Tag>
                            : '-'}
                      </strong>
                    </div>
                    <div className="style-smart-stage-modal__fact">
                      <span>数量</span>
                      <strong>{sample.sampleSnapshot?.quantity != null ? sample.sampleSnapshot.quantity : '-'}</strong>
                    </div>
                  </div>
                  <div style={{ marginTop: 12, padding: '10px 0', borderTop: '1px solid var(--color-border-light)', display: 'flex', alignItems: 'center', gap: 14 }}>
                    <QRCode
                      value={JSON.stringify({ type: 'pattern', id: sample.sampleSnapshot.id })}
                      size={80}
                    />
                    <div style={{ fontSize: 14, color: 'var(--color-text-tertiary)', lineHeight: 1.8 }}>
                      <div style={{ fontWeight: 500, color: '#595959' }}>工人扫码领取/完成</div>
                      <div>样衣单号: {sample.sampleSnapshot.id}</div>
                    </div>
                  </div>

                  {sample.shouldShowSampleStageProgress ? (
                    <div style={{ marginTop: '16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '14px', fontWeight: 500 }}>样衣生产进度</span>
                        <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-primary)' }}>
                          {Math.round(sample.sampleStageProgressItems.reduce((sum, item) => sum + item.percent, 0) / sample.sampleStageProgressItems.length)}%
                        </span>
                      </div>
                      <Progress
                        percent={Math.round(sample.sampleStageProgressItems.reduce((sum, item) => sum + item.percent, 0) / sample.sampleStageProgressItems.length)}
                        showInfo={false}
                        size={8}
                        strokeColor={sample.sampleStageProgressItems.reduce((sum, item) => sum + item.percent, 0) / sample.sampleStageProgressItems.length >= 100 ? 'var(--color-success)' : 'var(--color-primary)'}
                      />
                    </div>
                  ) : null}

                  {/* 子工序表格 - 与大货一致的表格展示 */}
                  <div style={{ marginTop: 16 }}>
                    <SampleProcessList
                      stages={sampleProcessProgress.stages}
                      loading={sampleProcessProgress.loading}
                      needsConfig={sampleProcessProgress.needsConfig}
                      orderId={sampleProcessProgress.orderId}
                      orderNo={sampleProcessProgress.orderNo}
                      styleNo={selectedStage?.record?.styleNo}
                      color={sample.sampleSnapshot?.color}
                      quantity={sample.sampleSnapshot?.quantity}
                      size={sample.sampleSnapshot?.size || sample.sampleSnapshot?.sizeColorConfig}
                      receiver={sample.sampleReceiverLabel !== '-' ? sample.sampleReceiverLabel : ''}
                      receiveTime={sample.sampleReceiveTimeLabel !== '待启动' ? sample.sampleReceiveTimeLabel : ''}
                      patternProductionId={sample.sampleSnapshot?.id}
                      onCompleteProcess={sampleProcessProgress.completeProcess}
                      onRefresh={() => { sampleProcessProgress.refresh(); onRefresh(); }}
                    />
                  </div>
                </>
              ) : (
                <div className="style-smart-stage-modal__empty">当前还没有同步到样衣生产快照数据</div>
              )}
            </div>
          ) : null}
          {selectedStage.stage.key === 'confirm' ? (
            <div className="style-smart-stage-modal__panel">
              <div className="style-smart-stage-modal__panel-title">审核 / 入库信息</div>
              <div className="style-smart-stage-modal__facts">
                <div className="style-smart-stage-modal__fact">
                  <span>审核状态</span>
                  <strong>{confirm.confirmReviewStatusLabel}</strong>
                </div>
                <div className="style-smart-stage-modal__fact">
                  <span>审核人</span>
                  <strong
                    style={{ cursor: confirm.confirmReviewerLabel !== '-' ? 'pointer' : 'default', color: confirm.confirmReviewerLabel !== '-' ? 'var(--color-primary)' : undefined, textDecoration: confirm.confirmReviewerLabel !== '-' ? 'underline' : undefined }}
                    onClick={() => confirm.confirmReviewerLabel !== '-' && setRemarkTarget({ open: true, styleNo: selectedStage?.record?.styleNo || '', defaultRole: '审核人 — ' + confirm.confirmReviewerLabel })}
                  >{confirm.confirmReviewerLabel}</strong>
                </div>
                <div className="style-smart-stage-modal__fact">
                  <span>审核时间</span>
                  <strong>{confirm.confirmReviewTimeLabel}</strong>
                </div>
                <div className="style-smart-stage-modal__fact">
                  <span>入库时间</span>
                  <strong>{confirm.confirmInboundTimeLabel}</strong>
                </div>
              </div>
              {(selectedStage.record.sampleReviewComment || selectedStage.stage.details.length > 0) ? (
                <div className="style-smart-stage-modal__details style-smart-stage-modal__details--compact">
                  {selectedStage.record.sampleReviewComment ? (
                    <div className="style-smart-stage-modal__detail-item">
                      审核意见：{String(selectedStage.record.sampleReviewComment)}
                    </div>
                  ) : null}
                  {!selectedStage.record.sampleReviewComment && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', alignItems: 'center' }}>
                      {selectedStage.stage.details.map((item) => (
                        <span key={item} className="style-smart-stage-modal__detail-item">
                          {item}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </Drawer>
  );
};

export default StyleStageDrawer;
