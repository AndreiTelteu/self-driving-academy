export interface DocsSyncSummary {
  taskCount: number;
  firstId: number | null;
  lastId: string | null;
  moduleCount: number;
  columnCounts: { 'To Do': number; 'In Progress': number; Done: number };
  stageCounts: Record<string, number>;
  checkedLocalLinks: number;
  progressRows: number;
  indexRows: number;
  matrixRows: number;
  gapRows: number;
}

export interface DocsSyncResult {
  errors: string[];
  summary: DocsSyncSummary;
}

export const PROJECT_ROOT: string;

export function loadDocsModel(root?: string): unknown;

export function checkDocsSync(options?: { root?: string; pendingTaskId?: string | null }): DocsSyncResult;
