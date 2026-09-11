/**
 * LocalStorage service — thin, typed wrapper around window.localStorage.
 *
 * Abstraction layer: swap this for an IndexedDB, remote API, or native storage
 * adapter without touching Zustand stores or components.
 */

import type { Portfolio, AppSettings, ExportData } from '@/types';
import { APP_VERSION, STORAGE_KEYS, STORAGE_VERSION } from '@/constants';

export class LocalStorageService {
  private getItem<T>(key: string): T | null {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw) as T;
    } catch {
      console.warn(`[Storage] Failed to parse key "${key}"`);
      return null;
    }
  }

  private setItem<T>(key: string, value: T): void {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (err) {
      console.error(`[Storage] Failed to write key "${key}"`, err);
      throw new Error('Storage write failed. You may be in private browsing mode or storage is full.');
    }
  }

  private removeItem(key: string): void {
    window.localStorage.removeItem(key);
  }

  // ─── Portfolio ───────────────────────────────────────────────────────────
  getPortfolios(): Portfolio[] {
    // Zustand persist handles this directly via the STORAGE_KEYS.PORTFOLIOS key
    // This method is used for import/export utilities only
    const state = this.getItem<{ state: { portfolios: Portfolio[] } }>(STORAGE_KEYS.PORTFOLIOS);
    return state?.state?.portfolios ?? [];
  }

  // ─── Export / Import ─────────────────────────────────────────────────────
  exportAll(): ExportData {
    const portfolios = this.getPortfolios();
    const settingsRaw = this.getItem<{ state: AppSettings }>(STORAGE_KEYS.SETTINGS);
    const settings = settingsRaw?.state ?? ({} as AppSettings);
    return {
      version: APP_VERSION,
      exportedAt: new Date().toISOString(),
      portfolios,
      settings,
    };
  }

  exportToJSON(): string {
    return JSON.stringify(this.exportAll(), null, 2);
  }

  exportToFile(): void {
    const json = this.exportToJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `psx-portfolio-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  importFromJSON(json: string): ExportData {
    try {
      const data = JSON.parse(json) as ExportData;
      if (!data.portfolios || !Array.isArray(data.portfolios)) {
        throw new Error('Invalid backup format: missing portfolios array');
      }
      // Validate version compatibility
      if (data.version && data.version !== APP_VERSION) {
        console.warn(`[Storage] Importing from version ${data.version}, current is ${APP_VERSION}`);
      }
      return data;
    } catch (err) {
      throw new Error(`Failed to parse backup file: ${(err as Error).message}`);
    }
  }

  // ─── Clear all ───────────────────────────────────────────────────────────
  clearAll(): void {
    Object.values(STORAGE_KEYS).forEach((key) => this.removeItem(key));
  }

  // ─── Storage info ────────────────────────────────────────────────────────
  getStorageInfo(): { used: number; total: number; usedPercent: number } {
    let used = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i) ?? '';
      const value = localStorage.getItem(key) ?? '';
      used += key.length + value.length;
    }
    const total = 5 * 1024 * 1024; // ~5MB typical limit
    return { used, total, usedPercent: Math.round((used / total) * 100) };
  }

  getStorageVersion(): string {
    return STORAGE_VERSION;
  }
}

export const storageService = new LocalStorageService();
