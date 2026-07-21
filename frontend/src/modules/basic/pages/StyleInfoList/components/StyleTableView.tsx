import React from 'react';
import { Button, Empty } from 'antd';
import StandardPagination from '@/components/common/StandardPagination';
import { StyleInfo } from '@/types/style';
import type { FieldConfigItem } from '@/hooks/useFieldConfig';
import useStyleTableViewData from './useStyleTableViewData';
import StyleTableRow from './StyleTableRow';
import StyleStageDrawer from './StyleStageDrawer';
import StyleDevDrawer from './StyleDevDrawer';
import StyleProgressEditorModal from './StyleProgressEditorModal';
import StyleReviewModal from './StyleReviewModal';
import StyleTableMiscModals from './StyleTableMiscModals';

interface StyleTableViewProps {
  data: StyleInfo[];
  stockStateMap?: Record<string, boolean>;
  loading: boolean;
  total: number;
  pageSize: number;
  currentPage: number;
  onPageChange: (page: number, pageSize: number) => void;
  onScrap: (id: string) => void;
  onPrint: (record: StyleInfo) => void;
  onMaintenance: (record: StyleInfo) => void;
  categoryOptions: { label: string; value: string }[];
  onRefresh: () => void;
  focusedStyleId?: string | null;
  dateSortAsc?: boolean;
  customFields?: FieldConfigItem[];
}


/**
 * 样衣列表"智能时间线"视图。
 *
 * 拆分结构（原 928 行 → 主文件 ≤ 500 行）：
 * - useStyleTableViewData     — 状态/Hook 编排/派生行数据
 * - StyleTableView.helpers    — 纯函数：行数据构建、操作按钮构建、字典转换
 * - StyleTableRow             — 单行卡片（封面/进度/时间线/操作按钮）
 * - StyleStageDrawer          — 阶段详情 Drawer（最大子组件）
 * - StyleDevDrawer            — 开发工作台 Drawer
 * - StyleProgressEditorModal  — 样衣进度编辑弹窗
 * - StyleReviewModal          — 审核结论弹窗
 * - StyleTableMiscModals      — 复制/备注/指派弹窗集合
 * - PatternRemarkPreview      — 样衣备注日志预览
 *
 * 主组件只负责：调用 Hook + 组合子组件 + 列表/分页布局。
 */
const StyleTableView: React.FC<StyleTableViewProps> = ({
  data,
  stockStateMap,
  loading,
  total,
  pageSize,
  currentPage,
  onPageChange,
  onScrap,
  onPrint,
  onMaintenance,
  categoryOptions,
  onRefresh,
  focusedStyleId,
  dateSortAsc = false,
  customFields = [],
}) => {
  const ctx = useStyleTableViewData({
    data,
    stockStateMap,
    categoryOptions,
    customFields,
    dateSortAsc,
    focusedStyleId,
    onScrap,
    onPrint,
    onMaintenance,
    onRefresh,
  });

  const { navigate, rows } = ctx;

  return (
    <>
      <div className="style-smart-list style-smart-list--style-info">
        {data.length === 0 && !loading ? (
          <div className="style-smart-list__empty">
            <Empty description="暂无样衣数据">
              <Button type="primary" onClick={() => navigate('/style-info/new')}>去创建第一款</Button>
            </Empty>
          </div>
        ) : (
          rows.map((row) => (
            <StyleTableRow
              key={row.rowKey}
              row={row}
              focusedStyleId={focusedStyleId}
              isSupervisorOrAbove={ctx.isSupervisorOrAbove}
              callbacks={{
                onPrint,
                onScrap,
                onMaintenance,
                setRemarkTarget: ctx.setRemarkTarget,
                setCopySource: ctx.setCopySource,
                setCopyModalOpen: ctx.setCopyModalOpen,
                setSelectedStage: ctx.setSelectedStage,
                setDevelopmentDrawerRecord: ctx.setDevelopmentDrawerRecord,
                setDevelopmentDrawerSection: ctx.setDevelopmentDrawerSection,
              }}
            />
          ))
        )}

        <div className="style-smart-list__pagination">
          <StandardPagination
            current={currentPage}
            pageSize={pageSize}
            total={total}
            onChange={onPageChange}
          />
        </div>
      </div>

      <StyleStageDrawer
        selectedStage={ctx.selectedStage}
        setSelectedStage={ctx.setSelectedStage}
        expandedParentStage={ctx.expandedParentStage}
        setExpandedParentStage={ctx.setExpandedParentStage}
        panel={ctx.panel}
        sample={ctx.sample}
        confirm={ctx.confirm}
        sampleProcessProgress={ctx.sampleProcessProgress}
        procurement={ctx.procurement}
        setRemarkTarget={ctx.setRemarkTarget}
        setPatternRemarkTarget={ctx.setPatternRemarkTarget}
        onRefresh={onRefresh}
      />

      <StyleDevDrawer
        open={Boolean(ctx.developmentDrawerRecord)}
        record={ctx.developmentDrawerRecord}
        section={ctx.developmentDrawerSection}
        onClose={() => ctx.setDevelopmentDrawerRecord(null)}
        onSync={onRefresh}
      />

      <StyleProgressEditorModal sample={ctx.sample} />

      <StyleReviewModal confirm={ctx.confirm} />

      <StyleTableMiscModals
        copyModalOpen={ctx.copyModalOpen}
        setCopyModalOpen={ctx.setCopyModalOpen}
        copySource={ctx.copySource}
        remarkTarget={ctx.remarkTarget}
        setRemarkTarget={ctx.setRemarkTarget}
        patternRemarkTarget={ctx.patternRemarkTarget}
        setPatternRemarkTarget={ctx.setPatternRemarkTarget}
        assigningData={ctx.assigningData}
        setAssigningData={ctx.setAssigningData}
        assignForm={ctx.assignForm}
        handleAssignPattern={ctx.handleAssignPattern}
        onRefresh={onRefresh}
      />
    </>
  );
};

export default React.memo(StyleTableView);
