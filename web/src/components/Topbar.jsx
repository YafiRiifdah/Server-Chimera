import React, { useState, useRef, useEffect } from 'react';
import { Search, LogOut, KeyRound, HardDrive, X, Monitor, ShieldCheck, Menu } from 'lucide-react';

/**
 * Bar atas: tombol menu (layar kecil), logo, kotak pencarian global, menu profil.
 */
export default function Topbar({
  user,
  searchQuery,
  setSearchQuery,
  onSearchSubmit,
  onSearchClear,
  onLogout,
  onChangePasswordClick,
  onSessionsClick,
  onAdminClick,
  onMenuClick
}) {
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (profileRef.current && !profileRef.current.contains(event.target)) setProfileOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const menuItem = 'w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2.5 transition-colors';

  return (
    <header className="h-14 sm:h-16 bg-white border-b border-slate-200 px-2 sm:px-4 flex items-center justify-between gap-2 sm:gap-4 sticky top-0 z-30 select-none">
      <div className="flex items-center gap-2 sm:gap-3 md:w-56 shrink-0">
        <button
          onClick={onMenuClick}
          className="p-2 rounded-full hover:bg-slate-100 text-slate-600 md:hidden"
          title="Menu"
          aria-label="Buka menu navigasi"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-sky-600 to-cyan-500 flex items-center justify-center text-on-accent shadow-sm shadow-sky-200 shrink-0">
          <HardDrive className="w-5 h-5" />
        </div>
        <div className="hidden sm:flex flex-col">
          <span className="font-bold text-lg text-slate-800 tracking-tight leading-none">Chimera</span>
          <span className="text-xs text-slate-400 font-medium">Drive Pribadi</span>
        </div>
      </div>

      <form
        className="flex-1 max-w-2xl min-w-0"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          onSearchSubmit(searchQuery);
        }}
      >
        <div className="relative flex items-center">
          <Search className="w-5 h-5 text-slate-400 absolute left-3.5 pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Telusuri di Drive"
            aria-label="Telusuri di Drive"
            className="w-full bg-slate-100 hover:bg-slate-200/70 focus:bg-white text-slate-700 text-sm rounded-full pl-11 pr-10 py-2 sm:py-2.5 transition-all outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 border border-transparent [&::-webkit-search-cancel-button]:hidden"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={onSearchClear}
              className="absolute right-3 p-1 rounded-full text-slate-400 hover:bg-slate-200 hover:text-slate-700"
              title="Hapus pencarian"
              aria-label="Hapus pencarian"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </form>

      <div className="flex items-center gap-2 shrink-0">
        <div className="relative" ref={profileRef}>
          <button
            onClick={() => setProfileOpen(!profileOpen)}
            className="flex items-center gap-2 p-1.5 rounded-full hover:bg-slate-100 transition-colors focus:ring-2 focus:ring-sky-500/30"
            aria-label="Menu profil"
            aria-haspopup="menu"
            aria-expanded={profileOpen}
          >
            <div className="w-8 h-8 rounded-full bg-sky-100 text-sky-700 font-bold flex items-center justify-center text-sm border border-sky-200">
              {user?.displayName ? user.displayName.charAt(0).toUpperCase() : 'U'}
            </div>
          </button>

          {profileOpen && (
            <div
              role="menu"
              className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-xl border border-slate-100 py-3 z-50 animate-in fade-in zoom-in-95 duration-100"
            >
              <div className="px-4 py-2 border-b border-slate-100">
                <div className="font-semibold text-slate-800 truncate">{user?.displayName || 'Pengguna'}</div>
                <div className="text-xs text-slate-400 truncate">
                  @{user?.username} ({user?.role === 'admin' ? 'Admin' : 'User'})
                </div>
              </div>
              <div className="py-1">
                <button
                  role="menuitem"
                  onClick={() => {
                    setProfileOpen(false);
                    onChangePasswordClick();
                  }}
                  className={menuItem}
                >
                  <KeyRound className="w-4 h-4 text-slate-400" /> Ganti Password
                </button>
                <button
                  role="menuitem"
                  onClick={() => {
                    setProfileOpen(false);
                    onSessionsClick();
                  }}
                  className={menuItem}
                >
                  <Monitor className="w-4 h-4 text-slate-400" /> Sesi aktif
                </button>
                {user?.role === 'admin' && (
                  <button
                    role="menuitem"
                    onClick={() => {
                      setProfileOpen(false);
                      onAdminClick();
                    }}
                    className={menuItem}
                  >
                    <ShieldCheck className="w-4 h-4 text-slate-400" /> Admin
                  </button>
                )}
                <button
                  role="menuitem"
                  onClick={() => {
                    setProfileOpen(false);
                    onLogout();
                  }}
                  className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2.5 transition-colors"
                >
                  <LogOut className="w-4 h-4 text-red-500" /> Keluar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
