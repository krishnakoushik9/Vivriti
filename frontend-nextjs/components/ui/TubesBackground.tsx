"use client";

import React, { useEffect, useRef } from "react";

interface TubesBackgroundProps {
  children?: React.ReactNode;
  className?: string;
}

export function TubesBackground({ children, className }: TubesBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let mouseX = 0;
    let mouseY = 0;
    let targetX = 0;
    let targetY = 0;
    let time = 0;

    const resize = () => {
      width = canvas.width = canvas.offsetWidth;
      height = canvas.height = canvas.offsetHeight;
      mouseX = width / 2;
      mouseY = height / 2;
      targetX = mouseX;
      targetY = mouseY;
    };
    resize();
    window.addEventListener("resize", resize);

    const onMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      targetX = e.clientX - rect.left;
      targetY = e.clientY - rect.top;
    };
    const onTouchMove = (e: TouchEvent) => {
      const rect = canvas.getBoundingClientRect();
      targetX = e.touches[0].clientX - rect.left;
      targetY = e.touches[0].clientY - rect.top;
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("touchmove", onTouchMove);

    const TUBE_COUNT = 6;
    const POINT_COUNT = 80;
    const HISTORY_LEN = 120;

    const history: { x: number; y: number }[] = Array.from(
      { length: HISTORY_LEN },
      () => ({ x: width / 2, y: height / 2 })
    );

    const tubeColors = [
      ["#3b82f6", "#6366f1"],
      ["#10b981", "#3b82f6"],
      ["#818cf8", "#10b981"],
      ["#34d399", "#6366f1"],
      ["#60a5fa", "#34d399"],
      ["#a78bfa", "#3b82f6"],
    ];

    let colors = tubeColors.slice();

    const randomizeColors = () => {
      const hues = Array.from({ length: TUBE_COUNT * 2 }, () =>
        `hsl(${Math.floor(Math.random() * 360)},90%,65%)`
      );
      colors = Array.from({ length: TUBE_COUNT }, (_, i) => [
        hues[i * 2],
        hues[i * 2 + 1],
      ]);
    };

    canvas.addEventListener("click", randomizeColors);

    const draw = () => {
      time += 0.012;

      mouseX += (targetX - mouseX) * 0.06;
      mouseY += (targetY - mouseY) * 0.06;

      history.unshift({ x: mouseX, y: mouseY });
      history.pop();

      ctx.clearRect(0, 0, width, height);

      for (let t = 0; t < TUBE_COUNT; t++) {
        const offset = (t / TUBE_COUNT) * Math.PI * 2;
        const lag = Math.floor((t / TUBE_COUNT) * (HISTORY_LEN * 0.6));
        const baseWidth = 18 - t * 1.8;
        const waveAmp = 40 + t * 18;
        const waveFreq = 0.018 + t * 0.004;

        const pts: { x: number; y: number }[] = [];
        for (let i = 0; i < POINT_COUNT; i++) {
          const hi = Math.min(lag + Math.floor((i / POINT_COUNT) * HISTORY_LEN * 0.8), HISTORY_LEN - 1);
          const h = history[hi];
          const wave = Math.sin(time + offset + i * waveFreq) * waveAmp * (i / POINT_COUNT);
          const perp = Math.cos(time * 0.7 + offset + i * waveFreq * 0.5) * waveAmp * 0.4 * (i / POINT_COUNT);
          pts.push({ x: h.x + wave, y: h.y + perp });
        }

        for (let pass = 0; pass < 3; pass++) {
          const alpha = pass === 0 ? 0.08 : pass === 1 ? 0.25 : 0.85;
          const lineW = pass === 0 ? baseWidth * 4 : pass === 1 ? baseWidth * 1.8 : baseWidth * 0.6;

          const grad = ctx.createLinearGradient(
            pts[0].x, pts[0].y,
            pts[pts.length - 1].x, pts[pts.length - 1].y
          );
          grad.addColorStop(0, colors[t][0]);
          grad.addColorStop(1, colors[t][1]);

          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          for (let i = 1; i < pts.length - 2; i++) {
            const mx = (pts[i].x + pts[i + 1].x) / 2;
            const my = (pts[i].y + pts[i + 1].y) / 2;
            ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
          }
          ctx.strokeStyle = grad;
          ctx.globalAlpha = alpha;
          ctx.lineWidth = lineW;
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.stroke();
        }
      }

      ctx.globalAlpha = 1;
      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("click", randomizeColors);
    };
  }, []);

  return (
    <div
      className={`relative w-full min-h-screen overflow-hidden bg-slate-950 ${className ?? ""}`}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full block"
        style={{ touchAction: "none" }}
      />
      <div className="relative z-10 w-full min-h-screen">
        {children}
      </div>
    </div>
  );
}
