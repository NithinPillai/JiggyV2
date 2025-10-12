import React from 'react';

export const Toggle = ({ value, onChange }) => (
  <div className="flex gap-4">
    <button
      onClick={() => onChange('solo')}
      className={`px-5 py-2 rounded-xl font-bold shadow-sm ${
        value === 'solo'
          ? 'bg-indigo-400 text-white'
          : 'bg-indigo-100 text-indigo-700'
      }`}
    >
      SOLO
    </button>
    <button
      onClick={() => onChange('duo')}
      disabled
      className={`px-5 py-2 rounded-xl font-bold shadow-sm ${
        value === 'duo'
          ? 'bg-indigo-400 text-white'
          : 'bg-indigo-100 text-indigo-700'
      } disabled:opacity-60`}
      title="Duo coming soon"
    >
      DUO
    </button>
  </div>
);

export const TextInput = (props) => (
  <input
    {...props}
    className={
      'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-300 ' +
      (props.className || '')
    }
  />
);
