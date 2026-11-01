import React, { useState } from 'react';
import { X, Plus, Trash2, ArrowUp, ArrowDown, RotateCcw, Check, Sparkles } from 'lucide-react';

export interface QuickCategory {
  id: string;
  label: string;
  color?: string; // emerald, amber, sky, rose, purple, slate, teal, orange
}

export const DEFAULT_CATEGORIES: QuickCategory[] = [
  { id: 'ALL', label: 'All Items', color: 'slate' },
  { id: 'PRODUCE', label: 'Produce 🥦', color: 'emerald' },
  { id: 'BAKERY', label: 'Bakery 🥖', color: 'amber' },
  { id: 'DAIRY', label: 'Dairy 🥛', color: 'sky' },
  { id: 'MEAT', label: 'Meat / Deli 🥩', color: 'rose' },
  { id: 'ESSENTIALS', label: 'Essentials ⚡', color: 'slate' }
];

export const COLOR_OPTIONS = [
  { key: 'emerald', label: 'Green', bg: 'bg-emerald-500', text: 'text-emerald-700', badge: 'bg-emerald-100 text-emerald-800' },
  { key: 'amber', label: 'Orange/Amber', bg: 'bg-amber-500', text: 'text-amber-700', badge: 'bg-amber-100 text-amber-800' },
  { key: 'sky', label: 'Blue', bg: 'bg-sky-500', text: 'text-sky-700', badge: 'bg-sky-100 text-sky-800' },
  { key: 'rose', label: 'Red/Rose', bg: 'bg-rose-500', text: 'text-rose-700', badge: 'bg-rose-100 text-rose-800' },
  { key: 'purple', label: 'Purple', bg: 'bg-purple-500', text: 'text-purple-700', badge: 'bg-purple-100 text-purple-800' },
  { key: 'teal', label: 'Teal', bg: 'bg-teal-500', text: 'text-teal-700', badge: 'bg-teal-100 text-teal-800' },
  { key: 'slate', label: 'Slate', bg: 'bg-slate-600', text: 'text-slate-700', badge: 'bg-slate-200 text-slate-800' },
];

interface EditQuickTabsModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: QuickCategory[];
  onSaveCategories: (newCategories: QuickCategory[]) => Promise<void>;
  showToast: (message: string, type: 'success' | 'info' | 'error') => void;
}

export const EditQuickTabsModal: React.FC<EditQuickTabsModalProps> = ({
  isOpen,
  onClose,
  categories,
  onSaveCategories,
  showToast,
}) => {
  const [tabs, setTabs] = useState<QuickCategory[]>(() => {
    return categories.length > 0 ? categories : DEFAULT_CATEGORIES;
  });
  const [newTabLabel, setNewTabLabel] = useState('');
  const [newTabColor, setNewTabColor] = useState('emerald');
  const [isSaving, setIsSaving] = useState(false);

  // Sync state if modal reopens
  React.useEffect(() => {
    if (isOpen) {
      setTabs(categories.length > 0 ? categories : DEFAULT_CATEGORIES);
      setNewTabLabel('');
    }
  }, [isOpen, categories]);

  if (!isOpen) return null;

  const handleUpdateLabel = (id: string, newLabel: string) => {
    setTabs((prev) =>
      prev.map((t) => (t.id === id ? { ...t, label: newLabel } : t))
    );
  };

  const handleUpdateColor = (id: string, newColor: string) => {
    setTabs((prev) =>
      prev.map((t) => (t.id === id ? { ...t, color: newColor } : t))
    );
  };

  const handleAddTab = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanLabel = newTabLabel.trim();
    if (!cleanLabel) return;

    // Generate a unique category ID from the label
    const cleanId = cleanLabel
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 20) || `CAT_${Date.now()}`;

    // Prevent duplicate IDs
    const finalId = tabs.some((t) => t.id === cleanId)
      ? `${cleanId}_${Math.floor(Math.random() * 1000)}`
      : cleanId;

    const newTab: QuickCategory = {
      id: finalId,
      label: cleanLabel,
      color: newTabColor,
    };

    setTabs((prev) => [...prev, newTab]);
    setNewTabLabel('');
    showToast(`Added new tab: "${cleanLabel}"`, 'success');
  };

  const handleDeleteTab = (id: string) => {
    if (id === 'ALL') {
      showToast('Cannot delete "All Items" root tab.', 'info');
      return;
    }
    setTabs((prev) => prev.filter((t) => t.id !== id));
  };

  const handleMove = (index: number, direction: 'UP' | 'DOWN') => {
    if (index === 0) return; // Don't move "ALL"
    const targetIndex = direction === 'UP' ? index - 1 : index + 1;
    if (targetIndex < 1 || targetIndex >= tabs.length) return;

    const newTabs = [...tabs];
    const temp = newTabs[index];
    newTabs[index] = newTabs[targetIndex];
    newTabs[targetIndex] = temp;
    setTabs(newTabs);
  };

  const handleReset = () => {
    if (window.confirm('Reset all category tabs back to standard supermarket defaults?')) {
      setTabs(DEFAULT_CATEGORIES);
      showToast('Tabs reset to defaults', 'info');
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSaveCategories(tabs);
      showToast('Category tabs updated and saved!', 'success');
      onClose();
    } catch {
      showToast('Failed to save category tabs.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-slate-900 text-white p-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-400" />
            <div>
              <h3 className="font-extrabold text-base tracking-tight">Customize Quick Category Tabs</h3>
              <p className="text-xs text-slate-400">Rename, reorder, recolor or create custom department tabs</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tab List */}
        <div className="p-4 overflow-y-auto space-y-3 flex-1">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center justify-between">
            <span>Active Category Tabs ({tabs.length})</span>
            <span className="text-[11px] text-slate-400 normal-case font-normal">Tap name to edit inline</span>
          </div>

          <div className="space-y-2">
            {tabs.map((tab, idx) => {
              const isAll = tab.id === 'ALL';
              return (
                <div
                  key={tab.id}
                  className="flex items-center gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded-xl hover:border-slate-300 transition-all"
                >
                  {/* Position badge */}
                  <span className="text-xs font-mono text-slate-400 w-5 text-center shrink-0">
                    {idx + 1}
                  </span>

                  {/* Color Selector Dropdown */}
                  {!isAll ? (
                    <select
                      value={tab.color || 'slate'}
                      onChange={(e) => handleUpdateColor(tab.id, e.target.value)}
                      className="text-xs font-semibold px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 outline-none shrink-0"
                    >
                      {COLOR_OPTIONS.map((c) => (
                        <option key={c.key} value={c.key}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="w-16 text-center text-xs font-bold text-slate-400">Root</div>
                  )}

                  {/* Label Input */}
                  <div className="flex-1 relative">
                    <input
                      type="text"
                      disabled={isAll}
                      value={tab.label}
                      onChange={(e) => handleUpdateLabel(tab.id, e.target.value)}
                      className={`w-full px-3 py-1.5 text-xs font-bold rounded-lg border ${
                        isAll
                          ? 'bg-slate-100 text-slate-500 border-slate-200 cursor-not-allowed'
                          : 'bg-white text-slate-800 border-slate-300 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none'
                      }`}
                    />
                  </div>

                  {/* Up / Down Reorder */}
                  {!isAll && (
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleMove(idx, 'UP')}
                        disabled={idx <= 1}
                        className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200 disabled:opacity-30"
                        title="Move Up"
                      >
                        <ArrowUp size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMove(idx, 'DOWN')}
                        disabled={idx >= tabs.length - 1}
                        className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200 disabled:opacity-30"
                        title="Move Down"
                      >
                        <ArrowDown size={14} />
                      </button>
                    </div>
                  )}

                  {/* Delete button */}
                  {!isAll && (
                    <button
                      type="button"
                      onClick={() => handleDeleteTab(tab.id)}
                      className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-100 transition-colors shrink-0"
                      title="Remove category tab"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Add New Tab Form */}
          <form
            onSubmit={handleAddTab}
            className="mt-4 p-3 bg-amber-50/70 border border-amber-200 rounded-xl space-y-2"
          >
            <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900">
              <Plus size={14} className="text-amber-700" />
              <span>Create New Custom Category Tab</span>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="e.g. Snacks 🍿 or Cold Drinks 🥤"
                value={newTabLabel}
                onChange={(e) => setNewTabLabel(e.target.value)}
                className="flex-1 px-3 py-1.5 text-xs font-semibold bg-white border border-amber-300 rounded-lg outline-none focus:ring-2 focus:ring-amber-500"
              />

              <select
                value={newTabColor}
                onChange={(e) => setNewTabColor(e.target.value)}
                className="text-xs font-semibold px-2 py-1.5 rounded-lg border border-amber-300 bg-white text-slate-700 outline-none"
              >
                {COLOR_OPTIONS.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>

              <button
                type="submit"
                disabled={!newTabLabel.trim()}
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition disabled:opacity-50 shrink-0"
              >
                Add Tab
              </button>
            </div>
          </form>
        </div>

        {/* Footer Actions */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-1 px-3 py-2 text-slate-500 hover:text-slate-800 text-xs font-semibold rounded-lg hover:bg-slate-200 transition-colors"
          >
            <RotateCcw size={14} />
            <span>Reset Defaults</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-1.5 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-sm"
            >
              <Check size={15} />
              <span>{isSaving ? 'Saving...' : 'Save All Tabs'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EditQuickTabsModal;
