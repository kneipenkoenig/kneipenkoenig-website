// Shared rules for the LOCAL preview. Production must enforce these in transactions.
export const defaults = Object.freeze({maxTickets:5, checkin:true, nameCutoff:24, nameReminder:true, reminderHours:48, waitPriority:false, waitBroadcast:false, offerHours:24});
export const fifteenMinuteTimes=()=>Array.from({length:96},(_,n)=>`${String(Math.floor(n/4)).padStart(2,'0')}:${String((n%4)*15).padStart(2,'0')}`);
export const normalName = value => String(value || '').normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('de-DE');
export function validateSettings(s) {
  for (const key of ['maxTickets','nameCutoff','reminderHours','offerHours']) {
    if (!Number.isInteger(s[key]) || s[key] < (key==='maxTickets'||key==='offerHours'?1:0) || s[key]>8760) throw Error('Bitte gültige ganze Zahlen für Mengen und Fristen eingeben.');
  }
  if(s.nameReminder && s.reminderHours<=s.nameCutoff) throw Error('Die Erinnerung muss vor Ablauf der Namensfrist liegen.');
}
// Convert a local Europe/Berlin wall clock to an instant, independent of browser timezone.
export function startTime(ev) {
  const wall=Date.parse(`${ev.date}T${ev.start}:00Z`); let result=wall;
  const fmt=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
  for(let n=0;n<3;n++) result += wall-Date.parse(fmt.format(new Date(result)).replace(' ','T')+'Z');
  return result;
}
export const cutoff = ev => startTime(ev)-ev.settings.nameCutoff*3600000;
export function validateName(db,eventId,name,excludeId=null) {
  const clean=String(name||'').normalize('NFKC').trim().replace(/\s+/g,' ');
  if(clean && (clean.length<2||clean.length>20)) throw Error('Teamnamen benötigen 2–20 Zeichen.');
  if(clean && db.orders.some(o=>o.eventId===eventId && o.id!==excludeId && normalName(o.team)===normalName(clean))) throw Error('Dieser Teamname ist an diesem Quizabend bereits vergeben.');
  return clean;
}
export function assignFallbacks(db,now=Date.now()) {
  let changed=false;
  for(const ev of db.events) if(now>=cutoff(ev)) {
    const used=new Set(db.orders.filter(o=>o.eventId===ev.id).map(o=>normalName(o.team)));
    for(const o of db.orders.filter(o=>o.eventId===ev.id&&!normalName(o.team))) {
      let n=1,name; do {name=`Team ${String(n++).padStart(2,'0')}`;} while(used.has(normalName(name)));
      o.team=name;o.autoName=true;used.add(normalName(name));changed=true;
    }
  }
  return changed;
}
export function remaining(db,ev,t) {
  const all=db.orders.filter(o=>o.eventId===ev.id);
  return Math.max(0,Math.min(ev.capacity-Number(ev.heldTables||0)-all.length,t.capacity-all.filter(o=>o.typeId===t.id).length,...ev.groups.filter(g=>g.ticketIds.includes(t.id)).map(g=>g.capacity-all.filter(o=>g.ticketIds.includes(o.typeId)).length)));
}
export function remainingAdmin(db,ev,t) {
  const all=db.orders.filter(o=>o.eventId===ev.id);
  return Math.max(0,Math.min(ev.capacity-all.length,t.capacity-all.filter(o=>o.typeId===t.id).length,...ev.groups.filter(g=>g.ticketIds.includes(t.id)).map(g=>g.capacity-all.filter(o=>g.ticketIds.includes(o.typeId)).length)));
}
export function whatsappLink(number,text) {
  const raw=String(number||'').trim().replace(/[\s().-]/g,'');
  if(!/^(\+|00)[1-9]\d{6,14}$/.test(raw)) return null;
  return `https://wa.me/${raw.replace(/^(\+|00)/,'')}?text=${encodeURIComponent(text)}`;
}
export function canJoin(ev,o) {return !ev.settings.checkin || o.checked;}
