/**
 * Mock market data provider.
 * Simulates realistic PSX data with random fluctuations.
 * Replace this with a real API provider (e.g., PSX data API, financial data vendor)
 * by implementing IMarketDataProvider and swapping the import in marketDataService.ts.
 */

import type {
  StockQuote,
  StockDetail,
  HistoricalDataPoint,
  KSE100Data,
  SectorPerformance,
  MarketStatus,
  PSXCompany,
  IMarketDataProvider,
} from '@/types';
import { PSX_COMPANIES } from '@/constants';
import { subDays, format, isWeekend } from 'date-fns';

// Base prices for known symbols (PKR)
const BASE_PRICES: Record<string, number> = {
  OGDC: 145.5, PPL: 95.2, POL: 520.0, MARI: 2250.0,
  PSO: 310.0, HASCOL: 28.0, APL: 450.0,
  ENGRO: 285.0, EFERT: 152.0, FFC: 130.0, FFBL: 18.5, FATIMA: 48.0,
  HBL: 145.0, UBL: 200.0, MCB: 210.0, ABL: 90.0, BAHL: 82.0, BAFL: 50.0, NBP: 38.0, MEBL: 195.0,
  LUCK: 620.0, DGKC: 92.0, MLCF: 35.0, PIOC: 60.0, KOHC: 95.0, FCCL: 20.0,
  HUBC: 107.0, KAPCO: 72.0, NCPL: 25.0, NPL: 22.0,
  NML: 125.0, NCL: 62.0, GATM: 42.0, KTML: 32.0,
  SYS: 375.0, TRG: 42.0, AVN: 42.0, NETSOL: 60.0,
  SEARL: 96.0, GLAXO: 350.0, AGP: 48.0, FEROZ: 260.0,
  NESTLE: 5800.0, UNITY: 13.5, FRAG: 88.0,
  ICI: 635.0, BATA: 1250.0,
  INDU: 1650.0, PSMC: 720.0, HCAR: 360.0, ATLH: 680.0,
  NRL: 410.0, PRL: 52.0,
  JGICL: 78.0, JLICL: 130.0, EFU: 220.0,
  LOTCHEM: 20.0, COLG: 980.0, UNILEVER: 3100.0,
};

function getBasePrice(symbol: string): number {
  return BASE_PRICES[symbol] ?? 100;
}

/**
 * Deterministic "random" — same symbol + day → same price, so
 * cache invalidation doesn't cause jarring jumps.
 */
function seededRandom(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(31, h) + seed.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h % 1000) / 1000;
}

function generateDailyPrice(symbol: string, basePrice: number, date: string, dayIndex: number): HistoricalDataPoint {
  const seed = `${symbol}-${date}-${dayIndex}`;
  const r1 = seededRandom(seed + 'o');
  const r2 = seededRandom(seed + 'h');
  const r3 = seededRandom(seed + 'l');
  const r4 = seededRandom(seed + 'c');
  const r5 = seededRandom(seed + 'v');

  const open = basePrice * (0.97 + r1 * 0.06);
  const close = basePrice * (0.96 + r4 * 0.08);
  const high = Math.max(open, close) * (1 + r2 * 0.03);
  const low = Math.min(open, close) * (1 - r3 * 0.03);
  const volume = Math.floor(100_000 + r5 * 5_000_000);

  return { date, open: +open.toFixed(2), high: +high.toFixed(2), low: +low.toFixed(2), close: +close.toFixed(2), volume };
}

function getWorkingDays(daysBack: number): string[] {
  const days: string[] = [];
  let current = new Date();
  let count = 0;
  while (days.length < daysBack && count < daysBack * 2) {
    if (!isWeekend(current)) {
      days.unshift(format(current, 'yyyy-MM-dd'));
    }
    current = subDays(current, 1);
    count++;
  }
  return days;
}

export class MockMarketDataProvider implements IMarketDataProvider {
  private simulateLatency = (): Promise<void> =>
    new Promise((res) => setTimeout(res, 150 + Math.random() * 300));

  async getQuote(symbol: string): Promise<StockQuote> {
    await this.simulateLatency();
    return this.buildQuote(symbol);
  }

  async getQuotes(symbols: string[]): Promise<StockQuote[]> {
    await this.simulateLatency();
    return symbols.map((s) => this.buildQuote(s));
  }

  async getStockDetail(symbol: string): Promise<StockDetail> {
    await this.simulateLatency();
    const quote = this.buildQuote(symbol);
    const base = getBasePrice(symbol);
    const company = PSX_COMPANIES.find((c) => c.symbol === symbol);

    return {
      ...quote,
      week52High: +(base * 1.35).toFixed(2),
      week52Low: +(base * 0.65).toFixed(2),
      peRatio: +(8 + seededRandom(symbol + 'pe') * 12).toFixed(1),
      eps: +(base * (0.05 + seededRandom(symbol + 'eps') * 0.08)).toFixed(2),
      bookValue: +(base * (0.8 + seededRandom(symbol + 'bv') * 0.4)).toFixed(2),
      dividendYield: +(3 + seededRandom(symbol + 'dy') * 8).toFixed(2),
      nextDividendDate: format(subDays(new Date(), -90), 'yyyy-MM-dd'),
      nextDividendAmount: +(base * 0.05).toFixed(2),
      beta: +(0.7 + seededRandom(symbol + 'beta') * 0.8).toFixed(2),
      averageVolume: Math.floor(500_000 + seededRandom(symbol + 'av') * 3_000_000),
      description: company
        ? `${company.name} is listed on PSX under the ${company.sector} sector.`
        : `${symbol} is listed on the Pakistan Stock Exchange.`,
    };
  }

  async getHistoricalData(symbol: string, _from: string, _to: string): Promise<HistoricalDataPoint[]> {
    await this.simulateLatency();
    const days = getWorkingDays(365);
    let price = getBasePrice(symbol) * 0.85; // start lower and trend up
    return days.map((date, i) => {
      // Apply slight upward drift
      price = price * (1 + (seededRandom(`${symbol}-${i}-drift`) - 0.48) * 0.025);
      const point = generateDailyPrice(symbol, price, date, i);
      price = point.close;
      return point;
    });
  }

  async getKSE100(): Promise<KSE100Data> {
    await this.simulateLatency();
    const base = 67500;
    const r = seededRandom('kse100-' + format(new Date(), 'yyyyMMdd'));
    const change = (r - 0.48) * 800;
    const currentValue = base + change;
    const days = getWorkingDays(365);
    let ksePrice = base * 0.8;
    const historicalData: HistoricalDataPoint[] = days.map((date, i) => {
      ksePrice = ksePrice * (1 + (seededRandom(`kse100-${i}`) - 0.47) * 0.012);
      return {
        date,
        open: +ksePrice.toFixed(0),
        high: +(ksePrice * 1.005).toFixed(0),
        low: +(ksePrice * 0.995).toFixed(0),
        close: +(ksePrice * (1 + (seededRandom(`kse100-${i}-c`) - 0.5) * 0.008)).toFixed(0),
        volume: Math.floor(500_000_000 + seededRandom(`kse100-${i}-v`) * 1_000_000_000),
      };
    });

    return {
      value: +currentValue.toFixed(0),
      change: +change.toFixed(0),
      changePercent: +((change / base) * 100).toFixed(2),
      open: +(base - 100).toFixed(0),
      high: +(currentValue + 200).toFixed(0),
      low: +(currentValue - 300).toFixed(0),
      previousClose: base,
      volume: 2_500_000_000,
      lastUpdated: new Date().toISOString(),
      historicalData,
    };
  }

  async getSectorPerformance(): Promise<SectorPerformance[]> {
    await this.simulateLatency();
    const sectors = [...new Set(PSX_COMPANIES.map((c) => c.sector))];
    return sectors.map((sector) => {
      const r = seededRandom(sector + format(new Date(), 'yyyyMMdd'));
      const companies = PSX_COMPANIES.filter((c) => c.sector === sector);
      return {
        sector,
        changePercent: +((r - 0.5) * 6).toFixed(2),
        marketCap: companies.reduce((sum, c) => sum + c.marketCap, 0),
        stockCount: companies.length,
        topGainer: companies[0]?.symbol ?? '',
        topLoser: companies[companies.length - 1]?.symbol ?? '',
      };
    });
  }

  async getMarketStatus(): Promise<MarketStatus> {
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay(); // 0=Sun, 6=Sat
    const isWeekday = day >= 1 && day <= 5;
    const isOpen = isWeekday && hour >= 9 && hour < 16;
    return { isOpen, nextOpen: null, nextClose: null, timezone: 'PKT' };
  }

  async searchCompanies(query: string): Promise<PSXCompany[]> {
    const q = query.toLowerCase();
    return PSX_COMPANIES.filter(
      (c) => c.symbol.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)
    ).slice(0, 10);
  }

  private buildQuote(symbol: string): StockQuote {
    const base = getBasePrice(symbol);
    const today = format(new Date(), 'yyyyMMdd');
    const r1 = seededRandom(symbol + today + 'c');
    const r2 = seededRandom(symbol + today + 'o');
    const changePercent = (r1 - 0.48) * 10; // -4.8% to +5.2%
    const change = +(base * (changePercent / 100)).toFixed(2);
    const currentPrice = +(base + change).toFixed(2);
    const open = +(base * (0.99 + r2 * 0.02)).toFixed(2);
    const company = PSX_COMPANIES.find((c) => c.symbol === symbol);

    return {
      symbol,
      companyName: company?.name ?? symbol,
      currentPrice,
      change,
      changePercent: +changePercent.toFixed(2),
      open,
      high: +(currentPrice * 1.02).toFixed(2),
      low: +(currentPrice * 0.98).toFixed(2),
      previousClose: base,
      volume: Math.floor(200_000 + seededRandom(symbol + today + 'v') * 4_000_000),
      marketCap: company?.marketCap ?? currentPrice * 100_000_000,
      sector: company?.sector ?? 'Other',
      lastUpdated: new Date().toISOString(),
    };
  }
}
