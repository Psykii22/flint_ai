export interface AnomalyCard {
  id: string;
  title: string;
  percentage: string;
  trend: 'up' | 'down';
  severity: 'critical' | 'warning' | 'normal';
  history: number[];
  colorClass: string;
  badgeColorClass: string;
  icon: string;
}

export interface LogEntry {
  timestamp: string;
  node: string;
  severity: 'INFO' | 'WARN' | 'CRIT';
  message: string;
  module: string;
}

export interface TableColumn {
  name: string;
  type: string;
  isKey?: boolean;
}

export interface SchemaTable {
  name: string;
  columns: TableColumn[];
}

export interface QueryResult {
  columns: string[];
  rows: Record<string, any>[];
  timeMs: number;
}

export type ActiveScreen = 'auth' | 'overview' | 'nodes' | 'copilot' | 'explorer' | 'vault';
