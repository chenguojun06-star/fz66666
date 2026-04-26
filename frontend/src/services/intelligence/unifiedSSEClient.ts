export type SseEventType =
  | 'thinking'
  | 'tool_call'
  | 'tool_result'
  | 'answer'
  | 'follow_up_actions'
  | 'critic_thinking'
  | 'stuck_detected'
  | 'token_budget_exceeded'
  | 'max_iterations_exceeded'
  | 'plan_mode'
  | 'error'
  | 'done'
  | 'graph_start'
  | 'node_done'
  | 'graph_done'
  | 'graph_error'
  | 'heartbeat';

export interface SseEvent<T = unknown> {
  event: SseEventType;
  data: T;
  id?: string;
}

export interface ThinkingData {
  iteration: number;
  message: string;
}

export interface ToolCallData {
  tool: string;
  arguments: Record<string, unknown>;
}

export interface ToolResultData {
  tool: string;
  success: boolean;
  summary: string;
}

export interface AnswerData {
  content: string;
  commandId: string;
}

export interface ErrorData {
  message: string;
}

export type SseEventHandler = (event: SseEvent) => void;

export interface UnifiedSSEClientOptions {
  url: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  heartbeatIntervalMs?: number;
  onEvent?: SseEventHandler;
  onError?: (error: Error) => void;
  onDone?: () => void;
}

export class UnifiedSSEClient {
  private controller: AbortController | null = null;
  private lastActivityMs = 0;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private readonly options: Required<Pick<UnifiedSSEClientOptions, 'timeoutMs' | 'heartbeatIntervalMs'>> & Omit<UnifiedSSEClientOptions, 'timeoutMs' | 'heartbeatIntervalMs'>;

  constructor(options: UnifiedSSEClientOptions) {
    this.options = {
      ...options,
      timeoutMs: options.timeoutMs ?? 120_000,
      heartbeatIntervalMs: options.heartbeatIntervalMs ?? 15_000,
    };
  }

  async connect(): Promise<void> {
    this.disconnect();
    this.controller = new AbortController();
    this.lastActivityMs = Date.now();

    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('authToken') || '' : '';
    const headers: Record<string, string> = {
      ...this.options.headers,
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const response = await fetch(this.options.url, {
        headers,
        signal: this.controller.signal,
      });

      if (!response.ok) {
        throw new Error(`SSE connection failed: ${response.status}`);
      }

      this.startHeartbeatMonitor();
      await this.readStream(response);
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      const error = err instanceof Error ? err : new Error(String(err));
      this.options.onError?.(error);
    } finally {
      this.disconnect();
    }
  }

  disconnect(): void {
    if (this.controller) {
      this.controller.abort();
      this.controller = null;
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private async readStream(response: Response): Promise<void> {
    const reader = response.body?.getReader();
    if (!reader) throw new Error('No readable stream');

    const decoder = new TextDecoder();
    let buffer = '';
    let currentEvent = '';
    let currentData = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      this.lastActivityMs = Date.now();

      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('event: ')) {
          currentEvent = line.slice(7).trim();
        } else if (line.startsWith('data: ')) {
          currentData += line.slice(6);
        } else if (line.startsWith('id: ')) {
          // event id, ignored for now
        } else if (line.startsWith(': ')) {
          // comment (heartbeat), reset activity
          this.lastActivityMs = Date.now();
        } else if (line === '') {
          if (currentEvent && currentData) {
            this.dispatchEvent(currentEvent, currentData);
          }
          currentEvent = '';
          currentData = '';
        }
      }
    }

    if (currentEvent && currentData) {
      this.dispatchEvent(currentEvent, currentData);
    }
  }

  private dispatchEvent(eventName: string, rawData: string): void {
    try {
      const data = JSON.parse(rawData);
      const event: SseEvent = { event: eventName as SseEventType, data };
      this.options.onEvent?.(event);

      if (eventName === 'done') {
        this.options.onDone?.();
      }
    } catch {
      const event: SseEvent = { event: eventName as SseEventType, data: rawData };
      this.options.onEvent?.(event);
    }
  }

  private startHeartbeatMonitor(): void {
    this.heartbeatTimer = setInterval(() => {
      const elapsed = Date.now() - this.lastActivityMs;
      if (elapsed > this.options.timeoutMs) {
        this.options.onError?.(new Error(`SSE timeout: no activity for ${elapsed}ms`));
        this.disconnect();
      }
    }, this.options.heartbeatIntervalMs);
  }
}

export function createAgentSSEClient(
  url: string,
  handlers: {
    onThinking?: (data: ThinkingData) => void;
    onToolCall?: (data: ToolCallData) => void;
    onToolResult?: (data: ToolResultData) => void;
    onAnswer?: (data: AnswerData) => void;
    onError?: (data: ErrorData) => void;
    onDone?: () => void;
    onFollowUpActions?: (data: { actions: unknown[] }) => void;
  }
): UnifiedSSEClient {
  return new UnifiedSSEClient({
    url,
    onEvent: (event) => {
      switch (event.event) {
        case 'thinking':
          handlers.onThinking?.(event.data as ThinkingData);
          break;
        case 'tool_call':
          handlers.onToolCall?.(event.data as ToolCallData);
          break;
        case 'tool_result':
          handlers.onToolResult?.(event.data as ToolResultData);
          break;
        case 'answer':
          handlers.onAnswer?.(event.data as AnswerData);
          break;
        case 'error':
          handlers.onError?.(event.data as ErrorData);
          break;
        case 'done':
          handlers.onDone?.();
          break;
        case 'follow_up_actions':
          handlers.onFollowUpActions?.(event.data as { actions: unknown[] });
          break;
      }
    },
    onError: (err) => {
      handlers.onError?.({ message: err.message });
    },
    onDone: handlers.onDone,
  });
}
