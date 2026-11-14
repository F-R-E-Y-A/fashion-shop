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

export function getDefaultDateRange(referenceDate = new Date()): { from: string; to: string } {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const toStr = formatter.format(referenceDate);
  const pastDate = new Date(referenceDate.getTime() - 29 * 24 * 60 * 60 * 1000);
  const fromStr = formatter.format(pastDate);
  return { from: fromStr, to: toStr };
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
