ALTER TABLE `ree` ADD `wa_first_connected_at` integer;--> statement-breakpoint
-- Backfill buat REE yang udah pernah nyambung SEBELUM kolom ini ada, biar gak
-- kebaca sebagai "nomor baru" padahal udah lama dipakai. Dikira-kira dari kapan
-- pesan pertama mereka tercatat (atau tanggal akun REE dibuat kalau belum pernah
-- kirim apa-apa). REE yang belum pernah connect dibiarin NULL -- nanti otomatis
-- keisi begitu mereka pertama kali sukses pairing WA.
UPDATE `ree` SET `wa_first_connected_at` = COALESCE(
  (SELECT MIN(created_at) FROM message_log WHERE message_log.ree_id = ree.id),
  ree.created_at
) WHERE wa_connected = 1 AND wa_first_connected_at IS NULL;