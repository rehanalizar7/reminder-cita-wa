import React from 'react';
import { api } from './api';

// Data pilihan target kirim (grup, outlet, anggota tim) buat halaman Kirim &
// Jadwal. REE: grup & outlet miliknya sendiri. SPV: grup & outlet milik REE di
// timnya, plus daftar REE tim buat target "Per REE".
export async function loadTargetData(isSpv, { activeOnly }) {
  const isActive = activeOnly ? 'true' : undefined;
  if (!isSpv) {
    const [groups, outlets] = await Promise.all([api.groups(), api.outlets({ limit: 500, isActive })]);
    return { groups, outlets: outlets.items, members: [] };
  }
  const [groups, outlets, team] = await Promise.all([
    api.spvGroups(),
    api.spvOutlets({ limit: 3000, isActive }),
    api.spvTeam(),
  ]);
  return { groups, outlets: outlets.items, members: team.members };
}

function uniquePhones(list) {
  return new Set(list.map((o) => o.phone)).size;
}

// Perkiraan jumlah outlet yang bakal dikirimi. Buat SPV, nomor yang sama di dua
// REE cuma dikirimi sekali (sama seperti di server).
export function targetSummary({ targetType, outlets, groups, members, groupId, targetReeId, selectedOutlets, isSpv }) {
  let list = null;
  let count = 0;
  if (targetType === 'ALL') list = outlets;
  else if (targetType === 'REE') list = outlets.filter((o) => o.reeId === targetReeId);
  else if (targetType === 'SELECTED') list = outlets.filter((o) => selectedOutlets.has(o.id));

  if (list) {
    count = isSpv ? uniquePhones(list) : list.length;
  } else if (targetType === 'GROUP') {
    count = groups.find((g) => g.id === groupId)?.outletCount || 0;
  }

  const deduped = isSpv && list && count < list.length;
  return { count, text: `${count} outlet${deduped ? ' (nomor yang dobel cuma dikirimi sekali)' : ''}` };
}

export function groupOptionLabel(g, isSpv) {
  return isSpv ? `${g.ownerName} · ${g.name} (${g.outletCount} outlet aktif)` : `${g.name} (${g.outletCount} outlet)`;
}

export function outletOptionLabel(o, isSpv) {
  return (
    <>
      {o.name} <span className="muted">({o.phone}{isSpv && o.ownerName ? ` · ${o.ownerName}` : ''})</span>
    </>
  );
}

export function targetLabel(s, isSpv = false) {
  if (s.targetType === 'ALL') return isSpv ? 'Semua outlet tim' : 'Semua outlet';
  if (s.targetType === 'GROUP') return `Grup: ${s.groupName || '(grup dihapus)'}`;
  if (s.targetType === 'REE') return `REE: ${s.targetReeName || '(REE gak ada)'}`;
  return 'Outlet terpilih';
}
