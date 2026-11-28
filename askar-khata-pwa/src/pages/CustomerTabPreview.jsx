import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  ShieldCheck,
  ArrowLeft,
  Share2,
  Lock,
  Unlock,
  CheckCircle2,
  WifiOff,
  Printer,
  PhoneCall,
  MessageCircle,
  Clock,
  QrCode,
  Eye,
  EyeOff,
  Menu,
  User,
  Users,
  RotateCw,
  Calendar,
  X,
  ShoppingBag,
  CreditCard,
  Receipt,
  Bell,
  Fingerprint,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Zap,
  Smartphone,
  Maximize2,
  Minimize2,
  ExternalLink,
  Sparkles,
  ArrowUpRight,
  ArrowDownLeft,
  Activity,
  TrendingDown,
  TrendingUp,
  Cpu,
  Layers,
  Flame,
  Radio,
  Check,
  SlidersHorizontal,
  Info,
  Search,
  Filter,
  Store,
  FileText,
  ShoppingCart
} from 'lucide-react';

/**
 * MOCK ENTERPRISE CUSTOMERS
 * Each customer features a multi-card wallet (1 Personal + Multiple Messes)
 * with itemized receipts, roommate split ledgers, and AI spending analytics.
 */
const MOCK_CUSTOMERS = {
  mohammed: {
    id: 'CUST-8492',
    name: 'Mohammed Al-Doseri',
    nameAr: 'محمد الدوسري',
    nameMl: 'മുഹമ്മദ് അൽ ദോസരി',
    phone: '+973 3920 1842',
    cpr: '880419201',
    creditLimit: 100.000,
    dailyBurnRate: 2.850, // BHD/day average
    daysTillPayday: 12,
    cards: [
      {
        id: 'card-personal',
        type: 'PERSONAL',
        title: 'Personal Credit Card',
        titleAr: 'بطاقة الائتمان الشخصي',
        titleMl: 'പേഴ്സണൽ ക്രെഡിറ്റ് കാർഡ്',
        cardTier: 'OBSIDIAN TITANIUM',
        accountCode: 'KHT-8492-OB',
        balance: 45.200,
        creditLimit: 100.000,
        theme: 'obsidian',
        accentColor: '#0071E3',
        chipStyle: 'gold',
        gradient: 'from-[#1C1C1C] via-[#141414] to-[#0D0D0D]',
        borderGlow: 'border-[#0071E3]/40 shadow-[0_4px_12px_rgba(0,0,0,0.6),0_16px_36px_rgba(0,0,0,0.8),0_36px_80px_rgba(0,0,0,0.95),0_20px_50px_rgba(0,113,227,0.32)]',
        chipColor: 'from-[#0071E3] via-[#0077ED] to-[#003d7a]',
        aiInsight: 'Personal grocery spending is 4% below your monthly average. Safe runway till payday.',
        transactions: [
          {
            id: 'tx_p01',
            invoiceNo: 'INV-84920',
            timestamp: '2026-11-23T20:45:00Z',
            type: 'PURCHASE',
            amount: 2.950,
            runningBalance: 45.200,
            itemCount: 3,
            items: [
              { name: 'Almarai Fresh Milk 2L', nameAr: 'حليب المراعي 2 لتر', qty: 1, unitPrice: 1.050, total: 1.050 },
              { name: 'Khubz Flatbread (5 pcs)', nameAr: 'خبز لبناني 5 حبات', qty: 1, unitPrice: 0.100, total: 0.100 },
              { name: 'Fresh White Eggs 30s', nameAr: 'طبق بيض طازج 30 حبة', qty: 1, unitPrice: 1.800, total: 1.800 }
            ]
          },
          {
            id: 'tx_p02',
            invoiceNo: 'INV-84882',
            timestamp: '2026-11-22T18:20:00Z',
            type: 'PURCHASE',
            amount: 1.450,
            runningBalance: 42.250,
            itemCount: 3,
            items: [
              { name: "Lay's Salt & Vinegar Chips", nameAr: 'ليز بالخل والملح', qty: 1, unitPrice: 0.450, total: 0.450 },
              { name: 'Coca Cola 1.25L Bottle', nameAr: 'كوكاكولا 1.25 لتر', qty: 1, unitPrice: 0.400, total: 0.400 },
              { name: 'Indomie Special Chicken (5 pcs)', nameAr: 'إندومي دجاج خاص 5 حبات', qty: 1, unitPrice: 0.600, total: 0.600 }
            ]
          },
          {
            id: 'tx_p03',
            invoiceNo: 'PAY-40192',
            timestamp: '2026-11-20T17:15:00Z',
            type: 'PAYMENT',
            amount: -20.000,
            runningBalance: 40.800,
            channel: 'BenefitPay Fawri+',
            items: []
          },
          {
            id: 'tx_p04',
            invoiceNo: 'INV-84610',
            timestamp: '2026-11-19T14:10:00Z',
            type: 'PURCHASE',
            amount: 4.800,
            runningBalance: 60.800,
            itemCount: 2,
            items: [
              { name: 'Sadia Frozen Chicken 1kg (x2)', nameAr: 'دجاج ساديا مجمد 1 كغ (2 حبة)', qty: 2, unitPrice: 1.500, total: 3.000 },
              { name: 'Lulu Indian Basmati Rice 2kg', nameAr: 'أرز بسمتي هندي لولو 2 كغ', qty: 1, unitPrice: 1.800, total: 1.800 }
            ]
          },
          {
            id: 'tx_p05',
            invoiceNo: 'INV-83800',
            timestamp: '2026-11-18T21:10:00Z',
            type: 'PURCHASE',
            amount: 1.200,
            runningBalance: 56.000,
            itemCount: 1,
            items: [
              { name: 'Marlboro Gold Box', nameAr: 'سجائر مالبورو جولد', qty: 1, unitPrice: 1.200, total: 1.200 }
            ]
          },
          {
            id: 'tx_p06',
            invoiceNo: 'INV-83620',
            timestamp: '2026-11-16T19:40:00Z',
            type: 'PURCHASE',
            amount: 3.100,
            runningBalance: 54.800,
            itemCount: 2,
            items: [
              { name: 'Noor Sunflower Cooking Oil 1.5L', nameAr: 'زيت دوار الشمس نور 1.5 لتر', qty: 1, unitPrice: 2.300, total: 2.300 },
              { name: 'Maggi Chicken Noodle Soup 4pk', nameAr: 'شوربة دجاج ماجي 4 مغلفات', qty: 1, unitPrice: 0.800, total: 0.800 }
            ]
          },
          {
            id: 'tx_p07',
            invoiceNo: 'PAY-39820',
            timestamp: '2026-11-15T11:30:00Z',
            type: 'PAYMENT',
            amount: -15.000,
            runningBalance: 51.700,
            channel: 'BenefitPay Fawri+',
            items: []
          },
          {
            id: 'tx_p08',
            invoiceNo: 'INV-83210',
            timestamp: '2026-11-13T22:05:00Z',
            type: 'PURCHASE',
            amount: 2.250,
            runningBalance: 66.700,
            itemCount: 2,
            items: [
              { name: 'Brooke Bond Red Label Tea 400g', nameAr: 'شاي بروك بوند ريد ليبل 400 غرام', qty: 1, unitPrice: 1.350, total: 1.350 },
              { name: 'Rainbow Evaporated Milk (x3)', nameAr: 'حليب مبخر أبو قوس (3 حبات)', qty: 3, unitPrice: 0.300, total: 0.900 }
            ]
          },
          {
            id: 'tx_p09',
            invoiceNo: 'INV-82900',
            timestamp: '2026-11-11T16:50:00Z',
            type: 'PURCHASE',
            amount: 5.600,
            runningBalance: 64.450,
            itemCount: 4,
            items: [
              { name: 'Fresh Red Onions 3kg Bag', nameAr: 'كيس بصل أحمر طازج 3 كغ', qty: 1, unitPrice: 1.200, total: 1.200 },
              { name: 'Fresh Potatoes 3kg Bag', nameAr: 'كيس بطاطس طازج 3 كغ', qty: 1, unitPrice: 1.400, total: 1.400 },
              { name: 'Garlic Mesh Pack 500g', nameAr: 'ثوم شبك 500 غرام', qty: 1, unitPrice: 0.600, total: 0.600 },
              { name: 'Fresh Beef Tomatoes 2kg', nameAr: 'طماطم طازجة 2 كغ', qty: 2, unitPrice: 1.200, total: 2.400 }
            ]
          },
          {
            id: 'tx_p10',
            invoiceNo: 'INV-82540',
            timestamp: '2026-11-09T20:15:00Z',
            type: 'PURCHASE',
            amount: 1.850,
            runningBalance: 58.850,
            itemCount: 2,
            items: [
              { name: 'Al Ain Bottled Mineral Water 500ml (12pk)', nameAr: 'مياه العين 500 مل (كرتون 12 حبة)', qty: 1, unitPrice: 1.100, total: 1.100 },
              { name: "McVitie's Digestive Biscuits 400g", nameAr: 'بسكويت دايجستف مكفيتيز 400 غرام', qty: 1, unitPrice: 0.750, total: 0.750 }
            ]
          },
          {
            id: 'tx_p11',
            invoiceNo: 'INV-82100',
            timestamp: '2026-11-06T18:00:00Z',
            type: 'PURCHASE',
            amount: 3.750,
            runningBalance: 57.000,
            itemCount: 2,
            items: [
              { name: 'Ariel Automatic Detergent Powder 1.5kg', nameAr: 'مسحوق غسيل أوتوماتيك أريال 1.5 كغ', qty: 1, unitPrice: 2.850, total: 2.850 },
              { name: 'Dettol Antibacterial Liquid Handwash 200ml', nameAr: 'صابون سائل ديتول 200 مل', qty: 1, unitPrice: 0.900, total: 0.900 }
            ]
          },
          {
            id: 'tx_p12',
            invoiceNo: 'PAY-39100',
            timestamp: '2026-11-01T09:15:00Z',
            type: 'PAYMENT',
            amount: -30.000,
            runningBalance: 53.250,
            channel: 'BenefitPay Fawri+',
            items: []
          },
          {
            id: 'tx_p13',
            invoiceNo: 'INV-81420',
            timestamp: '2026-10-29T21:30:00Z',
            type: 'PURCHASE',
            amount: 4.200,
            runningBalance: 83.250,
            itemCount: 2,
            items: [
              { name: 'Fresh Australian Chilled Mutton 500g', nameAr: 'لحم غنم أسترالي مبرد 500 غرام', qty: 1, unitPrice: 3.400, total: 3.400 },
              { name: 'Shan Special Biryani Masala 50g', nameAr: 'بهارات برياني شان 50 غرام', qty: 1, unitPrice: 0.800, total: 0.800 }
            ]
          },
          {
            id: 'tx_p14',
            invoiceNo: 'INV-80910',
            timestamp: '2026-10-25T17:45:00Z',
            type: 'PURCHASE',
            amount: 2.100,
            runningBalance: 79.050,
            itemCount: 2,
            items: [
              { name: 'Kiri Cream Cheese 12 Portions', nameAr: 'جبنة كيري مربعات 12 قطعة', qty: 1, unitPrice: 1.700, total: 1.700 },
              { name: 'Fresh Samoon Bread (10 pcs)', nameAr: 'صمون طازج 10 حبات', qty: 1, unitPrice: 0.400, total: 0.400 }
            ]
          },
          {
            id: 'tx_p15',
            invoiceNo: 'INV-80250',
            timestamp: '2026-10-20T20:00:00Z',
            type: 'PURCHASE',
            amount: 6.900,
            runningBalance: 76.950,
            itemCount: 3,
            items: [
              { name: 'India Gate Classic Basmati Rice 5kg', nameAr: 'أرز بسمتي بوابة الهند كلاسيك 5 كغ', qty: 1, unitPrice: 4.900, total: 4.900 },
              { name: 'White Fine Sugar 2kg', nameAr: 'سكر ناعم أبيض 2 كغ', qty: 1, unitPrice: 1.500, total: 1.500 },
              { name: 'Table Iodized Salt 700g', nameAr: 'ملح طعام يودي 700 غرام', qty: 1, unitPrice: 0.500, total: 0.500 }
            ]
          },
          {
            id: 'tx_p16',
            invoiceNo: 'PAY-38500',
            timestamp: '2026-10-15T18:20:00Z',
            type: 'PAYMENT',
            amount: -25.000,
            runningBalance: 70.050,
            channel: 'BenefitPay Fawri+',
            items: []
          }
        ]
      },
      {
        id: 'card-mess-12',
        type: 'MESS',
        title: 'Askar Camp Mess #12',
        titleAr: 'ميس سكن عسكر 12',
        titleMl: 'അസ്കർ ക്യാമ്പ് മെസ്സ് 12',
        cardTier: 'ROYAL SAPPHIRE METAL',
        accountCode: 'MESS-3104-SP',
        balance: 34.525, // Individual share
        roomTotal: 207.150,
        membersCount: 6,
        membersPaid: 4,
        theme: 'sapphire',
        accentColor: '#0071E3',
        chipStyle: 'silver',
        gradient: 'from-[#201818] via-[#151212] to-[#0D0D0D]',
        borderGlow: 'border-white/20 shadow-[0_4px_12px_rgba(0,0,0,0.6),0_16px_36px_rgba(0,0,0,0.8),0_36px_80px_rgba(0,0,0,0.95),0_20px_50px_rgba(0,113,227,0.22)]',
        chipColor: 'from-slate-200 via-slate-400 to-slate-500',
        aiInsight: 'Room Mess #12 is 67% settled. 4 of 6 roommates paid their BHD 34.525 share.',
        roommates: [
          { name: 'Mohammed Al-Doseri (You)', nameAr: 'محمد الدوسري (أنت)', share: 34.525, status: 'PENDING' },
          { name: 'Rajesh Kumar', nameAr: 'راجيش كومار', share: 34.525, status: 'PAID', channel: 'BenefitPay' },
          { name: 'Suresh Nair', nameAr: 'سوريش ناير', share: 34.525, status: 'PAID', channel: 'Cash Counter' },
          { name: 'Ali Hassan', nameAr: 'علي حسن', share: 34.525, status: 'PENDING' },
          { name: 'Bilal Khan', nameAr: 'بلال خان', share: 34.525, status: 'PAID', channel: 'BenefitPay' },
          { name: 'Tariq Aziz', nameAr: 'طارق عزيز', share: 34.525, status: 'PAID', channel: 'Fawri+' }
        ],
        transactions: [
          {
            id: 'tx_m01',
            invoiceNo: 'INV-84102',
            timestamp: '2026-11-22T19:30:00Z',
            type: 'PURCHASE',
            amount: 8.420,
            runningBalance: 207.150,
            itemCount: 4,
            items: [
              { name: 'Loose Red Tomatoes (1.5 kg)', nameAr: 'طماطم بالكيلو', qty: 1.5, unitPrice: 0.350, total: 0.525 },
              { name: 'Chiquita Bananas (1.2 kg)', nameAr: 'موز شيكيتا بالكيلو', qty: 1.2, unitPrice: 0.550, total: 0.660 },
              { name: 'Basmati Rice 5kg Bag', nameAr: 'أرز بسمتي 5 كغ', qty: 1, unitPrice: 4.800, total: 4.800 },
              { name: 'Sunflower Cooking Oil 1.5L', nameAr: 'زيت دوار الشمس', qty: 1, unitPrice: 2.435, total: 2.435 }
            ]
          },
          {
            id: 'tx_m02',
            invoiceNo: 'INV-83210',
            timestamp: '2026-11-15T18:00:00Z',
            type: 'PURCHASE',
            amount: 14.500,
            runningBalance: 198.730,
            itemCount: 2,
            items: [
              { name: 'Fresh Chicken 10-Pack (1kg)', nameAr: 'دجاج مبرد 10 حبات', qty: 10, unitPrice: 1.250, total: 12.500 },
              { name: 'Red Onions 10kg Bag', nameAr: 'خيشة بصل أحمر 10 كغ', qty: 1, unitPrice: 2.000, total: 2.000 }
            ]
          }
        ]
      },
      {
        id: 'card-mess-overtime',
        type: 'MESS',
        title: 'Overtime Tea & Pantry Mess',
        titleAr: 'ميس الشاي الإضافي والوجبات الخفيفة',
        titleMl: 'ഓവർടൈം ടീ മെസ്സ്',
        cardTier: 'BURNISHED GOLD CLUB',
        accountCode: 'MESS-1088-GD',
        balance: 8.200, // Individual share
        roomTotal: 32.800,
        membersCount: 4,
        membersPaid: 3,
        theme: 'amber',
        accentColor: '#0071E3',
        chipStyle: 'gold',
        gradient: 'from-[#221818] via-[#161212] to-[#0D0D0D]',
        borderGlow: 'border-white/20 shadow-[0_4px_12px_rgba(0,0,0,0.6),0_16px_36px_rgba(0,0,0,0.8),0_36px_80px_rgba(0,0,0,0.95),0_20px_50px_rgba(0,113,227,0.22)]',
        chipColor: 'from-amber-200 via-amber-400 to-yellow-600',
        aiInsight: 'Shift tea pantry supplies last restocked 3 days ago. 1 member pending.',
        roommates: [
          { name: 'Mohammed Al-Doseri (You)', nameAr: 'محمد الدوسري (أنت)', share: 8.200, status: 'PENDING' },
          { name: 'Haroon Rashid', nameAr: 'هارون رشيد', share: 8.200, status: 'PAID', channel: 'BenefitPay' },
          { name: 'Deepak Sharma', nameAr: 'ديباك شارما', share: 8.200, status: 'PAID', channel: 'Cash' },
          { name: 'Mansoor Khan', nameAr: 'منصور خان', share: 8.200, status: 'PAID', channel: 'BenefitPay' }
        ],
        transactions: [
          {
            id: 'tx_ot01',
            invoiceNo: 'INV-83900',
            timestamp: '2026-11-21T16:00:00Z',
            type: 'PURCHASE',
            amount: 4.500,
            runningBalance: 32.800,
            itemCount: 2,
            items: [
              { name: 'Tea Dust 400g Red Label (x2)', nameAr: 'شاي ريد ليبل 400غ (2 حبة)', qty: 2, unitPrice: 1.300, total: 2.600 },
              { name: 'Sugar 5kg Bag', nameAr: 'سكر 5 كغ', qty: 1, unitPrice: 1.900, total: 1.900 }
            ]
          }
        ]
      },
      {
        id: 'card-master-overview',
        type: 'MASTER',
        title: 'Total Balance & Mess Split',
        titleAr: 'إجمالي الرصيد وتقسيم الميس',
        titleMl: 'ആകെ ബാലൻസും മെസ്സ് വിഹിതവും',
        cardTier: 'CENTURION MASTER OBSIDIAN',
        accountCode: 'KHT-TOTAL-879',
        balance: 87.925,
        personalBalance: 45.200,
        messBalance: 42.725,
        creditLimit: 192.800,
        theme: 'master-obsidian',
        accentColor: '#0071E3',
        chipStyle: 'gold',
        gradient: 'from-[#1A2230] via-[#121620] to-[#0D0D0D]',
        borderGlow: 'border-[#0071E3]/50 shadow-[0_4px_12px_rgba(0,0,0,0.6),0_16px_36px_rgba(0,0,0,0.8),0_36px_80px_rgba(0,0,0,0.95),0_20px_50px_rgba(0,113,227,0.38)]',
        chipColor: 'from-[#0071E3] via-[#0077ED] to-[#003d7a]',
        transactions: [
          {
            id: 'tx_master_01',
            invoiceNo: 'INV-84920',
            timestamp: '2026-11-23T20:45:00Z',
            type: 'PURCHASE',
            amount: 2.950,
            runningBalance: 87.925,
            itemCount: 3,
            accountLabel: 'Personal Credit',
            items: [
              { name: 'Almarai Fresh Milk 2L', nameAr: 'حليب المراعي 2 لتر', qty: 1, unitPrice: 1.050, total: 1.050 },
              { name: 'Khubz Flatbread (5 pcs)', nameAr: 'خبز لبناني 5 حبات', qty: 1, unitPrice: 0.100, total: 0.100 },
              { name: 'Fresh White Eggs 30s', nameAr: 'طبق بيض طازج 30 حبة', qty: 1, unitPrice: 1.800, total: 1.800 }
            ]
          },
          {
            id: 'tx_master_02',
            invoiceNo: 'INV-84102',
            timestamp: '2026-11-22T19:30:00Z',
            type: 'PURCHASE',
            amount: 8.420,
            runningBalance: 84.975,
            itemCount: 4,
            accountLabel: 'Mess #12 Share',
            items: [
              { name: 'Loose Red Tomatoes (1.5 kg)', nameAr: 'طماطم بالكيلو', qty: 1.5, unitPrice: 0.350, total: 0.525 },
              { name: 'Chiquita Bananas (1.2 kg)', nameAr: 'موز شيكيتا بالكيلو', qty: 1.2, unitPrice: 0.550, total: 0.660 },
              { name: 'Basmati Rice 5kg Bag', nameAr: 'أرز بسمتي 5 كغ', qty: 1, unitPrice: 4.800, total: 4.800 },
              { name: 'Sunflower Cooking Oil 1.5L', nameAr: 'زيت دوار الشمس', qty: 1, unitPrice: 2.435, total: 2.435 }
            ]
          },
          {
            id: 'tx_master_03',
            invoiceNo: 'PAY-40192',
            timestamp: '2026-11-20T17:15:00Z',
            type: 'PAYMENT',
            amount: -20.000,
            runningBalance: 76.555,
            channel: 'BenefitPay Fawri+',
            accountLabel: 'Personal Payment',
            items: []
          },
          {
            id: 'tx_master_04',
            invoiceNo: 'INV-83800',
            timestamp: '2026-11-18T21:10:00Z',
            type: 'PURCHASE',
            amount: 1.200,
            runningBalance: 96.555,
            itemCount: 1,
            accountLabel: 'Personal Credit',
            items: [
              { name: 'Marlboro Gold Box', nameAr: 'سجائر مالبورو', qty: 1, unitPrice: 1.200, total: 1.200 }
            ]
          }
        ]
      },
    ]
  },
  rajesh: {
    id: 'CUST-3104',
    name: 'Rajesh Kumar',
    nameAr: 'راجيش كومار',
    nameMl: 'രാജേഷ് കുമാർ',
    phone: '+973 3411 9901',
    cpr: '921104882',
    creditLimit: 60.000,
    dailyBurnRate: 1.450,
    daysTillPayday: 12,
    cards: [
      {
        id: 'card-personal-rajesh',
        type: 'PERSONAL',
        title: 'Personal Grocery Credit',
        titleAr: 'الحساب الشخصي',
        titleMl: 'പേഴ്സണൽ അക്കൗണ്ട്',
        cardTier: 'OBSIDIAN TITANIUM',
        accountCode: 'KHT-3104-OB',
        balance: 14.500,
        creditLimit: 60.000,
        theme: 'obsidian',
        accentColor: '#0071E3',
        chipStyle: 'gold',
        gradient: 'from-[#1C1C1C] via-[#141414] to-[#0D0D0D]',
        borderGlow: 'border-[#0071E3]/40 shadow-[0_4px_12px_rgba(0,0,0,0.6),0_16px_36px_rgba(0,0,0,0.8),0_36px_80px_rgba(0,0,0,0.95),0_20px_50px_rgba(0,113,227,0.32)]',
        chipColor: 'from-[#0071E3] via-[#0077ED] to-[#003d7a]',
        aiInsight: 'Low debt utilization: only 24% of credit limit utilized. Excellent standing.',
        transactions: [
          {
            id: 'tx_r01',
            invoiceNo: 'INV-79012',
            timestamp: '2026-11-20T18:20:00Z',
            type: 'PURCHASE',
            amount: 4.500,
            runningBalance: 14.500,
            itemCount: 2,
            items: [
              { name: 'Tea Dust 400g Red Label', nameAr: 'شاي ريد ليبل 400غ', qty: 1, unitPrice: 1.300, total: 1.300 },
              { name: 'Sugar 5kg Bag', nameAr: 'سكر 5 كغ', qty: 1, unitPrice: 3.200, total: 3.200 }
            ]
          }
        ]
      }
    ]
  },
  ali_settled: {
    id: 'CUST-1088',
    name: 'Ali Hassan',
    nameAr: 'علي حسن',
    nameMl: 'അലി ഹസ്സൻ',
    phone: '+973 3655 4410',
    cpr: '850119302',
    creditLimit: 50.000,
    dailyBurnRate: 0.000,
    daysTillPayday: 12,
    cards: [
      {
        id: 'card-personal-ali',
        type: 'PERSONAL',
        title: 'Personal Credit Card',
        titleAr: 'الحساب الشخصي',
        titleMl: 'പേഴ്സണൽ അക്കൗണ്ട്',
        cardTier: 'OBSIDIAN TITANIUM',
        accountCode: 'KHT-1088-OB',
        balance: 0.000,
        creditLimit: 50.000,
        theme: 'obsidian',
        accentColor: '#0071E3',
        chipStyle: 'gold',
        gradient: 'from-[#1C1C1C] via-[#141414] to-[#0D0D0D]',
        borderGlow: 'border-[#0071E3]/40 shadow-[0_4px_12px_rgba(0,0,0,0.6),0_16px_36px_rgba(0,0,0,0.8),0_36px_80px_rgba(0,0,0,0.95),0_20px_50px_rgba(0,113,227,0.32)]',
        chipColor: 'from-[#0071E3] via-[#0077ED] to-[#003d7a]',
        aiInsight: 'Account completely settled. Zero outstanding balance owed.',
        transactions: [
          {
            id: 'tx_a01',
            invoiceNo: 'PAY-40010',
            timestamp: '2026-11-18T16:00:00Z',
            type: 'PAYMENT',
            amount: -35.200,
            runningBalance: 0.000,
            channel: 'BenefitPay Fawri+',
            items: []
          }
        ]
      }
    ]
  }
};

/**
 * Realistic SVG EMV Chip Component
 */
function EmvChip({ chipStyle = 'gold' }) {
  const isGold = chipStyle === 'gold';
  return (
    <div className={`w-11 h-8 rounded-lg relative overflow-hidden border shadow-sm ${isGold
      ? 'bg-gradient-to-br from-amber-200 via-amber-400 to-yellow-600 border-amber-300/60 shadow-amber-900/40'
      : 'bg-gradient-to-br from-slate-200 via-slate-300 to-slate-400 border-white/60 shadow-slate-900/40'
      }`}>
      {/* Chip circuit lines */}
      <div className="absolute inset-0 flex flex-col justify-between p-1 opacity-70">
        <div className="h-px bg-black/40 w-full" />
        <div className="h-px bg-black/40 w-full" />
        <div className="h-px bg-black/40 w-full" />
      </div>
      <div className="absolute inset-0 flex justify-between px-2.5 py-0.5 opacity-70">
        <div className="w-px bg-black/40 h-full" />
        <div className="w-px bg-black/40 h-full" />
      </div>
      <div className="absolute inset-2 border border-black/30 rounded-sm" />
    </div>
  );
}

/**
 * Contactless NFC Wave Icon
 */
function ContactlessGlyph() {
  return (
    <svg className="w-5 h-5 text-white/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M8.5 16.5a5 5 0 0 1 0-9" />
      <path d="M12 19a8.5 8.5 0 0 0 0-14" />
      <path d="M15.5 21.5a12 12 0 0 0 0-19" />
    </svg>
  );
}

/**
 * Main AI Fintech CustomerTabPreview Component
 */
export default function CustomerTabPreview() {
  const [selectedPresetKey, setSelectedPresetKey] = useState('mohammed');
  const [activeCardIndex, setActiveCardIndex] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const c = parseInt(params.get('card'), 10);
      if (!isNaN(c) && c >= 0) return c;
    }
    return 0;
  });

  // Default to native full-screen on mobile devices
  const [isPhoneFrame, setIsPhoneFrame] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('frame') === 'true';
    }
    return false;
  });

  const [showPreviewControls, setShowPreviewControls] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('controls') === 'true';
    }
    return false;
  });

  const [lang, setLang] = useState('en');
  const [hideBalance, setHideBalance] = useState(false);
  const [showBenefitModal, setShowBenefitModal] = useState(false);
  const [benefitAmount, setBenefitAmount] = useState(0);
  const [showRoommateModal, setShowRoommateModal] = useState(false);
  const [showPassModal, setShowPassModal] = useState(false);
  const [filterType, setFilterType] = useState('ALL');
  const [selectedDate, setSelectedDate] = useState(''); // 'YYYY-MM-DD'
  const [datePreset, setDatePreset] = useState('ALL'); // 'ALL' | 'YESTERDAY' | 'THIS_WEEK' | 'THIS_MONTH' | 'CUSTOM'

  // Google Pay Transaction Sub-View States ('MAIN' | 'ALL_TRANSACTIONS')
  const [activeSubView, setActiveSubView] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('view') === 'all_tx') return 'ALL_TRANSACTIONS';
    }
    return 'MAIN';
  });
  const [allTxSearchQuery, setAllTxSearchQuery] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('q') || '';
    }
    return '';
  });
  const [allTxTypeFilter, setAllTxTypeFilter] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('type') || 'ALL';
    }
    return 'ALL';
  });
  const [allTxCardScope, setAllTxCardScope] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('scope') || 'ACTIVE';
    }
    return 'ACTIVE';
  });
  const [allTxMonthFilter, setAllTxMonthFilter] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('month') || 'ALL';
    }
    return 'ALL';
  });

  // Hamburger Drawer & Live Alerts State
  const [isDrawerOpen, setIsDrawerOpen] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('drawer') === 'open' || params.get('drawer') === 'true';
    }
    return false;
  });

  // Top Floating Register Alert Toast (The Only Allowed Main Screen Addition)
  const [liveTxAlert, setLiveTxAlert] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('alert') === 'true' || params.get('alert') === 'mock') {
        return {
          id: 'alert_mock',
          title: 'Purchase Notice',
          invoiceNo: 'INV-84920',
          amount: 2.950,
          itemsCount: 3,
          timestamp: 'Just now'
        };
      }
    }
    return null;
  });

  useEffect(() => {
    if (!liveTxAlert) return;
    const timer = setTimeout(() => {
      setLiveTxAlert(null);
    }, 6000);
    return () => clearTimeout(timer);
  }, [liveTxAlert]);

  // Card Freeze State
  const [frozenCards, setFrozenCards] = useState({});

  // Biometric App Lock & PIN
  const [isBiometricLocked, setIsBiometricLocked] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [enteredPin, setEnteredPin] = useState('');
  const [pinError, setPinError] = useState(false);

  // Statement PDF / Print Modal
  const [showStatementModal, setShowStatementModal] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('statement') === 'true' || params.get('statement') === 'open';
    }
    return false;
  });

  // 3D Card Flip & Cashier Counter Pass States
  const [isCardFlipped, setIsCardFlipped] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('flipped') === 'true';
    }
    return false;
  });
  const [isCounterActive, setIsCounterActive] = useState(false);
  const [counterSecondsLeft, setCounterSecondsLeft] = useState(90);

  // Morph State: false = 3D Card Deck, true = Compact Sticky Pill
  const [isCompact, setIsCompact] = useState(false);
  const scrollContainerRef = useRef(null);
  const touchStartYRef = useRef(0);
  const touchLastYRef = useRef(0);
  const isTouchActiveRef = useRef(false);

  // Horizontal Card Drag & Slide Animation States (Swipe Left / Swipe Right)
  const [cardDragX, setCardDragX] = useState(0);
  const [isDraggingCard, setIsDraggingCard] = useState(false);
  const [slidePhase, setSlidePhase] = useState('IDLE'); // 'IDLE' | 'EXIT' | 'ENTER'
  const [slideDir, setSlideDir] = useState('NONE'); // 'LEFT' | 'RIGHT'
  const slideTimerRef = useRef(null);
  const cardGestureIntentRef = useRef('UNDECIDED');

  // Card-to-List Active Promotion State ('BALANCE' | 'INVOICE')
  const [activeFocus, setActiveFocus] = useState('BALANCE');
  const [promotedTx, setPromotedTx] = useState(null);

  const customer = MOCK_CUSTOMERS[selectedPresetKey] || MOCK_CUSTOMERS.mohammed;
  const cards = customer.cards || [];
  const activeCard = cards[activeCardIndex] || cards[0] || {};
  const isRtl = lang === 'ar';

  const isCurrentCardFrozen = Boolean(activeCard?.id && frozenCards[activeCard.id]);
  const handleToggleCardFreeze = () => {
    if (!activeCard?.id) return;
    setFrozenCards(prev => ({ ...prev, [activeCard.id]: !prev[activeCard.id] }));
  };

  const handleShareWhatsAppLedger = () => {
    const balStr = Number(activeCard?.balance || 0).toFixed(3);
    const msg = `*LAYALI SUPERMARKET — KHATA STATEMENT*\nCustomer: ${customer.name} (CPR ${customer.cpr})\nCard: ${activeCard.title}\nOutstanding Balance: BHD ${balStr}\n\nSettle online via BenefitPay Fawri+:\nhttps://askar-khata-pwa.vercel.app/preview`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
  };

  // Peeking Card Overlap Calculations for Swipe Affordance
  const nextCard = cards.length > 1 ? cards[(activeCardIndex + 1) % cards.length] : null;
  const prevCard = cards.length > 1 ? cards[(activeCardIndex - 1 + cards.length) % cards.length] : null;
  const hasNext = cards.length > 1 && (activeCardIndex < cards.length - 1);
  const hasPrev = cards.length > 1 && activeCardIndex > 0;

  // Calculate Total Consolidated Obligation across all cards
  const totalConsolidatedBalance = useMemo(() => {
    return cards.reduce((sum, c) => sum + (Number(c.balance) || 0), 0);
  }, [cards]);

  const personalBalanceOnly = useMemo(() => {
    const pCard = cards.find(c => c.type === 'PERSONAL');
    return pCard ? pCard.balance : 0;
  }, [cards]);

  const messBalanceOnly = useMemo(() => {
    return cards
      .filter(c => c.type === 'MESS')
      .reduce((sum, c) => sum + (Number(c.balance) || 0), 0);
  }, [cards]);

  // Directional Velocity & Scroll Tracker with Morph Transition Lock
  const tickingRef = useRef(false);
  const lastScrollTopRef = useRef(0);
  const scrollDirectionRef = useRef('NONE');
  const isTransitioningRef = useRef(false);
  const transitionTimeoutRef = useRef(null);

  // Transition Lock: Prevents scroll-event bounce oscillation while animating
  const lockTransition = useCallback((durationMs = 420) => {
    isTransitioningRef.current = true;
    if (transitionTimeoutRef.current) clearTimeout(transitionTimeoutRef.current);
    transitionTimeoutRef.current = setTimeout(() => {
      isTransitioningRef.current = false;
    }, durationMs);
  }, []);

  // Smooth collapse to compact (swipe UP or programmatic)
  const handleCollapseToCompact = useCallback((scrollTarget = null) => {
    if (isCompact) return;
    lockTransition(420);
    setIsCompact(true);
    if (scrollTarget !== null && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollTarget,
        behavior: 'smooth'
      });
    }
  }, [isCompact, lockTransition]);

  // Smooth expand to big (swipe DOWN or programmatic)
  const handleExpandToBig = useCallback(() => {
    if (!isCompact) return;
    lockTransition(420);
    setIsCompact(false);
    setActiveFocus('BALANCE');
    setPromotedTx(null);
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    }
  }, [isCompact, lockTransition]);

  // Smooth glide to transactions (shrinks card)
  const handleScrollDownToTransactions = useCallback(() => {
    handleCollapseToCompact(220);
  }, [handleCollapseToCompact]);

  // Buttery Smooth Horizontal Card Slide Lifecycle (Direction or Direct Index)
  const handleSlideCard = useCallback((directionOrIndex) => {
    if (cards.length <= 1 || isTransitioningRef.current) return;

    let targetIndex;
    let isNext;

    if (typeof directionOrIndex === 'number') {
      if (directionOrIndex === activeCardIndex || directionOrIndex < 0 || directionOrIndex >= cards.length) return;
      targetIndex = directionOrIndex;
      isNext = directionOrIndex > activeCardIndex;
    } else {
      isNext = directionOrIndex === 'NEXT';
      targetIndex = isNext
        ? (activeCardIndex + 1) % cards.length
        : (activeCardIndex - 1 + cards.length) % cards.length;
    }

    setIsCardFlipped(false);
    setIsCounterActive(false);
    setCardDragX(0);

    // Phase 1: Accelerate current card off-screen in swipe direction
    setSlideDir(isNext ? 'LEFT' : 'RIGHT');
    setSlidePhase('EXIT');
    lockTransition(380);

    // Phase 2: Switch active index and stage incoming card off-screen on the opposite side
    if (slideTimerRef.current) clearTimeout(slideTimerRef.current);
    slideTimerRef.current = setTimeout(() => {
      setActiveCardIndex(targetIndex);
      setSlidePhase('ENTER');

      // Phase 3: Glide smoothly into center with Apple spring deceleration
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setSlidePhase('IDLE');
          setSlideDir('NONE');
        });
      });
    }, 150);
  }, [activeCardIndex, cards.length, lockTransition]);

  const handleNextCard = useCallback(() => handleSlideCard('NEXT'), [handleSlideCard]);
  const handlePrevCard = useCallback(() => handleSlideCard('PREV'), [handleSlideCard]);

  // WAI-ARIA 1.2 Keyboard Carousel Navigation (ArrowLeft, ArrowRight, Home, End)
  const handleCarouselKeyDown = useCallback((e) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (hasNext) handleSlideCard('NEXT');
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (hasPrev) handleSlideCard('PREV');
    } else if (e.key === 'Home') {
      e.preventDefault();
      if (activeCardIndex !== 0) handleSlideCard('PREV');
    } else if (e.key === 'End') {
      e.preventDefault();
      if (activeCardIndex !== cards.length - 1) handleSlideCard('NEXT');
    }
  }, [hasNext, hasPrev, activeCardIndex, cards.length, handleSlideCard]);

  // Compute 60/120 FPS GPU Horizontal Slide Transform
  const cardSlideTransform = useMemo(() => {
    // 1. Actively dragging with finger or mouse (Zero latency real-time tracking)
    if (cardDragX !== 0) {
      return {
        transform: `translate3d(${cardDragX}px, 0, 0) rotate(${cardDragX * 0.024}deg)`,
        transition: 'none',
        opacity: Math.max(0.72, 1 - Math.abs(cardDragX) * 0.0016)
      };
    }

    // 2. Sliding out (EXIT phase)
    if (slidePhase === 'EXIT') {
      const exitX = slideDir === 'LEFT' ? '-115%' : '115%';
      const exitRot = slideDir === 'LEFT' ? '-5deg' : '5deg';
      return {
        transform: `translate3d(${exitX}, 0, 0) rotate(${exitRot}) scale(0.92)`,
        transition: 'transform 160ms cubic-bezier(0.4, 0, 1, 1), opacity 150ms ease-out',
        opacity: 0
      };
    }

    // 3. Staged incoming card (ENTER phase, prepared off-screen)
    if (slidePhase === 'ENTER') {
      const enterX = slideDir === 'LEFT' ? '90%' : '-90%';
      const enterRot = slideDir === 'LEFT' ? '4deg' : '-4deg';
      return {
        transform: `translate3d(${enterX}, 0, 0) rotate(${enterRot}) scale(0.94)`,
        transition: 'none',
        opacity: 0
      };
    }

    // 4. Settled at center (IDLE) with fluid spring recovery
    return {
      transform: 'translate3d(0, 0, 0) rotate(0deg) scale(1)',
      transition: 'transform 340ms cubic-bezier(0.22, 1, 0.36, 1), opacity 260ms ease-out',
      opacity: 1
    };
  }, [cardDragX, slidePhase, slideDir]);

  const handleScroll = useCallback((e) => {
    const top = e.currentTarget.scrollTop;
    lastScrollTopRef.current = top;
  }, []);

  // Touch Swipe Gesture Handlers (Outer Container for Vertical Collapse)
  const touchStartXRef = useRef(0);
  const touchStartTimeRef = useRef(0);

  const handleTouchStart = (e) => {
    touchStartXRef.current = e.touches[0].clientX;
    touchStartYRef.current = e.touches[0].clientY;
    touchStartTimeRef.current = Date.now();
    isTouchActiveRef.current = true;
  };

  const handleTouchMove = () => {
    // Let browser handle native vertical page scroll
  };

  const handleTouchEnd = () => {
    isTouchActiveRef.current = false;
  };

  // Direct Touch Handlers on Physical Card: Real-time Horizontal Dragging + Vertical Expand/Collapse
  const cardTouchStartXRef = useRef(0);
  const cardTouchStartYRef = useRef(0);
  const cardTouchStartTimeRef = useRef(0);

  const handleCardTouchStart = (e) => {
    cardTouchStartXRef.current = e.touches[0].clientX;
    cardTouchStartYRef.current = e.touches[0].clientY;
    cardTouchStartTimeRef.current = Date.now();
    cardGestureIntentRef.current = 'UNDECIDED';
    setIsDraggingCard(false);
  };

  const handleCardTouchMove = (e) => {
    if (isTransitioningRef.current || isCompact) return;
    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const deltaX = currentX - cardTouchStartXRef.current;
    const deltaY = currentY - cardTouchStartYRef.current;

    // Resolve gesture intent if still undecided
    if (cardGestureIntentRef.current === 'UNDECIDED') {
      if (Math.abs(deltaX) > 7 && Math.abs(deltaX) > Math.abs(deltaY)) {
        cardGestureIntentRef.current = 'HORIZONTAL';
        setIsDraggingCard(true);
      } else if (Math.abs(deltaY) > 7 && Math.abs(deltaY) > Math.abs(deltaX)) {
        cardGestureIntentRef.current = 'VERTICAL';
      }
    }

    // Real-time horizontal card displacement with boundary damping
    if (cardGestureIntentRef.current === 'HORIZONTAL') {
      let dampedX = deltaX;
      if (activeCardIndex === 0 && deltaX > 0) dampedX = deltaX * 0.28;
      else if (activeCardIndex === cards.length - 1 && deltaX < 0) dampedX = deltaX * 0.28;
      setCardDragX(dampedX);
    }
  };

  const handleCardTouchEnd = (e) => {
    const endX = e.changedTouches[0].clientX;
    const endY = e.changedTouches[0].clientY;
    const deltaX = endX - cardTouchStartXRef.current;
    const deltaY = endY - cardTouchStartYRef.current;
    const duration = Date.now() - cardTouchStartTimeRef.current;
    const intent = cardGestureIntentRef.current;
    cardGestureIntentRef.current = 'UNDECIDED';
    setIsDraggingCard(false);

    // Compact Mode: Tap or swipe expands card
    if (isCompact) {
      if (Math.abs(deltaY) > 10 || Math.abs(deltaX) < 15) {
        handleExpandToBig();
      }
      return;
    }

    // 1. HORIZONTAL INTENT: Process Carousel Transition or Spring Back
    if (intent === 'HORIZONTAL' || (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 20)) {
      const isFastFlick = duration < 280 && Math.abs(deltaX) > 25;
      const passedThreshold = Math.abs(cardDragX || deltaX) > 45 || isFastFlick;

      if (passedThreshold) {
        if ((cardDragX < 0 || deltaX < 0) && hasNext) {
          handleSlideCard('NEXT');
          return;
        } else if ((cardDragX > 0 || deltaX > 0) && hasPrev) {
          handleSlideCard('PREV');
          return;
        }
      }
      // Threshold not met or at dead boundary -> spring back
      setCardDragX(0);
      return;
    }

    // 2. VERTICAL INTENT: Let page scroll naturally without forced collapse
    setCardDragX(0);
  };

  // Mouse Drag Swiping for Desktop users testing without touch
  const isMouseDownRef = useRef(false);
  const cardMouseStartXRef = useRef(0);
  const cardMouseStartYRef = useRef(0);

  const handleCardMouseDown = (e) => {
    isMouseDownRef.current = true;
    cardMouseStartXRef.current = e.clientX;
    cardMouseStartYRef.current = e.clientY;
    cardTouchStartTimeRef.current = Date.now();
    cardGestureIntentRef.current = 'UNDECIDED';
    setIsDraggingCard(false);
  };

  const handleCardMouseMove = (e) => {
    if (!isMouseDownRef.current || isCompact || isTransitioningRef.current) return;
    const deltaX = e.clientX - cardMouseStartXRef.current;
    const deltaY = e.clientY - cardMouseStartYRef.current;

    if (cardGestureIntentRef.current === 'UNDECIDED') {
      if (Math.abs(deltaX) > 6 && Math.abs(deltaX) > Math.abs(deltaY)) {
        cardGestureIntentRef.current = 'HORIZONTAL';
        setIsDraggingCard(true);
      }
    }

    if (cardGestureIntentRef.current === 'HORIZONTAL') {
      let dampedX = deltaX;
      if (activeCardIndex === 0 && deltaX > 0) dampedX = deltaX * 0.28;
      else if (activeCardIndex === cards.length - 1 && deltaX < 0) dampedX = deltaX * 0.28;
      setCardDragX(dampedX);
    }
  };

  const handleCardMouseUp = (e) => {
    if (!isMouseDownRef.current) return;
    isMouseDownRef.current = false;
    setIsDraggingCard(false);
    const deltaX = e.clientX - cardMouseStartXRef.current;
    const deltaY = e.clientY - cardMouseStartYRef.current;
    const duration = Date.now() - cardTouchStartTimeRef.current;
    const intent = cardGestureIntentRef.current;
    cardGestureIntentRef.current = 'UNDECIDED';

    if (isCompact) {
      if (Math.abs(deltaY) > 10 || Math.abs(deltaX) < 10) handleExpandToBig();
      return;
    }

    if (intent === 'HORIZONTAL' || Math.abs(deltaX) > 25) {
      const isFastFlick = duration < 280 && Math.abs(deltaX) > 25;
      if (Math.abs(cardDragX || deltaX) > 40 || isFastFlick) {
        if ((cardDragX < 0 || deltaX < 0) && hasNext) {
          handleSlideCard('NEXT');
          return;
        } else if ((cardDragX > 0 || deltaX > 0) && hasPrev) {
          handleSlideCard('PREV');
          return;
        }
      }
      setCardDragX(0);
      return;
    }

    setCardDragX(0);
  };

  const handleCardMouseLeave = () => {
    if (isMouseDownRef.current) {
      isMouseDownRef.current = false;
      setIsDraggingCard(false);
      cardGestureIntentRef.current = 'UNDECIDED';
      setCardDragX(0);
    }
  };

  // Flip Toggle
  const handleToggleCardFlip = useCallback(() => {
    setIsCardFlipped(prev => {
      const next = !prev;
      if (!next) setIsCounterActive(false);
      return next;
    });
  }, []);

  // Trigger "I am at Counter" (أنا عند الكاشير)
  const handleTriggerCounterMode = useCallback(() => {
    setIsCardFlipped(true);
    setIsCounterActive(true);
    setCounterSecondsLeft(90);
  }, [lang]);

  const handleDismissCounterMode = useCallback(() => {
    setIsCardFlipped(false);
    setIsCounterActive(false);
    setCounterSecondsLeft(90);
  }, []);

  // Active Counter Mode Countdown Timer (90s)
  useEffect(() => {
    let timer = null;
    if (isCounterActive && counterSecondsLeft > 0) {
      timer = setInterval(() => {
        setCounterSecondsLeft(prev => {
          if (prev <= 1) {
            setIsCounterActive(false);
            setIsCardFlipped(false);
            return 90;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isCounterActive, counterSecondsLeft]);

  // Handle URL query ?scroll=XXX for testing scroll position
  useEffect(() => {
    const scrollTarget = new URLSearchParams(window.location.search).get('scroll');
    if (scrollTarget && scrollContainerRef.current) {
      setTimeout(() => {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop = parseInt(scrollTarget, 10);
        }
      }, 100);
    }
  }, []);

  // Synchronize browser history with ?view=all_tx for deep-linking
  useEffect(() => {
    const handlePopState = () => {
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        if (params.get('view') === 'all_tx') {
          setActiveSubView('ALL_TRANSACTIONS');
        } else {
          setActiveSubView('MAIN');
        }
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateToAllTx = useCallback(() => {
    setActiveSubView('ALL_TRANSACTIONS');
    if (typeof window !== 'undefined' && window.history) {
      const url = new URL(window.location);
      url.searchParams.set('view', 'all_tx');
      window.history.pushState({}, '', url);
    }
  }, []);

  const navigateToMain = useCallback(() => {
    setActiveSubView('MAIN');
    if (typeof window !== 'undefined' && window.history) {
      const url = new URL(window.location);
      url.searchParams.delete('view');
      window.history.pushState({}, '', url);
    }
  }, []);

  // Google Pay Main View: EXACTLY the latest 10 transactions
  const recent10Tx = useMemo(() => {
    const list = activeCard.transactions || [];
    return list.slice(0, 10);
  }, [activeCard]);

  // Google Pay Full View: Aggregate transactions based on selected scope
  const allTxList = useMemo(() => {
    if (allTxCardScope === 'ALL_CARDS') {
      const list = [];
      cards.forEach(c => {
        (c.transactions || []).forEach(tx => {
          list.push({ ...tx, cardTitle: c.title, cardType: c.type });
        });
      });
      return list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    }
    return (activeCard.transactions || []).map(tx => ({
      ...tx,
      cardTitle: activeCard.title,
      cardType: activeCard.type
    }));
  }, [cards, activeCard, allTxCardScope]);

  // Google Pay Full View: Filtered transactions
  const filteredAllTx = useMemo(() => {
    return allTxList.filter(tx => {
      if (allTxTypeFilter === 'PURCHASE' && tx.type !== 'PURCHASE') return false;
      if (allTxTypeFilter === 'PAYMENT' && tx.type !== 'PAYMENT') return false;

      if (allTxMonthFilter !== 'ALL') {
        const txMonth = tx.timestamp ? tx.timestamp.slice(0, 7) : '';
        if (txMonth !== allTxMonthFilter) return false;
      }

      if (allTxSearchQuery.trim()) {
        const q = allTxSearchQuery.trim().toLowerCase();
        const invMatch = (tx.invoiceNo || '').toLowerCase().includes(q);
        const chMatch = (tx.channel || '').toLowerCase().includes(q);
        const amtMatch = (tx.amount?.toFixed(3) || '').includes(q) || String(tx.amount || '').includes(q);
        const cardMatch = (tx.cardTitle || '').toLowerCase().includes(q);
        const itemsMatch = (tx.items || []).some(it =>
          (it.name || '').toLowerCase().includes(q) ||
          (it.nameAr || '').toLowerCase().includes(q)
        );
        if (!invMatch && !chMatch && !amtMatch && !cardMatch && !itemsMatch) return false;
      }

      return true;
    });
  }, [allTxList, allTxTypeFilter, allTxMonthFilter, allTxSearchQuery]);

  // Google Pay Full View: Group by Month Year
  const groupedAllTx = useMemo(() => {
    const groups = {};
    filteredAllTx.forEach(tx => {
      const d = new Date(tx.timestamp);
      const key = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      if (!groups[key]) groups[key] = [];
      groups[key].push(tx);
    });
    return groups;
  }, [filteredAllTx]);

  // Legacy fallback for date picker if still referenced
  const displayedTx = recent10Tx;

  // Promote a transaction into the card
  const handlePromoteTx = (tx) => {
    if (promotedTx?.id === tx.id && activeFocus === 'INVOICE') {
      setActiveFocus('BALANCE');
      setPromotedTx(null);
    } else {
      setPromotedTx(tx);
      setActiveFocus('INVOICE');
    }
  };

  const handleReturnToBalance = () => {
    setActiveFocus('BALANCE');
    setPromotedTx(null);
  };

  // Open BenefitPay Fawri+ modal for specific card or consolidated amount
  const handleTriggerPayment = (amount) => {
    setBenefitAmount(amount);
    setShowBenefitModal(true);
  };

  const localizedCustomerName = useMemo(() => {
    if (lang === 'ar' && customer.nameAr) return customer.nameAr;
    if (lang === 'ml' && customer.nameMl) return customer.nameMl;
    return customer.name;
  }, [customer, lang]);

  return (
    <div className="min-h-screen bg-[#0D0D0D] text-[#FFFAFA] flex flex-col font-sans select-none antialiased relative overflow-hidden">
      {/* ─────────────────────────────────────────────────────────────
          ATMOSPHERIC CYBER-FINTECH GLOW BACKGROUND
          ───────────────────────────────────────────────────────────── */}
      <div className="fixed top-[-10%] left-[-10%] w-[500px] h-[500px] bg-[#0071E3]/08 rounded-full blur-[140px] pointer-events-none" />
      <div className="fixed top-[30%] right-[-15%] w-[450px] h-[450px] bg-[#0071E3]/05 rounded-full blur-[160px] pointer-events-none" />
      <div className="fixed bottom-[-10%] left-[20%] w-[550px] h-[550px] bg-white/[0.02] rounded-full blur-[180px] pointer-events-none" />

      {/* ─────────────────────────────────────────────────────────────
          1. TOP PREVIEW CONTROL BAR (Optional Sandbox Bar for Patrons)
          ───────────────────────────────────────────────────────────── */}
      {showPreviewControls && (
        <header className="w-full bg-[#0D0D0D]/95 border-b border-white/10 px-4 py-2 flex flex-wrap items-center justify-between gap-2.5 z-40 backdrop-blur-2xl shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-[#0071E3] animate-pulse shadow-[0_0_8px_#0071E3]" />
            <span className="text-xs font-black tracking-tight text-[#FFFAFA] flex items-center gap-1.5 font-mono">
              <span className="text-[#0071E3]">⚡</span>
              <span>LAYALI AL-KHARIF WALLET</span>
            </span>
            <span className="text-[10px] bg-[#0071E3]/15 text-[#0071E3] font-bold px-2 py-0.5 rounded-full border border-[#0071E3]/30">
              Preview
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Customer Preset Selector */}
            <div className="flex items-center gap-1 bg-black/60 border border-white/10 p-1 rounded-xl text-xs">
              <span className="text-neutral-400 text-[10px] font-mono px-1">Patron:</span>
              <button
                type="button"
                onClick={() => { setSelectedPresetKey('mohammed'); setActiveCardIndex(0); handleExpandToBig(); }}
                className={`px-2 py-1 rounded-lg text-xs font-bold transition ${selectedPresetKey === 'mohammed' ? 'bg-[#0071E3] text-[#FFFAFA] shadow-sm' : 'text-neutral-400 hover:text-[#FFFAFA]'}`}
              >
                Mohammed (Multi-Card)
              </button>
              <button
                type="button"
                onClick={() => { setSelectedPresetKey('rajesh'); setActiveCardIndex(0); handleExpandToBig(); }}
                className={`px-2 py-1 rounded-lg text-xs font-bold transition ${selectedPresetKey === 'rajesh' ? 'bg-[#0071E3] text-[#FFFAFA] shadow-sm' : 'text-neutral-400 hover:text-[#FFFAFA]'}`}
              >
                Rajesh (Single)
              </button>
              <button
                type="button"
                onClick={() => { setSelectedPresetKey('ali_settled'); setActiveCardIndex(0); handleExpandToBig(); }}
                className={`px-2 py-1 rounded-lg text-xs font-bold transition ${selectedPresetKey === 'ali_settled' ? 'bg-[#0071E3] text-[#FFFAFA] shadow-sm' : 'text-neutral-400 hover:text-[#FFFAFA]'}`}
              >
                Ali (Settled)
              </button>
            </div>

            {/* Viewport Frame Toggle */}
            <button
              type="button"
              onClick={() => setIsPhoneFrame(prev => !prev)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/15 active:scale-95 text-[#FFFAFA] text-xs font-bold rounded-xl transition cursor-pointer border border-white/10"
              title="Toggle between Mobile Bezel Frame and Full Screen View"
            >
              {isPhoneFrame ? (
                <>
                  <Maximize2 className="w-3.5 h-3.5 text-[#0071E3]" />
                  <span>Full-Screen</span>
                </>
              ) : (
                <>
                  <Smartphone className="w-3.5 h-3.5 text-[#0071E3]" />
                  <span>iPhone Bezel</span>
                </>
              )}
            </button>

            {/* Language Switcher */}
            <div className="flex items-center bg-black/60 border border-white/10 p-0.5 rounded-xl text-xs font-bold">
              {['en', 'ar', 'ml'].map(code => (
                <button
                  key={code}
                  type="button"
                  onClick={() => setLang(code)}
                  className={`min-w-6 h-7 px-2 rounded-lg uppercase transition ${lang === code ? 'bg-[#0071E3] text-[#FFFAFA] shadow-sm' : 'text-neutral-400 hover:text-[#FFFAFA]'}`}
                >
                  {code}
                </button>
              ))}
            </div>
          </div>
        </header>
      )}

      {/* ─────────────────────────────────────────────────────────────
          2. VIEWPORT CANVAS (Native Full-Screen Phone Viewport)
          ───────────────────────────────────────────────────────────── */}
      <main className={`w-full flex-1 flex justify-center overflow-hidden ${isPhoneFrame ? 'items-center sm:p-4' : 'h-[100dvh]'}`}>
        <div
          dir={isRtl ? 'rtl' : 'ltr'}
          style={{ fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}
          className={`w-full bg-[#0D0D0D] text-[#FFFAFA] flex flex-col justify-between transition-all duration-300 relative ${isPhoneFrame
            ? 'max-w-[390px] h-[844px] max-h-[92vh] rounded-[48px] border-[8px] border-neutral-900 shadow-[0_30px_90px_rgba(0,0,0,0.95),0_0_0_1px_rgba(255,255,255,0.15)] overflow-hidden ring-1 ring-neutral-800'
            : 'max-w-md h-full'
            }`}
        >
          {/* Simulated Apple Dynamic Island */}
          {isPhoneFrame && (
            <div className="w-full pt-3 pb-1 flex justify-center shrink-0 z-30 select-none pointer-events-none">
              <div className="w-28 h-6 bg-black rounded-full border border-white/10 shadow-inner flex items-center justify-between px-3">
                <span className="w-2.5 h-2.5 rounded-full bg-[#0071E3]/80 animate-pulse" />
                <span className="w-2.5 h-2.5 rounded-full bg-neutral-800" />
              </div>
            </div>
          )}

          {/* Top Floating Notification Alert (The Single Main-Screen Exception) */}
          {liveTxAlert && (
            <aside
              role="status"
              aria-live="polite"
              className="absolute top-14 left-3 right-3 z-40 bg-[#1C1C1E]/95 backdrop-blur-xl border border-[#0071E3]/40 rounded-2xl p-3 shadow-[0_12px_40px_rgba(0,0,0,0.85),0_0_20px_rgba(0,113,227,0.25)] flex items-center justify-between gap-3 animate-in slide-in-from-top-4 duration-300 pointer-events-auto"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-[#0071E3]/20 border border-[#0071E3]/40 flex items-center justify-center shrink-0 text-[#0071E3]">
                  <ShoppingCart className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-mono font-bold uppercase text-[#0071E3] tracking-wider">
                      {lang === 'ar' ? 'إشعار مشتريات فوري' : 'Purchase Notice'}
                    </span>
                    <span className="text-[9px] text-neutral-400 font-mono">
                      {liveTxAlert.invoiceNo}
                    </span>
                  </div>
                  <p className="text-xs font-bold text-white truncate">
                    {lang === 'ar'
                      ? `تم تسجيل قيد جديد بمبلغ BHD ${Number(liveTxAlert.amount).toFixed(3)}`
                      : `New POS purchase: BHD ${Number(liveTxAlert.amount).toFixed(3)}`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => setLiveTxAlert(null)}
                  className="w-6 h-6 rounded-lg bg-white/10 hover:bg-white/15 text-neutral-400 hover:text-white flex items-center justify-center transition cursor-pointer"
                  aria-label="Dismiss alert"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </aside>
          )}

          {/* Conditional View: Dedicated All Transactions vs Main Card Carousel */}
          {activeSubView === 'ALL_TRANSACTIONS' ? (
            /* ═════════════════════════════════════════════════════════
               GOOGLE PAY ALL TRANSACTIONS DEDICATED SUB-PAGE
               ═════════════════════════════════════════════════════════ */
            <>
              {/* ─────────────────────────────────────────────────────────
                  A. ALL TRANSACTIONS APEX HEADER (Google Pay Navigation Bar)
                  ───────────────────────────────────────────────────────── */}
              <div className="px-4 py-3 flex items-center justify-between shrink-0 border-b border-white/[0.08] bg-[#0D0D0D]/95 backdrop-blur-xl z-30">
                <div className="flex items-center gap-2.5 min-w-0">
                  <button
                    type="button"
                    onClick={navigateToMain}
                    className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 flex items-center justify-center text-white transition cursor-pointer shrink-0"
                    title={lang === 'ar' ? 'الرجوع للمحفظة' : 'Back to Wallet'}
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-white tracking-tight leading-tight truncate">
                      {lang === 'ar' ? 'سجل المعاملات' : 'Transactions'}
                    </h3>
                    <span className="text-[10px] text-neutral-400 font-medium block truncate">
                      {allTxCardScope === 'ALL_CARDS'
                        ? (lang === 'ar' ? `جميع البطاقات (${cards.length})` : `All Cards (${cards.length})`)
                        : activeCard.title}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[10px] font-mono font-bold bg-[#0071E3]/20 text-[#0071E3] border border-[#0071E3]/30 px-2 py-0.5 rounded-full">
                    {filteredAllTx.length} {filteredAllTx.length === 1 ? 'item' : 'items'}
                  </span>
                </div>
              </div>

              {/* ─────────────────────────────────────────────────────────
                  B. DEDICATED SCROLLABLE SEARCH & FILTERED TRANSACTION LIST
                  ───────────────────────────────────────────────────────── */}
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3.5 scrollbar-hide">
                {/* 1. Google Pay Search Pill */}
                <div className="relative flex items-center bg-[#161616] hover:bg-[#1C1C1C] focus-within:bg-[#181818] border border-white/15 focus-within:border-[#0071E3] focus-within:ring-2 focus-within:ring-[#0071E3]/25 rounded-full px-3.5 py-2 transition-all shadow-inner">
                  <Search className="w-4 h-4 text-neutral-400 shrink-0 mr-2.5" />
                  <input
                    type="text"
                    value={allTxSearchQuery}
                    onChange={(e) => setAllTxSearchQuery(e.target.value)}
                    placeholder={lang === 'ar' ? 'ابحث برقم الفاتورة أو الصنف أو المبلغ...' : 'Search invoice, item, or amount...'}
                    className="w-full bg-transparent text-xs text-white placeholder-neutral-500 focus:outline-hidden font-medium"
                  />
                  {allTxSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setAllTxSearchQuery('')}
                      className="text-neutral-400 hover:text-white p-0.5 rounded-full hover:bg-white/10 transition shrink-0 ml-1 cursor-pointer"
                      title="Clear search"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* 2. Google Pay Filter Chips */}
                <div className="space-y-2">
                  {/* Primary Type Pills */}
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar text-xs">
                    {[
                      { id: 'ALL', labelEn: 'All', labelAr: 'الكل' },
                      { id: 'PURCHASE', labelEn: 'Bills & Purchases', labelAr: 'الفواتير والمشتريات' },
                      { id: 'PAYMENT', labelEn: 'Fawri+ Payments', labelAr: 'مدفوعات فوري+' }
                    ].map(t => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setAllTxTypeFilter(t.id)}
                        className={`px-3 py-1 rounded-full text-xs font-semibold shrink-0 transition cursor-pointer border ${allTxTypeFilter === t.id
                          ? 'bg-[#0071E3] text-white border-[#0071E3] shadow-xs'
                          : 'bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white border-white/10'
                          }`}
                      >
                        {lang === 'ar' ? t.labelAr : t.labelEn}
                      </button>
                    ))}
                  </div>

                  {/* Secondary Scope and Month Filter Chips */}
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar text-xs">
                    <button
                      type="button"
                      onClick={() => setAllTxCardScope(prev => prev === 'ACTIVE' ? 'ALL_CARDS' : 'ACTIVE')}
                      className={`px-2.5 py-1 rounded-lg text-[11px] shrink-0 transition cursor-pointer border flex items-center gap-1 ${allTxCardScope === 'ALL_CARDS'
                        ? 'bg-purple-600/25 text-purple-200 border-purple-500/40 font-bold'
                        : 'bg-white/5 hover:bg-white/10 text-neutral-400 border-white/10 font-medium'
                        }`}
                    >
                      <Layers className="w-3 h-3" />
                      <span>{allTxCardScope === 'ALL_CARDS' ? 'All Cards Scope' : 'This Card'}</span>
                    </button>

                    {[
                      { id: 'ALL', labelEn: 'All Months', labelAr: 'جميع الأشهر' },
                      { id: '2026-11', labelEn: 'Nov 2026', labelAr: 'نوفمبر 2026' },
                      { id: '2026-10', labelEn: 'Oct 2026', labelAr: 'أكتوبر 2026' }
                    ].map(m => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setAllTxMonthFilter(m.id)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] shrink-0 transition cursor-pointer border ${allTxMonthFilter === m.id
                          ? 'bg-white/20 text-white border-white/40 font-bold'
                          : 'bg-white/5 hover:bg-white/10 text-neutral-400 border-white/10 font-medium'
                          }`}
                      >
                        {lang === 'ar' ? m.labelAr : m.labelEn}
                      </button>
                    ))}

                    {(allTxSearchQuery || allTxTypeFilter !== 'ALL' || allTxCardScope !== 'ACTIVE' || allTxMonthFilter !== 'ALL') && (
                      <button
                        type="button"
                        onClick={() => {
                          setAllTxSearchQuery('');
                          setAllTxTypeFilter('ALL');
                          setAllTxCardScope('ACTIVE');
                          setAllTxMonthFilter('ALL');
                        }}
                        className="px-2 py-0.5 rounded-lg text-[11px] font-bold text-[#0071E3] hover:text-[#47a3ff] hover:underline cursor-pointer shrink-0 ml-auto"
                      >
                        {lang === 'ar' ? 'إعادة ضبط' : 'Reset'}
                      </button>
                    )}
                  </div>
                </div>

                {/* 3. Monthly Grouped Google Pay List */}
                {Object.keys(groupedAllTx).length > 0 ? (
                  <div className="space-y-4">
                    {Object.entries(groupedAllTx).map(([monthYear, txList]) => {
                      const monthPurchasesTotal = txList
                        .filter(t => t.type === 'PURCHASE')
                        .reduce((sum, t) => sum + (t.amount || 0), 0);

                      return (
                        <div key={monthYear} className="space-y-2">
                          {/* Month Group Header */}
                          <div className="flex items-center justify-between px-1">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 font-mono">
                              {monthYear}
                            </span>
                            <span className="text-[10px] text-neutral-500 font-mono">
                              {txList.length} tx • BD {monthPurchasesTotal.toFixed(3)}
                            </span>
                          </div>

                          {/* Google Pay Inset Table Rows */}
                          <div className="rounded-2xl bg-[#141414]/90 backdrop-blur-xl border border-white/10 overflow-hidden divide-y divide-white/[0.06] shadow-lg">
                            {txList.map(tx => {
                              const isPurchase = tx.type === 'PURCHASE';
                              return (
                                <div
                                  key={tx.id}
                                  onClick={() => handlePromoteTx(tx)}
                                  className="p-3 transition-all cursor-pointer flex items-center justify-between gap-3 hover:bg-white/[0.04] active:bg-white/[0.08]"
                                >
                                  <div className="flex items-center gap-3 min-w-0">
                                    {/* Circular Avatar */}
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 border ${isPurchase
                                      ? 'bg-[#0071E3]/15 text-[#0071E3] border-[#0071E3]/25'
                                      : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25'
                                      }`}>
                                      {isPurchase ? <ShoppingBag className="w-4 h-4" /> : <CreditCard className="w-4 h-4" />}
                                    </div>

                                    <div className="min-w-0">
                                      <div className="text-xs font-bold text-white truncate flex items-center gap-1.5">
                                        <span className="font-mono">{isPurchase ? `#${tx.invoiceNo}` : (tx.channel || 'BenefitPay Fawri+')}</span>
                                        {allTxCardScope === 'ALL_CARDS' && tx.cardTitle && (
                                          <span className="text-[9px] bg-white/10 text-neutral-300 px-1.5 py-0.2 rounded font-normal font-sans">
                                            {tx.cardTitle}
                                          </span>
                                        )}
                                      </div>
                                      <div className="text-[11px] text-neutral-400 flex items-center gap-1.5 mt-0.5 font-medium truncate">
                                        <span>
                                          {new Date(tx.timestamp).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                        {isPurchase && tx.itemCount && (
                                          <>
                                            <span>•</span>
                                            <span>{tx.itemCount} items</span>
                                          </>
                                        )}
                                      </div>
                                    </div>
                                  </div>

                                  <div className="text-right shrink-0">
                                    <span className={`text-xs font-bold font-mono block tabular-nums ${isPurchase ? 'text-white' : 'text-emerald-400'
                                      }`}>
                                      {isPurchase ? `BD ${tx.amount.toFixed(3)}` : `+BD ${Math.abs(tx.amount).toFixed(3)}`}
                                    </span>
                                    <span className="text-[10px] text-neutral-500 font-medium block">
                                      {isPurchase ? 'Debit' : 'Completed'}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-8 text-center space-y-3 bg-[#141414]/50 border border-white/5 rounded-2xl">
                    <Search className="w-8 h-8 text-neutral-600 mx-auto" />
                    <div>
                      <p className="text-sm font-bold text-neutral-200">
                        {lang === 'ar' ? 'لا توجد معاملات مطابقة' : 'No transactions found'}
                      </p>
                      <p className="text-xs text-neutral-400 mt-1">
                        {allTxSearchQuery
                          ? `No results matching "${allTxSearchQuery}" with current filters.`
                          : 'No transactions found under current filter criteria.'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setAllTxSearchQuery('');
                        setAllTxTypeFilter('ALL');
                        setAllTxCardScope('ACTIVE');
                        setAllTxMonthFilter('ALL');
                      }}
                      className="px-4 py-2 bg-white/10 hover:bg-white/15 text-white font-bold rounded-xl text-xs transition cursor-pointer"
                    >
                      {lang === 'ar' ? 'إعادة ضبط عوامل التصفية' : 'Reset All Filters'}
                    </button>
                  </div>
                )}

                {/* Bottom padding */}
                <div className="h-20" />
              </div>

              {/* ─────────────────────────────────────────────────────────
                  C. ALL TRANSACTIONS BOTTOM DOCK
                  ───────────────────────────────────────────────────────── */}
              <div className="p-3.5 bg-[#0D0D0D]/95 border-t border-white/[0.08] shrink-0 backdrop-blur-2xl z-20 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={navigateToMain}
                  className="flex-1 py-2.5 px-4 bg-white/10 hover:bg-white/15 active:scale-[0.98] text-white font-semibold text-xs rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer border border-white/10"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>{lang === 'ar' ? 'الرجوع للمحفظة' : 'Back to Wallet'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleTriggerPayment(activeCard.balance)}
                  className="flex-1 py-2.5 px-4 bg-[#0071E3] hover:bg-[#0077ED] active:scale-[0.98] text-white font-semibold text-xs rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer shadow-md"
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>{lang === 'ar' ? 'السداد عبر فوري+' : `Settle Fawri+`}</span>
                </button>
              </div>
            </>
          ) : (
            /* ═════════════════════════════════════════════════════════
               MAIN WALLET CAROUSEL + RECENT ACTIVITY (10 ITEMS)
               ═════════════════════════════════════════════════════════ */
            <>
              {/* ─────────────────────────────────────────────────────────
                  3. EXECUTIVE NET POSITION & BRAND APEX BAR
                  ───────────────────────────────────────────────────────── */}
              <div className="px-4 py-2.5 flex items-center justify-between shrink-0 border-b border-white/[0.06] bg-[#0D0D0D]/95 backdrop-blur-xl z-30">
                <div className="flex items-center gap-2 min-w-0">
                  {/* Hamburger Drawer Button */}
                  <button
                    type="button"
                    onPointerDown={() => setIsDrawerOpen(true)}
                    onClick={() => setIsDrawerOpen(true)}
                    className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 active:scale-95 border border-white/10 flex items-center justify-center text-neutral-300 hover:text-white transition cursor-pointer shrink-0 touch-manipulation select-none"
                    aria-label="Open Menu"
                    title="Menu & Store Settings"
                  >
                    <Menu className="w-4 h-4" />
                  </button>

                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-xs font-black tracking-tight text-[#FFFAFA] uppercase block leading-none font-mono truncate">
                      LAYALI <span className="text-[#0071E3]">AL-KHARIF</span>
                    </span>
                    <span className="text-[8px] font-mono uppercase bg-white/10 text-[#FFFAFA] px-1.5 py-0.5 rounded font-bold shrink-0">
                      CBB V1.4
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {/* Sandbox Controls Toggle */}
                  <button
                    type="button"
                    onClick={() => setShowPreviewControls(prev => !prev)}
                    className={`w-8 h-8 rounded-xl border flex items-center justify-center transition cursor-pointer active:scale-95 ${showPreviewControls
                      ? 'bg-[#0071E3]/20 border-[#0071E3]/40 text-[#0071E3]'
                      : 'bg-white/5 hover:bg-white/10 border-white/10 text-neutral-400 hover:text-[#FFFAFA]'
                      }`}
                    title="Toggle Sandbox Controls (Patron / Languages)"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                  </button>

                  {/* Camp Privacy Mode */}
                  <button
                    type="button"
                    onClick={() => setHideBalance(prev => !prev)}
                    className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-neutral-400 hover:text-[#FFFAFA] transition cursor-pointer active:scale-95"
                    title="Camp Privacy Mode"
                  >
                    {hideBalance ? <EyeOff className="w-3.5 h-3.5 text-[#0071E3]" /> : <Eye className="w-3.5 h-3.5 text-neutral-400" />}
                  </button>

                  {/* Digital POS Pass QR Button */}
                  <button
                    type="button"
                    onClick={() => setShowPassModal(true)}
                    className="w-8 h-8 rounded-xl bg-[#0071E3]/15 hover:bg-[#0071E3]/25 border border-[#0071E3]/30 flex items-center justify-center text-[#0071E3] transition cursor-pointer active:scale-95"
                    title="Digital POS Counter Pass"
                  >
                    <QrCode className="w-3.5 h-3.5" />
                  </button>

                  {/* Reset to Big Deck */}
                  <button
                    type="button"
                    onClick={handleExpandToBig}
                    className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-neutral-400 hover:text-[#FFFAFA] transition cursor-pointer active:scale-95"
                    title="Reset to 3D Card Deck"
                  >
                    <RotateCw className="w-3.5 h-3.5 text-[#0071E3]" />
                  </button>
                </div>
              </div>

              {/* ─────────────────────────────────────────────────────────
              4. UNINHIBITED SCROLL CONTAINER
              ───────────────────────────────────────────────────────── */}
              <div
                ref={scrollContainerRef}
                onScroll={handleScroll}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                className="flex-1 overflow-y-auto px-3.5 py-2 scrollbar-hide relative"
                style={{
                  overflowAnchor: 'none',
                  WebkitOverflowScrolling: 'touch',
                  touchAction: 'pan-y',
                  overscrollBehaviorY: 'contain'
                }}
              >
                <div className="flex flex-col space-y-3.5 pb-28">
                  {/* ═════════════════════════════════════════════════════
                  B. THE PERSISTENT SINGLE-DOM MULTI-CARD SECTION
                  (WAI-ARIA Carousel Pattern • Natural Scroll)
                  ═════════════════════════════════════════════════════ */}
                  <div
                    role="group"
                    aria-roledescription="carousel"
                    aria-label={lang === 'ar' ? 'بطاقات حسابات العميل' : 'Customer Account Cards'}
                    tabIndex={0}
                    onKeyDown={handleCarouselKeyDown}
                    className="relative w-full flex items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-[#0071E3]/60 rounded-[32px]"
                  >
                    {/* Volumetric Radial Spotlight Shader behind active card */}
                    <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-[340px] h-[340px] bg-[radial-gradient(circle,rgba(0,113,227,0.24)_0%,rgba(0,113,227,0.06)_50%,transparent_75%)] blur-2xl pointer-events-none -z-10" />
                    {/* Screen Reader Live Region Announcer (WCAG 2.2 AA) */}
                    <div className="sr-only" aria-live="polite" aria-atomic="true">
                      {`Card ${activeCardIndex + 1} of ${cards.length}: ${activeCard.title}. Current balance: Bahraini Dinar ${Number(activeCard.balance).toFixed(3)}`}
                    </div>

                    {/* 1. Peeking Previous Card (Left Edge when on Card 1 or 2) */}
                    {hasPrev && prevCard && (
                      <div
                        onClick={(e) => { e.stopPropagation(); handleSlideCard('PREV'); }}
                        className={`absolute left-0 top-0 bottom-0 rounded-r-[28px] sm:rounded-r-[32px] border-y border-r bg-gradient-to-b cursor-pointer z-25 shadow-2xl flex items-center justify-center group active:scale-95 transition-all duration-300 ease-out overflow-hidden ${isCompact ? 'opacity-0 scale-75 pointer-events-none' : 'opacity-100'
                          }`}
                        style={{
                          width: cardDragX > 0 ? `${Math.min(38, 22 + cardDragX * 0.25)}px` : '22px',
                          transform: cardDragX > 0 ? `scale(${Math.min(1.04, 1 + cardDragX * 0.001)})` : 'scale(1)',
                          background: 'linear-gradient(to bottom, #1C1C1C, #0D0D0D)',
                          borderColor: 'rgba(0,113,227,0.3)',
                          boxShadow: '10px 0 30px rgba(0,0,0,0.85), 0 10px 25px rgba(0,113,227,0.22), inset -1px 0 1px rgba(255,255,255,0.25)'
                        }}
                        title={`Swipe back to ${prevCard.title}`}
                      >
                        <div className="absolute inset-y-0 right-0 w-px bg-gradient-to-b from-white/40 via-white/10 to-transparent pointer-events-none" />
                        <div className="w-1 h-12 rounded-full bg-white/40 group-hover:bg-white/70 transition shadow-xs" />
                      </div>
                    )}

                    {/* 2. Main Active Card (With Dynamic Offset for Peeking Edge) */}
                    <section
                      role="group"
                      aria-roledescription="slide"
                      aria-label={`Card ${activeCardIndex + 1} of ${cards.length}: ${activeCard.title}, Balance BHD ${Number(activeCard.balance).toFixed(3)}`}
                      onTouchStart={handleCardTouchStart}
                      onTouchMove={handleCardTouchMove}
                      onTouchEnd={handleCardTouchEnd}
                      onMouseDown={handleCardMouseDown}
                      onMouseMove={handleCardMouseMove}
                      onMouseUp={handleCardMouseUp}
                      onMouseLeave={handleCardMouseLeave}
                      onClick={(e) => { if (isCompact) handleExpandToBig(); }}
                      style={{
                        transition: isDraggingCard
                          ? 'none'
                          : 'height 380ms cubic-bezier(0.22, 1, 0.36, 1), border-radius 380ms cubic-bezier(0.22, 1, 0.36, 1), padding 380ms cubic-bezier(0.22, 1, 0.36, 1), width 380ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 380ms cubic-bezier(0.22, 1, 0.36, 1), transform 320ms cubic-bezier(0.22, 1, 0.36, 1), opacity 260ms ease-out',
                        transform: isCompact ? 'translate3d(0, 0, 0)' : cardSlideTransform.transform,
                        opacity: isCompact ? 1 : cardSlideTransform.opacity,
                        willChange: 'height, border-radius, width, transform',
                        backfaceVisibility: 'hidden',
                        WebkitBackfaceVisibility: 'hidden'
                      }}
                      className={`overflow-hidden backdrop-blur-2xl border relative z-20 ${isCompact
                        ? 'w-full h-[132px] rounded-2xl bg-[#090D18]/95 border-white/20 shadow-[0_20px_45px_rgba(0,0,0,0.85)] p-3 cursor-pointer'
                        : `h-[475px] rounded-[32px] bg-gradient-to-b ${activeCard.gradient} ${activeCard.borderGlow} p-5 flex flex-col justify-between cursor-grab active:cursor-grabbing select-none ${cards.length > 1
                          ? 'w-[calc(100%-24px)] mx-auto'
                          : 'w-full'
                        }`
                        }`}
                    >
                      {/* Specular Laser Edge Highlight & Chamfer Ring */}
                      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent pointer-events-none" />
                      <div className="absolute inset-0 rounded-[inherit] ring-1 ring-inset ring-white/10 pointer-events-none" />

                      {/* ─────────────────────────────────────────────────────
                    COMPACT VIEW HEADER ROW (When Shrunk on Scroll)
                    ───────────────────────────────────────────────────── */}
                      <div
                        onClick={() => { if (isCompact) handleExpandToBig(); }}
                        className={`flex items-center justify-between gap-2 shrink-0 ${isCompact ? 'cursor-pointer active:opacity-85' : ''}`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-8 h-8 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center text-[#0071E3] font-bold text-xs shrink-0 shadow-inner">
                            {activeCard.type === 'MESS' ? <Users className="w-4 h-4 text-white" /> : <User className="w-4 h-4 text-[#0071E3]" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <h3 className={`font-black text-[#FFFAFA] leading-snug transition-all duration-200 ${isCompact ? 'text-xs' : 'text-base sm:text-lg'}`}>
                              {localizedCustomerName}
                            </h3>
                            <span className="text-[11px] text-neutral-400 font-medium block mt-0.5">
                              {activeCard.title}
                            </span>
                          </div>
                        </div>

                        {/* Compact Balance Display */}
                        <div className={`text-right shrink-0 transition-all duration-300 ease-out ${isCompact ? 'opacity-100 translate-x-0 scale-100' : 'opacity-0 translate-x-3 scale-90 pointer-events-none'}`}>
                          <span className="text-[8px] uppercase tracking-wider text-neutral-400 block font-bold leading-none mb-0.5">
                            {activeCard.type === 'MESS' ? 'My Share' : 'Personal Balance'}
                          </span>
                          <span className="text-base font-black font-mono leading-none tabular-nums text-[#FFFAFA]">
                            {hideBalance ? '••••••' : `BD ${Number(activeCard.balance).toFixed(3)}`}
                          </span>
                        </div>
                      </div>

                      {/* ─────────────────────────────────────────────────────
                    EXPANDED 3D PHYSICAL CARD HERO (3D FLIPPER SCENE)
                    ───────────────────────────────────────────────────── */}
                      <div
                        className={`flex-1 relative transition-all duration-350 ease-out ${isCompact
                          ? 'opacity-0 -translate-y-4 max-h-0 py-0 pointer-events-none overflow-hidden scale-95'
                          : 'opacity-100 translate-y-0 py-1 scale-100'
                          }`}
                        style={{
                          perspective: '1200px',
                          transition: 'opacity 250ms ease-out, transform 350ms cubic-bezier(0.22, 1, 0.36, 1), max-height 380ms cubic-bezier(0.22, 1, 0.36, 1)'
                        }}
                      >
                        <div
                          className="relative w-full h-full flex flex-col justify-between transition-transform duration-500 ease-out"
                          style={{
                            transformStyle: 'preserve-3d',
                            transform: isCardFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)'
                          }}
                        >
                          {/* ═════════════════════════════════════════════════════
                            A. FRONT FACE: CLEAN BALANCE, STATUS & CAROUSEL
                            ═════════════════════════════════════════════════════ */}
                          <div
                            className="w-full h-full flex flex-col justify-between"
                            style={{
                              backfaceVisibility: 'hidden',
                              WebkitBackfaceVisibility: 'hidden'
                            }}
                          >
                            {/* Top Action Row: Clean Card Tier Label & Flip QR Button */}
                            <div className="flex items-center justify-between pt-1">
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold font-mono tracking-wider uppercase text-neutral-400">
                                  {activeCard.type === 'MASTER' ? (lang === 'ar' ? 'الإجمالي وتقسيم الميس' : 'TOTAL & MESS SPLIT') : activeCard.type === 'MESS' ? (lang === 'ar' ? 'حساب ميس' : 'MESS ACCOUNT') : (lang === 'ar' ? 'الائتمان الأساسي' : 'PRIMARY CREDIT')}
                                </span>
                                {isCurrentCardFrozen && (
                                  <span className="text-[9px] font-mono font-bold uppercase bg-rose-500/20 text-rose-300 border border-rose-500/40 px-2 py-0.5 rounded-full flex items-center gap-1 animate-pulse">
                                    <Lock className="w-2.5 h-2.5" />
                                    <span>{lang === 'ar' ? 'مجمّد' : 'FROZEN'}</span>
                                  </span>
                                )}
                              </div>

                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); handleToggleCardFlip(); }}
                                className="px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 text-[#FFFAFA] border border-white/15 flex items-center gap-1.5 text-xs font-bold transition cursor-pointer shadow-xs"
                                title="Flip Card for POS QR Scanner"
                              >
                                <QrCode className="w-3.5 h-3.5 text-[#0071E3]" />
                                <span>{lang === 'ar' ? 'قلب للباركود' : 'Flip QR'}</span>
                              </button>
                            </div>

                            {/* Big Live Balance Centerpiece */}
                            <div className="py-1">
                              <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="w-1.5 h-3 rounded-full bg-[#0071E3]" />
                                  <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-300">
                                    {activeCard.type === 'MESS'
                                      ? (lang === 'ar' ? 'حصتك الفردية في الميس' : 'Your Individual Mess Share')
                                      : (lang === 'ar' ? 'رصيد الحساب الشخصي المستحق' : 'Personal Outstanding Balance')}
                                  </span>
                                </div>
                                {activeCard.type === 'MESS' && (
                                  <span className="text-[10.5px] font-mono font-bold text-[#FFFAFA] tracking-wide">
                                    Room Total: BHD {activeCard.roomTotal?.toFixed(3)}
                                  </span>
                                )}
                              </div>

                              <div className="flex items-baseline gap-2 mt-0.5">
                                <span className="text-[11px] font-mono font-bold tracking-widest text-[#FFFAFA] uppercase bg-white/[0.08] border border-white/10 px-2 py-0.5 rounded-md shadow-xs">
                                  BHD
                                </span>
                                <span className="text-4xl sm:text-5xl font-black font-mono tracking-tight tabular-nums text-[#FFFAFA]">
                                  {hideBalance ? '••••••' : Number(activeCard.balance).toFixed(3)}
                                </span>
                              </div>

                              {/* MASTER CARD DEDICATED MESS SPLIT BREAKDOWN WITH #FF9900 PERSONAL ACCENT */}
                              {activeCard.type === 'MASTER' ? (
                                <div className="mt-2 space-y-1.5">
                                  <div className="flex items-center justify-between text-[11px] font-mono font-bold">
                                    <div className="flex items-center gap-1">
                                      <span className="text-[#FF9900] font-medium">{lang === 'ar' ? 'شخصي' : 'Personal'}:</span>
                                      <span className="text-[#FFFAFA] tabular-nums font-bold">BD {hideBalance ? '•••' : (activeCard.personalBalance || 45.2).toFixed(3)}</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <span className="text-[#0071E3] font-medium">{lang === 'ar' ? 'الميس' : 'Mess Split'}:</span>
                                      <span className="text-[#0071E3] tabular-nums font-bold">BD {hideBalance ? '•••' : (activeCard.messBalance || 42.725).toFixed(3)}</span>
                                    </div>
                                  </div>

                                  {/* Dual Proportion Splitting Line: Personal Share colored #FF9900 */}
                                  <div className="w-full bg-black/60 h-2 rounded-full overflow-hidden flex border border-white/10">
                                    <div
                                      className="h-full bg-[#FF9900] rounded-l-full shadow-[0_0_8px_rgba(255,153,0,0.6)] transition-all duration-500"
                                      style={{ width: `${Math.round(((activeCard.personalBalance || 45.2) / (activeCard.balance || 87.925)) * 100)}%` }}
                                      title="Personal Share (#FF9900)"
                                    />
                                    <div
                                      className="h-full bg-[#0071E3] rounded-r-full shadow-[0_0_8px_rgba(0,113,227,0.5)] transition-all duration-500"
                                      style={{ width: `${Math.round(((activeCard.messBalance || 42.725) / (activeCard.balance || 87.925)) * 100)}%` }}
                                      title="Mess Split Share (#0071E3)"
                                    />
                                  </div>
                                </div>
                              ) : (
                                <>
                                  {/* Standard Credit Limit / Settlement Gauge */}
                                  <div className="w-full bg-black/60 h-1.5 rounded-full mt-2 overflow-hidden border border-white/5">
                                    <div
                                      className="h-full rounded-full transition-all duration-500 bg-[#0071E3]"
                                      style={{
                                        width: activeCard.type === 'MESS'
                                          ? `${Math.min(100, ((activeCard.membersPaid || 1) / (activeCard.membersCount || 1)) * 100)}%`
                                          : `${Math.min(100, (activeCard.balance / (activeCard.creditLimit || 100)) * 100)}%`
                                      }}
                                    />
                                  </div>
                                  <div className="flex justify-between items-center text-[9px] text-neutral-400 font-mono mt-1">
                                    <span>
                                      {activeCard.type === 'MESS'
                                        ? `${activeCard.membersPaid || 0} of ${activeCard.membersCount || 0} roommates settled`
                                        : `Limit: BHD ${activeCard.creditLimit?.toFixed(3)}`}
                                    </span>
                                    <span>
                                      {activeCard.type === 'MESS'
                                        ? `Split in ${activeCard.membersCount || 1} shares`
                                        : `${Math.round((activeCard.balance / (activeCard.creditLimit || 100)) * 100)}% utilized`}
                                    </span>
                                  </div>
                                </>
                              )}
                            </div>

                            {/* ─────────────────────────────────────────────────
                          MINIMALIST OPTICAL 3-DOT CAROUSEL IDENTIFICATION
                          (Pure swipe gesture navigation - perfectly aligned)
                          ───────────────────────────────────────────────── */}
                            <div className="flex items-center justify-center gap-1 py-1.5 select-none" role="tablist" aria-label="Card pagination">
                              {cards.map((c, idx) => {
                                const isActive = activeCardIndex === idx;
                                return (
                                  <button
                                    key={c.id}
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (idx !== activeCardIndex) {
                                        handleSlideCard(idx);
                                      }
                                    }}
                                    className="py-2 px-1 flex items-center justify-center transition-all cursor-pointer border-0 bg-transparent group"
                                    title={c.title}
                                    aria-label={`Go to card ${idx + 1}: ${c.title}`}
                                    aria-selected={isActive}
                                    role="tab"
                                  >
                                    <span className={`block w-2 h-2 rounded-full transition-all duration-300 ease-out ${isActive
                                      ? 'bg-[#0071E3] shadow-[0_0_8px_#0071E3]'
                                      : 'bg-white/25 group-hover:bg-white/45'
                                      }`} />
                                  </button>
                                );
                              })}
                            </div>

                            {/* ─────────────────────────────────────────────────
                          FRONT ACTION ROW: PAY & SPLIT
                          ───────────────────────────────────────────────── */}
                            <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/10 shrink-0">

                              {/* Pay Button - Prominently expanded (Primary Action Button in #0071E3) */}
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); handleTriggerPayment(activeCard.balance); }}
                                className="flex-1 min-h-[42px] px-6 py-2.5 rounded-full font-semibold text-xs sm:text-[13px] tracking-[-0.01em] flex items-center justify-center gap-2 bg-[#0071E3] hover:bg-[#0077ED] active:bg-[#0062C4] active:scale-[0.97] text-[#FFFAFA] transition-all duration-200 cursor-pointer border-t border-white/25 shadow-[0_4px_16px_rgba(0,113,227,0.38)] hover:shadow-[0_6px_22px_rgba(0,113,227,0.48)] focus-visible:ring-2 focus-visible:ring-[#0071E3] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0D0D0D]"
                              >
                                <CreditCard className="w-4 h-4 text-[#FFFAFA]" />
                                <span>{activeCard.type === 'MASTER' ? (lang === 'ar' ? 'سداد المجموع بالكامل • فوري+' : 'Settle Total Balance • Fawri+') : (lang === 'ar' ? 'سداد فوري (Fawri+)' : 'Pay Fawri+')}</span>
                              </button>

                              {/* Roommate Split Button on Mess Cards */}
                              {activeCard.type === 'MESS' && (
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); setShowRoommateModal(true); }}
                                  className="min-h-[42px] px-5 py-2.5 rounded-full bg-white/10 hover:bg-white/15 text-[#FFFAFA] border border-white/15 font-semibold text-xs tracking-[-0.01em] flex items-center gap-1.5 transition-all duration-200 active:scale-[0.97] cursor-pointer shrink-0"
                                >
                                  <Users className="w-4 h-4 text-[#FFFAFA]" />
                                  <span>{lang === 'ar' ? 'تقسيم' : 'Split'}</span>
                                </button>
                              )}
                            </div>
                          </div>

                          {/* ═════════════════════════════════════════════════════
                        B. BACK FACE: 3D FLIPPED CASHIER QR & BEACON PASS
                        ═════════════════════════════════════════════════════ */}
                          <div
                            className="absolute inset-0 w-full h-full flex flex-col justify-between"
                            style={{
                              backfaceVisibility: 'hidden',
                              WebkitBackfaceVisibility: 'hidden',
                              transform: 'rotateY(180deg)'
                            }}
                          >
                            {/* Magnetic Credit Hologram Stripe */}
                            <div className="w-full h-8 bg-gradient-to-r from-neutral-900 via-black to-neutral-900 border-y border-white/10 rounded-xl shrink-0 shadow-inner" />

                            {/* Counter Beacon Header & Flip Back Action */}
                            <div className="flex items-center justify-between pt-1">
                              <div>
                                <span className="text-xs font-black text-[#FFFAFA] uppercase tracking-wider block font-mono">
                                  {isCounterActive
                                    ? (lang === 'ar' ? 'جاهز للمسح عند الكاشير' : 'COUNTER SCANNER ACTIVE')
                                    : (lang === 'ar' ? 'رمز مسح بطاقة الائتمان' : 'OFFICIAL CREDIT QR PASS')}
                                </span>
                                <span className="text-[9px] text-neutral-400 font-mono">
                                  Station #01 Ready • Instant 0.1s Scan
                                </span>
                              </div>

                              <div className="flex items-center gap-2">
                                {isCounterActive && (
                                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#0071E3]/20 border border-[#0071E3]/40 text-[#0071E3] font-mono text-[10px] font-bold shadow-xs">
                                    <Clock className="w-3 h-3 text-[#0071E3] animate-spin" />
                                    <span>{counterSecondsLeft}s</span>
                                  </div>
                                )}
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); handleToggleCardFlip(); }}
                                  className="px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 text-[#FFFAFA] border border-white/15 flex items-center gap-1.5 text-xs font-bold transition cursor-pointer shadow-xs"
                                  title="Flip Back to Balance"
                                >
                                  <RotateCw className="w-3.5 h-3.5 text-[#0071E3]" />
                                  <span>{lang === 'ar' ? 'الرجوع للرصيد' : 'Flip Back'}</span>
                                </button>
                              </div>
                            </div>

                            {/* High-Contrast Optical QR Code Centerpiece */}
                            <div className="flex flex-col items-center justify-center my-auto py-1">
                              <div className="bg-white p-3 rounded-2xl shadow-[0_0_35px_rgba(0,113,227,0.35)] border-2 border-[#0071E3]">
                                <QrCode className="w-28 h-28 sm:w-32 sm:h-32 text-black" />
                              </div>

                              {/* ⚡ "I'M AT COUNTER" ACTION BUTTON RIGHT NEAR THE QR CODE */}
                              <div className="w-full max-w-xs mt-3 px-2">
                                {!isCounterActive ? (
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); handleTriggerCounterMode(); }}
                                    className="w-full py-2 px-3 rounded-xl bg-[#0071E3] hover:bg-[#0077ED] active:scale-95 text-[#FFFAFA] font-black text-xs flex items-center justify-center gap-2 transition shadow-lg shadow-[#0071E3]/30 cursor-pointer"
                                    title="Alert Layali Cashier Counter"
                                  >
                                    <Zap className="w-4 h-4 text-[#FFFAFA] fill-[#FFFAFA]" />
                                    <span>{lang === 'ar' ? '⚡ أنا عند الكاشير (تفعيل 90 ثانية)' : "⚡ I'm At Counter (Beacon 90s)"}</span>
                                  </button>
                                ) : (
                                  <div className="w-full flex items-center justify-between gap-2 bg-[#0071E3]/20 border border-[#0071E3]/40 rounded-xl px-3 py-1.5 shadow-md">
                                    <div className="flex items-center gap-2">
                                      <span className="w-2.5 h-2.5 rounded-full bg-[#0071E3] animate-ping" />
                                      <span className="text-xs font-black text-[#0071E3] font-mono">
                                        {lang === 'ar' ? `● نشط عند الكاشير: ${counterSecondsLeft}ث` : `● Active at POS: ${counterSecondsLeft}s`}
                                      </span>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); handleDismissCounterMode(); }}
                                      className="py-1 px-2.5 rounded-lg bg-[#0071E3] hover:bg-[#0077ED] text-[#FFFAFA] font-bold text-[10px] flex items-center gap-1 transition active:scale-95 cursor-pointer shadow-xs"
                                    >
                                      <CheckCircle2 className="w-3 h-3" />
                                      <span>{lang === 'ar' ? 'تم المسح' : 'Done'}</span>
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* ─────────────────────────────────────────────────────
                    COMPACT VIEW ACTIONS BAR (When Shrunk on Scroll)
                    ───────────────────────────────────────────────────── */}
                      <div
                        className={`transition-all duration-350 ease-out ${isCompact
                          ? 'opacity-100 translate-y-0 max-h-16 pt-1 border-t border-white/10'
                          : 'opacity-0 translate-y-2 max-h-0 pointer-events-none overflow-hidden border-transparent'
                          }`}
                      >
                        <div className="flex items-center justify-between gap-2 shrink-0">
                          {/* Compact Mode Card Switcher Pill */}
                          {cards.length > 1 && (
                            <div className="flex items-center gap-1 bg-black/60 border border-white/10 p-0.5 rounded-xl shrink-0">
                              {cards.map((c, idx) => (
                                <button
                                  key={c.id}
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); setActiveCardIndex(idx); }}
                                  className={`px-2 py-1 rounded-lg text-[10px] font-bold transition font-mono ${activeCardIndex === idx
                                    ? 'bg-[#0071E3] text-[#FFFAFA] shadow-xs'
                                    : 'text-neutral-400 hover:text-[#FFFAFA]'
                                    }`}
                                >
                                  {c.type === 'MASTER' ? 'TOTAL' : c.type === 'PERSONAL' ? 'P' : `M${idx}`}
                                </button>
                              ))}
                            </div>
                          )}

                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); handleTriggerCounterMode(); handleExpandToBig(); }}
                              className="px-2.5 py-1.5 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold font-mono flex items-center gap-1 active:scale-95 cursor-pointer"
                            >
                              <Zap className="w-3 h-3 text-amber-400 fill-amber-400" />
                              <span>Counter</span>
                            </button>

                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); handleExpandToBig(); }}
                              className="px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-[#FFFAFA] border border-white/10 text-[10px] font-bold flex items-center gap-1 active:scale-95 cursor-pointer"
                            >
                              <Maximize2 className="w-3 h-3 text-[#0071E3]" />
                              <span>Expand</span>
                            </button>
                          </div>
                        </div>

                        {/* Subtle Pull-Down Bar Affordance */}
                        <div
                          onClick={(e) => { e.stopPropagation(); handleExpandToBig(); }}
                          className="w-8 h-1 rounded-full bg-white/20 mx-auto mt-1 cursor-pointer hover:bg-white/40 transition"
                          title="Pull down to expand card"
                        />
                      </div>

                      {/* ─────────────────────────────────────────────────────
                    BOTTOM DETAILS (Static Scroll Down Indicator - View Only)
                    ───────────────────────────────────────────────────── */}
                      <div className={`transition-all duration-350 ease-out overflow-hidden ${isCompact ? 'opacity-0 -translate-y-2 max-h-0 pt-0 pointer-events-none' : 'opacity-100 translate-y-0 max-h-24 pt-2'
                        }`}>
                        <div
                          className="flex flex-col items-center justify-center gap-0.5 text-neutral-400 select-none pointer-events-none pt-1"
                        >
                          <span className="text-[10px] font-bold tracking-wider uppercase text-neutral-400 flex items-center gap-1">
                            {lang === 'ar' ? 'الفواتير' : 'Bills'}
                          </span>
                          <ChevronDown className="w-3.5 h-3.5 text-[#0071E3]" />
                        </div>
                      </div>
                    </section>

                    {/* 3. Peeking Next Card (Right Edge - Essential Swipe Signifier) */}
                    {hasNext && nextCard && (
                      <div
                        onClick={(e) => { e.stopPropagation(); handleSlideCard('NEXT'); }}
                        className={`absolute right-0 top-0 bottom-0 rounded-l-[28px] sm:rounded-l-[32px] border-y border-l bg-gradient-to-b cursor-pointer z-25 shadow-2xl flex items-center justify-center group active:scale-95 transition-all duration-300 ease-out overflow-hidden ${isCompact ? 'opacity-0 scale-75 pointer-events-none' : 'opacity-100'
                          }`}
                        style={{
                          width: cardDragX < 0 ? `${Math.min(38, 22 + Math.abs(cardDragX) * 0.25)}px` : '22px',
                          transform: cardDragX < 0 ? `scale(${Math.min(1.04, 1 + Math.abs(cardDragX) * 0.001)})` : 'scale(1)',
                          background: 'linear-gradient(to bottom, #1C1C1C, #0D0D0D)',
                          borderColor: 'rgba(0,113,227,0.3)',
                          boxShadow: '-10px 0 30px rgba(0,0,0,0.85), 0 10px 25px rgba(0,113,227,0.22), inset 1px 0 1px rgba(255,255,255,0.25)'
                        }}
                        title={`Swipe to ${nextCard.title}`}
                      >
                        <div className="absolute inset-y-0 left-0 w-px bg-gradient-to-b from-white/40 via-white/10 to-transparent pointer-events-none" />
                        <div className="w-1 h-12 rounded-full bg-white/40 group-hover:bg-white/70 transition shadow-xs" />
                      </div>
                    )}
                  </div>

                  {/* ─────────────────────────────────────────────────────
                  FLIP BACK TO BALANCE ACTION (Under Personal Credit Card Section)
                  ───────────────────────────────────────────────────── */}
                  {isCardFlipped && (
                    <div className="pt-2.5 pb-0.5 px-2">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleToggleCardFlip(); }}
                        className="w-full py-2.5 px-4 rounded-full bg-white/10 hover:bg-white/20 active:scale-[0.98] text-[#FFFAFA] font-bold text-xs flex items-center justify-center gap-2 border border-white/15 transition cursor-pointer shadow-lg hover:border-[#0071E3]/50"
                      >
                        <RotateCw className="w-3.5 h-3.5 text-[#0071E3]" />
                        <span>{lang === 'ar' ? 'الرجوع إلى الرصيد' : 'Flip Back to Balance'}</span>
                      </button>
                    </div>
                  )}

                  {/* ═════════════════════════════════════════════════════
                  D. GOOGLE PAY RECENT ACTIVITY (LAST 10 ONLY)
                  ═════════════════════════════════════════════════════ */}
                  <div className="space-y-3 pt-2">
                    <div className="flex items-center justify-between px-1">
                      <div>
                        <h4 className="text-sm font-bold text-white tracking-tight flex items-center gap-1.5">
                          <span>{lang === 'ar' ? 'النشاط الأخير' : 'Recent activity'}</span>
                        </h4>
                        <span className="text-[10px] text-neutral-400 font-medium">
                          {lang === 'ar'
                            ? `آخر 10 معاملات • ${activeCard.title}`
                            : `Latest 10 transactions • ${activeCard.title}`}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={navigateToAllTx}
                        className="text-xs font-bold text-[#0071E3] hover:text-[#47a3ff] flex items-center gap-0.5 cursor-pointer active:scale-95 transition"
                        title={lang === 'ar' ? 'عرض جميع المعاملات' : 'See all transactions'}
                      >
                        <span>{lang === 'ar' ? 'عرض الكل' : 'See all'}</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Google Pay Style 10-Item Inset List */}
                    <div className="rounded-3xl bg-[#141414]/90 backdrop-blur-xl border border-white/10 overflow-hidden divide-y divide-white/[0.06] shadow-xl">
                      {recent10Tx.length > 0 ? (
                        recent10Tx.map((tx) => {
                          const isPurchase = tx.type === 'PURCHASE';
                          const isSelected = promotedTx?.id === tx.id && activeFocus === 'INVOICE';

                          return (
                            <div
                              key={tx.id}
                              onClick={() => handlePromoteTx(tx)}
                              className={`p-3.5 transition-all cursor-pointer flex items-center justify-between gap-3 active:bg-white/10 ${isSelected
                                ? 'bg-[#0071E3]/15 ring-1 ring-inset ring-[#0071E3]/50'
                                : 'hover:bg-white/[0.04]'
                                }`}
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                {/* Google Pay Circular Avatar */}
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 border ${isPurchase
                                  ? 'bg-[#0071E3]/15 text-[#0071E3] border-[#0071E3]/30'
                                  : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                                  }`}>
                                  {isPurchase ? <ShoppingBag className="w-4 h-4" /> : <CreditCard className="w-4 h-4" />}
                                </div>

                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-xs font-bold text-white font-mono truncate">
                                      {isPurchase ? `#${tx.invoiceNo}` : (tx.channel || 'BenefitPay Fawri+')}
                                    </span>
                                    {isPurchase && tx.itemCount && (
                                      <span className="text-[10px] text-neutral-400 bg-white/5 border border-white/5 px-1.5 py-0.2 rounded-md font-sans">
                                        {tx.itemCount} {tx.itemCount === 1 ? 'item' : 'items'}
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-[10px] text-neutral-400 block truncate font-medium">
                                    {new Date(tx.timestamp).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                <div className="text-right">
                                  <span className={`text-xs font-black font-mono block tabular-nums ${isPurchase ? 'text-white' : 'text-emerald-400'}`}>
                                    {isPurchase ? `BD ${tx.amount.toFixed(3)}` : `+BD ${Math.abs(tx.amount).toFixed(3)}`}
                                  </span>
                                  <span className="text-[10px] text-neutral-500 font-medium block">
                                    {isPurchase ? 'Debit' : 'Completed'}
                                  </span>
                                </div>
                                <ChevronRight className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="p-8 text-center space-y-2">
                          <Clock className="w-8 h-8 text-neutral-600 mx-auto" />
                          <p className="text-neutral-400 text-xs font-medium">
                            {lang === 'ar' ? 'لا توجد معاملات مسجلة' : 'No transactions recorded for this card.'}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Google Pay "See all transactions" Full-Width Capsule Button */}
                    <button
                      type="button"
                      onClick={navigateToAllTx}
                      className="w-full py-3 px-4 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] active:bg-white/[0.12] border border-white/10 hover:border-[#0071E3]/40 text-neutral-200 font-semibold text-xs flex items-center justify-between transition cursor-pointer group shadow-sm"
                    >
                      <span className="flex items-center gap-2">
                        <Receipt className="w-4 h-4 text-[#0071E3]" />
                        <span>
                          {lang === 'ar'
                            ? `عرض جميع المعاملات (${activeCard.transactions?.length || 0})`
                            : `See all ${activeCard.transactions?.length || 0} transactions`}
                        </span>
                      </span>
                      <div className="flex items-center gap-1 text-[#0071E3] font-bold text-xs">
                        <span>{lang === 'ar' ? 'فتح' : 'View'}</span>
                        <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                      </div>
                    </button>
                  </div>

                  {/* Generous bottom padding to ensure smooth scrolling above dock */}
                  <div className="h-44" />
                </div>
              </div>

              {/* ─────────────────────────────────────────────────────────
              5. FLOATING CYBER-DOCK (Enterprise Bottom Thumb Zone)
              ───────────────────────────────────────────────────────── */}
              <div className="p-4 bg-[#0D0D0D]/95 border-t border-white/[0.08] shrink-0 space-y-2 backdrop-blur-2xl z-20">
                <button
                  type="button"
                  onClick={() => handleTriggerPayment(activeCard.balance)}
                  className="w-full min-h-[48px] py-3 px-6 bg-[#0071E3] hover:bg-[#0077ED] active:bg-[#0062C4] active:scale-[0.98] text-[#FFFAFA] font-semibold text-sm tracking-[-0.01em] rounded-full transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer border-t border-white/25 shadow-[0_6px_22px_rgba(0,113,227,0.42)] hover:shadow-[0_8px_28px_rgba(0,113,227,0.52)] focus-visible:ring-2 focus-visible:ring-[#0071E3]"
                >
                  <CreditCard className="w-4 h-4 text-[#FFFAFA] shrink-0" />
                  <span>
                    {lang === 'ar' ? 'السداد عبر بنفت بي (فوري+)' : `Settle ${activeCard.title} • Fawri+`}
                  </span>
                </button>

                <div className="grid grid-cols-2 gap-2 text-center text-xs">
                  <button
                    type="button"
                    onClick={() => setShowPassModal(true)}
                    className="py-2 px-3 bg-white/5 hover:bg-white/10 border border-white/10 text-[#FFFAFA] font-bold rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <QrCode className="w-3.5 h-3.5 text-[#0071E3]" />
                    <span>Counter Pass</span>
                  </button>
                  <a
                    href="https://wa.me/97339000000"
                    target="_blank"
                    rel="noreferrer"
                    className="py-2 px-3 bg-white/5 hover:bg-white/10 border border-white/10 text-[#FFFAFA] font-bold rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <MessageCircle className="w-3.5 h-3.5 text-[#0071E3]" />
                    <span>WhatsApp Help</span>
                  </a>
                </div>
              </div>
            </>
          )}
        </div>
      </main>

      {/* ─────────────────────────────────────────────────────────────
          MODAL 1: BENEFITPAY FAWRI+ PAYMENT GATEWAY
          ───────────────────────────────────────────────────────────── */}
      {showBenefitModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#141414] border border-white/15 rounded-[32px] p-6 max-w-sm w-full text-center space-y-4 shadow-2xl animate-in zoom-in-95 text-[#FFFAFA]">
            <div className="w-12 h-12 bg-[#0071E3]/20 text-[#0071E3] rounded-2xl flex items-center justify-center mx-auto border border-[#0071E3]/30">
              <CreditCard className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-black text-[#FFFAFA]">BenefitPay Fawri+ Settle</h3>
            <p className="text-xs text-neutral-300 leading-relaxed">
              Scan Bahrain EMVCo QR code using your BenefitPay app to settle your account balance directly.
            </p>
            <div className="p-4 bg-white rounded-2xl inline-block mx-auto shadow-inner">
              <QrCode className="w-40 h-40 text-black mx-auto" />
            </div>
            <div className="font-mono text-base font-bold text-[#0071E3]">
              Amount: BHD {Number(benefitAmount).toFixed(3)}
            </div>
            <button
              type="button"
              onClick={() => setShowBenefitModal(false)}
              className="w-full py-3 bg-[#0071E3] hover:bg-[#0077ED] text-[#FFFAFA] font-bold rounded-xl text-xs transition cursor-pointer border border-white/10 active:scale-95"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MODAL 2: ROOMMATE SPLIT AUDIT SHEET (Enterprise Group Credit)
          ───────────────────────────────────────────────────────────── */}
      {showRoommateModal && activeCard.type === 'MESS' && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/15 rounded-[32px] p-5 max-w-sm w-full space-y-4 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 flex items-center justify-center">
                  <Users className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white">{activeCard.title}</h3>
                  <span className="text-[10px] text-cyan-400 font-mono">
                    Total Debt: BHD {activeCard.roomTotal?.toFixed(3)}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowRoommateModal(false)}
                className="p-1.5 rounded-xl bg-white/10 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-300">
              Room Pantry Split Ledger: Each member owes <strong>BHD {activeCard.balance?.toFixed(3)}</strong>
            </p>

            <div className="space-y-1.5 max-h-56 overflow-y-auto">
              {activeCard.roommates?.map((r, idx) => (
                <div
                  key={idx}
                  className="p-2.5 rounded-xl bg-black/40 border border-white/5 flex items-center justify-between text-xs"
                >
                  <div className="min-w-0">
                    <span className="font-bold text-white block truncate">{r.name}</span>
                    <span className="text-[10px] text-slate-400 font-mono">BHD {r.share.toFixed(3)}</span>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${r.status === 'PAID'
                    ? 'bg-white/10 text-[#FFFAFA] border-white/20'
                    : 'bg-[#0071E3]/15 text-[#0071E3] border-[#0071E3]/30 animate-pulse'
                    }`}>
                    {r.status}
                  </span>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => {
                alert(`Sending WhatsApp reminder to pending roommates in ${activeCard.title}...`);
              }}
              className="w-full py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-xl text-xs transition flex items-center justify-center gap-1.5 shadow-md active:scale-95"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>Remind Pending Roommates via WhatsApp</span>
            </button>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MODAL 3: DIGITAL POS COUNTER PASS
          ───────────────────────────────────────────────────────────── */}
      {showPassModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#141414] border border-white/15 rounded-[32px] p-6 max-w-sm w-full text-center space-y-4 shadow-2xl animate-in zoom-in-95 text-[#FFFAFA]">
            <div className="w-12 h-12 bg-[#0071E3]/20 text-[#0071E3] rounded-2xl flex items-center justify-center mx-auto border border-[#0071E3]/30">
              <QrCode className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-black text-[#FFFAFA]">Digital Credit Counter Pass</h3>
            <p className="text-xs text-neutral-300 leading-relaxed">
              Show this QR code to the cashier scanner at Layali Supermarket for instant 0.1s checkout.
            </p>
            <div className="p-4 bg-white rounded-2xl inline-block mx-auto shadow-inner">
              <QrCode className="w-44 h-44 text-black mx-auto" />
            </div>
            <div className="font-mono text-xs text-neutral-400">
              Account ID: {customer.id} • CPR {customer.cpr}
            </div>
            <button
              type="button"
              onClick={() => setShowPassModal(false)}
              className="w-full py-3 bg-[#0071E3] hover:bg-[#0077ED] text-[#FFFAFA] font-bold rounded-xl text-xs transition cursor-pointer border border-white/10 active:scale-95"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MODAL 4: DIGITAL TAX INVOICE & ITEMIZED BREAKDOWN
          ───────────────────────────────────────────────────────────── */}
      {promotedTx && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/15 rounded-[32px] p-5 max-w-sm w-full space-y-4 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center">
                  <Receipt className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white font-mono">
                    #{promotedTx.invoiceNo}
                  </h3>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {new Date(promotedTx.timestamp).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPromotedTx(null)}
                className="p-1.5 rounded-xl bg-white/10 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Invoice Line Items */}
            {promotedTx.items && promotedTx.items.length > 0 ? (
              <div className="space-y-1.5 max-h-60 overflow-y-auto">
                <div className="text-[10px] font-mono text-slate-400 uppercase font-bold px-1 flex justify-between">
                  <span>Item Description</span>
                  <span>Total (BHD)</span>
                </div>
                {promotedTx.items.map((it, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 rounded-xl bg-black/40 border border-white/5 flex items-center justify-between text-xs"
                  >
                    <div className="min-w-0 pr-2">
                      <span className="font-bold text-white block truncate">
                        {lang === 'ar' ? it.nameAr || it.name : it.name}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {it.qty} × BD {it.unitPrice.toFixed(3)}
                      </span>
                    </div>
                    <span className="text-xs font-mono font-bold text-slate-200 tabular-nums shrink-0">
                      BD {it.total.toFixed(3)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-black/30 text-center text-xs text-neutral-400">
                Payment Channel: <span className="text-[#0071E3] font-bold">{promotedTx.channel || 'BenefitPay Fawri+'}</span>
              </div>
            )}

            {/* Total Summary */}
            <div className="pt-2 border-t border-white/10 space-y-1 text-xs font-mono">
              <div className="flex justify-between text-slate-400 text-[11px]">
                <span>Invoice Total</span>
                <span className="tabular-nums font-bold text-white">BD {Math.abs(promotedTx.amount).toFixed(3)}</span>
              </div>
              <div className="flex justify-between text-slate-400 text-[10px]">
                <span>Account Running Balance</span>
                <span className="tabular-nums">BD {promotedTx.runningBalance.toFixed(3)}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setPromotedTx(null)}
              className="w-full py-2.5 bg-white/10 hover:bg-white/15 text-white font-bold rounded-xl text-xs transition cursor-pointer border border-white/10 active:scale-95"
            >
              Close Receipt
            </button>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          HAMBURGER SLIDE-OUT DRAWER PANEL (Pre-cached GPU Compositor)
          ───────────────────────────────────────────────────────────── */}
      <div
        className={`fixed inset-0 z-50 flex transition-all duration-200 ${
          isDrawerOpen ? 'pointer-events-auto visible opacity-100' : 'pointer-events-none invisible opacity-0'
        }`}
        aria-hidden={!isDrawerOpen}
      >
        {/* Backdrop (Dark Overlay, No GPU Blur Filter to Avoid Thread Stall) */}
        <div
          onClick={() => setIsDrawerOpen(false)}
          onPointerDown={() => setIsDrawerOpen(false)}
          className={`fixed inset-0 bg-black/80 transition-opacity duration-200 ease-out ${
            isDrawerOpen ? 'opacity-100' : 'opacity-0'
          }`}
        />

        {/* Drawer Sheet (Zero-Latency translate3d Hardware Motion) */}
        <div
          dir={isRtl ? 'rtl' : 'ltr'}
          className={`relative w-[85%] max-w-[340px] h-full bg-[#121214] border-r border-white/10 z-50 flex flex-col justify-between p-5 shadow-[0_0_50px_rgba(0,0,0,0.9)] overflow-y-auto transition-transform duration-200 ease-out transform ${
            isDrawerOpen ? 'translate-x-0' : (isRtl ? 'translate-x-full' : '-translate-x-full')
          }`}
          style={{ willChange: 'transform' }}
        >
            <div className="space-y-5">
              {/* Drawer Header */}
              <div className="flex items-start justify-between pb-4 border-b border-white/10">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-[#0071E3]/20 border border-[#0071E3]/40 flex items-center justify-center text-[#0071E3]">
                      <Store className="w-4 h-4" />
                    </div>
                    <span className="text-sm font-black tracking-tight text-white font-mono uppercase">
                      LAYALI <span className="text-[#0071E3]">AL-KHARIF</span>
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-400 font-sans">
                    {lang === 'ar' ? 'سوبرماركت ليالي الخريف ذ.م.م' : 'Layali Al-Kharif Supermarket W.L.L.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsDrawerOpen(false)}
                  className="p-1.5 rounded-xl bg-white/10 text-neutral-400 hover:text-white transition active:scale-95 cursor-pointer"
                  aria-label="Close Menu"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Bahrain Official Commercial & Tax Registration Credentials */}
              <div className="p-3 rounded-2xl bg-black/40 border border-white/5 space-y-2 text-[11px] font-mono">
                <div className="flex items-center justify-between text-neutral-400">
                  <span>Kingdom of Bahrain CR:</span>
                  <span className="font-bold text-white">12345-1</span>
                </div>
                <div className="flex items-center justify-between text-neutral-400">
                  <span>NBR VAT 10% TIN:</span>
                  <span className="font-bold text-[#0071E3]">200000000000002</span>
                </div>
                <div className="text-[10px] text-neutral-500 font-sans pt-1 border-t border-white/5">
                  Block 951, Askar Industrial Highway, Bahrain
                </div>
              </div>

              {/* Card Security Suite */}
              <div className="space-y-2.5">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-neutral-400 px-1">
                  {lang === 'ar' ? 'أمان الحساب والبطاقة' : 'Card & Wallet Security'}
                </span>

                {/* Instant Freeze Toggle */}
                <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${isCurrentCardFrozen ? 'bg-rose-500/20 text-rose-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                        {isCurrentCardFrozen ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                      </div>
                      <div>
                        <div className="text-xs font-bold text-white">
                          {isCurrentCardFrozen
                            ? (lang === 'ar' ? 'البطاقة مجمّدة وموقوفة' : 'Card is Frozen')
                            : (lang === 'ar' ? 'البطاقة نشطة وجاهزة' : 'Card is Active')}
                        </div>
                        <div className="text-[10px] text-neutral-400 font-mono truncate max-w-[140px]">
                          {activeCard.title}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleToggleCardFreeze}
                      className={`px-3 py-1.5 rounded-xl font-bold text-xs transition cursor-pointer active:scale-95 border ${isCurrentCardFrozen
                        ? 'bg-rose-500 hover:bg-rose-600 text-white border-rose-400 shadow-sm'
                        : 'bg-white/10 hover:bg-white/20 text-neutral-200 border-white/15'
                        }`}
                    >
                      {isCurrentCardFrozen
                        ? (lang === 'ar' ? 'إلغاء التجميد' : 'Unfreeze')
                        : (lang === 'ar' ? 'تجميد فوري' : 'Freeze')}
                    </button>
                  </div>
                  <p className="text-[10px] text-neutral-400 leading-tight">
                    {lang === 'ar'
                      ? 'قم بتجميد البطاقة فوراً لمنع أي مشتريات عند الفقدان أو السرقة.'
                      : 'Instantly lock POS checkout if your card is lost or stolen.'}
                  </p>
                </div>

                {/* Biometric Screen Lock Toggle */}
                <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${isBiometricLocked ? 'bg-[#0071E3]/20 text-[#0071E3]' : 'bg-white/10 text-neutral-400'}`}>
                      <Fingerprint className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-white truncate">
                        {lang === 'ar' ? 'قفل البصمة / FaceID' : 'Biometric / PIN Lock'}
                      </div>
                      <div className="text-[10px] text-neutral-400">
                        {isBiometricLocked
                          ? (lang === 'ar' ? 'مفعّل عند الفتح' : 'Secured on open')
                          : (lang === 'ar' ? 'غير مفعّل' : 'Not protected')}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsBiometricLocked(prev => !prev)}
                    className={`w-11 h-6 rounded-full transition p-0.5 cursor-pointer flex items-center ${isBiometricLocked ? 'bg-[#0071E3] justify-end' : 'bg-white/20 justify-start'}`}
                  >
                    <span className="w-5 h-5 rounded-full bg-white shadow-md" />
                  </button>
                </div>
              </div>

              {/* Reports & Statements */}
              <div className="space-y-2">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-neutral-400 px-1">
                  {lang === 'ar' ? 'التقارير والكشوفات الضريبية' : 'Tax Reports & Statements'}
                </span>

                {/* Open Statement Modal */}
                <button
                  type="button"
                  onClick={() => {
                    setIsDrawerOpen(false);
                    setShowStatementModal(true);
                  }}
                  className="w-full p-3 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] active:scale-[0.98] border border-white/10 flex items-center justify-between text-xs transition cursor-pointer text-neutral-200"
                >
                  <span className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-[#0071E3]" />
                    <span className="font-semibold">
                      {lang === 'ar' ? 'كشف الحساب الضريبي الرسمي (PDF)' : 'Official Tax Statement (PDF)'}
                    </span>
                  </span>
                  <Printer className="w-3.5 h-3.5 text-neutral-400" />
                </button>

                {/* Share WhatsApp Statement */}
                <button
                  type="button"
                  onClick={handleShareWhatsAppLedger}
                  className="w-full p-3 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] active:scale-[0.98] border border-white/10 flex items-center justify-between text-xs transition cursor-pointer text-neutral-200"
                >
                  <span className="flex items-center gap-2">
                    <MessageCircle className="w-4 h-4 text-emerald-400" />
                    <span className="font-semibold">
                      {lang === 'ar' ? 'إرسال الكشف عبر واتساب' : 'Share Statement via WhatsApp'}
                    </span>
                  </span>
                  <Share2 className="w-3.5 h-3.5 text-neutral-400" />
                </button>
              </div>

              {/* Language Preferences */}
              <div className="space-y-2">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-neutral-400 px-1">
                  {lang === 'ar' ? 'لغة التطبيق' : 'Language'}
                </span>
                <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-black/40 border border-white/10">
                  <button
                    type="button"
                    onClick={() => setLang('en')}
                    className={`py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${lang === 'en' ? 'bg-[#0071E3] text-white shadow-xs' : 'text-neutral-400 hover:text-white'}`}
                  >
                    English
                  </button>
                  <button
                    type="button"
                    onClick={() => setLang('ar')}
                    className={`py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${lang === 'ar' ? 'bg-[#0071E3] text-white shadow-xs' : 'text-neutral-400 hover:text-white'}`}
                  >
                    العربية
                  </button>
                  <button
                    type="button"
                    onClick={() => setLang('ml')}
                    className={`py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${lang === 'ml' ? 'bg-[#0071E3] text-white shadow-xs' : 'text-neutral-400 hover:text-white'}`}
                  >
                    മലയാളം
                  </button>
                </div>
              </div>
            </div>

            {/* Drawer Footer & Support */}
            <div className="pt-4 border-t border-white/10 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <a
                  href="tel:+97317000000"
                  className="flex-1 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-300 text-xs font-semibold flex items-center justify-center gap-1.5 border border-white/10 transition"
                >
                  <PhoneCall className="w-3.5 h-3.5 text-[#0071E3]" />
                  <span>{lang === 'ar' ? 'اتصال بالمتجر' : 'Call Store'}</span>
                </a>
                <a
                  href="https://wa.me/97336000000"
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 text-xs font-semibold flex items-center justify-center gap-1.5 border border-emerald-500/30 transition"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span>WhatsApp</span>
                </a>
              </div>
              <p className="text-[10px] text-center text-neutral-500 font-mono">
                Layali Supermarket PWA • CBB V1.4 Regulated
              </p>
            </div>
          </div>
        </div>

      {/* ─────────────────────────────────────────────────────────────
          MODAL 5: OFFICIAL BAHRAIN TAX STATEMENT (PDF & PRINT READY)
          ───────────────────────────────────────────────────────────── */}
      {showStatementModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#121214] border border-white/15 rounded-[32px] p-6 max-w-md w-full space-y-5 shadow-2xl animate-in zoom-in-95 text-[#FFFAFA] max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-start justify-between pb-3 border-b border-white/10">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-[#0071E3]/20 border border-[#0071E3]/40 flex items-center justify-center text-[#0071E3]">
                    <Store className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-white font-mono uppercase">
                      LAYALI AL-KHARIF SUPERMARKET W.L.L.
                    </h3>
                    <p className="text-[10px] text-neutral-400 font-mono">
                      CR: 12345-1 • NBR VAT TIN: 200000000000002
                    </p>
                  </div>
                </div>
                <p className="text-[10px] text-neutral-400">
                  Building 102, Road 5112, Block 951, Askar, Kingdom of Bahrain
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowStatementModal(false)}
                className="p-1.5 rounded-xl bg-white/10 text-neutral-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Statement Metadata */}
            <div className="p-3.5 rounded-2xl bg-black/40 border border-white/5 grid grid-cols-2 gap-2 text-xs font-mono">
              <div>
                <span className="text-[10px] text-neutral-400 block">PATRON NAME:</span>
                <span className="font-bold text-white truncate block">{customer.name}</span>
                <span className="text-[10px] text-neutral-400 block mt-1">CPR NUMBER:</span>
                <span className="text-white font-bold">{customer.cpr}</span>
              </div>
              <div>
                <span className="text-[10px] text-neutral-400 block">ACCOUNT/CARD:</span>
                <span className="font-bold text-[#0071E3] truncate block">{activeCard.title}</span>
                <span className="text-[10px] text-neutral-400 block mt-1">STATEMENT DATE:</span>
                <span className="text-white">{new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
              </div>
            </div>

            {/* VAT 10% Breakdown */}
            <div className="space-y-2 p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 font-mono text-xs">
              <div className="flex justify-between text-neutral-400">
                <span>Net Total (Excl. VAT):</span>
                <span className="tabular-nums text-white">BHD {(Number(activeCard.balance || 0) / 1.10).toFixed(3)}</span>
              </div>
              <div className="flex justify-between text-neutral-400">
                <span>Bahrain Standard VAT (10%):</span>
                <span className="tabular-nums text-[#0071E3]">BHD {(Number(activeCard.balance || 0) - (Number(activeCard.balance || 0) / 1.10)).toFixed(3)}</span>
              </div>
              <div className="flex justify-between font-bold text-sm pt-2 border-t border-white/10 text-white">
                <span>Total Balance Payable:</span>
                <span className="tabular-nums text-[#0071E3]">BHD {Number(activeCard.balance || 0).toFixed(3)}</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex-1 py-3 bg-[#0071E3] hover:bg-[#0077ED] text-white font-bold rounded-xl text-xs transition cursor-pointer flex items-center justify-center gap-1.5 shadow-md active:scale-95"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print / Save PDF</span>
              </button>
              <button
                type="button"
                onClick={() => setShowStatementModal(false)}
                className="py-3 px-5 bg-white/10 hover:bg-white/15 text-white font-bold rounded-xl text-xs transition cursor-pointer active:scale-95 border border-white/10"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
