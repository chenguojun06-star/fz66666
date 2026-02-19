type DateInput = unknown;

const pad2 = (n: number) => String(n).padStart(2, '0');

const parseByParts = (raw: string) => {
  const s = raw.trim();
  const m = s.match(
    /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/,
  );
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hour = Number(m[4] ?? 0);
  const minute = Number(m[5] ?? 0);
  const second = Number(m[6] ?? 0);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) return null;
  return new Date(year, month - 1, day, hour, minute, second);
};

const toDate = (input: DateInput): Date | null => {
  if (input == null) return null;
  if (input instanceof Date) {
    const t = input.getTime();
    return Number.isNaN(t) ? null : new Date(t);
  }

  if (typeof input === 'number') {
    const d = new Date(input);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const anyInput = input as any;
  if (anyInput && typeof anyInput.toDate === 'function') {
    const d = anyInput.toDate();
    if (d instanceof Date && !Number.isNaN(d.getTime())) return d;
  }
  if (anyInput?.$d instanceof Date) {
    const t = anyInput.$d.getTime();
    return Number.isNaN(t) ? null : new Date(t);
  }

  const raw = String(input).trim();
  if (!raw) return null;
  const byParts = parseByParts(raw);
  if (byParts) return byParts;

  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
};

export const formatDateTime = (input: DateInput): string => {
  const d = toDate(input);
  if (!d) {
    const raw = String(input ?? '').trim();
    return raw ? raw : '-';
  }
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  return `${y}-${m}-${day} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};

export const formatDateTimeSecond = (input: DateInput): string => {
  const d = toDate(input);
  if (!d) {
    const raw = String(input ?? '').trim();
    return raw ? raw : '-';
  }
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  return `${y}-${m}-${day} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
};

export const formatDateTimeCompact = (input: DateInput): string => {
  const d = toDate(input);
  if (!d) {
    const raw = String(input ?? '').trim();
    return raw ? raw : '-';
  }
  const m = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  return `${m}-${day} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};

export const formatDate = (input: DateInput): string => {
  const d = toDate(input);
  if (!d) {
    const raw = String(input ?? '').trim();
    return raw ? raw : '-';
  }
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  return `${y}-${m}-${day}`;
};
