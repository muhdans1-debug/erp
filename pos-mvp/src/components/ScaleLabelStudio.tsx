import { useState } from 'react';
import { Printer, Scale } from 'lucide-react';

const COMMON_WEIGHED_ITEMS = [
  { plu: '00107', name: 'Loose Red Tomatoes 1kg', pricePerKg: 0.350 },
  { plu: '00110', name: 'Red Onions 1kg', pricePerKg: 0.250 },
  { plu: '00105', name: 'Fresh Cavendish Bananas', pricePerKg: 0.450 },
  { plu: '00112', name: 'Local Cucumber 1kg', pricePerKg: 0.300 },
  { plu: '00201', name: 'Fresh Pakistani Beef Bone-in 1kg', pricePerKg: 2.800 },
  { plu: '00205', name: 'Chilled Mutton Fresh Cuts 1kg', pricePerKg: 3.500 },
];

function calculateEan13CheckDigit(twelveDigits: string) {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(twelveDigits[i], 10);
    sum += (i % 2 === 0) ? digit : digit * 3;
  }
  const mod = sum % 10;
  return mod === 0 ? 0 : 10 - mod;
}

export default function ScaleLabelStudio() {
  const [selectedItem, setSelectedItem] = useState(COMMON_WEIGHED_ITEMS[0]);
  const [weightKg, setWeightKg] = useState('1.250');
  const [prefix] = useState('20');
  const [customStoreName, setCustomStoreName] = useState('Askar Supermarket');
  const [labelFormat, setLabelFormat] = useState<'scale' | 'shelftalker'>('scale');

  const weightFloat = parseFloat(weightKg) || 0;
  const weightGrams = Math.round(weightFloat * 1000);
  const weightPadded = String(weightGrams).padStart(5, '0').slice(-5);
  const pluPadded = String(selectedItem.plu).padStart(5, '0').slice(-5);

  const twelveDigits = `${prefix}${pluPadded}${weightPadded}`;
  const checkDigit = calculateEan13CheckDigit(twelveDigits);
  const finalEan13 = `${twelveDigits}${checkDigit}`;
  const calculatedPrice = (weightFloat * selectedItem.pricePerKg).toFixed(3);

  return (
    <div className="space-y-8 font-sans p-6 max-w-7xl mx-auto">
      <div className="print:hidden flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Scale className="w-6 h-6 text-indigo-600" />
            Scale &amp; Shelf Label Studio
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Produce EAN-13 weight-embedded scale barcodes (20XXXXX / 21XXXXX) and retail shelf price talkers
          </p>
        </div>

        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs transition shadow-md active:scale-95 cursor-pointer"
        >
          <Printer className="w-4 h-4" />
          <span>Print Sticky Labels</span>
        </button>
      </div>

      <div className="print:hidden grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6 space-y-6">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
              Select Fresh Produce / Meat Item
            </label>
            <div className="space-y-2">
              {COMMON_WEIGHED_ITEMS.map((item) => (
                <div
                  key={item.plu}
                  onClick={() => setSelectedItem(item)}
                  className={`p-3 rounded-xl border text-xs font-semibold transition cursor-pointer flex items-center justify-between ${
                    selectedItem.plu === item.plu
                      ? 'bg-indigo-50 border-indigo-500 text-indigo-900 ring-1 ring-indigo-500'
                      : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                  }`}
                >
                  <div>
                    <p className="font-bold">{item.name}</p>
                    <p className="text-[11px] text-slate-500 font-mono">PLU: {item.plu}</p>
                  </div>
                  <span className="font-mono font-bold text-slate-900">
                    BD {item.pricePerKg.toFixed(3)}/kg
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
              Scale Weight (kg)
            </label>
            <div className="relative">
              <input
                type="number"
                step="0.005"
                min="0.050"
                value={weightKg}
                onChange={(e) => setWeightKg(e.target.value)}
                className="w-full text-lg font-mono font-bold py-2.5 px-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <span className="absolute right-3 top-3 text-xs font-bold text-slate-400">KG</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
              Label Type
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setLabelFormat('scale')}
                className={`py-2 px-3 rounded-xl text-xs font-bold border transition ${
                  labelFormat === 'scale'
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                }`}
              >
                Scale Barcode
              </button>
              <button
                type="button"
                onClick={() => setLabelFormat('shelftalker')}
                className={`py-2 px-3 rounded-xl text-xs font-bold border transition ${
                  labelFormat === 'shelftalker'
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                }`}
              >
                Shelf Talker
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
              Store Header Brand
            </label>
            <input
              type="text"
              value={customStoreName}
              onChange={(e) => setCustomStoreName(e.target.value)}
              className="w-full text-xs font-medium py-2.5 px-3 bg-slate-50 border border-slate-200 rounded-xl"
            />
          </div>
        </div>

        <div className="lg:col-span-2 bg-slate-900 rounded-3xl p-8 shadow-xl flex flex-col items-center justify-center text-center relative overflow-hidden">
          <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>

          <div className="text-xs font-mono text-indigo-400 font-bold uppercase tracking-wider mb-4">
            Live Label Preview (58mm Thermal / Sticky Label)
          </div>

          <div className="w-80 bg-white text-slate-900 p-5 rounded-2xl shadow-2xl border border-slate-100 flex flex-col items-center text-center">
            <p className="text-xs font-black tracking-tight uppercase text-slate-800">{customStoreName}</p>
            <p className="text-[10px] text-slate-500 mb-2">Branch 01 - Fresh Department</p>

            <div className="w-full border-t border-dashed border-slate-300 my-2"></div>

            <h4 className="text-sm font-black text-slate-900">{selectedItem.name}</h4>
            <div className="flex items-center justify-between w-full px-2 mt-1 text-xs text-slate-600 font-medium">
              <span>Unit: BD {selectedItem.pricePerKg.toFixed(3)}/kg</span>
              <span className="font-bold text-slate-900 font-mono">Net: {Number(weightKg).toFixed(3)} kg</span>
            </div>

            <div className="my-3 py-2 px-4 bg-slate-50 rounded-xl border border-slate-200 w-full flex items-center justify-between">
              <span className="text-xs font-bold uppercase text-slate-500">Total Price:</span>
              <span className="text-xl font-black font-mono text-emerald-600">
                BD {calculatedPrice}
              </span>
            </div>

            <div className="w-full flex flex-col items-center my-2">
              <div className="w-64 h-16 bg-slate-900 flex items-center justify-center rounded">
                <span className="text-[10px] font-mono tracking-[0.25em] text-white">
                  |||||||||||||||||||||||||||||||||||||||||
                </span>
              </div>
              <span className="font-mono text-xs font-bold tracking-widest text-slate-800 mt-1">
                {finalEan13}
              </span>
            </div>

            <div className="w-full border-t border-dashed border-slate-300 my-2"></div>
            
            <p className="text-[9px] text-slate-400 font-mono">
              Packed: {new Date().toLocaleDateString('en-GB')} | PLU: {selectedItem.plu}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

