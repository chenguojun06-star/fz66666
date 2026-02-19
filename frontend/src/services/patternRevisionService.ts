import api from '../utils/api';
import { PatternRevision, PatternRevisionQueryParams } from '../types/patternRevision';

const PATTERN_REVISION_API = '/pattern-revision';

/**
 * 纸样修改记录服务
 */
const patternRevisionService = {
  /**
   * 分页查询纸样修改记录列表
   */
  list(params: PatternRevisionQueryParams) {
    return api.get<{
      list: PatternRevision[];
      total: number;
    }>(`${PATTERN_REVISION_API}/list`, { params });
  },

  /**
   * 根据ID获取纸样修改记录详情
   */
  getById(id: string) {
    return api.get<PatternRevision>(`${PATTERN_REVISION_API}/${id}`);
  },

  /**
   * 创建纸样修改记录
   */
  create(data: Partial<PatternRevision>) {
    return api.post<PatternRevision>(PATTERN_REVISION_API, data);
  },

  /**
   * 更新纸样修改记录
   */
  update(id: string, data: Partial<PatternRevision>) {
    return api.put<PatternRevision>(`${PATTERN_REVISION_API}/${id}`, data);
  },

  /**
   * 删除纸样修改记录
   */
  delete(id: string) {
    return api.delete(`${PATTERN_REVISION_API}/${id}`);
  },

  /**
   * 提交审核
   */
  submit(id: string) {
    return api.post<PatternRevision>(`${PATTERN_REVISION_API}/${id}/workflow`, undefined, { params: { action: 'submit' } });
  },

  /**
   * 审核通过
   */
  approve(id: string) {
    return api.post<PatternRevision>(`${PATTERN_REVISION_API}/${id}/workflow`, undefined, { params: { action: 'approve' } });
  },

  /**
   * 审核拒绝
   */
  reject(id: string, comment: string) {
    return api.post<PatternRevision>(`${PATTERN_REVISION_API}/${id}/workflow`, { comment }, { params: { action: 'reject' } });
  },

  /**
   * 完成修改
   */
  complete(id: string) {
    return api.post<PatternRevision>(`${PATTERN_REVISION_API}/${id}/workflow`, undefined, { params: { action: 'complete' } });
  },

  /**
   * 生成下一个版本号
   */
  generateRevisionNo(styleNo: string) {
    return api.get<{ revisionNo: string }>(`${PATTERN_REVISION_API}/generate-revision-no`, {
      params: { styleNo },
    });
  },
};

export default patternRevisionService;
