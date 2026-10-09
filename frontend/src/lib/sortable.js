import React, { useMemo, useState } from "react";

// Column sorting for tables: click a heading to sort ▲ (ascending),
// click again for ▼ (descending), a third time to return to the original order.

const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

function toComparable(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  const s = String(v).trim();
  // dd/mm/yyyy or dd-mm-yyyy (optionally with time) → sortable date number
  const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:[ ,T]+(\d{1,2}):(\d{2}))?/);
  if (m) return Date.UTC(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0));
  // ISO date-time
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) { const t = Date.parse(s); if (!Number.isNaN(t)) return t; }
  return s;
}

export function compareValues(a, b) {
  const x = toComparable(a);
  const y = toComparable(b);
  if (x === "" && y !== "") return 1;
  if (y === "" && x !== "") return -1;
  if (typeof x === "number" && typeof y === "number") return x - y;
  return collator.compare(String(x), String(y));
}

// getters: { key: (row) => value }. Keys without a getter use row[key].
export function useSort(rows, getters = {}) {
  const [sort, setSort] = useState({ key: null, dir: null });
  const sorted = useMemo(() => {
    const list = Array.isArray(rows) ? rows : [];
    if (!sort.key || !sort.dir) return list;
    const get = getters[sort.key] || ((r) => r?.[sort.key]);
    const withIndex = list.map((r, i) => [r, i]);
    withIndex.sort((a, b) => {
      const c = compareValues(get(a[0]), get(b[0]));
      return (sort.dir === "asc" ? c : -c) || a[1] - b[1];
    });
    return withIndex.map((x) => x[0]);
  }, [rows, sort]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = (key) => setSort((s) => (s.key !== key ? { key, dir: "asc" } : s.dir === "asc" ? { key, dir: "desc" } : { key: null, dir: null }));
  return { sorted, sort, toggle };
}

export function SortTh({ label, k, s, style, className }) {
  const active = s.sort.key === k ? s.sort.dir : null;
  return (
    <th className={`sort-th${active ? " sorted" : ""}${className ? ` ${className}` : ""}`} style={style} onClick={() => s.toggle(k)}
      title="Click to sort (▲ ascending / ▼ descending)" aria-sort={active === "asc" ? "ascending" : active === "desc" ? "descending" : "none"}>
      <span className="sort-label">{label}</span>
      <span className="sort-arrows" aria-hidden="true">
        <span className={active === "asc" ? "on" : ""}>▲</span>
        <span className={active === "desc" ? "on" : ""}>▼</span>
      </span>
    </th>
  );
}
