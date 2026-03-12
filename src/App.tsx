import React, { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { 
  Settings, Camera, Upload, Trash2, Plus, Minus, X, Sun, Moon, Monitor,
  Globe, Database, History, ShoppingCart, Save, CheckCircle2, ChevronRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Language, Theme, Tab, InventoryItem, DatabaseItem, SaleRecord, AppSettings } from './types';
import { translations } from './translations';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  // --- State ---
  const [activeTab, setActiveTab] = useState<Tab>('scanner');
  const [items, setItems] = useState<InventoryItem[]>(() => {
    const saved = localStorage.getItem('scanstock_items');
    return saved ? JSON.parse(saved) : [];
  });
  
  const [database, setDatabase] = useState<DatabaseItem[]>(() => {
    const saved = localStorage.getItem('scanstock_database');
    return saved ? JSON.parse(saved) : [];
  });

  const [history, setHistory] = useState<SaleRecord[]>(() => {
    const saved = localStorage.getItem('scanstock_history');
    const records: SaleRecord[] = saved ? JSON.parse(saved) : [];
    // Filter last 30 days
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    return records.filter(r => r.timestamp > thirtyDaysAgo);
  });

  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem('scanstock_settings');
    return saved ? JSON.parse(saved) : { language: 'en', theme: 'system' };
  });

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const [registeringProduct, setRegisteringProduct] = useState<{barcode: string, name: string, price: string} | null>(null);
  
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const t = translations[settings.language];

  // --- Effects ---
  useEffect(() => {
    localStorage.setItem('scanstock_items', JSON.stringify(items));
  }, [items]);

  useEffect(() => {
    localStorage.setItem('scanstock_database', JSON.stringify(database));
  }, [database]);

  useEffect(() => {
    localStorage.setItem('scanstock_history', JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    localStorage.setItem('scanstock_settings', JSON.stringify(settings));
    
    const applyTheme = () => {
      const theme = settings.theme;
      let isDark = theme === 'dark';
      if (theme === 'system') {
        isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      }
      
      const root = document.documentElement;
      if (isDark) {
        root.classList.add('dark');
        root.style.colorScheme = 'dark';
        document.body.classList.add('dark');
        document.body.style.backgroundColor = '#0c0a09'; // stone-950
      } else {
        root.classList.remove('dark');
        root.style.colorScheme = 'light';
        document.body.classList.remove('dark');
        document.body.style.backgroundColor = '#f5f5f5'; // Requested light bg
      }
    };

    applyTheme();

    if (settings.theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = () => applyTheme();
      mediaQuery.addEventListener('change', handler);
      return () => mediaQuery.removeEventListener('change', handler);
    }

    document.documentElement.dir = t.dir;
    document.documentElement.lang = settings.language;
  }, [settings.theme, settings.language, t.dir]);

  // --- Logic ---
  const handleScan = (barcode: string) => {
    if (activeTab === 'database') {
      setRegisteringProduct({ barcode, name: '', price: '' });
      stopScanner();
      return;
    }

    const dbItem = database.find(d => d.barcode === barcode);
    
    setItems(prev => {
      const existingIndex = prev.findIndex(item => item.barcode === barcode);
      if (existingIndex > -1) {
        const newItems = [...prev];
        newItems[existingIndex] = {
          ...newItems[existingIndex],
          quantity: newItems[existingIndex].quantity + 1,
          timestamp: Date.now()
        };
        return newItems;
      } else {
        const newItem: InventoryItem = {
          id: Math.random().toString(36).substr(2, 9),
          barcode,
          name: dbItem ? dbItem.name : `${t.unknownItem} (${barcode.slice(-4)})`,
          price: dbItem ? dbItem.price : 0,
          quantity: 1,
          timestamp: Date.now()
        };
        return [newItem, ...prev];
      }
    });
    setLastScanned(barcode);
    setTimeout(() => setLastScanned(null), 2000);
  };

  const saveToDatabase = () => {
    if (!registeringProduct) return;
    const newItem: DatabaseItem = {
      barcode: registeringProduct.barcode,
      name: registeringProduct.name || t.unknownItem,
      price: parseFloat(registeringProduct.price) || 0
    };
    setDatabase(prev => {
      const filtered = prev.filter(d => d.barcode !== newItem.barcode);
      return [newItem, ...filtered];
    });
    setRegisteringProduct(null);
  };

  const checkout = () => {
    if (items.length === 0) return;
    const total = items.reduce((acc, item) => acc + item.price * item.quantity, 0);
    const record: SaleRecord = {
      id: Math.random().toString(36).substr(2, 9),
      items: [...items],
      total,
      timestamp: Date.now()
    };
    setHistory(prev => [record, ...prev]);
    setItems([]);
    setLastScanned('sale_complete');
    setTimeout(() => setLastScanned(null), 3000);
  };

  const startScanner = async () => {
    try {
      const html5QrCode = new Html5Qrcode("reader");
      scannerRef.current = html5QrCode;
      setIsScanning(true);
      
      await html5QrCode.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 }
        },
        (decodedText) => {
          handleScan(decodedText);
        },
        () => {}
      );
    } catch (err) {
      console.error("Failed to start scanner", err);
      setIsScanning(false);
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current = null;
        setIsScanning(false);
      } catch (err) {
        console.error("Failed to stop scanner", err);
      }
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const html5QrCode = new Html5Qrcode("reader");
    html5QrCode.scanFile(file, true)
      .then(decodedText => handleScan(decodedText))
      .catch(err => console.error("Error scanning file", err));
  };

  const totalAmount = items.reduce((acc, item) => acc + item.price * item.quantity, 0);

  return (
    <div className="fixed inset-0 bg-stone-950 text-stone-900 font-sans flex flex-col overflow-hidden">
      {/* Header */}
      <header className="flex-none px-6 py-4 flex items-center justify-between border-b border-stone-200">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <svg viewBox="0 0 100 100" className="w-5 h-5 fill-white">
              <path d="M30 30h5v40h-5zM40 30h2v40h-2zM47 30h8v40h-8zM60 30h2v40h-2zM67 30h3v40h-3zM75 30h5v40h-5z" />
            </svg>
          </div>
          <h1 className="text-xl font-black tracking-tighter uppercase">{t.title}</h1>
        </div>
        <button 
          onClick={() => setIsSettingsOpen(true)}
          className="p-2 rounded-xl hover:bg-stone-200 transition-colors"
        >
          <Settings className="w-6 h-6" />
        </button>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden">
        <AnimatePresence mode="wait">
          {activeTab === 'scanner' && (
            <motion.div 
              key="scanner"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="p-6 space-y-6"
            >
              {/* Scanner View */}
              <div className="relative aspect-square max-w-sm mx-auto bg-stone-200 rounded-[2.5rem] overflow-hidden shadow-2xl shadow-stone-200 dark:shadow-none">
                <div id="reader" className="w-full h-full"></div>
                {!isScanning && (
                  <button 
                    onClick={startScanner}
                    className="absolute inset-0 flex flex-col items-center justify-center gap-4 group"
                  >
                    <div className="w-20 h-20 rounded-full bg-emerald-500 flex items-center justify-center text-white shadow-xl shadow-emerald-500/40 group-hover:scale-110 transition-transform">
                      <Camera className="w-10 h-10" />
                    </div>
                    <span className="font-bold text-stone-900 uppercase tracking-widest text-xs">{t.startScanning}</span>
                  </button>
                )}
                {isScanning && (
                  <button 
                    onClick={stopScanner}
                    className="absolute bottom-6 left-1/2 -translate-x-1/2 px-6 py-2 bg-white/20 backdrop-blur-md border border-white/30 rounded-full text-white text-sm font-bold uppercase tracking-wider"
                  >
                    {t.stopScanning}
                  </button>
                )}
                
                <AnimatePresence>
                  {lastScanned && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      className="absolute inset-0 flex items-center justify-center pointer-events-none"
                    >
                      <div className="bg-emerald-500 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3">
                        <CheckCircle2 className="w-6 h-6" />
                        <span className="font-bold">{lastScanned === 'sale_complete' ? t.saleComplete : t.itemAdded}</span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Current Sale List */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-black uppercase tracking-tight">{t.inventory}</h2>
                  <label className="p-2 rounded-xl bg-stone-200 cursor-pointer">
                    <Upload className="w-5 h-5" />
                    <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
                  </label>
                </div>

                <div className="space-y-3">
                  {items.length === 0 ? (
                    <div className="py-12 text-center text-stone-500 font-bold uppercase tracking-widest text-sm">
                      {t.noItems}
                    </div>
                  ) : (
                    items.map((item) => (
                      <motion.div 
                        layout
                        key={item.id}
                        className="bg-stone-200 p-4 rounded-2xl flex items-center justify-between gap-4"
                      >
                        <div className="flex-1 min-w-0">
                          <h3 className="font-bold truncate">{item.name}</h3>
                          <div className="flex items-center gap-2 text-xs text-stone-500 mt-1">
                            <span className="font-mono">{item.barcode}</span>
                            <span>•</span>
                            <span className="font-bold text-emerald-600">${item.price}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center bg-stone-950 rounded-xl p-1 shadow-sm">
                            <button onClick={() => setItems(prev => prev.map(i => i.id === item.id ? {...i, quantity: Math.max(1, i.quantity - 1)} : i))} className="p-1"><Minus className="w-4 h-4" /></button>
                            <span className="w-6 text-center font-bold text-sm">{item.quantity}</span>
                            <button onClick={() => setItems(prev => prev.map(i => i.id === item.id ? {...i, quantity: i.quantity + 1} : i))} className="p-1"><Plus className="w-4 h-4" /></button>
                          </div>
                          <button onClick={() => setItems(prev => prev.filter(i => i.id !== item.id))} className="text-stone-500 hover:text-red-500 transition-colors"><Trash2 className="w-5 h-5" /></button>
                        </div>
                      </motion.div>
                    ))
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'database' && (
            <motion.div 
              key="database"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="p-6 space-y-6"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-black uppercase tracking-tighter">{t.database}</h2>
                <button 
                  onClick={startScanner}
                  className="px-4 py-2 bg-emerald-500 text-white rounded-xl font-bold text-sm uppercase tracking-wider shadow-lg shadow-emerald-500/20"
                >
                  {t.scanBarcode}
                </button>
              </div>

              <div className="grid gap-4">
                {database.length === 0 ? (
                  <div className="py-20 text-center text-stone-500 font-bold uppercase tracking-widest text-sm">
                    {t.noItems}
                  </div>
                ) : (
                  database.map((item) => (
                    <div key={item.barcode} className="bg-stone-200 p-5 rounded-3xl flex items-center justify-between">
                      <div>
                        <h3 className="font-bold text-lg">{item.name}</h3>
                        <p className="text-sm text-stone-500 font-mono">{item.barcode}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-black text-emerald-500">${item.price}</p>
                        <button onClick={() => setDatabase(prev => prev.filter(d => d.barcode !== item.barcode))} className="text-stone-500 mt-2"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'history' && (
            <motion.div 
              key="history"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="p-6 space-y-6"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-black uppercase tracking-tighter">{t.history}</h2>
                <span className="text-xs font-bold text-stone-500 uppercase tracking-widest">{t.last30Days}</span>
              </div>

              <div className="space-y-4">
                {history.length === 0 ? (
                  <div className="py-20 text-center text-stone-500 font-bold uppercase tracking-widest text-sm">
                    {t.noHistory}
                  </div>
                ) : (
                  history.map((record) => (
                    <div key={record.id} className="bg-stone-200 p-5 rounded-3xl">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <p className="text-xs font-bold text-stone-500 uppercase">{new Date(record.timestamp).toLocaleString(settings.language)}</p>
                          <p className="font-bold text-stone-500">{record.items.length} {t.items}</p>
                        </div>
                        <p className="text-2xl font-black text-emerald-500">${record.total.toFixed(2)}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {record.items.slice(0, 3).map(item => (
                          <span key={item.id} className="text-[10px] font-bold bg-stone-950 px-2 py-1 rounded-full uppercase">{item.name} x{item.quantity}</span>
                        ))}
                        {record.items.length > 3 && <span className="text-[10px] font-bold text-stone-500">+{record.items.length - 3}</span>}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer Navigation */}
      <nav className="flex-none px-6 py-4 bg-stone-950 border-t border-stone-200 flex items-center justify-around">
        <button 
          onClick={() => setActiveTab('scanner')}
          className={cn("flex flex-col items-center gap-1 transition-all", activeTab === 'scanner' ? "text-emerald-500 scale-110" : "text-stone-900/40")}
        >
          <ShoppingCart className="w-6 h-6" />
          <span className="text-[10px] font-bold uppercase tracking-tighter">{t.inventory}</span>
        </button>
        <button 
          onClick={() => setActiveTab('database')}
          className={cn("flex flex-col items-center gap-1 transition-all", activeTab === 'database' ? "text-emerald-500 scale-110" : "text-stone-900/40")}
        >
          <Database className="w-6 h-6" />
          <span className="text-[10px] font-bold uppercase tracking-tighter">{t.database}</span>
        </button>
        <button 
          onClick={() => setActiveTab('history')}
          className={cn("flex flex-col items-center gap-1 transition-all", activeTab === 'history' ? "text-emerald-500 scale-110" : "text-stone-900/40")}
        >
          <History className="w-6 h-6" />
          <span className="text-[10px] font-bold uppercase tracking-tighter">{t.history}</span>
        </button>
      </nav>

      {/* Checkout Bar */}
      {activeTab === 'scanner' && items.length > 0 && (
        <motion.div 
          initial={{ y: 100 }}
          animate={{ y: 0 }}
          className="absolute bottom-24 left-6 right-6 bg-stone-200 p-4 rounded-[2rem] flex items-center justify-between shadow-2xl"
        >
          <div className="pl-2">
            <p className="text-[10px] font-bold text-stone-900/60 uppercase tracking-widest">{t.total}</p>
            <p className="text-xl font-black text-stone-900">${totalAmount.toFixed(2)}</p>
          </div>
          <button 
            onClick={checkout}
            className="bg-emerald-500 text-white px-8 py-3 rounded-2xl font-black uppercase tracking-widest text-sm shadow-lg shadow-emerald-500/40"
          >
            {t.checkout}
          </button>
        </motion.div>
      )}

      {/* Modals */}
      <AnimatePresence>
        {/* Register Product Modal */}
        {registeringProduct && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-stone-950/60 backdrop-blur-md" />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full max-w-md bg-stone-950 rounded-[3rem] p-8 shadow-2xl"
            >
              <h2 className="text-2xl font-black uppercase tracking-tighter mb-6">{t.registerProduct}</h2>
              <div className="space-y-4">
                <div className="p-4 bg-stone-200 rounded-2xl">
                  <p className="text-[10px] font-bold text-stone-500 uppercase mb-1">{t.barcode}</p>
                  <p className="font-mono font-bold">{registeringProduct.barcode}</p>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-stone-500 uppercase ml-2">{t.productName}</label>
                  <input 
                    autoFocus
                    value={registeringProduct.name}
                    onChange={e => setRegisteringProduct({...registeringProduct, name: e.target.value})}
                    className="w-full p-4 bg-stone-200 rounded-2xl font-bold outline-none focus:ring-2 ring-emerald-500"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-stone-500 uppercase ml-2">{t.productPrice}</label>
                  <input 
                    type="number"
                    value={registeringProduct.price}
                    onChange={e => setRegisteringProduct({...registeringProduct, price: e.target.value})}
                    className="w-full p-4 bg-stone-200 rounded-2xl font-bold outline-none focus:ring-2 ring-emerald-500"
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-8">
                <button onClick={() => setRegisteringProduct(null)} className="flex-1 py-4 rounded-2xl font-bold uppercase text-stone-500">{t.cancel}</button>
                <button onClick={saveToDatabase} className="flex-2 py-4 bg-emerald-500 text-white rounded-2xl font-bold uppercase tracking-widest shadow-lg shadow-emerald-500/20">{t.save}</button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Settings Modal */}
        {isSettingsOpen && (
          <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsSettingsOpen(false)} className="absolute inset-0 bg-stone-950/40 backdrop-blur-sm" />
            <motion.div 
              initial={{ y: 100 }} animate={{ y: 0 }} exit={{ y: 100 }}
              className="relative w-full max-w-md bg-stone-950 rounded-t-[3rem] sm:rounded-[3rem] p-8 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-2xl font-black uppercase tracking-tighter">{t.settings}</h2>
                <button onClick={() => setIsSettingsOpen(false)} className="p-2 rounded-full hover:bg-stone-200"><X className="w-6 h-6" /></button>
              </div>

              <div className="space-y-8">
                <div className="space-y-3">
                  <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest ml-2">{t.language}</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['en', 'fr', 'ar'] as Language[]).map((lang) => (
                      <button
                        key={lang}
                        onClick={() => setSettings(s => ({ ...s, language: lang }))}
                        className={cn(
                          "py-3 rounded-2xl border-2 transition-all font-bold text-xs",
                          settings.language === lang 
                            ? "border-emerald-500 bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"
                            : "border-stone-200"
                        )}
                      >
                        {lang.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest ml-2">{t.theme}</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['light', 'dark', 'system'] as Theme[]).map((theme) => (
                      <button
                        key={theme}
                        onClick={() => setSettings(s => ({ ...s, theme }))}
                        className={cn(
                          "py-4 rounded-2xl border-2 transition-all flex flex-col items-center justify-center gap-2 font-bold text-[10px]",
                          settings.theme === theme 
                            ? "border-emerald-500 bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"
                            : "border-stone-200"
                        )}
                      >
                        {theme === 'light' && <Sun className="w-4 h-4" />}
                        {theme === 'dark' && <Moon className="w-4 h-4" />}
                        {theme === 'system' && <Monitor className="w-4 h-4" />}
                        {t[theme].toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <button onClick={() => setIsSettingsOpen(false)} className="w-full mt-10 py-5 rounded-3xl bg-stone-200 text-stone-900 font-black uppercase tracking-widest text-sm hover:bg-stone-300 transition-colors">OK</button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
