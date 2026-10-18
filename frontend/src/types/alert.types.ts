/**
 * Price alerts (issue #94).
 *
 * Definitions only — evaluation happens client-side while the app is open.
 * A `kind` of 'price' compares the live price to `threshold`; 'percent'
 * compares the day's move (vs previous close) to `threshold`. `direction`
 * 'above'/'below' decides which side of the threshold triggers.
 */

export type AlertKind = 'price' | 'percent';
export type AlertDirection = 'above' | 'below';

export interface Alert {
  id: string;
  symbol: string;
  kind: AlertKind;
  direction: AlertDirection;
  threshold: number;
  active: boolean;
  createdAt: string;
}

export interface AlertInput {
  symbol: string;
  kind: AlertKind;
  direction: AlertDirection;
  threshold: number;
}

export interface AlertUpdate {
  symbol?: string;
  kind?: AlertKind;
  direction?: AlertDirection;
  threshold?: number;
  active?: boolean;
}
