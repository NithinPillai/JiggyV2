import React, { useEffect, useMemo, useState, useRef } from "react";
import PrimaryButton from "./Buttons";

export const CountdownOverlay = ({ value }) => (
  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
    <div className="flex flex-col items-center gap-6">
      {/* smaller by default so it fits on laptop screens; increases on larger displays */}
      <div className="text-[96px] md:text-[160px] font-black leading-none text-indigo-300">
        {value}
      </div>
    </div>
  </div>
);

export function ProgressBar({ segments = [], elapsed = 0, total = 1 }) {
  const bars = useMemo(() => {
    if (!total || total <= 0) return [];

    // 1) Clamp each segment to elapsed (so only "so far" is colored)
    const clamped = [];
    for (const seg of segments) {
      const start = Math.max(0, seg.start);
      const end = Math.max(start, seg.start + seg.dur);
      if (start >= elapsed) continue; // not started yet
      const visEnd = Math.min(end, elapsed); // clamp to elapsed
      const visDur = visEnd - start;
      if (visDur <= 0) continue;
      clamped.push({ start, dur: visDur, color: seg.color });
    }

    // 2) Merge adjacent same-color segments (keeps DOM small & smooth)
    clamped.sort((a, b) => a.start - b.start);
    const merged = [];
    for (const seg of clamped) {
      const last = merged[merged.length - 1];
      if (
        last &&
        last.color === seg.color &&
        Math.abs(last.start + last.dur - seg.start) < 0.5
      ) {
        last.dur += seg.dur;
      } else {
        merged.push({ ...seg });
      }
    }

    // 3) Convert to percentages
    return merged.map((s) => ({
      leftPct: (s.start / total) * 100,
      widthPct: (s.dur / total) * 100,
      color: s.color,
    }));
  }, [segments, elapsed, total]);

  const colorToClass = (c) =>
    c === "green"
      ? "bg-green-500"
      : c === "yellow"
        ? "bg-yellow-400"
        : "bg-red-500";

  return (
    <div className="relative h-3 w-full overflow-hidden rounded bg-gray-200">
      {bars.map((b, i) => (
        <div
          key={i}
          className={`absolute top-0 h-full ${colorToClass(b.color)} transition-[width,left] duration-100`}
          style={{ left: `${b.leftPct}%`, width: `${b.widthPct}%` }}
        />
      ))}
      {/* optional thin elapsed hairline */}
      <div
        className="absolute top-0 h-full bg-black/10"
        style={{ width: `${(Math.min(elapsed, total) / total) * 100}%` }}
      />
    </div>
  );
}

export const DanceTile = ({ selected, onClick, title, thumb }) => {
  // treat blob: URLs (object URLs) as videos too, and any explicit video extension
  const isVideo =
    thumb &&
    typeof thumb === "string" &&
    (/\.(mp4|webm|ogg)(?:\?.*)?$/i.test(thumb) || thumb.startsWith("blob:"));
  const videoRef = React.useRef(null);

  const handleMouseEnter = () => {
    try {
      videoRef.current && videoRef.current.play();
    } catch (e) {
      // play might fail due to autoplay policy; ignore
    }
  };

  const handleMouseLeave = () => {
    try {
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.currentTime = 0;
      }
    } catch (e) {
      // ignore
    }
  };
  return (
    <button
      onClick={onClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleMouseEnter}
      onBlur={handleMouseLeave}
      // Show the indigo border only on hover or keyboard focus for accessibility.
      className={`flex h-36 w-36 flex-col items-center justify-center rounded-xl border-2 border-transparent bg-gray-200 shadow-inner transition hover:border-indigo-500 focus:outline-none focus:border-indigo-500 overflow-hidden`}
    >
      {thumb ? (
        isVideo ? (
          <video
            ref={videoRef}
            src={thumb}
            className="h-full w-full object-cover"
            muted
            loop
            playsInline
            preload="metadata"
          />
        ) : (
          <img src={thumb} alt={title} className="h-full w-full object-cover" />
        )
      ) : (
        <span className="text-xs font-semibold text-gray-600">{title}</span>
      )}
    </button>
  );
};
