import React from 'react';
import PrimaryButton from './Buttons';

export const CountdownOverlay = ({ value }) => (
  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
    <div className="flex flex-col items-center gap-6">
      {/* smaller by default so it fits on laptop screens; increases on larger displays */}
      <div className="text-[96px] md:text-[160px] font-black leading-none text-indigo-300">{value}</div>
    </div>
  </div>
);

export const ProgressBar = ({ segments = [], elapsed = 0, total = 1 }) => {
  const pct = total > 0 ? Math.min(100, (elapsed / total) * 100) : 0;
  return (
    <div className="w-full rounded-xl bg-gray-200 relative">
      <div className="flex h-6 w-full overflow-hidden rounded-xl">
        {segments.map((s, i) => {
          const w = total > 0 ? (s.dur / total) * 100 + '%' : '0%';
          const colorClass =
            s.color === 'red'
              ? 'bg-red-400'
              : s.color === 'yellow'
              ? 'bg-yellow-300'
              : 'bg-green-400';
          return <div key={i} className={`h-full ${colorClass}`} style={{ width: w }} />;
        })}
      </div>
      {/* playhead */}
      <div className="absolute top-0 left-0 h-full" style={{ width: `${pct}%`, pointerEvents: 'none' }}>
        <div className="h-full w-0.5 bg-black/80 ml-[calc(100%-0.5px)]" />
      </div>
    </div>
  );
};

export const DanceTile = ({ selected, onClick, title, thumb }) => {
  // treat blob: URLs (object URLs) as videos too, and any explicit video extension
  const isVideo = thumb && typeof thumb === 'string' && (/\.(mp4|webm|ogg)(?:\?.*)?$/i.test(thumb) || thumb.startsWith('blob:'));
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
