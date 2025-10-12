import React from 'react';

export const PrimaryButton = ({ children, className = '', ...props }) => (
  <button
    className={
      'px-6 py-3 rounded-xl font-semibold text-white bg-indigo-400 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition ' +
      className
    }
    {...props}
  >
    {children}
  </button>
);

export const OutlineButton = ({ children, className = '', ...props }) => (
  <button
    className={
      'px-4 py-2 rounded-xl font-semibold border-2 border-indigo-300 text-indigo-600 hover:bg-indigo-50 transition disabled:opacity-60 ' +
      className
    }
    {...props}
  >
    {children}
  </button>
);

export default PrimaryButton;
