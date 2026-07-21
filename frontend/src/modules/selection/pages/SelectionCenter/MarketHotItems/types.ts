export interface ShoppingItem {
  title: string;
  price: string;
  extractedPrice: number | null;
  thumbnail: string;
  source: string;
  link: string;
  rating: number | null;
  reviews: number | null;
  delivery: string;
  dataSource?: string;
  sourceLabel?: string;
  rankScore?: number;
}

export interface DailyHotGroup {
  keyword: string;
  heatScore: number;
  products: ShoppingItem[];
  sourceCount?: number;
  sources?: string[];
}

export interface DailyHotResponse {
  date: string;
  cached: boolean;
  serpApiEnabled: boolean;
  groups: DailyHotGroup[];
  total: number;
  sources?: Array<{ dataSource: string; label: string }>;
}

export interface SearchResult {
  items: ShoppingItem[];
  trendScore: number;
  keyword: string;
  serpApiEnabled: boolean;
  sourceCount?: number;
  sources?: Array<{ dataSource: string; label: string }>;
}

export interface MarketAnalysis {
  avgPrice: number;
  minPrice: number;
  maxPrice: number;
  sources: string[];
  ratedCount: number;
  trendScore: number;
  total: number;
}

export interface MarketAnalysisInput {
  items: ShoppingItem[];
  trendScore: number;
}

export interface SourceOption {
  dataSource: string;
  label: string;
}

export interface MarketHotItemsProps {
  onAdded?: () => void;
}
