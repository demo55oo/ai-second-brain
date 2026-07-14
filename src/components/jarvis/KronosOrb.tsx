"use client";

import { useEffect, useRef } from "react";

/**
 * KRONOS — the core. A dense rotating sphere of luminous particles with a hot
 * arc-reactor core and clean concentric HUD rings (JARVIS-style), rendered on a
 * single canvas with additive glow. Colour shifts to whichever department is
 * live; energy ramps with `intensity`.
 */

type Props = {
  color?: string;
  intensity?: number;
  pulseKey?: number;
  className?: string;
};

type Pt = { x: number; y: number; z: number };

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Fibonacci sphere — even point distribution.
function sphere(count: number): Pt[] {
  const pts: Pt[] = [];
  const phi = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const theta = phi * i;
    pts.push({ x: Math.cos(theta) * r, y, z: Math.sin(theta) * r });
  }
  return pts;
}

export default function KronosOrb({ color = "#22d3ee", intensity = 0, pulseKey = 0, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const target = useRef({ color, intensity });
  const pulse = useRef(0);

  useEffect(() => {
    target.current.color = color;
    target.current.intensity = intensity;
  }, [color, intensity]);

  useEffect(() => {
    pulse.current = 1;
  }, [pulseKey]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let w = 0;
    let h = 0;
    let dpr = 1;
    const base = sphere(900);
    const curColor: [number, number, number] = hexToRgb(color);
    let curIntensity = intensity;
    let t = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = rect.width;
      h = rect.height;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const draw = () => {
      t += reduce ? 0.0012 : 0.005;
      const tgt = hexToRgb(target.current.color);
      for (let i = 0; i < 3; i++) curColor[i] += (tgt[i] - curColor[i]) * 0.06;
      curIntensity += (target.current.intensity - curIntensity) * 0.07;
      pulse.current *= 0.93;

      const cx = (w / 2) * dpr;
      const cy = (h / 2) * dpr;
      const R = Math.min(w, h) * 0.27 * dpr;
      const energy = 0.55 + curIntensity * 0.45 + pulse.current * 0.3;
      const [cr, cg, cb] = curColor.map(Math.round);

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = "lighter";

      // ── outer aura
      const breathe = 1 + Math.sin(t * 1.6) * 0.035;
      const aura = ctx.createRadialGradient(cx, cy, R * 0.1, cx, cy, R * 2.8 * breathe);
      aura.addColorStop(0, `rgba(${cr},${cg},${cb},${0.2 * energy})`);
      aura.addColorStop(0.45, `rgba(${cr},${cg},${cb},${0.06 * energy})`);
      aura.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = aura;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // ── concentric HUD rings (perfect circles)
      const drawRing = (radius: number, alpha: number, lw: number) => {
        ctx.strokeStyle = `rgba(${cr},${cg},${cb},${alpha * energy})`;
        ctx.lineWidth = lw * dpr;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.stroke();
      };
      drawRing(R * 1.42, 0.28, 1);
      drawRing(R * 1.62, 0.12, 1);

      // rotating tick marks on the outer ring
      const ticks = 60;
      const tr1 = R * 1.42;
      const tr2 = R * 1.48;
      ctx.lineWidth = 1 * dpr;
      for (let i = 0; i < ticks; i++) {
        const a = (i / ticks) * Math.PI * 2 + t * 0.5;
        const big = i % 5 === 0;
        const r1 = big ? R * 1.38 : tr1;
        const r2 = big ? R * 1.5 : tr2;
        const al = (big ? 0.4 : 0.18) * energy;
        ctx.strokeStyle = `rgba(${cr},${cg},${cb},${al})`;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
        ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
        ctx.stroke();
      }

      // ── particle sphere (rotate around Y, tilt around X)
      const cosY = Math.cos(t);
      const sinY = Math.sin(t);
      const tilt = 0.5;
      const cosT = Math.cos(tilt);
      const sinT = Math.sin(tilt);

      for (let i = 0; i < base.length; i++) {
        const p = base[i];
        const x = p.x * cosY - p.z * sinY;
        let y = p.y;
        let z = p.x * sinY + p.z * cosY;
        const y2 = y * cosT - z * sinT;
        z = y * sinT + z * cosT;
        y = y2;

        const depth = (z + 1) / 2; // 0 back .. 1 front
        const sx = cx + x * R;
        const sy = cy + y * R;
        const size = (0.5 + depth * 2.1) * dpr;
        const alpha = Math.min(1, (0.12 + Math.pow(depth, 1.6) * 0.9) * energy);
        const wmix = depth * depth * 0.65;
        const r = Math.round(cr + (255 - cr) * wmix);
        const g = Math.round(cg + (255 - cg) * wmix);
        const b = Math.round(cb + (255 - cb) * wmix);
        ctx.beginPath();
        ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
        ctx.arc(sx, sy, size, 0, Math.PI * 2);
        ctx.fill();
      }

      // ── hot arc-reactor core
      const corePulse = 0.92 + Math.sin(t * 2.4) * 0.08;
      const coreR = R * 0.62 * corePulse;
      const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
      core.addColorStop(0, `rgba(255,255,255,${0.95 * energy})`);
      core.addColorStop(0.18, `rgba(255,255,255,${0.7 * energy})`);
      core.addColorStop(0.4, `rgba(${cr},${cg},${cb},${0.75 * energy})`);
      core.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalCompositeOperation = "source-over";
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <canvas ref={canvasRef} className={className} aria-hidden />;
}
