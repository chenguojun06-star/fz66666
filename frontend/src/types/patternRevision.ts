/**
 * 纸样修改记录类型定义
 */

export interface PatternRevision {
  id?: string;
  styleId?: string;
  styleNo?: string;
  revisionNo?: string;
  revisionType?: 'MINOR' | 'MAJOR' | 'URGENT';
  revisionReason?: string;
  revisionContent?: string;
  beforeChanges?: string;
  afterChanges?: string;
  attachmentUrls?: string;
  status?: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'COMPLETED';
  revisionDate?: string;
  expectedCompleteDate?: string;
  actualCompleteDate?: string;
  maintainerId?: string;
  maintainerName?: string;
  maintainTime?: string;
  submitterId?: string;
  submitterName?: string;
  submitTime?: string;
  approverId?: string;
  approverName?: string;
  approvalTime?: string;
  approvalComment?: string;
  patternMakerId?: string;
  patternMakerName?: string;
  createTime?: string;
  updateTime?: string;
  createBy?: string;
  updateBy?: string;
  remark?: string;
  factoryId?: string;
}

export interface PatternRevisionQueryParams {
  page?: number;
  pageSize?: number;
  styleNo?: string;
  status?: string;
  revisionType?: string;
  maintainerName?: string;
}

// 修改类型选项
export const REVISION_TYPE_OPTIONS = [
  { value: 'MINOR', label: '小改', color: 'blue' },
  { value: 'MAJOR', label: '大改', color: 'orange' },
  { value: 'URGENT', label: '紧急修改', color: 'red' },
];

// 状态选项
export const REVISION_STATUS_OPTIONS = [
  { value: 'DRAFT', label: '草稿', color: 'default' },
  { value: 'SUBMITTED', label: '已提交', color: 'processing' },
  { value: 'APPROVED', label: '已审核', color: 'success' },
  { value: 'REJECTED', label: '已拒绝', color: 'error' },
  { value: 'COMPLETED', label: '已完成', color: 'success' },
];

// 获取修改类型标签
export const getRevisionTypeLabel = (type: string): string => {
  const option = REVISION_TYPE_OPTIONS.find(opt => opt.value === type);
  return option ? option.label : type;
};

// 获取状态标签
export const getRevisionStatusLabel = (status: string): string => {
  const option = REVISION_STATUS_OPTIONS.find(opt => opt.value === status);
  return option ? option.label : status;
};

// 获取状态颜色
export const getRevisionStatusColor = (status: string): string => {
  const option = REVISION_STATUS_OPTIONS.find(opt => opt.value === status);
  return option ? option.color : 'default';
};
