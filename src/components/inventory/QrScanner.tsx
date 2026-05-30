"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";

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
    let controls: IScannerControls | null = null;
    let lastEmitAt = 0;
    const videoEl = videoRef.current;

    // Erros emitidos por frame quando o reader não consegue decodificar
    // são esperados (câmera apontada pra qualquer coisa que não é QR).
    // Só propagar erros estruturais — não os transient de decode.
    const TRANSIENT_DECODE_ERRORS = new Set([
      "NotFoundException",
      "ChecksumException",
      "FormatException",
      "ReaderException",
    ]);
    const TRANSIENT_MSG_RE = /no\s+multi\s*format\s+readers|not\s*found|no\s+code\s+found/i;

    reader
      .decodeFromVideoDevice(undefined, videoEl, (result, err) => {
        if (stopped) return;
        if (result) {
          const now = Date.now();
          if (now - lastEmitAt < pauseAfterScanMs) return;
          lastEmitAt = now;
          onResult(result.getText());
        } else if (err) {
          if (TRANSIENT_DECODE_ERRORS.has(err.name)) return;
          if (TRANSIENT_MSG_RE.test(err.message ?? "")) return;
          onError?.(err);
        }
      })
      .then((c) => {
        if (stopped) {
          c.stop();
          return;
        }
        controls = c;
      })
      .catch((err: Error) => onError?.(err));

    return () => {
      stopped = true;
      controls?.stop();
      controls = null;
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
