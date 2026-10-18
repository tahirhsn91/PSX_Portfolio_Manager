/**
 * Price alerts API — definitions only (issue #94). Evaluation is client-side.
 */

import { request } from '../http';
import type { Alert, AlertInput, AlertUpdate } from '@/types';

const BASE = '/api/alerts';

interface AlertsEnvelope {
  alerts: Alert[];
}
interface AlertEnvelope {
  alert: Alert;
}

export const alertsApi = {
  list: async (): Promise<Alert[]> => {
    const { alerts } = await request<AlertsEnvelope>(BASE);
    return alerts;
  },
  create: async (input: AlertInput): Promise<Alert> => {
    const { alert } = await request<AlertEnvelope>(BASE, {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return alert;
  },
  update: async (id: string, update: AlertUpdate): Promise<Alert> => {
    const { alert } = await request<AlertEnvelope>(`${BASE}/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(update),
    });
    return alert;
  },
  remove: async (id: string): Promise<void> => {
    await request<null>(`${BASE}/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },
};
