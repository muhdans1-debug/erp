import { useState, useEffect, useRef } from 'react';
import { Search, Package, Users, Truck, CornerDownLeft } from 'lucide-react';

interface CommandPaletteProps {
  onNavigate: (route: 'COMMAND_CENTER' | 'FINANCIALS' | 'KHATA' | 'STOCK' | 'PURCHASE_ORDERS' | 'BARCODE') => void;
  apiBase?: string;
}

export default function CommandPalette({ onNavigate, apiBase: propApiBase }: CommandPaletteProps) {
  const apiBase = propApiBase || (typeof window !== 'undefined' ? localStorage.getItem('master_server_url') || 'http://localhost:3000' : 'http://localhost:3000');
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // 1. Global Keyboard Listener for Ctrl+K / Cmd+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault(); // Stop default browser search
        setIsOpen((prev) => !prev);
      }
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Focus input automatically when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery('');
      setResults([]);
    }
  }, [isOpen]);

  // 2. Fetch Live Results with Debounce
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }

    const fetchSearch = async () => {
      try {
        const res = await fetch(`${apiBase}/api/search/global?q=${encodeURIComponent(query.trim())}`);
        const data = await res.json();
        if (data.success && Array.isArray(data.results)) {
          setResults(data.results);
          setSelectedIndex(0); // Reset selection to top
        }
      } catch (error) {
        console.error("Search failed", error);
      }
    };

    const timeoutId = setTimeout(fetchSearch, 180);
    return () => clearTimeout(timeoutId);
  }, [query, apiBase]);

  // 3. Arrow Key Navigation & Enter Selection
  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (results.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < results.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : prev));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[selectedIndex]) {
        executeAction(results[selectedIndex]);
      }
    }
  };

  const executeAction = (item: any) => {
    setIsOpen(false);
    
    // Pass the action back up to the main App router
    if (item.action === 'VIEW_STOCK') {
      onNavigate('STOCK');
    } else if (item.action === 'VIEW_LEDGER') {
      onNavigate('KHATA'); 
    } else if (item.action === 'VIEW_SUPPLIER') {
      onNavigate('PURCHASE_ORDERS');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh] px-4 animate-in fade-in duration-200">
      
      {/* Blurred Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm cursor-pointer"
        onClick={() => setIsOpen(false)}
      />

      {/* Main Modal */}
      <div className="relative bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden border border-slate-200 flex flex-col z-10">
        
        {/* Search Input Area */}
        <div className="flex items-center px-4 py-4 border-b border-slate-100 bg-slate-50/50">
          <Search size={24} className="text-slate-400 mr-3 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="Search Askar inventory, Khata accounts, or suppliers..."
            className="w-full bg-transparent text-xl font-medium text-slate-800 outline-none placeholder:text-slate-400"
          />
          <div className="flex items-center gap-1 bg-slate-200/70 text-slate-600 px-2.5 py-1 rounded text-xs font-bold shrink-0">
            ESC to close
          </div>
        </div>

        {/* Results Area */}
        {results.length > 0 && (
          <div className="max-h-[50vh] overflow-y-auto p-2 space-y-1">
            {results.map((item, index) => {
              const isSelected = index === selectedIndex;
              
              // Determine Icon Based on Type
              const Icon = item.type === 'INVENTORY' ? Package 
                         : item.type === 'KHATA' ? Users 
                         : Truck;

              return (
                <button
                  key={item.id}
                  onClick={() => executeAction(item)}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={`w-full flex items-center justify-between p-3.5 rounded-xl transition-colors text-left cursor-pointer ${
                    isSelected ? 'bg-blue-600 text-white' : 'hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div className={`p-2.5 rounded-xl shrink-0 ${isSelected ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-500'}`}>
                      <Icon size={20} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className={`font-bold text-base truncate ${isSelected ? 'text-white' : 'text-slate-800'}`}>
                          {item.title}
                        </h4>
                        <span className={`text-[10px] font-black uppercase px-1.5 py-0.5 rounded tracking-wider ${
                          isSelected ? 'bg-blue-700 text-blue-100' : 'bg-slate-200 text-slate-600'
                        }`}>
                          {item.type}
                        </span>
                      </div>
                      <p className={`text-xs font-medium truncate mt-0.5 ${isSelected ? 'text-blue-200' : 'text-slate-500'}`}>
                        {item.subtitle}
                      </p>
                    </div>
                  </div>
                  
                  {isSelected && (
                    <div className="flex items-center gap-1.5 text-blue-100 font-bold text-xs shrink-0 ml-3">
                      <span>Select</span>
                      <CornerDownLeft size={14} />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Empty State */}
        {query.trim().length > 1 && results.length === 0 && (
          <div className="p-12 text-center text-slate-500">
            <Search size={44} className="mx-auto mb-3 text-slate-300 opacity-60" />
            <p className="font-bold text-base text-slate-700">No results found for "{query}"</p>
            <p className="text-xs text-slate-400 mt-1">Try searching by product barcode, customer name, CPR, or supplier.</p>
          </div>
        )}

        {/* Initial Prompt State */}
        {query.trim().length <= 1 && (
          <div className="p-6 text-center text-xs text-slate-400 font-medium border-t border-slate-50 bg-slate-50/30">
            Tip: Use <kbd className="bg-white px-1.5 py-0.5 rounded border border-slate-200 font-mono text-[11px] font-bold text-slate-600">↑</kbd> <kbd className="bg-white px-1.5 py-0.5 rounded border border-slate-200 font-mono text-[11px] font-bold text-slate-600">↓</kbd> to navigate and <kbd className="bg-white px-1.5 py-0.5 rounded border border-slate-200 font-mono text-[11px] font-bold text-slate-600">Enter</kbd> to jump straight to any record.
          </div>
        )}
      </div>
    </div>
  );
}
