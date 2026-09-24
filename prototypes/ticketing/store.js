import {defaults,assignFallbacks} from './rules.js';
export const KEY='kk-ticketing-manager-demo-v1';
export const base={id:'lette',title:'Kneipenkönig LIVE – Haus Zumbült',date:'2026-10-15',start:'19:00',end:'22:15',doors:'18:30',venue:'Haus Zumbült',address:'Coesfelder Straße 44, 48653 Coesfeld-Lette',status:'published',capacity:28,description:'Ein Abend voller guter Fragen, Musik und überraschender Antworten. Ein Tisch für euer Team – inklusive Tablet.',cash:true,waitlist:true,saleStart:'2026-09-01',saleEnd:'2026-10-15',tickets:[{id:'six',name:'6er Teamtisch',description:'Ein Tisch für bis zu 6 Spieler inklusive Tablet.',price:4800,capacity:20,players:6,min:1,max:5,status:'sale',showRemaining:true},{id:'four',name:'4er Teamtisch',description:'Ein Tisch für bis zu 4 Spieler inklusive Tablet.',price:4000,capacity:8,players:4,min:1,max:5,status:'sale',showRemaining:true}],groups:[{id:'tables',name:'Quiztische',capacity:28,ticketIds:['six','four']}],bundles:[],fields:[{id:'name',label:'Name',required:true,locked:true},{id:'email',label:'E-Mail',required:true,locked:true},{id:'team',label:'Teamname',required:true,locked:true},{id:'size',label:'Gruppengröße',required:true,locked:true},{id:'phone',label:'Telefonnummer',required:false,locked:false}],confirmation:{scope:'event',subject:'Euer Quizabend steht! – {event_name}',text:'Hallo {customer_name},\nwir freuen uns auf euch! Euer Ticket findet ihr im Anhang. Bitte seid 30 Minuten vor Beginn da.\nBis bald beim Kneipenkönig!',pdf:true,apple:true,google:true},mails:[{id:'reminder',subject:'Morgen wird gerätselt!',timing:'1 Tag vorher',text:'Morgen ist euer Quizabend. Denkt an euer Ticket und einen guten Teamnamen.'}]};
export function seed(){const other=structuredClone(base);Object.assign(other,{id:'coesfeld',title:'Kneipenkönig LIVE – Brauhaus Coesfeld',venue:'Brauhaus Coesfeld',address:'Coesfeld',date:'2026-10-22',status:'draft',mails:[]});return {events:[structuredClone(base),other],orders:[{id:'DEMO-1001',eventId:'lette',typeId:'six',name:'Alex Beispiel',team:'Die Schlauberger',email:'alex@example.invalid',size:6,amount:4800,checked:false,quiz:false},{id:'DEMO-1002',eventId:'lette',typeId:'four',name:'Sam Muster',team:'Vier gewinnt',email:'sam@example.invalid',size:4,amount:4000,checked:true,quiz:true},{id:'DEMO-1003',eventId:'lette',typeId:'six',name:'Kim Demo',team:'Wissen vom Fass',email:'kim@example.invalid',size:5,amount:4800,checked:false,quiz:false}],waiters:[{eventId:'lette',name:'Chris Beispiel',size:4,offered:false}],globalConfirmation:structuredClone(base.confirmation),globalFields:structuredClone(base.fields)};}

export function loadDB(){
 let db;try{db=JSON.parse(localStorage.getItem(KEY))||seed();}catch{db=seed();}
 db.settings={...defaults,...db.settings};
 db.settings.paymentFlags??=[{id:'cashdesk',label:'Abendkasse'}];
 db.settings.emailDesign??='counter';
 db.ticketCatalog??=[{id:'four',name:'4er Teamtisch',description:'Ein Tisch für bis zu 4 Spieler inklusive Tablet.',price:4000,players:4,min:1,max:5},{id:'six',name:'6er Teamtisch',description:'Ein Tisch für bis zu 6 Spieler inklusive Tablet.',price:4800,players:6,min:1,max:5}];
 for(const ev of db.events){
   ev.settings={...defaults,...ev.settings};
   ev.heldTables??=0;
   // Legacy demo events become publication-driven; an explicit new window remains intact.
   ev.saleMode??='published';
   ev.fields=ev.fields.filter(f=>f.id!=='size');
   ev.fields.forEach(f=>{if(f.id==='team'){f.required=false;f.locked=true;}});
 }
 for(const o of db.orders){const ev=db.events.find(e=>e.id===o.eventId);o.ticketCapacity ??= ev?.tickets.find(t=>t.id===o.typeId)?.players||6;delete o.size;o.editToken??=crypto.randomUUID();o.code??=o.id;o.payment??='confirmed';}
 db.waiters.forEach(w=>{w.id??=crypto.randomUUID();w.email??='chris@example.invalid';w.whatsapp??='';w.ticketCapacity??=w.size||4;delete w.size;});
 assignFallbacks(db);return db;
}
export function saveDB(db){localStorage.setItem(KEY,JSON.stringify(db));}
