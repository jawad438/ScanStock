export type Language = 'en' | 'fr' | 'ar';
export type Theme = 'light' | 'dark' | 'system';
export type Tab = 'scanner' | 'database' | 'history';

export interface InventoryItem {
  id: string;
  barcode: string;
  name: string;
  price: number;
  quantity: number;
  timestamp: number;
}

export interface DatabaseItem {
  barcode: string;
  name: string;
  price: number;
}

export interface SaleRecord {
  id: string;
  items: InventoryItem[];
  total: number;
  timestamp: number;
}

export interface AppSettings {
  language: Language;
  theme: Theme;
}
