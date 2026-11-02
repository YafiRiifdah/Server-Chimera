import React, { useState } from 'react';
import { Eye, EyeOff } from '../icons.jsx';

/**
 * Kolom password dengan tombol lihat/sembunyikan (pola Google: ikon mata di kanan).
 * Semua prop lain diteruskan ke <input>.
 */
export default function PasswordInput({ className = '', ...props }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input {...props} type={show ? 'text' : 'password'} className={`${className} pr-10 w-full`} />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100"
        title={show ? 'Sembunyikan password' : 'Lihat password'}
        aria-label={show ? 'Sembunyikan password' : 'Lihat password'}
        aria-pressed={show}
        tabIndex={-1}
      >
        {show ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
      </button>
    </div>
  );
}
