"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

interface QrScannerProps {
  onResult: (text: string) => void;
  onError?: (err: Error) => void;
  pauseAfterScanMs?: number;
}

export function QrScanner({ onResult, onError, pauseAfterScanMs = 1500 }: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (!active || !videoRef.current) return;

    const reader = new BrowserMultiFormatReader();
    let stopped = false;
    let lastEmitAt = 0;
    const videoEl = videoRef.current;

    reader
      .decodeFromVideoDevice(undefined, videoEl, (result, err) => {
        if (stopped) return;
        if (result) {
          const now = Date.now();
          if (now - lastEmitAt < pauseAfterScanMs) return;
          lastEmitAt = now;
          onResult(result.getText());
        } else if (err && err.name !== "NotFoundException") {
          onError?.(err);
        }
      })
      .catch((err: Error) => onError?.(err));

    return () => {
      stopped = true;
      const stream = videoEl.srcObject as MediaStream | null;
      stream?.getTracks().forEach((t) => t.stop());
      videoEl.srcObject = null;
    };
  }, [active, onResult, onError, pauseAfterScanMs]);

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-black">
      <video
        ref={videoRef}
        className="aspect-square w-full object-cover"
        muted
        playsInline
        autoPlay
      />
      <div className="flex justify-end p-2">
        <button
          type="button"
          onClick={() => setActive((v) => !v)}
          className="rounded-lg bg-white/10 px-3 py-1 text-xs text-white"
        >
          {active ? "Pausar" : "Retomar"}
        </button>
      </div>
    </div>
  );
}
