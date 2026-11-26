// pos-mvp/scripts/run_live_pos_speed_test.mjs
/**
 * Master Real-Time POS Pure Speed & Stress Benchmark
 * Measures:
 * 1. Live Fastify API & SQLite WAL latency (P50, P95, P99, Ops/sec)
 * 2. Physical Sunmi D2 Mini GPU Rasterization & Frame Timings (gfxinfo)
 * 3. Memory Footprint & Hardware Resource Utilization
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const API_BASE = 'http://127.0.0.1:3000';
const ADB_PATH = process.env.LOCALAPPDATA + '\\Android\\Sdk\\platform-tools\\adb.exe';
const DEVICE_ID = 'DM07221L40379';

function calcStats(arr) {
  if (!arr || arr.length === 0) return { min: 0, max: 0, avg: 0, p50: 0, p90: 0, p95: 0, p99: 0 };
  const sorted = [...arr].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const avg = sorted.reduce((sum, v) => sum + v, 0) / sorted.length;
  const p50 = sorted[Math.floor(sorted.length * 0.50)];
  const p90 = sorted[Math.floor(sorted.length * 0.90)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const p99 = sorted[Math.floor(sorted.length * 0.99)];
  return {
    min: Number(min.toFixed(2)),
    max: Number(max.toFixed(2)),
    avg: Number(avg.toFixed(2)),
    p50: Number(p50.toFixed(2)),
    p90: Number(p90.toFixed(2)),
    p95: Number(p95.toFixed(2)),
    p99: Number(p99.toFixed(2))
  };
}

async function runLiveApiBenchmark() {
  console.log('\n--- 1. BENCHMARKING LIVE MASTER POS SERVER API (HTTP/WAL) ---');
  const results = {};

  // Test 1: Produce Catalog Fetch (41 weighed produce items + WebP thumbnails)
  console.log('⚡ Benchmarking Produce Catalog Fetch (100 sequential requests)...');
  const produceLatencies = [];
  for (let i = 0; i < 100; i++) {
    const t0 = performance.now();
    const res = await fetch(`${API_BASE}/api/products/produce`);
    await res.json();
    produceLatencies.push(performance.now() - t0);
  }
  results.produceCatalog = {
    iterations: 100,
    ...calcStats(produceLatencies),
    throughputOpsSec: Number((100 / (produceLatencies.reduce((a, b) => a + b, 0) / 1000)).toFixed(1))
  };

  // Test 2: Full Product Catalog (1,000+ items)
  console.log('⚡ Benchmarking Full Catalog Fetch (50 sequential requests)...');
  const catalogLatencies = [];
  for (let i = 0; i < 50; i++) {
    const t0 = performance.now();
    const res = await fetch(`${API_BASE}/api/products`);
    await res.json();
    catalogLatencies.push(performance.now() - t0);
  }
  results.fullCatalog = {
    iterations: 50,
    ...calcStats(catalogLatencies),
    throughputOpsSec: Number((50 / (catalogLatencies.reduce((a, b) => a + b, 0) / 1000)).toFixed(1))
  };

  // Test 3: Realistic Sales Transaction Creation (100 sales)
  console.log('⚡ Benchmarking Sales Checkout Throughput (100 real sales writes)...');
  const saleLatencies = [];
  for (let i = 0; i < 100; i++) {
    const t0 = performance.now();
    const res = await fetch(`${API_BASE}/api/sales`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-pos-client': 'store-pos'
      },
      body: JSON.stringify({
        total: 2.450,
        subtotal: 2.227,
        vat: 0.223,
        paymentMethod: 'CASH',
        cashierId: 'cashier_benchmark',
        items: [
          {
            id: '62a65057-4a08-4de7-b86a-5d770eb3d3b6',
            name: 'Tomato',
            quantity: 1.5,
            price: 0.500,
            total: 0.750,
            vat: 0.068
          },
          {
            id: 'ce7288b2-fb6c-459b-908e-9b783d95733a',
            name: 'Chilly green',
            quantity: 1,
            price: 1.500,
            total: 1.500,
            vat: 0.136
          }
        ]
      })
    });
    await res.json();
    saleLatencies.push(performance.now() - t0);
  }
  results.salesCreation = {
    iterations: 100,
    ...calcStats(saleLatencies),
    throughputOpsSec: Number((100 / (saleLatencies.reduce((a, b) => a + b, 0) / 1000)).toFixed(1))
  };

  // Test 4: Dual-Asset Image Upload Latency (5 iterations)
  console.log('⚡ Benchmarking Dual-Asset Image Upload (5 uploads)...');
  const uploadLatencies = [];
  for (let i = 0; i < 5; i++) {
    const t0 = performance.now();
    const res = await fetch(`${API_BASE}/api/products/upload-dual-photo`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-pos-client': 'pim-admin'
      },
      body: JSON.stringify({
        id: '62a65057-4a08-4de7-b86a-5d770eb3d3b6',
        barcode: '102',
        masterBase64: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
        thumbBase64: 'UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA=='
      })
    });
    await res.json();
    uploadLatencies.push(performance.now() - t0);
  }
  results.dualAssetUpload = {
    iterations: 5,
    ...calcStats(uploadLatencies),
    throughputOpsSec: Number((5 / (uploadLatencies.reduce((a, b) => a + b, 0) / 1000)).toFixed(1))
  };

  return results;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runSunmiDeviceBenchmark() {
  console.log('\n--- 2. PROFILING SUNMI D2 MINI TERMINAL HARDWARE (GPU / CPU / RAM) ---');
  const results = {};

  try {
    // 1. Reset frame stats
    console.log('📱 Resetting gfxinfo frame stats on device...');
    execSync(`"${ADB_PATH}" -s ${DEVICE_ID} shell dumpsys gfxinfo com.retail.pos reset`, { encoding: 'utf8' });

    // 2. Bring app to foreground
    console.log('📱 Activating com.retail.pos in foreground...');
    execSync(`"${ADB_PATH}" -s ${DEVICE_ID} shell am start -n com.retail.pos/.MainActivity`, { encoding: 'utf8' });
    await sleep(1000);

    // 3. Perform 20 rapid UI touches across grid & Omni-Pad
    console.log('📱 Executing 20 burst touch events (Cart Flooding & Omni-Pad trigger)...');
    const t0 = performance.now();

    // 10 Quick Item Grid taps
    const gridTaps = [
      '450 200', '600 200', '750 200', '920 200',
      '450 320', '600 320', '750 320', '920 320',
      '450 440', '600 440'
    ];
    for (const coord of gridTaps) {
      execSync(`"${ADB_PATH}" -s ${DEVICE_ID} shell input tap ${coord}`);
      await sleep(100);
    }

    // Toggle Omni-Pad via F8 keycode
    execSync(`"${ADB_PATH}" -s ${DEVICE_ID} shell input keyevent 138`);
    await sleep(800);

    // Tap produce items inside Omni-Pad
    const omniTaps = ['100 350', '250 350', '400 350'];
    for (const coord of omniTaps) {
      execSync(`"${ADB_PATH}" -s ${DEVICE_ID} shell input tap ${coord}`);
      await sleep(100);
    }

    // Close Omni-Pad (Esc / Back to register)
    execSync(`"${ADB_PATH}" -s ${DEVICE_ID} shell input keyevent 111`);
    await sleep(800);

    const duration = performance.now() - t0;
    results.touchBurstDurationMs = Math.round(duration);

    // 4. Capture Frame Rendering Stats (gfxinfo)
    console.log('📱 Reading dumpsys gfxinfo rendering statistics...');
    const gfxRaw = execSync(`"${ADB_PATH}" -s ${DEVICE_ID} shell dumpsys gfxinfo com.retail.pos`, { encoding: 'utf8' });
    
    // Parse gfxinfo
    const totalFramesMatch = gfxRaw.match(/Total frames rendered:\s+(\d+)/);
    const jankyFramesMatch = gfxRaw.match(/Janky frames:\s+(\d+)\s+\(([\d.]+)%\)/);
    const p50Match = gfxRaw.match(/50th percentile:\s+(\d+)ms/);
    const p90Match = gfxRaw.match(/90th percentile:\s+(\d+)ms/);
    const p95Match = gfxRaw.match(/95th percentile:\s+(\d+)ms/);
    const p99Match = gfxRaw.match(/99th percentile:\s+(\d+)ms/);
    const missedVsyncMatch = gfxRaw.match(/Number Missed Vsync:\s+(\d+)/);
    const highInputLatencyMatch = gfxRaw.match(/Number High input latency:\s+(\d+)/);
    const slowUiThreadMatch = gfxRaw.match(/Number Slow UI thread:\s+(\d+)/);

    results.graphics = {
      totalFramesRendered: totalFramesMatch ? parseInt(totalFramesMatch[1], 10) : null,
      jankyFramesCount: jankyFramesMatch ? parseInt(jankyFramesMatch[1], 10) : null,
      jankyFramesPercent: jankyFramesMatch ? parseFloat(jankyFramesMatch[2]) : null,
      p50FrameTimeMs: p50Match ? parseInt(p50Match[1], 10) : null,
      p90FrameTimeMs: p90Match ? parseInt(p90Match[1], 10) : null,
      p95FrameTimeMs: p95Match ? parseInt(p95Match[1], 10) : null,
      p99FrameTimeMs: p99Match ? parseInt(p99Match[1], 10) : null,
      missedVsync: missedVsyncMatch ? parseInt(missedVsyncMatch[1], 10) : 0,
      highInputLatency: highInputLatencyMatch ? parseInt(highInputLatencyMatch[1], 10) : 0,
      slowUiThread: slowUiThreadMatch ? parseInt(slowUiThreadMatch[1], 10) : 0
    };

    // 5. Capture Memory Metrics (meminfo)
    console.log('📱 Reading dumpsys meminfo RAM consumption...');
    const memRaw = execSync(`"${ADB_PATH}" -s ${DEVICE_ID} shell dumpsys meminfo com.retail.pos`, { encoding: 'utf8' });
    const totalPssMatch = memRaw.match(/TOTAL PSS:\s+(\d+)/i) || memRaw.match(/TOTAL\s+(\d+)/);
    const nativeHeapMatch = memRaw.match(/Native Heap\s+(\d+)/);
    const dalvikHeapMatch = memRaw.match(/Dalvik Heap\s+(\d+)/);

    results.memory = {
      totalPssKb: totalPssMatch ? parseInt(totalPssMatch[1], 10) : null,
      totalPssMb: totalPssMatch ? Number((parseInt(totalPssMatch[1], 10) / 1024).toFixed(1)) : null,
      nativeHeapMb: nativeHeapMatch ? Number((parseInt(nativeHeapMatch[1], 10) / 1024).toFixed(1)) : null,
      dalvikHeapMb: dalvikHeapMatch ? Number((parseInt(dalvikHeapMatch[1], 10) / 1024).toFixed(1)) : null
    };

    // 6. Capture Battery & Thermal Status
    console.log('📱 Reading dumpsys battery & thermal status...');
    const batteryRaw = execSync(`"${ADB_PATH}" -s ${DEVICE_ID} shell dumpsys battery`, { encoding: 'utf8' });
    const levelMatch = batteryRaw.match(/level:\s+(\d+)/);
    const tempMatch = batteryRaw.match(/temperature:\s+(\d+)/);

    results.hardware = {
      batteryLevelPercent: levelMatch ? parseInt(levelMatch[1], 10) : null,
      temperatureCelsius: tempMatch ? Number((parseInt(tempMatch[1], 10) / 10).toFixed(1)) : null
    };

    // 7. Pull screenshot
    const shotPath = 'C:\\Users\\ACER\\.gemini\\antigravity\\brain\\5659bbf6-01eb-46f6-92a7-4a4b22035147\\sunmi_speed_test_live.png';
    execSync(`"${ADB_PATH}" -s ${DEVICE_ID} shell screencap -p /sdcard/speed_test.png`);
    execSync(`"${ADB_PATH}" -s ${DEVICE_ID} pull /sdcard/speed_test.png "${shotPath}"`);
    execSync(`"${ADB_PATH}" -s ${DEVICE_ID} shell rm /sdcard/speed_test.png`);
    results.screenshot = shotPath;

  } catch (err) {
    console.error('Device benchmark warning:', err.message);
    results.error = err.message;
  }

  return results;
}

async function main() {
  console.log('================================================================');
  console.log('🚀 PURE SPEED & PERFORMANCE TEST HARNESS - ASKAR RETAIL POS');
  console.log('================================================================');

  const apiMetrics = await runLiveApiBenchmark();
  const deviceMetrics = await runSunmiDeviceBenchmark();

  const fullReport = {
    timestamp: new Date().toISOString(),
    apiMetrics,
    deviceMetrics
  };

  const outputPath = 'C:\\Users\\ACER\\.gemini\\antigravity\\brain\\5659bbf6-01eb-46f6-92a7-4a4b22035147\\pos_pure_speed_test_results.json';
  fs.writeFileSync(outputPath, JSON.stringify(fullReport, null, 2), 'utf8');

  console.log('\n================================================================');
  console.log('✅ BENCHMARK COMPLETE! Full metrics saved to:');
  console.log(outputPath);
  console.log('================================================================\n');
  console.log(JSON.stringify(fullReport, null, 2));
}

main().catch((err) => {
  console.error('Benchmark fatal error:', err);
  process.exit(1);
});
