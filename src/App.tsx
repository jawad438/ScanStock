import React, { useState, useEffect, useRef } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { 
  Settings, Camera, Upload, Trash2, Plus, Minus, X, Sun, Moon, Monitor,
  Globe, Database, History, ShoppingCart, Save, CheckCircle2, ChevronRight,
  Zap, ZapOff, Download, LogOut, FileSpreadsheet, ListPlus, Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Language, Theme, Tab, InventoryItem, DatabaseItem, SaleRecord, AppSettings } from './types';
import { translations } from './translations';
import { auth } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import Auth from './components/Auth';
import { getSupermarketData, saveSupermarketData } from './services/githubService';
import * as XLSX from 'xlsx';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  // --- Auth State ---
  const [user, setUser] = useState<{ email: string } | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // --- State ---
  const [activeTab, setActiveTab] = useState<Tab>('scanner');
  const [items, setItems] = useState<InventoryItem[]>(() => {
    const saved = localStorage.getItem('scanstock_items');
    return saved ? JSON.parse(saved) : [];
  });
  
  const [database, setDatabase] = useState<DatabaseItem[]>([]);
  const [token, setToken] = useState<string>('');

  const [history, setHistory] = useState<SaleRecord[]>(() => {
    const saved = localStorage.getItem('scanstock_history');
    const records: SaleRecord[] = saved ? JSON.parse(saved) : [];
    // Filter last 30 days
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    return records.filter(r => r.timestamp > thirtyDaysAgo);
  });

  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem('scanstock_settings');
    return saved ? JSON.parse(saved) : { language: 'en', theme: 'system', currency: 'DZD' };
  });

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isManualEntryOpen, setIsManualEntryOpen] = useState(false);
  const [isBulkAddOpen, setIsBulkAddOpen] = useState(false);
  const [bulkItems, setBulkItems] = useState<{ barcode: string, name: string, price: string }[]>([]);
  const [manualEntry, setManualEntry] = useState({ name: '', price: '', quantity: '1' });
  const [isScanning, setIsScanning] = useState(false);
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const [registeringProduct, setRegisteringProduct] = useState<{barcode: string, name: string, price: string} | null>(null);
  const [editingProduct, setEditingProduct] = useState<DatabaseItem | null>(null);
  
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const databaseRef = useRef<DatabaseItem[]>(database);
  const lastDetectedBarcode = useRef<string | null>(null);
  const clearBarcodeTimeout = useRef<NodeJS.Timeout | null>(null);
  const t = translations[settings.language];

  // --- Auth & Sync Effects ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser && firebaseUser.email) {
        setUser({ email: firebaseUser.email });
        // Fetch data from GitHub
        setIsSyncing(true);
        const data = await getSupermarketData(firebaseUser.email);
        if (data) {
          setDatabase(data.products);
          setToken(data.token);
        }
        setIsSyncing(false);
      } else {
        setUser(null);
        setDatabase([]);
        setToken('');
      }
      setIsAuthReady(true);
    });
    return unsubscribe;
  }, []);

  const syncToGitHub = async (newDatabase: DatabaseItem[]) => {
    if (!user) return;
    setIsSyncing(true);
    try {
      await saveSupermarketData({
        email: user.email,
        token: token,
        products: newDatabase
      });
    } catch (err) {
      console.error("Sync error:", err);
      alert("Failed to sync with GitHub. Please check your connection.");
    } finally {
      setIsSyncing(false);
    }
  };

  // --- Effects ---
  useEffect(() => {
    databaseRef.current = database;
    
    // Sync items with database when database changes (e.g. unknown items get names)
    setItems(prev => prev.map(item => {
      const dbItem = database.find(d => d.barcode === item.barcode);
      if (dbItem && (item.name.startsWith(t.unknownItem) || item.price === 0)) {
        return { ...item, name: dbItem.name, price: dbItem.price };
      }
      return item;
    }));
  }, [database, t.unknownItem]);
  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(console.error);
      }
    };
  }, []);

  useEffect(() => {
    stopScanner();
  }, [activeTab]);

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
  const playScanSound = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.type = 'triangle';
      oscillator.frequency.setValueAtTime(1200, audioCtx.currentTime); // Higher frequency for better audibility
      
      gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
      gainNode.gain.linearRampToValueAtTime(3.0, audioCtx.currentTime + 0.02); // Much higher gain
      gainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.2); // Slightly longer decay

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.15);
    } catch (e) {
      console.error("Audio error", e);
    }
  };

  const handleScan = (rawBarcode: string) => {
    const barcode = rawBarcode.trim();
    
    // Prevent spam scanning: only add if it's a new detection
    if (barcode === lastDetectedBarcode.current) {
      // Reset the "clear" timeout because we still see it
      if (clearBarcodeTimeout.current) clearTimeout(clearBarcodeTimeout.current);
      clearBarcodeTimeout.current = setTimeout(() => {
        lastDetectedBarcode.current = null;
      }, 1500);
      return;
    }

    playScanSound();
    lastDetectedBarcode.current = barcode;
    if (clearBarcodeTimeout.current) clearTimeout(clearBarcodeTimeout.current);
    clearBarcodeTimeout.current = setTimeout(() => {
      lastDetectedBarcode.current = null;
    }, 1500);

    if (activeTab === 'database') {
      setRegisteringProduct({ barcode, name: '', price: '' });
      stopScanner();
      return;
    }

    const dbItem = databaseRef.current.find(d => d.barcode === barcode);
    
    setItems(prev => {
      const existingIndex = prev.findIndex(item => item.barcode === barcode);
      if (existingIndex > -1) {
        const newItems = [...prev];
        const existingItem = newItems[existingIndex];
        
        // Update name and price from DB if it was previously unknown
        newItems[existingIndex] = {
          ...existingItem,
          name: dbItem ? dbItem.name : existingItem.name,
          price: dbItem ? dbItem.price : existingItem.price,
          quantity: existingItem.quantity + 1,
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

  const updateProduct = async () => {
    if (!editingProduct) return;
    const newDatabase = database.map(d => d.barcode === editingProduct.barcode ? editingProduct : d);
    setDatabase(newDatabase);
    await syncToGitHub(newDatabase);
    setEditingProduct(null);
  };

  const handleBulkAdd = async () => {
    const validBulkItems = bulkItems
      .filter(item => item.barcode && item.name && item.price)
      .map(item => ({
        barcode: item.barcode,
        name: item.name,
        price: parseFloat(item.price) || 0
      }));

    if (validBulkItems.length === 0) return;

    const newDatabase = [...database];
    validBulkItems.forEach(newItem => {
      const index = newDatabase.findIndex(d => d.barcode === newItem.barcode);
      if (index > -1) {
        newDatabase[index] = newItem;
      } else {
        newDatabase.push(newItem);
      }
    });

    setDatabase(newDatabase);
    await syncToGitHub(newDatabase);
    setBulkItems([]);
    setIsBulkAddOpen(false);
  };

  const exportToExcel = (data: any[], fileName: string) => {
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    XLSX.writeFile(wb, `${fileName}.xlsx`);
  };

  const handleLogout = async () => {
    await signOut(auth);
  };

  const clearHistory = () => {
    if (window.confirm(t.confirmClearHistory)) {
      setHistory([]);
    }
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

  const addManualItem = () => {
    if (!manualEntry.name || !manualEntry.price) return;
    
    const newItem: InventoryItem = {
      id: Math.random().toString(36).substr(2, 9),
      barcode: 'MANUAL',
      name: manualEntry.name,
      price: parseFloat(manualEntry.price) || 0,
      quantity: parseInt(manualEntry.quantity) || 1,
      timestamp: Date.now()
    };
    
    setItems(prev => [newItem, ...prev]);
    setIsManualEntryOpen(false);
    setManualEntry({ name: '', price: '', quantity: '1' });
    setLastScanned('item_added');
    setTimeout(() => setLastScanned(null), 2000);
  };

  const startScanner = async () => {
    setIsScanning(true);
    setIsTorchOn(false);
    setHasTorch(false);
    
    // Wait for React to render the #reader element
    setTimeout(async () => {
      try {
        const element = document.getElementById("reader");
        if (!element) {
          throw new Error("HTML Element with id=reader not found");
        }

        const html5QrCode = new Html5Qrcode("reader", {
          formatsToSupport: [
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.QR_CODE
          ],
          verbose: false
        });
        scannerRef.current = html5QrCode;
        
        await html5QrCode.start(
          { facingMode: "environment" },
          {
            fps: 20, // Increased FPS for faster detection
            qrbox: (viewfinderWidth, viewfinderHeight) => {
              // Larger scanning area for distorted products
              const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
              const size = Math.floor(minEdge * 0.8);
              return { width: size, height: size };
            },
            aspectRatio: 1.0,
            experimentalFeatures: {
              useBarCodeDetectorIfSupported: true // Use native API if available (much better for distortions)
            }
          } as any,
          (decodedText) => {
            handleScan(decodedText);
          },
          () => {}
        );

        // Check for torch capability after start
        try {
          const track = html5QrCode.getRunningTrackCapabilities();
          if (track && (track as any).torch) {
            setHasTorch(true);
          }
        } catch (e) {
          console.log("Torch not supported or error checking", e);
        }

      } catch (err) {
        console.error("Failed to start scanner", err);
        setIsScanning(false);
      }
    }, 100);
  };

  const toggleTorch = async () => {
    if (!scannerRef.current || !hasTorch) return;
    try {
      const nextTorch = !isTorchOn;
      await scannerRef.current.applyVideoConstraints({
        advanced: [{ torch: nextTorch } as any]
      });
      setIsTorchOn(nextTorch);
    } catch (err) {
      console.error("Failed to toggle torch", err);
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
    
    // For file upload, we can use a temporary element if #reader is not available
    const tempId = "reader-temp";
    let tempElem = document.getElementById(tempId);
    if (!tempElem) {
      tempElem = document.createElement('div');
      tempElem.id = tempId;
      tempElem.style.display = 'none';
      document.body.appendChild(tempElem);
    }

    const html5QrCode = new Html5Qrcode(tempId);
    html5QrCode.scanFile(file, true)
      .then(decodedText => {
        handleScan(decodedText);
        html5QrCode.clear();
      })
      .catch(err => {
        console.error("Error scanning file", err);
        html5QrCode.clear();
      });
  };

  const totalAmount = items.reduce((acc, item) => acc + item.price * item.quantity, 0);

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-stone-950 flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-emerald-500 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <Auth 
        onAuthSuccess={(email) => setUser({ email })} 
        language={settings.language}
        setLanguage={(l) => setSettings(s => ({ ...s, language: l }))}
        theme={settings.theme === 'system' ? 'dark' : settings.theme}
        setTheme={(t) => setSettings(s => ({ ...s, theme: t }))}
      />
    );
  }

  return (
    <div 
      dir={t.dir}
      className={cn(
        "fixed inset-0 font-sans flex flex-col overflow-hidden transition-colors duration-500",
        settings.theme === 'dark' || (settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
          ? "bg-[#050404] text-white" 
          : "bg-white text-[#050404]"
      )}
    >
      {/* Header */}
      <header className={cn(
        "flex-none px-4 py-3 flex items-center justify-between border-b",
        settings.theme === 'dark' || (settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
          ? "border-white/5"
          : "border-stone-200"
      )}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <svg viewBox="0 0 100 100" className="w-5 h-5 fill-white">
              <path d="M30 30h5v40h-5zM40 30h2v40h-2zM47 30h8v40h-8zM60 30h2v40h-2zM67 30h3v40h-3zM75 30h5v40h-5z" />
            </svg>
          </div>
          <div className="flex flex-col">
            <h1 className="text-xl font-black tracking-tighter uppercase leading-none">{t.title}</h1>
            <span className="text-[8px] font-bold text-stone-500 uppercase tracking-widest mt-1">{user.email}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isSyncing && <Loader2 className="w-4 h-4 text-emerald-500 animate-spin" />}
          <button 
            onClick={() => setIsSettingsOpen(true)}
            className={cn(
              "p-2 rounded-xl transition-colors",
              settings.theme === 'dark' || (settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
                ? "hover:bg-stone-900"
                : "hover:bg-stone-100"
            )}
          >
            <Settings className="w-6 h-6" />
          </button>
          <button 
            onClick={handleLogout}
            className={cn(
              "p-2 rounded-xl transition-colors text-red-500",
              settings.theme === 'dark' || (settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
                ? "hover:bg-stone-900"
                : "hover:bg-stone-100"
            )}
          >
            <LogOut className="w-6 h-6" />
          </button>
        </div>
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
              className="p-4 space-y-4"
            >
              {/* Scanner View */}
              <div className={cn(
                "relative aspect-square max-w-sm mx-auto rounded-[2.5rem] overflow-hidden shadow-2xl transition-all",
                settings.theme === 'dark' || (settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
                  ? "bg-stone-900 shadow-none border border-stone-800"
                  : "bg-stone-100 shadow-stone-200"
              )}>
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
                  <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2">
                    <button 
                      onClick={stopScanner}
                      className="px-4 py-2 bg-white/20 backdrop-blur-md border border-white/30 rounded-full text-white text-xs font-bold uppercase tracking-wider"
                    >
                      {t.stopScanning}
                    </button>
                    {hasTorch && (
                      <button 
                        onClick={toggleTorch}
                        className={cn(
                          "p-2 rounded-full backdrop-blur-md border transition-all",
                          isTorchOn 
                            ? "bg-emerald-500 border-emerald-400 text-white" 
                            : "bg-white/20 border-white/30 text-white"
                        )}
                      >
                        {isTorchOn ? <Zap className="w-5 h-5" /> : <ZapOff className="w-5 h-5" />}
                      </button>
                    )}
                  </div>
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
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => setIsManualEntryOpen(true)}
                      className={cn(
                        "p-2 rounded-xl transition-colors",
                        settings.theme === 'dark' || (settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
                          ? "bg-stone-900 hover:bg-stone-800"
                          : "bg-stone-100 hover:bg-stone-200"
                      )}
                      title={t.addItem}
                    >
                      <Plus className="w-5 h-5" />
                    </button>
                    <label className={cn(
                      "p-2 rounded-xl cursor-pointer transition-colors",
                      settings.theme === 'dark' || (settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
                        ? "bg-stone-900 hover:bg-stone-800"
                        : "bg-stone-100 hover:bg-stone-200"
                    )}>
                      <Upload className="w-5 h-5" />
                      <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
                    </label>
                  </div>
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
                        className={cn(
                          "p-4 rounded-2xl flex items-center justify-between gap-4 border transition-colors",
                          settings.theme === 'dark' || (settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
                            ? "bg-stone-900 border-stone-800"
                            : "bg-stone-50 border-stone-100"
                        )}
                      >
                        <div className="flex-1 min-w-0">
                          <h3 className="font-bold truncate">{item.name}</h3>
                          <div className="flex items-center gap-2 text-xs text-stone-500 mt-1">
                            <span className="font-mono">{item.barcode}</span>
                            <span>•</span>
                            <span className="font-bold text-emerald-600">{item.price} {settings.currency}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "flex items-center rounded-xl p-1 shadow-sm",
                            settings.theme === 'dark' || (settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
                              ? "bg-stone-950"
                              : "bg-white"
                          )}>
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
              className="p-4 space-y-4"
            >
              {isScanning && (
                <div className={cn(
                  "relative aspect-square max-w-sm mx-auto rounded-[2.5rem] overflow-hidden shadow-2xl mb-6",
                  settings.theme === 'dark' || (settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
                    ? "bg-stone-900 border border-stone-800"
                    : "bg-stone-100"
                )}>
                  <div id="reader" className="w-full h-full"></div>
                  <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2">
                    <button 
                      onClick={stopScanner}
                      className="px-4 py-2 bg-white/20 backdrop-blur-md border border-white/30 rounded-full text-white text-xs font-bold uppercase tracking-wider"
                    >
                      {t.stopScanning}
                    </button>
                    {hasTorch && (
                      <button 
                        onClick={toggleTorch}
                        className={cn(
                          "p-2 rounded-full backdrop-blur-md border transition-all",
                          isTorchOn 
                            ? "bg-emerald-500 border-emerald-400 text-white" 
                            : "bg-white/20 border-white/30 text-white"
                        )}
                      >
                        {isTorchOn ? <Zap className="w-5 h-5" /> : <ZapOff className="w-5 h-5" />}
                      </button>
                    )}
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-black uppercase tracking-tighter">{t.database}</h2>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => exportToExcel(database, `database_${user.email}`)}
                    className="p-2 rounded-xl bg-stone-200 hover:bg-stone-300 transition-colors text-stone-700"
                    title="Export to Excel"
                  >
                    <FileSpreadsheet className="w-5 h-5" />
                  </button>
                  <button 
                    onClick={() => {
                      setBulkItems([{ barcode: '', name: '', price: '' }]);
                      setIsBulkAddOpen(true);
                    }}
                    className="p-2 rounded-xl bg-stone-200 hover:bg-stone-300 transition-colors text-stone-700"
                    title="Bulk Add"
                  >
                    <ListPlus className="w-5 h-5" />
                  </button>
                  {!isScanning && (
                    <button 
                      onClick={startScanner}
                      className="px-4 py-2 bg-emerald-500 text-white rounded-xl font-bold text-sm uppercase tracking-wider shadow-lg shadow-emerald-500/20"
                    >
                      {t.scanBarcode}
                    </button>
                  )}
                </div>
              </div>

              <div className="grid gap-4">
                {database.length === 0 ? (
                  <div className="py-20 text-center text-stone-500 font-bold uppercase tracking-widest text-sm">
                    {t.noItems}
                  </div>
                ) : (
                  database.map((item) => (
                    <div 
                      key={item.barcode} 
                      className={cn(
                        "p-5 rounded-3xl flex items-center justify-between border transition-colors",
                        settings.theme === 'dark' || (settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
                          ? "bg-stone-900 border-stone-800"
                          : "bg-stone-50 border-stone-100"
                      )}
                    >
                      <div>
                        <h3 className="font-bold text-lg">{item.name}</h3>
                        <p className="text-sm text-stone-500 font-mono">{item.barcode}</p>
                      </div>
                      <div className="text-right flex flex-col items-end gap-2">
                        <p className="text-xl font-black text-emerald-500">{item.price} {settings.currency}</p>
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => setEditingProduct(item)} 
                            className={cn(
                              "p-2 rounded-xl transition-colors flex items-center gap-1",
                              settings.theme === 'dark' || (settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
                                ? "bg-stone-800 hover:bg-stone-700 text-stone-300"
                                : "bg-stone-200 hover:bg-stone-300 text-stone-700"
                            )}
                          >
                            <Settings className="w-4 h-4" />
                            <span className="text-[10px] font-bold uppercase">{t.edit}</span>
                          </button>
                          <button onClick={() => setDatabase(prev => prev.filter(d => d.barcode !== item.barcode))} className="p-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 transition-colors text-red-500">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
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
              className="p-4 space-y-4"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-black uppercase tracking-tighter">{t.history}</h2>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => exportToExcel(history, `history_${user.email}`)}
                    className="p-2 rounded-xl bg-stone-200 hover:bg-stone-300 transition-colors text-stone-700"
                    title="Export to Excel"
                  >
                    <FileSpreadsheet className="w-5 h-5" />
                  </button>
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={clearHistory}
                      className="p-2 rounded-xl bg-red-100 text-red-600 hover:bg-red-200 transition-colors"
                      title={t.clearHistory}
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                    <span className="text-xs font-bold text-stone-500 uppercase tracking-widest">{t.last30Days}</span>
                  </div>
                </div>
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
                        <p className="text-2xl font-black text-emerald-500">{record.total.toFixed(2)} {settings.currency}</p>
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
      <nav className="flex-none px-4 py-3 bg-stone-950 border-t border-stone-200 flex items-center justify-around">
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
          className={cn(
            "absolute bottom-20 left-4 right-4 p-3 rounded-[2rem] flex items-center justify-between shadow-2xl transition-colors",
            settings.theme === 'dark' || (settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
              ? "bg-stone-900 shadow-none border border-stone-800"
              : "bg-white shadow-stone-200 border border-stone-100"
          )}
        >
          <div className="pl-2">
            <p className={cn(
              "text-[10px] font-bold uppercase tracking-widest",
              settings.theme === 'dark' || (settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
                ? "text-stone-500"
                : "text-stone-900/60"
            )}>{t.total}</p>
            <p className={cn(
              "text-lg font-black",
              settings.theme === 'dark' || (settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
                ? "text-white"
                : "text-stone-900"
            )}>{totalAmount.toFixed(2)} {settings.currency}</p>
          </div>
          <button 
            onClick={checkout}
            className="bg-emerald-500 text-white px-6 py-2.5 rounded-2xl font-black uppercase tracking-widest text-xs shadow-lg shadow-emerald-500/40"
          >
            {t.checkout}
          </button>
        </motion.div>
      )}

      {/* Modals */}
      <AnimatePresence>
        {/* Manual Entry Modal */}
        {isManualEntryOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsManualEntryOpen(false)} className="absolute inset-0 bg-stone-950/60 backdrop-blur-md" />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className={cn(
                "relative w-full max-w-md rounded-[2.5rem] p-6 shadow-2xl border transition-colors",
                settings.theme === 'dark' || (settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
                  ? "bg-stone-900 border-stone-800"
                  : "bg-white border-stone-200"
              )}
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-black uppercase tracking-tighter">{t.addItem}</h2>
                <button onClick={() => setIsManualEntryOpen(false)} className="p-2 rounded-xl hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors">
                  <X className="w-6 h-6" />
                </button>
              </div>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-stone-500 uppercase ml-2">{t.productName}</label>
                  <input 
                    autoFocus
                    value={manualEntry.name}
                    onChange={e => setManualEntry({...manualEntry, name: e.target.value})}
                    placeholder="e.g. Custom Item"
                    className={cn(
                      "w-full p-4 rounded-2xl font-bold outline-none focus:ring-2 ring-emerald-500 transition-colors",
                      settings.theme === 'dark' || (settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
                        ? "bg-stone-950 text-white placeholder-stone-700"
                        : "bg-stone-100 text-stone-900 placeholder-stone-400"
                    )}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-stone-500 uppercase ml-2">{t.productPrice}</label>
                    <input 
                      type="number"
                      step="0.01"
                      value={manualEntry.price}
                      onChange={e => setManualEntry({...manualEntry, price: e.target.value})}
                      placeholder="0.00"
                      className={cn(
                        "w-full p-4 rounded-2xl font-bold outline-none focus:ring-2 ring-emerald-500 transition-colors",
                        settings.theme === 'dark' || (settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
                          ? "bg-stone-950 text-white placeholder-stone-700"
                          : "bg-stone-100 text-stone-900 placeholder-stone-400"
                      )}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-stone-500 uppercase ml-2">{t.quantity}</label>
                    <input 
                      type="number"
                      value={manualEntry.quantity}
                      onChange={e => setManualEntry({...manualEntry, quantity: e.target.value})}
                      className={cn(
                        "w-full p-4 rounded-2xl font-bold outline-none focus:ring-2 ring-emerald-500 transition-colors",
                        settings.theme === 'dark' || (settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
                          ? "bg-stone-950 text-white"
                          : "bg-stone-100 text-stone-900"
                      )}
                    />
                  </div>
                </div>
              </div>
              <div className="flex gap-3 mt-8">
                <button onClick={() => setIsManualEntryOpen(false)} className="flex-1 py-4 rounded-2xl font-bold uppercase text-stone-500">{t.cancel}</button>
                <button 
                  onClick={addManualItem}
                  disabled={!manualEntry.name || !manualEntry.price}
                  className="flex-2 py-4 bg-emerald-500 text-white rounded-2xl font-bold uppercase tracking-widest shadow-lg shadow-emerald-500/20 disabled:opacity-50"
                >
                  {t.addItem}
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Register Product Modal */}
        {registeringProduct && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-stone-950/60 backdrop-blur-md" />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className={cn(
                "relative w-full max-w-md rounded-[2.5rem] p-6 shadow-2xl border transition-colors",
                settings.theme === 'dark' || (settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
                  ? "bg-stone-900 border-stone-800"
                  : "bg-white border-stone-200"
              )}
            >
              <h2 className="text-2xl font-black uppercase tracking-tighter mb-6">{t.registerProduct}</h2>
              <div className="space-y-4">
                <div className={cn(
                  "p-4 rounded-2xl transition-colors",
                  settings.theme === 'dark' || (settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
                    ? "bg-stone-950"
                    : "bg-stone-100"
                )}>
                  <p className="text-[10px] font-bold text-stone-500 uppercase mb-1">{t.barcode}</p>
                  <p className="font-mono font-bold">{registeringProduct.barcode}</p>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-stone-500 uppercase ml-2">{t.productName}</label>
                  <input 
                    autoFocus
                    value={registeringProduct.name}
                    onChange={e => setRegisteringProduct({...registeringProduct, name: e.target.value})}
                    placeholder="e.g. Coca Cola"
                    className={cn(
                      "w-full p-4 rounded-2xl font-bold outline-none focus:ring-2 ring-emerald-500 transition-colors",
                      settings.theme === 'dark' || (settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
                        ? "bg-stone-950 text-white placeholder-stone-700"
                        : "bg-stone-100 text-stone-900 placeholder-stone-400"
                    )}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-stone-500 uppercase ml-2">{t.productPrice}</label>
                  <input 
                    type="number"
                    step="0.01"
                    value={registeringProduct.price}
                    onChange={e => setRegisteringProduct({...registeringProduct, price: e.target.value})}
                    placeholder="0.00"
                    className={cn(
                      "w-full p-4 rounded-2xl font-bold outline-none focus:ring-2 ring-emerald-500 transition-colors",
                      settings.theme === 'dark' || (settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
                        ? "bg-stone-950 text-white placeholder-stone-700"
                        : "bg-stone-100 text-stone-900 placeholder-stone-400"
                    )}
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

        {/* Edit Product Modal */}
        {editingProduct && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-stone-950/60 backdrop-blur-md" />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full max-w-md bg-stone-950 rounded-[2.5rem] p-6 shadow-2xl"
            >
              <h2 className="text-2xl font-black uppercase tracking-tighter mb-6">{t.editProduct}</h2>
              <div className="space-y-4">
                <div className="p-4 bg-stone-200 rounded-2xl">
                  <p className="text-[10px] font-bold text-stone-500 uppercase mb-1">{t.barcode}</p>
                  <p className="font-mono font-bold">{editingProduct.barcode}</p>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-stone-500 uppercase ml-2">{t.productName}</label>
                  <input 
                    autoFocus
                    value={editingProduct.name}
                    onChange={e => setEditingProduct({...editingProduct, name: e.target.value})}
                    className="w-full p-4 bg-stone-200 rounded-2xl font-bold outline-none focus:ring-2 ring-emerald-500"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-stone-500 uppercase ml-2">{t.productPrice}</label>
                  <input 
                    type="number"
                    value={editingProduct.price}
                    onChange={e => setEditingProduct({...editingProduct, price: parseFloat(e.target.value) || 0})}
                    className="w-full p-4 bg-stone-200 rounded-2xl font-bold outline-none focus:ring-2 ring-emerald-500"
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-8">
                <button onClick={() => setEditingProduct(null)} className="flex-1 py-4 rounded-2xl font-bold uppercase text-stone-500">{t.cancel}</button>
                <button onClick={updateProduct} className="flex-2 py-4 bg-emerald-500 text-white rounded-2xl font-bold uppercase tracking-widest shadow-lg shadow-emerald-500/20">{t.save}</button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Bulk Add Modal */}
        {isBulkAddOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsBulkAddOpen(false)} className="absolute inset-0 bg-stone-950/60 backdrop-blur-md" />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full max-w-2xl bg-stone-950 rounded-[2.5rem] p-6 shadow-2xl flex flex-col max-h-[90vh]"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-black uppercase tracking-tighter">Bulk Add Products</h2>
                <button onClick={() => setIsBulkAddOpen(false)} className="p-2 rounded-full hover:bg-stone-200"><X className="w-6 h-6" /></button>
              </div>
              
              <div className="flex-1 overflow-y-auto space-y-4 pr-2">
                {bulkItems.map((item, index) => (
                  <div key={index} className="grid grid-cols-[1fr_1.5fr_1fr_auto] gap-3 items-end bg-stone-900 p-4 rounded-2xl border border-stone-800">
                    <div className="space-y-1">
                      <label className="text-[8px] font-bold text-stone-500 uppercase ml-1">Barcode</label>
                      <input 
                        value={item.barcode}
                        onChange={e => {
                          const newItems = [...bulkItems];
                          newItems[index].barcode = e.target.value;
                          setBulkItems(newItems);
                        }}
                        className="w-full p-2 bg-stone-800 text-white rounded-lg text-sm font-bold outline-none border border-stone-700"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[8px] font-bold text-stone-500 uppercase ml-1">Name</label>
                      <input 
                        value={item.name}
                        onChange={e => {
                          const newItems = [...bulkItems];
                          newItems[index].name = e.target.value;
                          setBulkItems(newItems);
                        }}
                        className="w-full p-2 bg-stone-800 text-white rounded-lg text-sm font-bold outline-none border border-stone-700"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[8px] font-bold text-stone-500 uppercase ml-1">Price</label>
                      <input 
                        type="number"
                        value={item.price}
                        onChange={e => {
                          const newItems = [...bulkItems];
                          newItems[index].price = e.target.value;
                          setBulkItems(newItems);
                        }}
                        className="w-full p-2 bg-stone-800 text-white rounded-lg text-sm font-bold outline-none border border-stone-700"
                      />
                    </div>
                    <button 
                      onClick={() => setBulkItems(bulkItems.filter((_, i) => i !== index))}
                      className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex gap-3 mt-6">
                <button 
                  onClick={() => setBulkItems([...bulkItems, { barcode: '', name: '', price: '' }])}
                  className="flex-1 py-3 bg-stone-800 text-white rounded-2xl font-bold uppercase text-xs flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4" /> Add Row
                </button>
                <button 
                  onClick={handleBulkAdd}
                  disabled={bulkItems.length === 0 || isSyncing}
                  className="flex-2 py-3 bg-emerald-500 text-white rounded-2xl font-bold uppercase tracking-widest text-xs shadow-lg shadow-emerald-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save All
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Settings Modal */}
        {isSettingsOpen && (
          <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsSettingsOpen(false)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <motion.div 
              initial={{ y: 100 }} animate={{ y: 0 }} exit={{ y: 100 }}
              className={cn(
                "relative w-full max-w-md rounded-t-[2.5rem] sm:rounded-[2.5rem] p-6 shadow-2xl border",
                settings.theme === 'dark' || (settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
                  ? "bg-[#050404] border-white/10"
                  : "bg-white border-stone-200"
              )}
            >
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-2xl font-black uppercase tracking-tighter">{t.settings}</h2>
                <button onClick={() => setIsSettingsOpen(false)} className="p-2 rounded-xl hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors">
                  <X className="w-6 h-6" />
                </button>
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
                            ? "border-emerald-500 bg-emerald-500/10 text-emerald-500"
                            : (settings.theme === 'dark' || (settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
                                ? "border-stone-800 bg-stone-950 text-stone-500"
                                : "border-stone-100 bg-stone-50 text-stone-500")
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
                            ? "border-emerald-500 bg-emerald-500/10 text-emerald-500"
                            : (settings.theme === 'dark' || (settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
                                ? "border-stone-800 bg-stone-950 text-stone-500"
                                : "border-stone-100 bg-stone-50 text-stone-500")
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

                <div className="space-y-3">
                  <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest ml-2">{t.currency}</label>
                  <div className="grid grid-cols-4 gap-2">
                    {['USD', 'EUR', 'GBP', 'DZD'].map((curr) => (
                      <button
                        key={curr}
                        onClick={() => setSettings(s => ({ ...s, currency: curr }))}
                        className={cn(
                          "py-3 rounded-2xl border-2 transition-all font-bold text-xs",
                          settings.currency === curr 
                            ? "border-emerald-500 bg-emerald-500/10 text-emerald-500"
                            : (settings.theme === 'dark' || (settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
                                ? "border-stone-800 bg-stone-950 text-stone-500"
                                : "border-stone-100 bg-stone-50 text-stone-500")
                        )}
                      >
                        {curr}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <button 
                onClick={() => setIsSettingsOpen(false)} 
                className="w-full mt-10 py-5 rounded-3xl bg-emerald-500 text-white font-black uppercase tracking-widest text-sm shadow-lg shadow-emerald-500/20 hover:scale-[1.02] transition-transform"
              >
                OK
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
