"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Square, X } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { formatDuration } from "@/lib/utils";

const MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg;codecs=opus"];

export function canRecordAudio() {
  return typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";
}

/** Inline recorder. Starts on mount; calls onDone with an audio File, or onCancel. */
export function VoiceRecorder({ onDone, onCancel }: { onDone: (file: File) => void; onCancel: () => void }) {
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const cancelledRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    let raf = 0;
    let audioCtx: AudioContext | null = null;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        const mimeType = MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported?.(m));
        const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        recorderRef.current = recorder;
        recorder.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
        recorder.onstop = () => {
          stream.getTracks().forEach((t) => t.stop());
          if (cancelledRef.current) return;
          const type = recorder.mimeType || mimeType || "audio/webm";
          const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
          const blob = new Blob(chunksRef.current, { type });
          onDone(new File([blob], `Voice note ${format(new Date(), "yyyy-MM-dd HH.mm")}.${ext}`, { type }));
        };
        recorder.start(250);
        const started = Date.now();
        timer = setInterval(() => setSeconds((Date.now() - started) / 1000), 200);

        // Simple input level meter.
        audioCtx = new AudioContext();
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        audioCtx.createMediaStreamSource(stream).connect(analyser);
        const buf = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          analyser.getByteTimeDomainData(buf);
          let peak = 0;
          for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
          setLevel(peak / 128);
          raf = requestAnimationFrame(tick);
        };
        tick();
      } catch {
        toast.error("Microphone unavailable. Check the browser's microphone permission.");
        onCancel();
      }
    })();

    return () => {
      clearInterval(timer);
      cancelAnimationFrame(raf);
      void audioCtx?.close();
      if (recorderRef.current?.state === "recording") {
        cancelledRef.current = true;
        recorderRef.current.stop();
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stop() {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }

  function cancel() {
    cancelledRef.current = true;
    stop();
    onCancel();
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2.5 animate-fade-up" role="status" aria-live="polite">
      <span className="relative grid size-8 place-items-center">
        <span className="absolute inset-0 rounded-full bg-destructive/20" style={{ transform: `scale(${1 + level * 1.4})` }} />
        <Mic className="relative size-4 text-destructive" />
      </span>
      <span className="flex-1 text-sm font-medium tabular-nums">Recording · {formatDuration(seconds)}</span>
      <button type="button" onClick={cancel} className="rounded-md p-1.5 text-muted-foreground hover:bg-accent" aria-label="Discard recording">
        <X className="size-4" />
      </button>
      <button
        type="button"
        onClick={stop}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-destructive px-3 text-sm font-medium text-white"
      >
        <Square className="size-3 fill-current" /> Stop
      </button>
    </div>
  );
}
