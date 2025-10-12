import React from 'react';
import PrimaryButton from './Buttons';

export const CountdownOverlay = ({ value }) => (
  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
    <div className="flex flex-col items-center gap-6">
      <div className="text-[180px] font-black leading-none text-indigo-300">{value}</div>
      <PrimaryButton className="pointer-events-auto">START</PrimaryButton>
    </div>
  </div>
);

export const ProgressBar = ({ segments = [], elapsed = 0, total = 1 }) => {
  return (
    <div className="w-full rounded-xl bg-gray-200">
      <div className="flex h-6 w-full overflow-hidden rounded-xl">
        {segments.map((s, i) => {
          const w = (s.dur / total) * 100 + '%';
          const colorClass =
            s.color === 'red'
              ? 'bg-red-400'
              : s.color === 'yellow'
              ? 'bg-yellow-300'
              : 'bg-green-400';
          return <div key={i} className={`h-full ${colorClass}`} style={{ width: w }} />;
        })}
      </div>
    </div>
  );
};

export const DanceTile = ({ selected, onClick, title }) => (
  <button
    onClick={onClick}
    // Show the indigo border only on hover or keyboard focus for accessibility.
    className={`flex h-36 w-36 items-center justify-center rounded-xl border-2 border-transparent bg-gray-200 shadow-inner transition hover:border-indigo-500 focus:outline-none focus:border-indigo-500`}
  >
    <span className="text-xs font-semibold text-gray-600">{title}</span>
  </button>
);
