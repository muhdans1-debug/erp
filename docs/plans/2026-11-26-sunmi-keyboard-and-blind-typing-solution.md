# Sunmi D2 Mini (1280x800) Keyboard & Blind Typing Solution Implementation Plan

> **For Antigravity:** Use executing-plans to implement this plan task-by-task.

**Goal:** Eliminate blind typing and layout occlusion on the Sunmi D2 Mini terminal (1280x800 landscape) caused by the Android software keyboard covering input fields and search results across Khata Hub, F12 Search, and checkout registers.

**Architecture:** Combine native Android `windowSoftInputMode="adjustResize"`, top-pinned sticky search bars (Toast/Clover standard), register `inputMode="none"` keypad suppression for barcode scanners, and viewport-aware scroll-into-view hooks for modal forms.

**Tech Stack:** Android Manifest, Capacitor Android WebView, React 19, Tailwind CSS, Lucide Icons.

---

## 1. Problem Visualized (1280x800 Landscape Screen Geometry)

```
┌──────────────────────────────────────────────────────────────┐
│ SUNMI D2 MINI DISPLAY (1280 x 800 px)                        │
│                                                              │
│  y: 0px   ┌──────────────────────────────────────────────┐   │
│           │ Status Bar / Header (40px)                   │   │
│  y: 60px  │ [STICKY TOP SEARCH BAR] <── ALWAYS VISIBLE! │   │
│           │ Results List (Cards 1-4) (320px)             │   │
│  y: 420px ├──────────────────────────────────────────────┤   │
│           │                                              │   │
│           │                                              │   │
│           │     ANDROID SOFTWARE KEYBOARD (AOSP/Gboard)  │   │
│           │     Takes ~380px vertical height             │   │
│           │     (y = 420px to 800px)                     │   │
│           │                                              │   │
│  y: 800px └──────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

---

## 2. Implementation Tasks

### Task 1: Native Android Viewport Resizing (`adjustResize`)
**Files:**
- Modify: `pos-mvp/android/app/src/main/AndroidManifest.xml:20-25`

**Implementation:**
- Replace `android:windowSoftInputMode="adjustPan|stateHidden"` with:
  `android:windowSoftInputMode="adjustResize|stateHidden"`
- This allows Android to shrink the WebView height dynamically when the keyboard appears (`window.innerHeight` drops from 800px to ~420px), enabling standard CSS sticky positioning and auto-scroll.

---

### Task 2: Pinned-Top Layout in Khata Hub (`KhataHubModal.tsx`)
**Files:**
- Modify: `pos-mvp/src/components/KhataHubModal.tsx`

**Implementation:**
1. Change modal wrapper from `items-center justify-center p-4` to `items-start justify-center pt-2 md:pt-3 p-2`.
2. Anchor the Customer Search Bar directly below the tabs with `sticky top-0 z-30 bg-white pb-2`.
3. Set the results list container to dynamically size with `max-h-[calc(100vh-460px)] min-h-[160px] overflow-y-auto`.
4. Result: When the virtual keyboard rises, the search bar sits securely at `y = 70px–120px` (completely above the keyboard), and matching customer cards scroll in the remaining upper viewport.

---

### Task 3: Pinned-Top Layout in F12 Product Search (`F12SearchOverlay.tsx`)
**Files:**
- Modify: `pos-mvp/src/components/F12SearchOverlay.tsx`

**Implementation:**
1. Change overlay container from `p-4 md:p-8 justify-start` to `p-2 pt-2 justify-start`.
2. Fix the search header to the very top edge of the overlay (`top-0 z-30`).
3. Set the product results list to `max-h-[calc(100vh-440px)] min-h-[180px] overflow-y-auto`.
4. Result: Cashier types into the search box with 100% visibility, and the top 3–4 instant matching product rows remain fully visible above the keyboard.

---

### Task 4: Register Keyboard Suppression & Barcode Scanner Fast-Path (`CheckoutScreen.tsx`)
**Files:**
- Modify: `pos-mvp/src/pages/CheckoutScreen.tsx`

**Implementation:**
1. On the main register typing/PLU buffer input, set `inputMode="none"`.
2. Physical USB laser scanners, Bluetooth scanners, and the on-screen Predictive Omni-Pad keypad can type instantly without triggering the annoying Android software keyboard.
3. Add a small toggle icon `[⌨️ Virtual Keyboard]` next to the buffer input allowing cashiers to explicitly open the software keyboard only when they actually want to type without physical hardware.

---

### Task 5: Viewport-Aware Focus Auto-Scroll for Form Inputs
**Files:**
- Create: `pos-mvp/src/utils/keyboardAware.ts`
- Modify: `pos-mvp/src/components/KhataHubModal.tsx` (New Customer Form, CPR, Phone, Settle Amount)

**Implementation:**
- Create utility `handleKeyboardFocus(e: React.FocusEvent<HTMLInputElement>)` that calls:
  ```ts
  e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  ```
- Wire it to CPR, Phone, Name, and Settle Amount fields in modal forms so any field clicked by the cashier smoothly centers itself in the visible half of the screen.

---

### Task 6: Rebuild, Deploy to Sunmi Terminal, and Live Screen Verification
**Files:**
- Command: `npm run build` in `pos-mvp`
- Command: `npx cap sync android`
- Command: `./gradlew assembleDebug` in `pos-mvp/android`
- Command: `adb install -r app-debug.apk` to Sunmi `DM07221L40379`
- Action: Open Khata Hub and F12 Search on Sunmi device, tap search inputs to raise keyboard, capture screenshots, and verify 0% blind typing.
