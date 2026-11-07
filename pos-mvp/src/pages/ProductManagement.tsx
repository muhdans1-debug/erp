import React, { useState, useEffect, useMemo, useRef } from 'react';
import RawBarcode from 'react-barcode';
const Barcode = RawBarcode as any;
import {
  Search,
  ArrowUpDown,
  Check,
  AlertTriangle,
  TrendingDown,
  History,
  Printer,
  Sliders,
  RefreshCw,
  Plus,
  Download,
  AlertCircle,
  X,
  Package,
  Layers,
  Sparkles,
  Info,
  Edit2,
  Save,
  MoreVertical,
  Trash2
} from 'lucide-react';

export interface ProductItem {
  id: string;
  name: string;
  barcode: string | null;
  sellingPrice: number;
  purchasePrice: number;
  unitCost?: number;
  stockQuantity: number;
  minThreshold: number;
  maxThreshold: number;
  distributorId?: string | null;
  supplierName?: string | null;
  vatRate?: number;
  taxRate?: number;
  category?: string;
  updatedAt?: string;
}

export interface PriceHistoryRecord {
  id: string;
  productId: string;
  productName: string;
  oldPrice: number;
  newPrice: number;
  oldCost: number;
  newCost: number;
  changeReason: string | null;
  changedBy: string | null;
  createdAt: string;
}

interface ProductManagementProps {
  apiBase?: string;
}

export default function ProductManagement({ apiBase: propApiBase }: ProductManagementProps) {
  // Dynamic API Base resolution (vital for Sunmi terminal & LAN IP access)
  const resolveApiBase = () => {
    if (typeof window === 'undefined') return propApiBase || 'http://localhost:3000';
    const stored = localStorage.getItem('master_server_url');
    if (stored && stored.trim()) return stored.trim();

    const { protocol, hostname } = window.location;
    if (hostname && hostname !== 'localhost' && hostname !== '127.0.0.1') {
      return `${protocol}//${hostname}:3000`;
    }

    if (propApiBase && propApiBase.trim() && propApiBase !== 'http://localhost:3000') {
      return propApiBase.trim();
    }
    return `${protocol}//${hostname || 'localhost'}:3000`;
  };

  const apiBase = resolveApiBase();

  const [products, setProducts] = useState<ProductItem[]>([]);
  const [distributors, setDistributors] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filterType, setFilterType] = useState<'all' | 'negative' | 'low_margin' | 'healthy' | 'low_stock'>('all');
  const [selectedDistributor, setSelectedDistributor] = useState<string>('all');
  const [sortField, setSortField] = useState<'name' | 'sellingPrice' | 'purchasePrice' | 'margin' | 'stockQuantity'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Selected row IDs for bulk operations & shelf tag printing
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Inline editing state: { id, field }
  const [editingCell, setEditingCell] = useState<{ id: string; field: keyof ProductItem } | null>(null);
  const [cellDraftValue, setCellDraftValue] = useState<string>('');
  const [savingStatus, setSavingStatus] = useState<{ [id: string]: 'saving' | 'saved' | 'error' }>({});
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Dedicated Edit Product Modal State
  const [editModalProduct, setEditModalProduct] = useState<ProductItem | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    barcode: '',
    purchasePrice: '0',
    sellingPrice: '0',
    stockQuantity: '0',
    minThreshold: '10',
    maxThreshold: '100',
    distributorId: ''
  });
  const [isSavingEditModal, setIsSavingEditModal] = useState<boolean>(false);

  // Modals
  const [showBulkModal, setShowBulkModal] = useState<boolean>(false);
  const [showPrintModal, setShowPrintModal] = useState<boolean>(false);
  const [historyModalProduct, setHistoryModalProduct] = useState<ProductItem | null>(null);
  const [priceHistory, setPriceHistory] = useState<PriceHistoryRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);
  const [showAddProductModal, setShowAddProductModal] = useState<boolean>(false);

  // 3-dots action menu dropdown state
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  // Single delete modal state
  const [productToDelete, setProductToDelete] = useState<ProductItem | null>(null);
  const [isDeletingProduct, setIsDeletingProduct] = useState<boolean>(false);

  // Bulk delete modal state
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState<boolean>(false);
  const [isDeletingBulk, setIsDeletingBulk] = useState<boolean>(false);

  // Bulk rules configuration
  const [bulkAction, setBulkAction] = useState<'PERCENT_INCREASE' | 'PERCENT_DECREASE' | 'FIXED_MARKUP' | 'SET_VAT_RATE' | 'ASSIGN_DISTRIBUTOR'>('PERCENT_INCREASE');
  const [bulkValue, setBulkValue] = useState<string>('5');
  const [bulkRoundToFils, setBulkRoundToFils] = useState<number>(25); // 0, 25, 50, 100
  const [bulkReason, setBulkReason] = useState<string>('Distributor Price Adjustment');
  const [bulkDistributorId, setBulkDistributorId] = useState<string>('');
  const [isSubmittingBulk, setIsSubmittingBulk] = useState<boolean>(false);

  // Shelf-tag printing settings
  const [printTagsPerProduct, setPrintTagsPerProduct] = useState<number>(1);
  const [printStoreName, setPrintStoreName] = useState<string>('ASKAR SUPERMARKET');
  const [printOnlySelected, setPrintOnlySelected] = useState<boolean>(true);

  // Add Product form state
  const [newProduct, setNewProduct] = useState({
    name: '',
    barcode: '',
    sellingPrice: '1.000',
    purchasePrice: '0.800',
    stockQuantity: '50',
    minThreshold: '10',
    maxThreshold: '100',
    distributorId: ''
  });

  const cellInputRef = useRef<HTMLInputElement>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Load products and distributors
  const fetchProducts = async () => {
    setLoading(true);
    try {
      const [prodRes, distRes] = await Promise.all([
        fetch(`${apiBase}/api/products`),
        fetch(`${apiBase}/api/distributors`).catch(() => null)
      ]);

      const prodData = await prodRes.json();
      if (Array.isArray(prodData)) {
        setProducts(prodData);
      }

      if (distRes && distRes.ok) {
        const distData = await distRes.json();
        const dists = Array.isArray(distData) ? distData : (distData.distributors || []);
        setDistributors(dists);
      }
    } catch (err) {
      console.error('Failed to load products for PIM:', err);
      showToast('Network error loading product catalog', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, [apiBase]);

  // Focus inline input when entering edit mode
  useEffect(() => {
    if (editingCell && cellInputRef.current) {
      cellInputRef.current.focus();
      cellInputRef.current.select();
    }
  }, [editingCell]);

  // Close 3-dots menu on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.pim-action-menu-container')) {
        setActiveMenuId(null);
      }
    };
    if (activeMenuId) {
      document.addEventListener('mousedown', handleOutsideClick);
      return () => document.removeEventListener('mousedown', handleOutsideClick);
    }
  }, [activeMenuId]);

  // Helper calculations
  const calculateMargin = (selling: number, cost: number) => {
    if (!selling || selling <= 0) return 0;
    return ((selling - cost) / selling) * 100;
  };

  const getMarginClass = (margin: number) => {
    if (margin < 0) {
      return {
        bg: 'bg-rose-500/10 border-l-4 border-rose-500 text-rose-700',
        badge: 'bg-rose-600 text-white font-black animate-pulse',
        label: 'NEGATIVE (< 0%)',
        textColor: 'text-rose-600 font-bold'
      };
    }
    if (margin < 5) {
      return {
        bg: 'bg-amber-500/10 border-l-4 border-amber-500 text-amber-800',
        badge: 'bg-amber-500 text-slate-900 font-bold',
        label: 'LOW (< 5%)',
        textColor: 'text-amber-600 font-semibold'
      };
    }
    return {
      bg: 'bg-emerald-500/5 text-emerald-800',
      badge: 'bg-emerald-600 text-white font-medium',
      label: 'HEALTHY',
      textColor: 'text-emerald-600 font-semibold'
    };
  };

  // Filter & Sort Logic
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      // Search
      const search = searchTerm.toLowerCase();
      const matchSearch =
        p.name.toLowerCase().includes(search) ||
        (p.barcode && p.barcode.toLowerCase().includes(search)) ||
        (p.supplierName && p.supplierName.toLowerCase().includes(search)) ||
        p.id.toLowerCase().includes(search);

      if (!matchSearch) return false;

      // Distributor filter
      if (selectedDistributor !== 'all' && p.distributorId !== selectedDistributor) {
        return false;
      }

      // Quick Risk Filter
      const cost = p.purchasePrice ?? p.unitCost ?? 0;
      const margin = calculateMargin(p.sellingPrice, cost);

      if (filterType === 'negative') return margin < 0;
      if (filterType === 'low_margin') return margin >= 0 && margin < 5;
      if (filterType === 'healthy') return margin >= 5;
      if (filterType === 'low_stock') return p.stockQuantity <= p.minThreshold;

      return true;
    }).sort((a, b) => {
      let comparison = 0;
      const costA = a.purchasePrice ?? a.unitCost ?? 0;
      const costB = b.purchasePrice ?? b.unitCost ?? 0;
      const marginA = calculateMargin(a.sellingPrice, costA);
      const marginB = calculateMargin(b.sellingPrice, costB);

      switch (sortField) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'sellingPrice':
          comparison = a.sellingPrice - b.sellingPrice;
          break;
        case 'purchasePrice':
          comparison = costA - costB;
          break;
        case 'margin':
          comparison = marginA - marginB;
          break;
        case 'stockQuantity':
          comparison = a.stockQuantity - b.stockQuantity;
          break;
        default:
          comparison = 0;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [products, searchTerm, filterType, selectedDistributor, sortField, sortOrder]);

  // Overall KPI metrics
  const kpis = useMemo(() => {
    const totalCount = products.length;
    let totalCostVal = 0;
    let totalSaleVal = 0;
    let negMarginCount = 0;
    let lowMarginCount = 0;
    let totalMarginSum = 0;

    products.forEach((p) => {
      const cost = p.purchasePrice ?? p.unitCost ?? 0;
      const margin = calculateMargin(p.sellingPrice, cost);
      totalCostVal += cost * p.stockQuantity;
      totalSaleVal += p.sellingPrice * p.stockQuantity;
      totalMarginSum += margin;

      if (margin < 0) negMarginCount++;
      else if (margin < 5) lowMarginCount++;
    });

    const avgMargin = totalCount > 0 ? (totalMarginSum / totalCount).toFixed(1) : '0.0';

    return {
      totalCount,
      totalCostVal: totalCostVal.toFixed(3),
      totalSaleVal: totalSaleVal.toFixed(3),
      avgMargin,
      negMarginCount,
      lowMarginCount
    };
  }, [products]);

  // Handle cell edit trigger
  const startEditing = (product: ProductItem, field: keyof ProductItem) => {
    // If already editing this cell, don't re-init
    if (editingCell?.id === product.id && editingCell?.field === field) return;

    setEditingCell({ id: product.id, field });
    let currentVal = product[field];
    if (field === 'purchasePrice') {
      currentVal = product.purchasePrice ?? product.unitCost ?? 0;
    }
    setCellDraftValue(currentVal !== undefined && currentVal !== null ? String(currentVal) : '');
  };

  // Commit inline edit to backend
  const commitCellEdit = async () => {
    if (!editingCell) return;
    const { id, field } = editingCell;
    const originalProd = products.find((p) => p.id === id);
    if (!originalProd) {
      setEditingCell(null);
      return;
    }

    const rawVal = cellDraftValue.trim();
    let parsedVal: any = rawVal;

    if (['sellingPrice', 'purchasePrice', 'stockQuantity', 'minThreshold', 'maxThreshold'].includes(field)) {
      parsedVal = parseFloat(rawVal);
      if (isNaN(parsedVal)) {
        showToast('Please enter a valid number', 'error');
        setEditingCell(null);
        return;
      }
    }

    // Close editing immediately
    setEditingCell(null);

    // Optimistic UI Update
    setProducts((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        const updated = { ...p, [field]: parsedVal };
        if (field === 'purchasePrice') {
          updated.unitCost = parsedVal;
        }
        return updated;
      })
    );
    setSavingStatus((prev) => ({ ...prev, [id]: 'saving' }));

    try {
      const payload: any = {
        [field]: parsedVal,
        changedBy: 'Manager',
        reason: `Inline PIM grid update on ${String(field)}`
      };
      if (field === 'purchasePrice') {
        payload.unitCost = parsedVal;
      }

      let res: Response;
      try {
        res = await fetch(`${apiBase}/api/products/${id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'x-manager-pin': '9999',
            'x-pos-client': 'pim-admin'
          },
          body: JSON.stringify(payload)
        });
      } catch (putErr) {
        // Fallback to POST
        res = await fetch(`${apiBase}/api/products/${id}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-manager-pin': '9999',
            'x-pos-client': 'pim-admin'
          },
          body: JSON.stringify(payload)
        });
      }

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Server rejected update');
      }

      // Sync backend updated record (including calculated margins and timestamps)
      if (data.product) {
        setProducts((prev) =>
          prev.map((p) => (p.id === id ? { ...p, ...data.product } : p))
        );
      }

      setSavingStatus((prev) => ({ ...prev, [id]: 'saved' }));
      showToast(`Saved ${originalProd.name} (${String(field)}: ${parsedVal})`);
      setTimeout(() => {
        setSavingStatus((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }, 1500);
    } catch (err: any) {
      console.error('Failed to commit inline edit:', err);
      // Revert optimistic update
      setProducts((prev) =>
        prev.map((p) => (p.id === id ? originalProd : p))
      );
      setSavingStatus((prev) => ({ ...prev, [id]: 'error' }));
      showToast(`Update failed: ${err.message || 'Network error'}`, 'error');
    }
  };

  // Keyboard navigation inside cell editor
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitCellEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setEditingCell(null);
    }
  };

  // Open Edit Product Modal
  const openEditModal = (p: ProductItem) => {
    setEditModalProduct(p);
    const cost = p.purchasePrice ?? p.unitCost ?? 0;
    setEditForm({
      name: p.name || '',
      barcode: p.barcode || '',
      purchasePrice: String(cost),
      sellingPrice: String(p.sellingPrice || 0),
      stockQuantity: String(p.stockQuantity || 0),
      minThreshold: String(p.minThreshold ?? 10),
      maxThreshold: String(p.maxThreshold ?? 100),
      distributorId: p.distributorId || ''
    });
  };

  // Save changes from Edit Product Modal
  const handleSaveEditModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editModalProduct) return;
    setIsSavingEditModal(true);

    try {
      const payload = {
        name: editForm.name.trim() || editModalProduct.name,
        barcode: editForm.barcode.trim() || null,
        purchasePrice: parseFloat(editForm.purchasePrice) || 0,
        unitCost: parseFloat(editForm.purchasePrice) || 0,
        sellingPrice: parseFloat(editForm.sellingPrice) || 0,
        stockQuantity: parseInt(editForm.stockQuantity) || 0,
        minThreshold: parseInt(editForm.minThreshold) || 0,
        maxThreshold: parseInt(editForm.maxThreshold) || 0,
        distributorId: editForm.distributorId || null,
        reason: 'Full product edit via PIM Edit Drawer',
        changedBy: 'Manager'
      };

      let res: Response;
      try {
        res = await fetch(`${apiBase}/api/products/${editModalProduct.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'x-manager-pin': '9999',
            'x-pos-client': 'pim-admin'
          },
          body: JSON.stringify(payload)
        });
      } catch (putErr) {
        // Fallback to POST
        res = await fetch(`${apiBase}/api/products/${editModalProduct.id}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-manager-pin': '9999',
            'x-pos-client': 'pim-admin'
          },
          body: JSON.stringify(payload)
        });
      }

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to save product details');
      }

      if (data.product) {
        setProducts((prev) =>
          prev.map((p) => (p.id === editModalProduct.id ? { ...p, ...data.product } : p))
        );
      } else {
        await fetchProducts();
      }

      setEditModalProduct(null);
      showToast(`Updated "${payload.name}" successfully!`);
    } catch (err: any) {
      console.error('Error saving product in edit modal:', err);
      showToast(err.message || 'Error updating product', 'error');
    } finally {
      setIsSavingEditModal(false);
    }
  };

  // Delete single product
  const handleDeleteProduct = async () => {
    if (!productToDelete) return;
    setIsDeletingProduct(true);
    const id = productToDelete.id;
    const name = productToDelete.name;

    try {
      let res: Response;
      try {
        res = await fetch(`${apiBase}/api/products/${id}`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'x-manager-pin': '9999',
            'x-pos-client': 'pim-admin'
          }
        });
      } catch (err) {
        // Fallback to POST /delete
        res = await fetch(`${apiBase}/api/products/${id}/delete`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-manager-pin': '9999',
            'x-pos-client': 'pim-admin'
          }
        });
      }

      const data = await res.json().catch(() => ({}));
      if (!res.ok || (data && data.success === false)) {
        throw new Error(data.error || 'Server failed to delete product');
      }

      setProducts((prev) => prev.filter((p) => p.id !== id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });

      showToast(`Deleted "${name}" from catalog`, 'success');
      setProductToDelete(null);
    } catch (err: any) {
      console.error('Delete product failed:', err);
      showToast(`Failed to delete product: ${err.message || 'Unknown error'}`, 'error');
    } finally {
      setIsDeletingProduct(false);
    }
  };

  // Bulk delete selected products
  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setIsDeletingBulk(true);
    const count = selectedIds.size;
    const idsToDelete = Array.from(selectedIds);

    try {
      const res = await fetch(`${apiBase}/api/products/bulk-delete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-manager-pin': '9999',
          'x-pos-client': 'pim-admin'
        },
        body: JSON.stringify({ productIds: idsToDelete })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || (data && data.success === false)) {
        throw new Error(data.error || 'Failed to delete selected products');
      }

      setProducts((prev) => prev.filter((p) => !selectedIds.has(p.id)));
      setSelectedIds(new Set());
      showToast(`Successfully deleted ${count} products from catalog`, 'success');
      setShowBulkDeleteModal(false);
    } catch (err: any) {
      console.error('Bulk delete failed:', err);
      showToast(`Bulk delete failed: ${err.message || 'Unknown error'}`, 'error');
    } finally {
      setIsDeletingBulk(false);
    }
  };

  // Selection toggling
  const toggleSelectAll = () => {
    if (selectedIds.size === filteredProducts.length && filteredProducts.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredProducts.map((p) => p.id)));
    }
  };

  const toggleSelectRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Price History Viewer
  const openPriceHistory = async (product: ProductItem) => {
    setHistoryModalProduct(product);
    setLoadingHistory(true);
    try {
      const res = await fetch(`${apiBase}/api/products/${product.id}/price-history`);
      const data = await res.json();
      if (data.success && Array.isArray(data.history)) {
        setPriceHistory(data.history);
      } else {
        setPriceHistory([]);
      }
    } catch (err) {
      console.error('Failed to fetch price history:', err);
      setPriceHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Execute Bulk Rule
  const handleApplyBulkRules = async () => {
    if (selectedIds.size === 0) return;
    setIsSubmittingBulk(true);

    try {
      const payload = {
        productIds: Array.from(selectedIds),
        action: bulkAction,
        value: bulkAction === 'ASSIGN_DISTRIBUTOR' ? bulkDistributorId : parseFloat(bulkValue),
        roundToFils: bulkRoundToFils,
        reason: bulkReason || 'PIM Automated Bulk Price Rule',
        changedBy: 'Supermarket Manager'
      };

      const res = await fetch(`${apiBase}/api/products/bulk-update`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-manager-pin': '9999',
          'x-pos-client': 'pim-admin'
        },
        body: JSON.stringify(payload)
      });

      const result = await res.json();
      if (result.success) {
        setShowBulkModal(false);
        showToast(`Bulk updated ${result.updatedCount || selectedIds.size} SKUs successfully!`);
        await fetchProducts();
      } else {
        showToast(`Bulk update failed: ${result.error || 'Unknown error'}`, 'error');
      }
    } catch (err: any) {
      console.error('Bulk update error:', err);
      showToast('Network error executing bulk action', 'error');
    } finally {
      setIsSubmittingBulk(false);
    }
  };

  // Add Product submission
  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProduct.name.trim()) return;

    try {
      const payload = {
        name: newProduct.name.trim(),
        barcode: newProduct.barcode.trim() || null,
        sellingPrice: parseFloat(newProduct.sellingPrice) || 0,
        purchasePrice: parseFloat(newProduct.purchasePrice) || 0,
        unitCost: parseFloat(newProduct.purchasePrice) || 0,
        stockQuantity: parseInt(newProduct.stockQuantity) || 0,
        minThreshold: parseInt(newProduct.minThreshold) || 10,
        maxThreshold: parseInt(newProduct.maxThreshold) || 100,
        distributorId: newProduct.distributorId || null
      };

      const res = await fetch(`${apiBase}/api/products`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-manager-pin': '9999',
          'x-pos-client': 'pim-admin'
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setShowAddProductModal(false);
        setNewProduct({
          name: '',
          barcode: '',
          sellingPrice: '1.000',
          purchasePrice: '0.800',
          stockQuantity: '50',
          minThreshold: '10',
          maxThreshold: '100',
          distributorId: ''
        });
        showToast(`Added new product "${payload.name}"!`);
        await fetchProducts();
      } else {
        showToast('Failed to create product', 'error');
      }
    } catch (err: any) {
      console.error('Failed to create product:', err);
      showToast('Error creating product', 'error');
    }
  };

  // Export to CSV
  const handleExportCSV = () => {
    const headers = ['SKU_ID', 'Name', 'Barcode', 'Cost_Price_BHD', 'Sale_Price_BHD', 'Margin_Percent', 'Stock', 'Min_Stock', 'Supplier'];
    const rows = filteredProducts.map((p) => {
      const cost = p.purchasePrice ?? p.unitCost ?? 0;
      const margin = calculateMargin(p.sellingPrice, cost).toFixed(2);
      return [
        p.id,
        `"${p.name.replace(/"/g, '""')}"`,
        p.barcode || '',
        cost.toFixed(3),
        p.sellingPrice.toFixed(3),
        margin,
        p.stockQuantity,
        p.minThreshold,
        `"${(p.supplierName || '').replace(/"/g, '""')}"`
      ].join(',');
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `PIM_Inventory_Catalog_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Products to print for shelf tags
  const shelfTagsList = useMemo(() => {
    const baseList = printOnlySelected && selectedIds.size > 0
      ? products.filter((p) => selectedIds.has(p.id))
      : filteredProducts;

    const tags: ProductItem[] = [];
    baseList.forEach((p) => {
      for (let i = 0; i < printTagsPerProduct; i++) {
        tags.push(p);
      }
    });
    return tags;
  }, [printOnlySelected, selectedIds, products, filteredProducts, printTagsPerProduct]);

  return (
    <div className="flex flex-col min-h-screen bg-slate-900 text-slate-100 font-sans antialiased">
      {/* --- TOAST NOTIFICATION --- */}
      {toastMessage && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2 text-xs font-bold transition-all animate-in slide-in-from-bottom-3 ${
            toastMessage.type === 'error'
              ? 'bg-rose-600 text-white border border-rose-500'
              : 'bg-emerald-600 text-white border border-emerald-500'
          }`}
        >
          {toastMessage.type === 'error' ? <AlertTriangle size={16} /> : <Check size={16} />}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* --- PRINT-ONLY STYLES & CONTAINER --- */}
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #shelf-tags-printable, #shelf-tags-printable * {
            visibility: visible !important;
          }
          #shelf-tags-printable {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            display: block !important;
            background: white !important;
            color: black !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          .no-print {
            display: none !important;
          }
          @page {
            size: A4 portrait;
            margin: 8mm 6mm;
          }
        }
      `}</style>

      {/* --- SHELF TAGS PRINT CONTAINER (A4 3x7 STICKER GRID) --- */}
      <div id="shelf-tags-printable" className="hidden print:block w-full">
        <div className="grid grid-cols-3 gap-2 w-full">
          {shelfTagsList.map((tag, idx) => (
            <div
              key={`${tag.id}-${idx}`}
              className="border-2 border-dashed border-slate-400 p-2.5 rounded-lg flex flex-col justify-between h-[135px] max-h-[140px] bg-white text-slate-900 overflow-hidden page-break-inside-avoid"
            >
              <div className="flex justify-between items-start border-b border-slate-200 pb-1">
                <span className="text-[9px] font-black tracking-widest text-emerald-800 uppercase">
                  {printStoreName}
                </span>
                <span className="text-[8px] bg-emerald-100 text-emerald-900 font-bold px-1.5 py-0.5 rounded">
                  INCL 10% VAT
                </span>
              </div>

              <div className="my-1">
                <h3 className="font-bold text-xs leading-tight line-clamp-2 uppercase text-slate-900">
                  {tag.name}
                </h3>
              </div>

              <div className="flex items-center justify-between mt-auto pt-1 border-t border-slate-100">
                <div className="flex-1 overflow-hidden pr-1">
                  <Barcode
                    value={tag.barcode || tag.id}
                    width={1.1}
                    height={26}
                    fontSize={9}
                    margin={0}
                    displayValue={true}
                  />
                </div>
                <div className="text-right pl-1">
                  <div className="text-[9px] font-bold text-slate-500 uppercase">PRICE (BHD)</div>
                  <div className="text-lg font-black tracking-tight text-emerald-700 leading-none">
                    {tag.sellingPrice.toFixed(3)}
                  </div>
                  <div className="text-[8px] text-slate-400 font-medium">FILS / UNIT</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* --- DASHBOARD HEADER --- */}
      <div className="bg-slate-950/80 backdrop-blur border-b border-slate-800 p-6 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 bg-emerald-500/20 text-emerald-400 rounded-lg">
                <Layers size={22} />
              </span>
              <h1 className="text-2xl font-black tracking-tight text-white">
                Product Information Management (PIM)
              </h1>
              <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-semibold px-2.5 py-0.5 rounded-full">
                Interactive Catalog
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Click any cell to edit inline, or click the <Edit2 size={12} className="inline mx-0.5 text-amber-400" /> icon to open full product settings.
            </p>
          </div>

          {/* Action Toolbar */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              onClick={() => setShowBulkModal(true)}
              className="flex items-center gap-2 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg shadow-sm transition active:scale-95 cursor-pointer"
            >
              <Sliders size={15} />
              <span>Bulk Rules {selectedIds.size > 0 && `(${selectedIds.size})`}</span>
            </button>

            <button
              onClick={() => setShowPrintModal(true)}
              className="flex items-center gap-2 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg shadow-sm transition active:scale-95 cursor-pointer"
            >
              <Printer size={15} />
              <span>Print Shelf Tags {selectedIds.size > 0 && `(${selectedIds.size})`}</span>
            </button>

            {selectedIds.size > 0 && (
              <button
                onClick={() => setShowBulkDeleteModal(true)}
                className="flex items-center gap-2 px-3.5 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-lg shadow-sm transition active:scale-95 cursor-pointer animate-in fade-in"
                title="Delete selected items from catalog"
              >
                <Trash2 size={15} />
                <span>Delete Selected ({selectedIds.size})</span>
              </button>
            )}

            <button
              onClick={handleExportCSV}
              className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition cursor-pointer"
              title="Export filtered catalog to CSV"
            >
              <Download size={15} />
              <span>Export CSV</span>
            </button>

            <button
              onClick={() => setShowAddProductModal(true)}
              className="flex items-center gap-2 px-3.5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black rounded-lg shadow-sm transition active:scale-95 cursor-pointer"
            >
              <Plus size={16} />
              <span>Add SKU</span>
            </button>

            <button
              onClick={fetchProducts}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition cursor-pointer"
              title="Reload catalog"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* --- KPI STATS RIBBON --- */}
        <div className="max-w-7xl mx-auto grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-5">
          <div className="bg-slate-900 border border-slate-800 p-3 rounded-xl">
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Total SKUs</div>
            <div className="text-xl font-black text-white mt-0.5">{kpis.totalCount}</div>
            <div className="text-[10px] text-slate-500 mt-0.5">Active catalog items</div>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-3 rounded-xl">
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Avg Margin</div>
            <div className="text-xl font-black text-emerald-400 mt-0.5">{kpis.avgMargin}%</div>
            <div className="text-[10px] text-slate-500 mt-0.5">Catalog profitability</div>
          </div>

          {/* Negative Margin Risk Card */}
          <button
            onClick={() => setFilterType(filterType === 'negative' ? 'all' : 'negative')}
            className={`text-left p-3 rounded-xl border transition cursor-pointer ${
              filterType === 'negative'
                ? 'bg-rose-500/20 border-rose-500 shadow-md ring-2 ring-rose-500/30'
                : 'bg-slate-900 border-rose-900/40 hover:border-rose-700'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-rose-400 uppercase tracking-wider flex items-center gap-1">
                <AlertTriangle size={13} /> Loss Margins
              </span>
              {kpis.negMarginCount > 0 && (
                <span className="bg-rose-600 text-white text-[10px] font-black px-1.5 py-0.2 rounded-full animate-pulse">
                  RISK
                </span>
              )}
            </div>
            <div className="text-xl font-black text-rose-400 mt-0.5">{kpis.negMarginCount} SKUs</div>
            <div className="text-[10px] text-rose-300/80 mt-0.5">Selling below cost (&lt; 0%)</div>
          </button>

          {/* Low Margin Risk Card */}
          <button
            onClick={() => setFilterType(filterType === 'low_margin' ? 'all' : 'low_margin')}
            className={`text-left p-3 rounded-xl border transition cursor-pointer ${
              filterType === 'low_margin'
                ? 'bg-amber-500/20 border-amber-500 shadow-md ring-2 ring-amber-500/30'
                : 'bg-slate-900 border-amber-900/40 hover:border-amber-700'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1">
                <TrendingDown size={13} /> Low Margins
              </span>
            </div>
            <div className="text-xl font-black text-amber-400 mt-0.5">{kpis.lowMarginCount} SKUs</div>
            <div className="text-[10px] text-amber-300/80 mt-0.5">Margin under 5%</div>
          </button>

          <div className="bg-slate-900 border border-slate-800 p-3 rounded-xl">
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Inventory Cost</div>
            <div className="text-xl font-black text-slate-200 mt-0.5">BD {kpis.totalCostVal}</div>
            <div className="text-[10px] text-slate-500 mt-0.5">Valuation at wholesale</div>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-3 rounded-xl">
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Retail Value</div>
            <div className="text-xl font-black text-emerald-400 mt-0.5">BD {kpis.totalSaleVal}</div>
            <div className="text-[10px] text-slate-500 mt-0.5">Potential revenue</div>
          </div>
        </div>
      </div>

      {/* --- CONTROLS, SEARCH & FILTER BAR --- */}
      <div className="max-w-7xl mx-auto w-full px-6 py-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Instant Search input */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
          <input
            type="text"
            placeholder="Search by SKU, product name, barcode, or distributor..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-800/80 border border-slate-700 rounded-xl pl-10 pr-4 py-2 text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
            >
              <X size={15} />
            </button>
          )}
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => setFilterType('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
              filterType === 'all'
                ? 'bg-slate-700 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            All ({products.length})
          </button>

          <button
            onClick={() => setFilterType('negative')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
              filterType === 'negative'
                ? 'bg-rose-600 text-white'
                : 'text-rose-400 hover:bg-rose-950/40'
            }`}
          >
            <AlertTriangle size={13} />
            <span>Loss ({kpis.negMarginCount})</span>
          </button>

          <button
            onClick={() => setFilterType('low_margin')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
              filterType === 'low_margin'
                ? 'bg-amber-600 text-slate-950'
                : 'text-amber-400 hover:bg-amber-950/40'
            }`}
          >
            <span>Low Margin ({kpis.lowMarginCount})</span>
          </button>

          <button
            onClick={() => setFilterType('healthy')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
              filterType === 'healthy'
                ? 'bg-emerald-600 text-white'
                : 'text-emerald-400 hover:bg-emerald-950/40'
            }`}
          >
            Healthy (&ge; 5%)
          </button>

          <button
            onClick={() => setFilterType('low_stock')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
              filterType === 'low_stock'
                ? 'bg-sky-600 text-white'
                : 'text-sky-400 hover:bg-sky-950/40'
            }`}
          >
            Low Stock
          </button>
        </div>

        {/* Distributor Filter & Sort */}
        <div className="flex items-center gap-2">
          {distributors.length > 0 && (
            <select
              value={selectedDistributor}
              onChange={(e) => setSelectedDistributor(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg px-2.5 py-2 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="all">All Distributors</option>
              {distributors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          )}

          <div className="flex items-center bg-slate-800 border border-slate-700 rounded-lg p-1 text-xs text-slate-300">
            <ArrowUpDown size={14} className="text-slate-400 ml-1.5 mr-1" />
            <select
              value={sortField}
              onChange={(e) => setSortField(e.target.value as any)}
              className="bg-transparent text-slate-200 text-xs focus:outline-none pr-1"
            >
              <option value="name" className="bg-slate-800">Name</option>
              <option value="sellingPrice" className="bg-slate-800">Sale Price</option>
              <option value="purchasePrice" className="bg-slate-800">Cost Price</option>
              <option value="margin" className="bg-slate-800">Profit Margin %</option>
              <option value="stockQuantity" className="bg-slate-800">Stock Qty</option>
            </select>
            <button
              onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              className="px-2 py-0.5 hover:text-white font-bold cursor-pointer"
            >
              {sortOrder === 'asc' ? '↑' : '↓'}
            </button>
          </div>
        </div>
      </div>

      {/* --- INLINE SPREADSHEET DATA GRID --- */}
      <div className="max-w-7xl mx-auto w-full px-6 flex-1 pb-16">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
          {/* Grid Subheader / Instructions */}
          <div className="bg-slate-950/60 border-b border-slate-800/80 px-4 py-2.5 flex items-center justify-between text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500"></span>
              <span>
                <strong>Editable Catalog Grid:</strong> Click any cell to edit inline (click <Check size={12} className="inline text-emerald-400" /> or press <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-[10px] text-slate-300">Enter</kbd> to save). Or click <Edit2 size={12} className="inline text-amber-400" /> to edit the entire SKU in a drawer.
              </span>
            </div>
            <div className="text-slate-500 font-mono">
              Showing {filteredProducts.length} of {products.length} SKUs
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider select-none">
                  <th className="py-3.5 px-3 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === filteredProducts.length && filteredProducts.length > 0}
                      onChange={toggleSelectAll}
                      className="rounded border-slate-700 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                    />
                  </th>
                  <th className="py-3.5 px-4 min-w-[220px]">Product Name</th>
                  <th className="py-3.5 px-3 min-w-[140px]">Barcode</th>
                  <th className="py-3.5 px-3 text-right min-w-[130px] bg-slate-950/70">
                    <span>Cost (BD)</span>
                  </th>
                  <th className="py-3.5 px-3 text-right min-w-[135px] bg-slate-950/70">
                    <span>Sale Price (BD)</span>
                  </th>
                  <th className="py-3.5 px-4 text-center min-w-[150px] bg-slate-900">
                    <span>Margin % & Risk</span>
                  </th>
                  <th className="py-3.5 px-3 text-right min-w-[110px]">Profit (BD)</th>
                  <th className="py-3.5 px-3 text-right min-w-[100px]">Stock</th>
                  <th className="py-3.5 px-3 text-right min-w-[90px]">Min</th>
                  <th className="py-3.5 px-4 min-w-[140px]">Distributor</th>
                  <th className="py-3.5 px-3 text-center min-w-[110px]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {filteredProducts.map((p, idx) => {
                  const cost = p.purchasePrice ?? p.unitCost ?? 0;
                  const margin = calculateMargin(p.sellingPrice, cost);
                  const marginStyling = getMarginClass(margin);
                  const isSelected = selectedIds.has(p.id);
                  const status = savingStatus[p.id];

                  return (
                    <tr
                      key={p.id}
                      className={`transition-colors group hover:bg-slate-800/40 ${
                        isSelected ? 'bg-slate-800/60' : ''
                      } ${marginStyling.bg}`}
                    >
                      {/* Checkbox Column */}
                      <td className="py-2.5 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectRow(p.id)}
                          className="rounded border-slate-700 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                        />
                      </td>

                      {/* Product Name (Inline Editable) */}
                      <td
                        onClick={() => {
                          if (editingCell?.id !== p.id || editingCell?.field !== 'name') {
                            startEditing(p, 'name');
                          }
                        }}
                        className="py-2.5 px-4 font-sans font-medium text-slate-100 hover:bg-slate-700/40 cursor-pointer relative group/cell"
                        title="Click to edit name"
                      >
                        {editingCell?.id === p.id && editingCell.field === 'name' ? (
                          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                            <input
                              ref={cellInputRef}
                              type="text"
                              value={cellDraftValue}
                              onChange={(e) => setCellDraftValue(e.target.value)}
                              onKeyDown={handleKeyDown}
                              className="w-full bg-slate-800 border-2 border-emerald-500 text-white rounded px-2 py-1 text-xs font-sans focus:outline-none"
                              autoFocus
                            />
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                commitCellEdit();
                              }}
                              className="p-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded cursor-pointer flex-shrink-0"
                              title="Save Name"
                            >
                              <Check size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingCell(null);
                              }}
                              className="p-1 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded cursor-pointer flex-shrink-0"
                              title="Cancel"
                            >
                              <X size={13} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between">
                            <span className="truncate max-w-[240px] font-semibold">{p.name}</span>
                            <div className="flex items-center gap-1 ml-2">
                              {status === 'saving' && (
                                <span className="text-[10px] text-amber-400 font-sans animate-pulse">Saving...</span>
                              )}
                              {status === 'saved' && (
                                <span className="text-emerald-400">
                                  <Check size={14} />
                                </span>
                              )}
                              {status === 'error' && (
                                <span className="text-rose-400" title="Update failed">
                                  <AlertCircle size={14} />
                                </span>
                              )}
                              <Edit2 size={11} className="text-slate-500 opacity-0 group-hover/cell:opacity-100 transition-opacity" />
                            </div>
                          </div>
                        )}
                      </td>

                      {/* Barcode (Inline Editable) */}
                      <td
                        onClick={() => {
                          if (editingCell?.id !== p.id || editingCell?.field !== 'barcode') {
                            startEditing(p, 'barcode');
                          }
                        }}
                        className="py-2.5 px-3 text-slate-400 hover:bg-slate-700/40 cursor-pointer group/cell"
                        title="Click to edit barcode"
                      >
                        {editingCell?.id === p.id && editingCell.field === 'barcode' ? (
                          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                            <input
                              ref={cellInputRef}
                              type="text"
                              value={cellDraftValue}
                              onChange={(e) => setCellDraftValue(e.target.value)}
                              onKeyDown={handleKeyDown}
                              className="w-full bg-slate-800 border-2 border-emerald-500 text-white rounded px-2 py-1 text-xs focus:outline-none"
                              autoFocus
                            />
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                commitCellEdit();
                              }}
                              className="p-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded cursor-pointer"
                              title="Save"
                            >
                              <Check size={12} />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingCell(null);
                              }}
                              className="p-1 bg-slate-700 text-slate-300 rounded cursor-pointer"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between">
                            <span className={p.barcode ? 'text-slate-300' : 'text-slate-600 italic'}>
                              {p.barcode || 'Scan / Set'}
                            </span>
                            <Edit2 size={11} className="text-slate-500 opacity-0 group-hover/cell:opacity-100 transition-opacity" />
                          </div>
                        )}
                      </td>

                      {/* Cost Price (Inline Editable) */}
                      <td
                        onClick={() => {
                          if (editingCell?.id !== p.id || editingCell?.field !== 'purchasePrice') {
                            startEditing(p, 'purchasePrice');
                          }
                        }}
                        className="py-2.5 px-3 text-right text-slate-300 hover:bg-slate-700/40 cursor-pointer bg-slate-950/30 font-semibold group/cell"
                        title="Click to edit wholesale cost"
                      >
                        {editingCell?.id === p.id && editingCell.field === 'purchasePrice' ? (
                          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                            <input
                              ref={cellInputRef}
                              type="number"
                              step="0.001"
                              value={cellDraftValue}
                              onChange={(e) => setCellDraftValue(e.target.value)}
                              onKeyDown={handleKeyDown}
                              className="w-20 text-right bg-slate-800 border-2 border-emerald-500 text-white rounded px-1.5 py-1 text-xs focus:outline-none"
                              autoFocus
                            />
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                commitCellEdit();
                              }}
                              className="p-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded cursor-pointer"
                              title="Save Cost"
                            >
                              <Check size={12} />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingCell(null);
                              }}
                              className="p-1 bg-slate-700 text-slate-300 rounded cursor-pointer"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-1.5">
                            <span>{cost.toFixed(3)}</span>
                            <Edit2 size={11} className="text-slate-500 opacity-0 group-hover/cell:opacity-100 transition-opacity" />
                          </div>
                        )}
                      </td>

                      {/* Sale Price (Inline Editable with Live Feedback) */}
                      <td
                        onClick={() => {
                          if (editingCell?.id !== p.id || editingCell?.field !== 'sellingPrice') {
                            startEditing(p, 'sellingPrice');
                          }
                        }}
                        className={`py-2.5 px-3 text-right font-black hover:bg-slate-700/40 cursor-pointer bg-slate-950/30 group/cell ${
                          margin < 0 ? 'text-rose-400' : margin < 5 ? 'text-amber-400' : 'text-emerald-400'
                        }`}
                        title="Click to edit retail selling price"
                      >
                        {editingCell?.id === p.id && editingCell.field === 'sellingPrice' ? (
                          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                            <input
                              ref={cellInputRef}
                              type="number"
                              step="0.001"
                              value={cellDraftValue}
                              onChange={(e) => setCellDraftValue(e.target.value)}
                              onKeyDown={handleKeyDown}
                              className="w-20 text-right bg-slate-800 border-2 border-emerald-500 text-white rounded px-1.5 py-1 text-xs focus:outline-none"
                              autoFocus
                            />
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                commitCellEdit();
                              }}
                              className="p-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded cursor-pointer"
                              title="Save Price"
                            >
                              <Check size={12} />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingCell(null);
                              }}
                              className="p-1 bg-slate-700 text-slate-300 rounded cursor-pointer"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-1.5">
                            <span>{p.sellingPrice.toFixed(3)}</span>
                            <Edit2 size={11} className="text-slate-500 opacity-0 group-hover/cell:opacity-100 transition-opacity" />
                          </div>
                        )}
                      </td>

                      {/* Margin % & Visual Risk Management */}
                      <td className="py-2.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                              margin < 0
                                ? 'bg-rose-600 text-white font-black animate-pulse'
                                : margin < 5
                                ? 'bg-amber-500 text-slate-950 font-bold'
                                : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            }`}
                          >
                            {margin.toFixed(1)}%
                          </span>
                          {margin < 0 && (
                            <span className="text-[10px] text-rose-400 font-sans font-bold flex items-center gap-0.5">
                              <AlertTriangle size={11} /> LOSS
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Profit BD */}
                      <td
                        className={`py-2.5 px-3 text-right font-semibold ${
                          p.sellingPrice - cost < 0 ? 'text-rose-400' : 'text-slate-300'
                        }`}
                      >
                        {(p.sellingPrice - cost).toFixed(3)}
                      </td>

                      {/* Stock Quantity (Inline Editable) */}
                      <td
                        onClick={() => {
                          if (editingCell?.id !== p.id || editingCell?.field !== 'stockQuantity') {
                            startEditing(p, 'stockQuantity');
                          }
                        }}
                        className={`py-2.5 px-3 text-right hover:bg-slate-700/40 cursor-pointer group/cell ${
                          p.stockQuantity <= p.minThreshold ? 'text-rose-400 font-bold' : 'text-slate-200'
                        }`}
                        title="Click to edit current stock"
                      >
                        {editingCell?.id === p.id && editingCell.field === 'stockQuantity' ? (
                          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                            <input
                              ref={cellInputRef}
                              type="number"
                              value={cellDraftValue}
                              onChange={(e) => setCellDraftValue(e.target.value)}
                              onKeyDown={handleKeyDown}
                              className="w-16 text-right bg-slate-800 border-2 border-emerald-500 text-white rounded px-1.5 py-1 text-xs focus:outline-none"
                              autoFocus
                            />
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                commitCellEdit();
                              }}
                              className="p-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded cursor-pointer"
                            >
                              <Check size={12} />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingCell(null);
                              }}
                              className="p-1 bg-slate-700 text-slate-300 rounded cursor-pointer"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-1">
                            <span>{p.stockQuantity}</span>
                            <Edit2 size={11} className="text-slate-500 opacity-0 group-hover/cell:opacity-100 transition-opacity" />
                          </div>
                        )}
                      </td>

                      {/* Min Threshold (Inline Editable) */}
                      <td
                        onClick={() => {
                          if (editingCell?.id !== p.id || editingCell?.field !== 'minThreshold') {
                            startEditing(p, 'minThreshold');
                          }
                        }}
                        className="py-2.5 px-3 text-right text-slate-400 hover:bg-slate-700/40 cursor-pointer group/cell"
                        title="Click to edit min threshold"
                      >
                        {editingCell?.id === p.id && editingCell.field === 'minThreshold' ? (
                          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                            <input
                              ref={cellInputRef}
                              type="number"
                              value={cellDraftValue}
                              onChange={(e) => setCellDraftValue(e.target.value)}
                              onKeyDown={handleKeyDown}
                              className="w-16 text-right bg-slate-800 border-2 border-emerald-500 text-white rounded px-1.5 py-1 text-xs focus:outline-none"
                              autoFocus
                            />
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                commitCellEdit();
                              }}
                              className="p-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded cursor-pointer"
                            >
                              <Check size={12} />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingCell(null);
                              }}
                              className="p-1 bg-slate-700 text-slate-300 rounded cursor-pointer"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-1">
                            <span>{p.minThreshold}</span>
                            <Edit2 size={11} className="text-slate-500 opacity-0 group-hover/cell:opacity-100 transition-opacity" />
                          </div>
                        )}
                      </td>

                      {/* Distributor */}
                      <td className="py-2.5 px-4 font-sans text-slate-400 truncate max-w-[140px]">
                        {p.supplierName || 'Direct / General'}
                      </td>

                      {/* Actions: Full Edit Drawer + Price History + 3-dots Menu */}
                      <td className="py-2.5 px-3 text-center relative">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => openEditModal(p)}
                            className="p-1.5 hover:bg-amber-500/20 text-slate-400 hover:text-amber-400 rounded transition cursor-pointer"
                            title="Edit full product settings (Drawer)"
                          >
                            <Edit2 size={15} />
                          </button>
                          <button
                            onClick={() => openPriceHistory(p)}
                            className="p-1.5 hover:bg-emerald-500/20 text-slate-400 hover:text-emerald-400 rounded transition cursor-pointer"
                            title="View price history audit trail"
                          >
                            <History size={15} />
                          </button>

                          {/* 3 Dots Menu Button */}
                          <div className="relative pim-action-menu-container">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveMenuId(activeMenuId === p.id ? null : p.id);
                              }}
                              className={`p-1.5 rounded transition cursor-pointer ${
                                activeMenuId === p.id
                                  ? 'bg-indigo-600 text-white'
                                  : 'hover:bg-slate-700/60 text-slate-400 hover:text-slate-200'
                              }`}
                              title="Product actions & delete"
                            >
                              <MoreVertical size={15} />
                            </button>

                            {/* Dropdown Menu */}
                            {activeMenuId === p.id && (
                              <div
                                onClick={(e) => e.stopPropagation()}
                                className={`absolute right-0 ${
                                  idx > filteredProducts.length - 4 ? 'bottom-full mb-1' : 'top-full mt-1'
                                } w-48 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 py-1.5 text-left font-sans animate-in fade-in zoom-in-95`}
                              >
                                <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800">
                                  Actions
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveMenuId(null);
                                    openEditModal(p);
                                  }}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 hover:text-white transition cursor-pointer"
                                >
                                  <Edit2 size={14} className="text-amber-400" />
                                  <span>Edit Product</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveMenuId(null);
                                    openPriceHistory(p);
                                  }}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 hover:text-white transition cursor-pointer"
                                >
                                  <History size={14} className="text-emerald-400" />
                                  <span>Price History</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveMenuId(null);
                                    setSelectedIds(new Set([p.id]));
                                    setShowPrintModal(true);
                                  }}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 hover:text-white transition cursor-pointer"
                                >
                                  <Printer size={14} className="text-indigo-400" />
                                  <span>Print Shelf Tag</span>
                                </button>
                                <div className="border-t border-slate-800 my-1" />
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveMenuId(null);
                                    setProductToDelete(p);
                                  }}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-rose-400 hover:bg-rose-500/20 hover:text-rose-300 transition cursor-pointer"
                                >
                                  <Trash2 size={14} className="text-rose-400" />
                                  <span>Delete Product</span>
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {filteredProducts.length === 0 && !loading && (
                  <tr>
                    <td colSpan={11} className="py-12 text-center text-slate-500 font-sans">
                      <Package size={32} className="mx-auto mb-2 text-slate-600" />
                      <p className="text-sm font-semibold">No products match your current search or risk filters.</p>
                      <button
                        onClick={() => {
                          setSearchTerm('');
                          setFilterType('all');
                          setSelectedDistributor('all');
                        }}
                        className="mt-3 px-3 py-1.5 bg-slate-800 text-slate-300 text-xs rounded-lg hover:bg-slate-700 cursor-pointer"
                      >
                        Clear Filters
                      </button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* --- DEDICATED EDIT PRODUCT DRAWER / MODAL --- */}
      {editModalProduct && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative">
            <button
              onClick={() => setEditModalProduct(null)}
              className="absolute right-4 top-4 text-slate-400 hover:text-white cursor-pointer"
            >
              <X size={20} />
            </button>

            <div className="flex items-center gap-2 mb-4 border-b border-slate-800 pb-3">
              <span className="p-2 bg-amber-500/20 text-amber-400 rounded-lg">
                <Edit2 size={20} />
              </span>
              <div>
                <h2 className="text-lg font-bold text-white">Edit Product (SKU Details)</h2>
                <p className="text-xs text-slate-400 font-mono">ID: {editModalProduct.id}</p>
              </div>
            </div>

            <form onSubmit={handleSaveEditModal} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-300 mb-1">Product Name *</label>
                <input
                  type="text"
                  required
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-300 mb-1">Barcode (EAN-13 / Code128)</label>
                  <input
                    type="text"
                    value={editForm.barcode}
                    onChange={(e) => setEditForm({ ...editForm, barcode: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-300 mb-1">Distributor / Supplier</label>
                  <select
                    value={editForm.distributorId}
                    onChange={(e) => setEditForm({ ...editForm, distributorId: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="">Direct / None</option>
                    {distributors.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-300 mb-1">Wholesale Cost (BHD) *</label>
                  <input
                    type="number"
                    step="0.001"
                    required
                    value={editForm.purchasePrice}
                    onChange={(e) => setEditForm({ ...editForm, purchasePrice: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-300 mb-1">Retail Sale Price (BHD) *</label>
                  <input
                    type="number"
                    step="0.001"
                    required
                    value={editForm.sellingPrice}
                    onChange={(e) => setEditForm({ ...editForm, sellingPrice: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono font-bold text-emerald-400"
                  />
                </div>
              </div>

              {/* Live Profit Margin Simulator inside modal */}
              {(() => {
                const c = parseFloat(editForm.purchasePrice) || 0;
                const s = parseFloat(editForm.sellingPrice) || 0;
                const m = s > 0 ? ((s - c) / s) * 100 : 0;
                const p = s - c;
                return (
                  <div
                    className={`p-2.5 rounded-xl border text-xs flex items-center justify-between font-mono ${
                      m < 0
                        ? 'bg-rose-950/40 border-rose-800 text-rose-300'
                        : m < 5
                        ? 'bg-amber-950/40 border-amber-800 text-amber-300'
                        : 'bg-emerald-950/40 border-emerald-800 text-emerald-300'
                    }`}
                  >
                    <span>
                      Live Margin: <strong>{m.toFixed(1)}%</strong> ({m < 0 ? 'LOSS' : m < 5 ? 'LOW' : 'HEALTHY'})
                    </span>
                    <span>
                      Profit: <strong>{p.toFixed(3)} BHD</strong> / unit
                    </span>
                  </div>
                );
              })()}

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-300 mb-1">Current Stock</label>
                  <input
                    type="number"
                    value={editForm.stockQuantity}
                    onChange={(e) => setEditForm({ ...editForm, stockQuantity: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-300 mb-1">Min Threshold</label>
                  <input
                    type="number"
                    value={editForm.minThreshold}
                    onChange={(e) => setEditForm({ ...editForm, minThreshold: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-300 mb-1">Max Par Level</label>
                  <input
                    type="number"
                    value={editForm.maxThreshold}
                    onChange={(e) => setEditForm({ ...editForm, maxThreshold: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 mt-6 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    const prod = editModalProduct;
                    setEditModalProduct(null);
                    setProductToDelete(prod);
                  }}
                  className="px-3.5 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                  title="Delete this product from catalog"
                >
                  <Trash2 size={14} />
                  <span>Delete SKU</span>
                </button>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setEditModalProduct(null)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingEditModal}
                    className="flex items-center gap-1.5 px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black rounded-lg transition cursor-pointer disabled:opacity-50"
                  >
                    <Save size={15} />
                    <span>{isSavingEditModal ? 'Saving...' : 'Save Product Changes'}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- BULK ACTIONS & PRICE HIKE RULES MODAL --- */}
      {showBulkModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-6 shadow-2xl relative">
            <button
              onClick={() => setShowBulkModal(false)}
              className="absolute right-4 top-4 text-slate-400 hover:text-white cursor-pointer"
            >
              <X size={20} />
            </button>

            <div className="flex items-center gap-2 mb-4">
              <span className="p-2 bg-indigo-500/20 text-indigo-400 rounded-lg">
                <Sliders size={20} />
              </span>
              <div>
                <h2 className="text-lg font-bold text-white">Bulk Price Hike & Inventory Rules</h2>
                <p className="text-xs text-slate-400">
                  Executing across{' '}
                  <strong className="text-indigo-400">
                    {selectedIds.size > 0 ? `${selectedIds.size} selected SKUs` : `all ${filteredProducts.length} filtered SKUs`}
                  </strong>
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Select Action Rule</label>
                <select
                  value={bulkAction}
                  onChange={(e) => setBulkAction(e.target.value as any)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="PERCENT_INCREASE">Increase Sale Price by Percentage (%)</option>
                  <option value="PERCENT_DECREASE">Decrease Sale Price by Percentage (%)</option>
                  <option value="FIXED_MARKUP">Fixed BHD Markup on Cost (+BHD)</option>
                  <option value="SET_VAT_RATE">Set Standard VAT Rate (%)</option>
                  <option value="ASSIGN_DISTRIBUTOR">Assign Distributor / Vendor</option>
                </select>
              </div>

              {bulkAction !== 'ASSIGN_DISTRIBUTOR' ? (
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    {bulkAction.includes('PERCENT') ? 'Percentage Value (%)' : bulkAction === 'SET_VAT_RATE' ? 'VAT Rate (%)' : 'Amount in BHD'}
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step={bulkAction === 'FIXED_MARKUP' ? '0.025' : '1'}
                      value={bulkValue}
                      onChange={(e) => setBulkValue(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                      {bulkAction.includes('PERCENT') || bulkAction === 'SET_VAT_RATE' ? '%' : 'BHD'}
                    </span>
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Select Distributor</label>
                  <select
                    value={bulkDistributorId}
                    onChange={(e) => setBulkDistributorId(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">Select a distributor...</option>
                    {distributors.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Retail Rounding Rules (Fils) */}
              {bulkAction.includes('PERCENT') && (
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    Smart Retail Rounding Rule
                  </label>
                  <select
                    value={bulkRoundToFils}
                    onChange={(e) => setBulkRoundToFils(parseInt(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value={0}>Exact Price (No fils rounding)</option>
                    <option value={25}>Round up to nearest 25 fils (0.025 BHD)</option>
                    <option value={50}>Round up to nearest 50 fils (0.050 BHD)</option>
                    <option value={100}>Round up to nearest 100 fils (0.100 BHD)</option>
                  </select>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Prevents irregular change at the cash counter (e.g., 1.437 BD becomes 1.450 BD).
                  </p>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Audit Change Reason</label>
                <input
                  type="text"
                  value={bulkReason}
                  onChange={(e) => setBulkReason(e.target.value)}
                  placeholder="e.g. Distributor 5% Blanket Hike, Annual Revision"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Live Preview Box */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 text-xs">
                <div className="font-bold text-indigo-400 uppercase text-[10px] tracking-wider mb-1 flex items-center gap-1">
                  <Sparkles size={13} /> Rule Execution Simulation
                </div>
                <p className="text-slate-300">
                  Example SKU with <strong>1.000 BHD</strong> price will become{' '}
                  <strong className="text-emerald-400">
                    {bulkAction === 'PERCENT_INCREASE'
                      ? (
                          bulkRoundToFils > 0
                            ? (Math.ceil((1.0 * (1 + parseFloat(bulkValue || '0') / 100)) / (bulkRoundToFils / 1000)) * (bulkRoundToFils / 1000)).toFixed(3)
                            : (1.0 * (1 + parseFloat(bulkValue || '0') / 100)).toFixed(3)
                        )
                      : bulkAction === 'PERCENT_DECREASE'
                      ? (1.0 * (1 - parseFloat(bulkValue || '0') / 100)).toFixed(3)
                      : (1.0 + parseFloat(bulkValue || '0')).toFixed(3)}{' '}
                    BHD
                  </strong>
                  . Every update is atomically saved with an immutable audit entry in ProductPriceHistory.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-slate-800">
              <button
                onClick={() => setShowBulkModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleApplyBulkRules}
                disabled={isSubmittingBulk || (selectedIds.size === 0 && filteredProducts.length === 0)}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-black rounded-lg transition cursor-pointer"
              >
                {isSubmittingBulk ? 'Applying Rules...' : 'Execute Bulk Update'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- SHELF TAG PRINT MODAL & PREVIEW --- */}
      {showPrintModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl relative">
            <button
              onClick={() => setShowPrintModal(false)}
              className="absolute right-4 top-4 text-slate-400 hover:text-white cursor-pointer"
            >
              <X size={20} />
            </button>

            <div className="flex items-center gap-2 mb-4">
              <span className="p-2 bg-emerald-500/20 text-emerald-400 rounded-lg">
                <Printer size={20} />
              </span>
              <div>
                <h2 className="text-lg font-bold text-white">Shelf-Edge Label & Barcode Generator</h2>
                <p className="text-xs text-slate-400">
                  Pre-formatted for standard A4 sticker sheets (3 columns x 7 rows = 21 tags per sheet)
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Store / Header Banner</label>
                  <input
                    type="text"
                    value={printStoreName}
                    onChange={(e) => setPrintStoreName(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Copies per SKU</label>
                  <input
                    type="number"
                    min="1"
                    max="21"
                    value={printTagsPerProduct}
                    onChange={(e) => setPrintTagsPerProduct(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Print Target</label>
                <div className="flex items-center gap-4 text-xs text-slate-200">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      checked={printOnlySelected}
                      onChange={() => setPrintOnlySelected(true)}
                      className="text-emerald-500 cursor-pointer"
                    />
                    <span>
                      Selected SKUs only ({selectedIds.size > 0 ? selectedIds.size : 'None selected'})
                    </span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      checked={!printOnlySelected}
                      onChange={() => setPrintOnlySelected(false)}
                      className="text-emerald-500 cursor-pointer"
                    />
                    <span>All currently filtered ({filteredProducts.length} SKUs)</span>
                  </label>
                </div>
              </div>

              {/* Tag Preview Box */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Single Sticker Preview</label>
                <div className="border border-slate-700 p-3 rounded-xl bg-white text-slate-900 max-w-sm">
                  <div className="flex justify-between items-start border-b border-slate-200 pb-1">
                    <span className="text-[10px] font-black tracking-widest text-emerald-800 uppercase">
                      {printStoreName}
                    </span>
                    <span className="text-[8px] bg-emerald-100 text-emerald-900 font-bold px-1.5 py-0.5 rounded">
                      INCL 10% VAT
                    </span>
                  </div>
                  <div className="my-1.5">
                    <h4 className="font-bold text-xs uppercase leading-tight">
                      {shelfTagsList[0]?.name || 'Almarai Fresh Milk 1L'}
                    </h4>
                  </div>
                  <div className="flex items-center justify-between border-t border-slate-100 pt-1">
                    <Barcode
                      value={shelfTagsList[0]?.barcode || '123456789012'}
                      width={1.1}
                      height={24}
                      fontSize={9}
                      margin={0}
                    />
                    <div className="text-right">
                      <div className="text-[8px] font-bold text-slate-500 uppercase">PRICE (BHD)</div>
                      <div className="text-lg font-black text-emerald-700 leading-none">
                        {(shelfTagsList[0]?.sellingPrice ?? 1.5).toFixed(3)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-3 bg-emerald-950/30 border border-emerald-800/40 rounded-xl text-xs text-emerald-300 flex items-center gap-2">
                <Info size={16} />
                <span>
                  Total tags ready: <strong>{shelfTagsList.length}</strong> (approx{' '}
                  {Math.ceil(shelfTagsList.length / 21)} A4 sheets). Clicking Print will open your browser's print dialog directly.
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-slate-800">
              <button
                onClick={() => setShowPrintModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg cursor-pointer"
              >
                Close
              </button>
              <button
                onClick={() => window.print()}
                disabled={shelfTagsList.length === 0}
                className="flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black rounded-lg transition cursor-pointer"
              >
                <Printer size={16} />
                <span>Print {shelfTagsList.length} Stickers Now</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- PRICE HISTORY AUDIT TRAIL MODAL --- */}
      {historyModalProduct && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-6 shadow-2xl relative max-h-[85vh] flex flex-col">
            <button
              onClick={() => setHistoryModalProduct(null)}
              className="absolute right-4 top-4 text-slate-400 hover:text-white cursor-pointer"
            >
              <X size={20} />
            </button>

            <div className="flex items-center gap-2 mb-4">
              <span className="p-2 bg-emerald-500/20 text-emerald-400 rounded-lg">
                <History size={20} />
              </span>
              <div>
                <h2 className="text-lg font-bold text-white">Price History & Audit Trail</h2>
                <p className="text-xs text-slate-400 font-mono">
                  SKU: {historyModalProduct.id} &bull; {historyModalProduct.name}
                </p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto pr-1">
              {loadingHistory ? (
                <div className="py-12 text-center text-slate-400">
                  <RefreshCw size={24} className="mx-auto mb-2 animate-spin text-emerald-500" />
                  <p className="text-xs">Fetching immutable audit logs from database...</p>
                </div>
              ) : priceHistory.length > 0 ? (
                <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-800 font-sans">
                  {priceHistory.map((item) => {
                    const priceDiff = item.newPrice - item.oldPrice;
                    const isIncrease = priceDiff > 0;
                    return (
                      <div key={item.id} className="relative text-xs">
                        {/* Dot indicator */}
                        <div
                          className={`absolute -left-[27px] top-1 w-3.5 h-3.5 rounded-full border-2 border-slate-900 ${
                            isIncrease ? 'bg-emerald-500' : priceDiff < 0 ? 'bg-rose-500' : 'bg-slate-500'
                          }`}
                        />

                        <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[11px] font-bold text-slate-300">
                              {new Date(item.createdAt).toLocaleString('en-BH', {
                                dateStyle: 'medium',
                                timeStyle: 'short'
                              })}
                            </span>
                            <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded font-mono">
                              By: {item.changedBy || 'Manager'}
                            </span>
                          </div>

                          {/* Price Transition */}
                          <div className="flex items-center gap-2 font-mono text-sm my-1">
                            <span className="text-slate-400">{item.oldPrice.toFixed(3)} BD</span>
                            <span className="text-slate-600">&rarr;</span>
                            <span className="font-bold text-emerald-400">{item.newPrice.toFixed(3)} BD</span>

                            {priceDiff !== 0 && (
                              <span
                                className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                                  isIncrease ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                                }`}
                              >
                                {isIncrease ? `+${priceDiff.toFixed(3)}` : priceDiff.toFixed(3)} BD
                              </span>
                            )}
                          </div>

                          {/* Cost Comparison */}
                          {item.oldCost !== item.newCost && (
                            <div className="text-[11px] text-slate-400 mt-1 font-mono">
                              Cost: {item.oldCost.toFixed(3)} &rarr; {item.newCost.toFixed(3)} BD
                            </div>
                          )}

                          {item.changeReason && (
                            <p className="text-[11px] text-slate-400 mt-1.5 bg-slate-900/60 p-1.5 rounded">
                              <em>Reason:</em> {item.changeReason}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-12 text-center text-slate-500">
                  <p className="text-sm">No historical price changes recorded for this item yet.</p>
                  <p className="text-xs text-slate-600 mt-1">
                    Edits made in the inline grid will automatically create audit records.
                  </p>
                </div>
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setHistoryModalProduct(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- ADD PRODUCT MODAL --- */}
      {showAddProductModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative">
            <button
              onClick={() => setShowAddProductModal(false)}
              className="absolute right-4 top-4 text-slate-400 hover:text-white cursor-pointer"
            >
              <X size={20} />
            </button>

            <div className="flex items-center gap-2 mb-4">
              <span className="p-2 bg-emerald-500/20 text-emerald-400 rounded-lg">
                <Plus size={20} />
              </span>
              <h2 className="text-lg font-bold text-white">Add New Catalog Product (SKU)</h2>
            </div>

            <form onSubmit={handleCreateProduct} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-300 mb-1">Product Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Almarai UHT Milk Full Fat 1L"
                  value={newProduct.name}
                  onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-300 mb-1">Barcode (EAN-13 / Code128)</label>
                  <input
                    type="text"
                    placeholder="Scan or type barcode"
                    value={newProduct.barcode}
                    onChange={(e) => setNewProduct({ ...newProduct, barcode: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-300 mb-1">Distributor / Supplier</label>
                  <select
                    value={newProduct.distributorId}
                    onChange={(e) => setNewProduct({ ...newProduct, distributorId: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">Direct / None</option>
                    {distributors.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-300 mb-1">Cost Price (BHD) *</label>
                  <input
                    type="number"
                    step="0.001"
                    required
                    value={newProduct.purchasePrice}
                    onChange={(e) => setNewProduct({ ...newProduct, purchasePrice: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-300 mb-1">Sale Price (BHD) *</label>
                  <input
                    type="number"
                    step="0.001"
                    required
                    value={newProduct.sellingPrice}
                    onChange={(e) => setNewProduct({ ...newProduct, sellingPrice: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono font-bold text-emerald-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-300 mb-1">Initial Stock</label>
                  <input
                    type="number"
                    value={newProduct.stockQuantity}
                    onChange={(e) => setNewProduct({ ...newProduct, stockQuantity: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-300 mb-1">Min Threshold</label>
                  <input
                    type="number"
                    value={newProduct.minThreshold}
                    onChange={(e) => setNewProduct({ ...newProduct, minThreshold: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-300 mb-1">Max Threshold</label>
                  <input
                    type="number"
                    value={newProduct.maxThreshold}
                    onChange={(e) => setNewProduct({ ...newProduct, maxThreshold: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddProductModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black rounded-lg transition cursor-pointer"
                >
                  Create SKU
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- DELETE SINGLE PRODUCT CONFIRMATION MODAL --- */}
      {productToDelete && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-slate-900 border border-rose-500/30 rounded-2xl max-w-md w-full p-6 shadow-2xl relative text-left">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-rose-500/20 text-rose-400 rounded-xl">
                <Trash2 size={24} />
              </div>
              <div>
                <h3 className="text-lg font-black text-white">Delete Product</h3>
                <p className="text-xs text-slate-400">Remove product SKU permanently from the catalog.</p>
              </div>
            </div>

            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 mb-4 space-y-2">
              <div className="text-sm font-bold text-slate-100">{productToDelete.name}</div>
              <div className="flex items-center gap-4 text-xs font-mono text-slate-400">
                <span>Barcode: <strong className="text-slate-200">{productToDelete.barcode || 'N/A'}</strong></span>
                <span>Price: <strong className="text-emerald-400">BD {productToDelete.sellingPrice.toFixed(3)}</strong></span>
                <span>Stock: <strong className="text-slate-200">{productToDelete.stockQuantity}</strong></span>
              </div>
            </div>

            <p className="text-xs text-rose-300/80 mb-6 bg-rose-500/10 border border-rose-500/20 rounded-lg p-2.5">
              ⚠️ Warning: Deleting this product will remove it from PIM, quick-product grid, and future checkout scans. Completed sales receipts will retain their line item history.
            </p>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={isDeletingProduct}
                onClick={() => setProductToDelete(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-lg transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeletingProduct}
                onClick={handleDeleteProduct}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-lg shadow-lg shadow-rose-900/30 transition cursor-pointer flex items-center gap-2"
              >
                {isDeletingProduct ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 size={14} />
                    <span>Confirm Delete</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- BULK DELETE SELECTED MODAL --- */}
      {showBulkDeleteModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-slate-900 border border-rose-500/30 rounded-2xl max-w-md w-full p-6 shadow-2xl relative text-left">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-rose-500/20 text-rose-400 rounded-xl">
                <Trash2 size={24} />
              </div>
              <div>
                <h3 className="text-lg font-black text-white">Bulk Delete Products</h3>
                <p className="text-xs text-slate-400">Permanently delete multiple selected items.</p>
              </div>
            </div>

            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 mb-4">
              <div className="text-base font-black text-rose-400 mb-1">
                {selectedIds.size} {selectedIds.size === 1 ? 'Product' : 'Products'} Selected
              </div>
              <p className="text-xs text-slate-400">
                Are you sure you want to delete these {selectedIds.size} products from your catalog? This operation cannot be undone.
              </p>
            </div>

            <p className="text-xs text-rose-300/80 mb-6 bg-rose-500/10 border border-rose-500/20 rounded-lg p-2.5">
              ⚠️ Warning: All {selectedIds.size} selected items will be deleted from the catalog inventory and quick-sale grids.
            </p>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={isDeletingBulk}
                onClick={() => setShowBulkDeleteModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-lg transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeletingBulk}
                onClick={handleBulkDelete}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-lg shadow-lg shadow-rose-900/30 transition cursor-pointer flex items-center gap-2"
              >
                {isDeletingBulk ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    <span>Deleting {selectedIds.size}...</span>
                  </>
                ) : (
                  <>
                    <Trash2 size={14} />
                    <span>Delete {selectedIds.size} Items</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
