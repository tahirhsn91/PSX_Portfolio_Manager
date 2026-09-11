import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { AppSettings, Notification, TimeRange } from '@/types';
import { STORAGE_KEYS } from '@/constants';
import { v4 as uuidv4 } from 'uuid';

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  currency: 'PKR',
  dateFormat: 'DD/MM/YYYY',
  decimalPlaces: 2,
  showPercentages: true,
  autoRefreshInterval: 60,
};

interface UIState {
  settings: AppSettings;
  notifications: Notification[];
  isSidebarCollapsed: boolean;
  selectedTimeRange: TimeRange;

  // Settings
  updateSettings: (partial: Partial<AppSettings>) => void;
  resetSettings: () => void;

  // Notifications
  addNotification: (notification: Omit<Notification, 'id' | 'createdAt' | 'read'>) => void;
  markNotificationRead: (id: string) => void;
  markAllRead: () => void;
  clearNotifications: () => void;

  // UI State
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setTimeRange: (range: TimeRange) => void;

  // Computed
  unreadCount: () => number;
}

export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
      settings: DEFAULT_SETTINGS,
      notifications: [],
      isSidebarCollapsed: false,
      selectedTimeRange: '1M',

      updateSettings: (partial) =>
        set((state) => ({ settings: { ...state.settings, ...partial } })),

      resetSettings: () => set({ settings: DEFAULT_SETTINGS }),

      addNotification: (notification) => {
        const n: Notification = {
          ...notification,
          id: uuidv4(),
          createdAt: new Date().toISOString(),
          read: false,
        };
        set((state) => ({
          notifications: [n, ...state.notifications].slice(0, 50), // cap at 50
        }));
      },

      markNotificationRead: (id) =>
        set((state) => ({
          notifications: state.notifications.map((n) =>
            n.id === id ? { ...n, read: true } : n
          ),
        })),

      markAllRead: () =>
        set((state) => ({
          notifications: state.notifications.map((n) => ({ ...n, read: true })),
        })),

      clearNotifications: () => set({ notifications: [] }),

      toggleSidebar: () =>
        set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),

      setSidebarCollapsed: (collapsed) => set({ isSidebarCollapsed: collapsed }),

      setTimeRange: (range) => set({ selectedTimeRange: range }),

      unreadCount: () => get().notifications.filter((n) => !n.read).length,
    }),
    {
      name: STORAGE_KEYS.SETTINGS,
      storage: createJSONStorage(() => localStorage),
      // Only persist settings and notifications, not ephemeral UI state
      partialize: (state) => ({
        settings: state.settings,
        notifications: state.notifications,
        isSidebarCollapsed: state.isSidebarCollapsed,
      }),
    }
  )
);
