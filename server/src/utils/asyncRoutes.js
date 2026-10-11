// Express 4 gak nangkep promise yang reject dari handler `async`. Akibatnya
// error yang gak di-try/catch (mis. pelanggaran FOREIGN KEY di SQLite) jadi
// "unhandled rejection" -- request-nya gantung, dan di Node 15+ (VPS pakai
// Node 22) proses langsung MATI, semua sesi WA ikut putus sampai PM2 restart.
//
// Patch ini bikin SEMUA handler (router.get/post/..., router.use, app.use)
// otomatis neruske promise yang reject ke next(err), jadi ditangani error
// handler JSON di index.js. Wajib di-require SEBELUM request pertama masuk
// (paling aman: baris paling atas index.js).
const Layer = require('express/lib/router/layer');

if (!Layer.prototype.__asyncPatched) {
  Layer.prototype.handle_request = function handle(req, res, next) {
    const fn = this.handle;

    // Sama persis dengan aslinya: fungsi 4 argumen = error handler, dilewati di sini.
    if (fn.length > 3) return next();

    try {
      const ret = fn(req, res, next);
      if (ret && typeof ret.then === 'function') {
        ret.then(undefined, (err) => next(err || new Error('Handler gagal tanpa pesan error')));
      }
    } catch (err) {
      next(err);
    }
  };
  Layer.prototype.__asyncPatched = true;
}

module.exports = {};
