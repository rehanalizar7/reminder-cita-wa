import React, { createContext, useCallback, useContext, useState } from 'react';

// Notifikasi popup kecil (auto-hilang sendiri) buat kasih tau berhasil/gagalnya
// aksi yang sifatnya transaksi -- submit, sinkron, import, set grup, dst.
// Dipasang sekali di root App (lihat App.jsx) biar kepake konsisten di semua
// halaman, dan tetap kebaca meski halamannya langsung pindah/redirect abis
// aksinya (mis. klaim TSUB -> langsung ke Dashboard).

const ToastContext = createContext(null);
let idCounter = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (type, message) => {
      const id = ++idCounter;
      setToasts((prev) => [...prev, { id, type, message }]);
      setTimeout(() => dismiss(id), 4000);
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}`} onClick={() => dismiss(t.id)}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// Pakai: const showToast = useToast(); showToast('success', 'Tersimpan!'); / showToast('error', err.message);
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast() harus dipanggil di dalam <ToastProvider>');
  return ctx;
}
