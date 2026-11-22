export interface ReportQueryParams {
  from: string;
  to: string;
  top: 5 | 10 | 20;
}

export function isValidCalendarDate(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const [yearStr, monthStr, dayStr] = dateStr.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  if (month < 1 || month > 12) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day >= 1 && day <= daysInMonth;
}

export function getDaysDifference(from: string, to: string): number {
  const dFrom = new Date(`${from}T00:00:00Z`).getTime();
  const dTo = new Date(`${to}T00:00:00Z`).getTime();
  return Math.round((dTo - dFrom) / (24 * 60 * 60 * 1000));
}

export type ReportPresetId = '7d' | '30d' | 'this_month' | 'last_month';

export function formatVietnamCalendarDate(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function getDefaultDateRange(referenceDate = new Date()): { from: string; to: string } {
  const toStr = formatVietnamCalendarDate(referenceDate);
  const pastDate = new Date(referenceDate.getTime() - 29 * 24 * 60 * 60 * 1000);
  const fromStr = formatVietnamCalendarDate(pastDate);
  return { from: fromStr, to: toStr };
}

/** Tính nhanh khoảng ngày theo múi giờ Việt Nam cho các nút preset trên trang báo cáo. */
export function getPresetDateRange(
  preset: ReportPresetId,
  referenceDate = new Date(),
): { from: string; to: string } {
  const todayStr = formatVietnamCalendarDate(referenceDate);
  const [year, month] = todayStr.split('-').map(Number) as [number, number];

  if (preset === '7d') {
    const start = new Date(referenceDate.getTime() - 6 * 24 * 60 * 60 * 1000);
    return { from: formatVietnamCalendarDate(start), to: todayStr };
  }
  if (preset === '30d') {
    return getDefaultDateRange(referenceDate);
  }
  if (preset === 'this_month') {
    const mm = String(month).padStart(2, '0');
    return { from: `${year}-${mm}-01`, to: todayStr };
  }
  const prevMonthYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  const mm = String(prevMonth).padStart(2, '0');
  const lastDay = new Date(Date.UTC(prevMonthYear, prevMonth, 0)).getUTCDate();
  return {
    from: `${prevMonthYear}-${mm}-01`,
    to: `${prevMonthYear}-${mm}-${String(lastDay).padStart(2, '0')}`,
  };
}

export function detectActivePreset(
  from: string,
  to: string,
  referenceDate = new Date(),
): ReportPresetId | null {
  for (const preset of ['7d', '30d', 'this_month', 'last_month'] as const) {
    const range = getPresetDateRange(preset, referenceDate);
    if (range.from === from && range.to === to) return preset;
  }
  return null;
}

export function parseReportQueryParams(searchParams: URLSearchParams): ReportQueryParams {
  const defaultRange = getDefaultDateRange();
  let from = searchParams.get('from') || defaultRange.from;
  let to = searchParams.get('to') || defaultRange.to;

  if (!isValidCalendarDate(from) || !isValidCalendarDate(to)) {
    from = defaultRange.from;
    to = defaultRange.to;
  }

  if (from > to) {
    const temp = from;
    from = to;
    to = temp;
  }

  const diff = getDaysDifference(from, to);
  if (diff > 366 || diff < 0) {
    from = defaultRange.from;
    to = defaultRange.to;
  }

  const topRaw = searchParams.get('top');
  const top: 5 | 10 | 20 = topRaw === '5' ? 5 : topRaw === '20' ? 20 : 10;

  return { from, to, top };
}

export function buildReportSearchParams(params: {
  from?: string;
  to?: string;
  top?: number;
}): string {
  const query = new URLSearchParams();
  if (params.from) query.set('from', params.from);
  if (params.to) query.set('to', params.to);
  if (params.top && params.top !== 10) query.set('top', String(params.top));
  const s = query.toString();
  return s ? `?${s}` : '';
}
