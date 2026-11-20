"use strict";
// WORST NIGHTMARE (бывш. MONOCHROME) — порт с Python/pygame на JS. Ассеты лежат рядом с index.html:
// font.ttf, font_bold.ttf, jumpscare.png, jumpscare_boiled.png, jumpscare_locust.png,
// lamp/running/monster/scream/boiled/locust.mp3 (необязательно: scream_boiled.mp3, scream_locust.mp3)
const W=1280,H=720;
let TOUCH=matchMedia("(pointer:coarse)").matches||location.search.includes("touch");
// ---- настройки (сохраняются в localStorage; меню — в конце файла)
const SET_DEF={sens:1,vol:1,sfx:1,mus:1,qual:1,bright:1,fov:70,grain:1,strobe:1,sprintHold:false,sprintTog:false,btnS:1,btnA:1,joyFixed:false,haptic:true,invX:false,smooth:0,fps:83,showFps:false,mono:false,ceil:true,keys:{}};
const SET=(()=>{let o={};try{o=JSON.parse(localStorage.getItem("wn_set")||"{}")||{}}catch(e){}const r=Object.assign({},SET_DEF,o);r.keys=Object.assign({},o.keys||{});return r})();
const saveSet=()=>{try{localStorage.setItem("wn_set",JSON.stringify(SET))}catch(e){}};
const Q0=Math.max(0,Math.min(2,SET.qual|0));
const[RW,RH]=(TOUCH?[[176,99],[240,135],[352,198]]:[[240,135],[320,180],[480,270]])[Q0];
let K=Math.tan(Math.PI*SET.fov/360),PROJ=RW/2/K;
const vib=p=>{if(SET.haptic&&navigator.vibrate)try{navigator.vibrate(p)}catch(e){}};
let LUT=new Uint8ClampedArray(256),sprintLatch=false,smDX=0;
const strobeL=t=>{const s=SET.strobe;return Math.sin(t*31)>.1?.95-.2*(1-s):.04+.56*(1-s)};
const FPSMIN=()=>SET.fps===0?0:SET.fps===30?29:SET.fps===60?13:12;
function mouseTurn(dt){if(TOUCH)return 0;const d=cl(mouseDX,-300,300),sg=SET.invX?-1:1;
  if(SET.smooth<=0){smDX=0;return d*sg}
  smDX+=d;const t=smDX*(1-Math.pow(SET.smooth,dt*60));smDX-=t;return t*sg}
const DEFK={use:"KeyE",torch:"KeyF",cracker:"KeyG",item:"KeyQ",cycle:"KeyZ",mark:"KeyM",sprint:"ShiftLeft"};
let REV={},DIS=new Set();
function buildKeys(){REV={};DIS=new Set();for(const a in DEFK){const c=SET.keys[a];if(c&&c!==DEFK[a]){REV[c]=DEFK[a];DIS.add(DEFK[a]);if(a==="sprint")DIS.add("ShiftRight")}}}
const tr=c=>REV[c]||(DIS.has(c)?"x"+c:c);
const MAXM=8,KEYS=5,SZ=41,CN=20,MP=[{sp:3.2,pat:1.6,vt:14,vn:9,hr:6},{sp:3,pat:1.5,vt:12,vn:8,hr:8},{sp:3.5,pat:1.9,vt:16,vn:10,hr:5}],JG=1,JT=5,PATROL=0,CHASE=1,SEARCH=2;
const PASS=v=>v===0||v===3||v===6||v===7;   // проходимые тайлы: пол, закрытая дверь (монстр ломает), открытая, выломанная
const IT=(k,max)=>{const o={get n(){return t("item."+k+".n")},get d(){return t("item."+k+".d")}};if(max)o.max=max;return o};   // названия/описания берутся из словаря при каждом обращении
const ITEMS={};["fuse","cracker","adren","stim","shadow","flash","wire"].forEach(k=>ITEMS[k]=IT(k));
const USE=["cracker","adren","stim","shadow","flash","wire"];
const SLOTS=5,TORCH_SEC=90;
const DIFFS=["easy","normal","hard","nightmare"];   // порядок = порядок карточек в меню; параметры — в таблице DIFF ниже
// ======================================================================================================
// ТАБЛИЦА СЛОЖНОСТЕЙ. Всё, что зависит от сложности, читается ТОЛЬКО отсюда (Level, Monster, Game, свет, жизни).
// 'hard' = исходная игра, её значения НЕ трогаем — от неё считаются остальные. Базовые статы монстров остаются в MP[] (это hard);
// сложность лишь умножает их (ai.spd / ai.vis / ai.hear). Пары [a,b] — случайное значение в диапазоне. [этаж0, этаж1] — по этажам.
// В мультиплеере сложность берётся из меты лобби (net.js → WN.start({diff})), ИИ и свет считает хост, жизни — у каждого игрока свои.
// ======================================================================================================
const DIFF={
  // ------------------------------------------------------------------------------ ЛЁГКИЙ
  easy:{
    lives:10,                     // жизней у игрока
    safe:true, safeR:4.2,         // безопасная зона у ворот: есть ли она и радиус (клетки; он же отступ при расстановке объектов)
    marks:true,                   // можно ли ставить метки (M)
    sirenMul:1,                   // множитель времени работы сирены у ворот (меньше = быстрее выйти)
    sniff:null,                   // [мин,макс] сек: хост раз в N сек «натравливает» монстра на случайного игрока (MP). null = выключено
    lvl:{ stands:[14,16],         // тумбочки (hard 7/8)  ≈ ×2
          hides:[20,18],          // шкафы-укрытия (hard 10/9) ≈ ×2
          doors:[10,10] },        // тяжёлые двери (hard 5/5) ≈ ×2
    ai:{
      spd:.80,                    // множитель скорости монстров (патруль и погоня)
      vis:.55,                    // множитель радиуса зрения (и с фонарём, и без)
      hear:.55,                   // множитель слуха: бег рядом (hr) + радиус любого шума (бутылки, стекло, сирена…)
      react:.9,                   // сек от «увидел» до начала погони (hard 0). Для лёгкого: заметил — думает — бежит
      lose:1.0,                   // сек без визуального контакта до потери следа (hard 2.5)
      linger:[1.5,4],             // сек, сколько обыскивает точку потери следа (hard 3–8)
      searchR:0,                  // >0: при обыске бродит по клеткам в этом радиусе вокруг точки потери (0 = стоит на месте)
      searchSp:.62,               // доля скорости при поиске
      direct:3,                   // ближе этой дистанции бежит на игрока напрямую, а не по пути (hard 4.5)
      repath:.4,                  // период пересчёта пути, сек (меньше = точнее преследует)
      lurk:9,                     // сек ждёт у шкафа, где спрятался игрок, прежде чем вытащить (hard 6.5)
      grace:7,                    // сек после спавна/респауна монстр «слепой и глухой» (hard 5)
      idleP:.20, idleT:[2,5],     // шанс остановиться при выборе новой цели патруля и на сколько сек (hard 0)
      wanderP:.40, wanderR:6,     // шанс «побродить»: цель патруля рядом (1.5…R клеток) вместо далёкой (>8) (hard 0)
      freezeP:.18,                // шанс «чёрного» замереть при выборе цели патруля
      dark:1.12                   // множитель скорости во время долгого блэкаута
    },
    bash:{ on:false },            // ломают ли монстры двери. false: закрытая дверь для них стена (путь строится в обход), шкафы тоже не выбиваются
    light:{                       // затухания света (fstate). Первое «долгое» отключение — bo_at
      first:[2,6],                // пауза до первого мигания
      gap:[3,10],                 // пауза между миганиями/затуханиями
      burst:[.5,1.6],             // длительность мигания (burst)
      black:[.4,1.2],             // длительность короткого затухания (blackout)
      blackP:1/3,                 // доля затуханий среди событий (остальное — мигания)
      at:[75,140],                // bo_at: через сколько сек игры первое долгое отключение
      len:[100,140],              // длительность долгого отключения (пока не починишь предохранителем)
      back:[1.2,2],               // мигание при возврате света
      again:null                  // null — долгое отключение один раз; [мин,макс] — повторять через N сек после возврата света
    },
    dir:{ gap:[60,90], raidP:.5, shortLen:12 }   // «режиссёр»: пауза между событиями; шанс облавы (иначе короткое замыкание); длительность замыкания, сек
  },
  // ------------------------------------------------------------------------------ НОРМАЛЬНЫЙ (hard, облегчённый)
  normal:{
    lives:5,
    safe:true, safeR:4.2,
    marks:true,
    sirenMul:1,
    sniff:null,
    lvl:{ stands:[10,11],         // ≈ +40% к hard (7/8)
          hides:[14,13],          // ≈ +40% к hard (10/9)
          doors:[5,5] },          // как в hard
    ai:{
      spd:.85,                    // −15% скорости
      vis:.80,                    // −20% зрения
      hear:.80,                   // −20% слуха
      react:0,
      lose:2.0,                   // −20% времени погони (hard 2.5)
      linger:[3,8],
      searchR:0, searchSp:.62,
      direct:4.5, repath:.4,
      lurk:6.5, grace:5,
      idleP:0, idleT:[3,7], wanderP:0, wanderR:6,
      freezeP:.18, dark:1.12
    },
    bash:{ on:true, time:4.2, hits:null, iv:.85, lead:0 },   // дверь выбивается за 4.2 с (hard 3.5): +20%
    light:{ first:[2,6], gap:[3,10], burst:[.5,1.6], black:[.4,1.2], blackP:1/3, at:[75,140], len:[100,140], back:[1.2,2], again:null },
    dir:{ gap:[60,90], raidP:.5, shortLen:12 }
  },
  // ------------------------------------------------------------------------------ СЛОЖНЫЙ = ИСХОДНАЯ ИГРА (не менять!)
  hard:{
    lives:3,
    safe:true, safeR:4.2,
    marks:true,
    sirenMul:1,
    sniff:null,
    lvl:{ stands:[7,8], hides:[10,9], doors:[5,5] },
    ai:{
      spd:1, vis:1, hear:1,
      react:0, lose:2.5, linger:[3,8],
      searchR:0, searchSp:.62,
      direct:4.5, repath:.4,
      lurk:6.5, grace:5,
      idleP:0, idleT:[3,7], wanderP:0, wanderR:6,
      freezeP:.18, dark:1.12
    },
    bash:{ on:true, time:3.5, hits:null, iv:.85, lead:0 },   // дверь ломается за 3.5 с (≈4 удара через .85 с)
    light:{ first:[2,6], gap:[3,10], burst:[.5,1.6], black:[.4,1.2], blackP:1/3, at:[75,140], len:[100,140], back:[1.2,2], again:null },
    dir:{ gap:[60,90], raidP:.5, shortLen:12 }
  },
  // ------------------------------------------------------------------------------ КОШМАР (прежний «Кошмарище» + умный ИИ)
  nightmare:{
    lives:1,
    safe:false, safeR:4.2,        // safe:false → in_safe() всегда false (радиус остаётся только как отступ при расстановке)
    marks:false,                  // метки запрещены (как в прежнем режиме)
    sirenMul:.7,                  // сирена короче (как раньше)
    sniff:[10,15],                // MP: раз в 10–15 с случайный монстр «чует» случайного игрока (как раньше)
    lvl:{ stands:[7,8], hides:[10,9], doors:[5,5] },   // карта как в hard
    ai:{
      spd:1.35,                   // как в прежнем «Кошмарище»; хочешь мягче — 1.15–1.2
      vis:1.30,                   // зрение шире на 30%
      hear:1.40,                  // слух шире на 40%
      react:0,
      lose:4.5,                   // долго держит погоню без визуального контакта
      linger:[6,13],              // долго обыскивает место пропажи
      searchR:7, searchSp:.8,     // при обыске ищет в радиусе 7 клеток вокруг места пропажи (быстрее, чем в hard)
      direct:6.5, repath:.2,      // бежит напрямую с большей дистанции и чаще перестраивает путь
      lurk:4.5, grace:3,          // быстрее вытаскивает игрока из шкафа, короче «слепота» после спавна
      idleP:0, idleT:[3,7], wanderP:0, wanderR:6,
      freezeP:.18, dark:1.12
    },
    bash:{ on:true, time:0, hits:[1,3], iv:.85, lead:.35 },   // дверь ломается за 1–3 удара (случайно на каждую дверь); lead — сек до первого удара
    light:{
      first:[1,3],                // первое мигание почти сразу
      gap:[1.5,5],                // паузы между затуханиями короче (hard 3–10)
      burst:[1,3],                // мигания дольше (hard .5–1.6)
      black:[1.5,4],              // короткие затухания дольше (hard .4–1.2)
      blackP:.5,                  // половина событий — полная тьма
      at:[40,80],                 // bo_at: долгое отключение раньше (hard 75–140)
      len:[130,180],              // и дольше (hard 100–140)
      back:[1.2,2],
      again:[120,180]             // и повторяется: следующее долгое — через 120–180 с после возврата света (меньше = тьма почти всё время)
    },
    dir:{ gap:[25,45], raidP:.5, shortLen:18 }   // события режиссёра чаще (hard 60–90) и замыкания длиннее (hard 12)
  }
};

["bottle","glow","battery","energy","pills","wedge","smoke"].forEach(k=>ITEMS[k]=IT(k));
  ITEMS.lockpick=IT("lockpick",1);ITEMS.detector=IT("detector",1);ITEMS.mirror=IT("mirror",1);
ITEMS.torch=IT("torch");
USE.push("bottle","glow","battery","energy","pills","wedge","smoke","lockpick","detector","mirror");
// [вид, вес]. "junk" — пустышка/лор. Сумма весов может быть любой.
const LOOT=[["junk",30],["bottle",12],["glow",10],["battery",9],["energy",8],["pills",7],["wedge",6],["smoke",6],
  ["lockpick",5],["detector",4],["mirror",3],
  ["cracker",0],["adren",0],["stim",0],["shadow",0],["flash",0],["wire",0]];   // старые предметы: поставь вес > 0, чтобы вернуть
const LOOT_SUM=LOOT.reduce((a,r)=>a+r[1],0);
// Таблица лута с учётом условий (CONDS[..].lvl): only:{вид:вес} — выпадают ТОЛЬКО эти предметы; mulP:{вид:m} — шанс выпадения вида ×m (точно, с учётом остальных весов).
// Без условий возвращает LOOT как есть → расход R() и карты по сид-у не меняются.
function lootTable(lv){if(lv&&lv.only)return Object.entries(lv.only);
  if(!lv||!lv.mulP)return LOOT;
  return LOOT.map(([k,w])=>{const m=lv.mulP[k];return[k,m&&w>0&&LOOT_SUM-m*w>0?m*w*(LOOT_SUM-w)/(LOOT_SUM-m*w):w]})}
function rollLoot(cnt,lv){   // cnt — счётчик выпавшего на карте (для предметов с max); lv — CONDS[..].lvl
  const tb=lootTable(lv),sum=tb===LOOT?LOOT_SUM:tb.reduce((a,r)=>a+r[1],0);
  for(let t=0;t<12;t++){let r=R()*sum,k="junk";for(const[n,w]of tb){if((r-=w)<0){k=n;break}}
    const m=ITEMS[k]&&ITEMS[k].max;if(!m||(cnt[k]|0)<m){cnt[k]=(cnt[k]|0)+1;return k}}
  return"junk"}
const PARTS={gear:["part.gear.n","part.gear.d"],fuel:["part.fuel.n","part.fuel.d"]};   // ключи словаря (имя, описание)
const ph=i=>t("ph."+i);
let R=Math.random;const mulberry=s=>()=>{s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296};
const rnd=(a,b)=>a+R()*(b-a),ri=(a,b)=>a+Math.floor(R()*(b-a+1)),pick=a=>a[Math.floor(R()*a.length)];
const hyp=Math.hypot,mod=(a,b)=>((a%b)+b)%b,D4=[[1,0],[-1,0],[0,1],[0,-1]],cl=(v,a,b)=>Math.max(a,Math.min(b,v));
const shuf=a=>{for(let i=a.length-1;i>0;i--){const j=ri(0,i);[a[i],a[j]]=[a[j],a[i]]}return a};
const cv=document.getElementById("c"),ctx=cv.getContext("2d");cv.width=W;cv.height=H;
const F=(s,b)=>s+"px "+(b?"MonoFontBold":"MonoFont")+",monospace";
function T(s,f,x,y,col,c,a){ctx.font=f;ctx.textAlign=c?"center":"left";ctx.textBaseline=c?"middle":"top";ctx.globalAlpha=a==null?1:a;
  ctx.fillStyle="#000";ctx.fillText(s,x+2,y+2);ctx.fillStyle=col||"#e6e6e6";ctx.fillText(s,x,y);ctx.globalAlpha=1}
const rect=(x,y,w,h)=>({x,y,w,h}),inR=(r,p)=>p[0]>=r.x&&p[0]<r.x+r.w&&p[1]>=r.y&&p[1]<r.y+r.h;
const rc=(cx,cy,w,h)=>rect(Math.floor(cx-w/2),Math.floor(cy-h/2),w,h);
const gr=v=>{v=cl(v|0,0,255);return`rgb(${v},${v},${v})`};
function circ(x,y,r,fill,stroke,lw){ctx.beginPath();ctx.arc(x,y,r-(stroke?lw/2:0),0,7);if(fill){ctx.fillStyle=fill;ctx.fill()}if(stroke){ctx.lineWidth=lw;ctx.strokeStyle=stroke;ctx.stroke()}}
function box(r,fill,stroke,lw){ctx.fillStyle=fill;ctx.fillRect(r.x,r.y,r.w,r.h);if(stroke){ctx.lineWidth=lw;ctx.strokeStyle=stroke;ctx.strokeRect(r.x+lw/2,r.y+lw/2,r.w-lw,r.h-lw)}}
function heart(x,y,s,col){const r=s*.28;ctx.fillStyle=col;ctx.beginPath();ctx.arc(x-r,y-r*.6,r,0,7);ctx.arc(x+r,y-r*.6,r,0,7);ctx.fill();
  ctx.beginPath();ctx.moveTo(x-2*r+1,y-r*.2);ctx.lineTo(x+2*r-1,y-r*.2);ctx.lineTo(x,y+s*.55);ctx.fill()}
function icon(k,x,y,s){const u=s/2;ctx.save();ctx.translate(x,y);ctx.strokeStyle=ctx.fillStyle="#e6e6e6";ctx.lineWidth=2;ctx.lineJoin=ctx.lineCap="round";
  const P=(...a)=>{ctx.beginPath();for(let i=0;i<a.length;i+=2)i?ctx.lineTo(a[i]*u,a[i+1]*u):ctx.moveTo(a[i]*u,a[i+1]*u)};
  switch(k){
    case"bottle":P(-.2,-.2,-.2,.8,.2,.8,.2,-.2,.12,-.35,.12,-.8,-.12,-.8,-.12,-.35,-.2,-.2);ctx.stroke();break;
    case"glow":ctx.rotate(-.7);ctx.globalAlpha=.35;circ(0,0,u*.95,"#fff");ctx.globalAlpha=1;ctx.fillStyle="#fff";ctx.fillRect(-.14*u,-.8*u,.28*u,1.6*u);break;
    case"battery":ctx.strokeRect(-.7*u,-.35*u,1.3*u,.7*u);ctx.fillRect(.6*u,-.15*u,.2*u,.3*u);P(-.4,0,-.1,0);ctx.stroke();break;
    case"energy":ctx.strokeRect(-.35*u,-.7*u,.7*u,1.4*u);P(.1,-.45,-.15,.05,.12,.05,-.1,.5);ctx.stroke();break;
    case"pills":ctx.rotate(-.6);ctx.fillRect(-.7*u,-.28*u,.7*u,.56*u);ctx.strokeRect(-.7*u,-.28*u,1.4*u,.56*u);break;
    case"wedge":P(-.8,.6,.8,.6,.8,.1);ctx.closePath();ctx.fill();break;
    case"smoke":circ(-.4*u,.2*u,.45*u,0,"#e6e6e6",2);circ(.3*u,.1*u,.55*u,0,"#e6e6e6",2);circ(0,-.3*u,.4*u,0,"#e6e6e6",2);break;
    case"lockpick":P(-.7,.7,.4,-.4,.7,-.1);ctx.stroke();break;
    case"detector":circ(0,0,.3*u,"#e6e6e6");for(const[r,a0]of[[.65,-.9],[.95,-.9],[.65,Math.PI-.9]]){ctx.beginPath();ctx.arc(0,0,r*u,a0,a0+1.8);ctx.stroke()}break;
    case"mirror":ctx.beginPath();ctx.ellipse(0,-.2*u,.5*u,.65*u,0,0,7);ctx.stroke();P(0,.45,0,.9);ctx.stroke();break;
    default:ctx.restore();T(ITEMS[k].n[0],F(24,1),x,y,"#e6e6e6",1);return}
  ctx.restore()}

// ---------------------------------------------------------------- звук
const AC=window.AudioContext||window.webkitAudioContext;let ac;try{ac=new AC()}catch(e){}
const master=ac&&ac.createGain(),sfxB=ac&&ac.createGain(),musB=ac&&ac.createGain();if(ac){sfxB.connect(master);musB.connect(master);master.connect(ac.destination)}
const SND={};
["lamp","running","monster","scream","boiled","locust","scream_boiled","scream_locust","menu_music","sfx_dash","sfx_boom","sfx_open","sfx_step","sfx_mark","sfx_pickup","sfx_door_open","sfx_door_close","sfx_drawer","sfx_trap","sfx_glass","sfx_win","sfx_click","sfx_siren","sfx_lift","sfx_hide"].forEach(async n=>{for(const x of[".mp3",".ogg",".wav"])try{
  const r=await fetch(n+x);if(!r.ok)continue;SND[n]=await ac.decodeAudioData(await r.arrayBuffer());return}catch(e){}});
class Ch{
  constructor(){this.src=null;this.l=1;this.r=1}
  busy(){return!!this.src}
  play(buf,lp,l,r){if(!ac)return;this.stop();const s=ac.createBufferSource(),a=ac.createGain(),b=ac.createGain(),m=ac.createChannelMerger(2);
    s.buffer=buf;s.loop=!!lp;s.connect(a);s.connect(b);a.connect(m,0,0);b.connect(m,0,1);m.connect(this===CH.scream?sfxB:musB);
    a.gain.value=l;b.gain.value=r;s.onended=()=>{if(this.src===s)this.src=null};s.start();this.src=s;this.ga=a;this.gb=b}
  stop(){if(this.src){const s=this.src;this.src=null;s.onended=null;try{s.stop();s.disconnect()}catch(e){}}}
  vol(l,r){if(!this.src)return;const t=ac.currentTime;this.ga.gain.setTargetAtTime(l,t,.03);this.gb.gain.setTargetAtTime(r,t,.03)}
}
const CH={lamp:new Ch,scream:new Ch,music:new Ch};
const unlock=()=>{if(ac&&ac.state==="suspended")ac.resume()};
const angD=(a,b)=>mod(a-b+Math.PI,2*Math.PI)-Math.PI;
const SYN={door_open:"open",door_close:"open",pickup:"open",mark:"open",drawer:"open",trap:"open",glass:"open",click:"open",hide:"step",siren:"boom",lift:"boom"};
function playPan(buf,v,pan){const s=ac.createBufferSource(),g=ac.createGain();s.buffer=buf;g.gain.value=v;s.connect(g);
  if(ac.createStereoPanner){const pn=ac.createStereoPanner();pn.pan.value=cl(pan||0,-1,1);g.connect(pn);pn.connect(sfxB)}else g.connect(sfxB);s.start()}
function blip(kind,vol,pan){if(!ac||ac.state!=="running"||!(vol>.01))return;if(kind==="trap"&&vol>=1)vib([120,50,120]);else if(kind==="boom"&&vol>.5)vib(140);const sm=SND["sfx_"+kind];if(sm){playPan(sm,Math.min(1.5,vol),pan);return}kind=SYN[kind]||kind;const dur=kind==="dash"||kind==="boom"?.4:kind==="open"?.12:.09,n=Math.floor(ac.sampleRate*dur),b=ac.createBuffer(1,n,ac.sampleRate),d=b.getChannelData(0);
  for(let i=0;i<n;i++){const e=1-i/n;d[i]=(Math.random()*2-1)*e*e}
  const s=ac.createBufferSource(),f=ac.createBiquadFilter(),g=ac.createGain(),t=ac.currentTime;s.buffer=b;
  if(kind==="dash"){f.type="bandpass";f.Q.value=1.2;f.frequency.setValueAtTime(500,t);f.frequency.exponentialRampToValueAtTime(3000,t+dur)}else{f.type="lowpass";f.frequency.value=kind==="open"?2600:kind==="boom"?900:380}
  g.gain.value=Math.min(1,vol)*(kind==="dash"?1.4:kind==="open"?1.5:kind==="boom"?3.4:3);s.connect(f);f.connect(g);
  if(ac.createStereoPanner){const pn=ac.createStereoPanner();pn.pan.value=cl(pan||0,-1,1);g.connect(pn);pn.connect(sfxB)}else g.connect(sfxB);s.start(t)}
function playBuf(buf,v){if(!ac||!buf||ac.state!=="running")return;const s=ac.createBufferSource(),g=ac.createGain();s.buffer=buf;g.gain.value=v;s.connect(g);g.connect(sfxB);s.start()}
function loopSnd(ch,n,l,r){if(!SND[n])return;l=cl(l,0,1);r=cl(r,0,1);ch.busy()?ch.vol(l,r):ch.play(SND[n],1,l,r)}

// ---------------------------------------------------------------- уровень
class Level{
  constructor(D,CD,mp){this.D=D||DIFF.hard;this.CD=CD||{};this.mp=!!mp;this.size=SZ;this.gate_floor=0;this.wedge=new Set();this.smokes=[];while(!this.build());}
  maze(){const c=CN,S=SZ,g=Array.from({length:S},()=>Array(S).fill(1));g[1][1]=0;
    const st=[[0,0]],seen=new Set([0]);
    while(st.length){const[cx,cy]=st[st.length-1],nb=[];
      for(const[dx,dy]of D4){const nx=cx+dx,ny=cy+dy;if(nx>=0&&nx<c&&ny>=0&&ny<c&&!seen.has(nx*64+ny))nb.push([nx,ny,dx,dy])}
      if(nb.length){const[nx,ny,dx,dy]=pick(nb);g[cy*2+1+dy][cx*2+1+dx]=0;g[ny*2+1][nx*2+1]=0;seen.add(nx*64+ny);st.push([nx,ny])}else st.pop()}
    for(let rm=0,t=0;rm<16&&t<1500;t++){const x=ri(1,S-2),y=ri(1,S-2);if(g[y][x]===1&&x%2!==y%2){g[y][x]=0;rm++}}
    return g}
  dead(g){const o=[];for(let y=1;y<SZ-1;y+=2)for(let x=1;x<SZ-1;x+=2)if(D4.filter(([dx,dy])=>g[y+dy][x+dx]===0).length===1)o.push([x,y]);return o}
  spread(c,n,ds){c=shuf(c.slice());for(const d of ds){const ch=[];for(const[x,y]of c){if(ch.every(([a,b])=>hyp(x-a,y-b)>=d))ch.push([x,y]);if(ch.length===n)return ch}}return null}
  exitOf(g,sx,sy){for(const[dx,dy]of D4)if(g[sy+dy][sx+dx]===0)return[sx+dx+.5,sy+dy+.5,Math.atan2(dy,dx)];return[sx+.5,sy+.5,0]}
  cap(n,len,base){return n<=base?n:Math.min(n,Math.max(base,len))}   // защита: сверх hard-нормы не просим больше, чем есть кандидатов (иначе build() вечно перегенерирует)
  build(){const S=SZ,SR=this.D.safeR,B=DIFF.hard.lvl,g0=this.maze(),g1=this.maze();g0[1][0]=5;g0[S-2][S-1]=4;
    this.start=[1.5,1.5];this.gate_c=[S-.5,S-1.5];this.start_angle=g0[1][2]===0?0:Math.PI/2;
    const far=(x,y,p,d)=>hyp(x+.5-p[0],y+.5-p[1])>=d;
    const k1=new Set(this.dead(g1).map(c=>c[0]*64+c[1]));
    const opts=this.dead(g0).filter(c=>k1.has(c[0]*64+c[1])&&far(c[0],c[1],this.start,7)&&far(c[0],c[1],this.gate_c,SR+4));
    if(!opts.length)return false;
    const[sx,sy]=pick(opts);this.stairs={x:sx+.5,y:sy+.5};this.stairs_exit=[this.exitOf(g0,sx,sy),this.exitOf(g1,sx,sy)];
    this.floors=[{grid:g0,stands:[],lamps:[]},{grid:g1,stands:[],lamps:[]}];const sc=[sx+.5,sy+.5];
    for(let fi=0;fi<2;fi++){const fl=this.floors[fi];
      let d=this.dead(fl.grid).filter(c=>!(c[0]===sx&&c[1]===sy)&&far(c[0],c[1],sc,3));
      if(fi===0)d=d.filter(c=>far(c[0],c[1],this.start,7)&&far(c[0],c[1],this.gate_c,9));
      const ch=this.spread(d,this.cap(this.D.lvl.stands[fi],d.length,B.stands[fi]),[9,7,5,3,0]);if(!ch)return false;
      fl.stands=ch.map(([x,y])=>({x:x+.5,y:y+.5,drawers:[["junk","junk.0"],["junk","junk.0"]],opened:[false,false]}))}
    this.code=String(ri(0,9999)).padStart(4,"0");this.sc=ri(0,2);   // сценарий: 0 классика, 1 лифт, 2 шифр
    const sl=fi=>shuf(this.floors[fi].stands.flatMap(n=>[[n,0],[n,1]])),sa=sl(0),sb=sl(1);
    if(this.CD.noObj){}   // условия без цели побега (выживание): ни ключей, ни кодов, ни деталей лифта — все ящики идут в лут
    else if(this.sc===1){const m0=ri(1,2),pp=shuf([["gear",PARTS.gear[1]],["gear",PARTS.gear[1]],["fuel",PARTS.fuel[1]]]);
      [...sa.splice(0,m0),...sb.splice(0,3-m0)].forEach(([n,j],i)=>n.drawers[j]=pp[i])}
    else{const n0=ri(2,3);[...sa.splice(0,n0),...sb.splice(0,KEYS-n0)].forEach(([n,j])=>n.drawers[j]=["key",""]);
      const cs=this.sc===2?[["codeA",this.code[0]+"_"+this.code[2]+"_"],["codeB","_"+this.code[1]+"_"+this.code[3]]]:[["code",this.code]],rest=shuf([...sa,...sb]);
      cs.forEach((c,i)=>{const[n,j]=rest[i];n.drawers[j]=c})}
    {const jk=shuf(this.floors.flatMap(fl=>fl.stands.flatMap(n=>[[n,0],[n,1]])).filter(([n,j])=>n.drawers[j][0]==="junk")),cnt={};
      jk.forEach(([n,j],i)=>{const k=i===0&&!this.CD.noFuse?"fuse":rollLoot(cnt,this.CD.lvl);if(k!=="junk")n.drawers[j]=[k,"item."+k+".d"]})}   // 1-й ящик — гарантированный предохранитель
    if(this.CD.torchStand){   // фонарь в ближайших к старту тумбочках 1-го этажа (не вместо ключей/кодов/деталей/предохранителя). В MP — 4 штуки (по одному на игрока), число не зависит от состава лобби → карта у всех одинаковая
      const IMP=["key","code","codeA","codeB","gear","fuel","fuse","torch"],st=this.floors[0].stands.slice().sort((a,b)=>hyp(a.x-this.start[0],a.y-this.start[1])-hyp(b.x-this.start[0],b.y-this.start[1]));
      for(let n=this.mp?4:1,k=3;n>0&&k<=st.length+4;k++){const c=st.slice(0,k).flatMap(s=>[[s,0],[s,1]]).filter(([s,j])=>!IMP.includes(s.drawers[j][0]));if(c.length){const[s,j]=pick(c);s.drawers[j]=["torch","item.torch.d"];n--}}}
    const JUNK=Array.from({length:10},(_,i)=>"junk."+i);
    for(const fl of this.floors)for(const n of fl.stands)for(let j=0;j<2;j++)if(n.drawers[j][0]==="junk")n.drawers[j]=["junk",pick(JUNK)];
    for(let fi=0;fi<2;fi++){const g=this.floors[fi].grid,cand=[];
      for(let y=1;y<S-1;y++)for(let x=1;x<S-1;x++)if(g[y][x]===1&&x%2!==y%2&&far(x,y,sc,2.5)){
        if(fi===0&&!(far(x,y,this.start,5)&&far(x,y,this.gate_c,SR+2.5)))continue;cand.push([x,y])}
      const ex=this.sc===0?[1,2][fi]:0,nc=this.cap(this.D.lvl.hides[fi],cand.length-ex,B.hides[fi]),w=this.spread(cand,nc+ex,[10,8,6,4,0]);if(!w)return false;w.forEach(([x,y],i)=>g[y][x]=i<nc?2:8)}
    // ПАСХАЛКА: картинка easter.png на торцевой стене случайного свободного тупика (без stands и лестниц)
    this.easter=null;{const ec=[];
      for(let fi=0;fi<2;fi++){const fl=this.floors[fi],g=fl.grid;
        for(const[x,y]of this.dead(g)){
          if(x===sx&&y===sy)continue;
          if(fl.stands.some(n=>Math.floor(n.x)===x&&Math.floor(n.y)===y))continue;
          if(fi===0&&!(far(x,y,this.start,7)&&far(x,y,this.gate_c,9)))continue;
          const op=D4.find(([dx,dy])=>g[y+dy][x+dx]===0),walls=D4.filter(([dx,dy])=>g[y+dy][x+dx]===1);
          if(op&&walls.length)ec.push([fi,x,y,op,walls])}}
      if(ec.length){const[fi,x,y,op,walls]=pick(ec),g=this.floors[fi].grid,bk=[-op[0],-op[1]],wl=g[y+bk[1]][x+bk[0]]===1?bk:pick(walls);
        this.easter={f:fi,mx:x+wl[0],my:y+wl[1],cx:x,cy:y}}}
    for(const fl of this.floors)for(let y=1;y<S-1;y+=2)for(let x=1;x<S-1;x+=2)
      if(R()<.38||(x===1&&y===1)||(x===S-2&&y===S-2))fl.lamps.push([x+.5,y+.5]);
    this.cells=[];for(let y=1;y<S-1;y+=2)for(let x=1;x<S-1;x+=2)this.cells.push([x,y]);
    this.lift=[.5,1.5];this.doors=[[],[]];this.pon=new Set();
    for(let fi=0;fi<2;fi++){const g=this.floors[fi].grid,cd=[];   // тяжёлые двери в проходах между клетками
      for(let y=1;y<S-1;y++)for(let x=1;x<S-1;x++)if(g[y][x]===0&&x%2!==y%2&&far(x,y,sc,3)&&far(x,y,this.start,4)&&(fi||far(x,y,this.gate_c,SR+3)))cd.push([x,y]);
      const d=this.spread(cd,this.cap(this.D.lvl.doors[fi],cd.length,B.doors[fi]),[8,6,4,0]);if(!d)return false;d.forEach(([x,y])=>{g[y][x]=6;this.doors[fi].push([x,y])})}
    for(let fi=0;fi<2;fi++){const fl=this.floors[fi],g=fl.grid,cd=[];   // стекло ("g") и капканы ("b")
      for(const[x,y]of this.cells)if(g[y][x]===0&&far(x,y,sc,3)&&far(x,y,this.start,5)&&(fi||far(x,y,this.gate_c,SR+3))&&!fl.stands.some(n=>hyp(n.x-x-.5,n.y-y-.5)<1.5))cd.push([x,y]);
      const hz=this.spread(cd,8,[7,5,3,0]);if(!hz)return false;fl.haz=hz.map(([x,y],i)=>({x:x+.5,y:y+.5,t:i<2?"b":"g",cd:0,sprung:false}))}
    return true}
  in_safe(x,y,f){return this.D.safe&&f===0&&hyp(x-this.gate_c[0],y-this.gate_c[1])<this.D.safeR}   // DIFF.safe=false (кошмар) → зон нет вообще
  pass(v){return PASS(v)&&(v!==3||this.D.bash.on)}   // проходимость для монстров: закрытая дверь (3) — только если они умеют её ломать
  solid(x,y,f){const ix=Math.floor(x),iy=Math.floor(y);if(ix<0||iy<0||ix>=SZ||iy>=SZ)return true;{const v=this.floors[f].grid[iy][ix];return!(v===0||v===6||v===7)}}
  los(x0,y0,x1,y1,f){const n=Math.max(1,Math.floor(hyp(x1-x0,y1-y0)/.2));for(let i=1;i<n;i++){const t=i/n;if(this.solid(x0+(x1-x0)*t,y0+(y1-y0)*t,f))return false}return true}
  smoked(x0,y0,x1,y1,f){for(const s of this.smokes){if(s.f!==f)continue;const dx=x1-x0,dy=y1-y0,l2=dx*dx+dy*dy,t=l2?cl(((s.x-x0)*dx+(s.y-y0)*dy)/l2,0,1):0;
      if(hyp(x0+dx*t-s.x,y0+dy*t-s.y)<1.6)return true}return false}
  losM(x0,y0,x1,y1,f){return this.los(x0,y0,x1,y1,f)&&!this.smoked(x0,y0,x1,y1,f)}   // los для монстров: дым блокирует
  walls_between(x0,y0,x1,y1,f){const n=Math.max(1,Math.floor(hyp(x1-x0,y1-y0)/.2));let prev=this.solid(x0,y0,f),c=0;
    for(let i=1;i<=n;i++){const t=i/n,cur=this.solid(x0+(x1-x0)*t,y0+(y1-y0)*t,f);if(cur&&!prev)c++;prev=cur}return c}
  path_to(s,goal,f){const g=this.floors[f].grid,key=c=>c[0]*64+c[1],prev=new Map([[key(s),null]]),q=[s];let best=s,bd=(s[0]-goal[0])**2+(s[1]-goal[1])**2;
    for(let h=0;h<q.length;h++){const cur=q[h],d=(cur[0]-goal[0])**2+(cur[1]-goal[1])**2;if(d<bd){best=cur;bd=d;if(!d)break}
      for(const[dx,dy]of D4){const n=[cur[0]+dx,cur[1]+dy];if(prev.has(key(n)))continue;const row=g[n[1]];if(!row||!this.pass(row[n[0]]))continue;
        if(this.in_safe(n[0]+.5,n[1]+.5,f))continue;prev.set(key(n),cur);q.push(n)}}
    const p=[];let c=best;while(c&&!(c[0]===s[0]&&c[1]===s[1])){p.push(c);c=prev.get(key(c))}return p.reverse()}
  far_cell(from,min,f){const s=[Math.floor(from[0]),Math.floor(from[1])],g=this.floors[f].grid,dist=new Map([[s[0]*64+s[1],0]]),q=[s];
    for(let h=0;h<q.length;h++){const c=q[h],dc=dist.get(c[0]*64+c[1]);for(const[dx,dy]of D4){const n=[c[0]+dx,c[1]+dy],k=n[0]*64+n[1];
      if(!dist.has(k)&&this.pass(g[n[1]][n[0]])){dist.set(k,dc+1);q.push(n)}}}
    const ok=c=>c[0]%2===1&&c[1]%2===1&&!this.in_safe(c[0]+.5,c[1]+.5,f),all=[...dist].map(([k,d])=>[[Math.floor(k/64),k%64],d]);
    let o=all.filter(([c,d])=>d>=min&&ok(c));if(!o.length)o=all.filter(([c])=>ok(c));const c=pick(o)[0];return[c[0]+.5,c[1]+.5]}
}

// ---------------------------------------------------------------- монстр
const NOONE={id:null,x:-99,y:-99,floor:-1,hidden:true,torch:false,sprinting:false};
const SCN=["scn.0","scn.1","scn.2"];
class Monster{
  constructor(pos,f,type,D){this.D=D||DIFF.hard;this.sawT=0;this.roam=null;this.bcnt=0;this.bneed=0;this.type=type||0;this.prox=0;this.aud=0;this.aud_run=0;this.ch={a:new Ch,b:new Ch};this.reposition(pos,f);this.stair_cd=0;this.lost_t=0;this.linger=0;this.linger_total=0;this.repath=0;this.last_known=pos;this.sniff=0;this.sniffId=null;this.freeze=0;this.lit=0;this.rage=0;this.ragecd=0;this.slow=0;this.stun=0;this.wait=0;this.bash=0;this.bt=0;this.g=null}
  reposition(pos,f){this.x=pos[0];this.y=pos[1];this.floor=f;this.state=PATROL;this.path=[];this.goal=null;this.patrol_target=null;this.patrol_stairs=false;
    this.cross=false;this.arrived=false;this.lurk=0;this.grace=this.D.ai.grace;this.sawT=0;this.roam=null;this.seen=false;this.freeze=this.rage=this.slow=this.stun=this.wait=this.bash=0}
  alert(p){if(this.state!==CHASE)this.state=SEARCH;this.roam=null;this.last_known=p;this.arrived=false;this.cross=false;this.linger=0;this.path=[];this.goal=null;this.freeze=0;this.wait=0}
  go_stairs(L){this.state=SEARCH;this.last_known=[L.stairs.x,L.stairs.y];this.arrived=false;this.cross=true;this.lost_t=0;this.path=[];this.goal=null}
  change_floor(L){this.floor=1-this.floor;this.x=L.stairs_exit[this.floor][0];this.y=L.stairs_exit[this.floor][1];this.path=[];this.goal=null;
    this.patrol_target=null;this.patrol_stairs=false;this.stair_cd=10;this.grace=Math.max(this.grace,2)}
  move(wx,wy,sp,dt){const dx=wx-this.x,dy=wy-this.y,d=hyp(dx,dy);if(d<1e-6)return;const s=Math.min(d,sp*dt);this.x+=dx/d*s;this.y+=dy/d*s}
  goto(tx,ty,sp,dt,L,direct){
    if(direct){this.move(tx,ty,sp,dt);return false}
    this.repath-=dt;const goal=[Math.floor(tx),Math.floor(ty)];
    if(this.repath<=0||!this.goal||goal[0]!==this.goal[0]||goal[1]!==this.goal[1]){this.path=L.path_to([Math.floor(this.x),Math.floor(this.y)],goal,this.floor);this.goal=goal;this.repath=this.D.ai.repath}
    while(this.path.length&&hyp(this.path[0][0]+.5-this.x,this.path[0][1]+.5-this.y)<.12)this.path.shift();
    if(!this.path.length)return true;
    {const nx=this.path[0],B=this.D.bash;if(L.floors[this.floor].grid[nx[1]][nx[0]]===3){
      if(!B.on){this.path=[];this.goal=null;return false}   // двери не ломает (лёгкий): путь пересчитается в обход
      if(hyp(nx[0]+.5-this.x,nx[1]+.5-this.y)<1.15){
        if(this.bash===0&&B.hits){this.bt=B.lead;this.bcnt=0;this.bneed=ri(B.hits[0],B.hits[1])}   // режим «N ударов»: сколько ударов выдержит эта дверь
        this.bash+=dt;this.bt-=dt;if(this.bt<=0){this.bt=B.iv;this.bcnt++;this.g.door_bash(this,nx)}
        const wm=L.wedge.has(this.floor+":"+nx[0]+":"+nx[1])?2.5:1;   // клин (wedge) усиливает дверь ×2.5
        if(B.hits?this.bcnt>=Math.ceil(this.bneed*wm):this.bash>=B.time*wm){this.bash=0;this.g.door_break(this.floor,nx)}return false}}this.bash=0}
    this.move(this.path[0][0]+.5,this.path[0][1]+.5,sp,dt);return false}
  roam_near(dt,L,SP){const A=this.D.ai,c0=this.last_known;   // обыск: ходит по клеткам вокруг места пропажи игрока (кошмар)
    if(this.roam&&!this.goto(this.roam[0],this.roam[1],SP*A.searchSp,dt,L))return;
    this.roam=null;for(let i=0;i<14;i++){const c=pick(L.cells),cx=c[0]+.5,cy=c[1]+.5;if(hyp(cx-c0[0],cy-c0[1])<=A.searchR&&!L.in_safe(cx,cy,this.floor)){this.roam=[cx,cy];return}}}
  update(dt,g){const L=g.level,P=g.mps[this.type],A=this.D.ai;this.g=g;this.stair_cd=Math.max(0,this.stair_cd-dt);this.grace=Math.max(0,this.grace-dt);
    this.slow=Math.max(0,this.slow-dt);this.rage=Math.max(0,this.rage-dt);this.ragecd=Math.max(0,this.ragecd-dt);
    if(this.stun>0){this.stun-=dt;this.seen=false;return}   // оглушён вспышкой
    const mul=(this.rage>0?1.3:1)*(this.slow>0?.45:1)*(g.fstate==="long"?A.dark:1),SP=P.sp*mul,PT=P.pat*mul*(this.type===2&&this.patrol_stairs?1.35:1);
    let best=null,litT=null;
    for(const t of g.targets()){const s=this.floor===t.floor,d=s?hyp(t.x-this.x,t.y-this.y):99,sf=L.in_safe(t.x,t.y,t.floor),ok=s&&!t.hidden&&!sf,vk=t.shadow?.33:1;
      let sn=ok&&d<(t.torch?P.vt:P.vn)*vk&&L.losM(this.x,this.y,t.x,t.y,this.floor),hd=ok&&t.sprinting&&d<P.hr;
      if(this.freeze>0&&ok&&(d<4.2||(t.torch&&d<P.vt&&L.losM(this.x,this.y,t.x,t.y,this.floor))))this.freeze=0;   // чёрный «оживает»
      if(this.type===1&&ok&&t.torch&&t.angle!=null&&d<P.vt&&Math.abs(angD(t.angle,Math.atan2(this.y-t.y,this.x-t.x)))<.45&&L.losM(this.x,this.y,t.x,t.y,this.floor))litT=t;
      if(this.grace>0)sn=hd=false;
      const sc=this.sniff>0&&t.id===this.sniffId?3:sn?2:hd?1:0;
      if(!best||sc>best.sc||(sc===best.sc&&d<best.d))best={t,s,d,sf,sn,hd,sc}}
    if(!best)best={t:NOONE,s:false,d:99,sf:false,sn:false,hd:false,sc:0};
    const p=best.t,same=best.s,dist=best.d,seen=best.sn,heard=best.hd;this.seen=seen;
    if(this.type===1){if(litT&&this.ragecd<=0&&this.rage<=0){this.lit+=dt;if(this.lit>1.5){this.lit=0;this.rage=7;this.ragecd=20;this.state=CHASE;this.cross=false;this.lost_t=0;this.last_known=[litT.x,litT.y];g.rage_fx(this)}}else this.lit=Math.max(0,this.lit-dt*1.5)}
    if(this.cross&&same)this.cross=false;
    if(seen){this.sawT+=dt;if(this.state===CHASE||this.sawT>=A.react){this.state=CHASE;this.cross=false;this.lost_t=0;this.last_known=[p.x,p.y]}}   // react: задержка реакции (лёгкий)
    else{this.sawT=Math.max(0,this.sawT-dt);if(heard&&this.state!==CHASE)this.alert([p.x,p.y])}
    if(this.sniff>0){this.sniff-=dt;if(best.sc===3){if(same){this.state=CHASE;this.lost_t=0;this.cross=false;this.last_known=[p.x,p.y]}else if(!this.cross)this.go_stairs(L)}}
    if(this.state===CHASE&&!same)this.go_stairs(L);
    if(this.state===CHASE&&!seen){this.lost_t+=dt;if(this.lost_t>A.lose){this.state=SEARCH;this.arrived=false;this.linger=0}}
    if(this.state===CHASE){seen?this.goto(p.x,p.y,SP,dt,L,dist<A.direct):this.goto(this.last_known[0],this.last_known[1],SP,dt,L)}
    else if(this.state===SEARCH){
      if(!this.arrived){if(this.goto(this.last_known[0],this.last_known[1],this.cross?SP:SP*A.searchSp,dt,L)){this.arrived=true;this.roam=null;this.linger=0;this.linger_total=rnd(A.linger[0],A.linger[1]);
        if(this.cross){this.cross=false;this.change_floor(L);this.last_known=[this.x,this.y]}}}
      else{this.linger+=dt;if(same&&p.hidden&&dist<2.6){this.lurk+=dt;if(this.lurk>A.lurk){this.lurk=0;g.hit(this,p);return}}else if(A.searchR>0)this.roam_near(dt,L,SP);
        if(this.linger>this.linger_total){this.state=PATROL;this.patrol_target=null;this.lurk=0}}}
    else if(this.freeze>0)this.freeze-=dt;
    else if(this.wait>0)this.wait-=dt;
    else{
      if(!this.patrol_target){this.patrol_stairs=false;
        if(this.stair_cd<=0&&R()<(this.type===2?(same?.4:.7):(same?.12:.5))){this.patrol_target=[L.stairs.x,L.stairs.y];this.patrol_stairs=true}
        else{this.patrol_target=[1.5,1.5];const wd=A.wanderP>0&&R()<A.wanderP;   // wd: «бродит» — цель рядом, а не на другом конце карты
          for(let i=0;i<(wd?40:20);i++){const c=pick(L.cells),cx=c[0]+.5,cy=c[1]+.5,dd=hyp(cx-this.x,cy-this.y);
            if(!L.in_safe(cx,cy,this.floor)&&(wd?dd>1.5&&dd<A.wanderR:dd>8)){this.patrol_target=[cx,cy];break}}
          if(A.idleP>0&&R()<A.idleP)this.wait=rnd(A.idleT[0],A.idleT[1])}   // иногда останавливается (лёгкий)
        if(this.type===0&&this.grace<=0&&!this.patrol_stairs&&R()<A.freezeP)this.freeze=rnd(5,9)}   // чёрный замирает в темноте
      if(this.freeze<=0&&this.goto(this.patrol_target[0],this.patrol_target[1],PT,dt,L)){
        if(this.patrol_stairs){if(this.type===2&&R()<.5){this.wait=rnd(5,9);this.patrol_stairs=false;this.patrol_target=null}else this.change_floor(L)}else this.patrol_target=null}}
    if(same&&!p.hidden&&this.grace<=0&&dist<.75)g.hit(this,p)}
}

// ---------------------------------------------------------------- ресурсы рендера
const world=document.createElement("canvas");world.width=RW;world.height=RH;
const wctx=world.getContext("2d"),wimg=wctx.createImageData(RW,RH),u32=new Uint32Array(wimg.data.buffer),buf=new Uint8ClampedArray(RW*RH),zb=new Float32Array(RW),ROWBG=new Uint8Array(RH),chR=new Float32Array(RW*RH),chG=new Float32Array(RW*RH),chB=new Float32Array(RW*RH);
const mkBGS=()=>[7,11].map(R=>{const a=new Uint8Array(RH+8),hor=(RH+8)>>1;for(let y=0;y<RH+8;y++){const dy=Math.abs(y-hor);
  a[y]=dy<1?0:255*Math.pow(Math.max(0,1-(PROJ*.5/dy)/R),1.4)*(y>hor?.34:.22)}return a});
let BGS=mkBGS();
const VIG=new Float32Array(RW*RH);for(let y=0;y<RH;y++)for(let x=0;x<RW;x++){const dx=(x-RW/2)/(RW/2),dy=(y-RH/2)/(RH/2),
  a=Math.pow(cl((Math.sqrt(dx*dx*.8+dy*dy*1.1)-.45)/.85,0,1),1.6);VIG[y*RW+x]=1-Math.floor(a*235)/255}
const GRAIN=Array.from({length:8},()=>{const a=new Uint8Array(RW*RH);for(let i=0;i<a.length;i++)a[i]=Math.random()*32;return a});
const VAR=Array.from({length:256},()=>rnd(.88,1.06));
// текстуры: положи рядом floor.png (пол, "02") и wall.png (стены, "24"); подойдут и имена 02.png / 24.png
const TS=256,TEX={floor:null,wall:null,ceil:null,closet:null,door:null,gate:null,lift:null},TEXC={},TK={2:"closet",3:"door",4:"gate",5:"lift"};
// ЦВЕТ: buf остаётся яркостью (вся прежняя логика света/тумана/зерна не тронута). Цвет картинок хранится отдельно как множители
// каналов (цвет/яркость) в chR/chG/chB; в конце кадра пиксель = яркость × множитель. Нет цветных PNG или включён «ч/б» — множители не используются (прежний вид).
let HASCOL=false,CCON=false;const CS=.02;   // в Uint8-массивах множитель хранится как value*50 (CS=1/50)
function imgPix(im,w,h){const c=document.createElement("canvas");c.width=w;c.height=h;const g=c.getContext("2d",{willReadFrequently:true});g.drawImage(im,0,0,w,h);return g.getImageData(0,0,w,h).data}
function chromaOf(d,n,useA){const r=new Uint8Array(n),g=new Uint8Array(n),b=new Uint8Array(n);let col=false;
  for(let i=0;i<n;i++){const R=d[i*4],G=d[i*4+1],B=d[i*4+2],L=.299*R+.587*G+.114*B+4,x=(R+4)/L,y=(G+4)/L,z=(B+4)/L;
    r[i]=Math.min(255,Math.round(x/CS));g[i]=Math.min(255,Math.round(y/CS));b[i]=Math.min(255,Math.round(z/CS));
    if((!useA||d[i*4+3]>8)&&(Math.abs(x-1)>.06||Math.abs(y-1)>.06||Math.abs(z-1)>.06))col=true}
  return col?{r,g,b}:null}
function pcol(j,a,sp,i){const q=a/255,C=sp.cc;   // смешивание цвета спрайта с уже нарисованным (процедурный спрайт = нейтральный цвет)
  if(C){chR[j]=chR[j]*(1-q)+C.r[i]*CS*q;chG[j]=chG[j]*(1-q)+C.g[i]*CS*q;chB[j]=chB[j]*(1-q)+C.b[i]*CS*q}
  else{chR[j]+=(1-chR[j])*q;chG[j]+=(1-chG[j])*q;chB[j]+=(1-chB[j])*q}}
function loadTex(key,names,gain,abs){let i=0;const im=new Image();   // abs: яркость по самой картинке (×gain), иначе нормируется по среднему (как пол/стены)
  im.onload=()=>{try{const c=document.createElement("canvas");c.width=c.height=TS;const g=c.getContext("2d",{willReadFrequently:true});g.drawImage(im,0,0,TS,TS);
    const d=g.getImageData(0,0,TS,TS).data,a=new Float32Array(TS*TS);let m=0;for(let k=0;k<a.length;k++){a[k]=.299*d[k*4]+.587*d[k*4+1]+.114*d[k*4+2];m+=a[k]}m/=a.length;
    for(let k=0;k<a.length;k++)a[k]=abs?cl(a[k]/255*gain,.02,2.5):cl(1+(a[k]/m-1)*gain,.25,1.9);const C=chromaOf(d,a.length,false);TEXC[key]=C;if(C)HASCOL=true;TEX[key]=a}catch(e){}};
  im.onerror=()=>{if(++i<names.length)im.src=names[i]};im.src=names[0]}
loadTex("floor",["floor.png","02.png","floor.jpg","02.jpg"],1.25);loadTex("wall",["wall.png","24.png","wall.jpg","24.jpg"],1.1);
loadTex("ceil",["ceiling.png"],1.25);   // потолок: нормировка как у пола
for(const[k,f]of[["closet","closet.png"],["door","door.png"],["gate","gate.png"],["lift","lift.png"]])loadTex(k,[f],2,true);   // стены-объекты: яркость как в файле (серый 50% = как обычная стена)
// ПАСХАЛКА: easter.png рядом с index.html. Нет файла — EGG.on остаётся false и ничего не рисуется.
const EGG={on:false,w:0,h:0,gy:null,al:null,u0:0,uw:1,v0:0,vh:1};
(()=>{const im=new Image();im.onerror=()=>{};
  im.onload=()=>{try{const k=Math.min(1,256/Math.max(im.width,im.height)),w=Math.max(1,Math.round(im.width*k)),h=Math.max(1,Math.round(im.height*k));
    const c=document.createElement("canvas");c.width=w;c.height=h;const g=c.getContext("2d",{willReadFrequently:true});g.drawImage(im,0,0,w,h);
    const d=g.getImageData(0,0,w,h).data,gy=new Uint8Array(w*h),al=new Uint8Array(w*h);
    for(let i=0;i<w*h;i++){gy[i]=.299*d[i*4]+.587*d[i*4+1]+.114*d[i*4+2];al[i]=d[i*4+3]}
    const ar=w/h,bw=ar>=1?.8:.8*ar,bh=ar>=1?.8/ar:.8;   // картинка вписана в квадрат стены 0.8x0.8 по центру
    Object.assign(EGG,{w,h,gy,al,uw:bw,u0:(1-bw)/2,vh:bh,v0:(1-bh)/2,on:true})}catch(e){}};
  im.src="easter.png"})();
function eggCol(c,top,h,wx,flip,gg){const E=EGG,u=((flip?1-wx:wx)-E.u0)/E.uw;if(u<0||u>=1)return;
  const iu=(u*E.w)|0,y0=Math.max(0,top+Math.floor(h*E.v0)),y1=Math.min(RH,top+Math.floor(h*(E.v0+E.vh)));
  for(let y=y0;y<y1;y++){const v=(y-top-h*E.v0)/(h*E.vh);if(v<0||v>=1)continue;const i=((v*E.h)|0)*E.w+iu,a=E.al[i];if(!a)continue;
    const px=Math.min(255,gg*(.25+1.5*E.gy[i]/255)),j=y*RW+c;buf[j]=a===255?px:buf[j]*(1-a/255)+px*a/255;if(CCON){const q=a/255;chR[j]+=(1-chR[j])*q;chG[j]+=(1-chG[j])*q;chB[j]+=(1-chB[j])*q}}}
function sprite(w,h,fn){const c=document.createElement("canvas");c.width=w;c.height=h;const g=c.getContext("2d",{willReadFrequently:true});fn(g,w,h);
  const d=g.getImageData(0,0,w,h).data,gy=new Uint8Array(w*h),al=new Uint8Array(w*h);for(let i=0;i<w*h;i++){gy[i]=d[i*4];al[i]=d[i*4+3]}return{w,h,gy,al}}
const poly=(g,p,w,h,c)=>{g.fillStyle=c;g.beginPath();p.forEach(([x,y],i)=>i?g.lineTo(x*w,y*h):g.moveTo(x*w,y*h));g.fill()};
const SPR_MON=sprite(90,300,(g,w,h)=>{poly(g,[[.5,0],[.68,.05],[.9,.02],[.74,.11],[.66,.17],[.62,.2],[.38,.2],[.34,.17],[.26,.11],[.1,.02],[.32,.05]],w,h,"#030303");
  g.fillStyle="#030303";g.fillRect(w*.43,h*.18,w*.14,h*.07);
  poly(g,[[.2,.24],[.8,.24],[.88,.5],[.94,.78],[.84,.8],[.76,.52],[.7,.98],[.54,1],[.46,1],[.3,.98],[.24,.52],[.16,.8],[.06,.78],[.12,.5]],w,h,"#030303")});
Object.assign(SPR_MON,{wu:.42,hu:.98,ey:.092});
const SPR_BOILED=sprite(100,300,(g,w,h)=>{g.strokeStyle="#d8d8d8";g.lineWidth=2;
  for(let i=0;i<12;i++){const a=i/12*Math.PI*2,cx=w*.5,cy=h*.1;g.beginPath();g.moveTo(cx+Math.cos(a)*w*.3,cy+Math.sin(a)*h*.06);g.lineTo(cx+Math.cos(a)*w*.49,cy+Math.sin(a)*h*.11);g.stroke()}
  poly(g,[[.35,.15],[.65,.15],[.9,.3],[.95,.6],[.85,.62],[.78,.4],[.74,.98],[.26,.98],[.22,.4],[.15,.62],[.05,.6],[.1,.3]],w,h,"#040404");
  g.fillStyle="#7a7a7a";g.beginPath();g.ellipse(w*.5,h*.1,w*.3,h*.075,0,0,7);g.fill();
  g.fillStyle="#000";for(const d of[-1,1]){g.beginPath();g.ellipse(w*(.5+d*.1),h*.085,w*.045,h*.016,0,0,7);g.fill()}
  g.beginPath();g.ellipse(w*.5,h*.14,w*.11,h*.032,0,0,7);g.fill()});
Object.assign(SPR_BOILED,{wu:.52,hu:1.0});
const SPR_LOCUST=sprite(80,330,(g,w,h)=>{poly(g,[[.5,0],[.75,.05],[.88,.14],[.82,.22],[.7,.17],[.3,.17],[.18,.22],[.12,.14],[.25,.05]],w,h,"#020202");
  poly(g,[[.4,.17],[.6,.17],[.64,.3],[.8,.34],[.8,.55],[.7,.98],[.55,1],[.45,1],[.3,.98],[.2,.55],[.2,.34],[.36,.3]],w,h,"#030303");
  g.fillStyle="#bdbdbd";g.beginPath();g.ellipse(w*.5,h*.095,w*.17,h*.05,0,0,7);g.fill();
  g.fillStyle="#000";for(const d of[-1,1]){g.beginPath();g.ellipse(w*(.5+d*.08),h*.085,w*.025,h*.01,0,0,7);g.fill()}
  g.beginPath();g.ellipse(w*.5,h*.12,w*.05,h*.012,0,0,7);g.fill()});
Object.assign(SPR_LOCUST,{wu:.36,hu:1.12});
const SPR_MONS=[SPR_MON,SPR_BOILED,SPR_LOCUST];
const SPR_PLY=sprite(60,220,(g,w,h)=>{g.fillStyle="#b4b4b4";g.beginPath();g.ellipse(w*.5,h*.09,w*.2,h*.07,0,0,7);g.fill();
  poly(g,[[.3,.17],[.7,.17],[.8,.52],[.7,.54],[.66,.36],[.64,.98],[.53,.98],[.5,.62],[.47,.98],[.36,.98],[.34,.36],[.3,.54],[.2,.52]],w,h,"#8c8c8c");
  g.fillStyle="#000";for(const d of[-1,1]){g.beginPath();g.ellipse(w*(.5+d*.08),h*.085,w*.025,h*.012,0,0,7);g.fill()}});
Object.assign(SPR_PLY,{wu:.38,hu:.82});
const SPR_STAND=sprite(80,70,(g,w,h)=>{g.fillStyle="#969696";g.fillRect(0,0,w,h);g.fillStyle="#cdcdcd";g.fillRect(0,0,w,6);
  g.lineWidth=3;g.strokeStyle="#3c3c3c";g.strokeRect(1.5,1.5,w-3,h-3);
  for(let i=0;i<2;i++){const y=10+i*30;g.fillStyle="#6e6e6e";g.fillRect(7,y,w-14,24);g.lineWidth=2;g.strokeStyle="#282828";g.strokeRect(8,y+1,w-16,22);
    g.fillStyle="#e6e6e6";g.beginPath();g.arc(w/2,y+12,4,0,7);g.fill()}});
const SPR_STAIRS=[true,false].map(up=>sprite(100,200,(g,w,h)=>{g.fillStyle="#aaa";g.fillRect(0,0,w,h);g.fillStyle="#060606";g.fillRect(10,10,w-20,h-10);
  for(let i=0;i<6;i++){const y=h-16-i*22,ins=14+(up?i:5-i)*5;g.fillStyle="#cdcdcd";g.fillRect(ins,y-1,w-2*ins,3);g.fillStyle="#505050";g.fillRect(ins,y+3,w-2*ins,2)}
  const cx=w/2;g.fillStyle="#f0f0f0";g.beginPath();up?(g.moveTo(cx,24),g.lineTo(cx-16,50),g.lineTo(cx+16,50)):(g.moveTo(cx,50),g.lineTo(cx-16,24),g.lineTo(cx+16,24));g.fill();
  g.lineWidth=3;g.strokeStyle="#3c3c3c";g.strokeRect(1.5,1.5,w-3,h-3)}));
const SPR_DOOR=sprite(100,200,(g,w,h)=>{g.fillStyle="#b9b9b9";g.fillRect(0,0,12,h);g.fillRect(w-12,0,12,h);g.fillRect(0,0,w,16);g.fillStyle="#6a6a6a";g.fillRect(12,16,10,h);g.fillRect(w-22,16,10,h)});
const SPR_GLASS=sprite(60,16,(g,w,h)=>{g.fillStyle="#dcdcdc";for(let i=0;i<14;i++){const x=(i*37%54)+3,y=(i*11%10)+2;g.beginPath();g.moveTo(x,y);g.lineTo(x+7,y+2);g.lineTo(x+2,y+5);g.fill()}});
const SPR_TRAP=sprite(60,24,(g,w,h)=>{g.strokeStyle="#9a9a9a";g.lineWidth=3;g.beginPath();g.ellipse(w/2,h*.62,w*.42,h*.3,0,0,7);g.stroke();g.fillStyle="#bdbdbd";
  for(let i=0;i<7;i++){const x=w*.12+i*(w*.76/6);g.beginPath();g.moveTo(x-3,h*.6);g.lineTo(x,h*.15);g.lineTo(x+3,h*.6);g.fill()}});
const SPR_WIRE=sprite(80,8,(g,w,h)=>{g.fillStyle="#cfcfcf";g.fillRect(0,3,w,2);g.fillRect(2,0,3,h);g.fillRect(w-5,0,3,h)});
const SPR_MARK=sprite(40,90,(g,w,h)=>{g.strokeStyle="#d8d8d8";g.fillStyle="#f0f0f0";g.lineWidth=3;g.beginPath();g.moveTo(w*.5,h*.4);g.lineTo(w*.5,h*.94);g.stroke();
  g.beginPath();g.ellipse(w*.5,h*.22,w*.36,h*.2,0,0,7);g.fill();g.fillStyle="#303030";g.beginPath();g.ellipse(w*.5,h*.22,w*.14,h*.08,0,0,7);g.fill();
  g.strokeStyle="#bbb";g.lineWidth=2;g.beginPath();g.ellipse(w*.5,h*.95,w*.4,h*.04,0,0,7);g.stroke()});
const SPR_DROP=sprite(60,40,(g,w,h)=>{poly(g,[[.08,1],[.18,.45],[.38,.18],[.62,.18],[.82,.45],[.92,1]],w,h,"#9a9a9a");g.fillStyle="#e6e6e6";g.fillRect(w*.38,h*.1,w*.24,h*.14);g.strokeStyle="#3c3c3c";g.lineWidth=2;g.strokeRect(w*.3,h*.55,w*.4,h*.25)});
const DECAL={drop:[.3,.2,SPR_DROP],mark:[.34,.62,SPR_MARK],door:[1,1,SPR_DOOR],glass:[.55,.1,SPR_GLASS],trap:[.5,.14,SPR_TRAP],wire:[.9,.06,SPR_WIRE]};   // [ширина, высота, спрайт] в клетках
// PNG-подмена спрайтов. Файл есть — объект спрайта меняется НА МЕСТЕ (ссылки в DECAL / SPR_MONS / SPR_STAIRS остаются верными),
// размер на экране (wu/hu) и освещение прежние. Файла нет — остаётся процедурный спрайт, ошибок нет.
function pngSprite(file,sp,noEyes){const im=new Image();
  im.onload=()=>{try{const k=Math.min(1,256/Math.max(im.width,im.height)),w=Math.max(1,Math.round(im.width*k)),h=Math.max(1,Math.round(im.height*k)),d=imgPix(im,w,h),gy=new Uint8Array(w*h),al=new Uint8Array(w*h);
    for(let i=0;i<w*h;i++){gy[i]=.299*d[i*4]+.587*d[i*4+1]+.114*d[i*4+2];al[i]=d[i*4+3]}
    const cc=chromaOf(d,w*h,true);Object.assign(sp,{w,h,gy,al,cc});if(noEyes)delete sp.ey;if(cc)HASCOL=true}catch(e){}};
  im.onerror=()=>{};im.src=file}
[["stand.png",SPR_STAND],["door_open.png",SPR_DOOR],["stairs_up.png",SPR_STAIRS[0]],["stairs_down.png",SPR_STAIRS[1]],["trap.png",SPR_TRAP],["wire.png",SPR_WIRE],["glass.png",SPR_GLASS],["mark.png",SPR_MARK],
 ["monster1.png",SPR_MON,1],["monster2.png",SPR_BOILED,1],["monster3.png",SPR_LOCUST,1],["player.png",SPR_PLY]].forEach(a=>pngSprite(...a));   // 1 = убрать процедурные светящиеся глаза (они привязаны к силуэту)
const JUMPS=[],JIMG=[];
function buildJump(t,ok){const jimg=JIMG[t],c=document.createElement("canvas");c.width=W;c.height=H;const g=c.getContext("2d");g.fillStyle="#080808";g.fillRect(0,0,W,H);
  if(ok){const s=Math.max(W/jimg.width,H/jimg.height),w=jimg.width*s+1,h=jimg.height*s+1;g.drawImage(jimg,(W-w)/2,(H-h)/2,w,h)}
  else if(t){const red=t===1;g.fillStyle="#020202";g.fillRect(W*.3,H*.4,W*.4,H);g.fillStyle=red?"#7a1414":"#d6bfa0";g.beginPath();g.ellipse(W/2,H*.32,W*.12,H*.22,0,0,7);g.fill();g.fillStyle="#000";for(const d of[-1,1]){g.beginPath();g.ellipse(W/2+d*W*.045,H*.27,W*.02,H*.03,0,0,7);g.fill()}g.beginPath();g.ellipse(W/2,H*.42,W*(red?.06:.025),H*(red?.08:.05),0,0,7);g.fill()}else{g.fillStyle="#020202";g.fillRect(W*.3,H*.1,W*.4,H);g.fillStyle="#f0f0f0";for(const d of[-1,1]){g.beginPath();g.ellipse(W/2+d*W*.045,H*.2,W*.03,H*.035,0,0,7);g.fill()}}
  JUMPS[t]=c}

// ---------------------------------------------------------------- сенсорный интерфейс
class TouchUI{
  constructor(){this.sprint=false;this.reset()}
  reset(){this.js=null;this.look=null;this.last=0;this.dx=0;this.home=[190,540];this.base=this.home;this.knob=this.home;this.move=[0,0];this.bf={};this.acts=[]}
  get B(){const b={e:[[1160,540],74,"E"],f:[[1160,370],52,"F"],use:[[1000,450],46,t("touch.use")],next:[[1160,230],38,">"],say:[[1085,150],32,"!"],sprint:[[1000,600],54,t("touch.sprint")],pause:[[1220,150],34,"II"],mark:[[1000,320],38,t("touch.mark")]};if(this.nomark)delete b.mark;const S=SET.btnS;for(const n in b)b[n]=[b[n][0],b[n][1]*S,b[n][2]];return b}
  pop(){const d=this.dx;this.dx=0;return d}
  feed(kind,id,p){const[x,y]=p;
    if(kind==="down"){for(const[n,[c,r]]of Object.entries(this.B))if(hyp(x-c[0],y-c[1])<=r*1.25){this.bf[id]=n;n==="sprint"?(this.sprint=SET.sprintHold?true:!this.sprint):this.acts.push(n);return}
      if(x<480&&y>160){if(this.js===null){this.js=id;this.base=SET.joyFixed?this.home:[Math.max(120,Math.min(x,480)),Math.max(215,Math.min(y,H-120))];this.knob=this.base;this.move=[0,0]}}
      else if(x>=480&&this.look===null){this.look=id;this.last=x}}
    else if(kind==="move"){if(id===this.js){const dx=x-this.base[0],dy=y-this.base[1],d=hyp(dx,dy);
        if(d>1e-6){this.knob=[this.base[0]+dx/d*Math.min(d,110),this.base[1]+dy/d*Math.min(d,110)];this.move=Math.min(1,d/110)<.22?[0,0]:[dx/d,dy/d]}}
      else if(id===this.look){this.dx+=x-this.last;this.last=x}}
    else{if(id===this.js){this.js=null;this.base=this.knob=this.home;this.move=[0,0]}else if(id===this.look)this.look=null;if(SET.sprintHold&&this.bf[id]==="sprint")this.sprint=false;delete this.bf[id]}}
  draw(eReady){circ(this.base[0],this.base[1],110,"rgba(255,255,255,.12)","rgba(255,255,255,.43)",3);circ(this.knob[0],this.knob[1],46,"rgba(255,255,255,.47)","rgba(255,255,255,.78)",3);
    const pr=Object.values(this.bf);for(const[n,[c,r,l]]of Object.entries(this.B)){const on=pr.includes(n)||(n==="sprint"&&this.sprint)||(n==="e"&&eReady);
      ctx.globalAlpha=SET.btnA;circ(c[0],c[1],r,on?"rgba(255,255,255,.37)":"rgba(255,255,255,.125)",on?"rgba(255,255,255,.75)":"rgba(255,255,255,.47)",3);T(l,F(l.length===1?32:22,l.length===1),c[0],c[1],"#f5f5f5",1,SET.btnA)}}
}
// (кортеж B[n] = [центр, радиус, подпись])

// ---------------------------------------------------------------- игра
const keys=new Set();let mouseDX=0,locked=false;
const lock=()=>{if(!TOUCH&&document.pointerLockElement!==cv)try{const p=cv.requestPointerLock();p&&p.catch&&p.catch(()=>{})}catch(e){}};
const unlockMouse=()=>{if(document.pointerLockElement)document.exitPointerLock()};
const fs=()=>{const d=document.documentElement;if(document.fullscreenElement)document.exitFullscreen();else if(d.requestFullscreen)
  d.requestFullscreen().then(()=>screen.orientation&&screen.orientation.lock&&screen.orientation.lock("landscape").catch(()=>{})).catch(()=>{})};


// ======================================================================================================
// ИГРОВЫЕ УСЛОВИЯ (режимы катки). Окно выбора открывается после выбора сложности.
// Добавить режим = 1) строка в MODES  2) запись в CONDS (хуки — все необязательные)  3) строки cond.<id>, cond.<id>.d в lang.js.
// Больше нигде править не надо. Спидран — отдельный флаг из меню сложности, с условиями комбинируется.
//   MODES: solo — виден в одиночном меню, mp — виден в мультиплеере (хост выбирает в лобби, значение лежит в meta.cond).
//   Game: this.cond — id условия, this.CD — его запись из CONDS, this.cs — состояние условия (сбрасывается в new_game).
// Хуки CONDS (вызываются как this.hook(имя,...), this внутри хука = сама запись CONDS, первым аргументом приходит игра g):
//   onStart(g)            — конец new_game (в т.ч. после рестарта)       onUpdate(g,dt) — каждый кадр, кроме паузы/«over»/«win»
//   onDraw(g)             — после HUD (рисуем поверх мира)               onPlayerHit(g,m) — монстр поймал игрока; вернуть false = отменить
//   checkWin(g)           — true → игрок побеждает (вызывается, пока он жив и в игре)
//   exitLocked(g)         — ключ lang-строки, если ворота и лифт заперты; иначе falsy
//   noiseLocal(g,x,y,f,rad,one) — вместо стандартной реакции монстров на шум (хост/одиночка); true = обработано
//   onAct(g,вид,x,y,f)    — своё действие игрока: "drawer" (ящик), "door", "torch"       takeBlock(g,k) — ключ lang-строки, если предмет из ящика взять нельзя
//   torchBlock(g)         — ключ lang-строки, если фонарь включить нельзя                  onEv(g,ev)     — сетевое событие неизвестного ядру типа (MP)
//   light(g,dt)           — вместо стандартного update_light; true = свет обработан   shade(g,r) — вместо финального затемнения кадра; true = обработано
// Данные CONDS: slots — число слотов инвентаря; swap — полный слот вытесняет старый предмет на пол; torchStand — фонарь-предмет лежит в ближайших тумбочках; noObj — нет цели побега (ключи/код/лифт, HUD целей скрыт); noFuse — предохранителя нет и он не чинит свет; noShort — режиссёр без короткого замыкания;
//   torchSec — время жизни заряда фонаря; lvl — таблица лута (only / mulP, см. lootTable); winKey — заголовок экрана победы.
// ======================================================================================================
const MODES=[
  {id:"normal",nameKey:"cond.normal",descKey:"cond.normal.d",solo:true,mp:true},
  {id:"blackout",nameKey:"cond.blackout",descKey:"cond.blackout.d",solo:true,mp:true},
  {id:"timed",nameKey:"cond.timed",descKey:"cond.timed.d",solo:true,mp:true},
  {id:"silence",nameKey:"cond.silence",descKey:"cond.silence.d",solo:true,mp:true},
  {id:"pack",nameKey:"cond.pack",descKey:"cond.pack.d",solo:true,mp:true},
  {id:"chaos",nameKey:"cond.chaos",descKey:"cond.chaos.d",solo:true,mp:true}];
const condList=mp=>MODES.filter(m=>mp?m.mp:m.solo);
const condOk=(id,mp)=>condList(mp).some(m=>m.id===id)?id:"normal";   // неизвестное/недоступное в этом режиме → «обычный»
// Тёмный кадр: видно только в радиусе Rt вокруг игрока, у ХИС-палочек, фонарей союзников (MP) и во время вспышки (fl 0..1). amb — фоновая яркость.
function shadeDark(g,r,Rt,amb,fl){
  const{buf,zb,hor,cx,cy,dx_,dy_,plx,ply,pz}=r,p=g.player,src=g.glows.filter(o=>o.f===p.floor).map(o=>[o.x,o.y,3.8,Math.min(1,o.t/3)]);
  if(g.mp)NET.players.forEach(o=>{if(o.seen&&o.m===0&&o.torch&&o.floor===p.floor&&o!==g.spec)src.push([o.x,o.y,5,.7])});
  const rx=new Float32Array(RW),ry=new Float32Array(RW),kk=new Float32Array(RW);
  for(let c=0;c<RW;c++){const cm=2*c/RW-1;rx[c]=dx_+plx*cm;ry[c]=dy_+ply*cm;kk[c]=hyp(rx[c],ry[c])}
  for(let y=0;y<RH;y++){const dy=y-hor,d0=dy>0?PROJ*(.5+pz)/dy:dy<0?PROJ*(.5-pz)/-dy:1e9;   // d0 — перпендикулярная дистанция до пола/потолка в этой строке
    for(let c=0;c<RW;c++){const d=Math.min(d0,zb[c]);   // стена ближе плоскости пола → видим стену
      let m=amb+(Rt>0?Math.pow(Math.max(0,1-d*kk[c]/Rt),1.4):0)+(fl>0?fl*Math.pow(Math.max(0,1-d*kk[c]/9),1.2):0);
      for(const[sx,sy,sr,sa]of src){const q=Math.max(0,1-hyp(cx+rx[c]*d-sx,cy+ry[c]*d-sy)/sr);if(q>0)m+=q*q*sa}
      const i=y*RW+c;buf[i]*=Math.min(1,m)*VIG[i]}}
  return true}
const CONDS={
  normal:{},
  // ---------------------------------------------------------------- БЛЭКАУТ
  blackout:{
    noFuse:true,noShort:true,torchSec:150,   // фонарь живёт 150 с вместо 90; предохранителя нет
    lvl:{mulP:{battery:2}},                  // батарейки в тумбочках выпадают ровно вдвое чаще
    onStart(g){g.fstate="long";g.light=.03;g.ft=999;g.bo_done=true},
    light(g){g.fstate="long";g.light=.03;g.ft=999;g.bo_done=true;return true},   // свет не мигает и не возвращается
    shade(g,r){return shadeDark(g,r,g.player.torch?9:1.5,.012,0)}   // видно только в радиусе своего фонаря, ХИС-палочек и (в MP) фонарей союзников
  },
  // ---------------------------------------------------------------- ГЛУХАЯ ТИШИНА
  silence:{
    RUN:1.2,HUM:4,   // период шума от бега и от горящего фонаря, сек
    onStart(g){g.mps.forEach(P=>{P.vn=1.1;P.vt=1.4;P.hr=999});g.cs.run=0;g.cs.hum=0;g.notify(t("n.cond.silence"),6)},   // зрение — вплотную (убивают с .75), слух — вся карта
    // любой шум слышат ВСЕ монстры обоих этажей (кроме гонящихся); с другого этажа идут к лестнице, меняют этаж и бредут к источнику
    noiseLocal(g,x,y,f,rad,one){const L=g.level;if(L.in_safe(x,y,f))return true;
      const cost=m=>m.floor===f?hyp(m.x-x,m.y-y):60+hyp(m.x-L.stairs.x,m.y-L.stairs.y)+hyp(L.stairs.x-x,L.stairs.y-y);
      let a=g.monsters.filter(m=>m.state!==CHASE&&!(m.stun>0));if(one){a.sort((u,v)=>cost(u)-cost(v));a=a.slice(0,1)}
      for(const m of a){if(m.floor===f){m.nz=null;m.alert([x,y])}else{m.nz={x,y,f,t:25};if(!m.cross)m.go_stairs(L)}}
      return true},
    onAct(g,k,x,y,f){g.noise(x,y,f,999);if(k==="torch")g.cs.hum=this.HUM},   // ящик, дверь, щелчок фонаря
    onUpdate(g,dt){const p=g.player,s=g.cs;
      if(g.mode==="play"&&!p.hidden){   // свой шум: бег и гудение включённого фонаря (мультиплеер: хозяину уходит событие noise)
        s.run=Math.max(0,s.run-dt);if(p.sprinting&&p.moving&&s.run<=0){s.run=this.RUN;g.noise(p.x,p.y,p.floor,999)}
        s.hum=Math.max(0,s.hum-dt);if(p.torch&&s.hum<=0){s.hum=this.HUM;g.noise(p.x,p.y,p.floor,999)}}
      if(g.mp&&!NET.host)return;
      const L=g.level;for(const m of g.monsters){const z=m.nz;if(!z)continue;z.t-=dt;   // отложенный шум с другого этажа
        if(z.t<=0||m.state===CHASE){m.nz=null;continue}
        if(m.floor===z.f){m.nz=null;m.alert([z.x,z.y])}
        else if(hyp(m.x-L.stairs.x,m.y-L.stairs.y)<.8)m.change_floor(L)}}
  },
  // ---------------------------------------------------------------- ОГРАНИЧЕННЫЙ РЮКЗАК
  pack:{
    slots:1,swap:true,torchStand:true,   // 1 слот; новый предмет вытесняет старый на пол; фонарь лежит в ближайших тумбочках
    onStart(g){g.cs.tor=false;g.notify(t("n.cond.pack"),7)},
    torchBlock(g){return g.cs.tor?false:"n.pack.notorch"},
    takeBlock(g,k){return k==="torch"&&g.cs.tor?"n.pack.havetorch":false},   // второй фонарь не берём — пусть достанется другим
    shade(g,r){if(g.cs.tor||g.mode==="spec")return false;return shadeDark(g,r,0,.012,Math.min(1,g.flash_t*2.2))},   // без фонаря — тьма: только ХИС-палочки и вспышки
    onDraw(g){if(!g.cs.tor&&g.mode!=="spec")T(t("cond.pack.hud"),F(18),30,H-96,"#9a9a9a")}
  },
  // ---------------------------------------------------------------- ХАОС
  chaos:{
    GAP:[30,45],BUFF:15,FUSE:3,
    onStart(g){g.cs.t=rnd(this.GAP[0],this.GAP[1]);g.cs.last="";g.notify(t("n.cond.chaos"),6)},
    onUpdate(g,dt){if(g.mp&&!NET.host)return;   // события запускает хост (или одиночка), остальные получают type:"chaos" через ev
      if(!(g.mp?["play","drawers","keypad","pause","spec"]:["play","drawers","keypad"]).includes(g.mode))return;
      const s=g.cs;s.t-=dt;if(s.t<=0){s.t=rnd(this.GAP[0],this.GAP[1]);this.fire(g)}},
    onEv(g,ev){if(ev.type!=="chaos")return;if(g.mp&&NET.meta&&NET.meta.host&&ev.from!==NET.meta.host)return;this.apply(g,ev,false)},
    doorList(L){const a=[];L.doors.forEach((d,f)=>d.forEach(([x,y])=>a.push([f,x,y])));return a},   // порядок одинаков у всех клиентов (карта по сиду) → в событии шлём индексы
    build(g,k){const L=g.level;   // данные события или null, если сейчас его не провести (нет подходящих дверей / мест)
      if(k==="doors"){const all=this.doorList(L),st=all.map(([f,x,y])=>L.floors[f].grid[y][x]),nc=st.filter(v=>v===3).length,no=st.filter(v=>v===6).length;if(nc+no===0)return null;
        const v=nc&&no?pick([3,6]):no?3:6,   // v — во что переводим двери: 3 закрыть, 6 открыть
          who=[g.player,...(g.mp?[...NET.players.values()].filter(r=>r.seen&&r.m===0):[])],
          busy=(f,x,y)=>who.some(q=>q.floor===f&&hyp(q.x-x-.5,q.y-y-.5)<1.1)||g.monsters.some(m=>m.floor===f&&hyp(m.x-x-.5,m.y-y-.5)<1.3),   // не захлопываем двери на людях и монстрах
          ix=[];all.forEach(([f,x,y],i)=>{if(st[i]===(v===3?6:3)&&!busy(f,x,y))ix.push(i)});
        return ix.length?{type:"chaos",k,v,ix}:null}
      if(k==="crackers"){const c=[];for(const t0 of g.targets()){let n=0;for(let i=0;i<30&&n<2;i++){const q=pick(L.cells),X=q[0]+.5,Y=q[1]+.5,d=hyp(X-t0.x,Y-t0.y);if(d>2.5&&d<7&&!L.in_safe(X,Y,t0.floor)){c.push(X,Y,t0.floor);n++}}}
        return c.length?{type:"chaos",k,c}:null}
      if(k==="buff")return{type:"chaos",k,v:pick(["adr","stim"])};
      return{type:"chaos",k}},   // swap
    fire(g){let o=null;for(const k of shuf(["buff","swap","crackers","doors"].filter(e=>e!==g.cs.last))){o=this.build(g,k);if(o)break}   // подряд одно и то же не выпадает
      if(!o)return;g.cs.last=o.k;this.apply(g,o,true);if(g.mp)NET.event(o)},
    snap(L,x,y,f){let b=[1.5,1.5],bd=1e9;for(const[cx,cy]of L.cells){const X=cx+.5,Y=cy+.5,d=hyp(X-x,Y-y);if(d<bd&&!L.in_safe(X,Y,f)){bd=d;b=[X,Y]}}return b},
    apply(g,ev,host){const p=g.player,L=g.level,k=ev.k;
      if(k==="doors"){const all=this.doorList(L);for(const i of Object.values(ev.ix||{})){const d=all[i];if(d)g.door_set(d[0],d[1],d[2],ev.v|0,false)}
        blip("boom",.6,0);g.notify(t(ev.v===3?"n.chaos.close":"n.chaos.open"),4)}
      else if(k==="buff"){if(g.mode!=="spec"&&g.mode!=="jumpscare"&&g.mpm===0){if(ev.v==="adr"){p.adr=this.BUFF;p.stamina=1;p.exhausted=false}else p.stim=this.BUFF}   // как предметы adren/stim, но на 15 с
        g.notify(t(ev.v==="adr"?"n.chaos.adr":"n.chaos.stim"),5)}
      else if(k==="swap"){g.notify(t("n.chaos.swap"),5);
        if(["play","drawers","keypad","pause"].includes(g.mode)&&g.mpm===0){   // игрок: на другой этаж в ближайшую свободную точку
          if(g.mode==="drawers"||g.mode==="keypad")g.close();
          const nf=1-p.floor,sp=g.free_near(p.x,p.y,nf,2)||L.stairs_exit[nf].slice(0,2);
          p.hidden=false;p.hide_cd=.4;p.floor=nf;p.x=sp[0];p.y=sp[1];p.cam=[sp[0],sp[1]];p.moving=p.sprinting=false;p.z=p.vz=p.dash_t=0;g.fade=.8;g.interact=null}
        if(host)for(const m of g.monsters){const nf=1-m.floor;m.nz=null;m.reposition(this.snap(L,m.x,m.y,nf),nf);m.grace=1.5}}   // монстры: тоже на другой этаж (хост; клиенты видят через pushMon)
      else if(k==="crackers"){const c=Object.values(ev.c||{});
        for(let i=0;i+2<c.length;i+=3){const x=+c[i],y=+c[i+1],f=c[i+2]|0;g.fx.push({x,y,f,t:this.FUSE,mine:!!host});g.snd3d("click",x,y,f,22,.9)}   // mine: шум от взрыва делает только хост/одиночка
        g.notify(t("n.chaos.crackers"),4)}}
  },
  // ---------------------------------------------------------------- ВЫЖИВАНИЕ НА ВРЕМЯ
  timed:{
    noObj:true,noFuse:true,winKey:"cond.timed.win",   // предохранителя в лоте нет → и долгого отключения света тут нет (onStart), иначе его нечем чинить
    TOTAL:300,WAVES:4,AGGR:1.08,AGGR_SENSE:1.1,   // 5 минут; волна каждые 60 с; рост скорости/чувств монстров за волну
    lvl:{only:{cracker:14,smoke:11,flash:9,adren:9,wedge:9,pills:8}},   // только расходники: петарды, дымовые, фотоаппараты, адреналин, клинья, таблетки
    exitLocked(){return"n.cond.locked"},
    onStart(g){g.cs.el=0;g.cs.wave=0;g.bo_done=true;g.notify(t("n.cond.timed"),6)},   // bo_done: долгих блэкаутов нет (мигания и короткие затухания остаются)
    onUpdate(g,dt){const s=g.cs;s.el+=dt;const k=Math.min(this.WAVES,Math.floor(s.el/60));while(s.wave<k)this.wave(g,++s.wave)},
    // волны: 1 и 3 — монстры агрессивнее; 2 — облава (режиссёр); 4 — и то и другое
    wave(g,n){if(n%2===1||n===this.WAVES){g.mps.forEach(P=>{P.sp*=this.AGGR;P.pat*=this.AGGR;P.vt*=this.AGGR_SENSE;P.vn*=this.AGGR_SENSE;P.hr*=this.AGGR_SENSE});g.notify(t("n.cond.aggr"),5)}
      if(n%2===0||n===this.WAVES){if(!g.mp||NET.host)g.start_raid()}},   // облаву запускает хост (или одиночка), остальные получают событие raid
    checkWin(g){return g.cs.el>=this.TOTAL},   // в MP каждый, кто жив на нуле, побеждает сам; погибший уже в режиме наблюдателя
    onDraw(g){const s=Math.ceil(Math.max(0,this.TOTAL-g.cs.el)),low=s<=30,bl=low&&Math.floor(g.t*2)%2===0;
      T(String(Math.floor(s/60)).padStart(2,"0")+":"+String(s%60).padStart(2,"0"),F(46,1),W/2,34,bl?"#ff6a5a":low?"#ffb0a5":"#f0f0f0",1);
      T(t("cond.timed.hud"),F(16),W/2,64,"#9a9a9a",1)}
  }
};

class Game{
  constructor(o){o=o||{};this.mp=!!o.mp;this.diff=DIFFS.includes(o.diff)?o.diff:(o.gm==="nightmare"?"nightmare":"normal");this.speedrun=o.speed!=null?!!o.speed:o.gm==="speed";this.D=DIFF[this.diff];this.cond=condOk(o.cond,this.mp);this.CD=CONDS[this.cond];this.noObj=!!this.CD.noObj;this.seed=o.seed;this.touch=new TouchUI;this.touch.nomark=!this.D.marks;this.exit=null;this.dbg=DBG.state();this.new_game()}
  new_game(){if(this.monsters)this.stopLoops();this.cs={};if(this.mp)R=mulberry(this.seed||1);const L=this.level=new Level(this.D,this.CD,this.mp);
    const npl=this.mp?cl(NET.players.size+1,1,4):1,A=this.D.ai,gmf=A.spd*(1+.05*(npl-1));this.mps=MP.map(P=>({...P,sp:P.sp*gmf,pat:P.pat*gmf,vt:P.vt*A.vis,vn:P.vn*A.vis,hr:P.hr*A.hear}));const p=this.player={};this.reset_player();
    this.monsters=[0,1,2].map(t=>{const mf=pick([0,0,1]);return new Monster(L.far_cell(L.start,26,mf),mf,t,this.D)});
    const bo=rnd(this.D.light.at[0],this.D.light.at[1]);R=Math.random;this.maxl=this.D.lives;this.lives=this.maxl;this.bo_n=0;this.mpm=0;this.imm=0;this.spec=null;this.specI=0;this.sniff_t=this.D.sniff?rnd(this.D.sniff[0],this.D.sniff[1]):0;this.push_t=0;this.labels=[];this.keys=0;this.has_code=false;this.killer=0;this.bo_at=bo;this.bo_done=false;this.mode="play";this.t=this.play_time=0;this.msg="";this.msg_t=0;
    this.ui_stand=null;this.pad="";this.pad_msg="";this.shake=0;this.js_t=0;this.fade=1;this.interact=null;this.light=.9;this.fstate="normal";this.ft=rnd(this.D.light.first[0],this.D.light.first[1]);this.ftick=0;this._tm=null;
    this.inv={};this.slot=0;this.slots=[];this.glows=[];this.det_c=0;this.marks=[];this.markN=0;this.fx=[];this.drops=[];this.did=0;this.dropped=null;this.wires=[];this.wid=0;this.siren=0;this.siren_on=false;this.sirenT=0;this.sirenMine=false;this.gate_open=false;this.parts={gear:0,fuel:0};
    this.lift_on=false;this.lift_ready=false;this.lift_t=0;this.lift_c=0;this.lift_mine=false;this.hold=0;this.hum_t=0;this.wrong=0;this.ca=false;this.cb=false;
    this.dir_t=rnd(this.D.dir.gap[0],this.D.dir.gap[1]);this.raid=null;this.flash_t=0;this.strobe=0;this.sane=1;this.sane_c=0;this.lit=true;this.fear=false;this.ghost=null;this.ghost_t=rnd(8,14);this.step_t=rnd(6,12);this.say_t=0;this.sayI=0;
    this.grab(true);this.notify(t(SCN[L.sc]),7);this.stopLoops();this.hook("onStart")}
  reset_player(keepTorch){const L=this.level,p=this.player,tor=p.torch;Object.assign(p,{x:L.start[0],y:L.start[1],angle:L.start_angle,stamina:1,exhausted:false,sprinting:false,moving:false,
    hidden:false,hide_tile:null,hide_dir:0,hide_exit:[L.start[0],L.start[1]],look_off:0,cam:[L.start[0],L.start[1]],torch:!!keepTorch&&tor,bob_t:0,hide_cd:0,floor:0,z:0,vz:0,dash_t:0,dash_cd:0,adr:0,stim:0,shadow:0,trapped:0,charge:keepTorch&&p.charge!=null?p.charge:1,pills:0,det:0,mirror:0})}
  get SL(){return this.CD.slots||SLOTS}   // число слотов (CONDS[..].slots), по умолчанию 5
  grab(on){on?lock():unlockMouse()}
  notify(t,d){this.msg=t;this.msg_t=d||3}
  hook(n,...a){const f=this.CD[n];return f?f.call(this.CD,this,...a):undefined}   // вызов хука игровых условий (см. CONDS)
  stopLoops(){CH.lamp.stop();(this.monsters||[]).forEach(m=>{m.ch.a.stop();m.ch.b.stop()})}
  update_audio(){if(!Object.keys(SND).length)return;const p=this.player,L=this.level,calm=(L.in_safe(p.x,p.y,p.floor)?.45:1)*(p.stim>0?.55:1);
    for(const m of this.monsters){const dx=m.x-p.x,dy=m.y-p.y,d=Math.max(.01,hyp(dx,dy));let muff,lat;
      if(m.floor===p.floor){muff=Math.pow(.28,L.walls_between(p.x,p.y,m.x,m.y,p.floor));lat=(-dx*Math.sin(p.angle)+dy*Math.cos(p.angle))/d}else{muff=.16;lat=0}
      let mon=Math.pow(Math.max(0,1-d/13),1.8)*calm*muff,run;
      if(m.state===CHASE){mon=Math.min(1,mon*1.5+.1*calm*muff);run=Math.pow(Math.max(0,1-d/16),1.4)*calm*muff}else run=Math.pow(Math.max(0,1-d/6),1.5)*.3*calm*muff;
      m.aud+=(mon-m.aud)*.15;m.aud_run+=(run-m.aud_run)*.15;
      const vl=1-.8*Math.max(0,lat),vr=1+.8*Math.min(0,lat);
      if(m.type===0){loopSnd(m.ch.a,"monster",m.aud*vl,m.aud*vr);loopSnd(m.ch.b,"running",m.aud_run*vl,m.aud_run*vr)}
      else{const v=Math.max(m.aud*.4,m.aud_run);loopSnd(m.ch.b,m.type===1?"boiled":"locust",v*vl,v*vr)}}
    const lv=this.fstate==="long"?0:(this.fstate!=="normal"||this.strobe>0)?.9:.12;loopSnd(CH.lamp,"lamp",lv,lv)}
  update_prox(){const p=this.player,L=this.level;for(const m of this.monsters){if(m.floor!==p.floor){m.prox*=.8;continue}
    let v=Math.pow(Math.max(0,1-hyp(m.x-p.x,m.y-p.y)/10),1.2);if(v>0&&L.walls_between(p.x,p.y,m.x,m.y,p.floor))v*=.5;m.prox+=(v-m.prox)*.2}}
  sched_bo(){const a=this.D.light.again;   // планирует следующее долгое отключение (bo_at). Без again — больше не будет
    if(!a){this.bo_done=true;return}
    this.bo_done=false;this.bo_n=(this.bo_n|0)+1;this.bo_at=this.play_time+a[0]+mulberry((this.seed||1)*31+this.bo_n*7919)()*(a[1]-a[0])}   // seed-RNG: в MP у всех одинаково
  update_light(dt){if(this.hook("light",dt))return;const Lt=this.D.light;this.ft-=dt;if(!this.bo_done&&this.play_time>=this.bo_at){this.bo_done=true;this.fstate="long";this.ft=rnd(Lt.len[0],Lt.len[1]);this.light=.03;this.notify(t("n.light.out"),4)}
    if(this.fstate==="normal"){this.light=.92;if(this.ft<=0){this.fstate=R()<Lt.blackP?"blackout":"burst";this.ft=this.fstate==="burst"?rnd(Lt.burst[0],Lt.burst[1]):rnd(Lt.black[0],Lt.black[1])}}
    else if(this.fstate==="burst"){this.ftick-=dt;if(this.ftick<=0){this.ftick=rnd(.03,.1);this.light=pick([.05,.95,.3,.9,.1,.7])}if(this.ft<=0){this.fstate="normal";this.ft=rnd(Lt.gap[0],Lt.gap[1])}}
    else{this.light=.03;if(this.ft<=0){if(this.fstate==="long"){this.fstate="burst";this.ft=rnd(Lt.back[0],Lt.back[1]);this.notify(t("n.light.back"),4);this.sched_bo()}else{this.fstate="normal";this.ft=rnd(Lt.gap[0],Lt.gap[1])}}}}
  kill(m){if(DBG.f(this,"god")||this.mode==="jumpscare"||this.mode==="spec"||this.mode==="win"||this.imm>0||this.mpm)return;if(this.hook("onPlayerHit",m)===false)return;this.killer=m?m.type:0;this.lives--;this.mode="jumpscare";this.js_t=0;this.ui_stand=null;this.stopLoops();
    const sn=SND["scream_"+["","boiled","locust"][this.killer]]||SND.scream;vib([400,80,400]);if(sn)CH.scream.play(sn,0,1,1)}
  respawn(){const L=this.level;this.reset_player(true);this.sane=Math.max(this.sane,.6);if(this.mp)this.imm=4;else this.monsters.forEach(m=>{const mf=pick([0,0,1]);m.reposition(L.far_cell(L.start,26,mf),mf)});
    this.mode="play";this.fade=1;this.notify(t("n.respawn"),4)}
  cast(px,py,rdx,rdy){const g=this.level.floors[this.player.floor].grid;let mx=Math.floor(px),my=Math.floor(py);
    const ddx=rdx?Math.abs(1/rdx):1e30,ddy=rdy?Math.abs(1/rdy):1e30;let stx,sdx,sty,sdy,side=0,t;
    if(rdx<0){stx=-1;sdx=(px-mx)*ddx}else{stx=1;sdx=(mx+1-px)*ddx}if(rdy<0){sty=-1;sdy=(py-my)*ddy}else{sty=1;sdy=(my+1-py)*ddy}
    for(;;){if(sdx<sdy){sdx+=ddx;mx+=stx;side=0}else{sdy+=ddy;my+=sty;side=1}if(mx<0||my<0||mx>=SZ||my>=SZ)return[99,1,0,side,mx,my];t=g[my][mx];if(t&&t!==6&&t!==7)break}
    let dist,wx;if(side===0){dist=sdx-ddx;wx=py+rdy*dist}else{dist=sdy-ddy;wx=px+rdx*dist}return[dist,t,wx-Math.floor(wx),side,mx,my]}
  find_interact(){const p=this.player,L=this.level;if(p.hidden)return{k:"unhide"};if(p.trapped>0)return{k:"struggle"};let best=null;
    for(const[o,k]of[...L.floors[p.floor].stands.map(n=>[n,"stand"]),[L.stairs,"stairs"]]){const dx=o.x-p.x,dy=o.y-p.y,d=hyp(dx,dy);
      if(d<1.8){const ad=mod(Math.atan2(dy,dx)-p.angle+Math.PI,2*Math.PI)-Math.PI;if(Math.abs(ad)<.65&&(!best||d<best.d)&&L.los(p.x,p.y,o.x,o.y,p.floor))best={d,o,k}}}
    if(best)return{k:best.k,o:best.k==="stand"?best.o:null};
    if(this.mp)for(const r of NET.players.values())if(r.seen&&r.trapped&&r.m===0&&r.floor===p.floor&&hyp(r.x-p.x,r.y-p.y)<1.8)return{k:"free",o:r};
    if(this.drops.length){let bd=null;for(const d of this.drops)if(d.f===p.floor){const dd=hyp(d.x-p.x,d.y-p.y);if(dd<1.1&&(!bd||dd<bd.d))bd={d:dd,o:d}}if(bd)return{k:"drop",o:bd.o}}
    {const gd=L.floors[p.floor].grid;for(const[x,y]of L.doors[p.floor]){if(gd[y][x]!==6)continue;const dx=x+.5-p.x,dy=y+.5-p.y,d=hyp(dx,dy);
      if(d<1.7&&d>.8&&Math.abs(angD(Math.atan2(dy,dx),p.angle))<.6)return{k:"door",o:[x,y]}}}
    const[dist,t,,,mx,my]=this.cast(p.x,p.y,Math.cos(p.angle),Math.sin(p.angle));
    if(dist<1.6){if(t===2)return{k:"hide",o:[mx,my]};if(t===4)return{k:"gate"};if(t===5)return{k:"lift"};if(t===3)return{k:"door",o:[mx,my]};if(t===8)return{k:"panel",o:[mx,my]}}return null}
  // ---- свободная точка для игрока (те же размеры, что в blocked(): стены, тумбочки, лестница)
  spot_free(x,y,f){const L=this.level,r=.22;
    for(const ox of[-r,r])for(const oy of[-r,r])if(L.solid(x+ox,y+oy,f))return false;
    for(const n of L.floors[f].stands)if(hyp(x-n.x,y-n.y)<.6)return false;
    return hyp(x-L.stairs.x,y-L.stairs.y)>=.55}
  free_near(x,y,f,rad){let best=null,bd=1e9;   // ближайшая свободная точка (шаг .25) в радиусе rad клеток
    for(let oy=-rad;oy<=rad;oy+=.25)for(let ox=-rad;ox<=rad;ox+=.25){const d=hyp(ox,oy);if(d>rad||d>=bd)continue;if(this.spot_free(x+ox,y+oy,f)){best=[x+ox,y+oy];bd=d}}
    return best}
  hide_spot(mx,my,dx,dy,f){const cx=mx+.5,cy=my+.5;   // 4 соседа шкафа: сторона входа, противоположная, боковые; иначе — радиус 2
    for(const[a,b]of[[dx,dy],[-dx,-dy],[-dy,dx],[dy,-dx]])if(this.spot_free(cx+a,cy+b,f))return[cx+a,cy+b];
    return this.free_near(cx,cy,f,2)}
  leave_hide(){const p=this.player,t0=p.hide_tile;let e=null,cx=p.x,cy=p.y;
    if(t0){cx=t0[0]+.5;cy=t0[1]+.5;e=this.hide_spot(t0[0],t0[1],Math.round(Math.cos(p.hide_dir)),Math.round(Math.sin(p.hide_dir)),p.floor)}
    if(!e)e=p.hide_exit;
    p.hidden=false;p.x=e[0];p.y=e[1];p.cam=[e[0],e[1]];p.angle=hyp(e[0]-cx,e[1]-cy)>.01?Math.atan2(e[1]-cy,e[0]-cx):p.hide_dir;p.hide_cd=.4}
  do_interact(){const it=this.interact,p=this.player;if(!it)return;const k=it.k;
    if(k==="unhide"){if(p.hide_cd<=0)this.leave_hide()}
    else if(k==="hide"&&p.hide_cd<=0){const[mx,my]=it.o,cx=mx+.5,cy=my+.5,vx=p.x-cx,vy=p.y-cy;let dx,dy;
      if(Math.abs(vx)>Math.abs(vy)){dx=vx>0?1:-1;dy=0}else{dx=0;dy=vy>0?1:-1}
      if(this.level.solid(cx+dx,cy+dy,p.floor)){const alt=[[-dx,-dy],[-dy,dx],[dy,-dx]].find(([a,b])=>!this.level.solid(cx+a,cy+b,p.floor));if(alt){dx=alt[0];dy=alt[1]}}   // смотрим в проход, а не в столб
      p.hidden=true;p.hide_tile=[mx,my];p.hide_dir=Math.atan2(dy,dx);p.hide_exit=[cx+dx,cy+dy];p.look_off=0;p.angle=p.hide_dir;p.x=cx;p.y=cy;
      p.cam=[cx+dx*.44,cy+dy*.44];p.hide_cd=.5;blip("hide",.5,0);if(this.mp&&!NET.host)NET.event({type:"hide",x:cx,y:cy,f:p.floor});this.monsters.forEach(m=>{
      if(m.state===CHASE&&m.seen&&hyp(m.x-cx,m.y-cy)<6.5){m.alert([cx,cy]);m.lurk=m.D.ai.lurk-.9}})}
    else if(k==="stand"){this.ui_stand=it.o;this.mode="drawers";this.grab(false)}
    else if(k==="gate"){const L=this.level,lk=this.hook("exitLocked");
      if(lk)this.notify(t(lk),3);
      else if(this.gate_open)this.win();
      else if(this.siren_on)this.notify(t("n.gate.work",{s:Math.ceil(this.siren)}),2);
      else if(L.sc===1)this.notify(t("n.gate.lift"),3);
      else if(this.keys<KEYS)this.notify(t("n.gate.keys",{max:KEYS,n:this.keys}),3);
      else if(L.sc===0&&L.pon.size<3)this.notify(t("n.gate.power",{n:L.pon.size}),3);
      else{this.mode="keypad";this.pad="";this.pad_msg="";this.grab(false)}}
    else if(k==="lift")this.use_lift();
    else if(k==="door")this.door_toggle(it.o[0],it.o[1]);
    else if(k==="panel"){const key=p.floor+":"+it.o[0]+":"+it.o[1];
      if(this.level.pon.has(key))this.notify(t("n.panel.already"),2);
      else if((this.inv.lockpick|0)>0){this.spend("lockpick");this.hold=0;this.panel_on(p.floor,it.o[0],it.o[1])}
      else this.notify(t("n.panel.hold"),2)}
    else if(k==="struggle")p.trapped=Math.max(0,p.trapped-.6);
    else if(k==="free"){NET.event({type:"free",to:it.o.id});it.o.trapped=false;this.notify(t("n.free",{who:it.o.n}),2)}
    else if(k==="drop")this.pick_drop(it.o)
    else if(k==="stairs")this.use_stairs()}
  use_stairs(){const p=this.player,L=this.level;p.floor=1-p.floor;let[ex,ey,a]=L.stairs_exit[p.floor];if(!this.spot_free(ex,ey,p.floor)){const s=this.free_near(ex,ey,p.floor,2);if(s){ex=s[0];ey=s[1]}}p.hidden=false;p.x=ex;p.y=ey;p.angle=a;p.cam=[ex,ey];
    p.moving=p.sprinting=false;this.fade=1;this.interact=null;this.notify(t(p.floor?"n.stairs.up":"n.stairs.down"),2.5)}
  open(i){const n=this.ui_stand;if(!n||n.opened[i])return;
    {const k0=n.drawers[i][0],bk=this.hook("takeBlock",k0);if(bk){this.notify(t(bk),3);return}
      if(USE.includes(k0)&&!this.inv[k0]&&this.slots.length>=this.SL&&!this.CD.swap){this.notify(t("n.slots.full",{n:this.SL}),3);return}}n.opened[i]=true;blip("drawer",.8,0);this.hook("onAct","drawer",n.x,n.y,this.player.floor);const k=n.drawers[i][0];if(this.mp){const f=this.player.floor,si=this.level.floors[f].stands.indexOf(n);if(si>=0)NET.event({type:"open",f,s:si,i})}
    this.take(k,null,true,n.drawers[i][1])}
  take(k,who,own,txt){if(own&&k!=="junk")blip("pickup",.8,0);const L=this.level,sf=who?".o":".me",tp=(n,o)=>t("take."+n+sf,Object.assign({who:who},o));
    if(k==="key"){this.keys++;this.notify(tp("key",{n:this.keys,max:KEYS}),this.keys<KEYS?3:5)}
    else if(k==="code"){this.has_code=true;this.notify(tp("code",{code:L.code}),5)}
    else if(k==="codeA"||k==="codeB"){this[k==="codeA"?"ca":"cb"]=true;this.notify(tp("frag",{txt:txt}),5)}
    else if(k==="gear"||k==="fuel"){this.parts[k]++;this.notify(tp(k),4)}
    else if(k==="torch"){if(own){this.cs.tor=true;this.notify(t("n.pack.torch"),5)}}   // фонарь-предмет (условие «рюкзак»): другим игрокам при чужом взятии ничего не приходит
    else if(ITEMS[k]&&own){this.dropped=null;this.give(k,k==="flash"?3:k==="lockpick"?2:1);this.notify(t("take.item",{n:ITEMS[k].n,d:ITEMS[k].d})+(this.dropped?" "+t("n.pack.drop",{n:this.dropped}):""),4.5)}}
  close(){this.mode="play";this.ui_stand=null;this.grab(true)}
  win(){this.mode="win";this.stopLoops();blip("win",1,0);this.grab(false);if(this.mp){this.mpm=2;NET.event({type:"win"})}}
  submit(){const L=this.level;
    if(this.pad===L.code){this.mode="play";this.pad="";this.grab(true);this.start_siren(true)}
    else{this.pad="";this.pad_msg="pad.wrong";this.shake=.6;const gc=L.gate_c;this.noise(gc[0],gc[1],0,99,true);
      if(++this.wrong>=3){this.wrong=0;this.noise(gc[0],gc[1],0,99);this.notify(t("n.alarm"),4)}}}
  kp(c){if(c==="<")this.pad=this.pad.slice(0,-1);else if(c==="X")this.close();else if(this.pad.length<4){this.pad+=c;this.pad_msg="";if(this.pad.length===4)this.submit()}}
  blocked(x,y){if(DBG.f(this,"noclip"))return DBG.oob(x,y);const L=this.level,f=this.player.floor,r=.22;for(const ox of[-r,r])for(const oy of[-r,r])if(L.solid(x+ox,y+oy,f))return true;
    for(const n of L.floors[f].stands)if(hyp(x-n.x,y-n.y)<.55)return true;return hyp(x-L.stairs.x,y-L.stairs.y)<.5}
  update_player(dt){const p=this.player,tc=TOUCH?this.touch:null;
    let turn=mouseTurn(dt)*.0024*SET.sens+((keys.has("ArrowRight")?1:0)-(keys.has("ArrowLeft")?1:0))*2*dt;mouseDX=0;if(tc)turn+=tc.pop()*.005*SET.sens;
    p.hide_cd=Math.max(0,p.hide_cd-dt);p.dash_cd=Math.max(0,p.dash_cd-dt);if(p.z>0||p.vz>0){p.vz-=7*dt;p.z+=p.vz*dt;if(p.z<=0){p.z=0;p.vz=0}}
    if(p.hidden){p.look_off=cl(p.look_off+turn,-.45,.45);p.angle=p.hide_dir+p.look_off;p.sprinting=p.moving=false;p.stamina=Math.min(1,p.stamina+.25*dt);return}
    p.angle+=turn;if(this.mode!=="play"){p.moving=p.sprinting=false;return}
    if(p.trapped>0){p.moving=p.sprinting=false;p.cam=[p.x,p.y];return}
    const fx=Math.cos(p.angle),fy=Math.sin(p.angle),rx=-fy,ry=fx,k=c=>keys.has(c)?1:0;
    let mv=(k("KeyW")||k("ArrowUp"))-(k("KeyS")||k("ArrowDown")),st=k("KeyD")-k("KeyA");if(tc){mv-=tc.move[1];st+=tc.move[0]}
    const vx=fx*mv+rx*st,vy=fy*mv+ry*st,n=hyp(vx,vy);p.moving=n>0;
    const want=((SET.sprintTog?sprintLatch:(k("ShiftLeft")||k("ShiftRight")))||(tc&&tc.sprint))&&p.moving;if(tc&&p.exhausted)tc.sprint=false;if(p.exhausted)sprintLatch=false;if(p.exhausted&&p.stamina>.3)p.exhausted=false;
    p.sprinting=!!(want&&!p.exhausted&&p.stamina>0);
    if(p.sprinting){if(!(p.adr>0))p.stamina-=.26*dt;if(p.stamina<=0){p.stamina=0;p.exhausted=true}}else p.stamina=Math.min(1,p.stamina+.16*dt);
    if(p.dash_t>0){p.dash_t-=dt;const ds=9*dt,dx=fx*ds,dy=fy*ds;if(!this.blocked(p.x+dx,p.y))p.x+=dx;if(!this.blocked(p.x,p.y+dy))p.y+=dy;p.moving=true}
    else if(n>0){const sp=(p.sprinting?3.9:2.3)*(p.stim>0?1.2:1)*DBG.spd(this)*dt,dx=vx/n*sp,dy=vy/n*sp;if(!this.blocked(p.x+dx,p.y))p.x+=dx;if(!this.blocked(p.x,p.y+dy))p.y+=dy;p.bob_t+=dt*(p.sprinting?11:7)}
    p.cam=[p.x,p.y]}
  update(dt){this.t+=dt;if(this.mode!==this._tm){this.touch.reset();this._tm=this.mode}
    if(this.msg_t>0)this.msg_t-=dt;this.shake=Math.max(0,this.shake-dt);if(this.mode==="pause"&&!this.mp)return;
    if(this.imm>0)this.imm-=dt;const m=this.mode;
    if(["play","drawers","keypad","spec"].includes(m)||(this.mp&&m==="pause")){this.play_time+=dt;this.fade=Math.max(0,this.fade-dt/1.4);m==="spec"?this.update_spec(dt):this.update_player(dt);this.update_light(dt);this.update_extra(dt);DBG.update(this,dt);
      if(!this.mp)this.monsters.forEach(mo=>mo.update(dt,this));this.update_prox();if(m==="play")this.interact=this.find_interact();this.update_audio()}
    else if(m==="jumpscare"){this.js_t+=dt;if(this.js_t>=JT){CH.scream.stop();if(this.lives>0)this.respawn();else if(this.mp)this.die_mp();else{this.mode="over";this.grab(false)}}}
    if(m!=="over"&&m!=="win"){this.hook("onUpdate",dt);if((m==="play"||m==="drawers"||m==="keypad"||(this.mp&&m==="pause"))&&this.hook("checkWin"))this.win()}
    if(this.speedrun)this.tick_timer();if(this.mp)this.mp_update(dt)}
  tick_timer(){const e=document.getElementById("wn-timer");if(e){const t=this.play_time;e.textContent=String(Math.floor(t/60)).padStart(2,"0")+":"+(t%60).toFixed(1).padStart(4,"0")}}
  pause(on){if(on){this.mode="pause";this.grab(false);if(ac&&!this.mp)ac.suspend()}else{this.mode="play";this.grab(true);if(ac)ac.resume()}}
  act(a){if(a==="resume")this.pause(false);else if(a==="restart")this.new_game();else if(a==="menu")this.exit="menu"}
  key(e){const c=e.code,m=this.mode;if(c==="F11"){fs();return}
    if(m==="play"){if(c==="Space")this.jump();else if(c==="ShiftLeft"||c==="ShiftRight")this.dash();if(c==="KeyE")this.do_interact();else if(c==="KeyF")this.toggle_torch();else if(c==="KeyG")this.use("cracker");else if(c==="KeyQ")this.use_sel();else if(c==="KeyZ")this.cycle();else if(c==="KeyM")this.mark();else if(/^Digit[1-5]$/.test(c))this.selSlot(+c.slice(-1)-1);else if(/^Numpad[1-4]$/.test(c))this.say(+c.slice(-1)-1);else if(c==="Escape")this.pause(true)}
    else if(m==="pause"){if(c==="Escape")this.pause(false);else if(c==="KeyQ")this.exit="menu"}
    else if(m==="drawers"){if(c==="Escape"||c==="KeyE")this.close();else if(/^(Digit|Numpad)1$|ArrowUp/.test(c))this.open(0);else if(/^(Digit|Numpad)2$|ArrowDown/.test(c))this.open(1)}
    else if(m==="keypad"){if(c==="Escape")this.close();else if(c==="Backspace")this.kp("<");else if(c==="Enter"||c==="NumpadEnter"){if(this.pad.length===4)this.submit()}else if(/^\d$/.test(e.key))this.kp(e.key)}
    else if(m==="spec"){if(c==="Escape")this.exit="menu";else if(c==="KeyE"||c==="Space"||c==="ArrowRight")this.specI++;else if(c==="ArrowLeft")this.specI--}
    else if(m==="over"){if(c==="Enter")this.new_game();else if(c==="Escape")this.exit="menu"}
    else if(m==="win"&&(c==="Enter"||c==="Escape"))this.exit="menu"}
  tap(p){const m=this.mode;
    if(m==="play")lock();
    else if(m==="spec"){if(!this.spec){for(const[,a,r]of this.btns())if(inR(r,p))this.act(a)}else this.specI++}
    else if(m==="pause"||m==="over"||m==="win"){for(const[,a,r]of this.btns())if(inR(r,p))this.act(a)}
    else if(m==="drawers"){const r=this.dr();let hit=false;for(let i=0;i<2;i++)if(inR(r[i],p)){this.open(i);hit=true}
      if(!hit&&(inR(this.closeR(),p)||!inR(this.panel(),p)))this.close()}
    else if(m==="keypad"){for(const[l,r]of this.padKeys()[1])if(inR(r,p)){this.kp(l);break}}}
  touchEv(kind,id,p){if(this.mode!=="play")return;
    if(kind==="down")for(let i=0;i<this.SL;i++)if(this.slots[i]&&inR(this.slotRect(i),p)){if(this.slot===i)this.use_sel();else this.slot=i;return}
    this.touch.feed(kind,id,p);for(const a of this.touch.acts.splice(0)){
    if(a==="e")this.do_interact();else if(a==="f")this.toggle_torch();else if(a==="use")this.use_sel();else if(a==="next")this.cycle();else if(a==="say")this.say(this.sayI=((this.sayI|0)+1)%4);else if(a==="mark")this.mark();else if(a==="pause")this.pause(true)}}
  // ---- мультиплеер
  mark(){const p=this.player;if(!this.D.marks||this.mode!=="play"||p.hidden||p.trapped>0)return;
    const near=this.marks.findIndex(m=>m.f===p.floor&&hyp(m.x-p.x,m.y-p.y)<1.2);
    if(near>=0){this.marks.splice(near,1);blip("mark",.5,0);this.notify(t("n.mark.off"),1.5);return}
    if(this.marks.length>=MAXM)this.marks.shift();
    this.marks.push({x:p.x,y:p.y,f:p.floor,n:++this.markN});blip("mark",.7,0);this.notify(t("n.mark.on",{n:this.markN}),2.5)}
  jump(){const p=this.player;if(!DBG.air(this)||this.mode!=="play"||p.hidden||p.z>0)return;p.vz=DBG.vz(this);p.z=.001}
  dash(){const p=this.player;if(!DBG.air(this)||this.mode!=="play"||p.hidden||p.z<=.02||p.dash_cd>0)return;p.dash_cd=2;p.dash_t=.3;blip("dash",.5,0);if(window.NET)NET.event({type:"dash"})}
  targets(){const p=this.player;if(!this.mp)return[p];const o=[];
    if(["play","drawers","keypad","pause"].includes(this.mode)&&this.imm<=0&&this.mpm===0)o.push({id:NET.id,x:p.x,y:p.y,floor:p.floor,hidden:p.hidden,torch:p.torch,sprinting:p.sprinting,angle:p.angle,shadow:p.shadow>0});
    NET.players.forEach(r=>{if(r.seen&&r.m===0&&!(r.imm>0))o.push({id:r.id,r,x:r.x,y:r.y,floor:r.floor,hidden:r.hidden,torch:r.torch,sprinting:r.sprinting,angle:r.angle,shadow:r.shadow})});return o}
  hit(m,p){if(p.r){p.r.imm=JT+4;NET.event({type:"kill",to:p.id,k:m.type})}else this.kill(m)}
  die_mp(){this.mpm=1;this.mode="spec";this.specI=0;this.spec=null;this.grab(false);const p=this.player;p.hidden=false;p.z=0;p.vz=0;
    NET.event({type:"death"});this.notify(t("n.died"),4)}
  update_spec(dt){const p=this.player,a=[];NET.players.forEach(r=>{if(r.seen&&r.m===0)a.push(r)});a.sort((x,y)=>x.id<y.id?-1:1);
    if(!a.length){this.spec=null;return}this.specI=mod(this.specI,a.length);const r=this.spec=a[this.specI];
    p.x=r.x;p.y=r.y;p.angle=r.angle;p.floor=r.floor;p.torch=r.torch;p.hidden=!!r.hidden;p.cam=[r.x,r.y];p.moving=r.sprinting;p.sprinting=false;p.z=r.z||0}
  snd3d(kind,x,y,f,range,gain){const p=this.player;if(f!==p.floor)return;const dx=x-p.x,dy=y-p.y,d=Math.max(.01,hyp(dx,dy));
    const v=Math.pow(Math.max(0,1-d/range),1.5)*gain*Math.pow(.35,this.level.walls_between(p.x,p.y,x,y,f));blip(kind,v,(-dx*Math.sin(p.angle)+dy*Math.cos(p.angle))/d)}
  mirror_mon(dt){const a=NET.mon;if(!a)return;const k=Math.min(1,dt*10);
    this.monsters.forEach((m,i)=>{const s=a[i];if(!s)return;const x=+s[0],y=+s[1],f=s[2]|0;
      if(f!==m.floor||hyp(x-m.x,y-m.y)>5){m.x=x;m.y=y}else{m.x+=(x-m.x)*k;m.y+=(y-m.y)*k}m.floor=f;m.state=s[3]|0;m.freeze=s[4]|0;m.stun=s[5]|0})}
  host_ai(dt){this.monsters.forEach(m=>m.update(dt,this));
    if(this.D.sniff){this.sniff_t-=dt;if(this.sniff_t<=0){this.sniff_t=rnd(this.D.sniff[0],this.D.sniff[1]);const ts=this.targets();
      if(ts.length){const t=pick(ts),m=pick(this.monsters);m.sniff=10;m.sniffId=t.id;m.repath=0;m.goal=null}}}
    this.push_t-=dt;if(this.push_t<=0){this.push_t=.1;NET.pushMon(this.monsters.map(m=>[Math.round(m.x*100)/100,Math.round(m.y*100)/100,m.floor,m.state,m.freeze>0?1:0,m.stun>0?1:0]))}}
  mp_update(dt){const p=this.player,k=Math.min(1,dt*12);
    NET.players.forEach(r=>{if(!r.seen)return;const ox=r.x,oy=r.y;r.x+=(r.tx-r.x)*k;r.y+=(r.ty-r.y)*k;r.z+=(r.tz-r.z)*k;r.angle+=angD(r.ta,r.angle)*k;r.imm=Math.max(0,(r.imm||0)-dt);
      const dd=hyp(r.x-ox,r.y-oy);
      if(r.m===0&&!r.hidden&&r.floor===p.floor&&dd<1){r.sd=(r.sd||0)+dd;if(r.sd>(r.sprinting?1.25:.85)){r.sd=0;this.snd3d("step",r.x,r.y,r.floor,r.sprinting?11:7,r.sprinting?.5:.3)}}});
    if(NET.host)this.host_ai(dt);else this.mirror_mon(dt);
    
    if(NET.inGame){const a=mod(p.angle+Math.PI,2*Math.PI)-Math.PI;
      NET.pushState({x:+p.x.toFixed(2),y:+p.y.toFixed(2),a:+a.toFixed(2),f:p.floor,h:p.hidden?1:0,t:p.torch?1:0,s:p.sprinting?1:0,z:+(p.z||0).toFixed(2),m:this.mpm,q:p.shadow>0?1:0,w:p.trapped>0?1:0})}}
  net_ev(ev){const L=this.level,r=ev.from?NET.players.get(ev.from):null,who=ev.n||t("n.player");
    switch(ev.type){
    case"open":{const fl=L.floors[ev.f],n=fl&&fl.stands[ev.s];if(!n||n.opened[ev.i])break;n.opened[ev.i]=true;const k=n.drawers[ev.i][0];
      this.take(k,who,false,n.drawers[ev.i][1]);
      this.snd3d("open",n.x,n.y,ev.f,14,.5);break}
    case"dash":if(r)this.snd3d("dash",r.x,r.y,r.floor,16,.7);break;
    case"step":if(r)this.snd3d("step",r.x,r.y,r.floor,10,.4);break;
    case"death":if(r)r.m=1;this.notify(t("n.ev.death",{who:who}),4);playBuf(SND.scream,.12);break;
    case"win":if(r)r.m=2;this.notify(t("n.ev.win",{who:who}),5);break;
    case"kill":if(ev.to===NET.id)this.kill({type:ev.k|0});break;
    case"cracker":this.fx.push({x:ev.x,y:ev.y,f:ev.f,t:3,mine:false});break;
    case"wire":this.wires.push({x:ev.x,y:ev.y,f:ev.f,id:ev.id});break;
    case"wirehit":this.wires=this.wires.filter(w=>w.id!==ev.id);this.snd3d("open",ev.x,ev.y,ev.f,24,1);break;
    case"flash":if(NET.host)this.flash_apply(ev.x,ev.y,ev.a,ev.f);if(ev.f===this.player.floor)this.flash_t=Math.max(this.flash_t,.25);break;
    case"noise":if(NET.host)this.noise_local(ev.x,ev.y,ev.f,ev.r,ev.one);break;
    case"door":this.door_set(ev.f,ev.x,ev.y,ev.v,false);this.snd3d("open",ev.x+.5,ev.y+.5,ev.f,16,.6);break;
    case"bash":this.snd3d("step",ev.x+.5,ev.y+.5,ev.f,22,1.4);break;
    case"panel":{const key=ev.f+":"+ev.x+":"+ev.y;if(!L.pon.has(key)){L.pon.add(key);this.notify(t("n.ev.panel",{who:who,n:L.pon.size}),4);this.snd3d("open",ev.x+.5,ev.y+.5,ev.f,20,.8)}break}
    case"haz":{const h=L.floors[ev.f].haz[ev.i];if(h){if(h.t==="b")h.sprung=true;else h.cd=8;this.snd3d("open",h.x,h.y,ev.f,22,1)}break}
    case"siren":this.start_siren(false);break;
    case"lift":this.start_lift(false);break;
    case"fuse":this.fix_light(false);break;
    case"free":if(ev.to===NET.id){this.player.trapped=0;this.notify(t("n.ev.freed",{who:who}),3)}break;
    case"raid":this.notify(t("n.raid",{f:ev.f+1}),5);break;
    case"short":this.strobe=this.D.dir.shortLen;this.notify(t("n.short"),3);break;
    case"say":if(r&&ev.i>=0&&ev.i<4){const p=this.player,dx=r.x-p.x,dy=r.y-p.y,rel=angD(Math.atan2(dy,dx),p.angle),same=r.floor===p.floor,
        ar=!same?"":Math.abs(rel)<.6?"↑":Math.abs(rel)>2.2?"↓":rel>0?"→":"←";
      this.notify(same?t("say.same",{who:who,ph:ph(ev.i),ar:ar,d:Math.round(hyp(dx,dy))}):t("say.other",{who:who,ph:ph(ev.i),f:r.floor+1}),4);blip("open",.4,cl(Math.sin(rel),-1,1))}break;
    case"bottle":this.fx.push({x:ev.x,y:ev.y,f:ev.f,t:.35,mine:false,kind:"bottle"});break;
    case"glow":this.glows.push({x:ev.x,y:ev.y,f:ev.f,t:150});break;
    case"wedge":L.wedge.add(ev.f+":"+ev.x+":"+ev.y);break;
    case"smoke":L.smokes.push({x:ev.x,y:ev.y,f:ev.f,t:10});break;
    case"hide":if(NET.host)this.monsters.forEach(m=>{if(m.floor===ev.f&&m.state===CHASE&&hyp(m.x-ev.x,m.y-ev.y)<6.5){m.alert([ev.x,ev.y]);m.lurk=m.D.ai.lurk-.9}});break;
    case"drop":if(ITEMS[ev.k]&&USE.includes(ev.k)&&!this.drops.some(d=>d.id===ev.id))this.drops.push({id:ev.id,x:+ev.x,y:+ev.y,f:ev.f|0,k:ev.k,c:ev.c|0});break;
    case"pick":this.drops=this.drops.filter(d=>d.id!==ev.id);break;
    default:this.hook("onEv",ev)}}   // прочие события — хук условия (хаос шлёт type:"chaos")
  // ---- предметы, события, сценарии
  avail(){return this.slots}
  cycle(){this.wheel(1)}
  wheel(d){if(this.slots.length)this.slot=mod(this.slot+d,this.slots.length)}
  selSlot(i){if(i<this.slots.length)this.slot=i}
  give(k,n){if(USE.includes(k)&&!this.inv[k]){if(this.slots.length>=this.SL&&this.CD.swap)this.drop_all();this.slots.push(k)}this.inv[k]=(this.inv[k]|0)+n}
  // ---- предметы на полу (CONDS[..].swap): занятый слот → старое летит на пол, его можно подобрать на E (в MP — события drop/pick)
  drop_all(){const p=this.player,nm=[];for(const k of this.slots){let x=p.x+Math.cos(p.angle)*.35,y=p.y+Math.sin(p.angle)*.35;if(this.level.solid(x,y,p.floor)){x=p.x;y=p.y}
      const d={id:(this.mp?NET.id:"s")+"_d"+(++this.did),x:+x.toFixed(2),y:+y.toFixed(2),f:p.floor,k,c:this.inv[k]|0};this.drops.push(d);
      if(this.mp)NET.event({type:"drop",id:d.id,x:d.x,y:d.y,f:d.f,k:d.k,c:d.c});nm.push(ITEMS[k].n);delete this.inv[k]}
    this.slots=[];this.slot=0;if(nm.length)this.dropped=nm.join(", ")}
  pick_drop(d){if(!this.drops.includes(d))return;this.drops=this.drops.filter(x=>x!==d);if(this.mp)NET.event({type:"pick",id:d.id});blip("pickup",.8,0);
    this.dropped=null;this.give(d.k,d.c);this.notify(t("take.item",{n:ITEMS[d.k].n,d:ITEMS[d.k].d})+(this.dropped?" "+t("n.pack.drop",{n:this.dropped}):""),5)}
  spend(k){const n=(this.inv[k]|0)-1;if(n>0)this.inv[k]=n;else{delete this.inv[k];const i=this.slots.indexOf(k);if(i>=0)this.slots.splice(i,1);this.slot=cl(this.slot,0,Math.max(0,this.slots.length-1))}}
  nearest_mon(){const p=this.player;let b=99;for(const m of this.monsters)if(m.floor===p.floor)b=Math.min(b,hyp(m.x-p.x,m.y-p.y));return b}
  mirror_target(){const p=this.player,L=this.level,want=L.sc===1?["gear","fuel"]:["key"];let best=null;
    for(let fl=0;fl<2;fl++)for(const n of L.floors[fl].stands)for(let j=0;j<2;j++){if(n.opened[j]||!want.includes(n.drawers[j][0]))continue;
      const same=fl===p.floor,tx=same?n.x:L.stairs.x,ty=same?n.y:L.stairs.y,d=hyp(tx-p.x,ty-p.y)+(same?0:1000);
      if(!best||d<best.rank)best={x:tx,y:ty,d:d%1000,k:n.drawers[j][0],other:!same,rank:d}}
    return best}
  use_sel(){const a=this.slots;if(a.length)this.use(a[mod(this.slot,a.length)])}
  toggle_torch(){const p=this.player;if(p.hidden||p.shadow>0)return;if(!p.torch&&p.charge<=0){this.notify(t("n.torch.dead"),2);return}
    if(!p.torch){const bk=this.hook("torchBlock");if(bk){this.notify(t(bk),2.5);return}}p.torch=!p.torch;this.hook("onAct","torch",p.x,p.y,p.floor)}
  use(k){const p=this.player,L=this.level,a=p.angle,f=p.floor;
    if(this.mode!=="play"||p.hidden||!((this.inv[k]|0)>0)||(p.trapped>0&&k!=="energy"))return;
    const land=m=>{let d=0;while(d<m&&!L.solid(p.x+Math.cos(a)*(d+.4),p.y+Math.sin(a)*(d+.4),f))d+=.3;return[p.x+Math.cos(a)*d,p.y+Math.sin(a)*d]},
      ev=(t,x,y)=>{if(this.mp)NET.event({type:t,x:+x.toFixed(2),y:+y.toFixed(2),f})};
    if(k==="cracker"){const[x,y]=land(6);this.fx.push({x,y,f,t:3,mine:true});ev("cracker",x,y);this.notify(t("use.cracker"),2)}
    else if(k==="adren"){p.adr=8;p.stamina=1;p.exhausted=false;this.notify(t("use.adren"),3)}
    else if(k==="stim"){p.stim=30;this.notify(t("use.stim"),3)}
    else if(k==="shadow"){p.shadow=15;p.torch=false;this.notify(t("use.shadow"),3)}
    else if(k==="flash"){this.flash_t=.45;if(this.mp)NET.event({type:"flash",x:+p.x.toFixed(2),y:+p.y.toFixed(2),a:+a.toFixed(2),f});if(!this.mp||NET.host)this.flash_apply(p.x,p.y,a,f);
      this.notify(t("use.flash",{n:this.inv.flash-1}),2)}
    else if(k==="wire"){const w={x:+p.x.toFixed(2),y:+p.y.toFixed(2),f,id:(this.mp?NET.id:"s")+"_"+(++this.wid)};this.wires.push(w);if(this.mp)NET.event({type:"wire",...w});this.notify(t("use.wire"),2)}
    // ---- новые предметы
    else if(k==="bottle"){const[x,y]=land(7);this.fx.push({x,y,f,t:.35,mine:true,kind:"bottle"});ev("bottle",x,y);this.notify(t("use.bottle"),1.5)}
    else if(k==="glow"){this.glows.push({x:p.x,y:p.y,f,t:150});ev("glow",p.x,p.y);this.notify(t("use.glow"),3)}
    else if(k==="battery"){if(p.charge>=.99){this.notify(t("use.battery.full"),2);return}p.charge=Math.min(1,p.charge+.5);this.notify(t("use.battery",{p:Math.round(p.charge*100)}),2.5)}
    else if(k==="energy"){if(p.trapped>0){p.trapped=0;this.notify(t("use.energy.trap"),2.5)}
      else if(p.stamina>=.99){this.notify(t("use.energy.full"),2);return}
      else{p.stamina=Math.min(1,p.stamina+.5);if(p.stamina>.3)p.exhausted=false;this.notify(t("use.energy"),2.5)}}
    else if(k==="pills"){this.sane=Math.min(1,this.sane+.45);p.pills=8;this.notify(t("use.pills"),3)}
    else if(k==="wedge"){const[dist,t,,,mx,my]=this.cast(p.x,p.y,Math.cos(a),Math.sin(a));
      if(t!==3||dist>1.8){this.notify(t("use.wedge.no"),2.5);return}
      const key=f+":"+mx+":"+my;if(L.wedge.has(key)){this.notify(t("use.wedge.already"),2);return}
      L.wedge.add(key);if(this.mp)NET.event({type:"wedge",f,x:mx,y:my});blip("door_close",.6,0);this.notify(t("use.wedge"),3.5)}
    else if(k==="smoke"){const[x,y]=land(5);L.smokes.push({x,y,f,t:10});ev("smoke",x,y);this.notify(t("use.smoke"),3)}
    else if(k==="lockpick"){this.notify(t("use.lockpick"),2.5);return}
    else if(k==="detector"){p.det=10;this.det_c=0;this.notify(t("use.detector"),3.5)}
    else if(k==="mirror"){if(!this.mirror_target()){this.notify(t("use.mirror.none"),3);return}
      p.mirror=4;this.sane=Math.max(0,this.sane-.25);this.notify(t("use.mirror"),3)}
    this.spend(k)}
  flash_apply(x,y,a,f){let hit=0;this.monsters.forEach(m=>{if(m.floor!==f)return;const dx=m.x-x,dy=m.y-y,d=hyp(dx,dy);
      if(d<9&&Math.abs(angD(Math.atan2(dy,dx),a))<.6&&this.level.los(x,y,m.x,m.y,f)){m.stun=4;m.lurk=0;hit++}});if(hit&&this.mode==="play")this.notify(t("n.flash.hit"),2.5)}
  noise(x,y,f,rad,one){if(this.mp&&!NET.host){NET.event({type:"noise",x:+x.toFixed(2),y:+y.toFixed(2),f,r:rad,one:one?1:0});return}this.noise_local(x,y,f,rad,one)}
  noise_local(x,y,f,rad,one){if(this.hook("noiseLocal",x,y,f,rad,one))return;let a=this.monsters.filter(m=>m.floor===f&&hyp(m.x-x,m.y-y)<=rad*this.D.ai.hear);if(one){a.sort((u,v)=>hyp(u.x-x,u.y-y)-hyp(v.x-x,v.y-y));a=a.slice(0,1)}a.forEach(m=>m.alert([x,y]))}
  rage_fx(m){this.snd3d("dash",m.x,m.y,m.floor,18,.9)}
  door_set(f,x,y,v,send){const g=this.level.floors[f].grid;if(g[y][x]!==3&&g[y][x]!==6&&g[y][x]!==7)return;g[y][x]=v;if(v!==3)this.level.wedge.delete(f+":"+x+":"+y);if(send&&this.mp)NET.event({type:"door",f,x,y,v})}
  door_toggle(x,y){const p=this.player,f=p.floor,v=this.level.floors[f].grid[y][x];
    if(v===3){this.door_set(f,x,y,6,true);blip("door_open",.7,0);this.hook("onAct","door",x+.5,y+.5,f)}
    else if(v===6){if(hyp(p.x-x-.5,p.y-y-.5)<.9||this.monsters.some(m=>m.floor===f&&hyp(m.x-x-.5,m.y-y-.5)<1)){this.notify(t("n.door.block"),2);return}this.door_set(f,x,y,3,true);blip("door_close",.9,0);this.hook("onAct","door",x+.5,y+.5,f)}}
  door_bash(m,nx){if(m.floor===this.player.floor&&hyp(m.x-this.player.x,m.y-this.player.y)<7)vib(70);this.snd3d("step",nx[0]+.5,nx[1]+.5,m.floor,22,1.4);if(this.mp)NET.event({type:"bash",x:nx[0],y:nx[1],f:m.floor})}
  door_break(f,nx){this.door_set(f,nx[0],nx[1],7,true);this.snd3d("boom",nx[0]+.5,nx[1]+.5,f,26,1.2)}
  panel_on(f,x,y){const L=this.level;L.pon.add(f+":"+x+":"+y);this.notify(t("n.panel.on",{n:L.pon.size}),4);blip("open",1,0);
    this.noise(x+.5,y+.5,f,999,true);if(this.mp)NET.event({type:"panel",f,x,y})}
  start_siren(mine){if(this.siren_on||this.gate_open)return;this.siren_on=true;this.siren=Math.round((this.level.sc===2?20:15)*this.D.sirenMul);this.sirenT=0;this.sirenMine=mine;
    this.notify(t("n.siren"),5);if(mine&&this.mp)NET.event({type:"siren"})}
  start_lift(mine){if(this.lift_on||this.lift_ready)return;this.lift_on=true;this.lift_t=15;this.lift_c=0;this.lift_mine=mine;this.notify(t("n.lift.start"),5);if(mine&&this.mp)NET.event({type:"lift"})}
  fix_light(mine){this.fstate="burst";this.ft=rnd(this.D.light.back[0],this.D.light.back[1]);this.light=.9;this.sched_bo();this.notify(t("n.fuse.fix"),4);if(mine&&this.mp)NET.event({type:"fuse"})}
  use_lift(){const L=this.level;
    if(this.fstate==="long"&&!this.CD.noFuse&&(this.inv.fuse|0)>0){this.inv.fuse--;this.fix_light(true);return}
    const lk=this.hook("exitLocked");if(lk){this.notify(t(lk),3);return}
    if(L.sc!==1){this.notify(t(this.fstate==="long"&&!this.CD.noFuse?"n.lift.fuse":"n.lift.off"),3);return}
    if(this.lift_ready){this.win();return}
    if(this.lift_on){this.notify(t("n.lift.run",{s:Math.ceil(this.lift_t)}),2);return}
    const g=this.parts.gear,fu=this.parts.fuel;if(g<2||fu<1){this.notify(t("n.lift.need",{g:g,f:fu}),4);return}
    this.start_lift(true)}
  say(i){if(!this.mp||this.mode!=="play"||this.say_t>0||!NET.inGame||i<0||i>3)return;this.say_t=2;NET.event({type:"say",i});this.notify(t("say.me",{ph:ph(i)}),2)}
  director(){if(R()<this.D.dir.raidP||this.CD.noShort)this.start_raid();
    else{this.strobe=this.D.dir.shortLen;this.notify(t("n.short"),3);if(this.mp)NET.event({type:"short"})}}
  start_raid(){const ts=this.targets(),cnt=[0,0];ts.forEach(t=>{if(t.floor>=0)cnt[t.floor]++});   // облава: монстры стягиваются на этаж, где больше игроков (хост/одиночка)
    const f=cnt[0]===cnt[1]?pick([0,1]):cnt[1]>cnt[0]?1:0;this.raid={f,t:20,k:0};this.notify(t("n.raid",{f:f+1}),5);if(this.mp)NET.event({type:"raid",f})}
  update_extra(dt){const p=this.player,L=this.level,f=p.floor,host=!this.mp||NET.host,alive=this.mode!=="spec";
    if(alive){p.adr=Math.max(0,p.adr-dt);p.stim=Math.max(0,p.stim-dt);p.shadow=Math.max(0,p.shadow-dt);p.trapped=Math.max(0,p.trapped-dt)}
    if(alive){p.pills=Math.max(0,p.pills-dt);p.det=Math.max(0,p.det-dt);p.mirror=Math.max(0,p.mirror-dt);
      if(p.torch){p.charge=Math.max(0,p.charge-dt/(this.CD.torchSec||TORCH_SEC));if(p.charge<=0){p.torch=false;this.notify(t("n.torch.out"),3)}}
      if(p.det>0){this.det_c-=dt;if(this.det_c<=0){this.det_c=1.6;blip("click",.5,0);this.noise(p.x,p.y,f,8)}}}   // писк слышат монстры в 8 клетках
    this.glows.forEach(g=>g.t-=dt);this.glows=this.glows.filter(g=>g.t>0);
    L.smokes.forEach(sm=>sm.t-=dt);L.smokes=L.smokes.filter(sm=>sm.t>0);
    this.flash_t=Math.max(0,this.flash_t-dt);this.strobe=Math.max(0,this.strobe-dt);this.say_t=Math.max(0,this.say_t-dt);
    if(this.strobe>0&&this.fstate!=="long")this.light=strobeL(this.t);
    for(const c of this.fx){c.t-=dt;if(c.t<=0){c.done=1;const b=c.kind==="bottle";
      this.snd3d(b?"step":"boom",c.x,c.y,c.f,b?12:28,b?.7:1.3);
      if(c.mine){if(b)this.noise(c.x,c.y,c.f,7,true);else this.noise(c.x,c.y,c.f,15)}}}   // бутылка: радиус 7, только ближайший монстр
    this.fx=this.fx.filter(c=>!c.done);
    if(host){for(const w of this.wires)for(const m of this.monsters)if(!w.done&&m.floor===w.f&&hyp(m.x-w.x,m.y-w.y)<.6){w.done=1;m.slow=5;this.snd3d("open",w.x,w.y,w.f,24,1);
        if(this.mp)NET.event({type:"wirehit",id:w.id,x:w.x,y:w.y,f:w.f})}this.wires=this.wires.filter(w=>!w.done)}
    if(alive&&this.mode==="play"&&p.z<.2&&!DBG.f(this,"god"))L.floors[f].haz.forEach((h,i)=>{if(h.cd>0)h.cd-=dt;if(h.cd>0||h.sprung)return;const d=hyp(p.x-h.x,p.y-h.y);
      if(h.t==="g"&&p.sprinting&&d<.8){h.cd=8;blip("glass",1,0);this.noise(h.x,h.y,f,18);this.notify(t("n.glass"),1.5);if(this.mp)NET.event({type:"haz",f,i})}
      else if(h.t==="b"&&d<.55){h.sprung=true;p.trapped=2.5;p.sprinting=false;blip("trap",1,0);this.noise(h.x,h.y,f,18);this.notify(t("n.trap"),3);if(this.mp)NET.event({type:"haz",f,i})}});
    const il=this.interact,held=keys.has("KeyE")||(TOUCH&&Object.values(this.touch.bf).includes("e"));
    if(this.mode==="play"&&il&&il.k==="panel"&&!L.pon.has(f+":"+il.o[0]+":"+il.o[1])&&held){this.hold+=dt;if(this.hold>=3){this.hold=0;this.panel_on(f,il.o[0],il.o[1])}}else this.hold=Math.max(0,this.hold-dt*2);
    if(L.pon.size){this.hum_t-=dt;if(this.hum_t<=0){this.hum_t=2.6;for(const k of L.pon){const[pf,x,y]=k.split(":").map(Number);this.snd3d("step",x+.5,y+.5,pf,11,.7)}}}
    if(this.siren_on){this.siren-=dt;this.sirenT-=dt;if(this.sirenT<=0){this.sirenT=3;this.snd3d("siren",L.gate_c[0],L.gate_c[1],0,40,.5);if(this.sirenMine)this.noise(L.gate_c[0],L.gate_c[1],0,45)}
      if(this.siren<=0){this.siren_on=false;this.siren=0;this.gate_open=true;this.notify(t("n.gate.open"),5)}}
    if(this.lift_on){this.lift_t-=dt;this.lift_c-=dt;if(this.lift_c<=0){this.lift_c=2.4;this.snd3d("lift",L.lift[0],L.lift[1],0,40,.9);if(this.lift_mine)this.noise(L.lift[0],L.lift[1],0,40)}
      if(this.lift_t<=0){this.lift_on=false;this.lift_ready=true;this.notify(t("n.lift.ready"),5)}}
    if(host){this.dir_t-=dt;if(this.dir_t<=0&&this.mode==="play"){this.dir_t=rnd(this.D.dir.gap[0],this.D.dir.gap[1]);this.director()}
      if(this.raid){const r=this.raid;r.t-=dt;r.k-=dt;if(r.k<=0){r.k=4;const ts=this.targets().filter(t=>t.floor===r.f);
        for(const m of this.monsters){if(m.floor!==r.f){if(m.state!==CHASE&&!m.cross)m.go_stairs(L)}else if(m.state!==CHASE&&ts.length){const t=pick(ts);m.alert([t.x+rnd(-3.5,3.5),t.y+rnd(-3.5,3.5)])}}}
        if(r.t<=0)this.raid=null}}
    if(alive)this.update_sane(dt)}
  update_sane(dt){const p=this.player,L=this.level,f=p.floor;this.sane_c-=dt;
    if(this.sane_c<=0){this.sane_c=.3;let lamp=L.in_safe(p.x,p.y,f);
      if(!lamp&&this.fstate!=="long")for(const[lx,ly]of L.floors[f].lamps)if(hyp(lx-p.x,ly-p.y)<4.5&&L.los(p.x,p.y,lx,ly,f)){lamp=true;break}
      if(!lamp)for(const g of this.glows)if(g.f===f&&hyp(g.x-p.x,g.y-p.y)<4&&L.los(p.x,p.y,g.x,g.y,f)){lamp=true;break}
      this.lit=lamp;this.fear=this.monsters.some(m=>m.floor===f&&!(m.stun>0)&&hyp(m.x-p.x,m.y-p.y)<7)}
    let d=this.lit?.05:p.torch?-.004:-.012;if(this.fear)d-=.025;this.sane=cl(this.sane+d*dt,0,1);
    if(this.sane<.5){this.step_t-=dt;if(this.step_t<=0){this.step_t=rnd(5,11)*(this.sane+.4);blip("step",.6,Math.random()<.5?-.8:.8)}}
    if(this.sane<.3&&!this.ghost){this.ghost_t-=dt;if(this.ghost_t<=0){this.ghost_t=rnd(10,18);this.spawn_ghost()}}
    if(this.ghost){const g=this.ghost;g.t-=dt;const d2=hyp(g.x-p.x,g.y-p.y);
      if(g.t<=0||g.f!==f||d2<3.5||(p.torch&&d2<12&&Math.abs(angD(Math.atan2(g.y-p.y,g.x-p.x),p.angle))<.35))this.ghost=null}}
  spawn_ghost(){const p=this.player,L=this.level;for(let k=0;k<8;k++){const a=p.angle+rnd(-.5,.5),d=rnd(5.5,8),x=p.x+Math.cos(a)*d,y=p.y+Math.sin(a)*d;
      if(!L.solid(x,y,p.floor)&&L.los(p.x,p.y,x,y,p.floor)){this.ghost={x,y,f:p.floor,t:2.2,type:0};return}}}
  wob(){const p=this.player;return(this.sane<.5?Math.sin(this.t*1.9)*.035*(1-this.sane*2):0)+(p.stim>0?Math.sin(this.t*23)*.008:0)+(p.pills>0?Math.sin(this.t*3.1)*.03*Math.min(1,p.pills/2):0)}
  // ---- рендер мира
  render_world(){const p=this.player,L=this.level,[cx,cy]=p.cam,ang=p.angle+this.wob(),bob=p.moving&&!p.hidden?Math.trunc(Math.sin(p.bob_t)*2):0,hor=(RH>>1)+bob,bg=BGS[p.torch?1:0];
    const R=p.torch?11:7,fd=p.floor?.8:1,dx_=Math.cos(ang),dy_=Math.sin(ang),plx=-dy_*K,ply=dx_*K;zb.fill(99);const pz=p.z||0;this.labels=[];
    // ПРЫЖОК: камера на высоте .5+pz над полом (и .5-pz под потолком) — фон и пол считаем с той же высотой, что и стены/спрайты
    {const hb=(RH+8)>>1,kf=1+2*pz,kc=Math.max(.15,1-2*pz);
      for(let y=0;y<RH;y++){const dy=y-hor,bi=hb+(dy>0?Math.round(dy/kf):dy<0?Math.round(dy/kc):0),v=bg[cl(bi,0,RH+7)];ROWBG[y]=v;buf.fill(v,y*RW,(y+1)*RW)}}
    const cc=!SET.mono&&HASCOL;CCON=cc;if(cc){chR.fill(1);chG.fill(1);chB.fill(1)}
    const surf=(T,C,y0,y1,zh,sg)=>{for(let y=y0;y<y1;y++){const dy=(y-hor)*sg,bv=ROWBG[y];if(!(bv>=1))continue;const d=PROJ*zh/dy,   // пол (sg=1) и потолок (sg=-1) — одна и та же проекция
      rx0=cx+(dx_-plx)*d,ry0=cy+(dy_-ply)*d,sx=2*plx*d/RW,sy=2*ply*d/RW;
      for(let c=0;c<RW;c++){const fx=rx0+sx*c,fy=ry0+sy*c,ti=(((fy*.5*TS)|0)&(TS-1))*TS+(((fx*.5*TS)|0)&(TS-1)),j=y*RW+c;buf[j]=bv*T[ti];
        if(C){chR[j]=C.r[ti]*CS;chG[j]=C.g[ti]*CS;chB[j]=C.b[ti]*CS}}}};
    const tex=(c,top,h,tu,key,gg,k)=>{const T=TEX[key],C=cc?TEXC[key]:null,a=Math.max(0,top),b=Math.min(RH,top+h);   // вертикальная колонка стены из текстуры
      for(let y=a;y<b;y++){const ti=((((y-top)*TS/h)|0)&(TS-1))*TS+tu,j=y*RW+c;buf[j]=Math.min(255,gg*k*T[ti]);if(C){chR[j]=C.r[ti]*CS;chG[j]=C.g[ti]*CS;chB[j]=C.b[ti]*CS}else if(cc){chR[j]=chG[j]=chB[j]=1}}};
    if(TEX.ceil&&SET.ceil)surf(TEX.ceil,cc?TEXC.ceil:null,0,hor-1,.5-pz,-1);
    if(TEX.floor)surf(TEX.floor,cc?TEXC.floor:null,hor+1,RH,.5+pz,1);
    const vl=(c,top,h,v)=>{const a=Math.max(0,top),b=Math.min(RH,top+h);for(let y=a;y<b;y++){const j=y*RW+c;buf[j]=v;if(cc)chR[j]=chG[j]=chB[j]=1}};
    for(let c=0;c<RW;c++){const cm=2*c/RW-1,[perp,t,wx,side,mx,my]=this.cast(cx,cy,dx_+plx*cm,dy_+ply*cm);zb[c]=perp;const f=1-perp/R;if(f<=0)continue;
      const g=255*Math.pow(f,1.25)*(side?.78:1)*fd,h=Math.floor(PROJ/Math.max(perp,.05)),top=hor-(h>>1)+(pz?Math.floor(pz*PROJ/Math.max(perp,.05)):0),gg=g*VAR[(mx*31+my*17+Math.floor(wx*12))&255];
      const eg=t===1&&EGG.on&&L.easter&&L.easter.f===p.floor&&mx===L.easter.mx&&my===L.easter.my;   // эта колонка — стена с пасхалкой?
      const tk=t===1?"wall":TK[t];   // 1 стена, 2 шкаф, 3 дверь, 4 ворота, 5 лифт: есть текстура — берём её, нет — процедурная отрисовка ниже
      if(tk&&TEX[tk]){tex(c,top,h,((wx*TS)|0)&(TS-1),tk,gg,t===1?1:2);
        if(t===3&&L.wedge.has(p.floor+":"+mx+":"+my))vl(c,top+Math.floor(h*.62),Math.max(1,Math.floor(h*.07)),Math.min(255,gg*1.4))}
      else if(t===1){vl(c,top,h,Math.min(255,gg));const bh=Math.max(1,Math.floor(h/11)),c2=gg*.42;vl(c,top+h-bh,bh,c2);vl(c,top,Math.max(1,Math.floor(h/28)),c2)}
      else if(t===2){let v=Math.min(255,gg*1.18*(Math.floor(wx*36)&1?.86:1));if(wx>.485&&wx<.515)v=gg*.1;else if(wx<.05||wx>.95)v=gg*.5;vl(c,top,h,v);const c2=gg*.3;
        vl(c,top,Math.max(1,Math.floor(h/14)),c2);const b=Math.max(1,Math.floor(h/10));vl(c,top+h-b,b,c2);
        if((wx>.4&&wx<.44)||(wx>.56&&wx<.6))vl(c,top+Math.floor(h*.46),Math.max(1,Math.floor(h*.12)),Math.min(255,gg*1.7))}
      else if(t===4){vl(c,top,h,(wx*8)%1<.22?Math.min(255,gg):gg*.07);const cr=Math.min(255,gg*.9),b=Math.max(1,Math.floor(h/16));vl(c,top+Math.floor(h*.12),b,cr);vl(c,top+Math.floor(h*.8),b,cr)}
      else if(t===5){let v=Math.min(255,gg*1.1);if(wx>.49&&wx<.51)v=gg*.15;vl(c,top,h,v);if(wx>.45&&wx<.55)vl(c,top+Math.floor(h*.04),Math.max(1,Math.floor(h/22)),255)}
      else if(t===3){let v=Math.min(255,gg*.8*((Math.floor(wx*7)&1)?.82:1));if(wx<.06||wx>.94)v=gg*.35;vl(c,top,h,v);const bb=Math.max(1,Math.floor(h/12));
        vl(c,top+Math.floor(h*.3),bb,gg*.25);vl(c,top+Math.floor(h*.7),bb,gg*.25);if(wx>.78&&wx<.86)vl(c,top+Math.floor(h*.48),Math.max(1,Math.floor(h*.08)),Math.min(255,gg*1.6));
        if(L.wedge.has(p.floor+":"+mx+":"+my))vl(c,top+Math.floor(h*.62),Math.max(1,Math.floor(h*.07)),Math.min(255,gg*1.4))}
      else if(t===8){const on=L.pon.has(p.floor+":"+mx+":"+my);vl(c,top,h,Math.min(255,gg*.9));
        if(wx>.18&&wx<.82){vl(c,top+Math.floor(h*.22),Math.floor(h*.5),gg*.35);if(wx>.46&&wx<.54)vl(c,top+Math.floor(h*(on?.26:.4)),Math.floor(h*.16),Math.min(255,gg*1.7));
          if(on&&Math.floor(this.t*6+wx*5)%3===0)vl(c,top+Math.floor(h*.3),Math.max(1,Math.floor(h*.06)),255)}}
      if(eg){const rdx=dx_+plx*cm,rdy=dy_+ply*cm,ncx=side===0?mx-(rdx<0?-1:1):mx,ncy=side===1?my-(rdy<0?-1:1):my;   // рисуем только с грани, обращённой в тупик
        if(ncx===L.easter.cx&&ncy===L.easter.cy)eggCol(c,top,h,wx,(side===0&&rdx<0)||(side===1&&rdy>0),gg)}}
    const eyes=[],light=this.light;
    for(const[lx,ly]of L.floors[p.floor].lamps){const sx=lx-cx,sy=ly-cy,d=sx*dx_+sy*dy_;if(d<.3||d>14)continue;const lat=-sx*dy_+sy*dx_,scx=RW/2*(1+lat/(d*K)),
      wl=Math.max(2,Math.floor(PROJ*.55/d)),hl=Math.max(1,Math.floor(PROJ*.14/d)),ys=hor-Math.floor(PROJ*(.5-pz)/d),v=Math.min(255,255*light*Math.min(1,1.4-d/12));if(v<=4)continue;
      const x0=Math.floor(scx-wl/2);for(let c=Math.max(0,x0);c<Math.min(RW,x0+wl);c++)if(d<zb[c])vl(c,ys,hl,v)}
    const items=L.floors[p.floor].stands.map(n=>[(n.x-cx)*dx_+(n.y-cy)*dy_,"stand",n]);const st=L.stairs;items.push([(st.x-cx)*dx_+(st.y-cy)*dy_,"stairs",st]);
    for(const m of this.monsters)if(m.floor===p.floor)items.push([(m.x-cx)*dx_+(m.y-cy)*dy_,"mon",m]);
    {const FL=L.floors[p.floor];
      for(const[x,y]of L.doors[p.floor])if(FL.grid[y][x]===6)items.push([(x+.5-cx)*dx_+(y+.5-cy)*dy_,"door",{x:x+.5,y:y+.5}]);
      for(const h of FL.haz)items.push([(h.x-cx)*dx_+(h.y-cy)*dy_,h.t==="b"?"trap":"glass",h]);
      for(const w of this.wires)if(w.f===p.floor)items.push([(w.x-cx)*dx_+(w.y-cy)*dy_,"wire",w]);for(const d of this.drops)if(d.f===p.floor)items.push([(d.x-cx)*dx_+(d.y-cy)*dy_,"drop",d]);for(const mk of this.marks)if(mk.f===p.floor)items.push([(mk.x-cx)*dx_+(mk.y-cy)*dy_,"mark",mk]);
      const gh=this.ghost;if(gh&&gh.f===p.floor)items.push([(gh.x-cx)*dx_+(gh.y-cy)*dy_,"ghost",gh])}
    if(this.mp)NET.players.forEach(r=>{if(r.seen&&r.m===0&&!r.hidden&&r.floor===p.floor&&r!==this.spec)items.push([(r.x-cx)*dx_+(r.y-cy)*dy_,"ply",r])});items.sort((a,b)=>b[0]-a[0]);
    const mks=[];   // метки рисуем отдельным проходом после затемнения — поверх стен и тьмы
    for(const[d,k,o]of items){if(d<.2||(d>16&&k!=="mark")||(k==="trap"&&d>3.4))continue;if(k==="mark"&&p.hidden)continue;const lat=-(o.x-cx)*dy_+(o.y-cy)*dx_,scx=RW/2*(1+lat/(d*K));
      const[wu,hu,sp]=DECAL[k]||(k==="stand"?[.5,.36,SPR_STAND]:k==="stairs"?[.62,.92,SPR_STAIRS[p.floor]]:k==="ply"?[SPR_PLY.wu,SPR_PLY.hu,SPR_PLY]:[SPR_MONS[o.type].wu,SPR_MONS[o.type].hu,SPR_MONS[o.type]]);
      let sw=Math.floor(PROJ*wu/d),sh=Math.floor(PROJ*hu/d);if(k==="mark"){sw=Math.max(sw,6);sh=Math.max(sh,12)}   // вдали метка не исчезает
      if(sw<1||sh<1||sh>900)continue;
      const bot=hor+Math.floor(PROJ*(.5+pz-(k==="ply"?o.z:0))/d),top=bot-sh,x0=Math.floor(scx-sw/2),c0=Math.max(0,x0),c1=Math.min(RW,x0+sw);if(c0>=c1)continue;
      if((k==="mon"||k==="ghost")&&sp.ey&&!(o.freeze>0)&&!(o.stun>0)&&scx>=0&&scx<RW&&d<zb[Math.floor(scx)])eyes.push([scx,top+sh*sp.ey,sw,sh,d]);
      let br=k==="mon"||k==="ghost"?1:Math.floor(255*Math.pow(Math.max(0,1-d/R),1.25)*.9)/255;if(k==="trap")br*=.5;if(k==="mark"){if(scx>=0&&scx<RW)this.labels.push([scx*W/RW,Math.max(22,top*H/RH-12),"#"+o.n,Math.min(d,6)]);mks.push([sp,x0,c0,c1,top,sw,sh]);continue}
      if(k==="ply"){if(o.torch)br=Math.max(br,.75*Math.max(0,1-d/12));br=Math.min(1,br+.1);if(scx>=0&&scx<RW&&d<zb[Math.floor(scx)]&&d<13)this.labels.push([scx*W/RW,top*H/RH-14,o.n,d])}
      for(let c=c0;c<c1;c++){if(d>=zb[c])continue;const u=Math.floor((c-x0)*sp.w/sw);
        for(let y=Math.max(0,top);y<Math.min(RH,top+sh);y++){const i=Math.floor((y-top)*sp.h/sh)*sp.w+u,a=sp.al[i];if(!a)continue;const v=sp.gy[i]*br,j=y*RW+c;buf[j]=a===255?v:buf[j]*(1-a/255)+v*a/255;if(cc)pcol(j,a,sp,i)}}}
    if(p.hidden){buf.fill(0,0,Math.floor(RH*.3)*RW);buf.fill(0,Math.floor(RH*.7)*RW);for(let x=0;x<RW;x+=7)for(let y=0;y<RH;y++){buf[y*RW+x]=0;if(x+1<RW)buf[y*RW+x+1]=0}}
    let dm=1-Math.floor(Math.max(0,1-light)*225)/255*(1-light>.02?1:0);if(this.fstate==="long")dm=p.torch?.5:.14;
    if(!this.hook("shade",{buf,zb,hor,cx,cy,dx_,dy_,plx,ply,pz}))for(let i=0;i<buf.length;i++)buf[i]*=dm*VIG[i];
    for(const[sp,x0,c0,c1,top,sw,sh]of mks)for(let c=c0;c<c1;c++){const u=Math.floor((c-x0)*sp.w/sw);   // метки: без проверки zb и без затемнения
      for(let y=Math.max(0,top);y<Math.min(RH,top+sh);y++){const i=Math.floor((y-top)*sp.h/sh)*sp.w+u,a=sp.al[i];if(!a)continue;const v=sp.gy[i]*.95,j=y*RW+c;buf[j]=a===255?v:buf[j]*(1-a/255)+v*a/255;if(cc)pcol(j,a,sp,i)}}
    for(const[scx,ey,sw,sh,d]of eyes){const rr=Math.max(1,Math.floor(sh*.011)),v=Math.max(150,255-d*7|0);
      for(const s of[-1,1]){const ex=Math.floor(scx+s*sw*.1),ee=Math.floor(ey);for(let yy=-rr;yy<=rr;yy++)for(let xx=-rr;xx<=rr;xx++)
        if(xx*xx+yy*yy<=rr*rr&&ex+xx>=0&&ex+xx<RW&&ee+yy>=0&&ee+yy<RH){const j=(ee+yy)*RW+ex+xx;buf[j]=v;if(cc)chR[j]=chG[j]=chB[j]=1}}}
    // дым
    for(const s of L.smokes){if(s.f!==p.floor)continue;const sx=s.x-cx,sy=s.y-cy,dd=hyp(sx,sy),fade=Math.max(0,Math.min(1,s.t/1.5,(10-s.t)/.8+.15)),sm=50*Math.max(.3,dm);
      if(dd<1.7){const a=(.6*(1-dd/1.7)+.15)*fade;for(let i=0;i<buf.length;i++){buf[i]=buf[i]*(1-a)+sm*a;if(cc){chR[i]+=(1-chR[i])*a;chG[i]+=(1-chG[i])*a;chB[i]+=(1-chB[i])*a}}continue}   // камера внутри облака
      const d=sx*dx_+sy*dy_;if(d<.3)continue;const lat=-sx*dy_+sy*dx_,scx=RW/2*(1+lat/(d*K)),rx=PROJ*1.7/d,ry=PROJ*.75/d,cyy=hor+Math.floor(PROJ*pz/d);
      const x0=Math.max(0,Math.floor(scx-rx)),x1=Math.min(RW-1,Math.ceil(scx+rx)),y0=Math.max(0,Math.floor(cyy-ry)),y1=Math.min(RH-1,Math.ceil(cyy+ry));
      for(let c=x0;c<=x1;c++){if(d-1.5>zb[c])continue;for(let y=y0;y<=y1;y++){const q=hyp((c-scx)/rx,(y-cyy)/ry);if(q>=1)continue;const a=.8*fade*Math.min(1,(1-q)*1.8),j=y*RW+c;buf[j]=buf[j]*(1-a)+sm*a;if(cc){chR[j]+=(1-chR[j])*a;chG[j]+=(1-chG[j])*a;chB[j]+=(1-chB[j])*a}}}}
    // светящиеся палочки: видны сквозь тьму, но не сквозь стены
    for(const g of this.glows){if(g.f!==p.floor)continue;const sx=g.x-cx,sy=g.y-cy,d=sx*dx_+sy*dy_;if(d<.25||d>40)continue;
      const lat=-sx*dy_+sy*dx_,scx=RW/2*(1+lat/(d*K)),sy0=hor+Math.floor(PROJ*(.5+pz-.04)/d),fl=.85+.15*Math.sin(this.t*9+g.x*7),
        rad=cl(PROJ*1.5/d,3,RH*.55)*fl,core=Math.max(1,Math.floor(PROJ*.05/d)),fa=Math.min(1,g.t/3);
      const x0=Math.max(0,Math.floor(scx-rad)),x1=Math.min(RW-1,Math.ceil(scx+rad)),y0=Math.max(0,Math.floor(sy0-rad)),y1=Math.min(RH-1,Math.ceil(sy0+rad));
      for(let c=x0;c<=x1;c++){if(d-.4>zb[c])continue;for(let y=y0;y<=y1;y++){const q=hyp(c-scx,(y-sy0)*1.2)/rad;if(q>=1)continue;
        buf[y*RW+c]+=((1-q)*(1-q)*150+(q*rad<=core?150:0))*fa}}}
    const gi=ri(0,7),g1=GRAIN[gi],m0=this.monsters[0],near=m0.floor===p.floor?hyp(m0.x-p.x,m0.y-p.y):99;for(let i=0;i<buf.length;i++)buf[i]+=g1[i]*SET.grain;
    if(near<7||this.sane<.4){const g2=GRAIN[(gi+3)%8];for(let i=0;i<buf.length;i++)buf[i]+=g2[i]*SET.grain}
    if(cc){for(let i=0;i<buf.length;i++){const v=LUT[buf[i]],r=v*chR[i],g=v*chG[i],b=v*chB[i];u32[i]=0xFF000000|((b>255?255:b)<<16)|((g>255?255:g)<<8)|(r>255?255:r)}}
    else for(let i=0;i<buf.length;i++){const v=LUT[buf[i]];u32[i]=0xFF000000|(v<<16)|(v<<8)|v}
    wctx.putImageData(wimg,0,0)}
  // ---- интерфейс
  btns(){let s,y0;if(this.mode==="pause"){s=[[t("btn.resume"),"resume"],[t("btn.menu"),"menu"]];y0=H/2+120}else if(this.mode==="over"){s=[[t("btn.restart"),"restart"],[t("btn.menu"),"menu"]];y0=H/2+150}
    else{s=[[t("btn.menu"),"menu"]];y0=H/2+200}return s.map(([l,a],i)=>[l,a,rc(W/2,y0+i*80,380,64)])}
  btn(l,r){box(r,"#161616","#d2d2d2",2);T(l,F(32,1),r.x+r.w/2,r.y+r.h/2,0,1)}
  panel(){return rect(W/2-230,H/2-260,460,520)}
  dr(){const px=W/2-230,py=H/2-260;return[rect(px+30,py+90,400,180),rect(px+30,py+290,400,180)]}
  closeR(){const p=this.panel();return rect(p.x+p.w-56,p.y+14,44,40)}
  padKeys(){const pn=rc(W/2,H/2,520,610),x0=pn.x+pn.w/2-Math.floor((3*130+28)/2),y0=pn.y+225,ks=[];
    [..."123456789<0X"].forEach((l,i)=>ks.push([l,rect(x0+(i%3)*144,y0+Math.floor(i/3)*80,130,66)]));return[pn,ks]}
  slotRect(i){const SW=56,x0=Math.floor((W-(this.SL*SW+(this.SL-1)*8))/2);return rect(x0+i*(SW+8),H-84,SW,SW)}
  hudItems(){const p=this.player,av=this.slots,sel=av.length?mod(this.slot,av.length):-1;
    for(let i=0;i<this.SL;i++){const r=this.slotRect(i),k=av[i],on=i===sel;
      box(r,on?"#2c2c2c":"#121212",on?"#ffffff":"#5a5a5a",on?3:2);T(""+(i+1),F(14),r.x+5,r.y+3,on?"#fff":"#777");
      if(k){icon(k,r.x+r.w/2,r.y+r.h/2-2,r.w*.58);const n=this.inv[k]|0;if(n>1)T("x"+n,F(14),r.x+r.w-24,r.y+r.h-16,"#ddd")}}
    if(sel>=0){const k=av[sel];T(ITEMS[k].n+" — "+ITEMS[k].d,F(15),W/2,H-96,"#e6e6e6",1);
      if(!TOUCH)T(t("hud.itemkeys"),F(13),W/2,H-20,"#777",1)}
    if(p.det>0){const d=this.nearest_mon();T(t("hud.detector",{d:d<99?d.toFixed(1)+" "+t("lang.m"):"—",s:Math.ceil(p.det)}),F(26,1),W/2,130,d<6?"#ff6a5a":"#e6e6e6",1)}
    if(p.mirror>0){const t=this.mirror_target();if(t){const rel=angD(Math.atan2(t.y-p.y,t.x-p.x),p.angle),al=Math.min(1,p.mirror);
      ctx.save();ctx.translate(W/2,H/2-120);ctx.rotate(rel);ctx.globalAlpha=al;ctx.fillStyle="#f0f0f0";ctx.strokeStyle="#000";ctx.lineWidth=4;
      ctx.beginPath();ctx.moveTo(0,-46);ctx.lineTo(30,26);ctx.lineTo(0,10);ctx.lineTo(-30,26);ctx.closePath();ctx.stroke();ctx.fill();ctx.restore();
      T(window.t(t.other?"mir.other":"mir.near",{n:window.t(t.k==="key"?"item.key":t.k==="gear"?"part.gear.n":"part.fuel.n"),d:Math.round(t.d)}),F(20),W/2,H/2-60,"#e6e6e6",1,al)}}}
  hud(){const p=this.player,L=this.level;for(let i=0;i<this.maxl;i++)heart(40+i*42,38,30,i<this.lives?"#ebebeb":"#373737");T(t("hud.floor",{n:p.floor+1}),F(22),30,66,"#c8c8c8");
    ctx.fillStyle="#1e1e1e";ctx.fillRect(30,H-36,180,8);ctx.fillStyle=p.exhausted?"#787878":"#dcdcdc";ctx.fillRect(30,H-36,180*p.stamina,8);
    const it=[];
    if(this.noObj){}   // выживание: целей побега нет
    else if(L.sc===1){it.push(t("hud.gears",{n:this.parts.gear}));it.push(t("hud.fuel",{n:this.parts.fuel}))}
    else{it.push(t("hud.keys",{n:this.keys,max:KEYS}));
      if(L.sc===0){if(this.has_code)it.push(t("hud.code",{c:L.code}));it.push(t("hud.panels",{n:L.pon.size}))}
      else it.push(t("hud.code",{c:[0,1,2,3].map(i=>(i%2?this.cb:this.ca)?L.code[i]:"_").join("")}))}
    if(this.siren_on)it.push(t("hud.gate.t",{s:Math.ceil(this.siren)}));else if(this.gate_open)it.push(t("hud.gate.open"));else if(this.lift_on)it.push(t("hud.lift.t",{s:Math.ceil(this.lift_t)}));else if(this.lift_ready)it.push(t("hud.lift.ready"));
    it.forEach((s,i)=>{ctx.font=F(22);const w=ctx.measureText(s).width,r=rect(W-30-w-7,24+i*30-3,w+14,32);box(r,"#000","#c8c8c8",1);T(s,F(22),W-30-w,24+i*30,"#f0f0f0")});
    if(p.torch)T(t("hud.torch"),F(22),30,H-66,"#c8c8c8");if(this.D.marks&&!TOUCH&&this.mode!=="spec")T(t("hud.mark",{n:this.marks.length,max:MAXM}),F(18),30,H-124,"#9a9a9a");
    {const av=this.avail();let iy=96;
      if((this.inv.fuse|0)>0){T(t("hud.fuse",{n:this.inv.fuse}),F(18),30,iy,"#c8c8c8");iy+=22}
      if(this.mode!=="spec")this.hudItems();
      
      ctx.fillStyle="#1e1e1e";ctx.fillRect(30,H-24,180,5);ctx.fillStyle=this.sane<.3?"#888":"#bbb";ctx.fillRect(30,H-24,180*this.sane,5);
      ctx.fillStyle="#1e1e1e";ctx.fillRect(30,H-14,180,4);ctx.fillStyle=p.charge<.2?"#888":"#dcdcdc";ctx.fillRect(30,H-14,180*p.charge,4);T(Math.round(p.charge*100)+"%",F(12),216,H-20,"#9a9a9a");
      const ef=[];if(p.adr>0)ef.push(t("hud.adr",{s:Math.ceil(p.adr)}));if(p.stim>0)ef.push(t("hud.stim",{s:Math.ceil(p.stim)}));if(p.shadow>0)ef.push(t("hud.shadow",{s:Math.ceil(p.shadow)}));
      ef.forEach((s,i)=>T(s,F(18),W-150,H-40-i*22,"#c8c8c8",1));
      if(this.hold>0){ctx.fillStyle="#1e1e1e";ctx.fillRect(W/2-100,H-160,200,8);ctx.fillStyle="#f0f0f0";ctx.fillRect(W/2-100,H-160,200*this.hold/3,8)}}
    if(this.mode==="play"&&this.interact){let tip=t("tip."+({stairs:p.floor?"stairs.down":"stairs.up",panel:(this.inv.lockpick|0)>0?"panel.pick":"panel.hold"}[this.interact.k]||this.interact.k));
      if(this.interact.k==="door"){const[dx,dy]=this.interact.o;tip=t(L.floors[p.floor].grid[dy][dx]===6?"tip.door.close":"tip.door.open")}
      if(this.interact.k==="drop")tip=t("tip.drop",{n:ITEMS[this.interact.o.k].n});
      if(this.interact.k==="panel"&&L.pon.has(p.floor+":"+this.interact.o[0]+":"+this.interact.o[1]))tip=t("tip.panel.on");
      T(tip,F(32,1),W/2,H-135,0,1)}
    if(this.msg_t>0)T(this.msg,F(22),W/2,90,"#ebebeb",1,Math.min(1,this.msg_t));
    if(this.mode==="spec"&&this.spec)T(t("hud.spec",{n:this.spec.n}),F(22),W/2,H-40,"#a0a0a0",1);
    if(DBG.air(this)&&this.mode!=="spec"){ctx.fillStyle="#1e1e1e";ctx.fillRect(30,H-52,180,6);ctx.fillStyle=p.dash_cd>0?"#787878":"#f0f0f0";ctx.fillRect(30,H-52,180*(1-p.dash_cd/2),6);T(t("hud.dash.hint"),F(16),30,H-92,"#c8c8c8")}
    if(p.hidden&&this.mode!=="spec")T(t("hud.hide"),F(22),W/2,H-165,"#a0a0a0",1);
    if(this.mode==="play"&&!TOUCH&&!locked)T(t("hud.click"),F(22),W/2,H-195,"#a0a0a0",1)}
  draw(){const m=this.mode;
    if(m==="jumpscare"){this.draw_js();return}
    if(m==="spec"&&!this.spec){ctx.fillStyle="#000";ctx.fillRect(0,0,W,H);T(t("spec.none"),F(72,1),W/2,H/2-100,"#fff",1);this.btns().forEach(([l,,r])=>this.btn(l,r));return}
    if(m==="over"||m==="win"){ctx.fillStyle="#000";ctx.fillRect(0,0,W,H);
      if(m==="over"){T(t("over.title"),F(120,1),W/2,H/2-100,"#fff",1);if(!TOUCH){T(t("over.restart"),F(32,1),W/2,H/2+40,"#bebebe",1);T(t("over.menu"),F(32,1),W/2,H/2+88,"#bebebe",1)}}
      else{const mi=Math.floor(this.play_time/60),s=Math.floor(this.play_time%60);T(t(this.CD.winKey||"win.title"),F(120,1),W/2,H/2-100,"#f0f0f0",1);
        T(t("win.time",{t:String(mi).padStart(2,"0")+":"+String(s).padStart(2,"0")}),F(32,1),W/2,H/2+40,"#bebebe",1);T(t("win.lives",{n:this.lives}),F(32,1),W/2,H/2+88,"#bebebe",1);
        if(!TOUCH)T(t("win.menu"),F(32,1),W/2,H/2+136,"#bebebe",1)}
      this.btns().forEach(([l,,r])=>this.btn(l,r));return}
    this.render_world();ctx.imageSmoothingEnabled=false;ctx.drawImage(world,0,0,W,H);ctx.imageSmoothingEnabled=true;this.draw_labels();this.draw_prox();
    if(this.flash_t>0){ctx.fillStyle=`rgba(255,255,255,${Math.min(1,this.flash_t*3)})`;ctx.fillRect(0,0,W,H)}
    if(this.siren_on||this.lift_on){ctx.fillStyle=`rgba(200,0,0,${.1+.12*Math.max(0,Math.sin(this.t*7))})`;ctx.fillRect(0,0,W,H)}
    if(this.fade>0){ctx.fillStyle=`rgba(0,0,0,${Math.min(1,this.fade)})`;ctx.fillRect(0,0,W,H)}
    this.hud();this.hook("onDraw");DBG.draw(this);if(TOUCH&&m==="play")this.touch.draw(!!this.interact);
    if(m==="drawers")this.draw_drawers();else if(m==="keypad")this.draw_keypad();
    else if(m==="pause"){ctx.fillStyle="rgba(0,0,0,.78)";ctx.fillRect(0,0,W,H);T(t("pause.title"),F(120,1),W/2,H/2-70,0,1);
      if(!TOUCH)T(t("pause.hint"),F(32,1),W/2,H/2+50,"#bebebe",1);this.btns().forEach(([l,,r])=>this.btn(l,r))}}
  draw_labels(){for(const[x,y,n,d]of this.labels||[])T(n,F(22),x,y,"#e6e6e6",1,cl(1.2-d/13,.25,1))}
  draw_prox(){for(const m of this.monsters){if(m.type===0||m.prox<.02)continue;const nz=m.type===1?noiseR:noiseB,col=m.type===1?"200,0,0":"215,190,140";
    ctx.save();ctx.globalCompositeOperation="lighter";ctx.imageSmoothingEnabled=false;ctx.globalAlpha=Math.min(1,m.prox*1.1);ctx.drawImage(nz[ri(0,5)],0,0,W,H);
    const gd=ctx.createRadialGradient(W/2,H/2,H*.25,W/2,H/2,H*.9);gd.addColorStop(0,`rgba(${col},0)`);gd.addColorStop(1,`rgba(${col},${.55*m.prox})`);ctx.globalAlpha=1;ctx.fillStyle=gd;ctx.fillRect(0,0,W,H);ctx.restore()}}
  draw_drawers(){ctx.fillStyle="rgba(0,0,0,.75)";ctx.fillRect(0,0,W,H);const pn=this.panel();box(pn,"#262626","#c8c8c8",3);T(t("drw.title"),F(32,1),W/2,pn.y+44,0,1);
    const cr=this.closeR();box(cr,"#3c3c3c","#d2d2d2",2);T("X",F(22),cr.x+cr.w/2,cr.y+cr.h/2,0,1);const n=this.ui_stand;
    this.dr().forEach((r,i)=>{const op=n.opened[i];box(r,op?"#161616":"#5c5c5c","#d2d2d2",2);const cx=r.x+r.w/2,cy=r.y+r.h/2;
      if(!op){circ(cx,cy,10,"#ebebeb");T(""+(i+1),F(22),r.x+14,r.y+10,"#141414")}
      else{const[k,txt]=n.drawers[i];if(k==="key"){ctx.strokeStyle="#ebebeb";ctx.lineWidth=5;ctx.beginPath();ctx.arc(cx-40,cy,20,0,7);ctx.stroke();ctx.lineWidth=6;ctx.beginPath();
          ctx.moveTo(cx-18,cy);ctx.lineTo(cx+60,cy);ctx.moveTo(cx+40,cy);ctx.lineTo(cx+40,cy+18);ctx.moveTo(cx+58,cy);ctx.lineTo(cx+58,cy+14);ctx.stroke();T(t("item.key"),F(22),cx,r.y+r.h-22,0,1)}
        else if(k==="code"||k==="codeA"||k==="codeB"){box(rc(cx,cy,220,110),"#e1e1e1");T(t("item.code"),F(22),cx,cy-33,"#1e1e1e",1);T(txt,F(32,1),cx,cy+13,"#0a0a0a",1)}else if(ITEMS[k]||PARTS[k]){const nm=ITEMS[k]?ITEMS[k].n:t(PARTS[k][0]);T(nm,F(28,1),cx,cy-22,0,1);T(t(txt),F(16),cx,cy+22,"#c8c8c8",1)}else T(t(txt),F(22),cx,cy,"#c8c8c8",1)}});
    T(t(TOUCH?"drw.touch":"drw.pc"),F(22),W/2,pn.y+505,"#bebebe",1)}
  draw_keypad(){ctx.fillStyle="rgba(0,0,0,.78)";ctx.fillRect(0,0,W,H);const ox=this.shake>0?Math.floor(Math.sin(this.t*60)*8):0;ctx.save();ctx.translate(ox,0);
    const[pn,ks]=this.padKeys();box(pn,"#1e1e1e","#d2d2d2",3);T(t("kp.title"),F(32,1),pn.x+pn.w/2,pn.y+42,0,1);
    for(let i=0;i<4;i++){const b=rc(pn.x+pn.w/2+(i-1.5)*100,pn.y+125,80,90);box(b,"#0a0a0a","#e6e6e6",2);if(i<this.pad.length)T(this.pad[i],F(72,1),b.x+b.w/2,b.y+b.h/2,0,1)}
    if(this.pad_msg)T(t(this.pad_msg),F(32,1),pn.x+pn.w/2,pn.y+196,"#fff",1);
    for(const[l,r]of ks){box(r,"#161616","#c8c8c8",2);T(l==="<"?"<-":l==="X"?t("kp.exit"):l,F(32,1),r.x+r.w/2,r.y+r.h/2,0,1)}
    if(!TOUCH)T(t("kp.hint"),F(22),pn.x+pn.w/2,pn.y+pn.h-24,"#aaa",1);ctx.restore()}
  draw_js(){ctx.fillStyle="#000";ctx.fillRect(0,0,W,H);const t=this.js_t,JJ=JUMPS[this.killer]||JUMPS[0];
    if(t<JG){const e=1-Math.pow(1-t/JG,3),s=.05+.95*e,w=Math.max(2,W*s),h=Math.max(2,H*s);ctx.drawImage(JJ,(W-w)/2,(H-h)/2,w,h)}else ctx.drawImage(JJ,ri(-9,9),ri(-9,9));
    const a=pick([0,0,0,30,60,110]);if(a){ctx.fillStyle=`rgba(0,0,0,${a/255})`;ctx.fillRect(0,0,W,H)}
    if(t>=JG){const al=Math.min(1,(t-JG)/.5);ctx.fillStyle=`rgba(0,0,0,${al*.62})`;ctx.fillRect(0,H-160,W,150);
      T(this.lives>0?window.t("js.lives",{n:this.lives}):window.t("js.nolives"),F(72,1),W/2,H-118,"#f5f5f5",1,al);
      const ML=this.maxl;for(let i=0;i<ML;i++)heart(W/2+(i-(ML-1)/2)*60,H-55,40,i<this.lives?"#f0f0f0":"#3c3c3c")}
    if(t>JT-.5){ctx.fillStyle=`rgba(0,0,0,${Math.min(1,(t-(JT-.5))/.5)})`;ctx.fillRect(0,0,W,H)}}
}

// ---------------------------------------------------------------- меню
let langRects=[];
const noise=[],noiseR=[],noiseB=[];let scene="load",game=null,sel=0,flick=1,mrects=[],loreT=0,menuT=0,menuDt=0,ctlT=0,selY=360,fadeIn=1;
const KEY_LINES=Array.from({length:9},(_,i)=>"ctl.k"+i);
const TOUCH_LINES=["ctl.t0","ctl.t1","ctl.t2","ctl.k3","ctl.k4","ctl.t5","ctl.t6"];
const GOAL=["","ctl.g1","ctl.g2","ctl.g3","ctl.g4","ctl.g5"];
function addNoise(i){ctx.globalCompositeOperation="lighter";ctx.imageSmoothingEnabled=false;ctx.drawImage(noise[i],0,0,W,H);ctx.imageSmoothingEnabled=true;ctx.globalCompositeOperation="source-over"}
const DUST=Array.from({length:90},()=>({x:Math.random()*W,y:Math.random()*H,r:Math.random()*1.8+.5,vx:Math.random()*16-8,vy:-(Math.random()*12+3),a:Math.random()*.35+.08,p:Math.random()*6}));
let EYE=null,eyeT=2.5;const TITLE="WORST NIGHTMARE";
const fadeOv=()=>{if(fadeIn>0){ctx.fillStyle=`rgba(0,0,0,${Math.min(1,fadeIn)})`;ctx.fillRect(0,0,W,H)}};
function drawLangBar(){const cur=getLang();langRects=[];ctx.font=F(24,1);ctx.textBaseline="middle";ctx.textAlign="center";let x=30;
  for(const l of LANG_LIST){const lb=LANG_SHORT[l],w=Math.ceil(ctx.measureText(lb).width)+24,r=rect(x,24,w,40),on=l===cur;langRects.push([l,r]);
    box(r,on?"rgba(255,255,255,.14)":"rgba(0,0,0,.35)",on?"#d2d2d2":"#4a4a4a",2);ctx.fillStyle=on?"#f5f5f5":"#7a7a7a";ctx.fillText(lb,x+w/2,24+21);x+=w+8}}
function drawMenu(){const dt=menuDt,ease=(t,d)=>{const k=cl((menuT-t)/(d||.6),0,1);return 1-Math.pow(1-k,3)};
  if(Math.random()<.04)flick=pick([.15,.5,1,.3]);else flick+=(1-flick)*.2;
  ctx.fillStyle="#030303";ctx.fillRect(0,0,W,H);
  const pul=.5+.5*Math.sin(menuT*1.3);
  const gd=ctx.createRadialGradient(W/2,H/2-60,0,W/2,H/2-60,420+40*pul);gd.addColorStop(0,`rgba(255,255,255,${(.06+.03*pul)*flick})`);gd.addColorStop(1,"rgba(255,255,255,0)");ctx.fillStyle=gd;ctx.fillRect(0,0,W,H);
  for(let i=0;i<3;i++){const fx=W*(.15+.35*i)+Math.sin(menuT*.15+i*2.1)*220,fy=H*(.55+.15*Math.sin(menuT*.1+i))+40,fg=ctx.createRadialGradient(fx,fy,0,fx,fy,320);
    fg.addColorStop(0,"rgba(120,120,120,.07)");fg.addColorStop(1,"rgba(120,120,120,0)");ctx.fillStyle=fg;ctx.fillRect(0,0,W,H)}
  for(const d of DUST){d.x+=d.vx*dt;d.y+=d.vy*dt;if(d.y<-5){d.y=H+5;d.x=Math.random()*W}if(d.x<-5)d.x=W+5;else if(d.x>W+5)d.x=-5;
    ctx.globalAlpha=d.a*(.5+.5*Math.sin(menuT*1.5+d.p))*ease(.2,1);ctx.fillStyle="#cfcfcf";ctx.fillRect(d.x,d.y,d.r,d.r)}ctx.globalAlpha=1;
  eyeT-=dt;if(!EYE&&eyeT<=0){const left=Math.random()<.5;EYE={x:left?rnd(60,300):rnd(W-300,W-60),y:rnd(H*.3,H*.75),t:0,life:rnd(2.5,4.5),s:rnd(.8,1.5)}}
  if(EYE){EYE.t+=dt;const k=EYE.t/EYE.life;if(k>=1){EYE=null;eyeT=rnd(3,8)}else{const a=Math.sin(Math.PI*k)*((EYE.t%1.9)<.14?0:1);
    for(const sg of[-1,1]){const ex=EYE.x+sg*20*EYE.s,ey=EYE.y,gg=ctx.createRadialGradient(ex,ey,0,ex,ey,26*EYE.s);gg.addColorStop(0,`rgba(255,255,255,${.35*a})`);gg.addColorStop(1,"rgba(255,255,255,0)");
      ctx.fillStyle=gg;ctx.fillRect(ex-30*EYE.s,ey-30*EYE.s,60*EYE.s,60*EYE.s);ctx.fillStyle=`rgba(240,240,240,${a})`;ctx.beginPath();ctx.ellipse(ex,ey,6*EYE.s,2.6*EYE.s,0,0,7);ctx.fill()}}}
  addNoise(ri(0,5));const v=235*flick;
  if(Math.random()<.08)for(const d of[-6,6])T(TITLE,F(100,1),W/2+d+ri(-4,4),170+ri(-3,3),"#464646",1);
  ctx.font=F(100,1);ctx.textAlign="left";ctx.textBaseline="middle";
  const ch=[...TITLE],ws=ch.map(c=>ctx.measureText(c).width);let tx=W/2-ws.reduce((a,b)=>a+b,0)/2;
  ch.forEach((c,i)=>{const e=ease(.1+i*.06,.7);ctx.globalAlpha=e;ctx.fillStyle=gr(v*(.85+.15*Math.sin(menuT*2+i*.6)));ctx.fillText(c,tx,170+Math.sin(menuT*1.6+i*.5)*3-(1-e)*40);tx+=ws[i]});ctx.globalAlpha=1;
  const items=["menu.play","menu.mp","menu.controls","menu.settings"].map(k=>t(k));mrects=[];selY+=(360+sel*80-selY)*Math.min(1,dt*12);
  {const sa=ease(.6,.5),bw=300+20*Math.sin(menuT*3);ctx.save();ctx.globalAlpha=sa*(.6+.3*Math.sin(menuT*4));
    const bg2=ctx.createLinearGradient(W/2-bw,0,W/2+bw,0);bg2.addColorStop(0,"rgba(255,255,255,0)");bg2.addColorStop(.5,"rgba(255,255,255,.12)");bg2.addColorStop(1,"rgba(255,255,255,0)");
    ctx.fillStyle=bg2;ctx.fillRect(W/2-bw,selY-30,bw*2,60);ctx.fillStyle="rgba(255,255,255,.35)";ctx.fillRect(W/2-bw*.6,selY+32,bw*1.2,1);ctx.fillRect(W/2-bw*.6,selY-32,bw*1.2,1);ctx.restore()}
  items.forEach((l,i)=>{const a=i===sel,e=ease(.5+i*.15,.5);ctx.font=F(44,1);ctx.textAlign="center";ctx.textBaseline="middle";
    const s2=a?"> "+l+" <":l,w=ctx.measureText(s2).width,off=(1-e)*-120,sh=a?Math.sin(menuT*6)*2:0;
    ctx.globalAlpha=e;ctx.fillStyle=a?"#f5f5f5":"#6e6e6e";ctx.fillText(s2,W/2+off+sh,360+i*80);ctx.globalAlpha=1;mrects.push(rc(W/2,360+i*80,w+160,84))});
  ctx.font=F(26);ctx.textAlign="center";ctx.globalAlpha=ease(1.3,.8)*(.7+.3*Math.sin(menuT*2));ctx.fillStyle="#5f5f5f";ctx.fillText(t(TOUCH?"menu.hint.touch":"menu.hint.pc"),W/2,H-40);ctx.globalAlpha=1;
  drawLangBar();ctx.fillStyle="#000";for(let y=0;y<H;y+=4)ctx.fillRect(0,y,W,1);fadeOv()}
function drawControls(){ctx.fillStyle="#040404";ctx.fillRect(0,0,W,H);addNoise(ri(0,5));T(t("menu.controls"),F(64,1),W/2,80,"#ebebeb",1);
  [...(TOUCH?TOUCH_LINES:KEY_LINES),...GOAL].forEach((s,i)=>{const e=cl((ctlT-i*.06)/.35,0,1);T(t(s),F(24),W/2+(1-e)*-60,150+i*32,"#c8c8c8",1,e)});
  T(t(TOUCH?"ctl.back.touch":"ctl.back.pc"),F(26),W/2,H-36,"#787878",1);fadeOv()}
const LORE=["lore.0","lore.1","lore.2","lore.3","lore.4","","lore.6"];
function drawLore(){ctx.fillStyle="#020202";ctx.fillRect(0,0,W,H);addNoise(ri(0,5));
  LORE.forEach((s,i)=>{const a=cl((loreT-i*1.6)/1.2,0,1);if(a>0)T(t(s),F(34),W/2,190+i*56,i===6?"#f0f0f0":"#cfcfcf",1,a)});
  if(loreT>LORE.length*1.6)T(t(TOUCH?"lore.hint.touch":"lore.hint.pc"),F(26),W/2,H-50,"#787878",1,.5+.5*Math.sin(loreT*3));fadeOv()}
// ---------------------------------------------------------------- выбор сложности
// Цепочка запуска одиночной игры: меню → [экран сложности] → afterDiff → toLore → startGame.
// Чтобы вставить шаг «Игровые условия»: в afterDiff вместо toLore() вызвать openConditions(PICK,toLore) (он сам решает, куда идти дальше).
let DIFFCB=null,DSEL=1,DSPEED=false,diffT=0,PICK={diff:"normal",speed:false,cond:"normal"};
const DIFF_IMG=DIFFS.map(d=>{const o={im:new Image(),ok:false};o.im.onload=()=>{o.ok=true};o.im.src="diff_"+d+".png";return o});   // нет файла — рисуется заглушка
function openDiff(cb){DIFFCB=cb;diffT=0;fadeIn=.5;scene="diff"}
const soloDiffCb=()=>({pick:afterDiff,back:()=>{scene="menu";fadeIn=.5}});
function afterDiff(d,s){PICK={diff:d,speed:s,cond:"normal"};   // сложность выбрана → окно игровых условий (solo:true) → вступление
  openConditions({mp:false,pick:id=>{PICK.cond=id;toLore()},back:()=>openDiff(soloDiffCb())})}
function toLore(){fadeIn=.9;CH.lamp.stop();scene="lore";loreT=0}
function diffPick(){const cb=DIFFCB;if(!cb)return;DIFFCB=null;blip("click",.7,0);cb.pick(DIFFS[DSEL],DSPEED)}
function diffBack(){const cb=DIFFCB;if(!cb)return;DIFFCB=null;blip("click",.4,0);if(cb.back)cb.back()}
function diffLay(){const tc=TOUCH,cs=tc?170:220,gap=tc?50:40,bh=tc?44:56,cols=tc?2:4,x0=Math.floor((W-(cols*cs+(cols-1)*gap))/2),y0=tc?92:170,rh=cs+12+bh+(tc?24:0),cards=[],btns=[];
  for(let i=0;i<4;i++){const x=x0+(i%cols)*(cs+gap),y=y0+Math.floor(i/cols)*rh;cards.push(rect(x,y,cs,cs));btns.push(rect(x,y+cs+12,cs,bh))}
  return{cards,btns,speed:tc?rect(W/2-190,584,380,46):rect(W/2-200,520,400,56),back:tc?rect(W/2-120,648,240,48):rect(W/2-140,610,280,56)}}
function drawDiff(){const L=diffLay(),tc=TOUCH;ctx.fillStyle="#000";ctx.fillRect(0,0,W,H);
  T(t("diff.title"),F(tc?40:56,1),W/2,tc?44:90,"#f0f0f0",1);
  for(let i=0;i<4;i++){const c=L.cards[i],b=L.btns[i],on=i===DSEL,im=DIFF_IMG[i];
    ctx.fillStyle="#0c0c0c";ctx.fillRect(c.x,c.y,c.w,c.h);
    if(im.ok){const iw=im.im.width,ih=im.im.height,q=Math.min(iw,ih);ctx.drawImage(im.im,(iw-q)/2,(ih-q)/2,q,q,c.x,c.y,c.w,c.h)}
    else T(""+(i+1),F(c.h*.5,1),c.x+c.w/2,c.y+c.h/2,"#262626",1);
    if(!on){ctx.fillStyle="rgba(0,0,0,.45)";ctx.fillRect(c.x,c.y,c.w,c.h)}
    ctx.save();if(on){ctx.shadowColor="#fff";ctx.shadowBlur=18}ctx.lineWidth=on?5:3;ctx.strokeStyle="#fff";ctx.strokeRect(c.x+1.5,c.y+1.5,c.w-3,c.h-3);ctx.restore();
    box(b,on?"#2a2a2a":"#101010",on?"#fff":"#9a9a9a",2);
    T(t("diff."+DIFFS[i]),F(tc?22:28,1),b.x+b.w/2,b.y+b.h/2,i===3?(on?"#ff6a5a":"#c04a40"):on?"#fff":"#bdbdbd",1)}
  const r=L.speed,px=r.x+r.w-92,py=r.y+r.h/2;box(r,"#0c0c0c",DSPEED?"#fff":"#6a6a6a",2);
  T(t("diff.speed"),F(26,1),r.x+20,py-14,DSPEED?"#fff":"#bdbdbd");T(t(DSPEED?"diff.on":"diff.off"),F(20),px-44,py,DSPEED?"#fff":"#8a8a8a",1);
  box(rect(px,py-13,64,26),DSPEED?"#e6e6e6":"#1a1a1a","#9a9a9a",2);circ(px+(DSPEED?50:14),py,10,DSPEED?"#000":"#8a8a8a");
  box(L.back,"#101010","#9a9a9a",2);T(t("diff.back"),F(28,1),L.back.x+L.back.w/2,L.back.y+L.back.h/2,"#d0d0d0",1);
  if(!tc)T(t("diff.hint.pc"),F(22),W/2,H-34,"#6a6a6a",1);
  fadeOv()}
function diffKey(c){const n=/^(?:Digit|Numpad)([1-4])$/.exec(c);
  if(c==="Escape"||c==="Backspace")diffBack();
  else if(n){DSEL=+n[1]-1;blip("click",.3,0)}
  else if(c==="ArrowLeft"||c==="ArrowUp"||c==="KeyA"){DSEL=(DSEL+3)%4;blip("click",.3,0)}
  else if(c==="ArrowRight"||c==="ArrowDown"||c==="KeyD"){DSEL=(DSEL+1)%4;blip("click",.3,0)}
  else if(c==="Tab"){DSPEED=!DSPEED;blip("click",.3,0)}
  else if(c==="Enter"||c==="NumpadEnter"||c==="Space")diffPick()}
function diffClick(p){const L=diffLay();
  if(inR(L.back,p)){diffBack();return}
  if(inR(L.speed,p)){DSPEED=!DSPEED;blip("click",.4,0);return}
  for(let i=0;i<4;i++)if(inR(L.cards[i],p)||inR(L.btns[i],p)){DSEL=i;diffPick();return}}
function diffHover(p){const L=diffLay();for(let i=0;i<4;i++)if((inR(L.cards[i],p)||inR(L.btns[i],p))&&DSEL!==i){DSEL=i;blip("click",.3,0)}}

// ---------------------------------------------------------------- выбор игровых условий (окно после сложности, тот же стиль)
// openConditions({mp, pick:id=>…, back:()=>…}): mp=false — режимы solo, mp=true — режимы для мультиплеера. Если режим один — окно пропускается.
let CONDCB=null,CSEL=0,CLIST=[],CPREV="normal",condT=0;
const COND_IMG={};   // cond_<id>.png рядом с index.html; нет файла — рисуется заглушка
const condImg=id=>COND_IMG[id]||(COND_IMG[id]=(()=>{const o={im:new Image(),ok:false};o.im.onload=()=>{o.ok=true};o.im.src="cond_"+id+".png";return o})());
function openConditions(o){CLIST=condList(!!o.mp);if(CLIST.length<2){o.pick(CLIST.length?CLIST[0].id:"normal");return}
  CONDCB=o;const i=CLIST.findIndex(m=>m.id===CPREV);CSEL=i>=0?i:0;condT=0;fadeIn=.5;scene="cond"}
function condPick(){const cb=CONDCB;if(!cb)return;CONDCB=null;CPREV=CLIST[CSEL].id;blip("click",.7,0);cb.pick(CPREV)}
function condBack(){const cb=CONDCB;if(!cb)return;CONDCB=null;blip("click",.4,0);if(cb.back)cb.back()}
function wrapT(s,font,maxW,maxL){ctx.font=font;const out=[];let line="";
  for(const w of String(s).split(/\s+/)){const tr=line?line+" "+w:w;if(line&&ctx.measureText(tr).width>maxW){out.push(line);line=w}else line=tr}
  if(line)out.push(line);if(out.length>maxL){out.length=maxL;out[maxL-1]=out[maxL-1].replace(/.{0,2}$/,"…")}return out}
function condLay(){const n=CLIST.length,tc=TOUCH,cols=Math.min(n,tc?3:6),rows=Math.ceil(n/cols),gap=tc?22:n>5?20:32,y0=tc?84:150,backY=tc?648:610,bh=tc?40:48,dh=tc?72:rows===1?140:88,
    avail=backY-16-y0;let cs=Math.min(tc?150:200,Math.floor((W-60-(cols-1)*gap)/cols));
  if(rows*(cs+10+bh+6+dh)>avail)cs=Math.max(60,Math.floor(avail/rows)-(10+bh+6+dh));
  const rh=cs+10+bh+6+dh,x0=Math.floor((W-(cols*cs+(cols-1)*gap))/2),cards=[],btns=[];
  for(let i=0;i<n;i++){const x=x0+(i%cols)*(cs+gap),y=y0+Math.floor(i/cols)*rh;cards.push(rect(x,y,cs,cs));btns.push(rect(x,y+cs+10,cs,bh))}
  return{cards,btns,cs,gap,bh,dh,back:tc?rect(W/2-120,backY,240,48):rect(W/2-140,backY,280,56)}}
function drawCond(){const L=condLay(),tc=TOUCH;ctx.fillStyle="#000";ctx.fillRect(0,0,W,H);
  T(t("cond.title"),F(tc?40:56,1),W/2,tc?44:90,"#f0f0f0",1);
  CLIST.forEach((m,i)=>{const c=L.cards[i],b=L.btns[i],on=i===CSEL,im=condImg(m.id);
    ctx.fillStyle="#0c0c0c";ctx.fillRect(c.x,c.y,c.w,c.h);
    if(im.ok){const iw=im.im.width,ih=im.im.height,q=Math.min(iw,ih);ctx.drawImage(im.im,(iw-q)/2,(ih-q)/2,q,q,c.x,c.y,c.w,c.h)}
    else T(""+(i+1),F(c.h*.5,1),c.x+c.w/2,c.y+c.h/2,"#262626",1);
    if(!on){ctx.fillStyle="rgba(0,0,0,.45)";ctx.fillRect(c.x,c.y,c.w,c.h)}
    ctx.save();if(on){ctx.shadowColor="#fff";ctx.shadowBlur=18}ctx.lineWidth=on?5:3;ctx.strokeStyle="#fff";ctx.strokeRect(c.x+1.5,c.y+1.5,c.w-3,c.h-3);ctx.restore();
    box(b,on?"#2a2a2a":"#101010",on?"#fff":"#9a9a9a",2);
    {const nm=t(m.nameKey);let fz=tc?18:24;ctx.font=F(fz,1);while(fz>11&&ctx.measureText(nm).width>b.w-12){fz--;ctx.font=F(fz,1)}   // длинное название ужимаем под кнопку
      T(nm,F(fz,1),b.x+b.w/2,b.y+b.h/2,on?"#fff":"#bdbdbd",1)}
    const fs=tc?14:16,lh=fs+4;wrapT(t(m.descKey),F(fs),c.w+L.gap-10,Math.floor(L.dh/lh)).forEach((ln,j)=>T(ln,F(fs),c.x+c.w/2,b.y+b.h+8+lh/2+j*lh,on?"#cfcfcf":"#7a7a7a",1))});
  box(L.back,"#101010","#9a9a9a",2);T(t("diff.back"),F(28,1),L.back.x+L.back.w/2,L.back.y+L.back.h/2,"#d0d0d0",1);
  if(!tc)T(t("cond.hint.pc"),F(22),W/2,H-34,"#6a6a6a",1);
  fadeOv()}
function condKey(c){const n=CLIST.length,d=/^(?:Digit|Numpad)([1-9])$/.exec(c);
  if(c==="Escape"||c==="Backspace")condBack();
  else if(d&&+d[1]<=n){CSEL=+d[1]-1;blip("click",.3,0)}
  else if(c==="ArrowLeft"||c==="ArrowUp"||c==="KeyA"){CSEL=(CSEL+n-1)%n;blip("click",.3,0)}
  else if(c==="ArrowRight"||c==="ArrowDown"||c==="KeyD"){CSEL=(CSEL+1)%n;blip("click",.3,0)}
  else if(c==="Enter"||c==="NumpadEnter"||c==="Space")condPick()}
function condClick(p){const L=condLay();
  if(inR(L.back,p)){condBack();return}
  for(let i=0;i<CLIST.length;i++)if(inR(L.cards[i],p)||inR(L.btns[i],p)){CSEL=i;condPick();return}}
function condHover(p){const L=condLay();for(let i=0;i<CLIST.length;i++)if((inR(L.cards[i],p)||inR(L.btns[i],p))&&CSEL!==i){CSEL=i;blip("click",.3,0)}}

function startGame(){game=new Game({diff:PICK.diff,speed:PICK.speed,cond:PICK.cond});scene="game";showHud(game)}
const MENU_ACTS=["play","mp","controls","settings"];
function menuAct(a){blip("click",.7,0);if(a==="mp"){if(window.UI&&window.NET)UI.open("mp");else WN.toast(t("net.unavailable"))}else if(a==="settings")openSet();else if(a==="controls"){scene="controls";ctlT=0;fadeIn=.6}else if(a==="play"){openDiff(soloDiffCb())}}
function menuKey(c){if(c==="ArrowUp"||c==="KeyW"){sel=(sel+3)%4;blip("click",.3,0)}else if(c==="ArrowDown"||c==="KeyS"){sel=(sel+1)%4;blip("click",.3,0)}else if(c==="Enter"||c==="Space")menuAct(MENU_ACTS[sel])}

// ---------------------------------------------------------------- ввод
const posOf=e=>{const r=cv.getBoundingClientRect();return[(e.clientX-r.left)*W/r.width,(e.clientY-r.top)*H/r.height]};
addEventListener("keydown",e=>{if(window.UIOPEN)return;unlock();if(["Space","Tab","Backspace","ArrowUp","ArrowDown","ArrowLeft","ArrowRight","F1","F11"].includes(e.code))e.preventDefault();
  if(DBG.key(e,scene==="game"?game:null))return;if(e.repeat)return;const code=tr(e.code);keys.add(code);if(scene==="game"&&game.mode==="play"&&SET.sprintTog&&(code==="ShiftLeft"||code==="ShiftRight"))sprintLatch=!sprintLatch;
  if(scene==="menu")menuKey(e.code);else if(scene==="diff")diffKey(e.code);else if(scene==="cond")condKey(e.code);else if(scene==="controls")scene="menu";else if(scene==="lore"){if(loreT>.8)startGame()}else if(scene==="game")game.key({code,key:e.key})});
addEventListener("keyup",e=>keys.delete(tr(e.code)));addEventListener("blur",()=>keys.clear());
addEventListener("contextmenu",e=>e.preventDefault());
document.addEventListener("touchmove",e=>{if(e.target.closest&&e.target.closest("#set"))return;e.preventDefault()},{passive:false});
document.addEventListener("mousemove",e=>{if(document.pointerLockElement===cv)mouseDX+=e.movementX});
document.addEventListener("pointerlockchange",()=>{const was=locked;locked=document.pointerLockElement===cv;if(was&&!locked&&scene==="game"&&game.mode==="play"&&!DBG.picking(game))game.pause(true)});
document.addEventListener("visibilitychange",()=>{if(document.hidden&&scene==="game"&&game.mode==="play")game.pause(true)});
cv.addEventListener("pointerdown",e=>{if(window.UIOPEN)return;unlock();e.preventDefault();
  if(e.pointerType==="touch"){TOUCH=true;try{cv.setPointerCapture(e.pointerId)}catch(_){}}else if(e.button!==0)return;
  const p=posOf(e);
  if(scene==="game"&&DBG.click(game,p))return;
  if(scene==="menu"){let hit=false;langRects.forEach(([l,r])=>{if(inR(r,p)){hit=true;if(l!==getLang()){setLang(l);blip("click",.5,0)}}});
    if(!hit)mrects.forEach((r,i)=>{if(inR(r,p)){sel=i;menuAct(MENU_ACTS[i])}})}
  else if(scene==="controls")scene="menu";
  else if(scene==="diff")diffClick(p);
  else if(scene==="cond")condClick(p);
  else if(scene==="lore"){if(loreT>.8)startGame()}
  else if(scene==="game"){const wasPlay=game.mode==="play";game.tap(p);if(e.pointerType==="touch"&&wasPlay)game.touchEv("down",e.pointerId,p)}});
cv.addEventListener("pointermove",e=>{const p=posOf(e);
  if(e.pointerType==="touch"){if(scene==="game")game.touchEv("move",e.pointerId,p)}else if(scene==="menu")mrects.forEach((r,i)=>{if(inR(r,p)&&sel!==i){sel=i;blip("click",.3,0)}});else if(scene==="diff")diffHover(p);else if(scene==="cond")condHover(p)});
const up=e=>{if(e.pointerType==="touch"&&scene==="game")game.touchEv("up",e.pointerId,posOf(e))};
cv.addEventListener("pointerup",up);cv.addEventListener("pointercancel",up);
cv.addEventListener("wheel",e=>{if(scene==="game"&&game&&game.mode==="play"&&!window.UIOPEN){e.preventDefault();game.wheel(e.deltaY>0?1:-1)}},{passive:false});
const rot=document.getElementById("rot");
function resize(){const s=Math.min(innerWidth/W,innerHeight/H);cv.style.width=W*s+"px";cv.style.height=H*s+"px";
  const portrait=TOUCH&&innerHeight>innerWidth;rot.style.display=portrait?"flex":"none";if(portrait&&scene==="game"&&game.mode==="play")game.pause(true)}
addEventListener("resize",resize);resize();

// ================================================================ РЕЖИМ РАЗРАБОТЧИКА
// Только ПК (!TOUCH) и только одиночная игра (!game.mp). В мультиплеере и на тач-устройствах все проверки
// возвращают «выключено», а накопленное состояние сбрасывается — включить режим там нельзя ни при каких условиях.
// Доступ: 1) набрать секретную последовательность SECRET (цифры в меню или в игре, пауза между нажатиями ≤ 2 с)
//         либо открыть игру с ?wndev в адресе;  2) нажать F1.  До этого F1–F8 ведут себя как обычно (ничего не делают/браузер).
// F1 вкл/выкл режим · F2 ноуклип · F3 миникарта · F4 бессмертие · F5 прыжок+рывок · F6 спидхак · F7 джампхак · F8 телепорт
const DBG=(()=>{
  const SECRET=["Digit1","Digit9","Digit8","Digit4","Digit0","Digit6","Digit2","Digit7"],GAP=2000;
  const SPEED_K=2.5,JUMP_VZ=3.2,BASE_VZ=2.2;                  // множитель скорости; стартовая vz прыжка (обычная = 2.2)
  const CELL=5,MW=SZ*CELL,MX=W-30-MW,MY=176;                  // миникарта: правый край, под списком целей HUD
  const FLAGS=[["noclip","NOCLIP"],["map","MAP"],["god","GOD"],["air","AIR"],["speed","SPD"],["jump","JMP"]];
  const TILE={0:"#1a1a1a",1:"#8c8c8c",2:"#3d7ac4",3:"#d9902b",4:"#3cb371",5:"#46a0ff",6:"#7d5a22",7:"#4a3a2a",8:"#b84a4a"};
  const MON_COL=["#ff3b3b","#ffa040","#c35cff"];
  let armed=location.search.includes("wndev"),seq=0,seqT=0,mx=-1,my=-1;

  const state=()=>({on:false,noclip:false,map:false,god:false,air:false,speed:false,jump:false,pick:false});
  const ok=g=>!!g&&!g.mp&&!TOUCH;                                  // единственный «шлюз»: ПК + одиночная
  const f=(g,k)=>ok(g)&&!!g.dbg&&g.dbg.on&&!!g.dbg[k];              // активен ли флаг k
  const cellAt=p=>{const cx=Math.floor((p[0]-MX)/CELL),cy=Math.floor((p[1]-MY)/CELL);return cx>=0&&cy>=0&&cx<SZ&&cy<SZ?[cx,cy]:null};
  const free=(g,c)=>{const L=g.level,fl=g.player.floor,x=c[0]+.5,y=c[1]+.5;
    return!L.solid(x,y,fl)&&!L.floors[fl].stands.some(n=>hyp(n.x-x,n.y-y)<.8)&&hyp(L.stairs.x-x,L.stairs.y-y)>=.8};
  const tp=(g,c)=>{const p=g.player;p.x=c[0]+.5;p.y=c[1]+.5;p.cam=[p.x,p.y];p.hidden=false;p.trapped=0;p.dash_t=0;
    g.interact=null;g.notify("DBG: телепорт в ("+c[0]+", "+c[1]+")",1.5)};
  const endPick=(g,relock)=>{g.dbg.pick=false;if(relock&&g.mode==="play")lock()};

  function track(code){                                            // секретная последовательность (ничего не потребляет)
    const now=performance.now();if(now-seqT>GAP)seq=0;seqT=now;
    if(code===SECRET[seq])seq++;else seq=code===SECRET[0]?1:0;
    if(seq===SECRET.length){seq=0;armed=true;console.info("[DBG] режим разработчика разблокирован — F1 (только ПК, одиночная игра)")}}

  function f8(g){const d=g.dbg;
    if(!d.map){g.notify("DBG: телепорт работает только с включённой миникартой (F3)",2.5);return}
    if(g.mode!=="play")return;
    if(!d.pick){d.pick=true;unlockMouse();g.notify("DBG: выбери клетку — клик по карте или F8 · Esc — отмена",3.5);return}
    const c=cellAt([mx,my]);
    if(!c)endPick(g,true);
    else if(free(g,c)){tp(g,c);endPick(g,true)}
    else g.notify("DBG: клетка занята",1.2)}

  const bar=d=>{const parts=[["DEV","#ffd23c"],...FLAGS.map(([k,n])=>[n,d[k]?"#6cff7a":"#5c5c5c"])];
    ctx.font=F(14,1);let w=10;parts.forEach(p=>w+=ctx.measureText(p[0]).width+10);
    ctx.fillStyle="rgba(0,0,0,.72)";ctx.fillRect(4,2,w,18);
    let x=10;parts.forEach(([s,c])=>{T(s,F(14,1),x,4,c);x+=ctx.measureText(s).width+10})};

  function minimap(g,d){const L=g.level,p=g.player,fl=p.floor,grid=L.floors[fl].grid;
    ctx.save();ctx.fillStyle="rgba(0,0,0,.75)";ctx.fillRect(MX-4,MY-20,MW+8,MW+24);
    for(let y=0;y<SZ;y++)for(let x=0;x<SZ;x++){const v=grid[y][x];ctx.fillStyle=TILE[v]||"#777";ctx.fillRect(MX+x*CELL,MY+y*CELL,CELL,CELL)}
    for(const n of L.floors[fl].stands){ctx.fillStyle=n.opened[0]&&n.opened[1]?"#5c5c5c":"#ffd23c";ctx.fillRect(MX+n.x*CELL-2,MY+n.y*CELL-2,4,4)}   // тумбочки
    ctx.fillStyle="#ff4fd8";ctx.fillRect(MX+L.stairs.x*CELL-3,MY+L.stairs.y*CELL-3,6,6);                                                      // лестница
    let other=0;
    for(const m of g.monsters){if(m.floor!==fl){other++;continue}circ(MX+m.x*CELL,MY+m.y*CELL,3.5,MON_COL[m.type]||"#f33")}
    const px=MX+p.x*CELL,py=MY+p.y*CELL;                                                                                                       // игрок + направление
    ctx.strokeStyle="#fff";ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(px+Math.cos(p.angle)*8,py+Math.sin(p.angle)*8);ctx.stroke();
    circ(px,py,3,"#fff");
    if(d.pick){const c=cellAt([mx,my]);if(c){ctx.lineWidth=2;ctx.strokeStyle=free(g,c)?"#6cff7a":"#ff4040";ctx.strokeRect(MX+c[0]*CELL-1,MY+c[1]*CELL-1,CELL+2,CELL+2)}}
    ctx.restore();
    T("ЭТАЖ "+(fl+1)+(other?"  · монстров на др. этаже: "+other:""),F(12),MX,MY-16,"#c8c8c8");
    if(d.pick)T("клик / F8 — телепорт · Esc — отмена",F(12),MX,MY+MW+3,"#6cff7a")}

  cv.addEventListener("pointermove",e=>{[mx,my]=posOf(e)});        // позиция курсора для выбора клетки

  return{
    state,f,
    spd:g=>f(g,"speed")?SPEED_K:1,                                // множитель скорости ходьбы/бега
    air:g=>g.speedrun||f(g,"air"),                            // доступны ли прыжок и рывок (спидран-режим или F5)
    vz:g=>f(g,"jump")?JUMP_VZ:BASE_VZ,                            // стартовая вертикальная скорость прыжка
    oob:(x,y)=>x<.3||y<.3||x>SZ-.3||y>SZ-.3,                      // границы карты (в ноуклипе за них не выходим)
    picking:g=>ok(g)&&g.dbg.pick,
    // вызывается из keydown. true — клавиша потреблена (дальше в игру не идёт)
    key(e,g){
      if(TOUCH||(g&&g.mp))return false;
      if(!armed){if(!e.repeat)track(e.code);return false}
      if(!g)return false;                                          // в меню разблокировка есть, но включать режим нечему
      const d=g.dbg,c=e.code;
      if(c==="F1"){e.preventDefault();if(e.repeat)return true;
        if(d.on){if(d.pick)endPick(g,true);g.dbg=state()}else d.on=true;return true}
      if(!d.on)return false;
      if(d.pick&&c==="Escape"){endPick(g,true);return true}
      if(!/^F[2-8]$/.test(c))return false;
      e.preventDefault();if(e.repeat)return true;
      switch(c){
        case"F2":d.noclip=!d.noclip;break;
        case"F3":d.map=!d.map;if(!d.map&&d.pick)endPick(g,true);break;
        case"F4":d.god=!d.god;break;
        case"F5":d.air=!d.air;break;
        case"F6":d.speed=!d.speed;break;
        case"F7":d.jump=!d.jump;break;
        case"F8":f8(g);break}
      return true},
    // клик по канвасу. true — клик потреблён (телепорт по миникарте)
    click(g,p){
      if(!ok(g)||!g.dbg.on||!g.dbg.pick)return false;
      const c=cellAt(p);
      if(!c){g.dbg.pick=false;return false}                        // клик мимо карты — выходим из выбора, дальше обычный tap (вернёт захват мыши)
      if(!free(g,c)){g.notify("DBG: клетка занята",1.2);return true}
      tp(g,c);endPick(g,true);return true},
    // каждый кадр из Game.update, после update_extra
    update(g,dt){
      if(!ok(g)){if(g.dbg&&g.dbg.on)g.dbg=state();return}         // мультиплеер/тач — гарантированный сброс
      const d=g.dbg;if(!d.on)return;const p=g.player;
      if(d.pick&&g.mode!=="play")d.pick=false;
      if(d.god){g.sane=1;p.trapped=0}                              // рассудок на максимум, капкан снят
      if(d.speed){p.stamina=1;p.exhausted=false}},                 // бесконечная выносливость
    // из Game.draw, после hud()
    draw(g){if(!ok(g)||!g.dbg.on)return;bar(g.dbg);if(g.dbg.map&&g.mode!=="spec")minimap(g,g.dbg)}
  }})();

// ---------------------------------------------------------------- старт и цикл
function init(){for(let i=0;i<6;i++){const c=document.createElement("canvas");c.width=W/4;c.height=H/4;const g=c.getContext("2d"),d=g.createImageData(W/4,H/4),u=new Uint32Array(d.data.buffer);
    for(let k=0;k<u.length;k++){const v=Math.random()*64|0;u[k]=0xFF000000|(v<<16)|(v<<8)|v}g.putImageData(d,0,0);noise.push(c)}
  for(const[arr,fn]of[[noiseR,v=>[v*2.4,v*.1,v*.1]],[noiseB,v=>[v*3,v*2.5,v*1.8]]])for(let i=0;i<6;i++){const c=document.createElement("canvas");c.width=W/4;c.height=H/4;
    const g=c.getContext("2d"),d=g.createImageData(W/4,H/4),u=new Uint32Array(d.data.buffer);
    for(let k=0;k<u.length;k++){const[r,gg,b]=fn(Math.random()*64|0);u[k]=0xFF000000|(Math.min(255,b)<<16)|(Math.min(255,gg)<<8)|Math.min(255,r)}g.putImageData(d,0,0);arr.push(c)}
  scene="menu"}
let last=0;
function frame(now){requestAnimationFrame(frame);if(now-last<FPSMIN())return;const raw=(now-last)/1000,dt=Math.min(raw,.05);last=now;fpsTick(raw);fadeIn=Math.max(0,fadeIn-dt*2);
  if(scene==="load"){ctx.fillStyle="#000";ctx.fillRect(0,0,W,H);T(t("loading"),F(32),W/2,H/2,"#888",1);return}
  if(scene==="menu"||scene==="controls"||scene==="diff"||scene==="cond"){if(ac&&ac.state==="running"){if(SND.menu_music)loopSnd(CH.music,"menu_music",.7,.7);else if(scene==="menu"&&SND.lamp&&!CH.lamp.busy())CH.lamp.play(SND.lamp,1,.25,.25)}}else CH.music.stop();
  if(scene==="menu"){menuT+=dt;menuDt=dt;drawMenu()}
  else if(scene==="diff"){diffT+=dt;drawDiff()}
  else if(scene==="cond"){condT+=dt;drawCond()}
  else if(scene==="lore"){loreT+=dt;drawLore()}
  else if(scene==="controls"){ctlT+=dt;drawControls()}
  else{game.update(dt);if(game.exit){const wasMp=game.mp;game.stopLoops();CH.scream.stop();if(ac)ac.resume();unlockMouse();game=null;scene="menu";menuT=0;fadeIn=1;hideHud();if(wasMp&&window.NET)NET.leave()}else game.draw()}}
requestAnimationFrame(frame);
["jumpscare.png","jumpscare_boiled.png","jumpscare_locust.png"].forEach((f,t)=>{const im=new Image();JIMG[t]=im;im.onload=()=>buildJump(t,true);im.onerror=()=>buildJump(t,false);im.src=f});
const fl=Promise.all([document.fonts.load("26px MonoFont","Аб"),document.fonts.load("26px MonoFontBold","Аб")]).catch(()=>{});
Promise.race([fl,new Promise(r=>setTimeout(r,4000))]).then(()=>{for(let t=0;t<3;t++)if(!JUMPS[t])buildJump(t,false);init()});

// ---------------------------------------------------------------- мультиплеер: мост WN для net.js
const $el=id=>document.getElementById(id);let toastT=null,wired=false;
function showHud(g){const sp=!!(g&&g.speedrun),t=$el("wn-timer");if(t){t.style.display=sp?"block":"none";t.textContent="00:00.0"}
  for(const id of["btn-jump","btn-dash"]){const b=$el(id);if(b)b.style.display=sp&&TOUCH?"block":"none"}}
function hideHud(){for(const id of["wn-timer","btn-jump","btn-dash"]){const b=$el(id);if(b)b.style.display="none"}}
function dropGame(){if(game){game.stopLoops();CH.scream.stop();unlockMouse();game=null}if(ac)ac.resume();hideHud();if(scene!=="load"){scene="menu";menuT=0;fadeIn=1}}
function wireButtons(){if(wired)return;wired=true;
  for(const[id,fn]of[["btn-jump","jump"],["btn-dash","dash"]]){const b=$el(id);
    if(b)b.addEventListener("pointerdown",e=>{e.preventDefault();e.stopPropagation();unlock();if(game)game[fn]()})}}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",wireButtons);else wireButtons();
window.WN={
  start(o){o=o||{};wireButtons();if(window.UI)UI.close();CH.lamp.stop();unlock();if(game)game.stopLoops();
    game=new Game({mp:true,seed:o.seed,diff:o.diff,speed:o.speed,cond:o.cond});scene="game";showHud(game);resize()},
  // экран сложности → окно условий (mp:true) для лобби: o={pick:(diff,speed,cond)=>…, back:()=>…}; «Назад» в условиях возвращает на сложность
  pickDiff(o){if(window.UI)UI.close();unlock();const dcb={pick:(d,s)=>openConditions({mp:true,pick:id=>o.pick(d,s,id),back:()=>openDiff(dcb)}),back:o.back};openDiff(dcb)},
  conds(){return condList(true)},   // [{id,nameKey,descKey,…}] — для выпадающего списка в лобби (net.js)
  event(ev){if(ev&&game&&game.mp)game.net_ev(ev)},
  backToLobby(){dropGame();if(window.UI)UI.open("lobby")},
  toMenu(){if(window.UI)UI.close();dropGame()},
  toast(msg){const e=$el("wn-toast");if(e){e.textContent=msg;e.style.display="block";clearTimeout(toastT);toastT=setTimeout(()=>{e.style.display="none"},3500)}else if(game)game.notify(msg,3.5)},
  lost(msg){WN.toast(msg);WN.toMenu()},
  scene(n){dropGame()},
  releaseKeys(){keys.clear();mouseDX=0;if(game)game.touch.reset()}
};

// ---------------------------------------------------------------- настройки: интерфейс и применение
let fpsT=0,fpsC=0,fovApplied=SET.fov,setPrev=false,bindingEl=null;
function fpsTick(raw){if(!SET.showFps)return;fpsT+=raw;fpsC++;if(fpsT>=.5){const e=$el("wn-fps");if(e)e.textContent=Math.round(fpsC/fpsT)+" FPS";fpsT=0;fpsC=0}}
function updReload(){const b=$el("set-reload");if(b)b.style.display=SET.qual!==Q0?"block":"none"}
function applyAll(){
  if(ac){master.gain.value=SET.vol;sfxB.gain.value=SET.sfx;musB.gain.value=SET.mus}
  if(fovApplied!==SET.fov||!BGS){fovApplied=SET.fov;K=Math.tan(Math.PI*SET.fov/360);PROJ=RW/2/K;BGS=mkBGS()}
  const g=1/SET.bright;for(let i=0;i<256;i++)LUT[i]=255*Math.pow(i/255,g);
  const st=document.documentElement.style;st.setProperty("--hud-a",SET.btnA);st.setProperty("--hud-s",SET.btnS);
  const f=$el("wn-fps");if(f)f.style.display=SET.showFps?"block":"none";
  buildKeys();updReload()}
function commit(){applyAll();saveSet()}
const pc=v=>Math.round(v*100)+"%";
const SET_UI=[
  ["set.h.general",[
    ["L"],
    ["r","sens","set.sens",.2,3,.05,v=>v.toFixed(2)+"x"],
    ["r","vol","set.vol",0,1,.05,pc],
    ["r","sfx","set.sfx",0,1,.05,pc],
    ["r","mus","set.mus",0,1,.05,pc],
    ["s","qual","set.qual",[[0,"set.qual.0"],[1,"set.qual.1"],[2,"set.qual.2"]]],
    ["r","bright","set.bright",.6,2.2,.05,v=>v.toFixed(2)],
    ["r","fov","set.fov",60,90,1,v=>v+"°"],
    ["r","grain","set.grain",0,1.5,.05,pc],
    ["r","strobe","set.strobe",0,1,.05,pc],
    ["c","mono","set.mono"],
    ["c","ceil","set.ceil"]]],
  ["set.h.touch",[
    ["c","sprintHold","set.sprintHold"],
    ["r","btnS","set.btnS",.7,1.3,.05,pc],
    ["r","btnA","set.btnA",.3,1,.05,pc],
    ["c","joyFixed","set.joyFixed"],
    ["c","haptic","set.haptic"]]],
  ["set.h.pc",[
    ["c","invX","set.invX"],
    ["r","smooth","set.smooth",0,.9,.05,pc],
    ["c","sprintTog","set.sprintTog"],
    ["s","fps","set.fps",[[30,"30"],[60,"60"],[83,"set.fps.norm"],[0,"set.fps.off"]]],
    ["c","showFps","set.showFps"],
    ["k"]]]];
const KLAB={use:"kb.use",torch:"kb.torch",cracker:"kb.cracker",item:"kb.item",cycle:"kb.cycle",mark:"kb.mark",sprint:"kb.sprint"};
const KN={ShiftLeft:"Shift",ShiftRight:"key.shiftr",ControlLeft:"Ctrl",ControlRight:"key.ctrlr",AltLeft:"Alt",AltRight:"key.altr",CapsLock:"Caps Lock"};
const kname=c=>t(KN[c]||c.replace(/^(Key|Digit)/,""));
const RESV=/^(Escape|Space|Enter|NumpadEnter|Tab|Backspace|F\d+|KeyW|KeyA|KeyS|KeyD|Arrow\w+|Digit[1-5]|Numpad[1-4]|Meta\w*|ContextMenu)$/;
const SET_FB={"set.mono":"Чёрно-белый стиль","set.ceil":"Текстура потолка"};   // запасные подписи, пока нет ключей в lang.js
const tf=k=>{let s;try{s=t(k)}catch(e){}return s&&s!==k?s:(SET_FB[k]||k)};
function mk(tag,cls,txt){const e=document.createElement(tag);if(cls)e.className=cls;if(txt!=null)e.textContent=txt;return e}
function setBind(a,code){const cur=SET.keys[a]||DEFK[a];
  for(const o in DEFK)if(o!==a&&(SET.keys[o]||DEFK[o])===code)SET.keys[o]=cur;
  SET.keys[a]=code;for(const o in DEFK)if(SET.keys[o]===DEFK[o])delete SET.keys[o];commit()}
function keyRow(a){const row=mk("div","set-row set-chk"),b=mk("button","kbtn",kname(SET.keys[a]||DEFK[a]));b.type="button";
  b.onclick=()=>{if(bindingEl)return;bindingEl=b;b.textContent=t("key.press");
    const fin=()=>{removeEventListener("keydown",h,true);bindingEl=null;buildSet()};
    const h=e=>{e.preventDefault();e.stopPropagation();if(e.code==="Escape"){fin();return}
      if(RESV.test(e.code)){WN.toast(t("key.busy"));return}setBind(a,e.code);fin()};
    addEventListener("keydown",h,true)};
  row.append(mk("span","set-l",t(KLAB[a])),b);return row}
function langRow(){const row=mk("div","set-row"),lb=mk("span","set-l",t("lang.label")),sl=document.createElement("select");
  for(const l of LANG_LIST){const o=document.createElement("option");o.value=l;o.textContent=LANG_NAMES[l];sl.appendChild(o)}
  sl.value=getLang();sl.addEventListener("change",()=>setLang(sl.value));row.append(lb,sl);return row}
function buildSet(){const box=$el("set-body");if(!box)return;box.textContent="";
  for(const[title,rows]of SET_UI){box.appendChild(mk("div","set-h",t(title)));
    for(const r of rows){const ty=r[0];if(ty==="k"){for(const a in DEFK)box.appendChild(keyRow(a));continue}
      if(ty==="L"){box.appendChild(langRow());continue}
      const k=r[1],row=mk("div","set-row"),lb=mk("span","set-l",tf(r[2]));
      if(ty==="r"){const val=mk("span","set-v",r[6](SET[k])),inp=document.createElement("input");inp.type="range";inp.min=r[3];inp.max=r[4];inp.step=r[5];inp.value=SET[k];
        inp.addEventListener("input",()=>{SET[k]=+inp.value;val.textContent=r[6](SET[k]);commit()});row.append(lb,val,inp)}
      else if(ty==="c"){const inp=document.createElement("input");inp.type="checkbox";inp.checked=!!SET[k];
        inp.addEventListener("change",()=>{SET[k]=inp.checked;commit()});row.classList.add("set-chk");row.append(lb,inp)}
      else{const sl=document.createElement("select");for(const[v,n]of r[3]){const o=document.createElement("option");o.value=v;o.textContent=t(n);sl.appendChild(o)}
        sl.value=String(SET[k]);sl.addEventListener("change",()=>{SET[k]=+sl.value;commit()});row.append(lb,sl)}
      box.appendChild(row)}}
  updReload()}
function openSet(){const s=$el("set");if(!s||s.style.display==="flex")return;
  if(scene==="game"&&game&&game.mode==="play")game.pause(true);
  setPrev=!!window.UIOPEN;window.UIOPEN=true;keys.clear();mouseDX=0;if(game&&game.touch)game.touch.reset();
  buildSet();s.style.display="flex"}
function closeSet(){const s=$el("set");if(!s)return;s.style.display="none";window.UIOPEN=setPrev;keys.clear()}
function wireSettings(){
  const gear=$el("btn-set");if(gear){gear.addEventListener("mousedown",e=>e.preventDefault());gear.addEventListener("pointerdown",e=>e.stopPropagation());
    gear.addEventListener("click",e=>{e.stopPropagation();openSet();gear.blur()})}
  $el("set-close").onclick=closeSet;
  $el("set-reload").onclick=()=>location.reload();
  $el("set-reset").onclick=()=>{Object.assign(SET,SET_DEF,{keys:{}});commit();buildSet()};
  addEventListener("keydown",e=>{if(e.code==="Escape"&&!bindingEl&&$el("set").style.display==="flex")closeSet()});
  applyAll()}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",wireSettings);else wireSettings();
addEventListener("langchange",()=>{buildSet()});
