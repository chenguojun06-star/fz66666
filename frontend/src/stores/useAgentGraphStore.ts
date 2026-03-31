import { create } from 'zustand';

export interface GraphResult {
  route: string;
  confidenceScore: number;
  reflection: string;
  optimizationSuggestion: string;
  contextSummary: string;
  success: boolean;
  errorMessage?: string;
  executedAt: string;
  latencyMs: number;
  specialistResults?: Record<string, string>;
  nodeTrace?: string[];
  executionId?: string;
  digitalTwinSnapshot?: string;
}

export interface NodeEvent {
  node: string;
  data: Record<string, any>;
  time: number;
}

export interface HistoryItem {
  id: string;
  scene: string;
  route: string;
  confidenceScore: number;
  status: string;
  latencyMs: number;
  createTime: string;
  userFeedback?: number;
}

type StreamStatus = 'idle' | 'connecting' | 'streaming' | 'done' | 'error';

interface AgentGraphState {
  loading: boolean;
  result: GraphResult | null;
  error: string | null;
  scene: string;
  orderIds: string;
  question: string;
  streamStatus: StreamStatus;
  nodeEvents: NodeEvent[];
  history: HistoryItem[];
  historyLoading: boolean;
  activeTab: 'run' | 'history';
  setScene: (scene: string) => void;
  setOrderIds: (ids: string) => void;
  setQuestion: (q: string) => void;
  setActiveTab: (tab: 'run' | 'history') => void;
  runGraph: () => Promise<void>;
  runGraphStream: () => void;
  loadHistory: () => Promise<void>;
  submitFeedback: (executionId: string, score: number, note?: string) => Promise<void>;
  reset: () => void;
}

export const useAgentGraphStore = create<AgentGraphState>()((set, get) => ({
  loading: false,
  result: null,
  error: null,
  scene: 'full',
  orderIds: '',
  question: '',
  streamStatus: 'idle' as StreamStatus,
  nodeEvents: [],
  history: [],
  historyLoading: false,
  activeTab: 'run' as const,

  setScene: (scene) => set({ scene }),
  setOrderIds: (orderIds) => set({ orderIds }),
  setQuestion: (question) => set({ question }),
  setActiveTab: (activeTab) => set({ activeTab }),

  runGraph: async () => {
    const { scene, orderIds, question } = get();
    set({ loading: true, error: null, result: null, nodeEvents: [] });
    try {
      const { runMultiAgentGraph } = await import('@/services/intelligenceApi');
      const ids = orderIds.trim()
        ? orderIds.split(/[,，\s]+/).filter(Boolean)
        : [];
      const data: GraphResult = await runMultiAgentGraph({ scene, orderIds: ids, question });
      set({ result: data, loading: false });
    } catch (e: any) {
      set({ error: e?.message ?? '执行失败', loading: false });
    }
  },

  runGraphStream: () => {
    // 关闭上一个 EventSource 防止竞态泄漏
    const prev = (get() as any)._eventSource as EventSource | undefined;
    if (prev) { try { prev.close(); } catch { /* ignore */ } }
    const { scene, question } = get();
    set({ loading: true, error: null, result: null, nodeEvents: [], streamStatus: 'connecting' });
    const params = new URLSearchParams({ scene });
    if (question) params.set('question', question);
    const es = new EventSource(`/api/intelligence/multi-agent-graph/stream?${params}`);
    (set as any)({ _eventSource: es });
    es.addEventListener('graph_start', () => {
      set({ streamStatus: 'streaming' });
    });
    es.addEventListener('node_done', (e) => {
      try {
        const data = JSON.parse(e.data);
        set(s => ({ nodeEvents: [...s.nodeEvents, { node: data.node, data, time: Date.now() }] }));
      } catch { /* ignore */ }
    });
    es.addEventListener('graph_done', (e) => {
      try {
        const data = JSON.parse(e.data);
        const result: GraphResult = {
          route: data.route,
          confidenceScore: data.confidence,
          contextSummary: data.contextSummary,
          optimizationSuggestion: data.optimization,
          reflection: '',
          success: true,
          executedAt: new Date().toISOString(),
          latencyMs: data.latencyMs,
          specialistResults: data.specialistResults,
          nodeTrace: data.nodeTrace,
          executionId: data.executionId,
        };
        set({ result, loading: false, streamStatus: 'done' });
      } catch { /* ignore */ }
      es.close();
    });
    es.addEventListener('graph_error', (e) => {
      try {
        const data = JSON.parse(e.data);
        set({ error: data.error || '执行失败', loading: false, streamStatus: 'error' });
      } catch {
        set({ error: '执行失败', loading: false, streamStatus: 'error' });
      }
      es.close();
    });
    es.onerror = () => {
      set({ error: 'SSE 连接断开', loading: false, streamStatus: 'error' });
      es.close();
    };
  },

  loadHistory: async () => {
    set({ historyLoading: true });
    try {
      const { getGraphHistory } = await import('@/services/intelligenceApi');
      const data = await getGraphHistory(1, 20);
      set({ history: data ?? [], historyLoading: false });
    } catch {
      set({ historyLoading: false });
    }
  },

  submitFeedback: async (executionId, score, note) => {
    const { submitGraphFeedback } = await import('@/services/intelligenceApi');
    await submitGraphFeedback(executionId, score, note);
  },

  reset: () => set({ result: null, error: null, loading: false, nodeEvents: [], streamStatus: 'idle' }),
}));
