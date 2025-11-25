export type LineItemType = 'service' | 'expense';

export interface LineItem {
  id: string;
  type: LineItemType;
  date?: string;
  description: string;
  hours: number;
  rate: number;
  amount: number; // calculated or manual override
}

export interface InvoiceDetails {
  number: string;
  date: string;
  billToName: string;
  billToEmail: string;
  jobRef: string;
  notes: string;
}

export interface Totals {
  gross: number;
  gst: number;
  tax: number;
  clientToPay: number;
  net: number;
}

export enum AppMode {
  EDIT = 'EDIT',
  PREVIEW = 'PREVIEW'
}