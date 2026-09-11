/**
 * Application-wide constants.
 */

export const APP_NAME = 'PSX Portfolio Manager';
export const APP_VERSION = '1.0.0';
export const STORAGE_VERSION = '1';

// LocalStorage keys
export const STORAGE_KEYS = {
  PORTFOLIOS: 'psx_portfolios',
  SETTINGS: 'psx_settings',
  MARKET_CACHE: 'psx_market_cache',
  THEME: 'psx_theme',
} as const;

// Market hours (Pakistan Standard Time, UTC+5)
export const MARKET_HOURS = {
  OPEN: '09:30',
  CLOSE: '15:30',
  TIMEZONE: 'Asia/Karachi',
} as const;

// Chart colors
export const CHART_COLORS = [
  '#00a651', // PSX green
  '#3b82f6', // blue
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#14b8a6', // teal
  '#f97316', // orange
  '#6366f1', // indigo
  '#84cc16', // lime
  '#06b6d4', // cyan
] as const;

// Default portfolio colors
export const PORTFOLIO_COLORS = [
  '#00a651',
  '#3b82f6',
  '#f59e0b',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
  '#f97316',
  '#ef4444',
] as const;

// PSX Sectors
export const PSX_SECTORS = [
  'Automobile Assembler',
  'Automobile Parts & Accessories',
  'Cement',
  'Chemical',
  'Commercial Banks',
  'Engineering',
  'Fertilizer',
  'Food & Personal Care Products',
  'Glass & Ceramics',
  'Insurance',
  'Investment Banks / Investment Companies / Securities Co.',
  'Leasing Companies',
  'Modarabas',
  'Oil & Gas Exploration Companies',
  'Oil & Gas Marketing Companies',
  'Paper & Board',
  'Pharmaceutical',
  'Power Generation & Distribution',
  'Real Estate Investment Trust',
  'Refinery',
  'Sugar & Allied Industries',
  'Technology & Communication',
  'Textile Composite',
  'Textile Spinning',
  'Textile Weaving',
  'Tobacco',
  'Transport',
  'Vanaspati & Allied Industries',
  'Woolen',
  'Other',
] as const;

export type PSXSector = (typeof PSX_SECTORS)[number];

// Cache TTL in milliseconds
export const CACHE_TTL = {
  QUOTE: 60_000, // 1 minute
  DETAIL: 300_000, // 5 minutes
  HISTORICAL: 3_600_000, // 1 hour
  KSE100: 60_000, // 1 minute
  SECTOR: 300_000, // 5 minutes
} as const;

// Pagination
export const PAGE_SIZE = 20;

// Technical analysis parameters
export const TECHNICAL = {
  RSI_PERIOD: 14,
  RSI_OVERBOUGHT: 70,
  RSI_OVERSOLD: 30,
  SMA_SHORT: 20,
  SMA_MEDIUM: 50,
  SMA_LONG: 200,
  SUPPORT_RESISTANCE_LOOKBACK: 90, // days
} as const;
