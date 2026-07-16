"use client";

/**
 * Scanning with the phone's camera (BLUEPRINT §13.7a).
 *
 * The camera is **only another way of typing into the search box**. A decoded
 * barcode is handed to `onScan` and travels the exact same path a hardware
 * scanner's keystrokes take — an exact hit drops into the cart, no click. This
 * file therefore holds no pricing, no cart and no server call: it turns light
 * into digits and nothing else.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * What we read. EAN-13 is ours (§12.9) — everything else is here because a
 * supplier's own barcode on the goods is worth reading too.
 */
const NATIVE_FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39"];

/** ~8 looks per second. Fast enough to feel instant, slow enough to leave the phone alone. */
const FRAME_INTERVAL_MS = 120;

/**
 * How many barcode-free frames mean "the item has left the view" (§13.7a.4).
 *
 * The camera sees the *same* barcode ~8×/second for as long as it is held under
 * the lens, so a scan counts once per **presentation**, not per sighting: the
 * code must disappear before it can be added again. This is deliberately a count
 * of misses and **not** a timeout — a timeout re-fires while the item is still
 * sitting there (one shirt held for five seconds billed as five), and any
 * time-based guard is only ever as good as the slowest decode.
 */
const GONE_AFTER_MISSES = 3;

/**
 * A decoder we can hand the live video to. Native where it exists, ZXing where
 * it doesn't — both read an `HTMLVideoElement` directly, so there is one frame
 * loop and no hand-rolled canvas copy between them.
 */
type Decoder = {
  detect(frame: HTMLVideoElement): Promise<string[]>;
  /** Native is hardware-backed; we say which one is running so the screen can be honest. */
  kind: "native" | "zxing";
  close?: () => void;
};

type BarcodeDetectorLike = {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
};
type BarcodeDetectorCtor = {
  new (opts: { formats: string[] }): BarcodeDetectorLike;
  getSupportedFormats(): Promise<string[]>;
};

/**
 * The browser's own detector — Android Chrome. Zero bytes, no dependency, and
 * hardware-accelerated. If it cannot do EAN-13 it is no use to us, because
 * EAN-13 is what we print on our own labels.
 */
async function nativeDecoder(): Promise<Decoder | null> {
  const Ctor = (globalThis as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
  if (!Ctor) return null;
  try {
    const supported = await Ctor.getSupportedFormats();
    const formats = NATIVE_FORMATS.filter((f) => supported.includes(f));
    if (!formats.includes("ean_13")) return null;
    const detector = new Ctor({ formats });
    return {
      kind: "native",
      detect: async (frame) => {
        const found = await detector.detect(frame);
        return found.map((b) => b.rawValue).filter(Boolean);
      },
    };
  } catch {
    return null;
  }
}

/**
 * The fallback, for WebKit — every iOS browser is WebKit, and WebKit has no
 * BarcodeDetector. Loaded with a dynamic import so it lands in its own chunk:
 * an Android till never downloads a byte of it (§13.7a.3).
 */
async function zxingDecoder(): Promise<Decoder> {
  const { BrowserMultiFormatReader, DecodeHintType, BarcodeFormat } = await import(
    "@zxing/library"
  );
  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.UPC_A,
    BarcodeFormat.UPC_E,
    BarcodeFormat.CODE_128,
    BarcodeFormat.CODE_39,
  ]);
  const reader = new BrowserMultiFormatReader(hints);
  return {
    kind: "zxing",
    detect: async (frame) => {
      try {
        // Throws NotFoundException on a frame with no barcode — i.e. most frames.
        return [reader.decode(frame).getText()];
      } catch {
        return [];
      }
    },
    close: () => reader.reset(),
  };
}

/**
 * A short blip and a tick of haptics, both generated — no sound file to host,
 * the same ethos as drawing the barcode itself as SVG (§13.7a.6).
 */
function useFeedback() {
  const ctxRef = useRef<AudioContext | null>(null);

  return useCallback(() => {
    try {
      navigator.vibrate?.(40);
    } catch {
      /* haptics are a nicety, never a failure */
    }
    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      // Built on the tap that opened the dialog, so iOS lets it make a sound.
      const ctx = (ctxRef.current ??= new Ctor());
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 1760;
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.08);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.08);
    } catch {
      /* a silent till still sells */
    }
  }, []);
}

type Props = {
  /** Handed the decoded digits — nothing else. */
  onScan: (code: string) => void;
};

export function BarcodeScanner({ onScan }: Props) {
  const [open, setOpen] = useState(false);
  /** null = we could not ask (no `mediaDevices`), so we show the button and explain on tap. */
  const [hasCamera, setHasCamera] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [decoderKind, setDecoderKind] = useState<Decoder["kind"] | null>(null);
  const [lastHit, setLastHit] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const decoderRef = useRef<Decoder | null>(null);
  /** The code currently under the lens, and how many frames since we last saw it. */
  const activeRef = useRef<string | null>(null);
  const missesRef = useRef(0);
  const beep = useFeedback();

  // The frame loop is set up once, when the dialog opens; `onScan` is a prop and
  // may change identity on any render after that. Reading it through a ref means
  // a scan always reaches the *current* handler, never the one that happened to
  // exist when the camera started.
  const onScanRef = useRef(onScan);
  useEffect(() => {
    onScanRef.current = onScan;
  });

  /**
   * Every frame reports what it saw — a code, or nothing. One presentation of an
   * item is one cart line (§13.7a.4): the barcode has to leave the view before
   * the same one counts again. A *different* code is taken at once, so a basket
   * can be scanned as fast as the items can be moved under the lens.
   */
  const onSighting = useCallback(
    (code: string | null) => {
      if (!code) {
        if (++missesRef.current >= GONE_AFTER_MISSES) activeRef.current = null;
        return;
      }
      missesRef.current = 0;
      if (code === activeRef.current) return; // the same item, still being held
      activeRef.current = code;

      beep();
      setLastHit(code);
      setFlash(true);
      setTimeout(() => setFlash(false), 150);
      onScanRef.current(code);
    },
    [beep],
  );

  // No door onto nothing (§25): a device with no camera at all gets no button.
  // We only hide when we *know* — being unable to ask is not the same as "none".
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!navigator.mediaDevices?.enumerateDevices) return; // stays null → button shows
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (alive) setHasCamera(devices.some((d) => d.kind === "videoinput"));
      } catch {
        /* leave it unknown */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  /** Let the camera go. A till that holds the lens open drains the phone (§13.7a.5). */
  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    decoderRef.current?.close?.();
    decoderRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => stop, [stop]);

  useEffect(() => {
    if (!open) {
      stop();
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    (async () => {
      setError(null);
      setStarting(true);
      setLastHit(null);
      activeRef.current = null;
      missesRef.current = 0;

      // Every refusal explains itself (§13.7a.8) — a dead viewfinder with no
      // message is the worst thing to hand a cashier.
      if (!window.isSecureContext) {
        setError(
          "The camera only works on a secure (HTTPS) address. Open MPoS on its https:// address rather than a plain IP, and try again.",
        );
        setStarting(false);
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("This browser cannot open a camera. Use the search box, or a Bluetooth scanner.");
        setStarting(false);
        return;
      }

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          // The rear camera is the one pointing at the goods.
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      } catch (e) {
        const name = (e as DOMException)?.name;
        setError(
          name === "NotAllowedError"
            ? "Camera permission was refused. Allow camera access for this site in your browser settings, then try again."
            : name === "NotFoundError" || name === "OverconstrainedError"
              ? "No camera was found on this device."
              : "The camera could not be started. Use the search box, or a Bluetooth scanner.",
        );
        setStarting(false);
        return;
      }

      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;

      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        try {
          await video.play();
        } catch {
          /* autoplay refusal — the frames still arrive */
        }
      }

      let decoder: Decoder;
      try {
        decoder = (await nativeDecoder()) ?? (await zxingDecoder());
      } catch {
        setError("The barcode reader could not be loaded. Use the search box, or a Bluetooth scanner.");
        setStarting(false);
        return;
      }
      if (cancelled) return;
      decoderRef.current = decoder;
      setDecoderKind(decoder.kind);
      setStarting(false);

      // One loop, either decoder: hand it the live video once there are frames in it.
      const tick = async () => {
        if (cancelled) return;
        const v = videoRef.current;
        if (v && v.readyState >= 2 && v.videoWidth > 0) {
          try {
            const codes = await decoderRef.current?.detect(v);
            // Report the miss too: that is how we know the item has left.
            if (!cancelled) onSighting(codes?.[0] ?? null);
          } catch {
            /* a frame that will not decode is the normal case, not an error */
            if (!cancelled) onSighting(null);
          }
        }
        if (!cancelled) timer = setTimeout(tick, FRAME_INTERVAL_MS);
      };
      tick();
    })();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      stop();
    };
  }, [open, stop, onSighting]);

  if (hasCamera === false) return null;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="h-12 shrink-0 gap-2"
        onClick={() => setOpen(true)}
        title="Scan with the camera"
      >
        <Camera className="size-4" />
        <span className="hidden sm:inline">Scan</span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Scan a barcode</DialogTitle>
            <DialogDescription>
              Point the camera at the barcode. Each item goes straight into the cart — keep scanning.
            </DialogDescription>
          </DialogHeader>

          {error ? (
            <div className="flex items-start gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
              <CameraOff className="mt-0.5 size-4 shrink-0 text-destructive" />
              <p className="text-muted-foreground">{error}</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="relative overflow-hidden rounded-md border bg-black">
                <video
                  ref={videoRef}
                  className="aspect-[4/3] w-full object-cover"
                  muted
                  playsInline
                  autoPlay
                />
                {/* The frame to aim with. Purely a sight — we decode the whole image. */}
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="h-24 w-[78%] rounded-md border-2 border-primary/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
                </div>
                {flash && <div className="pointer-events-none absolute inset-0 bg-primary/40" />}
                {starting && (
                  <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/60 text-sm text-white">
                    <Loader2 className="size-4 animate-spin" />
                    Starting the camera…
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {lastHit ? (
                    <>
                      Added <span className="font-mono text-foreground">{lastHit}</span>
                    </>
                  ) : (
                    "Waiting for a barcode…"
                  )}
                </span>
                {decoderKind && (
                  <span className="tabular-nums">
                    {decoderKind === "native" ? "Fast reader" : "Compatibility reader"}
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
