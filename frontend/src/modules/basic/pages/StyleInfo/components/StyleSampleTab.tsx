import React from 'react';
const StyleSampleTab: React.FC = () => {

  const bomDetailColumns = useMemo(() => {
    return [
      {
        title: '类型',
        dataIndex: 'materialType',
        key: 'materialType',
        width: 110,
        render: (v: unknown) => bomMaterialTypeLabel(v),
      },
      { title: '物料编码', dataIndex: 'materialCode', key: 'materialCode', width: 120 },
      { title: '物料名称', dataIndex: 'materialName', key: 'materialName', width: 160, ellipsis: true },
      { title: '颜色', dataIndex: 'color', key: 'color', width: 90 },
      { title: '规格', dataIndex: 'specification', key: 'specification', width: 140, ellipsis: true },
      { title: '尺码', dataIndex: 'size', key: 'size', width: 90 },
      { title: '单位', dataIndex: 'unit', key: 'unit', width: 90 },
      {
        title: '单件用量',
        dataIndex: 'usageAmount',
        key: 'usageAmount',
        width: 110,
        align: 'right' as const,
        render: (v: unknown) => {
          const n = typeof v === 'number' ? v : Number(v);
          return Number.isFinite(n) ? n : '-';
        },
      },
      {
        title: '损耗率(%)',
        dataIndex: 'lossRate',
        key: 'lossRate',
        width: 110,
        align: 'right' as const,
        render: (v: unknown) => {
          const n = typeof v === 'number' ? v : Number(v);
          return Number.isFinite(n) ? n : '-';
        },
      },
      {
        title: '单价',
        dataIndex: 'unitPrice',
        key: 'unitPrice',
        width: 100,
        align: 'right' as const,
        render: (v: unknown) => {
          const n = typeof v === 'number' ? v : Number(v);
          return Number.isFinite(n) ? n.toFixed(2) : '-';
        },
      },
      {
        title: '总价',
        dataIndex: 'totalPrice',
        key: 'totalPrice',
        width: 100,
        align: 'right' as const,
        render: (v: unknown) => {
          const n = typeof v === 'number' ? v : Number(v);
          return Number.isFinite(n) ? n.toFixed(2) : '-';
        },
      },
      { title: '供应商', dataIndex: 'supplier', key: 'supplier', width: 160, ellipsis: true },
      { title: '备注', dataIndex: 'remark', key: 'remark', width: 160, ellipsis: true },
    ];
  }, []);

  const columns = useMemo(() => {
    return [
      { title: '款号', dataIndex: 'styleNo', key: 'styleNo', width: 200 },
      { title: '颜色', dataIndex: 'color', key: 'color', width: 120 },
      {
        title: 'BOM资料',
        dataIndex: 'bom',
        key: 'bom',
        render: () => {
          const totalText = `¥${bomSummary.total.toFixed(2)}`;
          return (
            <Space size={8} wrap>
              <span>{`${bomSummary.count}条 / ${totalText}`}</span>
              <Button type="link" size="small" disabled={!bomSummary.count} onClick={() => setBomDetailOpen(true)}>
                查看明细
              </Button>
            </Space>
          );
        },
      },
      {
        title: '纸样附件',
        dataIndex: 'patternFiles',
        key: 'patternFiles',
        render: () => {
          if (!patternAttachments.length) return '-';
          return (
            <Space wrap>
              {patternAttachments.slice(0, 5).map((f) => (
                <a key={String(f.id)} href={f.fileUrl} target="_blank" rel="noopener noreferrer">
                  {f.fileName}
                </a>
              ))}
              {patternAttachments.length > 5 ? <span>等{patternAttachments.length}个</span> : null}
            </Space>
          );
        },
      },
      { title: '领取开始时间', dataIndex: 'startTime', key: 'startTime', width: 190 },
      { title: '样板完成时间', dataIndex: 'completeTime', key: 'completeTime', width: 190 },
      {
        title: '操作',
        key: 'action',
        width: 220,
        render: () => {
          const actions = locked
            ? (canRollback
              ? [
                {
                  key: 'maintenance',
                  label: '维护',
                  title: '维护',
                  icon: <ToolOutlined />,
                  danger: true,
                  disabled: saving,
                  onClick: openMaintenance,
                  primary: true,
                },
              ]
              : [])
            : [
              {
                key: 'start',
                label: '领取开始',
                title: '领取开始',
                icon: <PlayCircleOutlined />,
                disabled: saving,
                onClick: () => post(`/style/info/${styleId}/sample/start`),
                primary: true,
              },
              {
                key: 'complete',
                label: '样板完成',
                title: '样板完成',
                icon: <CheckCircleOutlined />,
                disabled: saving,
                onClick: () => post(`/style/info/${styleId}/sample/complete`),
                primary: true,
              },
              ...(canRollback
                ? [
                  {
                    key: 'maintenance',
                    label: '维护',
                    title: '维护',
                    icon: <ToolOutlined />,
                    danger: true,
                    disabled: saving,
                    onClick: openMaintenance,
                  },
                ]
                : []),
            ];

          return <RowActions maxInline={3} actions={actions as Record<string, unknown>} />;
        },
      },
    ];
  }, [bomSummary, canRollback, locked, patternAttachments, post, saving, styleId]);

  return (
    <div>
      <Space style={{ marginBottom: 12 }} wrap>
        <span>样衣状态：</span>
        {statusTag}
        <span style={{ marginLeft: 12 }}>完成时间：{completedTimeText}</span>
      </Space>

      <ResizableModal
        title="BOM详细资料"
        open={bomDetailOpen}
        centered
        onCancel={() => setBomDetailOpen(false)}
        footer={
          <div className="modal-footer-actions">
            <Button onClick={() => setBomDetailOpen(false)}>关闭</Button>
          </div>
        }
        width={modalWidth}
        initialHeight={modalInitialHeight}
        scaleWithViewport
        destroyOnHidden
      >
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div ref={bomDetailTableWrapRef} style={{ flex: '1 1 auto', minHeight: 0 }}>
            <ResizableTable
              rowKey={(r: Record<string, unknown>) =>
                String(r?.id ?? `${r?.materialType || ''}-${r?.materialCode || ''}-${r?.color || ''}-${r?.size || ''}`)
              }
              columns={bomDetailColumns as Record<string, unknown>}
              dataSource={bomList}
              pagination={false}
              scroll={{ x: 'max-content', y: bomDetailTableScrollY }}
              size="small"
            />
          </div>
        </div>
      </ResizableModal>

      <ResizableTable
        columns={columns as Record<string, unknown>}
        dataSource={[
          {
            key: String(styleId),
            styleNo: String(styleNo || '').trim() || '-',
            color: String(color || '').trim() || '-',
            startTime: timeText(startTime),
            completeTime: completedTimeText,
          },
        ]}
        loading={loading}
        pagination={false}
      />
    </div>
  );
};

export default StyleSampleTab;
