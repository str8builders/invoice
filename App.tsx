import React, { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, Download, Printer, Upload, Bolt, Sparkles, AlertCircle, FileText, Loader2, Files, RefreshCw, Wand2, Paperclip, Hammer, Tag, Save, FolderOpen, X, Clock, ArrowDown, ArrowUp, Send } from 'lucide-react';
import Papa from 'papaparse';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import JSZip from 'jszip';
import { calculateLineAmount, calculateTotals, formatCurrency, calculateMetricsFromAmount, formatDateToISO, formatDateForDisplay, normalizeDateToISO } from './utils/calculations';
import { InvoiceDetails, LineItem, Totals, LineItemType } from './types';
import { AIAssistant } from './components/AIAssistant';
import { polishDescription, parseInvoicePDF } from './services/geminiService';

// Constants for numbering logic
const STORAGE_KEY = 'str8_invoice_counter';
const SAVED_INVOICES_KEY = 'str8_saved_invoices';

interface SavedInvoice {
  id: string;
  timestamp: number;
  details: InvoiceDetails;
  items: LineItem[];
  totals: Totals;
}

/**
 * Generates the next invoice number based on today's date and stored counter.
 * Resets counter daily.
 */
const generateInvoiceNumber = (): string => {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const dateStr = `${yyyy}${mm}${dd}`; // YYYYMMDD
  
  let nextCount = 1;
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const data = JSON.parse(stored);
      // If the stored date matches today, increment the counter
      if (data.date === dateStr) {
        nextCount = Number(data.count) + 1;
      }
    }
  } catch (e) {
    console.warn("Failed to read invoice counter from storage", e);
  }

  // Update storage with the new count for today
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    date: dateStr,
    count: nextCount
  }));
  
  return `INV-${dateStr}-${String(nextCount).padStart(3, '0')}`;
};

/**
 * Checks if a manually entered invoice number is valid for today and 
 * updates the local storage counter if the entered number is higher 
 * than what is currently stored.
 */
const syncInvoiceCounter = (invoiceNumber: string) => {
  const regex = /^INV-(\d{8})-(\d{3})$/;
  const match = invoiceNumber.match(regex);
  
  if (match) {
    const [_, dateStr, countStr] = match;
    
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const todayStr = `${yyyy}${mm}${dd}`;

    // We only care about syncing the counter if the invoice date is TODAY
    if (dateStr === todayStr) {
      const currentCount = parseInt(countStr, 10);
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        let storedCount = 0;
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed.date === todayStr) {
            storedCount = Number(parsed.count);
          }
        }

        // If user manually set a higher number (e.g. 005), ensure next gen is 006
        if (currentCount > storedCount) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify({
            date: todayStr,
            count: currentCount
          }));
        }
      } catch (e) {
        console.warn('Error syncing invoice counter', e);
      }
    }
  }
};

// Initial constants
const INITIAL_INVOICE_DETAILS: InvoiceDetails = {
  // Number is now generated dynamically in state initialization
  number: '', 
  date: formatDateToISO(), // Initialize with YYYY-MM-DD for date picker
  billToName: "BM O'Hanlon Builders Ltd",
  billToEmail: "bmohanlonbuilders@gmail.com",
  jobRef: "Residential Build",
  notes: "Residential Build"
};

const FROM_DETAILS = {
  name: "Challis Samu",
  gst: "075-179-030-GST006",
  bank: "ASB 12-3232-0150327-50",
  email: "challis836@gmail.com",
  address: "16 Ash Lane, Omokoroa, New Zealand",
  phone: "022 050 44856"
};

// Extracted LineItemRow Component
interface LineItemRowProps {
  item: LineItem;
  onChange: (id: string, field: keyof LineItem, value: string | number) => void;
  onPolish: (id: string, text: string) => void;
  onDelete: (id: string) => void;
  onAmountBlur: (id: string) => void;
}

const LineItemRow: React.FC<LineItemRowProps> = ({ item, onChange, onPolish, onDelete, onAmountBlur }) => (
    <div className="group relative p-4 mb-4 bg-white rounded-xl shadow-sm border border-slate-200 transition-all md:p-0 md:mb-0 md:bg-transparent md:shadow-none md:border-none md:border-b md:border-slate-50 md:grid md:grid-cols-12 md:gap-4 md:items-start md:px-2 md:-mx-2 md:hover:bg-slate-50">
      
      {/* Mobile Top Row: Type, Date, Delete */}
      <div className="flex items-center justify-between mb-3 md:mb-0 md:col-span-2 md:justify-start md:gap-2">
        <div className="flex items-center gap-2 flex-1">
            <button 
                onClick={() => onChange(item.id, 'type', item.type === 'service' ? 'expense' : 'service')}
                className={`p-2 md:p-1.5 rounded-md transition-colors shrink-0 ${item.type === 'service' ? 'bg-indigo-50 text-indigo-600' : 'bg-emerald-50 text-emerald-600'}`}
                title={item.type === 'service' ? "Switch to Expense" : "Switch to Labor"}
            >
                {item.type === 'service' ? <Hammer className="w-4 h-4" /> : <Tag className="w-4 h-4" />}
            </button>
            <input 
              type="date" 
              value={item.date || ''}
              onChange={(e) => onChange(item.id, 'date', e.target.value)}
              className="w-full bg-transparent md:border-b md:border-dashed border-none md:border-slate-200 focus:border-indigo-500 focus:outline-none py-1 text-base md:text-sm text-slate-600 placeholder:text-slate-300 font-mono"
            />
        </div>
        {/* Mobile Delete - Top Right */}
        <button 
            onClick={() => onDelete(item.id)}
            className="md:hidden text-slate-400 hover:text-red-500 p-2 bg-slate-50 rounded-full"
        >
            <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Description */}
      <div className="w-full mb-3 md:mb-0 md:col-span-5 relative">
        <textarea 
          value={item.description}
          onChange={(e) => onChange(item.id, 'description', e.target.value)}
          placeholder="Item description..."
          className="w-full bg-slate-50 rounded-lg p-3 md:bg-transparent md:rounded-none md:p-0 md:py-1 border-none md:border-b md:border-dashed md:border-slate-200 focus:ring-0 focus:border-indigo-500 focus:outline-none text-base md:text-sm text-slate-800 placeholder:text-slate-300 resize-none overflow-hidden leading-relaxed pr-8 md:pr-0 transition-all min-h-[60px] md:min-h-0"
          rows={1}
          onInput={(e) => {
            const target = e.target as HTMLTextAreaElement;
            target.style.height = 'auto';
            target.style.height = target.scrollHeight + 'px';
          }}
        />
        
        {/* Desktop Hover Actions */}
        <div className="absolute -right-2 top-0 opacity-0 group-hover:opacity-100 transition-all duration-200 flex flex-col gap-1 z-10 no-print transform translate-x-full hidden md:flex">
          
          {/* Move Button */}
          <button 
            onClick={() => onChange(item.id, 'type', item.type === 'service' ? 'expense' : 'service')}
            title={item.type === 'service' ? "Move to Materials / Expenses" : "Move to Labor / Services"}
            className={`p-1.5 bg-white rounded-md shadow-sm border border-slate-200 transition-colors ${
                item.type === 'service' 
                ? 'hover:bg-emerald-50 text-emerald-600 hover:border-emerald-200' 
                : 'hover:bg-indigo-50 text-indigo-600 hover:border-indigo-200'
            }`}
          >
            {item.type === 'service' ? <ArrowDown className="w-3.5 h-3.5" /> : <ArrowUp className="w-3.5 h-3.5" />}
          </button>

          <button 
            onClick={() => onPolish(item.id, item.description)}
            title="AI Polish"
            className="p-1.5 bg-white hover:bg-indigo-50 text-indigo-600 rounded-md shadow-sm border border-slate-200 hover:border-indigo-200 transition-colors"
          >
            <Wand2 className="w-3.5 h-3.5" />
          </button>
          <button 
            onClick={() => onDelete(item.id)}
            className="p-1.5 bg-white hover:bg-red-50 text-red-500 rounded-md shadow-sm border border-slate-200 hover:border-red-200 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Mobile Polish Button */}
        <button 
            onClick={() => onPolish(item.id, item.description)}
            className="md:hidden absolute right-2 bottom-2 text-indigo-400 hover:text-indigo-600 bg-white/80 rounded-full p-2 shadow-sm border border-slate-100"
        >
            <Wand2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Metrics Section - Compact Grid on Mobile, Standard Grid on Desktop */}
      <div className="grid grid-cols-2 gap-3 md:contents md:gap-0">
        
        {/* Hours/Qty */}
        <div className="bg-slate-50 p-2 rounded-lg md:bg-transparent md:p-0 md:block md:col-span-1 md:rounded-none">
           <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1 md:hidden">
             {item.type === 'service' ? 'Hrs' : 'Qty'}
           </label>
           <input 
            type="number" 
            value={item.hours}
            onChange={(e) => onChange(item.id, 'hours', e.target.value)}
            className="w-full bg-transparent text-slate-700 font-medium md:w-full md:rounded-none md:py-1 md:text-center border-none md:border-b md:border-dashed md:border-slate-200 focus:ring-0 focus:outline-none text-base md:text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none p-0"
            placeholder="0"
          />
        </div>

        {/* Rate/Cost */}
        <div className="bg-slate-50 p-2 rounded-lg md:bg-transparent md:p-0 md:block md:col-span-2 md:rounded-none">
           <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1 md:hidden">
             {item.type === 'service' ? 'Rate' : 'Cost'}
           </label>
           <input 
            type="number" 
            value={item.rate}
            onChange={(e) => onChange(item.id, 'rate', e.target.value)}
            className="w-full bg-transparent text-slate-700 font-medium md:w-full md:rounded-none md:py-1 md:text-right border-none md:border-b md:border-dashed md:border-slate-200 focus:ring-0 focus:outline-none text-base md:text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none p-0"
            placeholder="0.00"
          />
        </div>

        {/* Amount */}
        <div className="col-span-2 bg-indigo-50 p-2 rounded-lg flex items-center justify-between md:bg-transparent md:p-0 md:block md:col-span-2 md:rounded-none md:col-auto">
           <label className="text-xs font-bold text-indigo-900 md:hidden">
             Total ($)
           </label>
           <input 
            type="number" 
            value={item.amount}
            onChange={(e) => onChange(item.id, 'amount', e.target.value)}
            onBlur={() => onAmountBlur(item.id)}
            className="w-32 text-right font-bold bg-transparent text-indigo-900 md:text-slate-900 md:w-full md:rounded-none md:py-1 md:text-right border-none md:border-b md:border-dashed md:border-slate-200 focus:ring-0 focus:outline-none text-base md:text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none p-0"
            placeholder="0.00"
          />
        </div>
      </div>
    </div>
);

function App() {
  const [details, setDetails] = useState<InvoiceDetails>(() => ({
    ...INITIAL_INVOICE_DETAILS,
    number: generateInvoiceNumber() // Generate fresh number on app load
  }));
  
  const [items, setItems] = useState<LineItem[]>([
    { id: '1', type: 'service', date: '', description: 'Residential Build', hours: 0, rate: 65, amount: 0 }
  ]);
  const [isAiOpen, setIsAiOpen] = useState(false);
  const [isPdfLoading, setIsPdfLoading] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const [isLoadModalOpen, setIsLoadModalOpen] = useState(false);
  const [savedInvoices, setSavedInvoices] = useState<SavedInvoice[]>([]);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  // Derived state
  const totals = calculateTotals(items);
  const serviceItems = items.filter(i => i.type === 'service');
  const expenseItems = items.filter(i => i.type === 'expense');

  // Effect to sync counter if user manually changes the number
  useEffect(() => {
    syncInvoiceCounter(details.number);
  }, [details.number]);

  // Load saved invoices from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(SAVED_INVOICES_KEY);
      if (stored) {
        // Sort by timestamp descending (newest first)
        setSavedInvoices(JSON.parse(stored).sort((a: SavedInvoice, b: SavedInvoice) => b.timestamp - a.timestamp));
      }
    } catch (e) {
      console.error("Failed to load saved invoices", e);
    }
  }, [isLoadModalOpen]);

  // Handlers
  const handleDetailChange = (field: keyof InvoiceDetails, value: string) => {
    setDetails(prev => ({ ...prev, [field]: value }));
  };

  const handleItemChange = (id: string, field: keyof LineItem, value: string | number) => {
    setItems(prev => prev.map(item => {
      if (item.id !== id) return item;

      const updates: Partial<LineItem> = { [field]: value };
      const val = value === '' ? 0 : Number(value);

      if (field === 'type') {
         // Reset amount logic when switching types
         if (value === 'expense') {
             updates.hours = 1; // Quantity defaults to 1
             updates.rate = item.amount; // Rate becomes cost
             // Amount stays same
         } else {
             // Switching back to service
             // Don't snap logic here either, just preserve amount math
             const h = item.hours || 1;
             updates.hours = h;
             updates.rate = item.amount / h;
         }
      } else if (field === 'amount') {
          // Update amount directly without strict snapping rules yet (handled in onBlur)
          updates.amount = val;
          // Recalculate rate based on current hours to keep math consistent while typing
          const h = item.hours || 1;
          updates.hours = h;
          updates.rate = val / h;
      } else if (field === 'hours' || field === 'rate') {
        // Standard forward calculation
        const h = field === 'hours' ? val : item.hours;
        const r = field === 'rate' ? val : item.rate;
        updates.amount = calculateLineAmount(h || 0, r || 0);
      }

      return { ...item, ...updates };
    }));
  };

  const handleAmountBlur = (id: string) => {
    setItems(prev => prev.map(item => {
      if (item.id !== id) return item;
      
      // Auto-calculate metrics for Service items to fit Rate 60/65 and whole Hours
      if (item.type === 'service') {
         const metrics = calculateMetricsFromAmount(item.amount);
         return { ...item, ...metrics };
      }
      return item;
    }));
  };

  const handleAddItem = (type: LineItemType = 'service') => {
    const newItem: LineItem = {
      id: Math.random().toString(36).substr(2, 9),
      type,
      date: '',
      description: type === 'service' ? 'Residential Build' : 'Materials',
      hours: type === 'service' ? 0 : 1,
      rate: type === 'service' ? 65 : 0,
      amount: 0
    };
    setItems([...items, newItem]);
  };

  const handleDeleteItem = (id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const handleNewInvoice = () => {
    if (window.confirm("Are you sure you want to create a new invoice? This will clear all current details and generate a new number.")) {
      const nextNumber = generateInvoiceNumber();
      setDetails({
        ...INITIAL_INVOICE_DETAILS,
        number: nextNumber,
        date: formatDateToISO()
      });
      setItems([{ id: Math.random().toString(36).substr(2, 9), type: 'service', date: '', description: 'Residential Build', hours: 0, rate: 65, amount: 0 }]);
    }
  };

  const handleSaveInvoice = () => {
    try {
      const currentSaved = JSON.parse(localStorage.getItem(SAVED_INVOICES_KEY) || '[]');
      const newSave: SavedInvoice = {
        id: details.number,
        timestamp: Date.now(),
        details: details,
        items: items,
        totals: calculateTotals(items)
      };

      const existingIndex = currentSaved.findIndex((s: SavedInvoice) => s.id === details.number);
      
      if (existingIndex >= 0) {
        if (!window.confirm(`Invoice ${details.number} already exists in your saved drafts. Do you want to overwrite it?`)) {
          return;
        }
        currentSaved[existingIndex] = newSave;
      } else {
        currentSaved.push(newSave);
      }

      localStorage.setItem(SAVED_INVOICES_KEY, JSON.stringify(currentSaved));
      setSavedInvoices(currentSaved);
      // Small visual feedback could be added here, using simple alert for now
      alert(`Invoice ${details.number} saved successfully!`);
    } catch (e) {
      console.error("Save failed", e);
      alert('Failed to save invoice.');
    }
  };

  const handleLoadInvoice = (invoice: SavedInvoice) => {
    if (window.confirm(`Load invoice ${invoice.details.number}? Any unsaved changes on your current screen will be lost.`)) {
      // Normalize dates from old saved format to ISO
      const loadedDetails = {
        ...invoice.details,
        date: normalizeDateToISO(invoice.details.date)
      };
      const loadedItems = invoice.items.map(item => ({
        ...item,
        date: normalizeDateToISO(item.date || '')
      }));
      
      setDetails(loadedDetails);
      setItems(loadedItems);
      setIsLoadModalOpen(false);
    }
  };

  const handleDeleteSaved = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm("Are you sure you want to delete this saved invoice?")) {
      const updated = savedInvoices.filter(s => s.id !== id);
      localStorage.setItem(SAVED_INVOICES_KEY, JSON.stringify(updated));
      setSavedInvoices(updated);
    }
  };

  const handleCSVImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const newItems: LineItem[] = results.data.map((row: any) => {
          // Helper to find value case-insensitively in row
          const getRowValue = (...candidates: string[]) => {
            // 1. Try exact match first
            for (const c of candidates) {
              if (row[c] !== undefined && row[c] !== null && row[c] !== '') return row[c];
            }
            // 2. Try case-insensitive match against all row keys
            const rowKeys = Object.keys(row);
            for (const c of candidates) {
              const foundKey = rowKeys.find(k => k.toLowerCase() === c.toLowerCase());
              if (foundKey && row[foundKey] !== undefined && row[foundKey] !== '') return row[foundKey];
            }
            return undefined;
          };

          // Robust Column Detection
          const rawAmount = getRowValue('amount', 'total', 'line total', 'gross', 'amt');
          const rawHours = getRowValue('hours', 'hrs', 'quantity', 'qty', 'count', 'quantity (hrs)');
          const rawRate = getRowValue('rate', 'unit price', 'cost', 'price', 'unit cost', 'rate ($)');
          const rawDesc = getRowValue('description', 'item', 'activity', 'details', 'memo', 'notes', 'task');
          const rawDate = getRowValue('date', 'transaction date', 'service date', 'work date', 'invoice date');

          const rowAmount = parseFloat(rawAmount);
          const rowHours = parseFloat(rawHours);
          const rowRate = parseFloat(rawRate);
          const description = rawDesc || '';
          
          // Date Normalization
          const rowDate = normalizeDateToISO(rawDate || '');

          // Smart Type Detection
          const lowerDesc = description.toLowerCase();
          const explicitType = getRowValue('type', 'category');
          const isExplicitExpense = explicitType && explicitType.toLowerCase().includes('expense');
          const isImplicitExpense = /material|mitre 10|bunnings|placemakers|carters|itm|fuel|parking|expense|reimburse|cost|hardware|fasten|screw|nail|timber|concrete|paint|hire|consumable|store|merchant/i.test(lowerDesc);
          
          const type: LineItemType = (isExplicitExpense || isImplicitExpense) ? 'expense' : 'service';

          let finalAmount = 0;
          let finalHours = 0;
          let finalRate = 65;

          if (type === 'expense') {
            // If amount is present, use it. 
            if (!isNaN(rowAmount)) {
                finalAmount = rowAmount;
                // If rate is present (unit cost), use it. Else assume rate = amount (qty 1).
                if (!isNaN(rowRate)) {
                    finalRate = rowRate;
                    // If hours (qty) is present, use it. Else calculate or default to 1.
                    if (!isNaN(rowHours)) {
                        finalHours = rowHours;
                    } else {
                        // Try to derive quantity if missing
                        finalHours = finalAmount / finalRate; 
                        if (isNaN(finalHours) || finalHours === 0) finalHours = 1;
                    }
                } else {
                    // No rate, assume qty 1, rate = amount
                    finalHours = !isNaN(rowHours) ? rowHours : 1;
                    finalRate = finalAmount / finalHours;
                }
            } else {
                // No amount, try calculating from qty * rate
                if (!isNaN(rowHours) && !isNaN(rowRate)) {
                    finalHours = rowHours;
                    finalRate = rowRate;
                    finalAmount = finalHours * finalRate;
                }
            }
          } else {
             // Service Logic
             if (!isNaN(rowAmount) && rowAmount !== 0) {
               const metrics = calculateMetricsFromAmount(rowAmount);
               finalHours = metrics.hours;
               finalRate = metrics.rate;
               finalAmount = metrics.amount;
             } else {
                finalHours = !isNaN(rowHours) ? rowHours : 0;
                finalRate = (!isNaN(rowRate) && rowRate > 0) ? rowRate : 65;
                finalAmount = calculateLineAmount(finalHours, finalRate);
             }
          }
          
          return {
            id: Math.random().toString(36).substr(2, 9),
            type,
            date: rowDate,
            description: description || (type === 'service' ? 'Residential Build' : 'Materials'),
            hours: finalHours,
            rate: finalRate,
            amount: finalAmount
          };
        });
        setItems(prev => [...prev, ...newItems]);
      }
    });
    
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handlePDFImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsPdfLoading(true);

    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64String = e.target?.result as string;
        const base64Data = base64String.split(',')[1];
        
        if (base64Data) {
          const extractedItems = await parseInvoicePDF(base64Data);
          handleAIGeneratedItems(extractedItems);
        }
        setIsPdfLoading(false);
      };
      reader.onerror = () => setIsPdfLoading(false);
      reader.readAsDataURL(file);
    } catch (err) {
      console.error(err);
      setIsPdfLoading(false);
    }
    
    // Reset input
    if (pdfInputRef.current) pdfInputRef.current.value = '';
  };

  const generatePDFDoc = (
    docDetails: InvoiceDetails,
    docItems: LineItem[],
    docTotals: Totals
  ): jsPDF => {
    const doc = new jsPDF();
    
    doc.setFont("helvetica");

    // Header
    doc.setFontSize(20);
    doc.text(FROM_DETAILS.name, 14, 22);
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text([
      `GST: ${FROM_DETAILS.gst}`,
      `Bank: ${FROM_DETAILS.bank}`,
      `Email: ${FROM_DETAILS.email}`,
      `Phone: ${FROM_DETAILS.phone}`,
      FROM_DETAILS.address
    ], 14, 32);

    // Invoice Info Box
    doc.setTextColor(0);
    doc.setFontSize(14);
    doc.text("INVOICE", 140, 22);
    doc.setFontSize(10);
    doc.text(`Number: ${docDetails.number}`, 140, 30);
    doc.text(`Date: ${formatDateForDisplay(docDetails.date)}`, 140, 36);

    // Bill To
    doc.setFontSize(11);
    doc.text("BILL TO:", 14, 70);
    doc.setFontSize(10);
    doc.text([
      docDetails.billToName,
      docDetails.billToEmail,
      `Job Ref: ${docDetails.jobRef}`
    ], 14, 78);

    let finalY = 100;

    // Split items by type
    const serviceItems = docItems.filter(i => i.type === 'service');
    const expenseItems = docItems.filter(i => i.type === 'expense');

    // 1. Labor / Services Table
    if (serviceItems.length > 0) {
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text("Labor / Services", 14, finalY - 3);
      
      const tableData = serviceItems.map(item => [
        formatDateForDisplay(item.date || ''),
        item.description,
        item.hours.toString(),
        formatCurrency(item.rate),
        formatCurrency(item.amount)
      ]);

      autoTable(doc, {
        startY: finalY,
        head: [['Date', 'Description', 'Hours', 'Rate', 'Amount']],
        body: tableData,
        theme: 'plain',
        headStyles: { fillColor: [240, 240, 240], textColor: 0, fontStyle: 'bold' },
        styles: { fontSize: 10, cellPadding: 3 },
        columnStyles: {
          0: { cellWidth: 25 }, // Date
          1: { cellWidth: 'auto' }, // Desc
          2: { cellWidth: 15, halign: 'center' }, // Hours
          3: { cellWidth: 25, halign: 'right' }, // Rate
          4: { cellWidth: 25, halign: 'right' }  // Amount
        }
      });
      finalY = (doc as any).lastAutoTable.finalY + 15;
    }

    // 2. Expenses / Materials Table
    if (expenseItems.length > 0) {
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text("Materials / Expenses", 14, finalY - 3);

      const tableData = expenseItems.map(item => [
        formatDateForDisplay(item.date || ''),
        item.description,
        item.hours.toString(), // Qty
        formatCurrency(item.rate), // Unit Price
        formatCurrency(item.amount)
      ]);

      autoTable(doc, {
        startY: finalY,
        head: [['Date', 'Description', 'Qty', 'Cost', 'Amount']],
        body: tableData,
        theme: 'plain',
        headStyles: { fillColor: [240, 240, 240], textColor: 0, fontStyle: 'bold' },
        styles: { fontSize: 10, cellPadding: 3 },
        columnStyles: {
          0: { cellWidth: 25 }, // Date
          1: { cellWidth: 'auto' }, // Desc
          2: { cellWidth: 15, halign: 'center' }, // Qty
          3: { cellWidth: 25, halign: 'right' }, // Cost
          4: { cellWidth: 25, halign: 'right' }  // Amount
        }
      });
      finalY = (doc as any).lastAutoTable.finalY + 10;
    }

    // Totals
    const rightColX = 140;
    const valueX = 195;
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);

    doc.text("Gross (Before GST):", rightColX, finalY);
    doc.text(formatCurrency(docTotals.gross), valueX, finalY, { align: 'right' });

    doc.text("GST (15% on Labor):", rightColX, finalY + 6);
    doc.text(formatCurrency(docTotals.gst), valueX, finalY + 6, { align: 'right' });

    doc.text("Tax (20% on Labor):", rightColX, finalY + 12);
    doc.text(formatCurrency(docTotals.tax), valueX, finalY + 12, { align: 'right' });

    doc.setFont("helvetica", "bold");
    doc.text("Client to Pay:", rightColX, finalY + 20);
    doc.text(formatCurrency(docTotals.clientToPay), valueX, finalY + 20, { align: 'right' });

    doc.text("Net (You Keep):", rightColX, finalY + 26);
    doc.text(formatCurrency(docTotals.net), valueX, finalY + 26, { align: 'right' });

    // Notes
    doc.setFont("helvetica", "normal");
    doc.text("Notes:", 14, finalY + 40);
    doc.text(docDetails.notes, 14, finalY + 46, { maxWidth: 100 });
    
    return doc;
  };

  const handleDownloadPDF = () => {
    const doc = generatePDFDoc(details, items, totals);
    doc.save(`${details.number}.pdf`);
  };

  const handleShareInvoice = async () => {
    const doc = generatePDFDoc(details, items, totals);
    const fileName = `${details.number}.pdf`;
    const pdfBlob = doc.output('blob');
    const file = new File([pdfBlob], fileName, { type: 'application/pdf' });

    const shareData = {
      files: [file],
      title: `Invoice ${details.number} from ${FROM_DETAILS.name}`,
      text: `Please find attached invoice ${details.number} for ${details.jobRef}. Total: ${formatCurrency(totals.clientToPay)}`
    };

    // Check for native share support (mobile/modern browsers)
    if (navigator.canShare && navigator.canShare(shareData)) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          console.error('Error sharing:', err);
          alert('Failed to share invoice. Please try downloading instead.');
        }
      }
    } else {
      // Fallback for desktop/unsupported browsers: Mailto link
      // We cannot attach files programmatically via mailto, so we download it and ask user to attach.
      doc.save(fileName);
      
      const subject = encodeURIComponent(`Invoice ${details.number} from ${FROM_DETAILS.name}`);
      const body = encodeURIComponent(
        `Hi ${details.billToName || 'there'},\n\n` +
        `Please find attached invoice ${details.number} for ${details.jobRef}.\n\n` +
        `Total Due: ${formatCurrency(totals.clientToPay)}\n\n` +
        `Regards,\n${FROM_DETAILS.name}`
      );
      
      window.location.href = `mailto:${details.billToEmail}?subject=${subject}&body=${body}`;
      
      // Small timeout to ensure the download starts before the alert interrupts (though alert blocks usually)
      setTimeout(() => {
        alert("Opening your email client.\n\nThe PDF has been downloaded to your device - please attach it to the email manually.");
      }, 500);
    }
  };

  const handleDownloadSplitPDF = async () => {
    if (items.length === 0) return;
    
    setIsZipping(true);
    try {
      const zip = new JSZip();
      
      items.forEach((item, index) => {
        const suffix = String(index + 1).padStart(2, '0');
        const splitDetails = { 
          ...details, 
          number: `${details.number}-${suffix}` 
        };
        const splitItems = [item];
        const splitTotals = calculateTotals(splitItems);
        
        const doc = generatePDFDoc(splitDetails, splitItems, splitTotals);
        const pdfBlob = doc.output('blob');
        
        const safeDesc = item.description.slice(0, 20).replace(/[^a-z0-9]/gi, '_').toLowerCase();
        zip.file(`${splitDetails.number}_${safeDesc}.pdf`, pdfBlob);
      });

      const content = await zip.generateAsync({ type: 'blob' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(content);
      link.download = `${details.number}-individual-invoices.zip`;
      link.click();
    } catch (error) {
      console.error("Error zipping PDFs:", error);
    } finally {
      setIsZipping(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleAIGeneratedItems = (newItems: Partial<LineItem>[]) => {
    const processedItems = newItems.map(item => {
      let finalAmount = 0;
      let finalHours = 0;
      let finalRate = 65;
      const type = (item.type === 'expense' || item.type === 'service') ? item.type : 'service';

      if (type === 'expense') {
        finalAmount = item.amount || 0;
        finalHours = item.hours || 1;
        finalRate = item.rate || finalAmount;
      } else {
        // Service
        if (item.amount && item.amount !== 0) {
          const metrics = calculateMetricsFromAmount(item.amount);
          finalHours = metrics.hours;
          finalRate = metrics.rate;
          finalAmount = metrics.amount;
        } else {
          finalHours = item.hours || 0;
          finalRate = item.rate || 65;
          finalAmount = calculateLineAmount(finalHours, finalRate);
        }
      }

      return {
        id: Math.random().toString(36).substr(2, 9),
        type,
        date: normalizeDateToISO(item.date || ''), // Normalize AI dates
        description: item.description || (type === 'service' ? 'Residential Build' : 'Materials'),
        hours: finalHours,
        rate: finalRate,
        amount: finalAmount
      };
    });
    setItems(prev => [...prev, ...processedItems]);
  };

  const handlePolishDescription = async (id: string, text: string) => {
    if (!text.trim()) return;
    const polished = await polishDescription(text);
    handleItemChange(id, 'description', polished);
  };

  return (
    <div className="min-h-screen bg-slate-100 font-sans text-slate-600 pb-20 print:bg-white print:pb-0">
      
      {/* Sticky Header */}
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-xl border-b border-slate-200 print:hidden transition-all duration-300">
        <div className="max-w-6xl mx-auto px-4 lg:px-6 h-auto md:h-16 py-3 md:py-0 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3 shrink-0 self-start md:self-center">
             <div className="w-9 h-9 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold shadow-indigo-200 shadow-md">SB</div>
             <div className="flex flex-col">
               <span className="font-semibold text-slate-900 text-sm leading-tight block">Invoice Generator</span>
               <span className="text-[10px] text-slate-500 uppercase tracking-wider font-medium block">Internal Tools</span>
             </div>
          </div>

          <div className="w-full md:w-auto flex items-center gap-2 overflow-x-auto no-scrollbar py-1 mask-linear-fade">
            <button 
              onClick={() => setIsAiOpen(true)}
              className="group flex items-center gap-2 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-sm font-medium transition-all shrink-0"
            >
              <Sparkles className="w-4 h-4 group-hover:text-indigo-600 transition-colors" />
              <span className="hidden sm:inline">AI Assistant</span>
            </button>
            
            <div className="h-6 w-px bg-slate-200 mx-1 shrink-0"></div>
            
            <button 
              onClick={handleNewInvoice}
              className="flex items-center gap-2 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 hover:border-slate-300 rounded-lg text-sm font-medium transition-all shadow-sm shrink-0"
              title="Reset Form"
            >
              <RefreshCw className="w-4 h-4" />
            </button>

            <button 
              onClick={() => setIsLoadModalOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 hover:border-slate-300 rounded-lg text-sm font-medium transition-all shadow-sm shrink-0"
              title="Load Saved Invoice"
            >
              <FolderOpen className="w-4 h-4" />
              <span className="hidden sm:inline">Load</span>
            </button>

            <button 
              onClick={handleSaveInvoice}
              className="flex items-center gap-2 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 hover:border-slate-300 rounded-lg text-sm font-medium transition-all shadow-sm shrink-0"
              title="Save Invoice"
            >
              <Save className="w-4 h-4" />
              <span className="hidden sm:inline">Save</span>
            </button>

             <div className="h-6 w-px bg-slate-200 mx-1 shrink-0"></div>

             <button 
              onClick={() => pdfInputRef.current?.click()}
              disabled={isPdfLoading}
              className="flex items-center gap-2 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 hover:border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-all shadow-sm shrink-0"
            >
              {isPdfLoading ? <Loader2 className="w-4 h-4 animate-spin text-indigo-600" /> : <FileText className="w-4 h-4" />}
              <span className="hidden sm:inline">Import PDF</span>
            </button>
            <input type="file" ref={pdfInputRef} onChange={handlePDFImport} accept=".pdf" className="hidden" />

            <button 
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 hover:border-slate-300 rounded-lg text-sm font-medium transition-all shadow-sm shrink-0"
            >
              <Upload className="w-4 h-4" />
              <span className="hidden sm:inline">CSV</span>
            </button>

            <div className="h-6 w-px bg-slate-200 mx-1 shrink-0"></div>

            <button 
              onClick={handlePrint}
              className="flex items-center gap-2 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 hover:border-slate-300 rounded-lg text-sm font-medium transition-all shadow-sm shrink-0"
              title="Print"
            >
              <Printer className="w-4 h-4" />
            </button>

            <button 
              onClick={handleShareInvoice}
              className="flex items-center gap-2 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 hover:border-slate-300 rounded-lg text-sm font-medium transition-all shadow-sm shrink-0"
              title="Share / Email Invoice"
            >
              <Send className="w-4 h-4" />
              <span className="hidden sm:inline">Share</span>
            </button>
            
            <button 
              onClick={handleDownloadSplitPDF}
              disabled={isZipping || items.length === 0}
              className="flex items-center gap-2 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 hover:border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-all shadow-sm shrink-0"
              title="Split & Zip"
            >
              {isZipping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Files className="w-4 h-4" />}
              <span className="hidden sm:inline">Split & Zip</span>
            </button>

            <button 
              onClick={handleDownloadPDF}
              className="flex items-center gap-2 px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-medium transition-all shadow-lg shadow-slate-900/20 shrink-0"
            >
              <Download className="w-4 h-4" />
              <span>Download</span>
            </button>
          </div>
        </div>
      </header>

      <AIAssistant 
        isOpen={isAiOpen} 
        onClose={() => setIsAiOpen(false)} 
        onAddItems={handleAIGeneratedItems} 
      />

      {/* Load Invoice Modal */}
      {isLoadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden border border-gray-100 flex flex-col max-h-[80vh]">
             <div className="p-4 border-b flex justify-between items-center bg-slate-50">
                <div className="flex items-center gap-2">
                  <FolderOpen className="w-5 h-5 text-indigo-600" />
                  <h3 className="font-bold text-lg text-slate-800">Saved Invoices</h3>
                </div>
                <button onClick={() => setIsLoadModalOpen(false)} className="hover:bg-slate-200 p-1 rounded-full"><X className="w-5 h-5 text-slate-500"/></button>
             </div>
             
             <div className="overflow-y-auto p-4 space-y-2 flex-1">
                {savedInvoices.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-40 text-slate-400">
                    <Save className="w-10 h-10 mb-2 opacity-20" />
                    <p>No saved invoices found.</p>
                  </div>
                ) : (
                  savedInvoices.map(inv => (
                     <div 
                        key={inv.id} 
                        onClick={() => handleLoadInvoice(inv)} 
                        className="group flex justify-between items-center p-4 border border-slate-100 rounded-lg hover:border-indigo-200 hover:bg-indigo-50/50 cursor-pointer transition-all"
                     >
                        <div>
                           <div className="flex items-center gap-2">
                             <span className="font-bold text-indigo-700">{inv.details.number}</span>
                             <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full border border-slate-200">{formatDateForDisplay(inv.details.date)}</span>
                           </div>
                           <div className="text-sm text-slate-600 mt-1">{inv.details.billToName || 'Unknown Client'}</div>
                           <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                             <Clock className="w-3 h-3" />
                             Last saved: {new Date(inv.timestamp).toLocaleString()}
                           </div>
                        </div>
                        
                        <div className="flex items-center gap-6">
                           <div className="text-right">
                              <div className="text-xs text-slate-400 uppercase font-medium tracking-wider">Total</div>
                              <div className="font-bold text-slate-800">{formatCurrency(inv.totals.clientToPay)}</div>
                           </div>
                           <button 
                              onClick={(e) => handleDeleteSaved(inv.id, e)} 
                              className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
                              title="Delete Saved Invoice"
                            >
                              <Trash2 className="w-4 h-4" />
                           </button>
                        </div>
                     </div>
                  ))
                )}
             </div>
             <div className="p-3 border-t bg-slate-50 text-center text-xs text-slate-400">
                Invoices are saved to your browser's local storage.
             </div>
          </div>
        </div>
      )}

      {/* Main Invoice Sheet */}
      <main className="max-w-[210mm] mx-auto mt-4 md:mt-12 px-4 print:mt-0 print:px-0 print:max-w-none">
        <div className="bg-white rounded-xl shadow-2xl shadow-slate-200/60 ring-1 ring-slate-900/5 overflow-hidden print-container transition-all duration-500">
          
          {/* Top Branding Section */}
          <div className="relative bg-white p-6 md:p-12 print-p-12 border-b border-slate-100">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500"></div>
            
            <div className="flex flex-col md:flex-row justify-between items-start gap-6 md:gap-8">
              <div>
                <h2 className="text-2xl font-bold text-slate-900 mb-4 tracking-tight">{FROM_DETAILS.name}</h2>
                <div className="text-sm text-slate-500 space-y-1.5 font-medium">
                  <p className="flex items-center gap-2">
                    <span className="text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">GST</span>
                    {FROM_DETAILS.gst}
                  </p>
                  <p>{FROM_DETAILS.bank}</p>
                  <p>{FROM_DETAILS.email}</p>
                  <p>{FROM_DETAILS.phone}</p>
                  <p className="text-slate-400 font-normal">{FROM_DETAILS.address}</p>
                </div>
              </div>

              <div className="text-left md:text-right w-full md:w-auto">
                <h1 className="text-3xl md:text-4xl font-light text-slate-200 mb-6 tracking-tight uppercase select-none">Invoice</h1>
                
                <div className="flex flex-col items-start md:items-end gap-3 w-full">
                   <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Invoice #</label>
                      <input 
                        type="text" 
                        value={details.number}
                        onChange={(e) => handleDetailChange('number', e.target.value)}
                        className="text-right font-mono font-medium text-slate-700 border-b border-transparent hover:border-slate-200 focus:border-indigo-500 focus:outline-none transition-colors w-40 bg-transparent py-2 md:py-1 text-base md:text-sm"
                      />
                   </div>
                   <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Date</label>
                      <input 
                        type="date" 
                        value={details.date}
                        onChange={(e) => handleDetailChange('date', e.target.value)}
                        className="text-right font-medium text-slate-700 border-b border-transparent hover:border-slate-200 focus:border-indigo-500 focus:outline-none transition-colors w-40 bg-transparent py-2 md:py-1 text-base md:text-sm"
                      />
                   </div>
                </div>
              </div>
            </div>
          </div>

          {/* Client Details Section */}
          <div className="px-6 md:px-12 py-8 print-p-12 print:pt-0">
             <div className="w-full md:max-w-md bg-slate-50/50 rounded-lg p-6 border border-slate-100 print:bg-transparent print:border-none print:p-0">
                <h3 className="text-xs font-bold text-indigo-500 uppercase tracking-wider mb-4">Bill To</h3>
                <div className="space-y-3">
                  <input 
                    type="text" 
                    value={details.billToName}
                    onChange={(e) => handleDetailChange('billToName', e.target.value)}
                    className="w-full font-bold text-lg text-slate-900 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-indigo-500 focus:outline-none transition-colors placeholder:text-slate-300 text-base md:text-lg py-1"
                    placeholder="Client Name"
                  />
                  <input 
                    type="text" 
                    value={details.billToEmail}
                    onChange={(e) => handleDetailChange('billToEmail', e.target.value)}
                    className="w-full text-slate-600 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-indigo-500 focus:outline-none transition-colors placeholder:text-slate-300 text-base md:text-sm py-1"
                    placeholder="client@email.com"
                  />
                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-slate-400 font-medium text-xs uppercase tracking-wider">Ref:</span>
                    <input 
                      type="text" 
                      value={details.jobRef}
                      onChange={(e) => handleDetailChange('jobRef', e.target.value)}
                      className="flex-1 text-slate-700 font-medium bg-transparent border-b border-transparent hover:border-slate-300 focus:border-indigo-500 focus:outline-none transition-colors text-base md:text-sm py-1"
                    />
                  </div>
                </div>
             </div>
          </div>

          {/* LABOR SECTION */}
          <div className="px-6 md:px-12 pt-4 pb-4 print-p-12 print:pb-0">
             <h3 className="text-sm font-bold text-indigo-900 uppercase tracking-wider mb-4 flex items-center gap-2 pb-2 border-b border-indigo-100">
               <Hammer className="w-4 h-4 text-indigo-500"/> Labor / Services
             </h3>
             
             {/* Header Row - Labor */}
             <div className="hidden md:grid grid-cols-12 gap-4 border-b border-slate-100 pb-2 mb-2">
               <div className="col-span-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-2">Date</div>
               <div className="col-span-5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Description</div>
               <div className="col-span-1 text-center text-[10px] font-bold text-slate-400 uppercase tracking-wider">Hours</div>
               <div className="col-span-2 text-right text-[10px] font-bold text-slate-400 uppercase tracking-wider">Rate</div>
               <div className="col-span-2 text-right text-[10px] font-bold text-slate-400 uppercase tracking-wider pr-2">Amount</div>
             </div>

             <div className="space-y-2 mb-6">
               {serviceItems.length > 0 ? (
                 serviceItems.map(item => (
                   <LineItemRow 
                     key={item.id} 
                     item={item} 
                     onChange={handleItemChange}
                     onPolish={handlePolishDescription}
                     onDelete={handleDeleteItem}
                     onAmountBlur={handleAmountBlur}
                   />
                 ))
               ) : (
                 <p className="text-slate-400 italic text-sm py-4 text-center border-dashed border border-slate-200 rounded-lg">No labor items added.</p>
               )}
             </div>

             <button 
                onClick={() => handleAddItem('service')}
                className="flex items-center justify-center w-full md:w-auto gap-2 px-4 py-3 md:py-2 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg text-sm font-medium transition-colors no-print shadow-sm border border-indigo-100"
              >
                <Plus className="w-4 h-4" />
                Add Labor Item
              </button>
          </div>

          {/* EXPENSES SECTION */}
          <div className="px-6 md:px-12 pt-4 pb-8 print-p-12 print:pb-0">
             <h3 className="text-sm font-bold text-emerald-900 uppercase tracking-wider mb-4 flex items-center gap-2 pb-2 border-b border-emerald-100">
               <Tag className="w-4 h-4 text-emerald-500"/> Materials / Expenses
             </h3>

             {/* Header Row - Expenses */}
             <div className="hidden md:grid grid-cols-12 gap-4 border-b border-slate-100 pb-2 mb-2">
               <div className="col-span-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-2">Date</div>
               <div className="col-span-5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Description</div>
               <div className="col-span-1 text-center text-[10px] font-bold text-slate-400 uppercase tracking-wider">Qty</div>
               <div className="col-span-2 text-right text-[10px] font-bold text-slate-400 uppercase tracking-wider">Cost</div>
               <div className="col-span-2 text-right text-[10px] font-bold text-slate-400 uppercase tracking-wider pr-2">Amount</div>
             </div>

             <div className="space-y-2 mb-6">
                {expenseItems.length > 0 ? (
                   expenseItems.map(item => (
                     <LineItemRow 
                       key={item.id} 
                       item={item} 
                       onChange={handleItemChange}
                       onPolish={handlePolishDescription}
                       onDelete={handleDeleteItem}
                       onAmountBlur={handleAmountBlur}
                     />
                   ))
                ) : (
                   <p className="text-slate-400 italic text-sm py-4 text-center border-dashed border border-slate-200 rounded-lg">No expense items added.</p>
                )}
             </div>

             <button 
                onClick={() => handleAddItem('expense')}
                className="flex items-center justify-center w-full md:w-auto gap-2 px-4 py-3 md:py-2 text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-lg text-sm font-medium transition-colors no-print shadow-sm border border-emerald-100"
              >
                <Plus className="w-4 h-4" />
                Add Expense Item
              </button>
          </div>

          {/* Footer Section */}
          <div className="p-6 md:p-12 print-p-12 border-t border-slate-100 mt-4 md:mt-8 bg-slate-50/30 print:bg-transparent print:border-none print:mt-0">
            <div className="flex flex-col md:flex-row gap-8 md:gap-12">
              
              {/* Notes Area */}
              <div className="flex-1 order-2 md:order-1">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Notes / Payment Terms</h3>
                <textarea 
                  value={details.notes}
                  onChange={(e) => handleDetailChange('notes', e.target.value)}
                  className="w-full h-32 bg-white border border-slate-200 rounded-lg p-3 text-base md:text-sm text-slate-600 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 resize-none transition-all print:bg-transparent print:border-none print:p-0"
                />
              </div>
              
              {/* Totals Display */}
              <div className="w-full md:w-80 space-y-6 order-1 md:order-2">
                {/* Client Payable Section */}
                <div className="space-y-3 pb-6 border-b border-slate-200">
                  <div className="flex justify-between text-sm text-slate-600">
                    <span>Subtotal <span className="text-xs text-slate-400">(excl. GST)</span></span>
                    <span className="font-medium">{formatCurrency(totals.gross)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-slate-600">
                    <span>GST (15% on Labor)</span>
                    <span className="font-medium">{formatCurrency(totals.gst)}</span>
                  </div>
                  
                  <div className="pt-3 flex justify-between items-end">
                    <span className="text-base font-bold text-slate-900 uppercase tracking-wide">Total to Pay</span>
                    <span className="text-2xl font-bold text-indigo-600 tracking-tight">{formatCurrency(totals.clientToPay)}</span>
                  </div>
                </div>
                
                {/* User Income Estimation Section */}
                <div className="space-y-2 pt-2">
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>Less Withholding Tax (Est. 20%)</span>
                    <span>- {formatCurrency(totals.tax)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-emerald-700 font-bold bg-emerald-50 px-3 py-2 rounded-lg border border-emerald-100">
                    <span>Net Income (Est)</span>
                    <span>{formatCurrency(totals.net)}</span>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="mt-16 text-center print:hidden">
              <p className="text-xs text-slate-300 font-medium uppercase tracking-widest">Designed for STR8 Builders</p>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}

export default App;