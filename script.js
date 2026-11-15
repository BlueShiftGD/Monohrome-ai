"use strict";
// WORST NIGHTMARE (бывш. MONOCHROME) — порт с Python/pygame на JS. Ассеты лежат рядом с index.html:
// font.ttf, font_bold.ttf, jumpscare.png, jumpscare_boiled.png, jumpscare_locust.png,
// lamp/running/monster/scream/boiled/locust.mp3 (необязательно: scream_boiled.mp3, scream_locust.mp3)
const W=1280,H=720;
let TOUCH=matchMedia("(pointer:coarse)").matches||location.search.includes("touch");
const RW=TOUCH?240:320,RH=TOUCH?135:180,K=Math.tan(Math.PI*70/360),PROJ=RW/2/K;
const MAXM=8,KEYS=5,SZ=41,CN=20,MP=[{sp:3.2,pat:1.6,vt:14,vn:9,hr:6},{sp:3,pat:1.5,vt:12,vn:8,hr:8},{sp:3.5,pat:1.9,vt:16,vn:10,hr:5}],LIVES=3,SAFE=4.2,JG=1,JT=5,PATROL=0,CHASE=1,SEARCH=2;
const PASS=v=>v===0||v===3||v===6||v===7;   // проходимые тайлы: пол, закрытая дверь (монстр ломает), открытая, выломанная
const ITEMS={fuse:{n:"ПРЕДОХРАНИТЕЛЬ",d:"Чинит щиток лифта в блэкаут."},cracker:{n:"ПЕТАРДА",d:"G — бросить. Бахнет через 3 с."},adren:{n:"АДРЕНАЛИН",d:"8 с без усталости."},
  stim:{n:"СТИМУЛЯТОР",d:"+20% скорости 30 с. Трясёт."},shadow:{n:"ТЕНЬ",d:"15 с монстры почти слепы. Без фонаря."},flash:{n:"ФОТОАППАРАТ",d:"3 вспышки: оглушают монстра на 4 с."},wire:{n:"РАСТЯЖКА",d:"Монстр замедлится на 5 с."}};
const USE=["cracker","adren","stim","shadow","flash","wire"];
const PARTS={gear:["ШЕСТЕРЁНКА","Шестерёнка для лифта."],fuel:["КАНИСТРА","Канистра с топливом для лифта."]};
const PH=["Ключ здесь!","Монстр рядом!","Бежим к воротам!","Помогите!"];
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

// ---------------------------------------------------------------- звук
const AC=window.AudioContext||window.webkitAudioContext;let ac;try{ac=new AC()}catch(e){}
const SND={};
["lamp","running","monster","scream","boiled","locust","scream_boiled","scream_locust","menu_music","sfx_dash","sfx_boom","sfx_open","sfx_step","sfx_mark","sfx_pickup","sfx_door_open","sfx_door_close","sfx_drawer","sfx_trap","sfx_glass","sfx_win","sfx_click","sfx_siren","sfx_lift","sfx_hide"].forEach(async n=>{for(const x of[".mp3",".ogg",".wav"])try{
  const r=await fetch(n+x);if(!r.ok)continue;SND[n]=await ac.decodeAudioData(await r.arrayBuffer());return}catch(e){}});
class Ch{
  constructor(){this.src=null;this.l=1;this.r=1}
  busy(){return!!this.src}
  play(buf,lp,l,r){if(!ac)return;this.stop();const s=ac.createBufferSource(),a=ac.createGain(),b=ac.createGain(),m=ac.createChannelMerger(2);
    s.buffer=buf;s.loop=!!lp;s.connect(a);s.connect(b);a.connect(m,0,0);b.connect(m,0,1);m.connect(ac.destination);
    a.gain.value=l;b.gain.value=r;s.onended=()=>{if(this.src===s)this.src=null};s.start();this.src=s;this.ga=a;this.gb=b}
  stop(){if(this.src){const s=this.src;this.src=null;s.onended=null;try{s.stop();s.disconnect()}catch(e){}}}
  vol(l,r){if(!this.src)return;const t=ac.currentTime;this.ga.gain.setTargetAtTime(l,t,.03);this.gb.gain.setTargetAtTime(r,t,.03)}
}
const CH={lamp:new Ch,scream:new Ch,music:new Ch};
const unlock=()=>{if(ac&&ac.state==="suspended")ac.resume()};
const angD=(a,b)=>mod(a-b+Math.PI,2*Math.PI)-Math.PI;
const SYN={door_open:"open",door_close:"open",pickup:"open",mark:"open",drawer:"open",trap:"open",glass:"open",click:"open",hide:"step",siren:"boom",lift:"boom"};
function playPan(buf,v,pan){const s=ac.createBufferSource(),g=ac.createGain();s.buffer=buf;g.gain.value=v;s.connect(g);
  if(ac.createStereoPanner){const pn=ac.createStereoPanner();pn.pan.value=cl(pan||0,-1,1);g.connect(pn);pn.connect(ac.destination)}else g.connect(ac.destination);s.start()}
function blip(kind,vol,pan){if(!ac||ac.state!=="running"||!(vol>.01))return;const sm=SND["sfx_"+kind];if(sm){playPan(sm,Math.min(1.5,vol),pan);return}kind=SYN[kind]||kind;const dur=kind==="dash"||kind==="boom"?.4:kind==="open"?.12:.09,n=Math.floor(ac.sampleRate*dur),b=ac.createBuffer(1,n,ac.sampleRate),d=b.getChannelData(0);
  for(let i=0;i<n;i++){const e=1-i/n;d[i]=(Math.random()*2-1)*e*e}
  const s=ac.createBufferSource(),f=ac.createBiquadFilter(),g=ac.createGain(),t=ac.currentTime;s.buffer=b;
  if(kind==="dash"){f.type="bandpass";f.Q.value=1.2;f.frequency.setValueAtTime(500,t);f.frequency.exponentialRampToValueAtTime(3000,t+dur)}else{f.type="lowpass";f.frequency.value=kind==="open"?2600:kind==="boom"?900:380}
  g.gain.value=Math.min(1,vol)*(kind==="dash"?1.4:kind==="open"?1.5:kind==="boom"?3.4:3);s.connect(f);f.connect(g);
  if(ac.createStereoPanner){const pn=ac.createStereoPanner();pn.pan.value=cl(pan||0,-1,1);g.connect(pn);pn.connect(ac.destination)}else g.connect(ac.destination);s.start(t)}
function playBuf(buf,v){if(!ac||!buf||ac.state!=="running")return;const s=ac.createBufferSource(),g=ac.createGain();s.buffer=buf;g.gain.value=v;s.connect(g);g.connect(ac.destination);s.start()}
function loopSnd(ch,n,l,r){if(!SND[n])return;l=cl(l,0,1);r=cl(r,0,1);ch.busy()?ch.vol(l,r):ch.play(SND[n],1,l,r)}

// ---------------------------------------------------------------- уровень
class Level{
  constructor(){this.size=SZ;this.gate_floor=0;while(!this.build());}
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
  build(){const S=SZ,g0=this.maze(),g1=this.maze();g0[1][0]=5;g0[S-2][S-1]=4;
    this.start=[1.5,1.5];this.gate_c=[S-.5,S-1.5];this.start_angle=g0[1][2]===0?0:Math.PI/2;
    const far=(x,y,p,d)=>hyp(x+.5-p[0],y+.5-p[1])>=d;
    const k1=new Set(this.dead(g1).map(c=>c[0]*64+c[1]));
    const opts=this.dead(g0).filter(c=>k1.has(c[0]*64+c[1])&&far(c[0],c[1],this.start,7)&&far(c[0],c[1],this.gate_c,SAFE+4));
    if(!opts.length)return false;
    const[sx,sy]=pick(opts);this.stairs={x:sx+.5,y:sy+.5};this.stairs_exit=[this.exitOf(g0,sx,sy),this.exitOf(g1,sx,sy)];
    this.floors=[{grid:g0,stands:[],lamps:[]},{grid:g1,stands:[],lamps:[]}];const sc=[sx+.5,sy+.5];
    for(let fi=0;fi<2;fi++){const fl=this.floors[fi];
      let d=this.dead(fl.grid).filter(c=>!(c[0]===sx&&c[1]===sy)&&far(c[0],c[1],sc,3));
      if(fi===0)d=d.filter(c=>far(c[0],c[1],this.start,7)&&far(c[0],c[1],this.gate_c,9));
      const ch=this.spread(d,[4,5][fi],[9,7,5,3,0]);if(!ch)return false;
      fl.stands=ch.map(([x,y])=>({x:x+.5,y:y+.5,drawers:[["junk","Пусто."],["junk","Пусто."]],opened:[false,false]}))}
    this.code=String(ri(0,9999)).padStart(4,"0");this.sc=ri(0,2);   // сценарий: 0 классика, 1 лифт, 2 шифр
    const sl=fi=>shuf(this.floors[fi].stands.flatMap(n=>[[n,0],[n,1]])),sa=sl(0),sb=sl(1);
    if(this.sc===1){const m0=ri(1,2),pp=shuf([["gear",PARTS.gear[1]],["gear",PARTS.gear[1]],["fuel",PARTS.fuel[1]]]);
      [...sa.splice(0,m0),...sb.splice(0,3-m0)].forEach(([n,j],i)=>n.drawers[j]=pp[i])}
    else{const n0=ri(2,3);[...sa.splice(0,n0),...sb.splice(0,KEYS-n0)].forEach(([n,j])=>n.drawers[j]=["key","Ключ!"]);
      const cs=this.sc===2?[["codeA",this.code[0]+"_"+this.code[2]+"_"],["codeB","_"+this.code[1]+"_"+this.code[3]]]:[["code",this.code]],rest=shuf([...sa,...sb]);
      cs.forEach((c,i)=>{const[n,j]=rest[i];n.drawers[j]=c})}
    {const jk=shuf(this.floors.flatMap(fl=>fl.stands.flatMap(n=>[[n,0],[n,1]])).filter(([n,j])=>n.drawers[j][0]==="junk")),
      pool=shuf(["fuse","cracker","cracker","adren","stim","shadow","flash","wire"]).slice(0,ri(6,7));
      if(!pool.includes("fuse"))pool[0]="fuse";
      pool.forEach((k,i)=>{const[n,j]=jk[i];n.drawers[j]=[k,ITEMS[k].d]})}
    const JUNK=["Пусто.","Только пыль.","Старая фотография. Лица стёрты.","Сломанная лампочка.","Записка: «Не оглядывайся»","Пусто. Но кто-то был здесь недавно."];
    for(const fl of this.floors)for(const n of fl.stands)for(let j=0;j<2;j++)if(n.drawers[j][0]==="junk")n.drawers[j]=["junk",pick(JUNK)];
    for(let fi=0;fi<2;fi++){const g=this.floors[fi].grid,cand=[];
      for(let y=1;y<S-1;y++)for(let x=1;x<S-1;x++)if(g[y][x]===1&&x%2!==y%2&&far(x,y,sc,2.5)){
        if(fi===0&&!(far(x,y,this.start,5)&&far(x,y,this.gate_c,SAFE+2.5)))continue;cand.push([x,y])}
      const nc=[6,5][fi],w=this.spread(cand,nc+(this.sc===0?[1,2][fi]:0),[10,8,6,4,0]);if(!w)return false;w.forEach(([x,y],i)=>g[y][x]=i<nc?2:8)}
    for(const fl of this.floors)for(let y=1;y<S-1;y+=2)for(let x=1;x<S-1;x+=2)
      if(R()<.38||(x===1&&y===1)||(x===S-2&&y===S-2))fl.lamps.push([x+.5,y+.5]);
    this.cells=[];for(let y=1;y<S-1;y+=2)for(let x=1;x<S-1;x+=2)this.cells.push([x,y]);
    this.lift=[.5,1.5];this.doors=[[],[]];this.pon=new Set();
    for(let fi=0;fi<2;fi++){const g=this.floors[fi].grid,cd=[];   // тяжёлые двери в проходах между клетками
      for(let y=1;y<S-1;y++)for(let x=1;x<S-1;x++)if(g[y][x]===0&&x%2!==y%2&&far(x,y,sc,3)&&far(x,y,this.start,4)&&(fi||far(x,y,this.gate_c,SAFE+3)))cd.push([x,y]);
      const d=this.spread(cd,5,[8,6,4,0]);if(!d)return false;d.forEach(([x,y])=>{g[y][x]=6;this.doors[fi].push([x,y])})}
    for(let fi=0;fi<2;fi++){const fl=this.floors[fi],g=fl.grid,cd=[];   // стекло ("g") и капканы ("b")
      for(const[x,y]of this.cells)if(g[y][x]===0&&far(x,y,sc,3)&&far(x,y,this.start,5)&&(fi||far(x,y,this.gate_c,SAFE+3))&&!fl.stands.some(n=>hyp(n.x-x-.5,n.y-y-.5)<1.5))cd.push([x,y]);
      const hz=this.spread(cd,8,[7,5,3,0]);if(!hz)return false;fl.haz=hz.map(([x,y],i)=>({x:x+.5,y:y+.5,t:i<2?"b":"g",cd:0,sprung:false}))}
    return true}
  in_safe(x,y,f){return!this.nosafe&&f===0&&hyp(x-this.gate_c[0],y-this.gate_c[1])<SAFE}
  solid(x,y,f){const ix=Math.floor(x),iy=Math.floor(y);if(ix<0||iy<0||ix>=SZ||iy>=SZ)return true;{const v=this.floors[f].grid[iy][ix];return!(v===0||v===6||v===7)}}
  los(x0,y0,x1,y1,f){const n=Math.max(1,Math.floor(hyp(x1-x0,y1-y0)/.2));for(let i=1;i<n;i++){const t=i/n;if(this.solid(x0+(x1-x0)*t,y0+(y1-y0)*t,f))return false}return true}
  walls_between(x0,y0,x1,y1,f){const n=Math.max(1,Math.floor(hyp(x1-x0,y1-y0)/.2));let prev=this.solid(x0,y0,f),c=0;
    for(let i=1;i<=n;i++){const t=i/n,cur=this.solid(x0+(x1-x0)*t,y0+(y1-y0)*t,f);if(cur&&!prev)c++;prev=cur}return c}
  path_to(s,goal,f){const g=this.floors[f].grid,key=c=>c[0]*64+c[1],prev=new Map([[key(s),null]]),q=[s];let best=s,bd=(s[0]-goal[0])**2+(s[1]-goal[1])**2;
    for(let h=0;h<q.length;h++){const cur=q[h],d=(cur[0]-goal[0])**2+(cur[1]-goal[1])**2;if(d<bd){best=cur;bd=d;if(!d)break}
      for(const[dx,dy]of D4){const n=[cur[0]+dx,cur[1]+dy];if(prev.has(key(n)))continue;const row=g[n[1]];if(!row||!PASS(row[n[0]]))continue;
        if(this.in_safe(n[0]+.5,n[1]+.5,f))continue;prev.set(key(n),cur);q.push(n)}}
    const p=[];let c=best;while(c&&!(c[0]===s[0]&&c[1]===s[1])){p.push(c);c=prev.get(key(c))}return p.reverse()}
  far_cell(from,min,f){const s=[Math.floor(from[0]),Math.floor(from[1])],g=this.floors[f].grid,dist=new Map([[s[0]*64+s[1],0]]),q=[s];
    for(let h=0;h<q.length;h++){const c=q[h],dc=dist.get(c[0]*64+c[1]);for(const[dx,dy]of D4){const n=[c[0]+dx,c[1]+dy],k=n[0]*64+n[1];
      if(!dist.has(k)&&PASS(g[n[1]][n[0]])){dist.set(k,dc+1);q.push(n)}}}
    const ok=c=>c[0]%2===1&&c[1]%2===1&&!this.in_safe(c[0]+.5,c[1]+.5,f),all=[...dist].map(([k,d])=>[[Math.floor(k/64),k%64],d]);
    let o=all.filter(([c,d])=>d>=min&&ok(c));if(!o.length)o=all.filter(([c])=>ok(c));const c=pick(o)[0];return[c[0]+.5,c[1]+.5]}
}

// ---------------------------------------------------------------- монстр
const NOONE={id:null,x:-99,y:-99,floor:-1,hidden:true,torch:false,sprinting:false};
const SCN=["КЛАССИКА: 5 ключей, код и 3 рубильника. После кода ворота открываются не сразу.","ЛИФТ: найди 2 шестерёнки и топливо, запусти лифт у старта и продержись.","ШИФР: 5 ключей и код из двух обрывков — они в разных тумбочках."];
const MPHINT={normal:"Командой найдите 5 ключей и код. Прячьтесь в шкафах [E].",nightmare:"КОШМАРИЩЕ: одна жизнь, сейф-зон нет, монстры быстрее.",speed:"СПИДРАН: Пробел — прыжок, Shift в воздухе — рывок."};
class Monster{
  constructor(pos,f,type){this.type=type||0;this.prox=0;this.aud=0;this.aud_run=0;this.ch={a:new Ch,b:new Ch};this.reposition(pos,f);this.stair_cd=0;this.lost_t=0;this.linger=0;this.linger_total=0;this.repath=0;this.last_known=pos;this.sniff=0;this.sniffId=null;this.freeze=0;this.lit=0;this.rage=0;this.ragecd=0;this.slow=0;this.stun=0;this.wait=0;this.bash=0;this.bt=0;this.g=null}
  reposition(pos,f){this.x=pos[0];this.y=pos[1];this.floor=f;this.state=PATROL;this.path=[];this.goal=null;this.patrol_target=null;this.patrol_stairs=false;
    this.cross=false;this.arrived=false;this.lurk=0;this.grace=5;this.seen=false;this.freeze=this.rage=this.slow=this.stun=this.wait=this.bash=0}
  alert(p){if(this.state!==CHASE)this.state=SEARCH;this.last_known=p;this.arrived=false;this.cross=false;this.linger=0;this.path=[];this.goal=null;this.freeze=0;this.wait=0}
  go_stairs(L){this.state=SEARCH;this.last_known=[L.stairs.x,L.stairs.y];this.arrived=false;this.cross=true;this.lost_t=0;this.path=[];this.goal=null}
  change_floor(L){this.floor=1-this.floor;this.x=L.stairs_exit[this.floor][0];this.y=L.stairs_exit[this.floor][1];this.path=[];this.goal=null;
    this.patrol_target=null;this.patrol_stairs=false;this.stair_cd=10;this.grace=Math.max(this.grace,2)}
  move(wx,wy,sp,dt){const dx=wx-this.x,dy=wy-this.y,d=hyp(dx,dy);if(d<1e-6)return;const s=Math.min(d,sp*dt);this.x+=dx/d*s;this.y+=dy/d*s}
  goto(tx,ty,sp,dt,L,direct){
    if(direct){this.move(tx,ty,sp,dt);return false}
    this.repath-=dt;const goal=[Math.floor(tx),Math.floor(ty)];
    if(this.repath<=0||!this.goal||goal[0]!==this.goal[0]||goal[1]!==this.goal[1]){this.path=L.path_to([Math.floor(this.x),Math.floor(this.y)],goal,this.floor);this.goal=goal;this.repath=.4}
    while(this.path.length&&hyp(this.path[0][0]+.5-this.x,this.path[0][1]+.5-this.y)<.12)this.path.shift();
    if(!this.path.length)return true;
    {const nx=this.path[0];if(L.floors[this.floor].grid[nx[1]][nx[0]]===3&&hyp(nx[0]+.5-this.x,nx[1]+.5-this.y)<1.15){
      this.bash+=dt;this.bt-=dt;if(this.bt<=0){this.bt=.85;this.g.door_bash(this,nx)}if(this.bash>=3.5){this.bash=0;this.g.door_break(this.floor,nx)}return false}this.bash=0}
    this.move(this.path[0][0]+.5,this.path[0][1]+.5,sp,dt);return false}
  update(dt,g){const L=g.level,P=g.mps[this.type];this.g=g;this.stair_cd=Math.max(0,this.stair_cd-dt);this.grace=Math.max(0,this.grace-dt);
    this.slow=Math.max(0,this.slow-dt);this.rage=Math.max(0,this.rage-dt);this.ragecd=Math.max(0,this.ragecd-dt);
    if(this.stun>0){this.stun-=dt;this.seen=false;return}   // оглушён вспышкой
    const mul=(this.rage>0?1.3:1)*(this.slow>0?.45:1)*(g.fstate==="long"?1.12:1),SP=P.sp*mul,PT=P.pat*mul*(this.type===2&&this.patrol_stairs?1.35:1);
    let best=null,litT=null;
    for(const t of g.targets()){const s=this.floor===t.floor,d=s?hyp(t.x-this.x,t.y-this.y):99,sf=L.in_safe(t.x,t.y,t.floor),ok=s&&!t.hidden&&!sf,vk=t.shadow?.33:1;
      let sn=ok&&d<(t.torch?P.vt:P.vn)*vk&&L.los(this.x,this.y,t.x,t.y,this.floor),hd=ok&&t.sprinting&&d<P.hr;
      if(this.freeze>0&&ok&&(d<4.2||(t.torch&&d<P.vt&&L.los(this.x,this.y,t.x,t.y,this.floor))))this.freeze=0;   // чёрный «оживает»
      if(this.type===1&&ok&&t.torch&&t.angle!=null&&d<P.vt&&Math.abs(angD(t.angle,Math.atan2(this.y-t.y,this.x-t.x)))<.45&&L.los(this.x,this.y,t.x,t.y,this.floor))litT=t;
      if(this.grace>0)sn=hd=false;
      const sc=this.sniff>0&&t.id===this.sniffId?3:sn?2:hd?1:0;
      if(!best||sc>best.sc||(sc===best.sc&&d<best.d))best={t,s,d,sf,sn,hd,sc}}
    if(!best)best={t:NOONE,s:false,d:99,sf:false,sn:false,hd:false,sc:0};
    const p=best.t,same=best.s,dist=best.d,seen=best.sn,heard=best.hd;this.seen=seen;
    if(this.type===1){if(litT&&this.ragecd<=0&&this.rage<=0){this.lit+=dt;if(this.lit>1.5){this.lit=0;this.rage=7;this.ragecd=20;this.state=CHASE;this.cross=false;this.lost_t=0;this.last_known=[litT.x,litT.y];g.rage_fx(this)}}else this.lit=Math.max(0,this.lit-dt*1.5)}
    if(this.cross&&same)this.cross=false;
    if(seen){this.state=CHASE;this.cross=false;this.lost_t=0;this.last_known=[p.x,p.y]}else if(heard&&this.state!==CHASE)this.alert([p.x,p.y]);
    if(this.sniff>0){this.sniff-=dt;if(best.sc===3){if(same){this.state=CHASE;this.lost_t=0;this.cross=false;this.last_known=[p.x,p.y]}else if(!this.cross)this.go_stairs(L)}}
    if(this.state===CHASE&&!same)this.go_stairs(L);
    if(this.state===CHASE&&!seen){this.lost_t+=dt;if(this.lost_t>2.5){this.state=SEARCH;this.arrived=false;this.linger=0}}
    if(this.state===CHASE){seen?this.goto(p.x,p.y,SP,dt,L,dist<4.5):this.goto(this.last_known[0],this.last_known[1],SP,dt,L)}
    else if(this.state===SEARCH){
      if(!this.arrived){if(this.goto(this.last_known[0],this.last_known[1],this.cross?SP:SP*.62,dt,L)){this.arrived=true;this.linger=0;this.linger_total=rnd(3,8);
        if(this.cross){this.cross=false;this.change_floor(L);this.last_known=[this.x,this.y]}}}
      else{this.linger+=dt;if(same&&p.hidden&&dist<2.6){this.lurk+=dt;if(this.lurk>6.5){this.lurk=0;g.hit(this,p);return}}
        if(this.linger>this.linger_total){this.state=PATROL;this.patrol_target=null;this.lurk=0}}}
    else if(this.freeze>0)this.freeze-=dt;
    else if(this.wait>0)this.wait-=dt;
    else{
      if(!this.patrol_target){this.patrol_stairs=false;
        if(this.stair_cd<=0&&R()<(this.type===2?(same?.4:.7):(same?.12:.5))){this.patrol_target=[L.stairs.x,L.stairs.y];this.patrol_stairs=true}
        else{this.patrol_target=[1.5,1.5];for(let i=0;i<20;i++){const c=pick(L.cells),cx=c[0]+.5,cy=c[1]+.5;
          if(!L.in_safe(cx,cy,this.floor)&&hyp(cx-this.x,cy-this.y)>8){this.patrol_target=[cx,cy];break}}}
        if(this.type===0&&this.grace<=0&&!this.patrol_stairs&&R()<.18)this.freeze=rnd(5,9)}   // чёрный замирает в темноте
      if(this.freeze<=0&&this.goto(this.patrol_target[0],this.patrol_target[1],PT,dt,L)){
        if(this.patrol_stairs){if(this.type===2&&R()<.5){this.wait=rnd(5,9);this.patrol_stairs=false;this.patrol_target=null}else this.change_floor(L)}else this.patrol_target=null}}
    if(same&&!p.hidden&&this.grace<=0&&dist<.75)g.hit(this,p)}
}

// ---------------------------------------------------------------- ресурсы рендера
const world=document.createElement("canvas");world.width=RW;world.height=RH;
const wctx=world.getContext("2d"),wimg=wctx.createImageData(RW,RH),u32=new Uint32Array(wimg.data.buffer),buf=new Uint8ClampedArray(RW*RH),zb=new Float32Array(RW);
const BGS=[7,11].map(R=>{const a=new Uint8Array(RH+8),hor=(RH+8)>>1;for(let y=0;y<RH+8;y++){const dy=Math.abs(y-hor);
  a[y]=dy<1?0:255*Math.pow(Math.max(0,1-(PROJ*.5/dy)/R),1.4)*(y>hor?.34:.22)}return a});
const VIG=new Float32Array(RW*RH);for(let y=0;y<RH;y++)for(let x=0;x<RW;x++){const dx=(x-RW/2)/(RW/2),dy=(y-RH/2)/(RH/2),
  a=Math.pow(cl((Math.sqrt(dx*dx*.8+dy*dy*1.1)-.45)/.85,0,1),1.6);VIG[y*RW+x]=1-Math.floor(a*235)/255}
const GRAIN=Array.from({length:8},()=>{const a=new Uint8Array(RW*RH);for(let i=0;i<a.length;i++)a[i]=Math.random()*32;return a});
const VAR=Array.from({length:256},()=>rnd(.88,1.06));
// текстуры: положи рядом floor.png (пол, "02") и wall.png (стены, "24"); подойдут и имена 02.png / 24.png
const TS=256,TEX={floor:null,wall:null};
function loadTex(key,names,gain){let i=0;const im=new Image();
  im.onload=()=>{try{const c=document.createElement("canvas");c.width=c.height=TS;const g=c.getContext("2d",{willReadFrequently:true});g.drawImage(im,0,0,TS,TS);
    const d=g.getImageData(0,0,TS,TS).data,a=new Float32Array(TS*TS);let m=0;for(let k=0;k<a.length;k++){a[k]=.299*d[k*4]+.587*d[k*4+1]+.114*d[k*4+2];m+=a[k]}m/=a.length;
    for(let k=0;k<a.length;k++)a[k]=cl(1+(a[k]/m-1)*gain,.25,1.9);TEX[key]=a}catch(e){}};
  im.onerror=()=>{if(++i<names.length)im.src=names[i]};im.src=names[0]}
loadTex("floor",["floor.png","02.png","floor.jpg","02.jpg"],1.25);loadTex("wall",["wall.png","24.png","wall.jpg","24.jpg"],1.1);
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
const DECAL={mark:[.34,.62,SPR_MARK],door:[1,1,SPR_DOOR],glass:[.55,.1,SPR_GLASS],trap:[.5,.14,SPR_TRAP],wire:[.9,.06,SPR_WIRE]};   // [ширина, высота, спрайт] в клетках
const JUMPS=[],JIMG=[];
function buildJump(t,ok){const jimg=JIMG[t],c=document.createElement("canvas");c.width=W;c.height=H;const g=c.getContext("2d");g.fillStyle="#080808";g.fillRect(0,0,W,H);
  if(ok){const s=Math.max(W/jimg.width,H/jimg.height),w=jimg.width*s+1,h=jimg.height*s+1;g.drawImage(jimg,(W-w)/2,(H-h)/2,w,h)}
  else if(t){const red=t===1;g.fillStyle="#020202";g.fillRect(W*.3,H*.4,W*.4,H);g.fillStyle=red?"#7a1414":"#d6bfa0";g.beginPath();g.ellipse(W/2,H*.32,W*.12,H*.22,0,0,7);g.fill();g.fillStyle="#000";for(const d of[-1,1]){g.beginPath();g.ellipse(W/2+d*W*.045,H*.27,W*.02,H*.03,0,0,7);g.fill()}g.beginPath();g.ellipse(W/2,H*.42,W*(red?.06:.025),H*(red?.08:.05),0,0,7);g.fill()}else{g.fillStyle="#020202";g.fillRect(W*.3,H*.1,W*.4,H);g.fillStyle="#f0f0f0";for(const d of[-1,1]){g.beginPath();g.ellipse(W/2+d*W*.045,H*.2,W*.03,H*.035,0,0,7);g.fill()}}
  JUMPS[t]=c}

// ---------------------------------------------------------------- сенсорный интерфейс
class TouchUI{
  constructor(){this.sprint=false;this.reset()}
  reset(){this.js=null;this.look=null;this.last=0;this.dx=0;this.home=[190,540];this.base=this.home;this.knob=this.home;this.move=[0,0];this.bf={};this.acts=[]}
  get B(){const b={e:[[1160,540],74,"E"],f:[[1160,370],52,"F"],use:[[1000,450],46,"ИСП"],next:[[1160,230],38,">"],say:[[1085,150],32,"!"],sprint:[[1000,600],54,"БЕГ"],pause:[[1220,150],34,"II"],mark:[[1000,320],38,"МЕТ"]};if(this.nomark)delete b.mark;return b}
  pop(){const d=this.dx;this.dx=0;return d}
  feed(kind,id,p){const[x,y]=p;
    if(kind==="down"){for(const[n,[c,r]]of Object.entries(this.B))if(hyp(x-c[0],y-c[1])<=r*1.25){this.bf[id]=n;n==="sprint"?this.sprint=!this.sprint:this.acts.push(n);return}
      if(x<480&&y>160){if(this.js===null){this.js=id;this.base=[Math.max(120,Math.min(x,480)),Math.max(215,Math.min(y,H-120))];this.knob=this.base;this.move=[0,0]}}
      else if(x>=480&&this.look===null){this.look=id;this.last=x}}
    else if(kind==="move"){if(id===this.js){const dx=x-this.base[0],dy=y-this.base[1],d=hyp(dx,dy);
        if(d>1e-6){this.knob=[this.base[0]+dx/d*Math.min(d,110),this.base[1]+dy/d*Math.min(d,110)];this.move=Math.min(1,d/110)<.22?[0,0]:[dx/d,dy/d]}}
      else if(id===this.look){this.dx+=x-this.last;this.last=x}}
    else{if(id===this.js){this.js=null;this.base=this.knob=this.home;this.move=[0,0]}else if(id===this.look)this.look=null;delete this.bf[id]}}
  draw(eReady){circ(this.base[0],this.base[1],110,"rgba(255,255,255,.12)","rgba(255,255,255,.43)",3);circ(this.knob[0],this.knob[1],46,"rgba(255,255,255,.47)","rgba(255,255,255,.78)",3);
    const pr=Object.values(this.bf);for(const[n,[c,r,l]]of Object.entries(this.B)){const on=pr.includes(n)||(n==="sprint"&&this.sprint)||(n==="e"&&eReady);
      circ(c[0],c[1],r,on?"rgba(255,255,255,.37)":"rgba(255,255,255,.125)",on?"rgba(255,255,255,.75)":"rgba(255,255,255,.47)",3);T(l,F(l.length===1?32:22,l.length===1),c[0],c[1],"#f5f5f5",1)}}
}
// (кортеж B[n] = [центр, радиус, подпись])

// ---------------------------------------------------------------- игра
const keys=new Set();let mouseDX=0,locked=false;
const lock=()=>{if(!TOUCH&&document.pointerLockElement!==cv)try{const p=cv.requestPointerLock();p&&p.catch&&p.catch(()=>{})}catch(e){}};
const unlockMouse=()=>{if(document.pointerLockElement)document.exitPointerLock()};
const fs=()=>{const d=document.documentElement;if(document.fullscreenElement)document.exitFullscreen();else if(d.requestFullscreen)
  d.requestFullscreen().then(()=>screen.orientation&&screen.orientation.lock&&screen.orientation.lock("landscape").catch(()=>{})).catch(()=>{})};

class Game{
  constructor(o){o=o||{};this.mp=!!o.mp;this.gm=o.gm||"normal";this.seed=o.seed;this.touch=new TouchUI;this.touch.nomark=this.gm==="nightmare";this.exit=null;this.new_game()}
  new_game(){if(this.monsters)this.stopLoops();if(this.mp)R=mulberry(this.seed||1);const L=this.level=new Level();L.nosafe=this.gm==="nightmare";
    const npl=this.mp?cl(NET.players.size+1,1,4):1,gmf=(this.gm==="nightmare"?1.35:1)*(1+.05*(npl-1));this.mps=MP.map(P=>({...P,sp:P.sp*gmf,pat:P.pat*gmf}));const p=this.player={};this.reset_player();
    this.monsters=[0,1,2].map(t=>{const mf=pick([0,0,1]);return new Monster(L.far_cell(L.start,26,mf),mf,t)});
    const bo=rnd(75,140);R=Math.random;this.maxl=this.gm==="nightmare"?1:LIVES;this.lives=this.maxl;this.mpm=0;this.imm=0;this.spec=null;this.specI=0;this.sniff_t=rnd(10,15);this.push_t=0;this.labels=[];this.keys=0;this.has_code=false;this.killer=0;this.bo_at=bo;this.bo_done=false;this.mode="play";this.t=this.play_time=0;this.msg="";this.msg_t=0;
    this.ui_stand=null;this.pad="";this.pad_msg="";this.shake=0;this.js_t=0;this.fade=1;this.interact=null;this.light=.9;this.fstate="normal";this.ft=rnd(2,6);this.ftick=0;this._tm=null;
    this.inv={};this.slot=0;this.marks=[];this.markN=0;this.fx=[];this.wires=[];this.wid=0;this.siren=0;this.siren_on=false;this.sirenT=0;this.sirenMine=false;this.gate_open=false;this.parts={gear:0,fuel:0};
    this.lift_on=false;this.lift_ready=false;this.lift_t=0;this.lift_c=0;this.lift_mine=false;this.hold=0;this.hum_t=0;this.wrong=0;this.ca=false;this.cb=false;
    this.dir_t=rnd(60,90);this.raid=null;this.flash_t=0;this.strobe=0;this.sane=1;this.sane_c=0;this.lit=true;this.fear=false;this.ghost=null;this.ghost_t=rnd(8,14);this.step_t=rnd(6,12);this.say_t=0;this.sayI=0;
    this.grab(true);this.notify(SCN[L.sc],7);this.stopLoops()}
  reset_player(keepTorch){const L=this.level,p=this.player,tor=p.torch;Object.assign(p,{x:L.start[0],y:L.start[1],angle:L.start_angle,stamina:1,exhausted:false,sprinting:false,moving:false,
    hidden:false,hide_tile:null,hide_dir:0,hide_exit:[L.start[0],L.start[1]],look_off:0,cam:[L.start[0],L.start[1]],torch:!!keepTorch&&tor,bob_t:0,hide_cd:0,floor:0,z:0,vz:0,dash_t:0,dash_cd:0,adr:0,stim:0,shadow:0,trapped:0})}
  grab(on){on?lock():unlockMouse()}
  notify(t,d){this.msg=t;this.msg_t=d||3}
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
  update_light(dt){this.ft-=dt;if(!this.bo_done&&this.play_time>=this.bo_at){this.bo_done=true;this.fstate="long";this.ft=rnd(100,140);this.light=.03;this.notify("Свет погас...",4)}
    if(this.fstate==="normal"){this.light=.92;if(this.ft<=0){this.fstate=pick(["burst","burst","blackout"]);this.ft=this.fstate==="burst"?rnd(.5,1.6):rnd(.4,1.2)}}
    else if(this.fstate==="burst"){this.ftick-=dt;if(this.ftick<=0){this.ftick=rnd(.03,.1);this.light=pick([.05,.95,.3,.9,.1,.7])}if(this.ft<=0){this.fstate="normal";this.ft=rnd(3,10)}}
    else{this.light=.03;if(this.ft<=0){if(this.fstate==="long"){this.fstate="burst";this.ft=rnd(1.2,2);this.notify("Свет вернулся.",4)}else{this.fstate="normal";this.ft=rnd(3,10)}}}}
  kill(m){if(this.mode==="jumpscare"||this.mode==="spec"||this.mode==="win"||this.imm>0||this.mpm)return;this.killer=m?m.type:0;this.lives--;this.mode="jumpscare";this.js_t=0;this.ui_stand=null;this.stopLoops();
    const sn=SND["scream_"+["","boiled","locust"][this.killer]]||SND.scream;if(sn)CH.scream.play(sn,0,1,1)}
  respawn(){const L=this.level;this.reset_player(true);this.sane=Math.max(this.sane,.6);if(this.mp)this.imm=4;else this.monsters.forEach(m=>{const mf=pick([0,0,1]);m.reposition(L.far_cell(L.start,26,mf),mf)});
    this.mode="play";this.fade=1;this.notify("Ты очнулся у лифта. Ключи и найденное остались с тобой.",4)}
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
    {const gd=L.floors[p.floor].grid;for(const[x,y]of L.doors[p.floor]){if(gd[y][x]!==6)continue;const dx=x+.5-p.x,dy=y+.5-p.y,d=hyp(dx,dy);
      if(d<1.7&&d>.8&&Math.abs(angD(Math.atan2(dy,dx),p.angle))<.6)return{k:"door",o:[x,y]}}}
    const[dist,t,,,mx,my]=this.cast(p.x,p.y,Math.cos(p.angle),Math.sin(p.angle));
    if(dist<1.6){if(t===2)return{k:"hide",o:[mx,my]};if(t===4)return{k:"gate"};if(t===5)return{k:"lift"};if(t===3)return{k:"door",o:[mx,my]};if(t===8)return{k:"panel",o:[mx,my]}}return null}
  do_interact(){const it=this.interact,p=this.player;if(!it)return;const k=it.k;
    if(k==="unhide"){if(p.hide_cd<=0){p.hidden=false;p.x=p.hide_exit[0];p.y=p.hide_exit[1];p.angle=p.hide_dir;p.hide_cd=.4}}
    else if(k==="hide"&&p.hide_cd<=0){const[mx,my]=it.o,cx=mx+.5,cy=my+.5,vx=p.x-cx,vy=p.y-cy;let dx,dy;
      if(Math.abs(vx)>Math.abs(vy)){dx=vx>0?1:-1;dy=0}else{dx=0;dy=vy>0?1:-1}
      p.hidden=true;p.hide_tile=[mx,my];p.hide_dir=Math.atan2(dy,dx);p.hide_exit=[cx+dx,cy+dy];p.look_off=0;p.angle=p.hide_dir;p.x=cx;p.y=cy;
      p.cam=[cx+dx*.44,cy+dy*.44];p.hide_cd=.5;blip("hide",.5,0);if(this.mp&&!NET.host)NET.event({type:"hide",x:cx,y:cy,f:p.floor});this.monsters.forEach(m=>{
      if(m.state===CHASE&&m.seen&&hyp(m.x-cx,m.y-cy)<6.5){m.alert([cx,cy]);m.lurk=5.6}})}
    else if(k==="stand"){this.ui_stand=it.o;this.mode="drawers";this.grab(false)}
    else if(k==="gate"){const L=this.level;
      if(this.gate_open)this.win();
      else if(this.siren_on)this.notify("Механизм ворот работает: ещё "+Math.ceil(this.siren)+" с.",2);
      else if(L.sc===1)this.notify("Ворота намертво заперты. Выход — лифт у старта.",3);
      else if(this.keys<KEYS)this.notify("Ворота заперты. Нужно ключей: "+KEYS+" (у тебя "+this.keys+").",3);
      else if(L.sc===0&&L.pon.size<3)this.notify("Нет питания. Включено рубильников: "+L.pon.size+"/3.",3);
      else{this.mode="keypad";this.pad="";this.pad_msg="";this.grab(false)}}
    else if(k==="lift")this.use_lift();
    else if(k==="door")this.door_toggle(it.o[0],it.o[1]);
    else if(k==="panel")this.notify(this.level.pon.has(p.floor+":"+it.o[0]+":"+it.o[1])?"Рубильник уже включён.":"Держи [E] 3 секунды.",2);
    else if(k==="struggle")p.trapped=Math.max(0,p.trapped-.6);
    else if(k==="free"){NET.event({type:"free",to:it.o.id});it.o.trapped=false;this.notify("Ты освобождаешь "+it.o.n+".",2)}
    else if(k==="stairs")this.use_stairs()}
  use_stairs(){const p=this.player,L=this.level;p.floor=1-p.floor;const[ex,ey,a]=L.stairs_exit[p.floor];p.hidden=false;p.x=ex;p.y=ey;p.angle=a;p.cam=[ex,ey];
    p.moving=p.sprinting=false;this.fade=1;this.interact=null;this.notify(p.floor?"Ты поднялся на 2 этаж.":"Ты спустился на 1 этаж.",2.5)}
  open(i){const n=this.ui_stand;if(!n||n.opened[i])return;n.opened[i]=true;blip("drawer",.8,0);const k=n.drawers[i][0];if(this.mp){const f=this.player.floor,si=this.level.floors[f].stands.indexOf(n);if(si>=0)NET.event({type:"open",f,s:si,i})}
    this.take(k,null,true,n.drawers[i][1])}
  take(k,who,own,txt){if(own&&k!=="junk")blip("pickup",.8,0);const L=this.level,w=who?who+" нашёл":"Ты нашёл";
    if(k==="key"){this.keys++;this.notify(w+" КЛЮЧ ("+this.keys+"/"+KEYS+").",this.keys<KEYS?3:5)}
    else if(k==="code"){this.has_code=true;this.notify(w+" записку с кодом: "+L.code,5)}
    else if(k==="codeA"||k==="codeB"){this[k==="codeA"?"ca":"cb"]=true;this.notify(w+" обрывок кода: "+txt,5)}
    else if(k==="gear"||k==="fuel"){this.parts[k]++;this.notify(w+(k==="gear"?" ШЕСТЕРЁНКУ":" КАНИСТРУ С ТОПЛИВОМ")+" для лифта.",4)}
    else if(ITEMS[k]&&own){this.inv[k]=(this.inv[k]|0)+(k==="flash"?3:1);this.notify("Ты нашёл: "+ITEMS[k].n+". "+ITEMS[k].d,4.5)}}
  close(){this.mode="play";this.ui_stand=null;this.grab(true)}
  win(){this.mode="win";this.stopLoops();blip("win",1,0);this.grab(false);if(this.mp){this.mpm=2;NET.event({type:"win"})}}
  submit(){const L=this.level;
    if(this.pad===L.code){this.mode="play";this.pad="";this.grab(true);this.start_siren(true)}
    else{this.pad="";this.pad_msg="НЕВЕРНЫЙ КОД";this.shake=.6;const gc=L.gate_c;this.noise(gc[0],gc[1],0,99,true);
      if(++this.wrong>=3){this.wrong=0;this.noise(gc[0],gc[1],0,99);this.notify("СИГНАЛИЗАЦИЯ! Все монстры идут к воротам.",4)}}}
  kp(c){if(c==="<")this.pad=this.pad.slice(0,-1);else if(c==="X")this.close();else if(this.pad.length<4){this.pad+=c;this.pad_msg="";if(this.pad.length===4)this.submit()}}
  blocked(x,y){const L=this.level,f=this.player.floor,r=.22;for(const ox of[-r,r])for(const oy of[-r,r])if(L.solid(x+ox,y+oy,f))return true;
    for(const n of L.floors[f].stands)if(hyp(x-n.x,y-n.y)<.55)return true;return hyp(x-L.stairs.x,y-L.stairs.y)<.5}
  update_player(dt){const p=this.player,tc=TOUCH?this.touch:null;
    let turn=(TOUCH?0:cl(mouseDX,-300,300))*.0024+((keys.has("ArrowRight")?1:0)-(keys.has("ArrowLeft")?1:0))*2*dt;mouseDX=0;if(tc)turn+=tc.pop()*.005;
    p.hide_cd=Math.max(0,p.hide_cd-dt);p.dash_cd=Math.max(0,p.dash_cd-dt);if(p.z>0||p.vz>0){p.vz-=7*dt;p.z+=p.vz*dt;if(p.z<=0){p.z=0;p.vz=0}}
    if(p.hidden){p.look_off=cl(p.look_off+turn,-.45,.45);p.angle=p.hide_dir+p.look_off;p.sprinting=p.moving=false;p.stamina=Math.min(1,p.stamina+.25*dt);return}
    p.angle+=turn;if(this.mode!=="play"){p.moving=p.sprinting=false;return}
    if(p.trapped>0){p.moving=p.sprinting=false;p.cam=[p.x,p.y];return}
    const fx=Math.cos(p.angle),fy=Math.sin(p.angle),rx=-fy,ry=fx,k=c=>keys.has(c)?1:0;
    let mv=(k("KeyW")||k("ArrowUp"))-(k("KeyS")||k("ArrowDown")),st=k("KeyD")-k("KeyA");if(tc){mv-=tc.move[1];st+=tc.move[0]}
    const vx=fx*mv+rx*st,vy=fy*mv+ry*st,n=hyp(vx,vy);p.moving=n>0;
    const want=(k("ShiftLeft")||k("ShiftRight")||(tc&&tc.sprint))&&p.moving;if(tc&&p.exhausted)tc.sprint=false;if(p.exhausted&&p.stamina>.3)p.exhausted=false;
    p.sprinting=!!(want&&!p.exhausted&&p.stamina>0);
    if(p.sprinting){if(!(p.adr>0))p.stamina-=.26*dt;if(p.stamina<=0){p.stamina=0;p.exhausted=true}}else p.stamina=Math.min(1,p.stamina+.16*dt);
    if(p.dash_t>0){p.dash_t-=dt;const ds=9*dt,dx=fx*ds,dy=fy*ds;if(!this.blocked(p.x+dx,p.y))p.x+=dx;if(!this.blocked(p.x,p.y+dy))p.y+=dy;p.moving=true}
    else if(n>0){const sp=(p.sprinting?3.9:2.3)*(p.stim>0?1.2:1)*dt,dx=vx/n*sp,dy=vy/n*sp;if(!this.blocked(p.x+dx,p.y))p.x+=dx;if(!this.blocked(p.x,p.y+dy))p.y+=dy;p.bob_t+=dt*(p.sprinting?11:7)}
    p.cam=[p.x,p.y]}
  update(dt){this.t+=dt;if(this.mode!==this._tm){this.touch.reset();this._tm=this.mode}
    if(this.msg_t>0)this.msg_t-=dt;this.shake=Math.max(0,this.shake-dt);if(this.mode==="pause"&&!this.mp)return;
    if(this.imm>0)this.imm-=dt;const m=this.mode;
    if(["play","drawers","keypad","spec"].includes(m)||(this.mp&&m==="pause")){this.play_time+=dt;this.fade=Math.max(0,this.fade-dt/1.4);m==="spec"?this.update_spec(dt):this.update_player(dt);this.update_light(dt);this.update_extra(dt);
      if(!this.mp)this.monsters.forEach(mo=>mo.update(dt,this));this.update_prox();if(m==="play")this.interact=this.find_interact();this.update_audio()}
    else if(m==="jumpscare"){this.js_t+=dt;if(this.js_t>=JT){CH.scream.stop();if(this.lives>0)this.respawn();else if(this.mp)this.die_mp();else{this.mode="over";this.grab(false)}}}
    if(this.mp)this.mp_update(dt)}
  pause(on){if(on){this.mode="pause";this.grab(false);if(ac&&!this.mp)ac.suspend()}else{this.mode="play";this.grab(true);if(ac)ac.resume()}}
  act(a){if(a==="resume")this.pause(false);else if(a==="restart")this.new_game();else if(a==="menu")this.exit="menu"}
  key(e){const c=e.code,m=this.mode;if(c==="F11"){fs();return}
    if(m==="play"){if(c==="Space")this.jump();else if(c==="ShiftLeft"||c==="ShiftRight")this.dash();if(c==="KeyE")this.do_interact();else if(c==="KeyF")this.toggle_torch();else if(c==="KeyG")this.use("cracker");else if(c==="KeyQ")this.use_sel();else if(c==="KeyZ")this.cycle();else if(c==="KeyM")this.mark();else if(/^(Digit|Numpad)[1-4]$/.test(c))this.say(+c.slice(-1)-1);else if(c==="Escape")this.pause(true)}
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
  touchEv(kind,id,p){if(this.mode!=="play")return;this.touch.feed(kind,id,p);for(const a of this.touch.acts.splice(0)){
    if(a==="e")this.do_interact();else if(a==="f")this.toggle_torch();else if(a==="use")this.use_sel();else if(a==="next")this.cycle();else if(a==="say")this.say(this.sayI=((this.sayI|0)+1)%4);else if(a==="mark")this.mark();else if(a==="pause")this.pause(true)}}
  // ---- мультиплеер
  mark(){const p=this.player;if(this.gm==="nightmare"||this.mode!=="play"||p.hidden||p.trapped>0)return;
    const near=this.marks.findIndex(m=>m.f===p.floor&&hyp(m.x-p.x,m.y-p.y)<1.2);
    if(near>=0){this.marks.splice(near,1);blip("mark",.5,0);this.notify("Метка убрана.",1.5);return}
    if(this.marks.length>=MAXM)this.marks.shift();
    this.marks.push({x:p.x,y:p.y,f:p.floor,n:++this.markN});blip("mark",.7,0);this.notify("Метка #"+this.markN+" поставлена. Встань рядом и нажми ещё раз — уберёшь.",2.5)}
  jump(){const p=this.player;if(this.gm!=="speed"||this.mode!=="play"||p.hidden||p.z>0)return;p.vz=2.2;p.z=.001}
  dash(){const p=this.player;if(this.gm!=="speed"||this.mode!=="play"||p.hidden||p.z<=.02||p.dash_cd>0)return;p.dash_cd=2;p.dash_t=.3;blip("dash",.5,0);if(window.NET)NET.event({type:"dash"})}
  targets(){const p=this.player;if(!this.mp)return[p];const o=[];
    if(["play","drawers","keypad","pause"].includes(this.mode)&&this.imm<=0&&this.mpm===0)o.push({id:NET.id,x:p.x,y:p.y,floor:p.floor,hidden:p.hidden,torch:p.torch,sprinting:p.sprinting,angle:p.angle,shadow:p.shadow>0});
    NET.players.forEach(r=>{if(r.seen&&r.m===0&&!(r.imm>0))o.push({id:r.id,r,x:r.x,y:r.y,floor:r.floor,hidden:r.hidden,torch:r.torch,sprinting:r.sprinting,angle:r.angle,shadow:r.shadow})});return o}
  hit(m,p){if(p.r){p.r.imm=JT+4;NET.event({type:"kill",to:p.id,k:m.type})}else this.kill(m)}
  die_mp(){this.mpm=1;this.mode="spec";this.specI=0;this.spec=null;this.grab(false);const p=this.player;p.hidden=false;p.z=0;p.vz=0;
    NET.event({type:"death"});this.notify("Ты погиб. Наблюдаешь за выжившими.",4)}
  update_spec(dt){const p=this.player,a=[];NET.players.forEach(r=>{if(r.seen&&r.m===0)a.push(r)});a.sort((x,y)=>x.id<y.id?-1:1);
    if(!a.length){this.spec=null;return}this.specI=mod(this.specI,a.length);const r=this.spec=a[this.specI];
    p.x=r.x;p.y=r.y;p.angle=r.angle;p.floor=r.floor;p.torch=r.torch;p.hidden=!!r.hidden;p.cam=[r.x,r.y];p.moving=r.sprinting;p.sprinting=false;p.z=r.z||0}
  snd3d(kind,x,y,f,range,gain){const p=this.player;if(f!==p.floor)return;const dx=x-p.x,dy=y-p.y,d=Math.max(.01,hyp(dx,dy));
    const v=Math.pow(Math.max(0,1-d/range),1.5)*gain*Math.pow(.35,this.level.walls_between(p.x,p.y,x,y,f));blip(kind,v,(-dx*Math.sin(p.angle)+dy*Math.cos(p.angle))/d)}
  mirror_mon(dt){const a=NET.mon;if(!a)return;const k=Math.min(1,dt*10);
    this.monsters.forEach((m,i)=>{const s=a[i];if(!s)return;const x=+s[0],y=+s[1],f=s[2]|0;
      if(f!==m.floor||hyp(x-m.x,y-m.y)>5){m.x=x;m.y=y}else{m.x+=(x-m.x)*k;m.y+=(y-m.y)*k}m.floor=f;m.state=s[3]|0;m.freeze=s[4]|0;m.stun=s[5]|0})}
  host_ai(dt){this.monsters.forEach(m=>m.update(dt,this));
    if(this.gm==="nightmare"){this.sniff_t-=dt;if(this.sniff_t<=0){this.sniff_t=rnd(10,15);const ts=this.targets();
      if(ts.length){const t=pick(ts),m=pick(this.monsters);m.sniff=10;m.sniffId=t.id;m.repath=0;m.goal=null}}}
    this.push_t-=dt;if(this.push_t<=0){this.push_t=.1;NET.pushMon(this.monsters.map(m=>[Math.round(m.x*100)/100,Math.round(m.y*100)/100,m.floor,m.state,m.freeze>0?1:0,m.stun>0?1:0]))}}
  mp_update(dt){const p=this.player,k=Math.min(1,dt*12);
    NET.players.forEach(r=>{if(!r.seen)return;const ox=r.x,oy=r.y;r.x+=(r.tx-r.x)*k;r.y+=(r.ty-r.y)*k;r.z+=(r.tz-r.z)*k;r.angle+=angD(r.ta,r.angle)*k;r.imm=Math.max(0,(r.imm||0)-dt);
      const dd=hyp(r.x-ox,r.y-oy);
      if(r.m===0&&!r.hidden&&r.floor===p.floor&&dd<1){r.sd=(r.sd||0)+dd;if(r.sd>(r.sprinting?1.25:.85)){r.sd=0;this.snd3d("step",r.x,r.y,r.floor,r.sprinting?11:7,r.sprinting?.5:.3)}}});
    if(NET.host)this.host_ai(dt);else this.mirror_mon(dt);
    if(this.gm==="speed"){const e=document.getElementById("wn-timer");if(e){const t=this.play_time;e.textContent=String(Math.floor(t/60)).padStart(2,"0")+":"+(t%60).toFixed(1).padStart(4,"0")}}
    if(NET.inGame){const a=mod(p.angle+Math.PI,2*Math.PI)-Math.PI;
      NET.pushState({x:+p.x.toFixed(2),y:+p.y.toFixed(2),a:+a.toFixed(2),f:p.floor,h:p.hidden?1:0,t:p.torch?1:0,s:p.sprinting?1:0,z:+(p.z||0).toFixed(2),m:this.mpm,q:p.shadow>0?1:0,w:p.trapped>0?1:0})}}
  net_ev(ev){const L=this.level,r=ev.from?NET.players.get(ev.from):null,who=ev.n||"Игрок";
    switch(ev.type){
    case"open":{const fl=L.floors[ev.f],n=fl&&fl.stands[ev.s];if(!n||n.opened[ev.i])break;n.opened[ev.i]=true;const k=n.drawers[ev.i][0];
      this.take(k,who,false,n.drawers[ev.i][1]);
      this.snd3d("open",n.x,n.y,ev.f,14,.5);break}
    case"dash":if(r)this.snd3d("dash",r.x,r.y,r.floor,16,.7);break;
    case"step":if(r)this.snd3d("step",r.x,r.y,r.floor,10,.4);break;
    case"death":if(r)r.m=1;this.notify(who+" погиб",4);playBuf(SND.scream,.12);break;
    case"win":if(r)r.m=2;this.notify(who+" выбрался через ворота!",5);break;
    case"kill":if(ev.to===NET.id)this.kill({type:ev.k|0});break;
    case"cracker":this.fx.push({x:ev.x,y:ev.y,f:ev.f,t:3,mine:false});break;
    case"wire":this.wires.push({x:ev.x,y:ev.y,f:ev.f,id:ev.id});break;
    case"wirehit":this.wires=this.wires.filter(w=>w.id!==ev.id);this.snd3d("open",ev.x,ev.y,ev.f,24,1);break;
    case"flash":if(NET.host)this.flash_apply(ev.x,ev.y,ev.a,ev.f);if(ev.f===this.player.floor)this.flash_t=Math.max(this.flash_t,.25);break;
    case"noise":if(NET.host)this.noise_local(ev.x,ev.y,ev.f,ev.r,ev.one);break;
    case"door":this.door_set(ev.f,ev.x,ev.y,ev.v,false);this.snd3d("open",ev.x+.5,ev.y+.5,ev.f,16,.6);break;
    case"bash":this.snd3d("step",ev.x+.5,ev.y+.5,ev.f,22,1.4);break;
    case"panel":{const key=ev.f+":"+ev.x+":"+ev.y;if(!L.pon.has(key)){L.pon.add(key);this.notify(who+" включил рубильник ("+L.pon.size+"/3)",4);this.snd3d("open",ev.x+.5,ev.y+.5,ev.f,20,.8)}break}
    case"haz":{const h=L.floors[ev.f].haz[ev.i];if(h){if(h.t==="b")h.sprung=true;else h.cd=8;this.snd3d("open",h.x,h.y,ev.f,22,1)}break}
    case"siren":this.start_siren(false);break;
    case"lift":this.start_lift(false);break;
    case"fuse":this.fix_light(false);break;
    case"free":if(ev.to===NET.id){this.player.trapped=0;this.notify(who+" освободил тебя.",3)}break;
    case"raid":this.notify("ОБЛАВА: монстры стягиваются на "+(ev.f+1)+" этаж!",5);break;
    case"short":this.strobe=12;this.notify("Короткое замыкание!",3);break;
    case"say":if(r&&ev.i>=0&&ev.i<4){const p=this.player,dx=r.x-p.x,dy=r.y-p.y,rel=angD(Math.atan2(dy,dx),p.angle),same=r.floor===p.floor,
        ar=!same?"":Math.abs(rel)<.6?"↑":Math.abs(rel)>2.2?"↓":rel>0?"→":"←";
      this.notify(who+": "+PH[ev.i]+" "+ar+(same?" "+Math.round(hyp(dx,dy))+" м":" (этаж "+(r.floor+1)+")"),4);blip("open",.4,cl(Math.sin(rel),-1,1))}break;
    case"hide":if(NET.host)this.monsters.forEach(m=>{if(m.floor===ev.f&&m.state===CHASE&&hyp(m.x-ev.x,m.y-ev.y)<6.5){m.alert([ev.x,ev.y]);m.lurk=5.6}});break}}
  // ---- предметы, события, сценарии
  avail(){return USE.filter(k=>(this.inv[k]|0)>0)}
  cycle(){const a=this.avail();if(a.length)this.slot=mod(this.slot+1,a.length)}
  use_sel(){const a=this.avail();if(a.length)this.use(a[mod(this.slot,a.length)])}
  toggle_torch(){const p=this.player;if(!p.hidden&&!(p.shadow>0))p.torch=!p.torch}
  use(k){const p=this.player,L=this.level,a=p.angle,f=p.floor;if(this.mode!=="play"||p.hidden||p.trapped>0||!((this.inv[k]|0)>0))return;
    if(k==="cracker"){let d=0;while(d<6&&!L.solid(p.x+Math.cos(a)*(d+.4),p.y+Math.sin(a)*(d+.4),f))d+=.3;
      const x=p.x+Math.cos(a)*d,y=p.y+Math.sin(a)*d;this.fx.push({x,y,f,t:3,mine:true});if(this.mp)NET.event({type:"cracker",x:+x.toFixed(2),y:+y.toFixed(2),f});this.notify("Петарда брошена. 3 секунды...",2)}
    else if(k==="adren"){p.adr=8;p.stamina=1;p.exhausted=false;this.notify("Адреналин! 8 секунд без усталости.",3)}
    else if(k==="stim"){p.stim=30;this.notify("Стимулятор: быстрее, но сердце колотится.",3)}
    else if(k==="shadow"){p.shadow=15;p.torch=false;this.notify("Тень: монстры почти не видят тебя. Фонарь не работает.",3)}
    else if(k==="flash"){this.flash_t=.45;if(this.mp)NET.event({type:"flash",x:+p.x.toFixed(2),y:+p.y.toFixed(2),a:+a.toFixed(2),f});if(!this.mp||NET.host)this.flash_apply(p.x,p.y,a,f);
      this.notify("Вспышка! Осталось зарядов: "+(this.inv.flash-1),2)}
    else if(k==="wire"){const w={x:+p.x.toFixed(2),y:+p.y.toFixed(2),f,id:(this.mp?NET.id:"s")+"_"+(++this.wid)};this.wires.push(w);if(this.mp)NET.event({type:"wire",...w});this.notify("Растяжка установлена.",2)}
    this.inv[k]--}
  flash_apply(x,y,a,f){let hit=0;this.monsters.forEach(m=>{if(m.floor!==f)return;const dx=m.x-x,dy=m.y-y,d=hyp(dx,dy);
      if(d<9&&Math.abs(angD(Math.atan2(dy,dx),a))<.6&&this.level.los(x,y,m.x,m.y,f)){m.stun=4;m.lurk=0;hit++}});if(hit&&this.mode==="play")this.notify("Монстр ослеплён на 4 секунды!",2.5)}
  noise(x,y,f,rad,one){if(this.mp&&!NET.host){NET.event({type:"noise",x:+x.toFixed(2),y:+y.toFixed(2),f,r:rad,one:one?1:0});return}this.noise_local(x,y,f,rad,one)}
  noise_local(x,y,f,rad,one){let a=this.monsters.filter(m=>m.floor===f&&hyp(m.x-x,m.y-y)<=rad);if(one){a.sort((u,v)=>hyp(u.x-x,u.y-y)-hyp(v.x-x,v.y-y));a=a.slice(0,1)}a.forEach(m=>m.alert([x,y]))}
  rage_fx(m){this.snd3d("dash",m.x,m.y,m.floor,18,.9)}
  door_set(f,x,y,v,send){const g=this.level.floors[f].grid;if(g[y][x]!==3&&g[y][x]!==6&&g[y][x]!==7)return;g[y][x]=v;if(send&&this.mp)NET.event({type:"door",f,x,y,v})}
  door_toggle(x,y){const p=this.player,f=p.floor,v=this.level.floors[f].grid[y][x];
    if(v===3){this.door_set(f,x,y,6,true);blip("door_open",.7,0)}
    else if(v===6){if(hyp(p.x-x-.5,p.y-y-.5)<.9||this.monsters.some(m=>m.floor===f&&hyp(m.x-x-.5,m.y-y-.5)<1)){this.notify("Что-то мешает закрыть дверь.",2);return}this.door_set(f,x,y,3,true);blip("door_close",.9,0)}}
  door_bash(m,nx){this.snd3d("step",nx[0]+.5,nx[1]+.5,m.floor,22,1.4);if(this.mp)NET.event({type:"bash",x:nx[0],y:nx[1],f:m.floor})}
  door_break(f,nx){this.door_set(f,nx[0],nx[1],7,true);this.snd3d("boom",nx[0]+.5,nx[1]+.5,f,26,1.2)}
  panel_on(f,x,y){const L=this.level;L.pon.add(f+":"+x+":"+y);this.notify("Рубильник включён ("+L.pon.size+"/3). Он гудит — монстры услышат!",4);blip("open",1,0);
    this.noise(x+.5,y+.5,f,999,true);if(this.mp)NET.event({type:"panel",f,x,y})}
  start_siren(mine){if(this.siren_on||this.gate_open)return;this.siren_on=true;this.siren=Math.round((this.level.sc===2?20:15)*(this.gm==="nightmare"?.7:1));this.sirenT=0;this.sirenMine=mine;
    this.notify("Код верный! Механизм ворот запущен — сирена привлекает монстров!",5);if(mine&&this.mp)NET.event({type:"siren"})}
  start_lift(mine){if(this.lift_on||this.lift_ready)return;this.lift_on=true;this.lift_t=15;this.lift_c=0;this.lift_mine=mine;this.notify("Лифт запущен! Продержись 15 секунд — он скрипит на весь этаж.",5);if(mine&&this.mp)NET.event({type:"lift"})}
  fix_light(mine){this.fstate="burst";this.ft=rnd(1.2,2);this.light=.9;this.bo_done=true;this.notify("Предохранитель на месте — свет вернулся!",4);if(mine&&this.mp)NET.event({type:"fuse"})}
  use_lift(){const L=this.level;
    if(this.fstate==="long"&&(this.inv.fuse|0)>0){this.inv.fuse--;this.fix_light(true);return}
    if(L.sc!==1){this.notify(this.fstate==="long"?"Щиток у лифта обесточен. Нужен предохранитель.":"Лифт не работает.",3);return}
    if(this.lift_ready){this.win();return}
    if(this.lift_on){this.notify("Лифт гудит. Ещё "+Math.ceil(this.lift_t)+" с.",2);return}
    const g=this.parts.gear,fu=this.parts.fuel;if(g<2||fu<1){this.notify("Лифту нужны: шестерёнки "+g+"/2, топливо "+fu+"/1.",4);return}
    this.start_lift(true)}
  say(i){if(!this.mp||this.mode!=="play"||this.say_t>0||!NET.inGame||i<0||i>3)return;this.say_t=2;NET.event({type:"say",i});this.notify("Ты: "+PH[i],2)}
  director(){if(pick([0,1])){const ts=this.targets(),cnt=[0,0];ts.forEach(t=>{if(t.floor>=0)cnt[t.floor]++});
      const f=cnt[0]===cnt[1]?pick([0,1]):cnt[1]>cnt[0]?1:0;this.raid={f,t:20,k:0};this.notify("ОБЛАВА: монстры стягиваются на "+(f+1)+" этаж!",5);if(this.mp)NET.event({type:"raid",f})}
    else{this.strobe=12;this.notify("Короткое замыкание!",3);if(this.mp)NET.event({type:"short"})}}
  update_extra(dt){const p=this.player,L=this.level,f=p.floor,host=!this.mp||NET.host,alive=this.mode!=="spec";
    if(alive){p.adr=Math.max(0,p.adr-dt);p.stim=Math.max(0,p.stim-dt);p.shadow=Math.max(0,p.shadow-dt);p.trapped=Math.max(0,p.trapped-dt)}
    this.flash_t=Math.max(0,this.flash_t-dt);this.strobe=Math.max(0,this.strobe-dt);this.say_t=Math.max(0,this.say_t-dt);
    if(this.strobe>0&&this.fstate!=="long")this.light=Math.sin(this.t*31)>.1?.95:.04;
    for(const c of this.fx){c.t-=dt;if(c.t<=0){c.done=1;this.snd3d("boom",c.x,c.y,c.f,28,1.3);if(c.mine)this.noise(c.x,c.y,c.f,15)}}
    this.fx=this.fx.filter(c=>!c.done);
    if(host){for(const w of this.wires)for(const m of this.monsters)if(!w.done&&m.floor===w.f&&hyp(m.x-w.x,m.y-w.y)<.6){w.done=1;m.slow=5;this.snd3d("open",w.x,w.y,w.f,24,1);
        if(this.mp)NET.event({type:"wirehit",id:w.id,x:w.x,y:w.y,f:w.f})}this.wires=this.wires.filter(w=>!w.done)}
    if(alive&&this.mode==="play"&&p.z<.2)L.floors[f].haz.forEach((h,i)=>{if(h.cd>0)h.cd-=dt;if(h.cd>0||h.sprung)return;const d=hyp(p.x-h.x,p.y-h.y);
      if(h.t==="g"&&p.sprinting&&d<.8){h.cd=8;blip("glass",1,0);this.noise(h.x,h.y,f,18);this.notify("Хруст стекла!",1.5);if(this.mp)NET.event({type:"haz",f,i})}
      else if(h.t==="b"&&d<.55){h.sprung=true;p.trapped=2.5;p.sprinting=false;blip("trap",1,0);this.noise(h.x,h.y,f,18);this.notify("КАПКАН! Жми [E], чтобы вырваться.",3);if(this.mp)NET.event({type:"haz",f,i})}});
    const il=this.interact,held=keys.has("KeyE")||(TOUCH&&Object.values(this.touch.bf).includes("e"));
    if(this.mode==="play"&&il&&il.k==="panel"&&!L.pon.has(f+":"+il.o[0]+":"+il.o[1])&&held){this.hold+=dt;if(this.hold>=3){this.hold=0;this.panel_on(f,il.o[0],il.o[1])}}else this.hold=Math.max(0,this.hold-dt*2);
    if(L.pon.size){this.hum_t-=dt;if(this.hum_t<=0){this.hum_t=2.6;for(const k of L.pon){const[pf,x,y]=k.split(":").map(Number);this.snd3d("step",x+.5,y+.5,pf,11,.7)}}}
    if(this.siren_on){this.siren-=dt;this.sirenT-=dt;if(this.sirenT<=0){this.sirenT=3;this.snd3d("siren",L.gate_c[0],L.gate_c[1],0,40,.5);if(this.sirenMine)this.noise(L.gate_c[0],L.gate_c[1],0,45)}
      if(this.siren<=0){this.siren_on=false;this.siren=0;this.gate_open=true;this.notify("Ворота открыты! Беги к ним и жми [E]!",5)}}
    if(this.lift_on){this.lift_t-=dt;this.lift_c-=dt;if(this.lift_c<=0){this.lift_c=2.4;this.snd3d("lift",L.lift[0],L.lift[1],0,40,.9);if(this.lift_mine)this.noise(L.lift[0],L.lift[1],0,40)}
      if(this.lift_t<=0){this.lift_on=false;this.lift_ready=true;this.notify("Лифт готов! Садись — [E] у лифта!",5)}}
    if(host){this.dir_t-=dt;if(this.dir_t<=0&&this.mode==="play"){this.dir_t=rnd(60,90);this.director()}
      if(this.raid){const r=this.raid;r.t-=dt;r.k-=dt;if(r.k<=0){r.k=4;const ts=this.targets().filter(t=>t.floor===r.f);
        for(const m of this.monsters){if(m.floor!==r.f){if(m.state!==CHASE&&!m.cross)m.go_stairs(L)}else if(m.state!==CHASE&&ts.length){const t=pick(ts);m.alert([t.x+rnd(-3.5,3.5),t.y+rnd(-3.5,3.5)])}}}
        if(r.t<=0)this.raid=null}}
    if(alive)this.update_sane(dt)}
  update_sane(dt){const p=this.player,L=this.level,f=p.floor;this.sane_c-=dt;
    if(this.sane_c<=0){this.sane_c=.3;let lamp=L.in_safe(p.x,p.y,f);
      if(!lamp&&this.fstate!=="long")for(const[lx,ly]of L.floors[f].lamps)if(hyp(lx-p.x,ly-p.y)<4.5&&L.los(p.x,p.y,lx,ly,f)){lamp=true;break}
      this.lit=lamp;this.fear=this.monsters.some(m=>m.floor===f&&!(m.stun>0)&&hyp(m.x-p.x,m.y-p.y)<7)}
    let d=this.lit?.05:p.torch?-.004:-.012;if(this.fear)d-=.025;this.sane=cl(this.sane+d*dt,0,1);
    if(this.sane<.5){this.step_t-=dt;if(this.step_t<=0){this.step_t=rnd(5,11)*(this.sane+.4);blip("step",.6,Math.random()<.5?-.8:.8)}}
    if(this.sane<.3&&!this.ghost){this.ghost_t-=dt;if(this.ghost_t<=0){this.ghost_t=rnd(10,18);this.spawn_ghost()}}
    if(this.ghost){const g=this.ghost;g.t-=dt;const d2=hyp(g.x-p.x,g.y-p.y);
      if(g.t<=0||g.f!==f||d2<3.5||(p.torch&&d2<12&&Math.abs(angD(Math.atan2(g.y-p.y,g.x-p.x),p.angle))<.35))this.ghost=null}}
  spawn_ghost(){const p=this.player,L=this.level;for(let k=0;k<8;k++){const a=p.angle+rnd(-.5,.5),d=rnd(5.5,8),x=p.x+Math.cos(a)*d,y=p.y+Math.sin(a)*d;
      if(!L.solid(x,y,p.floor)&&L.los(p.x,p.y,x,y,p.floor)){this.ghost={x,y,f:p.floor,t:2.2,type:0};return}}}
  wob(){const p=this.player;return(this.sane<.5?Math.sin(this.t*1.9)*.035*(1-this.sane*2):0)+(p.stim>0?Math.sin(this.t*23)*.008:0)}
  // ---- рендер мира
  render_world(){const p=this.player,L=this.level,[cx,cy]=p.cam,ang=p.angle+this.wob(),bob=p.moving&&!p.hidden?Math.trunc(Math.sin(p.bob_t)*2):0,hor=(RH>>1)+bob,bg=BGS[p.torch?1:0];
    for(let y=0;y<RH;y++)buf.fill(bg[y+4-bob],y*RW,(y+1)*RW);
    const R=p.torch?11:7,fd=p.floor?.8:1,dx_=Math.cos(ang),dy_=Math.sin(ang),plx=-dy_*K,ply=dx_*K;zb.fill(99);const pz=p.z||0;this.labels=[];
    if(TEX.floor){const FT=TEX.floor;for(let y=hor+1;y<RH;y++){const dy=y-hor,bv=bg[y+4-bob];if(!(bv>=1))continue;const d=PROJ*.5/dy,
      rx0=cx+(dx_-plx)*d,ry0=cy+(dy_-ply)*d,sx=2*plx*d/RW,sy=2*ply*d/RW;
      for(let c=0;c<RW;c++){const fx=rx0+sx*c,fy=ry0+sy*c;buf[y*RW+c]=bv*FT[(((fy*.5*TS)|0)&(TS-1))*TS+(((fx*.5*TS)|0)&(TS-1))]}}}
    const vl=(c,top,h,v)=>{const a=Math.max(0,top),b=Math.min(RH,top+h);for(let y=a;y<b;y++)buf[y*RW+c]=v};
    for(let c=0;c<RW;c++){const cm=2*c/RW-1,[perp,t,wx,side,mx,my]=this.cast(cx,cy,dx_+plx*cm,dy_+ply*cm);zb[c]=perp;const f=1-perp/R;if(f<=0)continue;
      const g=255*Math.pow(f,1.25)*(side?.78:1)*fd,h=Math.floor(PROJ/Math.max(perp,.05)),top=hor-(h>>1)+(pz?Math.floor(pz*PROJ/Math.max(perp,.05)):0),gg=g*VAR[(mx*31+my*17+Math.floor(wx*12))&255];
      if(t===1&&TEX.wall){const WT=TEX.wall,tu=((wx*TS)|0)&(TS-1),a=Math.max(0,top),b=Math.min(RH,top+h);
        for(let y=a;y<b;y++)buf[y*RW+c]=Math.min(255,gg*WT[((((y-top)*TS/h)|0)&(TS-1))*TS+tu])}
      else if(t===1){vl(c,top,h,Math.min(255,gg));const bh=Math.max(1,Math.floor(h/11)),c2=gg*.42;vl(c,top+h-bh,bh,c2);vl(c,top,Math.max(1,Math.floor(h/28)),c2)}
      else if(t===2){let v=Math.min(255,gg*1.18*(Math.floor(wx*36)&1?.86:1));if(wx>.485&&wx<.515)v=gg*.1;else if(wx<.05||wx>.95)v=gg*.5;vl(c,top,h,v);const c2=gg*.3;
        vl(c,top,Math.max(1,Math.floor(h/14)),c2);const b=Math.max(1,Math.floor(h/10));vl(c,top+h-b,b,c2);
        if((wx>.4&&wx<.44)||(wx>.56&&wx<.6))vl(c,top+Math.floor(h*.46),Math.max(1,Math.floor(h*.12)),Math.min(255,gg*1.7))}
      else if(t===4){vl(c,top,h,(wx*8)%1<.22?Math.min(255,gg):gg*.07);const cr=Math.min(255,gg*.9),b=Math.max(1,Math.floor(h/16));vl(c,top+Math.floor(h*.12),b,cr);vl(c,top+Math.floor(h*.8),b,cr)}
      else if(t===5){let v=Math.min(255,gg*1.1);if(wx>.49&&wx<.51)v=gg*.15;vl(c,top,h,v);if(wx>.45&&wx<.55)vl(c,top+Math.floor(h*.04),Math.max(1,Math.floor(h/22)),255)}
      else if(t===3){let v=Math.min(255,gg*.8*((Math.floor(wx*7)&1)?.82:1));if(wx<.06||wx>.94)v=gg*.35;vl(c,top,h,v);const bb=Math.max(1,Math.floor(h/12));
        vl(c,top+Math.floor(h*.3),bb,gg*.25);vl(c,top+Math.floor(h*.7),bb,gg*.25);if(wx>.78&&wx<.86)vl(c,top+Math.floor(h*.48),Math.max(1,Math.floor(h*.08)),Math.min(255,gg*1.6))}
      else if(t===8){const on=L.pon.has(p.floor+":"+mx+":"+my);vl(c,top,h,Math.min(255,gg*.9));
        if(wx>.18&&wx<.82){vl(c,top+Math.floor(h*.22),Math.floor(h*.5),gg*.35);if(wx>.46&&wx<.54)vl(c,top+Math.floor(h*(on?.26:.4)),Math.floor(h*.16),Math.min(255,gg*1.7));
          if(on&&Math.floor(this.t*6+wx*5)%3===0)vl(c,top+Math.floor(h*.3),Math.max(1,Math.floor(h*.06)),255)}}}
    const eyes=[],light=this.light;
    for(const[lx,ly]of L.floors[p.floor].lamps){const sx=lx-cx,sy=ly-cy,d=sx*dx_+sy*dy_;if(d<.3||d>14)continue;const lat=-sx*dy_+sy*dx_,scx=RW/2*(1+lat/(d*K)),
      wl=Math.max(2,Math.floor(PROJ*.55/d)),hl=Math.max(1,Math.floor(PROJ*.14/d)),ys=hor-Math.floor(PROJ*(.5-pz)/d),v=Math.min(255,255*light*Math.min(1,1.4-d/12));if(v<=4)continue;
      const x0=Math.floor(scx-wl/2);for(let c=Math.max(0,x0);c<Math.min(RW,x0+wl);c++)if(d<zb[c])vl(c,ys,hl,v)}
    const items=L.floors[p.floor].stands.map(n=>[(n.x-cx)*dx_+(n.y-cy)*dy_,"stand",n]);const st=L.stairs;items.push([(st.x-cx)*dx_+(st.y-cy)*dy_,"stairs",st]);
    for(const m of this.monsters)if(m.floor===p.floor)items.push([(m.x-cx)*dx_+(m.y-cy)*dy_,"mon",m]);
    {const FL=L.floors[p.floor];
      for(const[x,y]of L.doors[p.floor])if(FL.grid[y][x]===6)items.push([(x+.5-cx)*dx_+(y+.5-cy)*dy_,"door",{x:x+.5,y:y+.5}]);
      for(const h of FL.haz)items.push([(h.x-cx)*dx_+(h.y-cy)*dy_,h.t==="b"?"trap":"glass",h]);
      for(const w of this.wires)if(w.f===p.floor)items.push([(w.x-cx)*dx_+(w.y-cy)*dy_,"wire",w]);for(const mk of this.marks)if(mk.f===p.floor)items.push([(mk.x-cx)*dx_+(mk.y-cy)*dy_,"mark",mk]);
      const gh=this.ghost;if(gh&&gh.f===p.floor)items.push([(gh.x-cx)*dx_+(gh.y-cy)*dy_,"ghost",gh])}
    if(this.mp)NET.players.forEach(r=>{if(r.seen&&r.m===0&&!r.hidden&&r.floor===p.floor&&r!==this.spec)items.push([(r.x-cx)*dx_+(r.y-cy)*dy_,"ply",r])});items.sort((a,b)=>b[0]-a[0]);
    for(const[d,k,o]of items){if(d<.2||d>16||(k==="trap"&&d>3.4))continue;const lat=-(o.x-cx)*dy_+(o.y-cy)*dx_,scx=RW/2*(1+lat/(d*K));
      const[wu,hu,sp]=DECAL[k]||(k==="stand"?[.5,.36,SPR_STAND]:k==="stairs"?[.62,.92,SPR_STAIRS[p.floor]]:k==="ply"?[SPR_PLY.wu,SPR_PLY.hu,SPR_PLY]:[SPR_MONS[o.type].wu,SPR_MONS[o.type].hu,SPR_MONS[o.type]]);
      const sw=Math.floor(PROJ*wu/d),sh=Math.floor(PROJ*hu/d);if(sw<1||sh<1||sh>900)continue;
      const bot=hor+Math.floor(PROJ*(.5+pz-(k==="ply"?o.z:0))/d),top=bot-sh,x0=Math.floor(scx-sw/2),c0=Math.max(0,x0),c1=Math.min(RW,x0+sw);if(c0>=c1)continue;
      if((k==="mon"||k==="ghost")&&sp.ey&&!(o.freeze>0)&&!(o.stun>0)&&scx>=0&&scx<RW&&d<zb[Math.floor(scx)])eyes.push([scx,top+sh*sp.ey,sw,sh,d]);
      let br=k==="mon"||k==="ghost"?1:Math.floor(255*Math.pow(Math.max(0,1-d/R),1.25)*.9)/255;if(k==="trap")br*=.5;if(k==="mark"){br=Math.min(1,br+.55);if(scx>=0&&scx<RW&&d<zb[Math.floor(scx)])this.labels.push([scx*W/RW,top*H/RH-12,"#"+o.n,Math.min(d,6)])}
      if(k==="ply"){if(o.torch)br=Math.max(br,.75*Math.max(0,1-d/12));br=Math.min(1,br+.1);if(scx>=0&&scx<RW&&d<zb[Math.floor(scx)]&&d<13)this.labels.push([scx*W/RW,top*H/RH-14,o.n,d])}
      for(let c=c0;c<c1;c++){if(d>=zb[c])continue;const u=Math.floor((c-x0)*sp.w/sw);
        for(let y=Math.max(0,top);y<Math.min(RH,top+sh);y++){const i=Math.floor((y-top)*sp.h/sh)*sp.w+u,a=sp.al[i];if(!a)continue;const v=sp.gy[i]*br,j=y*RW+c;buf[j]=a===255?v:buf[j]*(1-a/255)+v*a/255}}}
    if(p.hidden){buf.fill(0,0,Math.floor(RH*.3)*RW);buf.fill(0,Math.floor(RH*.7)*RW);for(let x=0;x<RW;x+=7)for(let y=0;y<RH;y++){buf[y*RW+x]=0;if(x+1<RW)buf[y*RW+x+1]=0}}
    let dm=1-Math.floor(Math.max(0,1-light)*225)/255*(1-light>.02?1:0);if(this.fstate==="long")dm=p.torch?.5:.14;
    for(let i=0;i<buf.length;i++)buf[i]*=dm*VIG[i];
    for(const[scx,ey,sw,sh,d]of eyes){const rr=Math.max(1,Math.floor(sh*.011)),v=Math.max(150,255-d*7|0);
      for(const s of[-1,1]){const ex=Math.floor(scx+s*sw*.1),ee=Math.floor(ey);for(let yy=-rr;yy<=rr;yy++)for(let xx=-rr;xx<=rr;xx++)
        if(xx*xx+yy*yy<=rr*rr&&ex+xx>=0&&ex+xx<RW&&ee+yy>=0&&ee+yy<RH)buf[(ee+yy)*RW+ex+xx]=v}}
    const gi=ri(0,7),g1=GRAIN[gi],m0=this.monsters[0],near=m0.floor===p.floor?hyp(m0.x-p.x,m0.y-p.y):99;for(let i=0;i<buf.length;i++)buf[i]+=g1[i];
    if(near<7||this.sane<.4){const g2=GRAIN[(gi+3)%8];for(let i=0;i<buf.length;i++)buf[i]+=g2[i]}
    for(let i=0;i<buf.length;i++){const v=buf[i];u32[i]=0xFF000000|(v<<16)|(v<<8)|v}wctx.putImageData(wimg,0,0)}
  // ---- интерфейс
  btns(){let s,y0;if(this.mode==="pause"){s=[["ПРОДОЛЖИТЬ","resume"],["В МЕНЮ","menu"]];y0=H/2+120}else if(this.mode==="over"){s=[["ЗАНОВО","restart"],["В МЕНЮ","menu"]];y0=H/2+150}
    else{s=[["В МЕНЮ","menu"]];y0=H/2+200}return s.map(([l,a],i)=>[l,a,rc(W/2,y0+i*80,380,64)])}
  btn(l,r){box(r,"#161616","#d2d2d2",2);T(l,F(32,1),r.x+r.w/2,r.y+r.h/2,0,1)}
  panel(){return rect(W/2-230,H/2-260,460,520)}
  dr(){const px=W/2-230,py=H/2-260;return[rect(px+30,py+90,400,180),rect(px+30,py+290,400,180)]}
  closeR(){const p=this.panel();return rect(p.x+p.w-56,p.y+14,44,40)}
  padKeys(){const pn=rc(W/2,H/2,520,610),x0=pn.x+pn.w/2-Math.floor((3*130+28)/2),y0=pn.y+225,ks=[];
    [..."123456789<0X"].forEach((l,i)=>ks.push([l,rect(x0+(i%3)*144,y0+Math.floor(i/3)*80,130,66)]));return[pn,ks]}
  hud(){const p=this.player,L=this.level;for(let i=0;i<this.maxl;i++)heart(40+i*42,38,30,i<this.lives?"#ebebeb":"#373737");T("ЭТАЖ "+(p.floor+1),F(22),30,66,"#c8c8c8");
    ctx.fillStyle="#1e1e1e";ctx.fillRect(30,H-36,180,8);ctx.fillStyle=p.exhausted?"#787878":"#dcdcdc";ctx.fillRect(30,H-36,180*p.stamina,8);
    const it=[];
    if(L.sc===1){it.push("ШЕСТЕРЁНКИ: "+this.parts.gear+"/2");it.push("ТОПЛИВО: "+this.parts.fuel+"/1")}
    else{it.push("КЛЮЧИ: "+this.keys+"/"+KEYS);
      if(L.sc===0){if(this.has_code)it.push("КОД: "+L.code);it.push("РУБИЛЬНИКИ: "+L.pon.size+"/3")}
      else it.push("КОД: "+[0,1,2,3].map(i=>(i%2?this.cb:this.ca)?L.code[i]:"_").join(""))}
    if(this.siren_on)it.push("ВОРОТА: "+Math.ceil(this.siren)+" с");else if(this.gate_open)it.push("ВОРОТА ОТКРЫТЫ");else if(this.lift_on)it.push("ЛИФТ: "+Math.ceil(this.lift_t)+" с");else if(this.lift_ready)it.push("ЛИФТ ГОТОВ");
    it.forEach((s,i)=>{ctx.font=F(22);const w=ctx.measureText(s).width,r=rect(W-30-w-7,24+i*30-3,w+14,32);box(r,"#000","#c8c8c8",1);T(s,F(22),W-30-w,24+i*30,"#f0f0f0")});
    if(p.torch)T("[F] фонарь",F(22),30,H-66,"#c8c8c8");if(this.gm!=="nightmare"&&!TOUCH&&this.mode!=="spec")T("[M] метка "+this.marks.length+"/"+MAXM,F(18),30,H-124,"#9a9a9a");
    {const av=this.avail();let iy=96;
      if((this.inv.fuse|0)>0){T("предохранитель x"+this.inv.fuse,F(18),30,iy,"#c8c8c8");iy+=22}
      av.forEach((k,i)=>{const on=i===mod(this.slot,av.length);T((on?"> ":"  ")+ITEMS[k].n.toLowerCase()+" x"+this.inv[k],F(18),30,iy,on?"#ffffff":"#9a9a9a");iy+=22});
      if(av.length&&!TOUCH)T("[Q] исп.  [Z] сменить  [G] петарда",F(14),30,iy,"#777");
      ctx.fillStyle="#1e1e1e";ctx.fillRect(30,H-24,180,5);ctx.fillStyle=this.sane<.3?"#888":"#bbb";ctx.fillRect(30,H-24,180*this.sane,5);
      const ef=[];if(p.adr>0)ef.push("АДРЕНАЛИН "+Math.ceil(p.adr));if(p.stim>0)ef.push("СТИМУЛЯТОР "+Math.ceil(p.stim));if(p.shadow>0)ef.push("ТЕНЬ "+Math.ceil(p.shadow));
      ef.forEach((s,i)=>T(s,F(18),W-150,H-40-i*22,"#c8c8c8",1));
      if(this.hold>0){ctx.fillStyle="#1e1e1e";ctx.fillRect(W/2-100,H-80,200,8);ctx.fillStyle="#f0f0f0";ctx.fillRect(W/2-100,H-80,200*this.hold/3,8)}}
    if(this.mode==="play"&&this.interact){let tip={unhide:"[E] Выйти из шкафа",hide:"[E] Спрятаться",stand:"[E] Открыть тумбочку",gate:"[E] Ворота",lift:"[E] Лифт",
      stairs:p.floor?"[E] Спуститься на 1 этаж":"[E] Подняться на 2 этаж",door:"[E] Дверь",panel:"[E] (держи) Включить рубильник",free:"[E] Освободить тиммейта",struggle:"[E] Вырваться! (жми)"}[this.interact.k];
      if(this.interact.k==="door"){const[dx,dy]=this.interact.o;tip=L.floors[p.floor].grid[dy][dx]===6?"[E] Закрыть дверь":"[E] Открыть дверь"}
      if(this.interact.k==="panel"&&L.pon.has(p.floor+":"+this.interact.o[0]+":"+this.interact.o[1]))tip="Рубильник включён";
      T(tip,F(32,1),W/2,H-110,0,1)}
    if(this.msg_t>0)T(this.msg,F(22),W/2,90,"#ebebeb",1,Math.min(1,this.msg_t));
    if(this.mode==="spec"&&this.spec)T("НАБЛЮДЕНИЕ: "+this.spec.n+"    [E] / клик — следующий    [Esc] — выйти",F(22),W/2,H-40,"#a0a0a0",1);
    if(this.gm==="speed"&&this.mode!=="spec"){ctx.fillStyle="#1e1e1e";ctx.fillRect(30,H-52,180,6);ctx.fillStyle=p.dash_cd>0?"#787878":"#f0f0f0";ctx.fillRect(30,H-52,180*(1-p.dash_cd/2),6);T("РЫВОК: Shift в воздухе",F(16),30,H-92,"#c8c8c8")}
    if(p.hidden&&this.mode!=="spec")T("Ты в шкафу. Тише...  [E] выйти",F(22),W/2,H-40,"#a0a0a0",1);
    if(this.mode==="play"&&!TOUCH&&!locked)T("Кликни по экрану, чтобы управлять мышью",F(22),W/2,H-150,"#a0a0a0",1)}
  draw(){const m=this.mode;
    if(m==="jumpscare"){this.draw_js();return}
    if(m==="spec"&&!this.spec){ctx.fillStyle="#000";ctx.fillRect(0,0,W,H);T("НАБЛЮДАТЬ НЕКОГО",F(72,1),W/2,H/2-100,"#fff",1);this.btns().forEach(([l,,r])=>this.btn(l,r));return}
    if(m==="over"||m==="win"){ctx.fillStyle="#000";ctx.fillRect(0,0,W,H);
      if(m==="over"){T("ТЫ ПОГИБ",F(120,1),W/2,H/2-100,"#fff",1);if(!TOUCH){T("Enter — начать заново",F(32,1),W/2,H/2+40,"#bebebe",1);T("Esc — в меню",F(32,1),W/2,H/2+88,"#bebebe",1)}}
      else{const mi=Math.floor(this.play_time/60),s=Math.floor(this.play_time%60);T("ТЫ СБЕЖАЛ",F(120,1),W/2,H/2-100,"#f0f0f0",1);
        T("Время: "+String(mi).padStart(2,"0")+":"+String(s).padStart(2,"0"),F(32,1),W/2,H/2+40,"#bebebe",1);T("Жизней осталось: "+this.lives,F(32,1),W/2,H/2+88,"#bebebe",1);
        if(!TOUCH)T("Enter — в меню",F(32,1),W/2,H/2+136,"#bebebe",1)}
      this.btns().forEach(([l,,r])=>this.btn(l,r));return}
    this.render_world();ctx.imageSmoothingEnabled=false;ctx.drawImage(world,0,0,W,H);ctx.imageSmoothingEnabled=true;this.draw_labels();this.draw_prox();
    if(this.flash_t>0){ctx.fillStyle=`rgba(255,255,255,${Math.min(1,this.flash_t*3)})`;ctx.fillRect(0,0,W,H)}
    if(this.siren_on||this.lift_on){ctx.fillStyle=`rgba(200,0,0,${.1+.12*Math.max(0,Math.sin(this.t*7))})`;ctx.fillRect(0,0,W,H)}
    if(this.fade>0){ctx.fillStyle=`rgba(0,0,0,${Math.min(1,this.fade)})`;ctx.fillRect(0,0,W,H)}
    this.hud();if(TOUCH&&m==="play")this.touch.draw(!!this.interact);
    if(m==="drawers")this.draw_drawers();else if(m==="keypad")this.draw_keypad();
    else if(m==="pause"){ctx.fillStyle="rgba(0,0,0,.78)";ctx.fillRect(0,0,W,H);T("ПАУЗА",F(120,1),W/2,H/2-70,0,1);
      if(!TOUCH)T("Esc — продолжить     Q — в меню",F(32,1),W/2,H/2+50,"#bebebe",1);this.btns().forEach(([l,,r])=>this.btn(l,r))}}
  draw_labels(){for(const[x,y,n,d]of this.labels||[])T(n,F(22),x,y,"#e6e6e6",1,cl(1.2-d/13,.25,1))}
  draw_prox(){for(const m of this.monsters){if(m.type===0||m.prox<.02)continue;const nz=m.type===1?noiseR:noiseB,col=m.type===1?"200,0,0":"215,190,140";
    ctx.save();ctx.globalCompositeOperation="lighter";ctx.imageSmoothingEnabled=false;ctx.globalAlpha=Math.min(1,m.prox*1.1);ctx.drawImage(nz[ri(0,5)],0,0,W,H);
    const gd=ctx.createRadialGradient(W/2,H/2,H*.25,W/2,H/2,H*.9);gd.addColorStop(0,`rgba(${col},0)`);gd.addColorStop(1,`rgba(${col},${.55*m.prox})`);ctx.globalAlpha=1;ctx.fillStyle=gd;ctx.fillRect(0,0,W,H);ctx.restore()}}
  draw_drawers(){ctx.fillStyle="rgba(0,0,0,.75)";ctx.fillRect(0,0,W,H);const pn=this.panel();box(pn,"#262626","#c8c8c8",3);T("ТУМБОЧКА",F(32,1),W/2,pn.y+44,0,1);
    const cr=this.closeR();box(cr,"#3c3c3c","#d2d2d2",2);T("X",F(22),cr.x+cr.w/2,cr.y+cr.h/2,0,1);const n=this.ui_stand;
    this.dr().forEach((r,i)=>{const op=n.opened[i];box(r,op?"#161616":"#5c5c5c","#d2d2d2",2);const cx=r.x+r.w/2,cy=r.y+r.h/2;
      if(!op){circ(cx,cy,10,"#ebebeb");T(""+(i+1),F(22),r.x+14,r.y+10,"#141414")}
      else{const[k,txt]=n.drawers[i];if(k==="key"){ctx.strokeStyle="#ebebeb";ctx.lineWidth=5;ctx.beginPath();ctx.arc(cx-40,cy,20,0,7);ctx.stroke();ctx.lineWidth=6;ctx.beginPath();
          ctx.moveTo(cx-18,cy);ctx.lineTo(cx+60,cy);ctx.moveTo(cx+40,cy);ctx.lineTo(cx+40,cy+18);ctx.moveTo(cx+58,cy);ctx.lineTo(cx+58,cy+14);ctx.stroke();T("КЛЮЧ",F(22),cx,r.y+r.h-22,0,1)}
        else if(k==="code"||k==="codeA"||k==="codeB"){box(rc(cx,cy,220,110),"#e1e1e1");T("КОД",F(22),cx,cy-33,"#1e1e1e",1);T(txt,F(32,1),cx,cy+13,"#0a0a0a",1)}else if(ITEMS[k]||PARTS[k]){const nm=ITEMS[k]?ITEMS[k].n:PARTS[k][0];T(nm,F(28,1),cx,cy-22,0,1);T(txt,F(16),cx,cy+22,"#c8c8c8",1)}else T(txt,F(22),cx,cy,"#c8c8c8",1)}});
    T(TOUCH?"Коснись ящика, чтобы открыть":"[1] [2] или клик — открыть ящик    [Esc] закрыть",F(22),W/2,pn.y+505,"#bebebe",1)}
  draw_keypad(){ctx.fillStyle="rgba(0,0,0,.78)";ctx.fillRect(0,0,W,H);const ox=this.shake>0?Math.floor(Math.sin(this.t*60)*8):0;ctx.save();ctx.translate(ox,0);
    const[pn,ks]=this.padKeys();box(pn,"#1e1e1e","#d2d2d2",3);T("ВОРОТА — ВВЕДИ КОД",F(32,1),pn.x+pn.w/2,pn.y+42,0,1);
    for(let i=0;i<4;i++){const b=rc(pn.x+pn.w/2+(i-1.5)*100,pn.y+125,80,90);box(b,"#0a0a0a","#e6e6e6",2);if(i<this.pad.length)T(this.pad[i],F(72,1),b.x+b.w/2,b.y+b.h/2,0,1)}
    if(this.pad_msg)T(this.pad_msg,F(32,1),pn.x+pn.w/2,pn.y+196,"#fff",1);
    for(const[l,r]of ks){box(r,"#161616","#c8c8c8",2);T(l==="<"?"<-":l==="X"?"ВЫХОД":l,F(32,1),r.x+r.w/2,r.y+r.h/2,0,1)}
    if(!TOUCH)T("цифры 0-9, Backspace — стереть, Esc — отойти",F(22),pn.x+pn.w/2,pn.y+pn.h-24,"#aaa",1);ctx.restore()}
  draw_js(){ctx.fillStyle="#000";ctx.fillRect(0,0,W,H);const t=this.js_t,JJ=JUMPS[this.killer]||JUMPS[0];
    if(t<JG){const e=1-Math.pow(1-t/JG,3),s=.05+.95*e,w=Math.max(2,W*s),h=Math.max(2,H*s);ctx.drawImage(JJ,(W-w)/2,(H-h)/2,w,h)}else ctx.drawImage(JJ,ri(-9,9),ri(-9,9));
    const a=pick([0,0,0,30,60,110]);if(a){ctx.fillStyle=`rgba(0,0,0,${a/255})`;ctx.fillRect(0,0,W,H)}
    if(t>=JG){const al=Math.min(1,(t-JG)/.5);ctx.fillStyle=`rgba(0,0,0,${al*.62})`;ctx.fillRect(0,H-160,W,150);
      T(this.lives>0?"ОСТАЛОСЬ ЖИЗНЕЙ: "+this.lives:"ЖИЗНЕЙ НЕ ОСТАЛОСЬ",F(72,1),W/2,H-118,"#f5f5f5",1,al);
      const ML=this.maxl;for(let i=0;i<ML;i++)heart(W/2+(i-(ML-1)/2)*60,H-55,40,i<this.lives?"#f0f0f0":"#3c3c3c")}
    if(t>JT-.5){ctx.fillStyle=`rgba(0,0,0,${Math.min(1,(t-(JT-.5))/.5)})`;ctx.fillRect(0,0,W,H)}}
}

// ---------------------------------------------------------------- меню
const noise=[],noiseR=[],noiseB=[];let scene="load",game=null,sel=0,flick=1,mrects=[],loreT=0,menuT=0,menuDt=0,ctlT=0,selY=360,fadeIn=1;
const KEY_LINES=["WASD — ходьба          Мышь / ← → — поворот","Клик по экрану — захватить мышь","Shift — бег (выносливость ограничена)",
  "E — взаимодействовать (шкаф, тумбочка, дверь, ворота; рубильник — держать)","F — фонарь (видишь дальше, но и он тебя тоже)","G — петарда   Q — использовать предмет   Z — сменить предмет",
  "1–4 — быстрые реплики (мультиплеер)","M — поставить / убрать метку (в КОШМАРИЩЕ метки нет)","Esc — пауза          F11 — полный экран"];
const TOUCH_LINES=["ЛЕВЫЙ ПАЛЕЦ — джойстик: куда тянешь, туда идёшь","ПРАВЫЙ ПАЛЕЦ — води по экрану, чтобы поворачивать","БЕГ — включить / выключить бег (выносливость ограничена)",
  "E — взаимодействовать (шкаф, тумбочка, дверь, ворота; рубильник — держать)","F — фонарь (видишь дальше, но и он тебя тоже)","ИСП — использовать предмет   > — сменить   ! — реплика   II — пауза","МЕТ — поставить / убрать метку (в КОШМАРИЩЕ метки нет)"];
const GOAL=["","Каждая катка — случайный СЦЕНАРИЙ: КЛАССИКА, ЛИФТ или ШИФР.","Монстры ходят по обоим этажам. Шкафы — укрытие. Двери можно закрыть (E).",
  "ЧЁРНЫЙ притворяется, ВАРЁНЫЙ звереет от света, САРАНЧА караулит лестницу.","На полу стекло (бег — шум) и капканы. Тьма и монстры подтачивают РАССУДОК.","3 жизни. У ворот монстры не ходят. Свет погаснет — ищи ПРЕДОХРАНИТЕЛЬ."];
function addNoise(i){ctx.globalCompositeOperation="lighter";ctx.imageSmoothingEnabled=false;ctx.drawImage(noise[i],0,0,W,H);ctx.imageSmoothingEnabled=true;ctx.globalCompositeOperation="source-over"}
const DUST=Array.from({length:90},()=>({x:Math.random()*W,y:Math.random()*H,r:Math.random()*1.8+.5,vx:Math.random()*16-8,vy:-(Math.random()*12+3),a:Math.random()*.35+.08,p:Math.random()*6}));
let EYE=null,eyeT=2.5;const TITLE="WORST NIGHTMARE";
const fadeOv=()=>{if(fadeIn>0){ctx.fillStyle=`rgba(0,0,0,${Math.min(1,fadeIn)})`;ctx.fillRect(0,0,W,H)}};
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
  const items=["ИГРАТЬ","МУЛЬТИПЛЕЕР","УПРАВЛЕНИЕ"];mrects=[];selY+=(360+sel*80-selY)*Math.min(1,dt*12);
  {const sa=ease(.6,.5),bw=300+20*Math.sin(menuT*3);ctx.save();ctx.globalAlpha=sa*(.6+.3*Math.sin(menuT*4));
    const bg2=ctx.createLinearGradient(W/2-bw,0,W/2+bw,0);bg2.addColorStop(0,"rgba(255,255,255,0)");bg2.addColorStop(.5,"rgba(255,255,255,.12)");bg2.addColorStop(1,"rgba(255,255,255,0)");
    ctx.fillStyle=bg2;ctx.fillRect(W/2-bw,selY-30,bw*2,60);ctx.fillStyle="rgba(255,255,255,.35)";ctx.fillRect(W/2-bw*.6,selY+32,bw*1.2,1);ctx.fillRect(W/2-bw*.6,selY-32,bw*1.2,1);ctx.restore()}
  items.forEach((l,i)=>{const a=i===sel,e=ease(.5+i*.15,.5);ctx.font=F(44,1);ctx.textAlign="center";ctx.textBaseline="middle";
    const s2=a?"> "+l+" <":l,w=ctx.measureText(s2).width,off=(1-e)*-120,sh=a?Math.sin(menuT*6)*2:0;
    ctx.globalAlpha=e;ctx.fillStyle=a?"#f5f5f5":"#6e6e6e";ctx.fillText(s2,W/2+off+sh,360+i*80);ctx.globalAlpha=1;mrects.push(rc(W/2,360+i*80,w+160,84))});
  ctx.font=F(26);ctx.textAlign="center";ctx.globalAlpha=ease(1.3,.8)*(.7+.3*Math.sin(menuT*2));ctx.fillStyle="#5f5f5f";ctx.fillText(TOUCH?"коснись пункта меню":"↑↓ / мышь — выбор     Enter — подтвердить",W/2,H-40);ctx.globalAlpha=1;
  ctx.fillStyle="#000";for(let y=0;y<H;y+=4)ctx.fillRect(0,y,W,1);fadeOv()}
function drawControls(){ctx.fillStyle="#040404";ctx.fillRect(0,0,W,H);addNoise(ri(0,5));T("УПРАВЛЕНИЕ",F(64,1),W/2,80,"#ebebeb",1);
  [...(TOUCH?TOUCH_LINES:KEY_LINES),...GOAL].forEach((s,i)=>{const e=cl((ctlT-i*.06)/.35,0,1);T(s,F(24),W/2+(1-e)*-60,150+i*32,"#c8c8c8",1,e)});
  T(TOUCH?"коснись экрана — назад":"любая клавиша — назад",F(26),W/2,H-36,"#787878",1);fadeOv()}
const LORE=["Ты очнулся в бесконечном сером лабиринте.","Холодные бетонные стены давят со всех сторон,","а в темноте за спиной слышатся чьи-то шаги.","Твоя единственная цель — найти выход,","пока монстры не добрались до тебя.","","Двигайся тихо и не оборачивайся."];
function drawLore(){ctx.fillStyle="#020202";ctx.fillRect(0,0,W,H);addNoise(ri(0,5));
  LORE.forEach((s,i)=>{const a=cl((loreT-i*1.6)/1.2,0,1);if(a>0)T(s,F(34),W/2,190+i*56,i===6?"#f0f0f0":"#cfcfcf",1,a)});
  if(loreT>LORE.length*1.6)T(TOUCH?"коснись экрана":"любая клавиша — начать",F(26),W/2,H-50,"#787878",1,.5+.5*Math.sin(loreT*3));fadeOv()}
function startGame(){game=new Game();scene="game"}
const MENU_ACTS=["play","mp","controls"];
function menuAct(a){blip("click",.7,0);if(a==="mp"){if(window.UI&&window.NET)UI.open("mp");else WN.toast("Мультиплеер недоступен: net.js не загружен.")}else if(a==="controls"){scene="controls";ctlT=0;fadeIn=.6}else if(a==="play"){fadeIn=.9;CH.lamp.stop();if(TOUCH)fs();scene="lore";loreT=0}}
function menuKey(c){if(c==="ArrowUp"||c==="KeyW"){sel=(sel+2)%3;blip("click",.3,0)}else if(c==="ArrowDown"||c==="KeyS"){sel=(sel+1)%3;blip("click",.3,0)}else if(c==="Enter"||c==="Space")menuAct(MENU_ACTS[sel])}

// ---------------------------------------------------------------- ввод
const posOf=e=>{const r=cv.getBoundingClientRect();return[(e.clientX-r.left)*W/r.width,(e.clientY-r.top)*H/r.height]};
addEventListener("keydown",e=>{if(window.UIOPEN)return;unlock();if(["Space","Tab","Backspace","ArrowUp","ArrowDown","ArrowLeft","ArrowRight","F1","F11"].includes(e.code))e.preventDefault();
  if(e.repeat)return;keys.add(e.code);
  if(scene==="menu")menuKey(e.code);else if(scene==="controls")scene="menu";else if(scene==="lore"){if(loreT>.8)startGame()}else if(scene==="game")game.key(e)});
addEventListener("keyup",e=>keys.delete(e.code));addEventListener("blur",()=>keys.clear());
addEventListener("contextmenu",e=>e.preventDefault());
document.addEventListener("touchmove",e=>e.preventDefault(),{passive:false});
document.addEventListener("mousemove",e=>{if(document.pointerLockElement===cv)mouseDX+=e.movementX});
document.addEventListener("pointerlockchange",()=>{const was=locked;locked=document.pointerLockElement===cv;if(was&&!locked&&scene==="game"&&game.mode==="play")game.pause(true)});
document.addEventListener("visibilitychange",()=>{if(document.hidden&&scene==="game"&&game.mode==="play")game.pause(true)});
cv.addEventListener("pointerdown",e=>{if(window.UIOPEN)return;unlock();e.preventDefault();
  if(e.pointerType==="touch"){TOUCH=true;try{cv.setPointerCapture(e.pointerId)}catch(_){}}else if(e.button!==0)return;
  const p=posOf(e);
  if(scene==="menu"){mrects.forEach((r,i)=>{if(inR(r,p)){sel=i;menuAct(MENU_ACTS[i])}})}
  else if(scene==="controls")scene="menu";
  else if(scene==="lore"){if(loreT>.8)startGame()}
  else if(scene==="game"){const wasPlay=game.mode==="play";game.tap(p);if(e.pointerType==="touch"&&wasPlay)game.touchEv("down",e.pointerId,p)}});
cv.addEventListener("pointermove",e=>{const p=posOf(e);
  if(e.pointerType==="touch"){if(scene==="game")game.touchEv("move",e.pointerId,p)}else if(scene==="menu")mrects.forEach((r,i)=>{if(inR(r,p)&&sel!==i){sel=i;blip("click",.3,0)}})});
const up=e=>{if(e.pointerType==="touch"&&scene==="game")game.touchEv("up",e.pointerId,posOf(e))};
cv.addEventListener("pointerup",up);cv.addEventListener("pointercancel",up);
const rot=document.getElementById("rot");
function resize(){const s=Math.min(innerWidth/W,innerHeight/H);cv.style.width=W*s+"px";cv.style.height=H*s+"px";
  const portrait=TOUCH&&innerHeight>innerWidth;rot.style.display=portrait?"flex":"none";if(portrait&&scene==="game"&&game.mode==="play")game.pause(true)}
addEventListener("resize",resize);resize();

// ---------------------------------------------------------------- старт и цикл
function init(){for(let i=0;i<6;i++){const c=document.createElement("canvas");c.width=W/4;c.height=H/4;const g=c.getContext("2d"),d=g.createImageData(W/4,H/4),u=new Uint32Array(d.data.buffer);
    for(let k=0;k<u.length;k++){const v=Math.random()*64|0;u[k]=0xFF000000|(v<<16)|(v<<8)|v}g.putImageData(d,0,0);noise.push(c)}
  for(const[arr,fn]of[[noiseR,v=>[v*2.4,v*.1,v*.1]],[noiseB,v=>[v*3,v*2.5,v*1.8]]])for(let i=0;i<6;i++){const c=document.createElement("canvas");c.width=W/4;c.height=H/4;
    const g=c.getContext("2d"),d=g.createImageData(W/4,H/4),u=new Uint32Array(d.data.buffer);
    for(let k=0;k<u.length;k++){const[r,gg,b]=fn(Math.random()*64|0);u[k]=0xFF000000|(Math.min(255,b)<<16)|(Math.min(255,gg)<<8)|Math.min(255,r)}g.putImageData(d,0,0);arr.push(c)}
  scene="menu"}
let last=0;
function frame(now){requestAnimationFrame(frame);if(now-last<12)return;const dt=Math.min((now-last)/1000,.05);last=now;fadeIn=Math.max(0,fadeIn-dt*2);
  if(scene==="load"){ctx.fillStyle="#000";ctx.fillRect(0,0,W,H);T("ЗАГРУЗКА...",F(32),W/2,H/2,"#888",1);return}
  if(scene==="menu"||scene==="controls"){if(ac&&ac.state==="running"){if(SND.menu_music)loopSnd(CH.music,"menu_music",.7,.7);else if(scene==="menu"&&SND.lamp&&!CH.lamp.busy())CH.lamp.play(SND.lamp,1,.25,.25)}}else CH.music.stop();
  if(scene==="menu"){menuT+=dt;menuDt=dt;drawMenu()}
  else if(scene==="lore"){loreT+=dt;drawLore()}
  else if(scene==="controls"){ctlT+=dt;drawControls()}
  else{game.update(dt);if(game.exit){const wasMp=game.mp;game.stopLoops();CH.scream.stop();if(ac)ac.resume();unlockMouse();game=null;scene="menu";menuT=0;fadeIn=1;hideHud();if(wasMp&&window.NET)NET.leave()}else game.draw()}}
requestAnimationFrame(frame);
["jumpscare.png","jumpscare_boiled.png","jumpscare_locust.png"].forEach((f,t)=>{const im=new Image();JIMG[t]=im;im.onload=()=>buildJump(t,true);im.onerror=()=>buildJump(t,false);im.src=f});
const fl=Promise.all([document.fonts.load("26px MonoFont","Аб"),document.fonts.load("26px MonoFontBold","Аб")]).catch(()=>{});
Promise.race([fl,new Promise(r=>setTimeout(r,4000))]).then(()=>{for(let t=0;t<3;t++)if(!JUMPS[t])buildJump(t,false);init()});

// ---------------------------------------------------------------- мультиплеер: мост WN для net.js
const $el=id=>document.getElementById(id);let toastT=null,wired=false;
function showHud(gm){const t=$el("wn-timer");if(t){t.style.display=gm==="speed"?"block":"none";t.textContent="00:00.0"}
  for(const id of["btn-jump","btn-dash"]){const b=$el(id);if(b)b.style.display=gm==="speed"&&TOUCH?"block":"none"}}
function hideHud(){for(const id of["wn-timer","btn-jump","btn-dash"]){const b=$el(id);if(b)b.style.display="none"}}
function dropGame(){if(game){game.stopLoops();CH.scream.stop();unlockMouse();game=null}if(ac)ac.resume();hideHud();if(scene!=="load"){scene="menu";menuT=0;fadeIn=1}}
function wireButtons(){if(wired)return;wired=true;
  for(const[id,fn]of[["btn-jump","jump"],["btn-dash","dash"]]){const b=$el(id);
    if(b)b.addEventListener("pointerdown",e=>{e.preventDefault();e.stopPropagation();unlock();if(game&&game.mp)game[fn]()})}}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",wireButtons);else wireButtons();
window.WN={
  start(o){o=o||{};wireButtons();if(window.UI)UI.close();CH.lamp.stop();unlock();if(game)game.stopLoops();
    game=new Game({mp:true,seed:o.seed,gm:o.gm||"normal"});scene="game";showHud(game.gm);resize()},
  event(ev){if(ev&&game&&game.mp)game.net_ev(ev)},
  backToLobby(){dropGame();if(window.UI)UI.open("lobby")},
  toMenu(){if(window.UI)UI.close();dropGame()},
  toast(msg){const e=$el("wn-toast");if(e){e.textContent=msg;e.style.display="block";clearTimeout(toastT);toastT=setTimeout(()=>{e.style.display="none"},3500)}else if(game)game.notify(msg,3.5)},
  lost(msg){WN.toast(msg);WN.toMenu()},
  scene(n){dropGame()},
  releaseKeys(){keys.clear();mouseDX=0;if(game)game.touch.reset()}
};
