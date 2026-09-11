// Re-export all types for convenient single-import
export * from './portfolio.types';
export * from './market.types';
export * from './prediction.types';

// UI / app-level types
export interface Theme {
  mode: 'light' | 'dark' | 'system';
}

export interface AppSettings {
  theme: Theme['mode'];
  currency: 'PKR';
  dateFormat: 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';
  decimalPlaces: 2 | 4;
  showPercentages: boolean;
  autoRefreshInterval: 0 | 30 | 60 | 300; // seconds; 0 = disabled
}

export interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message?: string;
  createdAt: string;
  read: boolean;
}

export interface ExportData {
  version: string;
  exportedAt: string;
  portfolios: import('./portfolio.types').Portfolio[];
  settings: AppSettings;
}

export type SortDirection = 'asc' | 'desc';
export type TimeRange = '1D' | '1W' | '1M' | '3M' | '6M' | '1Y' | 'ALL';
