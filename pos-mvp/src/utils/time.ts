/**
 * Master Regional Time Management for Kingdom of Bahrain
 * Client & Server Authority: Asia/Bahrain (Arabian Standard Time, AST)
 * UTC Offset: +03:00 (Fixed, no Daylight Saving Time)
 */

export const REGIONAL_TIMEZONE = 'Asia/Bahrain';
export const REGIONAL_OFFSET_HOURS = 3;
export const REGIONAL_OFFSET_STRING = '+03:00';
export const REGIONAL_OFFSET_MS = 3 * 60 * 60 * 1000;

const CLOCK_OFFSET_STORAGE_KEY = 'pos_clock_skew_offset_ms';

let inMemoryClockOffsetMs: number = (() => {
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(CLOCK_OFFSET_STORAGE_KEY);
      if (stored !== null) {
        const parsed = parseInt(stored, 10);
        if (!isNaN(parsed)) return parsed;
      }
    } catch { }
  }
  return 0;
})();

/**
 * Returns current clock drift offset between local device hardware clock and Central Server (in ms)
 */
export function getClockOffsetMs(): number {
  return inMemoryClockOffsetMs;
}

/**
 * Sets and persists the calibrated clock drift offset
 */
export function setClockOffsetMs(offset: number): void {
  inMemoryClockOffsetMs = Math.round(offset);
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(CLOCK_OFFSET_STORAGE_KEY, String(inMemoryClockOffsetMs));
    } catch { }
  }
}

/**
 * Returns the synchronized millisecond epoch (calibrated to the Central Master Server)
 */
export function getSynchronizedEpoch(): number {
  return Date.now() + inMemoryClockOffsetMs;
}

/**
 * Returns a new Date object representing the synchronized Master Server time
 */
export function getSynchronizedDate(): Date {
  return new Date(getSynchronizedEpoch());
}

/**
 * Calibrates clock drift from any server heartbeat or telemetry packet
 */
export function updateClockOffsetFromHeartbeat(serverEpoch: number): void {
  if (!serverEpoch || isNaN(serverEpoch)) return;
  const localNow = Date.now();
  const estimatedOffset = Math.round(serverEpoch - localNow);
  const current = getClockOffsetMs();
  if (Math.abs(estimatedOffset - current) > 750) {
    setClockOffsetMs(estimatedOffset);
  }
}

/**
 * Active SNTP Clock Synchronization across LAN / Cloud endpoints
 */
export async function syncClockWithMasterServer(candidateUrls?: string[]): Promise<number> {
  const candidates = candidateUrls || [
    typeof window !== 'undefined' ? localStorage.getItem('master_server_url') : null,
    'http://localhost:3000',
    'http://192.168.8.7:3000',
    'https://askar-edge-api.askar.workers.dev',
    'https://askar-edge-api.layali-askar-pos.workers.dev'
  ].filter(Boolean) as string[];

  for (const base of candidates) {
    try {
      const t0 = Date.now();
      const res = await fetch(`${base}/api/time`, {
        signal: AbortSignal.timeout(3000),
        headers: { 'Cache-Control': 'no-cache' }
      });
      const t3 = Date.now();
      if (!res.ok) continue;

      const data = await res.json();
      if (typeof data?.serverEpoch === 'number') {
        const rtt = t3 - t0;
        const calculatedOffset = Math.round(data.serverEpoch - (t0 + t3) / 2);
        const current = getClockOffsetMs();
        const diff = Math.abs(calculatedOffset - current);
        const finalOffset = diff > 500 ? calculatedOffset : Math.round(current * 0.3 + calculatedOffset * 0.7);
        setClockOffsetMs(finalOffset);
        console.log(`⏱️ [Virtual Clock] Synchronized with ${base} (RTT: ${rtt}ms, Clock Offset: ${finalOffset}ms)`);
        return finalOffset;
      }
    } catch { }
  }
  return getClockOffsetMs();
}

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
    d = getSynchronizedDate();
  } else if (typeof sourceDate === 'number') {
    d = new Date(sourceDate);
  } else if (typeof sourceDate === 'string') {
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(sourceDate)) {
      d = new Date(sourceDate.replace(' ', 'T') + REGIONAL_OFFSET_STRING);
    } else {
      d = new Date(sourceDate);
    }
  } else {
    d = sourceDate;
  }

  if (isNaN(d.getTime())) {
    d = getSynchronizedDate();
  }

  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: REGIONAL_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
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
  if (hour === '24') hour = '00';
  const minute = map['minute'] || '00';
  const second = map['second'] || '00';
  const fractionalSecond = String(d.getMilliseconds()).padStart(3, '0');

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
  const d = sourceDate ? (sourceDate instanceof Date ? sourceDate : new Date(sourceDate)) : getSynchronizedDate();
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
  const d = sourceDate ? (sourceDate instanceof Date ? sourceDate : new Date(sourceDate)) : getSynchronizedDate();
  return d.toLocaleDateString('en-GB', {
    timeZone: REGIONAL_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

/**
 * Returns formatted date + time for NBR retail receipts:
 * e.g. "14/11/2026, 02:40 AM"
 */
export function getRegionalReceiptDateTime(sourceDate?: Date | number | string | null): string {
  const d = sourceDate ? (sourceDate instanceof Date ? sourceDate : new Date(sourceDate)) : getSynchronizedDate();
  return d.toLocaleString('en-GB', {
    timeZone: REGIONAL_TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}

/**
 * Validates and ensures a timestamp is in regional ISO (+03:00) format.
 */
export function ensureRegionalIso(source?: string | number | Date | null): string {
  if (!source) return getRegionalIsoString();
  return getRegionalIsoString(source);
}

/**
 * Calculates start-of-day and end-of-day in Asia/Bahrain
 */
export function getRegionalDayRange(targetDate?: Date | string | number | null) {
  const p = getRegionalParts(targetDate);
  const dateStr = p.dateOnly;

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
