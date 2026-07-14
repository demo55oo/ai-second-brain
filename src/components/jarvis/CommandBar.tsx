"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Microphone, Stop } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

type SR = {
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  continuous: boolean;
  interimResults: boolean;
  lang: string;
};

export default function CommandBar({
  onSubmit,
  running,
}: {
  onSubmit: (text: string) => void;
  running: boolean;
}) {
  const [value, setValue] = useState("");
  const [listening, setListening] = useState(false);
  const recRef = useRef<SR | null>(null);
  const [voiceOk, setVoiceOk] = useState(false);

  useEffect(() => {
    const Ctor =
      (window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR })
        .SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => SR }).webkitSpeechRecognition;
    if (!Ctor) return;
    setVoiceOk(true);
    const rec = new Ctor();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = "en-US";
    rec.onresult = (e) => {
      const txt = Array.from(e.results)
        .map((r) => r[0]?.transcript ?? "")
        .join("");
      setValue(txt);
    };
    rec.onend = () => setListening(false);
    recRef.current = rec;
  }, []);

  const submit = (text?: string) => {
    const t = (text ?? value).trim();
    if (!t || running) return;
    onSubmit(t);
    setValue("");
  };

  const toggleMic = () => {
    const rec = recRef.current;
    if (!rec) return;
    if (listening) {
      rec.stop();
      setListening(false);
    } else {
      setValue("");
      rec.start();
      setListening(true);
    }
  };

  return (
    <div className="flex flex-col items-center">
      <div
        className={cn(
          "flex w-full items-center gap-2 rounded-2xl border bg-[#070b14]/80 px-3 py-2.5 backdrop-blur-xl transition-colors",
          listening ? "border-rose-400/50 shadow-[0_0_30px_rgba(244,63,94,0.18)]" : "border-white/10 focus-within:border-cyan-300/40",
        )}
      >
        <span className="pl-1.5 font-mono text-[11px] tracking-widest text-cyan-300/70">›</span>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={running ? "Your CEO is working…" : "Tell the CEO what you need. It routes the rest."}
          disabled={running}
          className="min-w-0 flex-1 bg-transparent text-[14px] text-white outline-none placeholder:text-white/30 disabled:opacity-60"
        />
        {voiceOk && (
          <button
            onClick={toggleMic}
            disabled={running}
            title="Voice input"
            className={cn(
              "grid h-9 w-9 place-items-center rounded-xl transition disabled:opacity-40",
              listening ? "bg-rose-500/20 text-rose-300" : "text-white/45 hover:bg-white/5 hover:text-white",
            )}
          >
            {listening ? <Stop size={16} weight="fill" /> : <Microphone size={17} />}
          </button>
        )}
        <button
          onClick={() => submit()}
          disabled={running || !value.trim()}
          className="grid h-9 w-9 place-items-center rounded-xl bg-cyan-400/90 text-[#04121a] transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/30"
        >
          <ArrowUp size={17} weight="bold" />
        </button>
      </div>
    </div>
  );
}
