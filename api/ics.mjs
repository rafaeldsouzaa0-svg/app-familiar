const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/\r?\n|\r/g, '\\n').replace(/([;,])/g, '\\$1');
const day = (s) => s.slice(0, 10).replaceAll('-', '');
const full = (s) => day(s) + 'T' + (s.slice(11, 16) || '00:00').replace(':', '') + '00';
const shift = (s, min) => new Date(Date.parse(s.slice(0, 10) + 'T' + (s.slice(11, 16) || '00:00') + 'Z') + min * 60000).toISOString().slice(0, 16);

// RFC 5545: at most 75 octets per line.
function fold(line) {
  const out = [];
  let cur = '', n = 0;
  for (const c of line) {
    const b = Buffer.byteLength(c);
    if (n + b > 73) { out.push(cur); cur = ' '; n = 1; }
    cur += c; n += b;
  }
  return [...out, cur].join('\r\n');
}

export function toICS(name, events) {
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//App Familiar//PT', 'CALSCALE:GREGORIAN',
    'X-WR-CALNAME:' + esc(name), 'X-WR-TIMEZONE:America/Sao_Paulo', 'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H',
    'BEGIN:VTIMEZONE', 'TZID:America/Sao_Paulo', 'BEGIN:STANDARD', 'DTSTART:19700101T000000',
    'TZOFFSETFROM:-0300', 'TZOFFSETTO:-0300', 'TZNAME:-03', 'END:STANDARD', 'END:VTIMEZONE'];
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  for (const e of events) {
    L.push('BEGIN:VEVENT', `UID:${e.id}@app-familiar`, 'DTSTAMP:' + stamp, 'SUMMARY:' + esc(e.title + (e.who ? ` (${e.who})` : '')));
    if (e.all_day) {
      const last = e.ends && e.ends.slice(0, 10) >= e.starts.slice(0, 10) ? e.ends : e.starts;
      L.push('DTSTART;VALUE=DATE:' + day(e.starts), 'DTEND;VALUE=DATE:' + day(shift(last.slice(0, 10), 1440)));
    } else {
      const end = e.ends && e.ends > e.starts ? e.ends : shift(e.starts, 60);
      L.push('DTSTART;TZID=America/Sao_Paulo:' + full(e.starts), 'DTEND;TZID=America/Sao_Paulo:' + full(end));
    }
    if (e.repeat !== 'none') L.push('RRULE:FREQ=' + e.repeat.toUpperCase());
    if (e.place) L.push('LOCATION:' + esc(e.place));
    if (e.notes) L.push('DESCRIPTION:' + esc(e.notes));
    if (e.remind_min != null) L.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + esc(e.title), `TRIGGER:-PT${e.remind_min}M`, 'END:VALARM');
    L.push('END:VEVENT');
  }
  return [...L, 'END:VCALENDAR'].map(fold).join('\r\n') + '\r\n';
}
