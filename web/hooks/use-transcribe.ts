"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";

export function useTranscribe(onTranscript: (text: string) => void) {
  const { locale, t } = useI18n();
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const release = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  const start = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      streamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];
      setSeconds(0);
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        release();
        setIsRecording(false);
        const audio = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (audio.size === 0) return;
        setIsTranscribing(true);
        try {
          const data = new FormData();
          data.append("audio", audio, "voice-note.webm");
          data.append("locale", locale);
          const response = await fetch("/api/transcribe", { method: "POST", body: data });
          const result = (await response.json()) as { text?: string; error?: string };
          if (!response.ok || !result.text) throw new Error(result.error ?? t("composer.transcriptionFailed"));
          onTranscript(result.text.trim());
        } catch (transcriptionError) {
          setError(transcriptionError instanceof Error ? transcriptionError.message : t("composer.transcriptionFailed"));
        } finally {
          setIsTranscribing(false);
        }
      };
      recorder.start();
      setIsRecording(true);
      timerRef.current = setInterval(() => setSeconds((value) => value + 1), 1_000);
    } catch (recordingError) {
      release();
      setError(recordingError instanceof Error ? recordingError.message : t("composer.microphoneFailed"));
    }
  }, [locale, onTranscript, release, t]);

  const stop = useCallback(() => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }, []);

  useEffect(() => release, [release]);

  return { isRecording, isTranscribing, seconds, error, start, stop };
}
