import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Printer,
  Sparkles,
  Save,
  RotateCcw,
  Plus,
  Search,
  CheckCircle2,
  AlertTriangle,
  Scale,
  Trash2,
  DollarSign,
  Percent,
  X,
  Clock,
  Zap,
  Image as ImageIcon,
  Hash,
  Edit3,
  Camera,
  Check,
  Flame,
  RefreshCw,
  ExternalLink
} from 'lucide-react';
import { getApiBaseUrl } from './utils/apiConfig';
import { getAdminPin } from './utils/auth';
import {
  fetchProduceItemsList,
  batchUpdateProducePricesDirect,
  updateProduceItemDirect,
  deleteProductFromCatalog
} from './services/dataService';

export interface ProduceItem {
  id: string;
  name: string;
  name_ar?: string | null;
  barcode: string;
  plu_code?: string | null;
  image_url?: string | null;
  sellingPrice: number;
  purchasePrice: number;
  unitCost: number;
  stockQuantity: number;
  is_weighed_item: boolean;
  category: string;
  previousPrice: number;
  previousCost: number;
  marginPercent: number;
  profitPerKg: number;
  priceDelta: number;
  updatedAt?: string;
  lastPriceChangeDate?: string | null;

  // Local draft state
  draftSellingPrice?: string;
  draftCostPrice?: string;
  draftWastageKg?: string;
  draftPluCode?: string;
  draftImageUrl?: string;
  draftNameAr?: string;
  isModified?: boolean;
}

interface ProducePriceCommanderProps {
  apiBase?: string;
  initialMode?: 'catalog' | '60s';
}

// Curated high-resolution supermarket produce gallery presets
export const PRODUCE_PHOTO_PRESETS = [
  { name: 'Red Tomatoes', query: 'tomato', url: 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=400&q=80', icon: '🍅' },
  { name: 'Fresh Cucumbers', query: 'cucumber', url: 'https://images.unsplash.com/photo-1449300079323-02e209d9d3a6?w=400&q=80', icon: '🥒' },
  { name: 'Fresh Potatoes', query: 'potato', url: 'https://images.unsplash.com/photo-1518977676601-b53f82aba655?w=400&q=80', icon: '🥔' },
  { name: 'Red Onions', query: 'onion', url: 'https://images.unsplash.com/photo-1618512496248-a07fe83aa8cb?w=400&q=80', icon: '🧅' },
  { name: 'Bananas', query: 'banana', url: 'https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?w=400&q=80', icon: '🍌' },
  { name: 'Yellow Lemons', query: 'lemon', url: 'https://images.unsplash.com/photo-1590502593747-42a996133562?w=400&q=80', icon: '🍋' },
  { name: 'Fresh Ginger', query: 'ginger', url: 'https://images.unsplash.com/photo-1615485290382-441e4d049cb5?w=400&q=80', icon: '🫚' },
  { name: 'Fresh Garlic', query: 'garlic', url: 'https://images.unsplash.com/photo-1540148426945-6cf22a6b2383?w=400&q=80', icon: '🧄' },
  { name: 'Apples Gala', query: 'apple', url: 'https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6?w=400&q=80', icon: '🍎' },
  { name: 'Fresh Oranges', query: 'orange', url: 'https://images.unsplash.com/photo-1611080626919-7cf5a9dbab5b?w=400&q=80', icon: '🍊' },
  { name: 'Fresh Carrots', query: 'carrot', url: 'https://images.unsplash.com/photo-1598170845058-32b9d6a5c71d?w=400&q=80', icon: '🥕' },
  { name: 'Green Capsicum', query: 'capsicum', url: 'https://images.unsplash.com/photo-1563565375-f3fdfdbefa83?w=400&q=80', icon: '🫑' },
  { name: 'Green Chillies', query: 'chilli', url: 'https://images.unsplash.com/photo-1588252303782-cb80119abd6d?w=400&q=80', icon: '🌶️' },
  { name: 'Eggplant', query: 'eggplant', url: 'https://images.unsplash.com/photo-1659283087265-27a3c7fc9707?w=400&q=80', icon: '🍆' },
  { name: 'Green Cabbage', query: 'cabbage', url: 'https://images.unsplash.com/photo-1594282486552-05b4d80fbb9f?w=400&q=80', icon: '🥬' },
  { name: 'Cauliflower', query: 'cauliflower', url: 'https://images.unsplash.com/photo-1568584711075-3d021a7c3ca3?w=400&q=80', icon: '🥦' },
  { name: 'Okra / Ladyfinger', query: 'okra', url: 'https://images.unsplash.com/photo-1425543103986-22abb7d7e8d2?w=400&q=80', icon: '🫛' },
  { name: 'Bitter Gourd / Karela', query: 'karela', url: 'https://images.unsplash.com/photo-1597362925123-77861d3fbac7?w=400&q=80', icon: '🥒' },
  { name: 'Moringa / Drumsticks', query: 'moringa', url: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&q=80', icon: '🌿' },
  { name: 'Papaya Red Lady', query: 'papaya', url: 'https://images.unsplash.com/photo-1517282009859-f000ec3b26fe?w=400&q=80', icon: '🥭' },
  { name: 'Fresh Mutton / Meat', query: 'meat', url: 'https://images.unsplash.com/photo-1603048588665-791ca8aea617?w=400&q=80', icon: '🥩' },
  { name: 'Fresh Chicken', query: 'chicken', url: 'https://images.unsplash.com/photo-1587593810167-a84920ea0781?w=400&q=80', icon: '🍗' },
  { name: 'Arabic Sweets', query: 'sweet', url: 'https://images.unsplash.com/photo-1579954115545-a95591f28bfc?w=400&q=80', icon: '🍬' },
  { name: 'Rice / Bulk Grains', query: 'rice', url: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=400&q=80', icon: '🍚' }
];

export default function ProducePriceCommander({
  apiBase: propApiBase,
  initialMode = 'catalog'
}: ProducePriceCommanderProps) {
  const apiBase = propApiBase || getApiBaseUrl();

  // Active View Mode: '60s' (Rapid morning repricing) or 'catalog' (Full Omni-Pad PLU & photo management)
  const [activeMode, setActiveMode] = useState<'60s' | 'catalog'>(() => {
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search);
      if (p.get('view') === 'price-change' || p.get('view') === '60s' || p.get('tab') === 'price_change') {
        return '60s';
      }
    }
    return initialMode;
  });

  const [items, setItems] = useState<ProduceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'modified' | 'up' | 'down' | 'low_margin' | 'missing_code' | 'missing_photo'>('all');
  const [isPublishing, setIsPublishing] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // 60-Second Countdown Stopwatch State
  const [timerSeconds, setTimerSeconds] = useState<number>(60);
  const [isTimerRunning, setIsTimerRunning] = useState<boolean>(false);
  const timerIntervalRef = useRef<any>(null);

  // Short Code Manager Modal State
  const [pluModalItem, setPluModalItem] = useState<ProduceItem | null>(null);
  const [inputPluCode, setInputPluCode] = useState<string>('');
  const [pluCollisionWarning, setPluCollisionWarning] = useState<string | null>(null);
  const [isSavingPlu, setIsSavingPlu] = useState<boolean>(false);

  // Produce Photo Manager Modal State
  const [photoModalItem, setPhotoModalItem] = useState<ProduceItem | null>(null);
  const [inputImageUrl, setInputImageUrl] = useState<string>('');
  const [isSavingPhoto, setIsSavingPhoto] = useState<boolean>(false);

  // Remove Produce Item Modal State
  const [removeModalItem, setRemoveModalItem] = useState<ProduceItem | null>(null);
  const [isRemovingProduce, setIsRemovingProduce] = useState<boolean>(false);

  // Add Weighed Produce Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemNameAr, setNewItemNameAr] = useState('');
  const [newItemPlu, setNewItemPlu] = useState('');
  const [newItemImageUrl, setNewItemImageUrl] = useState('');
  const [newItemSell, setNewItemSell] = useState('0.350');
  const [newItemCost, setNewItemCost] = useState('0.200');

  // Print Shelf Talkers Modal
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [printFormat, setPrintFormat] = useState<'thermal' | 'a4'>('thermal');

  // Fetch only weighed produce items from PIM (single source of truth)
  const fetchProduceItems = async () => {
    setLoading(true);
    try {
      const rawItems = await fetchProduceItemsList(apiBase);
      // Ensure strictly weighed items
      const weighedOnly = rawItems.filter(
        (i: any) => i.is_weighed_item === 1 || i.is_weighed_item === true
      );

      const mapped: ProduceItem[] = weighedOnly.map((item: any) => ({
        ...item,
        is_weighed_item: true,
        plu_code: item.plu_code || (item.barcode && /^\d{1,4}$/.test(item.barcode) ? item.barcode : ''),
        image_url: item.image_url || '',
        name_ar: item.name_ar || '',
        draftSellingPrice: Number(item.sellingPrice || 0).toFixed(3),
        draftCostPrice: Number(item.purchasePrice || item.unitCost || 0).toFixed(3),
        draftWastageKg: '',
        draftPluCode: item.plu_code || '',
        draftImageUrl: item.image_url || '',
        draftNameAr: item.name_ar || '',
        isModified: false
      }));

      // Sort with PLU codes first
      mapped.sort((a, b) => {
        const numA = parseInt(a.plu_code || '9999', 10);
        const numB = parseInt(b.plu_code || '9999', 10);
        if (numA !== numB) return numA - numB;
        return a.name.localeCompare(b.name);
      });

      setItems(mapped);
    } catch (err: any) {
      console.error('Error fetching produce:', err);
      showToast('Could not reach backend produce catalog', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProduceItems();
  }, [apiBase]);

  // 60-Second Countdown Stopwatch Logic
  useEffect(() => {
    if (isTimerRunning) {
      timerIntervalRef.current = setInterval(() => {
        setTimerSeconds((prev) => {
          if (prev <= 1) {
            clearInterval(timerIntervalRef.current);
            setIsTimerRunning(false);
            showToast('⏰ 60-Second Price Check Window Finished! Deploy prices now.', 'info');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      clearInterval(timerIntervalRef.current);
    }
    return () => clearInterval(timerIntervalRef.current);
  }, [isTimerRunning]);

  const handleStartTimer = () => {
    if (timerSeconds === 0) setTimerSeconds(60);
    setIsTimerRunning(true);
  };

  const handlePauseTimer = () => {
    setIsTimerRunning(false);
  };

  const handleResetTimer = () => {
    setIsTimerRunning(false);
    setTimerSeconds(60);
  };

  const showToast = (message: string, type: 'success' | 'error' | 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  // Inline Price Delta Nudge (+0.050, -0.050, +0.100, +0.200 BHD)
  const handleNudgeSellingPrice = (id: string, delta: number) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const current = parseFloat(item.draftSellingPrice || '0') || item.sellingPrice || 0;
        const next = Math.max(0.05, current + delta);
        const formatted = next.toFixed(3);
        const isModified = Math.abs(next - item.sellingPrice) > 0.0001;
        return {
          ...item,
          draftSellingPrice: formatted,
          isModified: isModified || Boolean(item.draftWastageKg)
        };
      })
    );
  };

  // Inline Price Input Change
  const handlePriceChange = (id: string, field: 'selling' | 'cost', value: string) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;

        const newSell = field === 'selling' ? value : item.draftSellingPrice || '0';
        const newCost = field === 'cost' ? value : item.draftCostPrice || '0';

        const numSell = parseFloat(newSell) || 0;
        const numCost = parseFloat(newCost) || 0;

        const isSellChanged = Math.abs(numSell - item.sellingPrice) > 0.0001;
        const isCostChanged = Math.abs(numCost - item.purchasePrice) > 0.0001;
        const isWasteEntered = Boolean(item.draftWastageKg && parseFloat(item.draftWastageKg) > 0);

        return {
          ...item,
          draftSellingPrice: newSell,
          draftCostPrice: newCost,
          isModified: isSellChanged || isCostChanged || isWasteEntered
        };
      })
    );
  };

  // Quick Margin Preset Application (e.g. 20%, 25%, 30%, 35%)
  const applyMarginPreset = (id: string, marginPct: number) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const cost = parseFloat(item.draftCostPrice || '0') || item.purchasePrice || 0.1;
        if (cost <= 0) return item;

        // Selling Price = Cost / (1 - Margin%)
        const calculatedSell = cost / (1 - marginPct / 100);
        // Round to nearest 5 or 10 fils
        const rounded = Math.round(calculatedSell * 100) / 100;
        const formattedSell = rounded.toFixed(3);

        return {
          ...item,
          draftSellingPrice: formattedSell,
          isModified: true
        };
      })
    );
  };

  // Quick Wastage Nudge (+0.5kg, +1.0kg, +2.0kg)
  const handleNudgeWastage = (id: string, deltaKg: number) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const current = parseFloat(item.draftWastageKg || '0') || 0;
        const next = Math.max(0, current + deltaKg);
        return {
          ...item,
          draftWastageKg: next > 0 ? next.toFixed(1) : '',
          isModified: true
        };
      })
    );
  };

  const handleWastageChange = (id: string, value: string) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        return {
          ...item,
          draftWastageKg: value,
          isModified: true
        };
      })
    );
  };

  // Open Short Code (PLU) Modal
  const openPluModal = (item: ProduceItem) => {
    setPluModalItem(item);
    setInputPluCode(item.plu_code || '');
    setPluCollisionWarning(null);
  };

  // Auto-Suggest Next Available Short Code Number
  const autoSuggestNextPlu = () => {
    const usedCodes = new Set(
      items
        .map((i) => i.plu_code)
        .filter(Boolean)
        .map(String)
    );

    // Look for first available code between 10 and 99
    let nextCode = 10;
    while (usedCodes.has(String(nextCode))) {
      nextCode++;
    }
    setInputPluCode(String(nextCode));
    setPluCollisionWarning(null);
  };

  // Save Short Code to PIM (Instantly persists to central Turso & local database)
  const handleSavePluModal = async () => {
    if (!pluModalItem) return;
    const cleanCode = inputPluCode.trim();

    // Check collision with other items
    if (cleanCode) {
      const conflict = items.find(
        (i) => i.id !== pluModalItem.id && i.plu_code === cleanCode
      );
      if (conflict) {
        setPluCollisionWarning(
          `⚠️ Short Code #${cleanCode} is already assigned to "${conflict.name}". Choose another number.`
        );
        return;
      }
    }

    setIsSavingPlu(true);
    try {
      const ok = await updateProduceItemDirect(apiBase, {
        id: pluModalItem.id,
        plu_code: cleanCode || null
      });

      if (ok) {
        setItems((prev) =>
          prev.map((i) =>
            i.id === pluModalItem.id ? { ...i, plu_code: cleanCode } : i
          )
        );
        showToast(
          `✅ Short Code #${cleanCode || 'NONE'} assigned to ${pluModalItem.name}!`,
          'success'
        );
        setPluModalItem(null);
      } else {
        showToast('Failed to save short code to PIM', 'error');
      }
    } catch (err) {
      showToast('Network error saving short code', 'error');
    } finally {
      setIsSavingPlu(false);
    }
  };

  // Open Photo Manager Modal
  const openPhotoModal = (item: ProduceItem) => {
    setPhotoModalItem(item);
    setInputImageUrl(item.image_url || '');
  };

  // Save Picture to PIM
  const handleSavePhotoModal = async () => {
    if (!photoModalItem) return;
    const cleanUrl = inputImageUrl.trim();

    setIsSavingPhoto(true);
    try {
      const ok = await updateProduceItemDirect(apiBase, {
        id: photoModalItem.id,
        image_url: cleanUrl || null
      });

      if (ok) {
        setItems((prev) =>
          prev.map((i) =>
            i.id === photoModalItem.id ? { ...i, image_url: cleanUrl } : i
          )
        );
        showToast(`✅ Picture updated for ${photoModalItem.name}!`, 'success');
        setPhotoModalItem(null);
      } else {
        showToast('Failed to save picture to PIM', 'error');
      }
    } catch (err) {
      showToast('Network error saving picture', 'error');
    } finally {
      setIsSavingPhoto(false);
    }
  };

  // Remove Item from Daily Produce & 60s Repricing (or permanent delete from PIM)
  const handleRemoveProduceItem = async (permanentDelete: boolean = false) => {
    if (!removeModalItem) return;
    setIsRemovingProduce(true);
    const targetItem = removeModalItem;

    try {
      if (permanentDelete) {
        // Permanently delete SKU from entire catalog (PIM)
        const ok = await deleteProductFromCatalog(apiBase, targetItem.id);
        if (ok) {
          showToast(`🗑️ Permanently deleted "${targetItem.name}" from catalog.`, 'success');
          setItems(prev => prev.filter(p => p.id !== targetItem.id));
          setRemoveModalItem(null);
        } else {
          showToast('Failed to delete product from catalog.', 'error');
        }
      } else {
        // Remove from Daily Produce & 60-Sec Price Change by demoting weighed item flag
        const ok = await updateProduceItemDirect(apiBase, {
          id: targetItem.id,
          is_weighed_item: false,
          plu_code: null
        });

        if (ok) {
          showToast(`✅ "${targetItem.name}" removed from Daily Produce & 60-Sec Repricing.`, 'success');
          setItems(prev => prev.filter(p => p.id !== targetItem.id));
          setRemoveModalItem(null);
        } else {
          showToast('Failed to remove item from produce catalog.', 'error');
        }
      }
    } catch (err: any) {
      console.error('Error removing produce item:', err);
      showToast('Network error while removing produce item.', 'error');
    } finally {
      setIsRemovingProduce(false);
    }
  };

  // Batch Publish to Server & Broadcast to POS Fleet
  const handlePublishAll = async () => {
    const modifiedItems = items.filter((i) => i.isModified);
    if (modifiedItems.length === 0) {
      showToast('No price or wastage changes to publish.', 'info');
      return;
    }

    setIsPublishing(true);
    try {
      const updates = modifiedItems.map((item) => ({
        id: item.id,
        name: item.name,
        sellingPrice: parseFloat(item.draftSellingPrice || '0') || item.sellingPrice,
        purchasePrice: parseFloat(item.draftCostPrice || '0') || item.purchasePrice,
        oldPrice: item.sellingPrice,
        oldCost: item.purchasePrice,
        wastageKg: parseFloat(item.draftWastageKg || '0') || 0,
        plu_code: item.plu_code,
        image_url: item.image_url,
        name_ar: item.name_ar
      }));

      const ok = await batchUpdateProducePricesDirect(
        apiBase,
        updates,
        'Daily Morning Produce Repricing & Fleet Broadcast'
      );

      if (ok) {
        showToast(
          `🚀 Successfully published ${updates.length} produce prices! Broadcasted 0s sync to Sunmi & POS fleet.`,
          'success'
        );
        await fetchProduceItems();
      } else {
        showToast('Failed to publish prices to central server', 'error');
      }
    } catch (err: any) {
      console.error('Publish error:', err);
      showToast('Network error while publishing prices', 'error');
    } finally {
      setIsPublishing(false);
    }
  };

  // Add new produce scale item
  const handleAddNewItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim()) return;

    try {
      const cleanPlu = newItemPlu.trim();
      const res = await fetch(`${apiBase}/api/products/produce/add`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-pos-client': 'pim-admin',
          'x-manager-pin': getAdminPin()
        },
        body: JSON.stringify({
          name: newItemName.trim(),
          name_ar: newItemNameAr.trim() || undefined,
          sellingPrice: parseFloat(newItemSell) || 0.350,
          purchasePrice: parseFloat(newItemCost) || 0.200,
          is_weighed_item: true,
          plu_code: cleanPlu || undefined,
          barcode: cleanPlu || undefined,
          image_url: newItemImageUrl.trim() || undefined
        })
      });

      if (res.ok) {
        showToast(`✅ Added ${newItemName} to Weighed Produce Catalog!`, 'success');
        setShowAddModal(false);
        setNewItemName('');
        setNewItemNameAr('');
        setNewItemPlu('');
        setNewItemImageUrl('');
        fetchProduceItems();
      } else {
        showToast('Failed to add produce item', 'error');
      }
    } catch (err) {
      showToast('Error adding item', 'error');
    }
  };

  // Summary Metrics
  const modifiedCount = items.filter((i) => i.isModified).length;
  const avgMargin = useMemo(() => {
    if (items.length === 0) return 0;
    const totalMargin = items.reduce((acc, curr) => {
      const sell = parseFloat(curr.draftSellingPrice || '0') || curr.sellingPrice || 0;
      const cost = parseFloat(curr.draftCostPrice || '0') || curr.purchasePrice || 0;
      const m = sell > 0 ? ((sell - cost) / sell) * 100 : 0;
      return acc + m;
    }, 0);
    return Math.round((totalMargin / items.length) * 10) / 10;
  }, [items]);

  const totalWastageLoss = useMemo(() => {
    return items.reduce((acc, curr) => {
      const kg = parseFloat(curr.draftWastageKg || '0') || 0;
      const cost = parseFloat(curr.draftCostPrice || '0') || curr.purchasePrice || 0;
      return acc + kg * cost;
    }, 0);
  }, [items]);

  // Filtered Items (STRICTLY WEIGHED PRODUCE)
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        item.name.toLowerCase().includes(q) ||
        (item.name_ar && item.name_ar.toLowerCase().includes(q)) ||
        (item.plu_code && item.plu_code.includes(q)) ||
        (item.barcode && item.barcode.includes(q));

      if (!matchesSearch) return false;

      if (filterType === 'modified') return item.isModified;
      if (filterType === 'up') return item.priceDelta > 0;
      if (filterType === 'down') return item.priceDelta < 0;
      if (filterType === 'low_margin') return item.marginPercent < 20;
      if (filterType === 'missing_code') return !item.plu_code;
      if (filterType === 'missing_photo') return !item.image_url;

      return true;
    });
  }, [items, searchQuery, filterType]);

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 text-slate-100 overflow-hidden font-sans select-none">
      {/* =================================================================== */}
      {/* TOP COMMANDER HEADER                                                */}
      {/* =================================================================== */}
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/20 text-2xl">
            🥦
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-black tracking-tight text-white flex items-center gap-2">
                Daily Fresh Produce Commander
              </h1>
              <span className="text-[10px] bg-emerald-500/20 text-emerald-300 font-bold px-2 py-0.5 rounded-full border border-emerald-500/30">
                Scale Items Only ({items.length})
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Omni-Pad Short Codes, Pictures & 60-Sec Price Change • Synced with Central PIM
            </p>
          </div>
        </div>

        {/* Center / Right Mode Switcher & Global Actions */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Mode Switcher Tabs */}
          <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setActiveMode('60s')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer ${
                activeMode === '60s'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Zap size={14} className={activeMode === '60s' ? 'fill-slate-950' : ''} />
              <span>⚡ 60-Sec Flash Pricing</span>
            </button>
            <button
              onClick={() => setActiveMode('catalog')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer ${
                activeMode === 'catalog'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Scale size={14} />
              <span>📋 Omni-Pad Produce & Veggies</span>
            </button>
          </div>

          <button
            onClick={() => setShowPrintModal(true)}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 text-xs font-bold rounded-xl border border-slate-700 transition flex items-center gap-1.5 cursor-pointer"
          >
            <Printer size={14} />
            <span className="hidden sm:inline">Print Signs</span>
          </button>

          <button
            onClick={() => setShowAddModal(true)}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 text-xs font-bold rounded-xl border border-slate-700 transition flex items-center gap-1.5 cursor-pointer"
          >
            <Plus size={14} />
            <span>Add Scale Item</span>
          </button>

          <button
            onClick={handlePublishAll}
            disabled={modifiedCount === 0 || isPublishing}
            className={`px-4 py-1.5 rounded-xl text-xs font-black shadow-lg transition-all flex items-center gap-1.5 cursor-pointer ${
              modifiedCount > 0
                ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-emerald-600/30 hover:from-emerald-400 hover:to-teal-500 active:scale-95 animate-pulse'
                : 'bg-slate-800 text-slate-500 border border-slate-800 cursor-not-allowed'
            }`}
          >
            <Save size={14} />
            <span>
              {isPublishing
                ? 'Publishing...'
                : `Broadcast to Fleet ${modifiedCount > 0 ? `(${modifiedCount})` : ''} 🚀`}
            </span>
          </button>
        </div>
      </header>

      {/* =================================================================== */}
      {/* 60-SECOND FLASH PRICING BANNER & STOPWATCH (VISIBLE IN 60S MODE)     */}
      {/* =================================================================== */}
      {activeMode === '60s' && (
        <div className="bg-gradient-to-r from-amber-950/80 via-slate-900 to-emerald-950/80 border-b border-amber-500/30 px-6 py-3 flex flex-col md:flex-row items-center justify-between gap-4 animate-in slide-in-from-top-2 shrink-0">
          <div className="flex items-center gap-4">
            {/* Visual Circular / Pill Stopwatch */}
            <div className="flex items-center gap-2 bg-slate-950 border-2 border-amber-500/80 rounded-2xl px-4 py-2 shadow-inner">
              <Clock size={20} className="text-amber-400 animate-pulse" />
              <div className="flex flex-col">
                <span className="text-[10px] uppercase font-black tracking-wider text-amber-400">
                  STOPWATCH
                </span>
                <span className="text-2xl font-mono font-black text-amber-300 leading-none">
                  00:{timerSeconds < 10 ? `0${timerSeconds}` : timerSeconds}
                </span>
              </div>
            </div>

            <div>
              <h2 className="text-sm font-black text-white flex items-center gap-1.5">
                <span>⚡</span> Rapid Morning Wholesale Repricing
                <span className="text-[10px] bg-amber-500/20 text-amber-300 font-bold px-2 py-0.5 rounded-full border border-amber-500/30">
                  Target: 60 Seconds
                </span>
              </h2>
              <p className="text-xs text-slate-300">
                Tap nudge buttons `[-0.050]`, `[+0.050]`, or margin chips to update selling prices. Click Broadcast when done!
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isTimerRunning ? (
              <button
                type="button"
                onClick={handleStartTimer}
                className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 text-xs font-black rounded-xl shadow-md cursor-pointer transition flex items-center gap-1"
              >
                <Zap size={14} className="fill-slate-950" />
                <span>Start 60s Clock</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handlePauseTimer}
                className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-amber-300 text-xs font-bold rounded-xl border border-slate-700 cursor-pointer transition flex items-center gap-1"
              >
                <span>Pause</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleResetTimer}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 text-xs font-bold rounded-xl border border-slate-700 cursor-pointer transition flex items-center gap-1"
            >
              <RotateCcw size={13} />
              <span>Reset</span>
            </button>
          </div>
        </div>
      )}

      {/* KPI Stats Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 bg-slate-900/60 border-b border-slate-800/80 shrink-0">
        <div className="bg-slate-900/90 border border-slate-800 p-2.5 rounded-2xl flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-sm">
            ⚖️
          </div>
          <div>
            <p className="text-[10px] font-semibold text-slate-400">Scale Produce Items</p>
            <p className="text-base font-black text-white">{items.length} Items</p>
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 p-2.5 rounded-2xl flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-sm">
            ⚡
          </div>
          <div>
            <p className="text-[10px] font-semibold text-slate-400">Pending Changes</p>
            <p className="text-base font-black text-amber-300">
              {modifiedCount} <span className="text-xs font-normal text-slate-500">Unsaved</span>
            </p>
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 p-2.5 rounded-2xl flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-sm">
            %
          </div>
          <div>
            <p className="text-[10px] font-semibold text-slate-400">Avg Target Margin</p>
            <p className="text-base font-black text-emerald-400">{avgMargin}%</p>
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 p-2.5 rounded-2xl flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center font-bold text-sm">
            🗑️
          </div>
          <div>
            <p className="text-[10px] font-semibold text-slate-400">Today's Spoilage</p>
            <p className="text-base font-black text-rose-400">BD {totalWastageLoss.toFixed(3)}</p>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-3 flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-950 shrink-0">
        <div className="relative w-full sm:w-80">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search produce name, Arabic, or PLU #..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-8 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-medium"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs"
            >
              ✕
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
          {[
            { id: 'all', label: `All Scale Items (${items.length})` },
            { id: 'modified', label: `⚡ Modified (${modifiedCount})` },
            { id: 'missing_code', label: '⚠️ Missing PLU' },
            { id: 'missing_photo', label: '📷 Missing Photo' },
            { id: 'low_margin', label: '⚠️ Low Margin (<20%)' }
          ].map((btn) => (
            <button
              key={btn.id}
              onClick={() => setFilterType(btn.id as any)}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl whitespace-nowrap transition cursor-pointer ${
                filterType === btn.id
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>

      {/* =================================================================== */}
      {/* MODE 1: 60-SEC FLASH PRICING HIGH-SPEED TOUCH VIEW                  */}
      {/* =================================================================== */}
      {activeMode === '60s' ? (
        <div className="flex-1 overflow-y-auto px-4 pb-24 scrollbar-thin">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
            {filteredItems.map((item) => {
              const draftSellNum = parseFloat(item.draftSellingPrice || '0') || 0;
              const draftCostNum = parseFloat(item.draftCostPrice || '0') || 0;
              const profit = draftSellNum - draftCostNum;
              const margin = draftSellNum > 0 ? (profit / draftSellNum) * 100 : 0;
              const priceDelta = draftSellNum - (item.previousPrice || draftSellNum);

              return (
                <div
                  key={item.id}
                  className={`bg-slate-900 border rounded-2xl p-4 flex flex-col justify-between transition-all shadow-md ${
                    item.isModified
                      ? 'border-amber-500/80 bg-slate-900/95 ring-1 ring-amber-500/50'
                      : 'border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {/* Top Bar: Thumbnail, Short Code, English & Arabic Names */}
                  <div className="flex items-start gap-3">
                    {/* Produce Thumbnail / Gallery Trigger */}
                    <div
                      onClick={() => openPhotoModal(item)}
                      className="w-16 h-16 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center overflow-hidden shrink-0 cursor-pointer relative group hover:border-emerald-500 transition-colors"
                      title="Click to change produce picture"
                    >
                      {item.image_url ? (
                        <img
                          src={item.image_url}
                          alt={item.name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      ) : (
                        <span className="text-3xl">🥦</span>
                      )}
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                        <Camera size={16} className="text-white" />
                      </div>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {/* PLU Short Code Badge */}
                          <button
                            type="button"
                            onClick={() => openPluModal(item)}
                            className="bg-blue-950/80 hover:bg-blue-900 border border-blue-500/60 px-2 py-0.5 rounded-lg text-xs font-mono font-black text-blue-300 transition-colors cursor-pointer"
                            title="Click to edit Omni-Pad Short Code"
                          >
                            #{item.plu_code || '??'}
                          </button>
                          <span className="text-[10px] font-bold text-slate-400 uppercase">
                            Scale / KG
                          </span>
                          {item.isModified && (
                            <span className="text-[10px] font-black text-amber-400 bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-800">
                              MODIFIED
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => setRemoveModalItem(item)}
                          className="p-1 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 transition-colors cursor-pointer"
                          title="Remove from Daily Produce & 60s Repricing"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>

                      <h3 className="text-base font-black text-white truncate mt-1">
                        {item.name}
                      </h3>
                      {item.name_ar && (
                        <p className="text-xs font-bold text-slate-400 truncate">
                          {item.name_ar}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Center: Live Price Readout & Quick Nudge Buttons */}
                  <div className="my-3 py-2.5 px-3 bg-slate-950 rounded-xl border border-slate-800">
                    <div className="flex items-baseline justify-between mb-1.5">
                      <span className="text-[10px] uppercase font-bold text-slate-400">
                        Selling Price (BD / KG)
                      </span>
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            margin >= 25
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                              : margin >= 15
                              ? 'bg-amber-950 text-amber-300 border border-amber-800'
                              : 'bg-rose-950 text-rose-300 border border-rose-800'
                          }`}
                        >
                          {margin.toFixed(0)}% Margin
                        </span>
                        <span className="text-[10px] font-mono text-slate-400">
                          Cost: BD {Number(item.draftCostPrice || item.purchasePrice).toFixed(3)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <span className="text-2xl sm:text-3xl font-mono font-black text-emerald-400">
                        BD {item.draftSellingPrice}
                      </span>

                      {/* Fast Nudge Buttons */}
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleNudgeSellingPrice(item.id, -0.050)}
                          className="px-2 py-1.5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 rounded-lg text-xs font-mono font-black border border-slate-700 cursor-pointer"
                        >
                          -0.050
                        </button>
                        <button
                          type="button"
                          onClick={() => handleNudgeSellingPrice(item.id, +0.050)}
                          className="px-2 py-1.5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 rounded-lg text-xs font-mono font-black border border-slate-700 cursor-pointer"
                        >
                          +0.050
                        </button>
                        <button
                          type="button"
                          onClick={() => handleNudgeSellingPrice(item.id, +0.100)}
                          className="px-2 py-1.5 bg-emerald-950 hover:bg-emerald-900 active:scale-95 text-emerald-300 rounded-lg text-xs font-mono font-black border border-emerald-800 cursor-pointer"
                        >
                          +0.100
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Bottom: Margin Presets & Spoilage Nudge */}
                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-800/80">
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-slate-500 font-bold mr-1">Margin:</span>
                      {[20, 25, 30, 35].map((pct) => (
                        <button
                          key={pct}
                          type="button"
                          onClick={() => applyMarginPreset(item.id, pct)}
                          className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 active:bg-emerald-600 text-[10px] font-bold text-slate-300 cursor-pointer transition"
                        >
                          {pct}%
                        </button>
                      ))}
                    </div>

                    {/* Wastage Nudge */}
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-rose-400 font-bold">Waste:</span>
                      <button
                        type="button"
                        onClick={() => handleNudgeWastage(item.id, +0.5)}
                        className="px-1.5 py-0.5 rounded bg-rose-950/40 hover:bg-rose-900/60 border border-rose-900/60 text-[10px] font-mono font-bold text-rose-300 cursor-pointer"
                      >
                        +0.5k
                      </button>
                      <button
                        type="button"
                        onClick={() => handleNudgeWastage(item.id, +1.0)}
                        className="px-1.5 py-0.5 rounded bg-rose-950/40 hover:bg-rose-900/60 border border-rose-900/60 text-[10px] font-mono font-bold text-rose-300 cursor-pointer"
                      >
                        +1.0k
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* =================================================================== */
        /* MODE 2: FULL OMNI-PAD PRODUCE & VEGGIES CATALOG MANAGEMENT TABLE   */
        /* =================================================================== */
        <div className="flex-1 overflow-auto px-4 pb-24 scrollbar-thin">
          <div className="border border-slate-800 rounded-2xl overflow-hidden bg-slate-900 shadow-xl">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-800/80 text-slate-400 font-bold uppercase tracking-wider border-b border-slate-700/80">
                  <th className="py-3 px-3 text-center">Short Code (PLU)</th>
                  <th className="py-3 px-3 text-center">Photo</th>
                  <th className="py-3 px-4">Produce Name & Arabic</th>
                  <th className="py-3 px-3 text-right bg-slate-800/90 text-amber-300">
                    Cost (BD/KG)
                  </th>
                  <th className="py-3 px-3 text-center">Margin Presets</th>
                  <th className="py-3 px-3 text-right bg-slate-800/90 text-emerald-300">
                    Selling (BD/KG)
                  </th>
                  <th className="py-3 px-3 text-center">Margin / Profit</th>
                  <th className="py-3 px-3 text-right text-rose-300">Wastage (KG)</th>
                  <th className="py-3 px-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-medium">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-500 text-sm">
                      Loading weighed produce items from PIM...
                    </td>
                  </tr>
                ) : filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-500 text-sm">
                      No scale items match your search filter.
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((item, idx) => {
                    const draftSellNum = parseFloat(item.draftSellingPrice || '0') || 0;
                    const draftCostNum = parseFloat(item.draftCostPrice || '0') || 0;
                    const currentProfit = draftSellNum - draftCostNum;
                    const currentMargin = draftSellNum > 0 ? (currentProfit / draftSellNum) * 100 : 0;

                    return (
                      <tr
                        key={item.id}
                        className={`hover:bg-slate-800/40 transition-colors ${
                          item.isModified ? 'bg-amber-950/20 border-l-4 border-l-amber-500' : ''
                        }`}
                      >
                        {/* Short Code Badge */}
                        <td className="py-3 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => openPluModal(item)}
                            className="bg-blue-950 hover:bg-blue-900 border border-blue-500/60 hover:border-blue-400 px-2.5 py-1 rounded-xl text-xs font-mono font-black text-blue-300 transition-all cursor-pointer shadow-sm group inline-flex items-center gap-1"
                            title="Click to edit Omni-Pad Short Code"
                          >
                            <span>#{item.plu_code || '??'}</span>
                            <Edit3 size={11} className="opacity-0 group-hover:opacity-100" />
                          </button>
                        </td>

                        {/* Picture Thumbnail */}
                        <td className="py-3 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => openPhotoModal(item)}
                            className="w-10 h-10 rounded-xl bg-slate-950 border border-slate-800 hover:border-emerald-500 overflow-hidden inline-flex items-center justify-center cursor-pointer relative group transition-colors shadow-sm"
                            title="Click to change produce photo"
                          >
                            {item.image_url ? (
                              <img
                                src={item.image_url}
                                alt={item.name}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                }}
                              />
                            ) : (
                              <span className="text-xl">🥦</span>
                            )}
                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                              <Camera size={13} className="text-white" />
                            </div>
                          </button>
                        </td>

                        {/* Name & Arabic Name */}
                        <td className="py-3 px-4">
                          <div>
                            <p className="font-bold text-white text-xs leading-tight">{item.name}</p>
                            {item.name_ar && (
                              <p className="text-[11px] text-slate-400 font-medium">
                                {item.name_ar}
                              </p>
                            )}
                          </div>
                        </td>

                        {/* Cost Input */}
                        <td className="py-3 px-3 text-right bg-slate-950/40">
                          <div className="flex items-center justify-end gap-1">
                            <span className="text-slate-500 text-[10px]">BD</span>
                            <input
                              type="number"
                              step="0.005"
                              value={item.draftCostPrice}
                              onFocus={(e) => e.target.select()}
                              onChange={(e) => handlePriceChange(item.id, 'cost', e.target.value)}
                              className="w-20 text-right bg-slate-900 border border-slate-700/80 focus:border-amber-400 rounded-lg px-2 py-1 font-mono text-xs font-bold text-amber-300 focus:outline-none"
                            />
                          </div>
                        </td>

                        {/* Margin Presets */}
                        <td className="py-3 px-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {[20, 25, 30, 35].map((pct) => (
                              <button
                                key={pct}
                                type="button"
                                onClick={() => applyMarginPreset(item.id, pct)}
                                className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 active:bg-emerald-600 text-[10px] font-bold text-slate-300 cursor-pointer transition"
                              >
                                {pct}%
                              </button>
                            ))}
                          </div>
                        </td>

                        {/* Selling Input */}
                        <td className="py-3 px-3 text-right bg-slate-950/40">
                          <div className="flex items-center justify-end gap-1">
                            <span className="text-slate-500 text-[10px]">BD</span>
                            <input
                              type="number"
                              step="0.005"
                              value={item.draftSellingPrice}
                              onFocus={(e) => e.target.select()}
                              onChange={(e) =>
                                handlePriceChange(item.id, 'selling', e.target.value)
                              }
                              className="w-20 text-right bg-slate-900 border border-slate-700/80 focus:border-emerald-400 rounded-lg px-2 py-1 font-mono text-xs font-bold text-emerald-300 focus:outline-none"
                            />
                          </div>
                        </td>

                        {/* Profit & Margin Pill */}
                        <td className="py-3 px-3 text-center">
                          <div className="inline-flex flex-col items-center">
                            <span
                              className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                                currentMargin >= 25
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                  : currentMargin >= 10
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                  : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                              }`}
                            >
                              {currentMargin.toFixed(1)}%
                            </span>
                            <span className="text-[9px] text-slate-500 font-mono mt-0.5">
                              +{Math.round(currentProfit * 1000)} fils/kg
                            </span>
                          </div>
                        </td>

                        {/* Spoilage / Wastage */}
                        <td className="py-3 px-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <input
                              type="number"
                              step="0.1"
                              placeholder="0.0"
                              value={item.draftWastageKg}
                              onChange={(e) => handleWastageChange(item.id, e.target.value)}
                              className="w-16 text-right bg-slate-900 border border-slate-800 focus:border-rose-400 rounded-lg px-2 py-1 font-mono text-[11px] text-rose-300 placeholder-slate-700 focus:outline-none"
                            />
                            <span className="text-slate-500 text-[10px]">kg</span>
                          </div>
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => openPluModal(item)}
                              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-blue-400 rounded-lg cursor-pointer"
                              title="Assign PLU Code"
                            >
                              <Hash size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={() => openPhotoModal(item)}
                              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-emerald-400 rounded-lg cursor-pointer"
                              title="Assign Picture"
                            >
                              <ImageIcon size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setRemoveModalItem(item)}
                              className="p-1.5 bg-slate-800 hover:bg-rose-950/60 text-slate-400 hover:text-rose-400 rounded-lg cursor-pointer transition-colors"
                              title="Remove from Daily Produce & 60s Repricing"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* STICKY BOTTOM FLOATING BROADCAST ACTION BAR                         */}
      {/* =================================================================== */}
      {modifiedCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-md border-t-2 border-emerald-500/80 p-3.5 px-6 flex items-center justify-between shadow-2xl animate-in slide-in-from-bottom-2">
          <div className="flex items-center gap-3">
            <span className="w-3 h-3 rounded-full bg-amber-400 animate-ping" />
            <div>
              <p className="text-xs font-black text-white">
                {modifiedCount} produce price changes staged in PIM.
              </p>
              <p className="text-[10px] text-slate-400">
                Avg Target Margin: {avgMargin}% • Spoilage Log: BD {totalWastageLoss.toFixed(3)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchProduceItems}
              disabled={isPublishing}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl transition cursor-pointer"
            >
              Discard Changes
            </button>
            <button
              onClick={handlePublishAll}
              disabled={isPublishing}
              className="px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white text-xs font-black rounded-xl shadow-lg shadow-emerald-500/30 active:scale-95 transition cursor-pointer flex items-center gap-2"
            >
              <Save size={15} />
              <span>
                {isPublishing
                  ? 'Deploying to Fleet...'
                  : '🚀 1-CLICK BROADCAST ALL TO POS FLEET (0s Sync)'}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL: SHORT CODE (PLU) MANAGER                                      */}
      {/* =================================================================== */}
      {pluModalItem && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <div className="flex items-center gap-2">
                <Hash size={18} className="text-blue-400" />
                <h2 className="text-base font-black text-white">
                  Assign Omni-Pad Short Code
                </h2>
              </div>
              <button
                onClick={() => setPluModalItem(null)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800 flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-2xl overflow-hidden">
                  {pluModalItem.image_url ? (
                    <img
                      src={pluModalItem.image_url}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    '🥦'
                  )}
                </div>
                <div>
                  <h3 className="text-sm font-black text-white">{pluModalItem.name}</h3>
                  {pluModalItem.name_ar && (
                    <p className="text-xs text-slate-400 font-bold">{pluModalItem.name_ar}</p>
                  )}
                  <p className="text-[10px] text-blue-400 font-mono mt-0.5">
                    Current Code: #{pluModalItem.plu_code || 'None'}
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Numeric Short Code (Cashier types this on numpad):
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    maxLength={4}
                    placeholder="e.g. 14, 15, 18..."
                    value={inputPluCode}
                    onChange={(e) => {
                      setInputPluCode(e.target.value.replace(/\D/g, ''));
                      setPluCollisionWarning(null);
                    }}
                    autoFocus
                    className="flex-1 bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-xl px-4 py-2 text-lg font-mono font-black text-blue-300 text-center tracking-widest focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={autoSuggestNextPlu}
                    className="px-3 py-2 bg-blue-950 hover:bg-blue-900 text-blue-300 border border-blue-800 rounded-xl text-xs font-bold cursor-pointer transition flex items-center gap-1"
                    title="Find next free number (10..99)"
                  >
                    <Sparkles size={13} />
                    <span>Auto Pick</span>
                  </button>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">
                  Standard produce codes: 14 = Tomato, 15 = Cucumber, 16 = Potato, 18 = Onion, 20 = Banana.
                </p>
              </div>

              {pluCollisionWarning && (
                <div className="p-3 bg-rose-950/50 border border-rose-800 rounded-xl text-xs text-rose-300 flex items-start gap-2">
                  <AlertTriangle size={15} className="shrink-0 mt-0.5 text-rose-400" />
                  <span>{pluCollisionWarning}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setPluModalItem(null)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 text-xs font-bold rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isSavingPlu}
                  onClick={handleSavePluModal}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-black rounded-xl shadow-lg shadow-blue-600/20 active:scale-95 cursor-pointer transition"
                >
                  {isSavingPlu ? 'Saving...' : 'Save Short Code to PIM'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL: PRODUCE PICTURE MANAGER & GALLERY PRESETS                   */}
      {/* =================================================================== */}
      {photoModalItem && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full p-6 shadow-2xl animate-in zoom-in-95 flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4 shrink-0">
              <div className="flex items-center gap-2">
                <ImageIcon size={18} className="text-emerald-400" />
                <h2 className="text-base font-black text-white">
                  Produce Picture Manager ({photoModalItem.name})
                </h2>
              </div>
              <button
                onClick={() => setPhotoModalItem(null)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              {/* Live Preview Header */}
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 flex items-center gap-4">
                <div className="w-20 h-20 rounded-2xl bg-slate-900 border-2 border-emerald-500/80 flex items-center justify-center overflow-hidden shrink-0 shadow-lg">
                  {inputImageUrl ? (
                    <img
                      src={inputImageUrl}
                      alt="Preview"
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  ) : (
                    <span className="text-4xl">🥦</span>
                  )}
                </div>
                <div className="flex-1">
                  <h3 className="text-base font-black text-white">{photoModalItem.name}</h3>
                  <p className="text-xs text-slate-400 font-bold">{photoModalItem.name_ar}</p>
                  <p className="text-[11px] text-emerald-400 font-mono mt-1">
                    Photo will appear on Sunmi D2mini Omni-Pad & Web POS registers.
                  </p>
                </div>
              </div>

              {/* Custom Image URL Input */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Custom Picture Image URL:
                </label>
                <input
                  type="url"
                  placeholder="Paste direct HTTPS image URL..."
                  value={inputImageUrl}
                  onChange={(e) => setInputImageUrl(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>

              {/* Supermarket Produce Photo Presets Gallery */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-2">
                  Or Pick from Supermarket Produce Presets:
                </label>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2.5">
                  {PRODUCE_PHOTO_PRESETS.map((preset) => (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => setInputImageUrl(preset.url)}
                      className={`p-2 rounded-xl border flex flex-col items-center justify-center gap-1 cursor-pointer transition-all ${
                        inputImageUrl === preset.url
                          ? 'border-emerald-500 bg-emerald-950/40 ring-1 ring-emerald-500'
                          : 'border-slate-800 bg-slate-950 hover:border-slate-700'
                      }`}
                    >
                      <div className="w-12 h-12 rounded-lg overflow-hidden bg-slate-900 flex items-center justify-center">
                        <img
                          src={preset.url}
                          alt={preset.name}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      </div>
                      <span className="text-[10px] font-bold text-slate-300 text-center truncate w-full">
                        {preset.name}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800 mt-4 shrink-0">
              <button
                type="button"
                onClick={() => setPhotoModalItem(null)}
                className="px-4 py-2 bg-slate-800 text-slate-300 text-xs font-bold rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSavingPhoto}
                onClick={handleSavePhotoModal}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black rounded-xl shadow-lg shadow-emerald-600/20 active:scale-95 cursor-pointer transition"
              >
                {isSavingPhoto ? 'Saving...' : 'Save Picture to PIM'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL: ADD NEW SCALE PRODUCE ITEM                                   */}
      {/* =================================================================== */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-4">
              <h2 className="text-base font-black text-white flex items-center gap-2">
                <span>🥦</span> Add Weighed Produce Item
              </h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAddNewItem} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Item Name (English)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Fresh Red Radish 1kg"
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Arabic Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. فجل أحمر طازج"
                  value={newItemNameAr}
                  onChange={(e) => setNewItemNameAr(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    Cost Price (BD)
                  </label>
                  <input
                    type="number"
                    step="0.005"
                    value={newItemCost}
                    onChange={(e) => setNewItemCost(e.target.value)}
                    required
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-amber-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    Selling Price (BD)
                  </label>
                  <input
                    type="number"
                    step="0.005"
                    value={newItemSell}
                    onChange={(e) => setNewItemSell(e.target.value)}
                    required
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-emerald-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    Omni-Pad Short Code (#)
                  </label>
                  <input
                    type="text"
                    maxLength={4}
                    placeholder="e.g. 17"
                    value={newItemPlu}
                    onChange={(e) => setNewItemPlu(e.target.value.replace(/\D/g, ''))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-blue-300 font-mono font-bold focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    Picture URL
                  </label>
                  <input
                    type="url"
                    placeholder="https://..."
                    value={newItemImageUrl}
                    onChange={(e) => setNewItemImageUrl(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 text-xs font-bold rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-600/20 cursor-pointer"
                >
                  Add to PIM Catalog
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL: PRINT SHELF TALKERS / BASKET SIGNS                           */}
      {/* =================================================================== */}
      {showPrintModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full p-6 shadow-2xl animate-in zoom-in-95 flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-4 shrink-0">
              <div>
                <h2 className="text-base font-black text-white flex items-center gap-2">
                  <Printer size={18} className="text-emerald-400" />
                  Print Today's Produce Shelf Signs
                </h2>
                <p className="text-xs text-slate-400">Generate high-visibility price cards for crates and baskets</p>
              </div>
              <button
                onClick={() => setShowPrintModal(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex gap-2 mb-4 bg-slate-950 p-1.5 rounded-2xl border border-slate-800 shrink-0">
              <button
                onClick={() => setPrintFormat('thermal')}
                className={`flex-1 py-2 text-xs font-bold rounded-xl transition cursor-pointer ${
                  printFormat === 'thermal'
                    ? 'bg-emerald-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                🧾 Thermal Sticky Label (Sunmi / 80mm)
              </button>
              <button
                onClick={() => setPrintFormat('a4')}
                className={`flex-1 py-2 text-xs font-bold rounded-xl transition cursor-pointer ${
                  printFormat === 'a4'
                    ? 'bg-emerald-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                📄 A4 Multi-Basket Sign Sheet (Laser)
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 bg-slate-950 rounded-2xl border border-slate-800 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {items.slice(0, 8).map((item) => (
                  <div
                    key={item.id}
                    className="bg-white text-slate-900 rounded-xl p-4 border border-slate-300 shadow-sm flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                        <span>Askar Supermarket</span>
                        <span className="font-mono text-blue-700">PLU #{item.plu_code || item.barcode}</span>
                      </div>
                      <h3 className="text-base font-black text-slate-900 leading-tight">
                        {item.name}
                      </h3>
                      {item.name_ar && (
                        <p className="text-xs font-bold text-slate-600 mt-0.5">{item.name_ar}</p>
                      )}
                    </div>
                    <div className="mt-3 pt-2 border-t border-slate-200 flex items-baseline justify-between">
                      <span className="text-[10px] text-slate-500 font-bold">TODAY'S SPECIAL</span>
                      <span className="text-2xl font-black text-emerald-600 font-mono">
                        BD {Number(item.draftSellingPrice || item.sellingPrice).toFixed(3)} / KG
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-slate-800 mt-4 shrink-0">
              <p className="text-xs text-slate-400">Ready to print {items.length} produce signs.</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowPrintModal(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 text-xs font-bold rounded-xl cursor-pointer"
                >
                  Close
                </button>
                <button
                  onClick={() => window.print()}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-600/20 flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer size={15} />
                  <span>Send to Printer</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL: REMOVE FROM PRODUCE / DELETE FROM CATALOG                    */}
      {/* =================================================================== */}
      {removeModalItem && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-950/60 border border-rose-800 flex items-center justify-center text-rose-400">
                  <Trash2 size={20} />
                </div>
                <div>
                  <h2 className="text-base font-black text-white">Remove Produce Item</h2>
                  <p className="text-xs text-slate-400 truncate max-w-[240px]">
                    {removeModalItem.name} {removeModalItem.plu_code ? `(#${removeModalItem.plu_code})` : ''}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setRemoveModalItem(null)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4 mb-6">
              <div className="p-3 bg-slate-950 rounded-2xl border border-slate-800 text-xs text-slate-300 space-y-2">
                <p>
                  Removing this weighed item will <strong className="text-white">immediately unbind it in parallel</strong> from:
                </p>
                <ul className="list-disc list-inside space-y-1 text-slate-400 text-[11px]">
                  <li><span className="text-emerald-400 font-semibold">Daily Produce & Veggies</span> catalog</li>
                  <li><span className="text-amber-400 font-semibold">60-Sec Rapid Morning Repricing</span> page</li>
                  <li>Sunmi Omni-Pad scale grid & QuickProduct shortcuts</li>
                </ul>
              </div>

              <div className="space-y-2.5">
                {/* Option 1: Demote from Weighed Produce (Safe) */}
                <button
                  type="button"
                  disabled={isRemovingProduce}
                  onClick={() => handleRemoveProduceItem(false)}
                  className="w-full p-3.5 bg-slate-800 hover:bg-slate-700/80 border border-slate-700 rounded-2xl text-left transition-colors cursor-pointer group"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-white group-hover:text-emerald-400 transition-colors">
                      Remove from Produce & 60s Repricing
                    </span>
                    <span className="text-[10px] bg-slate-700 px-2 py-0.5 rounded-full text-slate-300 font-semibold">
                      Recommended
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Converts this item to a standard packaged grocery product. Retains all sales history and barcode in PIM.
                  </p>
                </button>

                {/* Option 2: Complete SKU Deletion from PIM */}
                <button
                  type="button"
                  disabled={isRemovingProduce}
                  onClick={() => handleRemoveProduceItem(true)}
                  className="w-full p-3.5 bg-rose-950/30 hover:bg-rose-950/60 border border-rose-900/60 rounded-2xl text-left transition-colors cursor-pointer group"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-rose-300 group-hover:text-rose-200 transition-colors">
                      Permanently Delete SKU from Entire System
                    </span>
                    <span className="text-[10px] bg-rose-900/60 px-2 py-0.5 rounded-full text-rose-300 font-semibold">
                      Catalog PIM
                    </span>
                  </div>
                  <p className="text-[11px] text-rose-400/80">
                    Completely deletes this product SKU from the database, central server, and POS inventory.
                  </p>
                </button>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                disabled={isRemovingProduce}
                onClick={() => setRemoveModalItem(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-2xl shadow-2xl text-xs font-bold flex items-center gap-2 border animate-in slide-in-from-bottom-3 ${
            toast.type === 'success'
              ? 'bg-emerald-950 border-emerald-500 text-emerald-200'
              : toast.type === 'error'
              ? 'bg-rose-950 border-rose-500 text-rose-200'
              : 'bg-blue-950 border-blue-500 text-blue-200'
          }`}
        >
          {toast.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
}
