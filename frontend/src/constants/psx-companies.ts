import type { PSXCompany } from '@/types';

/**
 * Curated list of major PSX-listed companies for autocomplete search.
 * In production, replace this with an API call to fetch the full listing.
 */
export const PSX_COMPANIES: PSXCompany[] = [
  // Oil & Gas Exploration
  { symbol: 'OGDC', name: 'Oil & Gas Development Company', sector: 'Oil & Gas Exploration Companies', marketCap: 1_200_000_000_000, listedShares: 4_300_000_000 },
  { symbol: 'PPL', name: 'Pakistan Petroleum Limited', sector: 'Oil & Gas Exploration Companies', marketCap: 300_000_000_000, listedShares: 1_000_000_000 },
  { symbol: 'POL', name: 'Pakistan Oilfields Limited', sector: 'Oil & Gas Exploration Companies', marketCap: 150_000_000_000, listedShares: 130_000_000 },
  { symbol: 'MARI', name: 'Mari Petroleum Company', sector: 'Oil & Gas Exploration Companies', marketCap: 250_000_000_000, listedShares: 75_000_000 },
  // Oil & Gas Marketing
  { symbol: 'PSO', name: 'Pakistan State Oil', sector: 'Oil & Gas Marketing Companies', marketCap: 120_000_000_000, listedShares: 320_000_000 },
  { symbol: 'HASCOL', name: 'Hascol Petroleum Limited', sector: 'Oil & Gas Marketing Companies', marketCap: 5_000_000_000, listedShares: 200_000_000 },
  { symbol: 'APL', name: 'Attock Petroleum Limited', sector: 'Oil & Gas Marketing Companies', marketCap: 40_000_000_000, listedShares: 100_000_000 },
  // Fertilizer
  { symbol: 'ENGRO', name: 'Engro Corporation', sector: 'Fertilizer', marketCap: 450_000_000_000, listedShares: 530_000_000 },
  { symbol: 'EFERT', name: 'Engro Fertilizers', sector: 'Fertilizer', marketCap: 200_000_000_000, listedShares: 1_170_000_000 },
  { symbol: 'FFC', name: 'Fauji Fertilizer Company', sector: 'Fertilizer', marketCap: 200_000_000_000, listedShares: 1_270_000_000 },
  { symbol: 'FFBL', name: 'Fauji Fertilizer Bin Qasim', sector: 'Fertilizer', marketCap: 20_000_000_000, listedShares: 1_100_000_000 },
  { symbol: 'FATIMA', name: 'Fatima Fertilizer Company', sector: 'Fertilizer', marketCap: 80_000_000_000, listedShares: 1_650_000_000 },
  // Commercial Banks
  { symbol: 'HBL', name: 'Habib Bank Limited', sector: 'Commercial Banks', marketCap: 350_000_000_000, listedShares: 1_465_000_000 },
  { symbol: 'UBL', name: 'United Bank Limited', sector: 'Commercial Banks', marketCap: 200_000_000_000, listedShares: 1_224_000_000 },
  { symbol: 'MCB', name: 'MCB Bank Limited', sector: 'Commercial Banks', marketCap: 250_000_000_000, listedShares: 1_185_000_000 },
  { symbol: 'ABL', name: 'Allied Bank Limited', sector: 'Commercial Banks', marketCap: 120_000_000_000, listedShares: 1_125_000_000 },
  { symbol: 'BAHL', name: 'Bank Al-Habib Limited', sector: 'Commercial Banks', marketCap: 130_000_000_000, listedShares: 1_350_000_000 },
  { symbol: 'BAFL', name: 'Bank Alfalah Limited', sector: 'Commercial Banks', marketCap: 100_000_000_000, listedShares: 1_965_000_000 },
  { symbol: 'NBP', name: 'National Bank of Pakistan', sector: 'Commercial Banks', marketCap: 80_000_000_000, listedShares: 2_130_000_000 },
  { symbol: 'MEBL', name: 'Meezan Bank Limited', sector: 'Commercial Banks', marketCap: 500_000_000_000, listedShares: 2_320_000_000 },
  // Cement
  { symbol: 'LUCK', name: 'Lucky Cement', sector: 'Cement', marketCap: 200_000_000_000, listedShares: 320_000_000 },
  { symbol: 'DGKC', name: 'D.G. Khan Cement', sector: 'Cement', marketCap: 60_000_000_000, listedShares: 560_000_000 },
  { symbol: 'MLCF', name: 'Maple Leaf Cement Factory', sector: 'Cement', marketCap: 40_000_000_000, listedShares: 1_100_000_000 },
  { symbol: 'PIOC', name: 'Pioneer Cement', sector: 'Cement', marketCap: 30_000_000_000, listedShares: 460_000_000 },
  { symbol: 'KOHC', name: 'Kohat Cement', sector: 'Cement', marketCap: 35_000_000_000, listedShares: 325_000_000 },
  { symbol: 'FCCL', name: 'Fauji Cement Company', sector: 'Cement', marketCap: 25_000_000_000, listedShares: 1_200_000_000 },
  // Power
  { symbol: 'HUBC', name: 'Hub Power Company', sector: 'Power Generation & Distribution', marketCap: 130_000_000_000, listedShares: 1_163_000_000 },
  { symbol: 'KAPCO', name: 'Kot Addu Power Company', sector: 'Power Generation & Distribution', marketCap: 30_000_000_000, listedShares: 400_000_000 },
  { symbol: 'NCPL', name: 'Nishat Chunian Power', sector: 'Power Generation & Distribution', marketCap: 12_000_000_000, listedShares: 440_000_000 },
  { symbol: 'NPL', name: 'Nishat Power Limited', sector: 'Power Generation & Distribution', marketCap: 10_000_000_000, listedShares: 455_000_000 },
  // Textile
  { symbol: 'NML', name: 'Nishat Mills Limited', sector: 'Textile Composite', marketCap: 60_000_000_000, listedShares: 470_000_000 },
  { symbol: 'NCL', name: 'Nishat Chunian Limited', sector: 'Textile Composite', marketCap: 25_000_000_000, listedShares: 395_000_000 },
  { symbol: 'GATM', name: 'Gul Ahmed Textile Mills', sector: 'Textile Composite', marketCap: 15_000_000_000, listedShares: 356_000_000 },
  { symbol: 'KTML', name: 'Kohinoor Textile Mills', sector: 'Textile Composite', marketCap: 8_000_000_000, listedShares: 247_000_000 },
  // Technology
  { symbol: 'SYS', name: 'Systems Limited', sector: 'Technology & Communication', marketCap: 120_000_000_000, listedShares: 330_000_000 },
  { symbol: 'TRG', name: 'TRG Pakistan Limited', sector: 'Technology & Communication', marketCap: 80_000_000_000, listedShares: 1_980_000_000 },
  { symbol: 'AVN', name: 'Avanceon Limited', sector: 'Technology & Communication', marketCap: 10_000_000_000, listedShares: 230_000_000 },
  { symbol: 'NETSOL', name: 'NetSol Technologies', sector: 'Technology & Communication', marketCap: 6_000_000_000, listedShares: 100_000_000 },
  // Pharmaceutical
  { symbol: 'SEARL', name: 'The Searle Company', sector: 'Pharmaceutical', marketCap: 30_000_000_000, listedShares: 310_000_000 },
  { symbol: 'GLAXO', name: 'GlaxoSmithKline Pakistan', sector: 'Pharmaceutical', marketCap: 30_000_000_000, listedShares: 84_000_000 },
  { symbol: 'AGP', name: 'AGP Limited', sector: 'Pharmaceutical', marketCap: 12_000_000_000, listedShares: 240_000_000 },
  { symbol: 'FEROZ', name: 'Ferozsons Laboratories', sector: 'Pharmaceutical', marketCap: 8_000_000_000, listedShares: 30_000_000 },
  // Food
  { symbol: 'NESTLE', name: 'Nestlé Pakistan', sector: 'Food & Personal Care Products', marketCap: 250_000_000_000, listedShares: 45_000_000 },
  { symbol: 'UNITY', name: 'Unity Foods Limited', sector: 'Food & Personal Care Products', marketCap: 20_000_000_000, listedShares: 1_500_000_000 },
  { symbol: 'FRAG', name: 'Frieslandcampina Engro Pakistan', sector: 'Food & Personal Care Products', marketCap: 15_000_000_000, listedShares: 170_000_000 },
  // Chemical
  { symbol: 'ICI', name: 'ICI Pakistan Limited', sector: 'Chemical', marketCap: 100_000_000_000, listedShares: 154_000_000 },
  { symbol: 'BATA', name: 'Bata Pakistan', sector: 'Chemical', marketCap: 10_000_000_000, listedShares: 7_900_000 },
  // Automobile
  { symbol: 'INDU', name: 'Indus Motor Company', sector: 'Automobile Assembler', marketCap: 130_000_000_000, listedShares: 79_000_000 },
  { symbol: 'PSMC', name: 'Pak Suzuki Motor Company', sector: 'Automobile Assembler', marketCap: 60_000_000_000, listedShares: 82_000_000 },
  { symbol: 'HCAR', name: 'Honda Atlas Cars (Pakistan)', sector: 'Automobile Assembler', marketCap: 55_000_000_000, listedShares: 150_000_000 },
  { symbol: 'ATLH', name: 'Atlas Honda Limited', sector: 'Automobile Assembler', marketCap: 90_000_000_000, listedShares: 130_000_000 },
  // Refinery
  { symbol: 'NRL', name: 'National Refinery', sector: 'Refinery', marketCap: 15_000_000_000, listedShares: 37_000_000 },
  { symbol: 'PRL', name: 'Pakistan Refinery', sector: 'Refinery', marketCap: 8_000_000_000, listedShares: 149_000_000 },
  // Insurance
  { symbol: 'JGICL', name: 'Jubilee General Insurance', sector: 'Insurance', marketCap: 10_000_000_000, listedShares: 124_000_000 },
  { symbol: 'JLICL', name: 'Jubilee Life Insurance', sector: 'Insurance', marketCap: 15_000_000_000, listedShares: 110_000_000 },
  { symbol: 'EFU', name: 'EFU General Insurance', sector: 'Insurance', marketCap: 12_000_000_000, listedShares: 56_000_000 },
  // Misc
  { symbol: 'LOTCHEM', name: 'Lotte Chemical Pakistan', sector: 'Chemical', marketCap: 30_000_000_000, listedShares: 1_500_000_000 },
  { symbol: 'COLG', name: 'Colgate-Palmolive (Pakistan)', sector: 'Food & Personal Care Products', marketCap: 55_000_000_000, listedShares: 56_000_000 },
  { symbol: 'UNILEVER', name: 'Unilever Pakistan Foods', sector: 'Food & Personal Care Products', marketCap: 40_000_000_000, listedShares: 12_700_000 },
];

/**
 * Fast company lookup by symbol
 */
export const COMPANY_MAP = new Map<string, PSXCompany>(
  PSX_COMPANIES.map((c) => [c.symbol, c])
);

/**
 * Search companies by symbol or name (case-insensitive)
 */
export function searchPSXCompanies(query: string, limit = 10): PSXCompany[] {
  if (!query.trim()) return PSX_COMPANIES.slice(0, limit);
  const q = query.toLowerCase();
  return PSX_COMPANIES.filter(
    (c) => c.symbol.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)
  ).slice(0, limit);
}
