/* Фильтрация и сортировка каталога ЖК по параметрам URL. */
window.Catalog = (function () {
  const D = window.DATA;

  const exact = ['developer', 'cls', 'location', 'building', 'finish', 'transport', 'stage', 'type', 'area', 'metro', 'highway'];

  function filter(p) {
    const rooms = (p.get('rooms') || '').split(',').filter(Boolean).map(Number);
    const pmin = parseFloat(p.get('pmin')) * 1e6 || 0;
    const pmax = parseFloat(p.get('pmax')) * 1e6 || 0;
    const year = Number(p.get('year')) || 0;
    const q = (p.get('q') || '').trim().toLowerCase();

    return D.complexes.filter((c) => {
      for (const k of exact) if (p.get(k) && c[k] !== p.get(k)) return false;
      if (year && c.year !== year) return false;
      if (p.get('parking') && !c.parking) return false;
      if (p.get('closed') && !c.closed) return false;
      if (p.get('mkad') && !c.insideMkad) return false;
      if (q && !(c.name + ' ' + c.metro + ' ' + c.area).toLowerCase().includes(q)) return false;

      // Комнатность и цена проверяются по планировкам вместе
      if (rooms.length || pmin || pmax) {
        const ok = c.layouts.some((l) => {
          const r = l.rooms >= 5 ? 5 : l.rooms;
          if (rooms.length && !rooms.includes(r)) return false;
          if ((pmin || pmax) && !l.priceFrom) return false;
          if (pmin && l.priceFrom < pmin) return false;
          if (pmax && l.priceFrom > pmax) return false;
          return true;
        });
        if (!ok) return false;
      }
      return true;
    });
  }

  function sort(list, by) {
    const price = (c) => c.minPrice || Infinity;
    const out = list.slice();
    if (by === 'price-asc') out.sort((a, b) => price(a) - price(b));
    else if (by === 'price-desc') out.sort((a, b) => (b.minPrice || 0) - (a.minPrice || 0));
    else if (by === 'year') out.sort((a, b) => a.year - b.year || a.quarter - b.quarter);
    else out.sort((a, b) => b.isNew - a.isNew);
    return out;
  }

  return { filter, sort };
})();
