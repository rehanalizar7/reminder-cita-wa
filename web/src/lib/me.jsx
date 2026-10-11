import React, { createContext, useContext } from 'react';

// Data akun yang lagi login (hasil GET /auth/me), diisi sekali oleh
// RequireSetup di App.jsx. Role diambil dari sini -- BUKAN dari isi JWT --
// supaya kalau admin ganti role seseorang, tampilannya ikut berubah begitu
// halaman dibuka ulang, walaupun token lamanya masih nyimpen role lama.
const MeContext = createContext({ me: null, reloadMe: async () => {} });

export function MeProvider({ value, children }) {
  return <MeContext.Provider value={value}>{children}</MeContext.Provider>;
}

export function useMe() {
  return useContext(MeContext);
}

export const ROLE_LABEL = { ree: 'REE', spv: 'SPV', admin: 'Admin' };
