/**
 * Master Regional Time Management for Kingdom of Bahrain
 * Central Server Authority: Asia/Bahrain (Arabian Standard Time, AST)
 * UTC Offset: +03:00 (Fixed, no Daylight Saving Time)
 */

export const REGIONAL_TIMEZONE = 'Asia/Bahrain';
export const REGIONAL_OFFSET_HOURS = 3;
export const REGIONAL_OFFSET_STRING = '+03:00';
export const REGIONAL_OFFSET_MS = 3 * 60 * 60 * 1000;

export interface RegionalDateParts {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
  fractionalSecond: string;
  dateOnly: string;      // YYYY-MM-DD
  timeOnly: string;      // HH:mm:ss
  timeNoSeconds: string; // HH:mm
}

/**
 * Extracts date/time parts strictly in the Asia/Bahrain timezone
 */
export function getRegionalParts(sourceDate?: Date | number | string | null): RegionalDateParts {
  let d: Date;
  if (!sourceDate) {
    d = new Date();
  } else if (typeof sourceDate === 'number') {
    d = new Date(sourceDate);
  } else if (typeof sourceDate === 'string') {
    // If it's pure YYYY-MM-DD HH:mm:ss without timezone, treat as regional
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(sourceDate)) {
      d = new Date(sourceDate.replace(' ', 'T') + REGIONAL_OFFSET_STRING);
    } else {
      d = new Date(sourceDate);
    }
  } else {
    d = sourceDate;
  }

  if (isNaN(d.getTime())) {
    d = new Date();
  }

  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: REGIONAL_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
    hour12: false,
  });

  const parts = formatter.formatToParts(d);
  const map: Record<string, string> = {};
  for (const p of parts) {
    map[p.type] = p.value;
  }

  const year = map['year'] || '2026';
  const month = map['month'] || '01';
  const day = map['day'] || '01';
  let hour = map['hour'] || '00';
  // Handle 24-hour edge cases in some runtimes where midnight formats as '24'
  if (hour === '24') hour = '00';
  const minute = map['minute'] || '00';
  const second = map['second'] || '00';
  const fractionalSecond = map['fractionalSecond'] || '000';

  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    fractionalSecond,
    dateOnly: `${year}-${month}-${day}`,
    timeOnly: `${hour}:${minute}:${second}`,
    timeNoSeconds: `${hour}:${minute}`,
  };
}

/**
 * Generates an ISO 8601 string strictly in Asia/Bahrain time (+03:00):
 * e.g. "2026-11-14T02:40:45.123+03:00"
 */
export function getRegionalIsoString(sourceDate?: Date | number | string | null): string {
  const p = getRegionalParts(sourceDate);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}.${p.fractionalSecond}${REGIONAL_OFFSET_STRING}`;
}

/**
 * Generates SQL timestamp string in Asia/Bahrain time:
 * e.g. "2026-11-14 02:40:45"
 */
export function getRegionalSqlTimestamp(sourceDate?: Date | number | string | null): string {
  const p = getRegionalParts(sourceDate);
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

/**
 * Returns formatted 12-hour time in Bahrain (e.g. "02:40:45 AM")
 */
export function getRegionalFormattedTime(sourceDate?: Date | number | string | null): string {
  const d = sourceDate ? new Date(sourceDate) : new Date();
  return d.toLocaleTimeString('en-US', {
    timeZone: REGIONAL_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}

/**
 * Returns formatted date in Bahrain (e.g. "14/11/2026")
 */
export function getRegionalFormattedDate(sourceDate?: Date | number | string | null): string {
  const d = sourceDate ? new Date(sourceDate) : new Date();
  return d.toLocaleDateString('en-GB', {
    timeZone: REGIONAL_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

/**
 * Validates and ensures a timestamp is in regional ISO (+03:00) format.
 * If incoming string has 'Z' or no timezone, converts it to regional AST time.
 */
export function ensureRegionalIso(source?: string | number | Date | null): string {
  if (!source) return getRegionalIsoString();
  return getRegionalIsoString(source);
}

/**
 * Calculates start-of-day and end-of-day in Asia/Bahrain:
 * start: "2026-11-14T00:00:00.000+03:00" (UTC: 2026-11-13T21:00:00.000Z)
 * end: "2026-11-14T23:59:59.999+03:00"   (UTC: 2026-11-14T20:59:59.999Z)
 */
export function getRegionalDayRange(targetDate?: Date | string | number | null) {
  const p = getRegionalParts(targetDate);
  const dateStr = p.dateOnly; // "YYYY-MM-DD"

  const startRegionalIso = `${dateStr}T00:00:00.000${REGIONAL_OFFSET_STRING}`;
  const endRegionalIso = `${dateStr}T23:59:59.999${REGIONAL_OFFSET_STRING}`;

  const startEpoch = new Date(startRegionalIso).getTime();
  const endEpoch = new Date(endRegionalIso).getTime();

  return {
    dateOnly: dateStr,
    startIso: startRegionalIso,
    endIso: endRegionalIso,
    startUtcIso: new Date(startEpoch).toISOString(),
    endUtcIso: new Date(endEpoch).toISOString(),
    startEpoch,
    endEpoch,
    startSql: `${dateStr} 00:00:00`,
    endSql: `${dateStr} 23:59:59`,
  };
}

/**
 * Resolves period bounds strictly in Asia/Bahrain time (+03:00)
 */
export function getRegionalPeriodRange(
  period?: string,
  queryStartDate?: string | null,
  queryEndDate?: string | null
): {
  startIso: string;
  endIso: string;
  startUtcIso: string;
  endUtcIso: string;
  startDateStr: string;
  endDateStr: string;
} {
  const now = new Date();
  const nowParts = getRegionalParts(now);

  let startIso: string;
  let endIso: string;

  if (queryStartDate && queryEndDate) {
    const sTrim = queryStartDate.trim();
    const eTrim = queryEndDate.trim();
    startIso = sTrim.length === 10 ? `${sTrim}T00:00:00.000${REGIONAL_OFFSET_STRING}` : ensureRegionalIso(sTrim);
    endIso = eTrim.length === 10 ? `${eTrim}T23:59:59.999${REGIONAL_OFFSET_STRING}` : ensureRegionalIso(eTrim);
  } else if (queryStartDate) {
    const sTrim = queryStartDate.trim();
    startIso = sTrim.length === 10 ? `${sTrim}T00:00:00.000${REGIONAL_OFFSET_STRING}` : ensureRegionalIso(sTrim);
    endIso = `${nowParts.dateOnly}T23:59:59.999${REGIONAL_OFFSET_STRING}`;
  } else {
    const p = (period || 'day').toLowerCase();
    if (p === 'day' || p === 'today') {
      startIso = `${nowParts.dateOnly}T00:00:00.000${REGIONAL_OFFSET_STRING}`;
      endIso = `${nowParts.dateOnly}T23:59:59.999${REGIONAL_OFFSET_STRING}`;
    } else if (p === 'yesterday') {
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const yParts = getRegionalParts(yesterday);
      startIso = `${yParts.dateOnly}T00:00:00.000${REGIONAL_OFFSET_STRING}`;
      endIso = `${yParts.dateOnly}T23:59:59.999${REGIONAL_OFFSET_STRING}`;
    } else if (p === 'week') {
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const wParts = getRegionalParts(sevenDaysAgo);
      startIso = `${wParts.dateOnly}T00:00:00.000${REGIONAL_OFFSET_STRING}`;
      endIso = `${nowParts.dateOnly}T23:59:59.999${REGIONAL_OFFSET_STRING}`;
    } else if (p === 'month') {
      startIso = `${nowParts.year}-${nowParts.month}-01T00:00:00.000${REGIONAL_OFFSET_STRING}`;
      endIso = `${nowParts.dateOnly}T23:59:59.999${REGIONAL_OFFSET_STRING}`;
    } else if (p === 'year') {
      startIso = `${nowParts.year}-01-01T00:00:00.000${REGIONAL_OFFSET_STRING}`;
      endIso = `${nowParts.dateOnly}T23:59:59.999${REGIONAL_OFFSET_STRING}`;
    } else if (p === 'all') {
      startIso = `1970-01-01T00:00:00.000${REGIONAL_OFFSET_STRING}`;
      endIso = `${nowParts.dateOnly}T23:59:59.999${REGIONAL_OFFSET_STRING}`;
    } else {
      startIso = `${nowParts.dateOnly}T00:00:00.000${REGIONAL_OFFSET_STRING}`;
      endIso = `${nowParts.dateOnly}T23:59:59.999${REGIONAL_OFFSET_STRING}`;
    }
  }

  const startUtcIso = new Date(startIso).toISOString();
  const endUtcIso = new Date(endIso).toISOString();

  return {
    startIso,
    endIso,
    startUtcIso,
    endUtcIso,
    startDateStr: startIso.slice(0, 10),
    endDateStr: endIso.slice(0, 10),
  };
}

/**
 * Comprehensive master clock metadata object returned by central server
 */
export function getMasterServerTimeInfo() {
  const now = new Date();
  const p = getRegionalParts(now);
  const iso = `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}.${p.fractionalSecond}${REGIONAL_OFFSET_STRING}`;
  const sqlTimestamp = `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;

  return {
    timezone: REGIONAL_TIMEZONE,
    offset: REGIONAL_OFFSET_STRING,
    offsetHours: REGIONAL_OFFSET_HOURS,
    serverEpoch: now.getTime(),
    iso,
    sqlTimestamp,
    date: p.dateOnly,
    formattedDate: `${p.day}/${p.month}/${p.year}`,
    formattedTime: getRegionalFormattedTime(now),
    utcIso: now.toISOString(),
  };
}
