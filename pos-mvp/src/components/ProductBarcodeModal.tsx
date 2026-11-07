import React, { useState } from 'react';
import { Product } from '../types/pos';

export interface ProductBarcodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  catalog: Product[];
  onReloadCatalog: () => void;
  onOpenPosAddModal: () => void;
  onSaveProduct: (name: string, sellingPrice: number, costPrice: number, barcode: string) => void;
  onBindBarcode: (productId: string, barcode: string) => void;
  lastScannedBarcode: string | null;
  unassignedBarcode: string | null;
  bindingProductId: string | null;
  setBindingProductId: (id: string | null) => void;
}

export const ProductBarcodeModal: React.FC<ProductBarcodeModalProps> = ({
  isOpen,
  onClose,
  catalog,
  onReloadCatalog,
  onOpenPosAddModal,
  onSaveProduct,
  onBindBarcode,
  lastScannedBarcode,
  unassignedBarcode,
  bindingProductId,
  setBindingProductId,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newProdName, setNewProdName] = useState('');
  const [newProdPrice, setNewProdPrice] = useState('');
  const [newProdPurchasePrice, setNewProdPurchasePrice] = useState('');
  const [newProdBarcode, setNewProdBarcode] = useState('');

  if (!isOpen) return null;

  const handleSave = () => {
    if (!newProdName.trim() || !newProdPrice) return;
    const sellPrice = parseFloat(newProdPrice) || 0;
    const costPrice = parseFloat(newProdPurchasePrice) || 0;
    onSaveProduct(newProdName.trim(), sellPrice, costPrice, newProdBarcode.trim());
    setNewProdName('');
    setNewProdPrice('');
    setNewProdPurchasePrice('');
    setNewProdBarcode('');
    setShowAddForm(false);
  };

  const filteredCatalog = catalog.filter((p) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      (p.barcode && p.barcode.toLowerCase().includes(q)) ||
      p.id.toLowerCase().includes(q)
    );
  });

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15,23,42,0.65)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
      }}
    >
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          width: '720px',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)',
        }}
      >
        {/* Modal Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ fontSize: '20px', fontWeight: 'bold', margin: 0, color: '#111827' }}>
              📦 Products & Barcode Assignment
            </h3>
            <span style={{ fontSize: '13px', color: '#6b7280' }}>
              Manage item barcodes for rapid hardware scanner checkout
            </span>
          </div>
          <button
            onClick={() => {
              onClose();
              setBindingProductId(null);
              setShowAddForm(false);
            }}
            style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#6b7280' }}
          >
            ✕
          </button>
        </div>

        {/* Modal Content */}
        <div style={{ padding: '24px', flex: 1, overflowY: 'auto' }}>
          {/* Action Toolbar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <input
              type="text"
              placeholder="🔍 Search by product name or barcode..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ flex: 1, padding: '9px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }}
            />
            <button
              onClick={onOpenPosAddModal}
              style={{
                backgroundColor: '#059669',
                color: '#ffffff',
                padding: '9px 16px',
                borderRadius: '8px',
                border: 'none',
                fontWeight: 'bold',
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              ➕ Quick Add Item
            </button>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              style={{
                backgroundColor: showAddForm ? '#e5e7eb' : '#2563eb',
                color: showAddForm ? '#374151' : '#ffffff',
                padding: '9px 14px',
                borderRadius: '8px',
                border: 'none',
                fontWeight: 'bold',
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              {showAddForm ? 'Cancel Form' : 'New Product'}
            </button>
            <button
              onClick={onReloadCatalog}
              style={{
                backgroundColor: '#f3f4f6',
                color: '#374151',
                padding: '9px 14px',
                borderRadius: '8px',
                border: '1px solid #d1d5db',
                fontWeight: 'bold',
                fontSize: '13px',
                cursor: 'pointer',
              }}
              title="Reload catalog"
            >
              🔄
            </button>
          </div>

          {/* Add New Product Form */}
          {showAddForm && (
            <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '16px', marginBottom: '20px' }}>
              <div style={{ fontWeight: 'bold', color: '#166534', marginBottom: '12px', fontSize: '15px' }}>
                Register New Product
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                <input
                  type="text"
                  placeholder="Product Name (e.g. Al-Marai Milk 1L)"
                  value={newProdName}
                  onChange={(e) => setNewProdName(e.target.value)}
                  style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '13px' }}
                />
                <input
                  type="number"
                  step="0.001"
                  placeholder="Selling Price (BD)"
                  value={newProdPrice}
                  onChange={(e) => setNewProdPrice(e.target.value)}
                  style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '13px' }}
                />
                <input
                  type="number"
                  step="0.001"
                  placeholder="Cost Price (BD)"
                  value={newProdPurchasePrice}
                  onChange={(e) => setNewProdPurchasePrice(e.target.value)}
                  style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '13px' }}
                />
              </div>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <input
                  type="text"
                  placeholder="Barcode (or leave blank to assign later)"
                  value={newProdBarcode}
                  onChange={(e) => setNewProdBarcode(e.target.value)}
                  style={{ flex: 1, padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '13px' }}
                />
                {lastScannedBarcode && (
                  <button
                    onClick={() => setNewProdBarcode(lastScannedBarcode)}
                    style={{
                      backgroundColor: '#eff6ff',
                      color: '#1d4ed8',
                      border: '1px solid #bfdbfe',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                    }}
                  >
                    Use Last Scanned ({lastScannedBarcode})
                  </button>
                )}
                <button
                  onClick={handleSave}
                  style={{
                    backgroundColor: '#16a34a',
                    color: '#ffffff',
                    border: 'none',
                    padding: '8px 18px',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                  }}
                >
                  Save Product
                </button>
              </div>
            </div>
          )}

          {/* Barcode Binding In-Progress Banner */}
          {bindingProductId && (() => {
            const target = catalog.find((p) => p.id === bindingProductId);
            return (
              <div
                style={{
                  padding: '12px 16px',
                  backgroundColor: '#fef3c7',
                  border: '1px solid #fde68a',
                  borderRadius: '8px',
                  marginBottom: '16px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <strong style={{ color: '#92400e' }}>⏳ Ready to Assign:</strong>{' '}
                  <span style={{ color: '#78350f' }}>
                    Pull the SUNMI barcode scanner trigger on any item to link to <strong>{target?.name}</strong>!
                  </span>
                </div>
                <button
                  onClick={() => setBindingProductId(null)}
                  style={{
                    backgroundColor: '#ffffff',
                    border: '1px solid #d97706',
                    color: '#92400e',
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </div>
            );
          })()}

          {/* Product Catalog & Barcode Assignment Table */}
          <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
            {filteredCatalog.map((p) => {
              const isBinding = bindingProductId === p.id;
              return (
                <div
                  key={p.id}
                  style={{
                    padding: '12px 16px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    borderBottom: '1px solid #f3f4f6',
                    backgroundColor: isBinding ? '#fefce8' : '#ffffff',
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontWeight: '600', fontSize: '15px', color: '#111827' }}>{p.name}</span>
                      <span style={{ fontSize: '13px', color: '#2563eb', fontWeight: 'bold' }}>
                        BD {(p.price ?? (p as any).sellingPrice ?? 0).toFixed(3)}
                      </span>
                    </div>
                    <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '3px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>Barcode:</span>
                      {p.barcode ? (
                        <strong style={{ fontFamily: 'monospace', color: '#166534', backgroundColor: '#dcfce7', padding: '1px 6px', borderRadius: '4px' }}>
                          {p.barcode}
                        </strong>
                      ) : (
                        <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>(None assigned)</span>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {(unassignedBarcode || (lastScannedBarcode && lastScannedBarcode !== p.barcode)) && (
                      <button
                        onClick={() => onBindBarcode(p.id, unassignedBarcode || lastScannedBarcode!)}
                        style={{
                          backgroundColor: '#f0fdf4',
                          color: '#166534',
                          border: '1px solid #bbf7d0',
                          padding: '6px 10px',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: 'bold',
                          cursor: 'pointer',
                        }}
                        title={`Assign ${unassignedBarcode || lastScannedBarcode}`}
                      >
                        Bind [{unassignedBarcode || lastScannedBarcode}]
                      </button>
                    )}

                    {p.barcode && (
                      <button
                        onClick={() => onBindBarcode(p.id, '')}
                        style={{
                          backgroundColor: '#fee2e2',
                          color: '#991b1b',
                          border: '1px solid #fecaca',
                          padding: '6px 8px',
                          borderRadius: '6px',
                          fontSize: '12px',
                          cursor: 'pointer',
                        }}
                        title="Remove Barcode"
                      >
                        Clear
                      </button>
                    )}

                    <button
                      onClick={() => {
                        if (isBinding) {
                          setBindingProductId(null);
                        } else {
                          setBindingProductId(p.id);
                        }
                      }}
                      style={{
                        backgroundColor: isBinding ? '#d97706' : '#1f2937',
                        color: '#ffffff',
                        padding: '6px 12px',
                        borderRadius: '6px',
                        border: 'none',
                        fontSize: '12px',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                      }}
                    >
                      {isBinding ? '⏳ Waiting for Scan...' : '📷 Assign Barcode'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductBarcodeModal;

