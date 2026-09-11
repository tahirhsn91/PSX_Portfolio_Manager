import { z } from 'zod';

export const portfolioSchema = z.object({
  name: z.string().min(1, 'Portfolio name is required').max(50, 'Max 50 characters'),
  description: z.string().max(200, 'Max 200 characters').optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Must be a valid hex color'),
});

export const holdingSchema = z.object({
  companyName: z.string().min(1, 'Company name is required'),
  symbol: z.string().min(1, 'Symbol is required').max(10).toUpperCase(),
  sector: z.string().min(1, 'Sector is required'),
  shares: z.number({ required_error: 'Shares is required' }).positive('Must be positive').max(10_000_000),
  averagePurchasePrice: z.number({ required_error: 'Purchase price is required' }).positive('Must be positive').max(1_000_000),
  purchaseDate: z.string().min(1, 'Purchase date is required'),
  notes: z.string().max(500).optional(),
});

export const dividendSchema = z.object({
  date: z.string().min(1, 'Date is required'),
  amountPerShare: z.number().positive('Must be positive'),
  type: z.enum(['cash', 'stock', 'bonus']),
});

export type PortfolioFormValues = z.infer<typeof portfolioSchema>;
export type HoldingFormValues = z.infer<typeof holdingSchema>;
export type DividendFormValues = z.infer<typeof dividendSchema>;
