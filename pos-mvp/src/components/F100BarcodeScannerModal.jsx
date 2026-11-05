import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { X, Flashlight, AlertCircle, ScanLine } from 'lucide-react';

/**
 * F100 Direct Camera Barcode Scanner Modal
 * Ultra-fast direct 1D/2D scanner for Feitian F100 handheld terminal.
 * Automatically activates rear autofocus camera, detects EAN-13, UPC, Code128, etc.,
 * and triggers immediate product lookup with haptic confirmation.
 */
export default function F100BarcodeScannerModal({ isOpen, onClose, onScan }) {
  const [errorMsg, setErrorMsg] = useState(null);
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const scannerRef = useRef(null);
  const isStoppingRef = useRef(false);

  useEffect(() => {
    if (!isOpen) return;

    let html5QrCode = null;
    isStoppingRef.current = false;
    setErrorMsg(null);

    const startScanner = async () => {
      try {
        const viewEl = document.getElementById('f100-scanner-view');
        if (!viewEl) return;

        html5QrCode = new Html5Qrcode('f100-scanner-view', {
          verbose: false,
          formatsToSupport: [
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.QR_CODE
          ]
        });
        scannerRef.current = html5QrCode;

        const config = {
          fps: 20,
          qrbox: (viewfinderWidth, viewfinderHeight) => {
            const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
            const boxWidth = Math.max(260, Math.floor(minEdge * 0.85));
            const boxHeight = Math.max(160, Math.floor(boxWidth * 0.6));
            return { width: boxWidth, height: boxHeight };
          },
          aspectRatio: 1.3333
        };

        await html5QrCode.start(
          { facingMode: 'environment' },
          config,
          (decodedText) => {
            if (isStoppingRef.current) return;
            isStoppingRef.current = true;

            // Trigger haptic pulse
            try {
              if (window.navigator?.vibrate) window.navigator.vibrate(80);
            } catch {}

            // Cleanly stop camera and deliver barcode
            html5QrCode
              .stop()
              .then(() => {
                onScan(decodedText.trim());
                onClose();
              })
              .catch(() => {
                onScan(decodedText.trim());
                onClose();
              });
          },
          () => {
            // Frame scanned, no barcode found yet
          }
        );

        // Check if camera supports torch
        try {
          const track = html5QrCode.getRunningTrackCameraCapabilities();
          if (track && track.torchFeature && track.torchFeature().isSupported()) {
            setHasTorch(true);
          }
        } catch {}
      } catch (err) {
        console.error('Failed to start F100 camera scanner:', err);
        setErrorMsg('Unable to access camera. Check device camera permissions.');
      }
    };

    // Small delay to allow modal DOM container to paint
    const timer = setTimeout(startScanner, 120);

    return () => {
      clearTimeout(timer);
      if (scannerRef.current && scannerRef.current.isScanning) {
        isStoppingRef.current = true;
        scannerRef.current.stop().catch(() => {}).finally(() => {
          try {
            scannerRef.current.clear();
          } catch {}
        });
      }
    };
  }, [isOpen, onScan, onClose]);

  // Toggle Torch / Flashlight
  const toggleTorch = async () => {
    if (!scannerRef.current || !hasTorch) return;
    try {
      const nextTorch = !torchOn;
      await scannerRef.current.applyVideoConstraints({
        advanced: [{ torch: nextTorch }]
      });
      setTorchOn(nextTorch);
    } catch (e) {
      console.warn('Torch toggle not supported:', e);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 500,
        backgroundColor: '#000000',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        userSelect: 'none'
      }}
    >
      {/* Header Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 20px',
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          color: 'white',
          zIndex: 10
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ScanLine size={20} color="#38bdf8" />
          <div>
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800 }}>Direct Barcode Scanner</h3>
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>Point at any EAN-13, UPC, or Code128</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {hasTorch && (
            <button
              type="button"
              onClick={toggleTorch}
              style={{
                backgroundColor: torchOn ? '#fbbf24' : 'rgba(255, 255, 255, 0.15)',
                color: torchOn ? '#0f172a' : '#ffffff',
                border: 'none',
                borderRadius: '8px',
                padding: '8px 12px',
                fontWeight: 700,
                fontSize: '12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <Flashlight size={16} />
              <span>{torchOn ? 'Torch ON' : 'Torch'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.2)',
              color: 'white',
              border: 'none',
              borderRadius: '50%',
              width: '36px',
              height: '36px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Main Viewfinder Area */}
      <div
        style={{
          flex: 1,
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          backgroundColor: '#000000'
        }}
      >
        {/* Error Notification */}
        {errorMsg && (
          <div
            style={{
              position: 'absolute',
              top: '20px',
              left: '20px',
              right: '20px',
              backgroundColor: '#ef4444',
              color: 'white',
              padding: '12px 16px',
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '13px',
              fontWeight: 700,
              zIndex: 20
            }}
          >
            <AlertCircle size={18} />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Video stream container element rendered by Html5Qrcode */}
        <div
          id="f100-scanner-view"
          style={{
            width: '100%',
            height: '100%',
            position: 'absolute',
            inset: 0
          }}
        />

        {/* Tactical Viewfinder Overlay (HUD Target with Laser Line) */}
        <div
          style={{
            position: 'absolute',
            width: '80%',
            maxWidth: '320px',
            height: '180px',
            border: '2px solid rgba(56, 189, 248, 0.8)',
            borderRadius: '16px',
            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.55)',
            pointerEvents: 'none',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '8px',
            boxSizing: 'border-box',
            zIndex: 5
          }}
        >
          {/* Animated Laser Scan Line */}
          <div
            style={{
              width: '100%',
              height: '2px',
              backgroundColor: '#ef4444',
              boxShadow: '0 0 10px #ef4444, 0 0 4px #ef4444',
              position: 'absolute',
              left: 0,
              top: '50%',
              animation: 'laserScan 1.6s ease-in-out infinite alternate'
            }}
          />

          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div style={{ width: '16px', height: '16px', borderTop: '3px solid #38bdf8', borderLeft: '3px solid #38bdf8' }} />
            <div style={{ width: '16px', height: '16px', borderTop: '3px solid #38bdf8', borderRight: '3px solid #38bdf8' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div style={{ width: '16px', height: '16px', borderBottom: '3px solid #38bdf8', borderLeft: '3px solid #38bdf8' }} />
            <div style={{ width: '16px', height: '16px', borderBottom: '3px solid #38bdf8', borderRight: '3px solid #38bdf8' }} />
          </div>
        </div>
      </div>

      {/* Footer Instructions & Manual Switch */}
      <div
        style={{
          padding: '16px 20px 24px',
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '8px',
          zIndex: 10
        }}
      >
        <span style={{ color: '#e2e8f0', fontSize: '13px', fontWeight: 700 }}>
          Align barcode inside the blue target box
        </span>
        <span style={{ color: '#94a3b8', fontSize: '11px' }}>
          Auto-detects instantly • Hardware laser trigger also active
        </span>

        <button
          type="button"
          onClick={onClose}
          style={{
            marginTop: '8px',
            width: '100%',
            maxWidth: '280px',
            backgroundColor: '#334155',
            color: 'white',
            border: 'none',
            borderRadius: '10px',
            padding: '12px',
            fontWeight: 700,
            fontSize: '13px',
            cursor: 'pointer'
          }}
        >
          Cancel & Enter Manually
        </button>
      </div>

      <style>{`
        @keyframes laserScan {
          0% { top: 15%; opacity: 0.8; }
          100% { top: 85%; opacity: 0.8; }
        }
        #f100-scanner-view video {
          object-fit: cover !important;
          width: 100% !important;
          height: 100% !important;
        }
      `}</style>
    </div>
  );
}

