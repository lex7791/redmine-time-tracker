export function trackerLabel(name) {
  return String(name || '')
    .replace(/[\uFE0E\uFE0F\u200D\u20E3]/g, '')
    .replace(/[\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Regional_Indicator}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function trackerColor(name) {
  const tracker = name?.toLowerCase().replace(/[\uFE0E\uFE0F]/g, '').replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim();
  if (tracker === 'bug') return 'bug';
  if (tracker === 'task') return 'task';
  if (tracker === 'feature' || tracker === 'new feature') return 'feature';
  if (tracker === 'improvement') return 'improvement';
  return 'other';
}

export function monday(date) {
  const result = new Date(date);
  const day = result.getDay();
  result.setDate(result.getDate() - day + (day === 0 ? -6 : 1));
  return result;
}

export function isoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function weekDates(start) {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(date.getDate() + index);
    return date;
  });
}

export function formatTime(time, t) {
  const text = String(time).trim().toLowerCase().replace(/\s+/g, '');
  const unitMatch = text.match(/(\d+(?:\.\d+)?)([hmdw])$/i);
  const decimalMatch = text.match(/^(\d+(?:\.\d+)?)$/);
  const factors = { w: 2400, d: 480, h: 60, m: 1 };
  const totalMinutes = unitMatch ? Number(unitMatch[1]) * factors[unitMatch[2]] : decimalMatch ? Number(decimalMatch[1]) * 60 : 0;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.floor(totalMinutes % 60);
  return [hours && t('hoursShort', [String(hours)]), minutes && t('minutesShort', [String(minutes)])].filter(Boolean).join(' ') || t('zeroHours');
}
