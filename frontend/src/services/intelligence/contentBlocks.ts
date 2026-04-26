export type ContentBlock =
  | TextBlock
  | ThinkingBlock
  | ToolUseBlock
  | ToolResultBlock
  | ChartBlock
  | ActionCardBlock
  | InsightCardBlock
  | StepWizardBlock;

export interface TextBlock {
  type: 'text';
  text: string;
}

export interface ThinkingBlock {
  type: 'thinking';
  thinking: string;
}

export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultBlock {
  type: 'tool_result';
  toolUseId: string;
  content: string;
  isError?: boolean;
}

export interface ChartBlock {
  type: 'chart';
  chartType: 'bar' | 'line' | 'pie' | 'progress';
  title: string;
  data: unknown;
}

export interface ActionItem {
  label: string;
  type: string;
  params?: Record<string, unknown>;
}

export interface ActionCardBlock {
  type: 'action_card';
  title: string;
  desc: string;
  actions: ActionItem[];
}

export interface InsightCardBlock {
  type: 'insight_card';
  title: string;
  summary: string;
  severity: 'info' | 'warning' | 'critical';
  metadata?: Record<string, unknown>;
}

export interface StepItem {
  title: string;
  description: string;
  completed: boolean;
}

export interface StepWizardBlock {
  type: 'step_wizard';
  title: string;
  steps: StepItem[];
  currentStep: number;
}

export function parseContentBlocks(aiResponse: string): ContentBlock[] {
  if (!aiResponse) return [];

  const blocks: ContentBlock[] = [];
  let remaining = aiResponse;

  const extractBlock = (pattern: RegExp, parser: (json: string) => ContentBlock | null): void => {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(remaining)) !== null) {
      const block = parser(match[1].trim());
      if (block) blocks.push(block);
      remaining = remaining.replace(match[0], '');
    }
  };

  extractBlock(/【CHART】(.*?)【\/CHART】/gs, (json) => {
    try {
      const data = JSON.parse(json);
      return { type: 'chart', chartType: data.type || 'bar', title: data.title || '', data } as ChartBlock;
    } catch { return null; }
  });

  extractBlock(/【ACTIONS】(.*?)【\/ACTIONS】/gs, (json) => {
    try {
      const data = JSON.parse(json);
      const first = Array.isArray(data) ? data[0] : data;
      return {
        type: 'action_card',
        title: first?.title || '',
        desc: first?.desc || '',
        actions: (first?.actions || []).map((a: Record<string, unknown>) => ({
          label: a.label as string,
          type: a.type as string,
          params: a.params as Record<string, unknown> | undefined,
        })),
      } as ActionCardBlock;
    } catch { return null; }
  });

  extractBlock(/【INSIGHT_CARDS】(.*?)【\/INSIGHT_CARDS】/gs, (json) => {
    try {
      const data = JSON.parse(json);
      return {
        type: 'insight_card',
        title: data.title || '',
        summary: data.summary || '',
        severity: data.severity || 'info',
        metadata: data,
      } as InsightCardBlock;
    } catch { return null; }
  });

  extractBlock(/【STEP_WIZARD】(.*?)【\/STEP_WIZARD】/gs, (json) => {
    try {
      const data = JSON.parse(json);
      return {
        type: 'step_wizard',
        title: data.title || '',
        steps: (data.steps || []).map((s: Record<string, unknown>) => ({
          title: s.title as string,
          description: s.description as string,
          completed: s.completed as boolean,
        })),
        currentStep: data.currentStep || 0,
      } as StepWizardBlock;
    } catch { return null; }
  });

  if (remaining.trim()) {
    blocks.unshift({ type: 'text', text: remaining.trim() });
  }

  return blocks;
}

export function isToolUseBlock(block: ContentBlock): block is ToolUseBlock {
  return block.type === 'tool_use';
}

export function isToolResultBlock(block: ContentBlock): block is ToolResultBlock {
  return block.type === 'tool_result';
}

export function isChartBlock(block: ContentBlock): block is ChartBlock {
  return block.type === 'chart';
}

export function isActionCardBlock(block: ContentBlock): block is ActionCardBlock {
  return block.type === 'action_card';
}
