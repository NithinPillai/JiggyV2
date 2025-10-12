import React from 'react';

export default function Card({ className = '', children, padded = true }) {
  return (
    <div
      className={
        'bg-white rounded-2xl shadow-sm border border-gray-200 ' +
        (padded ? 'p-6 ' : '') +
        className
      }
    >
      {children}
    </div>
  );
}
