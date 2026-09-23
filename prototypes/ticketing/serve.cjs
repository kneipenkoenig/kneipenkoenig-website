// Local preview only. Serves the prototype plus its existing image/font assets.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png','.woff2':'font/woff2'};
http.createServer((req,res)=>{
  let url;
  try { url = decodeURIComponent(new URL(req.url,'http://localhost').pathname); } catch {res.writeHead(400).end();return;}
  if(url==='/'){res.writeHead(302,{Location:'/prototypes/ticketing/'}).end();return;}
  if(url.endsWith('/'))url+='index.html';
  const allowed = /^\/prototypes\/ticketing\/(index\.html|style\.css|app\.js|store\.js|rules\.js|manager\.html|manager\.css|manager\.js|demo-qr\.svg)$/.test(url) || /^\/(images|fonts)\//.test(url) || url==='/favicon.svg';
  const file=path.resolve(root,'.'+url);
  if(!allowed || !file.startsWith(root+path.sep)){res.writeHead(404).end();return;}
  fs.readFile(file,(err,data)=>{if(err){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(data);});
}).listen(8766,'127.0.0.1',()=>console.log('Ticketing preview: http://127.0.0.1:8766/'));
