"use strict";
/* Nibbl shared runtime: pixel pet generator (ported from the spike), renderer,
   WebAudio sounds, fake pet data by serial, and tiny UI helpers.
   Classic script: top-level declarations are shared with the page scripts. */

/* ---------- palette ---------- */
const P={ink:'#1a1c2c',plum:'#5d275d',red:'#b13e53',orange:'#ef7d57',yellow:'#ffcd75',lime:'#a7f070',green:'#38b764',teal:'#257179',navy:'#29366f',blue:'#3b5dc9',sky:'#41a6f6',cyan:'#73eff7',white:'#f4f4f4',silver:'#94b0c2',slate:'#566c86',dusk:'#333c57'};
const RAMPS={ember:['red','orange','yellow'],moss:['teal','green','lime'],ocean:['navy','blue','sky'],frost:['blue','sky','cyan'],ghost:['slate','silver','white'],jam:['plum','red','orange']};
const SHINY={ember:'frost',moss:'jam',ocean:'moss',frost:'ember',ghost:'jam',jam:'moss'};
const REDUCED=matchMedia('(prefers-reduced-motion: reduce)').matches;
let SHINY_ALL=false; // konami easter egg
const isShiny=g=>!!(g.shiny||SHINY_ALL);
const rampOf=g=>isShiny(g)?SHINY[g.ramp]:g.ramp;

/* ---------- seeded PRNG ---------- */
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function rng(seed){const r=mulberry32(Math.imul(seed^0x9E3779B9,0x85EBCA6B)>>>0);return{random:r,choice:a=>a[Math.floor(r()*a.length)],randint:(a,b)=>a+Math.floor(r()*(b-a+1))};}
function hashText(s){let h=0x811c9dc5;for(const ch of s){h^=ch.codePointAt(0);h=Math.imul(h,0x01000193)>>>0;}return 1+(h%999999);}

/* ---------- genome ---------- */
function genome(seed,ov){
  const r=rng(seed);
  const g={
    family:r.choice(['mochi','critter','sprout']),
    w:r.choice([5,6,6,7]), h:r.choice([5,6,6,7]),
    ramp:r.choice(Object.keys(RAMPS)),
    pattern:r.choice(['none','spots','stripes','stars']),
    belly:r.random()<0.6,
    eyes:r.choice(['dot','big','wide','sleepy']),
    blush:r.random()<0.5,
    ears:r.choice(['round','pointy','bunny','none']),
    shiny:r.random()<0.04,
    seed:seed
  };
  Object.assign(g,ov||{});
  if(g.family==='sprout') g.ears='none'; // compatibility: sprouts have a leaf, no ears
  return g;
}
const grid=(w,h)=>Array.from({length:h},()=>Array(w).fill(null));

function bodyMask(g){
  const cx=7.5,cy=9.0, m=Array.from({length:16},()=>Array(16).fill(0));
  for(let y=0;y<16;y++)for(let x=0;x<16;x++){
    const dx=(x-cx)/g.w, dy=(y-cy)/g.h; let inside;
    if(g.family==='mochi') inside=dx*dx+dy*dy<=1||(y>=cy&&Math.abs(dx)<=0.92&&y<=cy+g.h-1);
    else if(g.family==='critter'){inside=dx*dx+dy*dy<=1; const ax=Math.abs(x-cx); if(y===Math.floor(cy+g.h)&&(ax===2.5||ax===3.5)) inside=true;}
    else {const k=1+Math.max(0,cy-y)/(g.h*1.6); inside=(dx*k)**2+dy*dy<=1;}
    m[y][x]=(inside&&y>=1&&y<=15)?1:0;
  }
  let top=0; while(top<16&&!m[top].some(Boolean)) top++;
  if(g.family==='sprout'){
    for(const [x,y] of [[7,top-1],[8,top-1],[8,top-2],[9,top-3],[10,top-3],[6,top-3],[7,top-2]]) if(y>=0&&y<16&&!(x===7&&y===top-2)) m[y][x]=2;
  }else if(g.ears!=='none'){
    const shapes={round:[[-3,-1],[-4,-1],[-3,-2],[-4,-2]],pointy:[[-3,-1],[-4,-1],[-4,-2],[-4,-3]],bunny:[[-3,-1],[-3,-2],[-3,-3],[-3,-4],[-4,-2],[-4,-3]]}[g.ears];
    for(const [ox,oy] of shapes) for(const x of [8+ox, 7-ox]){const y=top+1+oy; if(y>=0&&y<16&&x>=0&&x<16) m[y][x]=1;}
  }
  return m;
}

/* expr: idle | blink | happy (^ ^ eyes, blush) | eat (open mouth) | wide (surprised) */
function drawPet(g,expr){
  const ramp=RAMPS[rampOf(g)].map(c=>P[c]); const [shade,base,hi]=ramp;
  const m=bodyMask(g), px=grid(16,16);
  const inside=(x,y)=>x>=0&&x<16&&y>=0&&y<16&&m[y][x]===1;
  for(let y=0;y<16;y++)for(let x=0;x<16;x++){
    if(m[y][x]===2) px[y][x]=P.green;
    else if(m[y][x]===1){
      const tl=!inside(x-1,y)||!inside(x,y-1), br=!inside(x+1,y)||!inside(x,y+1);
      px[y][x]=tl&&!br?hi:br&&!tl?shade:base;
    }
  }
  const rows=[]; for(let y=0;y<16;y++) if(m[y].some(v=>v===1)) rows.push(y);
  const top=rows[0], bot=rows[rows.length-1], mid=Math.floor((top+bot)/2);
  const r=rng(g.seed*7+3), ey=mid-1;
  const set=(x,y,c)=>{if(inside(x,y)) px[y][x]=c;};
  if(g.belly){ // start two rows under the eyes so it never touches them
    for(let y=ey+3;y<bot;y++)for(let x=5;x<11;x++)
      if(((x-7.5)/2.6)**2+((y-(bot-1.5))/2.2)**2<=1&&inside(x,y)) px[y][x]=hi;
  }
  const safe=(x,y)=>!(y>=ey-1&&y<=ey+2&&x>=3&&x<=12); // keep face clear of pattern
  if(g.pattern==='spots'){
    for(let i=0;i<4;i++){const x=r.randint(3,12),y=r.randint(top+2,bot-2); if(inside(x,y)&&inside(x+1,y)&&safe(x,y)&&safe(x+1,y)) px[y][x]=px[y][x+1]=shade;}
  }else if(g.pattern==='stripes'){
    for(let y=top+1;y<mid-2;y+=2)for(let x=6;x<10;x++) if(inside(x,y)) px[y][x]=shade;
  }else if(g.pattern==='stars'){
    for(let i=0;i<3;i++){const x=r.randint(3,12),y=r.randint(top+2,bot-2); if(inside(x,y)&&safe(x,y)) px[y][x]=g.ramp!=='ember'?P.yellow:P.white;}
  }
  for(const sx of [5,10]){
    const out=sx===5?-1:1;
    if(expr==='blink'){px[ey+1][sx]=px[ey+1][sx+out]=P.ink;}
    else if(expr==='happy'){set(sx-1,ey+1,P.ink);set(sx,ey,P.ink);set(sx+1,ey+1,P.ink);}
    else if(expr==='wide'){set(sx,ey,P.white);set(sx+out,ey,P.white);set(sx,ey+1,P.ink);set(sx+out,ey+1,P.ink);}
    else if(g.eyes==='dot'){px[ey][sx]=P.ink;}
    else if(g.eyes==='big'){for(const [ox,oy] of [[0,0],[0,1],[out,0],[out,1]]) px[ey+oy][sx+ox]=P.ink; px[ey][sx]=P.white;}
    else if(g.eyes==='wide'){px[ey][sx]=P.white;px[ey+1][sx]=P.ink;}
    else {px[ey+1][sx]=px[ey+1][sx+out]=P.ink;px[ey][sx]=px[ey][sx]===hi?base:px[ey][sx];}
  }
  px[ey+2][7]=px[ey+2][8]=P.ink;
  if(expr==='eat'){set(7,ey+3,P.red);set(8,ey+3,P.red);set(7,ey+4,P.ink);set(8,ey+4,P.ink);}
  if(expr==='wide'){set(7,ey+3,P.ink);set(8,ey+3,P.ink);}
  if(g.blush||expr==='happy') for(const bx of [4,11]) if(inside(bx,ey+2)) px[ey+2][bx]=g.ramp!=='jam'?P.red:P.plum;
  const out=px.map(row=>row.slice());
  for(let y=0;y<16;y++)for(let x=0;x<16;x++){
    if(px[y][x]===null&&[[-1,0],[1,0],[0,-1],[0,1]].some(([dx,dy])=>{const X=x+dx,Y=y+dy;return X>=0&&X<16&&Y>=0&&Y<16&&px[Y][X]!==null;})) out[y][x]=P.ink;
  }
  return out;
}
const spriteCache=new Map();
function sprite(g,expr='idle'){
  const sh=isShiny(g), eg=sh&&!g.shiny?Object.assign({},g,{shiny:true}):g;
  const k=g.seed+'|'+g.family+g.w+g.h+'|'+sh+'|'+g.ramp+'|'+expr;
  if(!spriteCache.has(k)) spriteCache.set(k,drawPet(eg,expr)); return spriteCache.get(k);
}
function spriteTop(spr){for(let y=0;y<spr.length;y++) if(spr[y].some(Boolean)) return y; return 0;}

/* ---------- tiny art ---------- */
const KEY={k:P.ink,w:P.white,l:P.lime,g:P.green,r:P.red,o:P.orange,y:P.yellow,b:P.navy,B:P.blue,s:P.silver,d:P.dusk,p:P.plum,c:P.cyan,t:P.teal,S:P.slate};
const art=rows=>rows.map(r=>[...r].map(ch=>KEY[ch]||null));
const BUG=art(["g.g...",".gllk.","glllll",".l.l.l"]);
const BUG2=art(["g.g...",".gllk.","glllll","l.l.l."]);
const SPLAT=art(["l..g..l",".l.l.g.","..lll..","gllglll","..lll..",".g.l.l.","l..l..g"]);
const HEART=art([".r.r.","rrrrr",".rrr.","..r.."]);
const BANG=art(["r","r","r",".","r"]);
const EGG=art(["...kk...","..kwwk..",".kwwwwk.",".kwywwk.","kwwwwwsk","kwywwysk","kwwwwssk","kswwsssk",".kssssk.","..kkkk.."]);
const EGG_C1=art(["...kk...","..kwwk..",".kwwwwk.",".kwywwk.","kwwwkwsk","kwywwysk","kwwwwssk","kswwsssk",".kssssk.","..kkkk.."]);
const EGG_C2=art(["...kk...","..kwwk..",".kwwwwk.",".kwykwk.","kwkwkwsk","kwywwysk","kwwwwssk","kswwsssk",".kssssk.","..kkkk.."]);
const EGG_C3=art(["...kk...","..kwwk..",".kwwwwk.",".kwkwwk.","kwkwkwkk","kkwkwkwk","kwwwwssk","kswwsssk",".kssssk.","..kkkk.."]);
const EGG_TOP=art(["...kk...","..kwwk..",".kwwwwk.",".kwywwk.","kkwkwkwk"]);
const EGG_BOT=art(["kwkwkwkk","kwwwwssk","kswwsssk",".kssssk.","..kkkk.."]);
const BOX=art(["kkkkkk","kyyyyk","koyyok","kooook","kkkkkk"]);
const CAP=art(["......ww",".....kbk","....kbbk","...kbbbk","..kbbbbk",".kbbbbbk","kwwwwwwk"]);
const Z1=art(["wwww","..w.",".w..","wwww"]);
const Z2=art(["www","..w",".w.","www"]);
const Z3=art(["ww",".w","w.","ww"]);
const MOON=art([".yy.","yyyy","yysy",".yy."]);
const GEM=art([".c.","cwc",".c."]);
const SPARK=art(["y.y",".y.","y.y"]);
const SPK_ON=art(["....kk....","...kok..k.","kkkook.k.k","kooook.k.k","kkkook.k.k","...kok..k.","....kk...."]);
const SPK_OFF=art(["....kk....","...kok....","kkkook.r.r","kooook..r.","kkkook.r.r","...kok....","....kk...."]);

function blit(S,spr,ox,oy,maxY){
  const H=S.length,W=S[0].length; maxY=maxY===undefined?H:maxY;
  for(let y=0;y<spr.length;y++)for(let x=0;x<spr[y].length;x++){
    const c=spr[y][x]; if(!c) continue; const X=x+ox,Y=y+oy;
    if(X>=0&&X<W&&Y>=0&&Y<maxY) S[Y][X]=c;
  }
}
/* scene: 32x16 with ground, shadow, optional pet, props (under: drawn before the pet) */
function scene(o){
  const S=grid(32,16);
  if(o.ground!==false) for(let x=0;x<32;x++) S[15][x]=x%2===0?P.slate:P.dusk;
  for(const p of (o.under||[])) blit(S,p[0],p[1],p[2],15);
  if(o.pet){
    const px=o.petX===undefined?6:o.petX;
    for(let x=px+4;x<px+12;x++) if(x>=0&&x<32) S[14][x]=P.dusk;
    blit(S,sprite(o.pet,o.expr||'idle'),px,(o.dy||0)+(o.hop||0),15);
  }
  for(const p of (o.props||[])) blit(S,p[0],p[1],p[2]);
  return S;
}
/* sleeping z's: three sizes on a diagonal, appear one by one, never overlap */
function zProps(i,x,y){
  const k=Math.floor(i/4)%4, out=[];
  if(k>=1) out.push([Z3,x,y+6]);
  if(k>=2) out.push([Z2,x+3,y+2]);
  if(k>=3) out.push([Z1,x+7,y-3]);
  return out;
}
/* box carried on the head: sits on the crown so it reads as hauling, not floating beside */
function headBox(g,petX,dy){const top=spriteTop(sprite(g));return [BOX,petX+5,Math.max(0,top-3+dy)];}

/* ---------- rendering ---------- */
function lum(hex){const n=parseInt(hex.slice(1),16);return(0.299*(n>>16)+0.587*(n>>8&255)+0.114*(n&255))/255;}
const LCD=['#c5d1a5','#8b9a6b','#4d5a3c','#1f2418'];
function toLcd(c,map){if(map&&map[c])return map[c];if(c===P.ink)return LCD[3];const L=lum(c);return L>0.85?'#e6edcf':L>0.5?LCD[1]:L>0.25?LCD[2]:LCD[3];}
/* green LCD map: pet body goes dark on the light screen so it stays readable */
function lcdMap(g){
  const rc=RAMPS[rampOf(g)].map(c=>P[c]);
  // ramp last so a ghost (slate/silver/white) body keeps its dark mapping
  return Object.assign({[P.white]:'#eef3dc',[P.dusk]:'#6f7f55',[P.slate]:'#8b9a6b',[P.yellow]:'#eef3dc',[P.green]:'#3d4a2e'},{[rc[0]]:'#2f3a23',[rc[1]]:'#55653f',[rc[2]]:'#87976a'});
}
function paint(ctx,G,ox,oy,s,opt){
  opt=opt||{};
  for(let y=0;y<G.length;y++)for(let x=0;x<G[0].length;x++){
    let c=G[y][x];
    if(!c){ if(opt.ghost){ctx.fillStyle=opt.ghost;ctx.fillRect(ox+x*s,oy+y*s,s-opt.gap,s-opt.gap);} continue;}
    if(opt.mono) c=toLcd(c,opt.map);
    ctx.fillStyle=c; ctx.fillRect(ox+x*s,oy+y*s,s-(opt.gap||0),s-(opt.gap||0));
  }
}
function setupCanvas(cv,w,h){cv.width=w;cv.height=h;cv.style.width=w+'px';cv.style.height=h+'px';const c=cv.getContext('2d');c.imageSmoothingEnabled=false;return c;}

/* pet idle animator: breathe every 600ms, random blink, occasional hop */
function makeLife(seedOffset){
  const r=mulberry32(seedOffset||1);
  return {r,nextBlink:1200+r()*2500,blinkEnd:0,nextHop:3000+r()*5000,hopStart:-1};
}
const HOP=[-1,-3,-4,-4,-3,-1,0];
function lifeFrame(L,t){
  if(REDUCED) return {dy:0,expr:'idle'};
  let dy=Math.floor(t/600)%2;
  if(t>L.nextBlink){L.blinkEnd=t+140;L.nextBlink=t+1800+L.r()*3500;}
  const expr=t<L.blinkEnd?'blink':'idle';
  if(t>L.nextHop&&L.hopStart<0){L.hopStart=t;}
  if(L.hopStart>=0){const f=Math.floor((t-L.hopStart)/80); if(f<HOP.length) dy=HOP[f]; else {L.hopStart=-1;L.nextHop=t+4000+L.r()*7000;}}
  return {dy,expr};
}

/* ---------- actor loop (~30 fps, offscreen canvases skip work) ---------- */
const actors=[];
const T0=performance.now();
const now=()=>performance.now()-T0;
function addActor(fn){actors.push(fn);}
let lastTick=-1e9;
function loop(){const t=now(); if(t-lastTick>=33){lastTick=t; for(const a of actors) a(t);} requestAnimationFrame(loop);}
function startLoop(){for(const a of actors) a(now()); requestAnimationFrame(loop);}
const io='IntersectionObserver' in window?new IntersectionObserver(es=>{for(const e of es) if(e.target._m) e.target._m.vis=e.isIntersecting;},{rootMargin:'120px'}):null;

/* mount a pixel canvas: o.w/o.h grid size, o.scale() -> px per cell (re-read every frame, so
   window resizes re-fit), o.draw(t,m) -> grid. o.poke: click makes the pet hop + heart. */
function mount(cv,o){
  const m={cv,s:0,last:'',ctx:null,pokeT:-1e9,vis:true};
  m.fit=()=>{const ns=o.scale();if(ns!==m.s){m.s=ns;m.ctx=setupCanvas(cv,o.w*ns,o.h*ns);m.last='';}};
  m.hop=t=>{if(REDUCED)return 0;const f=Math.floor((t-m.pokeT)/70);return f>=0&&f<HOP.length?HOP[f]:0;};
  m.happy=t=>t-m.pokeT<900;
  m.redraw=()=>{m.last='';};
  if(o.poke){
    cv.style.cursor='pointer'; cv.dataset.pet='1';
    cv.addEventListener('click',e=>{
      if(o.poke==='stop'){e.preventDefault();e.stopPropagation();}
      m.pokeT=now(); SND.play('chirp'); floatHeart(e.clientX,e.clientY-8);
      if(o.cssHop) cssHop(cv);
      if(o.onPoke) o.onPoke(e);
    });
  }
  if(io&&!o.always){cv._m=m;io.observe(cv);} // o.always: draw has side effects (state machines)
  addActor(t=>{
    if(!m.vis) return; m.fit(); if(!m.s) return;
    const G=o.draw(t,m); const k=JSON.stringify(G); if(k===m.last) return; m.last=k;
    m.ctx.clearRect(0,0,cv.width,cv.height); paint(m.ctx,G,0,0,m.s,o.paint);
  });
  return m;
}
/* 16x16 sprite-only canvas (leaderboard, odds, mini lists) */
function mountSprite(cv,g,o){
  o=o||{}; const L=makeLife(o.life||g.seed);
  return mount(cv,{w:16,h:16,scale:o.scale||(()=>innerWidth<760?2:3),poke:o.poke,cssHop:true,onPoke:o.onPoke,
    draw:(t,m)=>{const f=lifeFrame(L,t+(o.phase||0));const G=grid(16,16);blit(G,sprite(typeof g==='function'?g():g,m.happy(t)?'happy':f.expr),0,Math.max(0,f.dy));return G;}});
}

/* ---------- fx helpers ---------- */
function floatHeart(x,y){
  const c=document.createElement('canvas');const s=4;const ctx=setupCanvas(c,5*s,4*s);paint(ctx,HEART,0,0,s);
  c.className='float-heart';c.setAttribute('aria-hidden','true');c.style.left=x+'px';c.style.top=y+'px';
  document.body.appendChild(c);setTimeout(()=>c.remove(),REDUCED?450:820);
}
function cssHop(el){if(REDUCED)return;el.classList.remove('hopping');void el.offsetWidth;el.classList.add('hopping');clearTimeout(el._hop);el._hop=setTimeout(()=>el.classList.remove('hopping'),560);}
let toastEl=null;
function toast(title,sub,ms){
  if(toastEl) toastEl.remove();
  const d=document.createElement('div');d.className='toast px';d.setAttribute('role','status');
  d.innerHTML='<b>'+title+'</b>'+(sub?'<span>'+sub+'</span>':'');document.body.appendChild(d);toastEl=d;
  setTimeout(()=>{if(toastEl===d){d.remove();toastEl=null;}},ms||2200);
}

/* ---------- sound: tiny WebAudio synth, no files. Silent until the first gesture. ---------- */
const SND=(()=>{
  let ac=null, master=null, muted=false; const subs=[];
  try{muted=localStorage.getItem('nibbl.muted')==='1';}catch(e){}
  function unlock(){
    if(ac){if(ac.state==='suspended') ac.resume().catch(()=>{});return;}
    const AC=window.AudioContext||window.webkitAudioContext; if(!AC) return;
    try{ac=new AC();master=ac.createGain();master.gain.value=0.13;master.connect(ac.destination);}catch(e){ac=null;}
  }
  for(const ev of ['pointerdown','keydown','touchstart']) addEventListener(ev,unlock,{capture:true,passive:true});
  function tone(f,t0,d,o){
    o=o||{}; const osc=ac.createOscillator(), g=ac.createGain(); osc.type=o.type||'square';
    osc.frequency.setValueAtTime(f,t0); if(o.to) osc.frequency.exponentialRampToValueAtTime(o.to,t0+d);
    const v=o.vol||0.5; g.gain.setValueAtTime(0.0001,t0); g.gain.exponentialRampToValueAtTime(v,t0+0.006);
    g.gain.setValueAtTime(v,t0+d*0.55); g.gain.exponentialRampToValueAtTime(0.0001,t0+d);
    osc.connect(g); g.connect(master); osc.start(t0); osc.stop(t0+d+0.03);
  }
  function noise(t0,d,o){
    o=o||{}; const len=Math.max(1,Math.floor(ac.sampleRate*d)), buf=ac.createBuffer(1,len,ac.sampleRate), ch=buf.getChannelData(0);
    for(let i=0;i<len;i++) ch[i]=Math.random()*2-1;
    const src=ac.createBufferSource(); src.buffer=buf; const f=ac.createBiquadFilter(); f.type=o.type||'lowpass'; f.frequency.value=o.freq||1200;
    const g=ac.createGain(); const v=o.vol||0.5; g.gain.setValueAtTime(v,t0); g.gain.exponentialRampToValueAtTime(0.0001,t0+d);
    src.connect(f); f.connect(g); g.connect(master); src.start(t0); src.stop(t0+d+0.02);
  }
  const seq=(t,notes,step,o)=>notes.forEach((n,i)=>n&&tone(n,t+i*step,step*0.95,o));
  const S={
    click:t=>tone(1250,t,0.035,{vol:0.22}),
    blip:t=>tone(1568,t,0.05,{vol:0.2,type:'triangle'}),
    tick:t=>tone(320,t,0.03,{vol:0.25,type:'triangle'}),
    chirp:t=>{tone(880,t,0.06,{to:1500,vol:0.28});tone(1200,t+0.07,0.07,{to:1900,vol:0.24});},
    happy:t=>seq(t,[523,659,784,1047],0.07,{vol:0.22}),
    crack:t=>{noise(t,0.05,{type:'highpass',freq:2500,vol:0.5});tone(180,t,0.04,{vol:0.2,type:'triangle'});},
    fanfare:t=>{seq(t,[392,523,659,784],0.08,{vol:0.22});tone(1047,t+0.34,0.36,{vol:0.22});tone(784,t+0.34,0.36,{vol:0.12,type:'triangle'});},
    squash:t=>{noise(t,0.09,{freq:900,vol:0.6});tone(220,t,0.12,{to:55,vol:0.3});},
    nom:t=>{tone(300,t,0.05,{to:180,vol:0.25});tone(300,t+0.09,0.05,{to:180,vol:0.25});},
    error:t=>{tone(110,t,0.13,{type:'sawtooth',vol:0.28});tone(104,t+0.16,0.18,{type:'sawtooth',vol:0.28});},
    levelup:t=>{seq(t,[523,659,784,1047,1319],0.06,{vol:0.2});tone(1568,t+0.3,0.3,{vol:0.2});tone(1047,t+0.3,0.3,{vol:0.12,type:'triangle'});},
    box:t=>{tone(440,t,0.05,{vol:0.22});tone(660,t+0.06,0.07,{vol:0.22});},
    ship:t=>seq(t,[784,988,1175],0.06,{vol:0.18,type:'triangle'}),
    sleep:t=>seq(t,[659,494,392],0.16,{vol:0.2,type:'triangle'}),
    sparkle:t=>seq(t,[1319,1568,1976,2637,1976,2637],0.045,{vol:0.14,type:'triangle'})
  };
  return {
    play(name){if(muted||!ac||!S[name]) return; if(ac.state==='suspended') ac.resume().catch(()=>{}); try{S[name](ac.currentTime+0.01);}catch(e){}},
    get muted(){return muted;},
    setMuted(v){muted=!!v;try{localStorage.setItem('nibbl.muted',muted?'1':'0');}catch(e){} subs.forEach(f=>f(muted));},
    onChange(f){subs.push(f);}
  };
})();
/* pixel speaker toggle, renders into a <button> */
function speaker(btn){
  const cv=document.createElement('canvas');btn.appendChild(cv);const ctx=setupCanvas(cv,30,21);
  const render=()=>{ctx.clearRect(0,0,30,21);paint(ctx,SND.muted?SPK_OFF:SPK_ON,0,0,3);btn.setAttribute('aria-pressed',SND.muted?'true':'false');btn.setAttribute('aria-label',SND.muted?'Sound off, turn on':'Sound on, mute');btn.title=SND.muted?'Sound off':'Sound on';};
  btn.addEventListener('click',()=>{SND.setMuted(!SND.muted);if(!SND.muted) SND.play('blip');});
  SND.onChange(render);render();
}

/* ---------- konami: every pet turns shiny for 10 seconds ---------- */
const KONAMI=['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];
let konamiAt=0, shinyTimer=0;
function goShiny(){
  SHINY_ALL=true;document.documentElement.classList.add('all-shiny');
  toast('SHINY MODE','every nibbl, 10 seconds',2600);SND.play('sparkle');
  dispatchEvent(new CustomEvent('nibbl:shiny',{detail:true}));
  clearTimeout(shinyTimer);shinyTimer=setTimeout(()=>{SHINY_ALL=false;document.documentElement.classList.remove('all-shiny');dispatchEvent(new CustomEvent('nibbl:shiny',{detail:false}));},10000);
}
addEventListener('keydown',e=>{
  const tag=(e.target&&e.target.tagName)||''; if(/INPUT|TEXTAREA|SELECT/.test(tag)) return;
  const k=e.key.length===1?e.key.toLowerCase():e.key;
  if(k===KONAMI[konamiAt]){konamiAt++; if(konamiAt>8) e._nb=true; if(konamiAt===KONAMI.length){konamiAt=0;goShiny();}}
  else konamiAt=k===KONAMI[0]?1:0;
});

/* ---------- pet data by serial (fake, deterministic) ---------- */
const HATCHED=1337;
const pad6=n=>String(n).padStart(6,'0');
const TIERS=['common','uncommon','rare','epic','legendary'];
const TIER_W=[40,30,18,9,3];
const BRANCHES=['night owl','knight','gremlin','builder'];
const NAMES=['Bean','Pebble','Miso','Toast','Glitch','Noodle','Pico','Bit','Dumpling','Tater','Yuzu','Sesame','Patch','Moss','Ember','Kiwi','Pogo','Rune','Hex','Socks','Taro','Juno','Cosmo','Nib','Crumb','Fig','Loaf','Wisp','Echo','Bloop'];
const OWNERS=['ari','dev.sam','k_ito','mo','jules','priya.codes','tomasz','lena','hugo_b','nk','yui','omar.dev','fern','zed','rosa','bao'];
const OVERRIDES={
  7:{name:'Mochi',owner:'kaito',level:31,tier:'legendary',branch:'knight'},
  118:{name:'Pixel',owner:'ana.codes',level:29,tier:'epic',branch:'night owl'},
  23:{name:'Gremlin',owner:'devon',level:27,tier:'rare',branch:'gremlin',shiny:true},
  504:{name:'Tofu',owner:'mira_k',level:26,tier:'uncommon',branch:'builder'},
  388:{name:'Sprocket',owner:'jvdl',level:24,tier:'common'},
  612:{name:'Nori',owner:'sakura.dev',level:22,tier:'rare'},
  291:{name:'Kernel',owner:'linus_t',level:19,tier:'epic'},
  845:{name:'Biscuit',owner:'pmarsh',level:17,tier:'common'},
  930:{name:'Fennel',owner:'oyelowo',level:15,tier:'uncommon'},
  1102:{name:'Zuzu',owner:'ren',level:13,tier:'rare'},
  1219:{name:'Pip',owner:'hana.k',level:11,tier:'common'},
  1290:{name:'Waffle',owner:'bkrs',level:9,tier:'uncommon'},
  1:{name:'Byte',owner:'nmk',level:7,tier:'rare',branch:'night owl',xp:40,stats:[318,1204,211,57],hatched:'2026-09-14'}
};
const LEADERBOARD=[7,118,23,504,388,612,291,845,930,1102,1219,1290];
const stageOf=l=>l<1?'egg':l<10?'baby':l<25?'teen':l<50?'adult':'elder';
const XP_NEED=100;
function petData(n){
  const o=OVERRIDES[n]||{}; const r=rng(n*2654435761>>>0^0x5eed);
  const g=genome(n,o.shiny!==undefined?{shiny:o.shiny}:undefined);
  let tier=o.tier; if(!tier){let x=r.random()*100;for(let i=0;i<5;i++){x-=TIER_W[i];if(x<0){tier=TIERS[i];break;}} tier=tier||'common';}
  const level=o.level!==undefined?o.level:1+Math.floor(r.random()*r.random()*8);
  const branch=o.branch||r.choice(BRANCHES), stage=stageOf(level);
  const lean=stage==='adult'||stage==='elder'?null:(stage==='baby'&&level<3?null:'leaning '+branch);
  const form=stage==='adult'||stage==='elder'?stage+' '+branch:stage;
  const st=o.stats||[Math.floor(level*(8+r.random()*30)),Math.floor(level*(20+r.random()*90)),Math.floor(level*(6+r.random()*24)),Math.floor(level*(2+r.random()*7))];
  const day=Math.floor((n-1)/HATCHED*22), dt=new Date(Date.UTC(2026,8,10+day));
  return {
    serial:n, id:pad6(n), g, tier, level, stage, branch, lean, form, 
    name:o.name||r.choice(NAMES), owner:o.owner||r.choice(OWNERS),
    xp:o.xp!==undefined?o.xp:r.randint(5,95), need:XP_NEED,
    bugs:st[0], hearts:st[1], commits:st[2], expeditions:st[3],
    hatched:o.hatched||dt.toISOString().slice(0,10),
    genesis:n<=100
  };
}

/* ---------- traits and base odds ---------- */
const SIZE_NAMES={'5x5':'tiny','5x6':'slim','5x7':'lanky','6x5':'squat','6x6':'classic','6x7':'tall','7x5':'wide','7x6':'plump','7x7':'chonky'};
const PW={5:.25,6:.5,7:.25};
const PAT={none:'plain',spots:'spotted',stripes:'striped',stars:'starry'};
const sizeName=g=>SIZE_NAMES[g.w+'x'+g.h];
function oddsTier(p){return p>=0.25?'common':p>=0.12?'uncommon':p>=0.05?'rare':p>=0.015?'epic':'legendary';}
function fmtPct(p){const v=p*100;return(v<1?v.toFixed(2):v<10?v.toFixed(1):Math.round(v))+'%';}
function traitsOf(g){
  const sp=g.family==='sprout', sh=isShiny(g);
  return [
    {k:'family',v:g.family,p:1/3},
    {k:'body',v:sizeName(g)+' '+(g.w*2)+'x'+(g.h*2),p:PW[g.w]*PW[g.h]},
    {k:'colors',v:sh?rampOf(g)+' shiny':g.ramp,p:sh?0.04/6:1/6},
    {k:'pattern',v:PAT[g.pattern],p:.25},
    {k:'eyes',v:g.eyes,p:.25},
    {k:'ears',v:sp?'leaf':g.ears,p:sp?1/3:1/6},
    {k:'belly',v:g.belly?'yes':'no',p:g.belly?.6:.4},
    {k:'blush',v:g.blush?'yes':'no',p:.5}
  ].map(t=>Object.assign(t,{tier:oddsTier(t.p)}));
}
function rarestTrait(g){
  const c=[];
  if(isShiny(g)) c.push({label:'shiny '+rampOf(g),p:0.04/6});
  c.push({label:sizeName(g)+' '+g.family,p:PW[g.w]*PW[g.h]/3});
  c.push({label:PAT[g.pattern]+' '+g.ramp,p:1/24});
  if(g.family!=='sprout') c.push({label:g.eyes+' eyes, '+g.ears+' ears',p:1/24});
  c.sort((a,b)=>a.p-b.p); const best=c[0]; best.tier=oddsTier(best.p); return best;
}

/* ---------- urls ---------- */
const cardUrl=n=>'/p/'+pad6(n);
const shareUrl=n=>'https://nibbl.nur-omirzaq.workers.dev/p/'+pad6(n);
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

/* ---------- example pet card (landing teaser; real cards are served by the Worker at /p/) ---------- */
function cardHTML(d){
  const g=d.g, rt=rarestTrait(g), sh=isShiny(g);
  const genes=[['family',g.family],['body',sizeName(g)+' '+g.w*2+'x'+g.h*2],['colors',rampOf(g)],['pattern',PAT[g.pattern]],['eyes',g.eyes],['ears',g.family==='sprout'?'leaf':g.ears],['belly',g.belly?'yes':'no'],['blush',g.blush?'yes':'no']];
  const link=cardUrl(d.serial);
  const nm='<a href="'+link+'">'+esc(d.name)+'</a>';
  const tags='<span class="badge t-'+d.tier+'">'+d.tier+'</span>'+(g.shiny?'<span class="badge t-shiny">shiny</span>':'')+(d.genesis?'<span class="badge t-genesis">genesis</span>':'')+
    '<span class="badge t-plain">lvl '+d.level+' '+d.stage+'</span>'+(d.lean?'<span class="badge t-plain">'+d.lean+'</span>':d.stage==='adult'||d.stage==='elder'?'<span class="badge t-plain">'+d.branch+'</span>':'');
  return '<article class="pcard px'+(g.shiny?' shiny':'')+'" aria-label="Pet card for '+esc(d.name)+'">'+
    '<div class="top"><b>nibbl</b>'+'<a class="lbl" href="'+link+'">/p/'+d.id+'</a>'+'</div>'+
    '<div class="lcd px flat"><canvas class="pc-pet" role="img" aria-label="'+esc(d.name)+', a '+g.ramp+' '+g.family+'. Click to pet."></canvas></div>'+
    '<h3>'+nm+' <span class="lbl">'+'#'+d.id+'</span></h3>'+
    '<div class="tags">'+tags+'</div>'+
    '<div class="xp"><span class="lbl lv">lvl '+d.level+'</span><div class="xpbar" role="progressbar" aria-label="XP to next level" aria-valuemin="0" aria-valuemax="'+d.need+'" aria-valuenow="'+d.xp+'"><i style="width:'+Math.round(d.xp/d.need*100)+'%"></i></div><span class="lbl">'+d.xp+'/'+d.need+' xp</span></div>'+
    '<div class="rarest t-'+rt.tier+'"><span class="lbl">rarest trait</span><b>'+rt.label+'</b><span class="odds">'+fmtPct(rt.p)+' odds</span></div>'+
    '<div class="genes">'+genes.map(([k,v])=>'<div><span>'+k+'</span><b>'+v+'</b></div>').join('')+'</div>'+
    '<div class="stats"><div><b>'+d.bugs+'</b><span>bugs nibbled</span></div><div><b>'+d.hearts+'</b><span>hearts</span></div><div><b>'+d.commits+'</b><span>commits</span></div><div><b>'+d.expeditions+'</b><span>expeditions</span></div></div>'+
    '<div class="foot lbl"><span>'+'hatched '+d.hatched+'</span><span>'+'by @'+esc(d.owner)+'</span></div>'+
    '</article>';
}
function mountCardPet(root,d,maxScale){
  const cv=root.querySelector('.pc-pet'); const L=makeLife(d.serial%997+3);
  return mount(cv,{w:32,h:16,poke:true,
    scale:()=>{const w=cv.parentElement.clientWidth;return Math.max(3,Math.min(maxScale||7,Math.floor((w-16)/32)));},
    draw:(t,m)=>{const f=lifeFrame(L,t);const sp=Math.floor(t/300)%4;
      return scene({pet:d.g,petX:8,dy:f.dy,hop:m.hop(t),expr:m.happy(t)?'happy':f.expr,props:[isShiny(d.g)?[SPARK,[3,25,5,26][sp],[2,3,8,7][sp]]:[GEM,26,4]]});}});
}
