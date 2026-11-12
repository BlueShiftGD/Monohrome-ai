"use strict";
// WORST NIGHTMARE (бывш. MONOCHROME) — порт с Python/pygame на JS. Ассеты лежат рядом с index.html:
// font.ttf, font_bold.ttf, jumpscare.png, jumpscare_boiled.png, jumpscare_locust.png,
// lamp/running/monster/scream/boiled/locust.mp3 (необязательно: scream_boiled.mp3, scream_locust.mp3)
const W=1280,H=720;
let TOUCH=matchMedia("(pointer:coarse)").matches||location.search.includes("touch");
const RW=TOUCH?240:320,RH=TOUCH?135:180,K=Math.tan(Math.PI*70/360),PROJ=RW/2/K;
const KEYS=5,SZ=41,CN=20,MP=[{sp:3.2,pat:1.6,vt:14,vn:9,hr:6},{sp:3,pat:1.5,vt:12,vn:8,hr:8},{sp:3.5,pat:1.9,vt:16,vn:10,hr:5}],LIVES=3,SAFE=4.2,JG=1,JT=5,PATROL=0,CHASE=1,SEARCH=2;
const rnd=(a,b)=>a+Math.random()*(b-a),ri=(a,b)=>a+Math.floor(Math.random()*(b-a+1)),pick=a=>a[Math.floor(Math.random()*a.length)];
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
["lamp","running","monster","scream","boiled","locust","scream_boiled","scream_locust"].forEach(async n=>{for(const x of[".mp3",".ogg",".wav"])try{
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
const CH={lamp:new Ch,scream:new Ch};
const unlock=()=>{if(ac&&ac.state==="suspended")ac.resume()};
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
    this.code=String(ri(0,9999)).padStart(4,"0");
    const sl=fi=>shuf(this.floors[fi].stands.flatMap(n=>[[n,0],[n,1]])),sa=sl(0),sb=sl(1),n0=ri(2,3);
    [...sa.splice(0,n0),...sb.splice(0,KEYS-n0)].forEach(([n,j])=>n.drawers[j]=["key","Ключ!"]);const[cn,cj]=pick([...sa,...sb]);cn.drawers[cj]=["code",this.code];
    const JUNK=["Пусто.","Только пыль.","Старая фотография. Лица стёрты.","Сломанная лампочка.","Записка: «Не оглядывайся»","Пусто. Но кто-то был здесь недавно."];
    for(const fl of this.floors)for(const n of fl.stands)for(let j=0;j<2;j++)if(n.drawers[j][0]==="junk")n.drawers[j]=["junk",pick(JUNK)];
    for(let fi=0;fi<2;fi++){const g=this.floors[fi].grid,cand=[];
      for(let y=1;y<S-1;y++)for(let x=1;x<S-1;x++)if(g[y][x]===1&&x%2!==y%2&&far(x,y,sc,2.5)){
        if(fi===0&&!(far(x,y,this.start,5)&&far(x,y,this.gate_c,SAFE+2.5)))continue;cand.push([x,y])}
      const w=this.spread(cand,[6,5][fi],[10,8,6,4,0]);if(!w)return false;w.forEach(([x,y])=>g[y][x]=2)}
    for(const fl of this.floors)for(let y=1;y<S-1;y+=2)for(let x=1;x<S-1;x+=2)
      if(Math.random()<.38||(x===1&&y===1)||(x===S-2&&y===S-2))fl.lamps.push([x+.5,y+.5]);
    this.cells=[];for(let y=1;y<S-1;y+=2)for(let x=1;x<S-1;x+=2)this.cells.push([x,y]);
    return true}
  in_safe(x,y,f){return f===0&&hyp(x-this.gate_c[0],y-this.gate_c[1])<SAFE}
  solid(x,y,f){const ix=Math.floor(x),iy=Math.floor(y);if(ix<0||iy<0||ix>=SZ||iy>=SZ)return true;return this.floors[f].grid[iy][ix]!==0}
  los(x0,y0,x1,y1,f){const n=Math.max(1,Math.floor(hyp(x1-x0,y1-y0)/.2));for(let i=1;i<n;i++){const t=i/n;if(this.solid(x0+(x1-x0)*t,y0+(y1-y0)*t,f))return false}return true}
  walls_between(x0,y0,x1,y1,f){const n=Math.max(1,Math.floor(hyp(x1-x0,y1-y0)/.2));let prev=this.solid(x0,y0,f),c=0;
    for(let i=1;i<=n;i++){const t=i/n,cur=this.solid(x0+(x1-x0)*t,y0+(y1-y0)*t,f);if(cur&&!prev)c++;prev=cur}return c}
  path_to(s,goal,f){const g=this.floors[f].grid,key=c=>c[0]*64+c[1],prev=new Map([[key(s),null]]),q=[s];let best=s,bd=(s[0]-goal[0])**2+(s[1]-goal[1])**2;
    for(let h=0;h<q.length;h++){const cur=q[h],d=(cur[0]-goal[0])**2+(cur[1]-goal[1])**2;if(d<bd){best=cur;bd=d;if(!d)break}
      for(const[dx,dy]of D4){const n=[cur[0]+dx,cur[1]+dy];if(prev.has(key(n)))continue;const row=g[n[1]];if(!row||row[n[0]]!==0)continue;
        if(this.in_safe(n[0]+.5,n[1]+.5,f))continue;prev.set(key(n),cur);q.push(n)}}
    const p=[];let c=best;while(c&&!(c[0]===s[0]&&c[1]===s[1])){p.push(c);c=prev.get(key(c))}return p.reverse()}
  far_cell(from,min,f){const s=[Math.floor(from[0]),Math.floor(from[1])],g=this.floors[f].grid,dist=new Map([[s[0]*64+s[1],0]]),q=[s];
    for(let h=0;h<q.length;h++){const c=q[h],dc=dist.get(c[0]*64+c[1]);for(const[dx,dy]of D4){const n=[c[0]+dx,c[1]+dy],k=n[0]*64+n[1];
      if(!dist.has(k)&&g[n[1]][n[0]]===0){dist.set(k,dc+1);q.push(n)}}}
    const ok=c=>c[0]%2===1&&c[1]%2===1&&!this.in_safe(c[0]+.5,c[1]+.5,f),all=[...dist].map(([k,d])=>[[Math.floor(k/64),k%64],d]);
    let o=all.filter(([c,d])=>d>=min&&ok(c));if(!o.length)o=all.filter(([c])=>ok(c));const c=pick(o)[0];return[c[0]+.5,c[1]+.5]}
}

// ---------------------------------------------------------------- монстр
class Monster{
  constructor(pos,f,type){this.type=type||0;this.prox=0;this.aud=0;this.aud_run=0;this.ch={a:new Ch,b:new Ch};this.reposition(pos,f);this.stair_cd=0;this.lost_t=0;this.linger=0;this.linger_total=0;this.repath=0;this.last_known=pos}
  reposition(pos,f){this.x=pos[0];this.y=pos[1];this.floor=f;this.state=PATROL;this.path=[];this.goal=null;this.patrol_target=null;this.patrol_stairs=false;
    this.cross=false;this.arrived=false;this.lurk=0;this.grace=5;this.seen=false}
  alert(p){if(this.state!==CHASE)this.state=SEARCH;this.last_known=p;this.arrived=false;this.cross=false;this.linger=0;this.path=[];this.goal=null}
  go_stairs(L){this.state=SEARCH;this.last_known=[L.stairs.x,L.stairs.y];this.arrived=false;this.cross=true;this.lost_t=0;this.path=[];this.goal=null}
  change_floor(L){this.floor=1-this.floor;this.x=L.stairs_exit[this.floor][0];this.y=L.stairs_exit[this.floor][1];this.path=[];this.goal=null;
    this.patrol_target=null;this.patrol_stairs=false;this.stair_cd=10;this.grace=Math.max(this.grace,2)}
  move(wx,wy,sp,dt){const dx=wx-this.x,dy=wy-this.y,d=hyp(dx,dy);if(d<1e-6)return;const s=Math.min(d,sp*dt);this.x+=dx/d*s;this.y+=dy/d*s}
  goto(tx,ty,sp,dt,L,direct){
    if(direct){this.move(tx,ty,sp,dt);return false}
    this.repath-=dt;const goal=[Math.floor(tx),Math.floor(ty)];
    if(this.repath<=0||!this.goal||goal[0]!==this.goal[0]||goal[1]!==this.goal[1]){this.path=L.path_to([Math.floor(this.x),Math.floor(this.y)],goal,this.floor);this.goal=goal;this.repath=.4}
    while(this.path.length&&hyp(this.path[0][0]+.5-this.x,this.path[0][1]+.5-this.y)<.12)this.path.shift();
    if(!this.path.length)return true;this.move(this.path[0][0]+.5,this.path[0][1]+.5,sp,dt);return false}
  update(dt,g){const p=g.player,L=g.level,P=MP[this.type];this.stair_cd=Math.max(0,this.stair_cd-dt);this.grace=Math.max(0,this.grace-dt);
    const same=this.floor===p.floor,dist=same?hyp(p.x-this.x,p.y-this.y):99,safe=L.in_safe(p.x,p.y,p.floor);
    let seen=same&&!p.hidden&&!safe&&dist<(p.torch?P.vt:P.vn)&&L.los(this.x,this.y,p.x,p.y,this.floor);
    let heard=same&&!p.hidden&&!safe&&p.sprinting&&dist<P.hr;if(this.grace>0)seen=heard=false;this.seen=seen;
    if(this.cross&&same)this.cross=false;
    if(seen){this.state=CHASE;this.cross=false;this.lost_t=0;this.last_known=[p.x,p.y]}else if(heard&&this.state!==CHASE)this.alert([p.x,p.y]);
    if(this.state===CHASE&&!same)this.go_stairs(L);
    if(this.state===CHASE&&!seen){this.lost_t+=dt;if(this.lost_t>2.5){this.state=SEARCH;this.arrived=false;this.linger=0}}
    if(this.state===CHASE){seen?this.goto(p.x,p.y,P.sp,dt,L,dist<4.5):this.goto(this.last_known[0],this.last_known[1],P.sp,dt,L)}
    else if(this.state===SEARCH){
      if(!this.arrived){if(this.goto(this.last_known[0],this.last_known[1],this.cross?P.sp:P.sp*.62,dt,L)){this.arrived=true;this.linger=0;this.linger_total=rnd(3,8);
        if(this.cross){this.cross=false;this.change_floor(L);this.last_known=[this.x,this.y]}}}
      else{this.linger+=dt;if(same&&p.hidden&&hyp(p.x-this.x,p.y-this.y)<2.6){this.lurk+=dt;if(this.lurk>6.5){g.kill(this);return}}
        if(this.linger>this.linger_total){this.state=PATROL;this.patrol_target=null;this.lurk=0}}}
    else{
      if(!this.patrol_target){this.patrol_stairs=false;
        if(this.stair_cd<=0&&Math.random()<(same?.12:.5)){this.patrol_target=[L.stairs.x,L.stairs.y];this.patrol_stairs=true}
        else{this.patrol_target=[1.5,1.5];for(let i=0;i<20;i++){const c=pick(L.cells),cx=c[0]+.5,cy=c[1]+.5;
          if(!L.in_safe(cx,cy,this.floor)&&hyp(cx-this.x,cy-this.y)>8){this.patrol_target=[cx,cy];break}}}}
      if(this.goto(this.patrol_target[0],this.patrol_target[1],P.pat,dt,L)){if(this.patrol_stairs)this.change_floor(L);this.patrol_target=null}}
    if(same&&!p.hidden&&this.grace<=0&&hyp(p.x-this.x,p.y-this.y)<.75)g.kill(this)}
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
const SPR_STAND=sprite(80,70,(g,w,h)=>{g.fillStyle="#969696";g.fillRect(0,0,w,h);g.fillStyle="#cdcdcd";g.fillRect(0,0,w,6);
  g.lineWidth=3;g.strokeStyle="#3c3c3c";g.strokeRect(1.5,1.5,w-3,h-3);
  for(let i=0;i<2;i++){const y=10+i*30;g.fillStyle="#6e6e6e";g.fillRect(7,y,w-14,24);g.lineWidth=2;g.strokeStyle="#282828";g.strokeRect(8,y+1,w-16,22);
    g.fillStyle="#e6e6e6";g.beginPath();g.arc(w/2,y+12,4,0,7);g.fill()}});
const SPR_STAIRS=[true,false].map(up=>sprite(100,200,(g,w,h)=>{g.fillStyle="#aaa";g.fillRect(0,0,w,h);g.fillStyle="#060606";g.fillRect(10,10,w-20,h-10);
  for(let i=0;i<6;i++){const y=h-16-i*22,ins=14+(up?i:5-i)*5;g.fillStyle="#cdcdcd";g.fillRect(ins,y-1,w-2*ins,3);g.fillStyle="#505050";g.fillRect(ins,y+3,w-2*ins,2)}
  const cx=w/2;g.fillStyle="#f0f0f0";g.beginPath();up?(g.moveTo(cx,24),g.lineTo(cx-16,50),g.lineTo(cx+16,50)):(g.moveTo(cx,50),g.lineTo(cx-16,24),g.lineTo(cx+16,24));g.fill();
  g.lineWidth=3;g.strokeStyle="#3c3c3c";g.strokeRect(1.5,1.5,w-3,h-3)}));
const JUMPS=[],JIMG=[];
function buildJump(t,ok){const jimg=JIMG[t],c=document.createElement("canvas");c.width=W;c.height=H;const g=c.getContext("2d");g.fillStyle="#080808";g.fillRect(0,0,W,H);
  if(ok){const s=Math.max(W/jimg.width,H/jimg.height),w=jimg.width*s+1,h=jimg.height*s+1;g.drawImage(jimg,(W-w)/2,(H-h)/2,w,h)}
  else if(t){const red=t===1;g.fillStyle="#020202";g.fillRect(W*.3,H*.4,W*.4,H);g.fillStyle=red?"#7a1414":"#d6bfa0";g.beginPath();g.ellipse(W/2,H*.32,W*.12,H*.22,0,0,7);g.fill();g.fillStyle="#000";for(const d of[-1,1]){g.beginPath();g.ellipse(W/2+d*W*.045,H*.27,W*.02,H*.03,0,0,7);g.fill()}g.beginPath();g.ellipse(W/2,H*.42,W*(red?.06:.025),H*(red?.08:.05),0,0,7);g.fill()}else{g.fillStyle="#020202";g.fillRect(W*.3,H*.1,W*.4,H);g.fillStyle="#f0f0f0";for(const d of[-1,1]){g.beginPath();g.ellipse(W/2+d*W*.045,H*.2,W*.03,H*.035,0,0,7);g.fill()}}
  JUMPS[t]=c}

// ---------------------------------------------------------------- сенсорный интерфейс
class TouchUI{
  constructor(){this.sprint=false;this.reset()}
  reset(){this.js=null;this.look=null;this.last=0;this.dx=0;this.home=[190,540];this.base=this.home;this.knob=this.home;this.move=[0,0];this.bf={};this.acts=[]}
  get B(){return{e:[[1160,540],74,"E"],f:[[1160,370],52,"F"],sprint:[[1000,600],54,"БЕГ"],pause:[[1220,150],34,"II"]}}
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
Object.defineProperty(TouchUI.prototype,"B",{get(){return{e:[[1160,540],74,"E"],f:[[1160,370],52,"F"],sprint:[[1000,600],54,"БЕГ"],pause:[[1220,150],34,"II"]}}});

// ---------------------------------------------------------------- игра
const keys=new Set();let mouseDX=0,locked=false;
const lock=()=>{if(!TOUCH&&document.pointerLockElement!==cv)try{const p=cv.requestPointerLock();p&&p.catch&&p.catch(()=>{})}catch(e){}};
const unlockMouse=()=>{if(document.pointerLockElement)document.exitPointerLock()};
const fs=()=>{const d=document.documentElement;if(document.fullscreenElement)document.exitFullscreen();else if(d.requestFullscreen)
  d.requestFullscreen().then(()=>screen.orientation&&screen.orientation.lock&&screen.orientation.lock("landscape").catch(()=>{})).catch(()=>{})};

class Game{
  constructor(){this.touch=new TouchUI;this.exit=null;this.new_game()}
  new_game(){if(this.monsters)this.stopLoops();const L=this.level=new Level();const p=this.player={};this.reset_player();
    this.monsters=[0,1,2].map(t=>{const mf=pick([0,0,1]);return new Monster(L.far_cell(L.start,26,mf),mf,t)});
    this.lives=LIVES;this.keys=0;this.has_code=false;this.killer=0;this.bo_at=rnd(75,140);this.bo_done=false;this.mode="play";this.t=this.play_time=0;this.msg="";this.msg_t=0;
    this.ui_stand=null;this.pad="";this.pad_msg="";this.shake=0;this.js_t=0;this.fade=1;this.interact=null;this.light=.9;this.fstate="normal";this.ft=rnd(2,6);this.ftick=0;this._tm=null;
    this.grab(true);this.notify("Найди 5 ключей и код от ворот. Прячься в шкафах [E].",6);this.stopLoops()}
  reset_player(keepTorch){const L=this.level,p=this.player,tor=p.torch;Object.assign(p,{x:L.start[0],y:L.start[1],angle:L.start_angle,stamina:1,exhausted:false,sprinting:false,moving:false,
    hidden:false,hide_tile:null,hide_dir:0,hide_exit:[L.start[0],L.start[1]],look_off:0,cam:[L.start[0],L.start[1]],torch:!!keepTorch&&tor,bob_t:0,hide_cd:0,floor:0})}
  grab(on){on?lock():unlockMouse()}
  notify(t,d){this.msg=t;this.msg_t=d||3}
  stopLoops(){CH.lamp.stop();(this.monsters||[]).forEach(m=>{m.ch.a.stop();m.ch.b.stop()})}
  update_audio(){if(!Object.keys(SND).length)return;const p=this.player,L=this.level,calm=L.in_safe(p.x,p.y,p.floor)?.45:1;
    for(const m of this.monsters){const dx=m.x-p.x,dy=m.y-p.y,d=Math.max(.01,hyp(dx,dy));let muff,lat;
      if(m.floor===p.floor){muff=Math.pow(.28,L.walls_between(p.x,p.y,m.x,m.y,p.floor));lat=(-dx*Math.sin(p.angle)+dy*Math.cos(p.angle))/d}else{muff=.16;lat=0}
      let mon=Math.pow(Math.max(0,1-d/13),1.8)*calm*muff,run;
      if(m.state===CHASE){mon=Math.min(1,mon*1.5+.1*calm*muff);run=Math.pow(Math.max(0,1-d/16),1.4)*calm*muff}else run=Math.pow(Math.max(0,1-d/6),1.5)*.3*calm*muff;
      m.aud+=(mon-m.aud)*.15;m.aud_run+=(run-m.aud_run)*.15;
      const vl=1-.8*Math.max(0,lat),vr=1+.8*Math.min(0,lat);
      if(m.type===0){loopSnd(m.ch.a,"monster",m.aud*vl,m.aud*vr);loopSnd(m.ch.b,"running",m.aud_run*vl,m.aud_run*vr)}
      else{const v=Math.max(m.aud*.4,m.aud_run);loopSnd(m.ch.b,m.type===1?"boiled":"locust",v*vl,v*vr)}}
    const lv=this.fstate==="long"?0:this.fstate!=="normal"?.9:.12;loopSnd(CH.lamp,"lamp",lv,lv)}
  update_prox(){const p=this.player,L=this.level;for(const m of this.monsters){if(m.floor!==p.floor){m.prox*=.8;continue}
    let v=Math.pow(Math.max(0,1-hyp(m.x-p.x,m.y-p.y)/10),1.2);if(v>0&&L.walls_between(p.x,p.y,m.x,m.y,p.floor))v*=.5;m.prox+=(v-m.prox)*.2}}
  update_light(dt){this.ft-=dt;if(!this.bo_done&&this.play_time>=this.bo_at){this.bo_done=true;this.fstate="long";this.ft=rnd(100,140);this.light=.03;this.notify("Свет погас...",4)}
    if(this.fstate==="normal"){this.light=.92;if(this.ft<=0){this.fstate=pick(["burst","burst","blackout"]);this.ft=this.fstate==="burst"?rnd(.5,1.6):rnd(.4,1.2)}}
    else if(this.fstate==="burst"){this.ftick-=dt;if(this.ftick<=0){this.ftick=rnd(.03,.1);this.light=pick([.05,.95,.3,.9,.1,.7])}if(this.ft<=0){this.fstate="normal";this.ft=rnd(3,10)}}
    else{this.light=.03;if(this.ft<=0){if(this.fstate==="long"){this.fstate="burst";this.ft=rnd(1.2,2);this.notify("Свет вернулся.",4)}else{this.fstate="normal";this.ft=rnd(3,10)}}}}
  kill(m){if(this.mode==="jumpscare")return;this.killer=m?m.type:0;this.lives--;this.mode="jumpscare";this.js_t=0;this.ui_stand=null;this.stopLoops();
    const sn=SND["scream_"+["","boiled","locust"][this.killer]]||SND.scream;if(sn)CH.scream.play(sn,0,1,1)}
  respawn(){const L=this.level;this.reset_player(true);this.monsters.forEach(m=>{const mf=pick([0,0,1]);m.reposition(L.far_cell(L.start,26,mf),mf)});
    this.mode="play";this.fade=1;this.notify("Ты очнулся у лифта. Ключи и найденное остались с тобой.",4)}
  cast(px,py,rdx,rdy){const g=this.level.floors[this.player.floor].grid;let mx=Math.floor(px),my=Math.floor(py);
    const ddx=rdx?Math.abs(1/rdx):1e30,ddy=rdy?Math.abs(1/rdy):1e30;let stx,sdx,sty,sdy,side=0,t;
    if(rdx<0){stx=-1;sdx=(px-mx)*ddx}else{stx=1;sdx=(mx+1-px)*ddx}if(rdy<0){sty=-1;sdy=(py-my)*ddy}else{sty=1;sdy=(my+1-py)*ddy}
    for(;;){if(sdx<sdy){sdx+=ddx;mx+=stx;side=0}else{sdy+=ddy;my+=sty;side=1}if(mx<0||my<0||mx>=SZ||my>=SZ)return[99,1,0,side,mx,my];t=g[my][mx];if(t)break}
    let dist,wx;if(side===0){dist=sdx-ddx;wx=py+rdy*dist}else{dist=sdy-ddy;wx=px+rdx*dist}return[dist,t,wx-Math.floor(wx),side,mx,my]}
  find_interact(){const p=this.player,L=this.level;if(p.hidden)return{k:"unhide"};let best=null;
    for(const[o,k]of[...L.floors[p.floor].stands.map(n=>[n,"stand"]),[L.stairs,"stairs"]]){const dx=o.x-p.x,dy=o.y-p.y,d=hyp(dx,dy);
      if(d<1.8){const ad=mod(Math.atan2(dy,dx)-p.angle+Math.PI,2*Math.PI)-Math.PI;if(Math.abs(ad)<.65&&(!best||d<best.d)&&L.los(p.x,p.y,o.x,o.y,p.floor))best={d,o,k}}}
    if(best)return{k:best.k,o:best.k==="stand"?best.o:null};
    const[dist,t,,,mx,my]=this.cast(p.x,p.y,Math.cos(p.angle),Math.sin(p.angle));
    if(dist<1.6){if(t===2)return{k:"hide",o:[mx,my]};if(t===4)return{k:"gate"};if(t===5)return{k:"lift"}}return null}
  do_interact(){const it=this.interact,p=this.player;if(!it)return;const k=it.k;
    if(k==="unhide"){if(p.hide_cd<=0){p.hidden=false;p.x=p.hide_exit[0];p.y=p.hide_exit[1];p.angle=p.hide_dir;p.hide_cd=.4}}
    else if(k==="hide"&&p.hide_cd<=0){const[mx,my]=it.o,cx=mx+.5,cy=my+.5,vx=p.x-cx,vy=p.y-cy;let dx,dy;
      if(Math.abs(vx)>Math.abs(vy)){dx=vx>0?1:-1;dy=0}else{dx=0;dy=vy>0?1:-1}
      p.hidden=true;p.hide_tile=[mx,my];p.hide_dir=Math.atan2(dy,dx);p.hide_exit=[cx+dx,cy+dy];p.look_off=0;p.angle=p.hide_dir;p.x=cx;p.y=cy;
      p.cam=[cx+dx*.44,cy+dy*.44];p.hide_cd=.5;this.monsters.forEach(m=>{
      if(m.state===CHASE&&m.seen&&hyp(m.x-cx,m.y-cy)<6.5){m.alert([cx,cy]);m.lurk=5.6}})}
    else if(k==="stand"){this.ui_stand=it.o;this.mode="drawers";this.grab(false)}
    else if(k==="gate"){if(this.keys<KEYS)this.notify("Ворота заперты. Нужно ключей: "+KEYS+" (у тебя "+this.keys+").",3);else{this.mode="keypad";this.pad="";this.pad_msg="";this.grab(false)}}
    else if(k==="lift")this.notify("Лифт не работает.",2.5);
    else if(k==="stairs")this.use_stairs()}
  use_stairs(){const p=this.player,L=this.level;p.floor=1-p.floor;const[ex,ey,a]=L.stairs_exit[p.floor];p.hidden=false;p.x=ex;p.y=ey;p.angle=a;p.cam=[ex,ey];
    p.moving=p.sprinting=false;this.fade=1;this.interact=null;this.notify(p.floor?"Ты поднялся на 2 этаж.":"Ты спустился на 1 этаж.",2.5)}
  open(i){const n=this.ui_stand;if(!n||n.opened[i])return;n.opened[i]=true;const k=n.drawers[i][0];
    if(k==="key"){this.keys++;this.notify("Ты нашёл КЛЮЧ ("+this.keys+"/"+KEYS+").",this.keys<KEYS?3:5)}else if(k==="code"){this.has_code=true;this.notify("Ты нашёл записку с кодом: "+this.level.code,5)}}
  close(){this.mode="play";this.ui_stand=null;this.grab(true)}
  submit(){if(this.pad===this.level.code){this.mode="win";this.stopLoops();this.grab(false)}
    else{this.pad="";this.pad_msg="НЕВЕРНЫЙ КОД";this.shake=.6;{const gc=this.level.gate_c,m=this.monsters.filter(m=>m.floor===0).sort((a,b)=>hyp(a.x-gc[0],a.y-gc[1])-hyp(b.x-gc[0],b.y-gc[1]))[0];if(m)m.alert(gc)}}}
  kp(c){if(c==="<")this.pad=this.pad.slice(0,-1);else if(c==="X")this.close();else if(this.pad.length<4){this.pad+=c;this.pad_msg="";if(this.pad.length===4)this.submit()}}
  blocked(x,y){const L=this.level,f=this.player.floor,r=.22;for(const ox of[-r,r])for(const oy of[-r,r])if(L.solid(x+ox,y+oy,f))return true;
    for(const n of L.floors[f].stands)if(hyp(x-n.x,y-n.y)<.55)return true;return hyp(x-L.stairs.x,y-L.stairs.y)<.5}
  update_player(dt){const p=this.player,tc=TOUCH?this.touch:null;
    let turn=(TOUCH?0:cl(mouseDX,-300,300))*.0024+((keys.has("ArrowRight")?1:0)-(keys.has("ArrowLeft")?1:0))*2*dt;mouseDX=0;if(tc)turn+=tc.pop()*.005;
    p.hide_cd=Math.max(0,p.hide_cd-dt);
    if(p.hidden){p.look_off=cl(p.look_off+turn,-.45,.45);p.angle=p.hide_dir+p.look_off;p.sprinting=p.moving=false;p.stamina=Math.min(1,p.stamina+.25*dt);return}
    p.angle+=turn;if(this.mode!=="play"){p.moving=p.sprinting=false;return}
    const fx=Math.cos(p.angle),fy=Math.sin(p.angle),rx=-fy,ry=fx,k=c=>keys.has(c)?1:0;
    let mv=(k("KeyW")||k("ArrowUp"))-(k("KeyS")||k("ArrowDown")),st=k("KeyD")-k("KeyA");if(tc){mv-=tc.move[1];st+=tc.move[0]}
    const vx=fx*mv+rx*st,vy=fy*mv+ry*st,n=hyp(vx,vy);p.moving=n>0;
    const want=(k("ShiftLeft")||k("ShiftRight")||(tc&&tc.sprint))&&p.moving;if(tc&&p.exhausted)tc.sprint=false;if(p.exhausted&&p.stamina>.3)p.exhausted=false;
    p.sprinting=!!(want&&!p.exhausted&&p.stamina>0);
    if(p.sprinting){p.stamina-=.26*dt;if(p.stamina<=0){p.stamina=0;p.exhausted=true}}else p.stamina=Math.min(1,p.stamina+.16*dt);
    if(n>0){const sp=(p.sprinting?3.9:2.3)*dt,dx=vx/n*sp,dy=vy/n*sp;if(!this.blocked(p.x+dx,p.y))p.x+=dx;if(!this.blocked(p.x,p.y+dy))p.y+=dy;p.bob_t+=dt*(p.sprinting?11:7)}
    p.cam=[p.x,p.y]}
  update(dt){this.t+=dt;if(this.mode!==this._tm){this.touch.reset();this._tm=this.mode}
    if(this.msg_t>0)this.msg_t-=dt;this.shake=Math.max(0,this.shake-dt);if(this.mode==="pause")return;
    if(["play","drawers","keypad"].includes(this.mode)){this.play_time+=dt;this.fade=Math.max(0,this.fade-dt/1.4);this.update_player(dt);this.update_light(dt);
      this.monsters.forEach(m=>m.update(dt,this));this.update_prox();if(this.mode==="play")this.interact=this.find_interact();this.update_audio()}
    else if(this.mode==="jumpscare"){this.js_t+=dt;if(this.js_t>=JT){CH.scream.stop();if(this.lives>0)this.respawn();else{this.mode="over";this.grab(false)}}}}
  pause(on){if(on){this.mode="pause";this.grab(false);if(ac)ac.suspend()}else{this.mode="play";this.grab(true);if(ac)ac.resume()}}
  act(a){if(a==="resume")this.pause(false);else if(a==="restart")this.new_game();else if(a==="menu")this.exit="menu"}
  key(e){const c=e.code,m=this.mode;if(c==="F11"){fs();return}
    if(m==="play"){if(c==="KeyE")this.do_interact();else if(c==="KeyF"){if(!this.player.hidden)this.player.torch=!this.player.torch}else if(c==="Escape")this.pause(true)}
    else if(m==="pause"){if(c==="Escape")this.pause(false);else if(c==="KeyQ")this.exit="menu"}
    else if(m==="drawers"){if(c==="Escape"||c==="KeyE")this.close();else if(/^(Digit|Numpad)1$|ArrowUp/.test(c))this.open(0);else if(/^(Digit|Numpad)2$|ArrowDown/.test(c))this.open(1)}
    else if(m==="keypad"){if(c==="Escape")this.close();else if(c==="Backspace")this.kp("<");else if(c==="Enter"||c==="NumpadEnter"){if(this.pad.length===4)this.submit()}else if(/^\d$/.test(e.key))this.kp(e.key)}
    else if(m==="over"){if(c==="Enter")this.new_game();else if(c==="Escape")this.exit="menu"}
    else if(m==="win"&&(c==="Enter"||c==="Escape"))this.exit="menu"}
  tap(p){const m=this.mode;
    if(m==="play")lock();
    else if(m==="pause"||m==="over"||m==="win"){for(const[,a,r]of this.btns())if(inR(r,p))this.act(a)}
    else if(m==="drawers"){const r=this.dr();let hit=false;for(let i=0;i<2;i++)if(inR(r[i],p)){this.open(i);hit=true}
      if(!hit&&(inR(this.closeR(),p)||!inR(this.panel(),p)))this.close()}
    else if(m==="keypad"){for(const[l,r]of this.padKeys()[1])if(inR(r,p)){this.kp(l);break}}}
  touchEv(kind,id,p){if(this.mode!=="play")return;this.touch.feed(kind,id,p);for(const a of this.touch.acts.splice(0)){
    if(a==="e")this.do_interact();else if(a==="f"){if(!this.player.hidden)this.player.torch=!this.player.torch}else if(a==="pause")this.pause(true)}}
  // ---- рендер мира
  render_world(){const p=this.player,L=this.level,[cx,cy]=p.cam,ang=p.angle,bob=p.moving&&!p.hidden?Math.trunc(Math.sin(p.bob_t)*2):0,hor=(RH>>1)+bob,bg=BGS[p.torch?1:0];
    for(let y=0;y<RH;y++)buf.fill(bg[y+4-bob],y*RW,(y+1)*RW);
    const R=p.torch?11:7,fd=p.floor?.8:1,dx_=Math.cos(ang),dy_=Math.sin(ang),plx=-dy_*K,ply=dx_*K;zb.fill(99);
    const vl=(c,top,h,v)=>{const a=Math.max(0,top),b=Math.min(RH,top+h);for(let y=a;y<b;y++)buf[y*RW+c]=v};
    for(let c=0;c<RW;c++){const cm=2*c/RW-1,[perp,t,wx,side,mx,my]=this.cast(cx,cy,dx_+plx*cm,dy_+ply*cm);zb[c]=perp;const f=1-perp/R;if(f<=0)continue;
      const g=255*Math.pow(f,1.25)*(side?.78:1)*fd,h=Math.floor(PROJ/Math.max(perp,.05)),top=hor-(h>>1),gg=g*VAR[(mx*31+my*17+Math.floor(wx*12))&255];
      if(t===1){vl(c,top,h,Math.min(255,gg));const bh=Math.max(1,Math.floor(h/11)),c2=gg*.42;vl(c,top+h-bh,bh,c2);vl(c,top,Math.max(1,Math.floor(h/28)),c2)}
      else if(t===2){let v=Math.min(255,gg*1.18*(Math.floor(wx*36)&1?.86:1));if(wx>.485&&wx<.515)v=gg*.1;else if(wx<.05||wx>.95)v=gg*.5;vl(c,top,h,v);const c2=gg*.3;
        vl(c,top,Math.max(1,Math.floor(h/14)),c2);const b=Math.max(1,Math.floor(h/10));vl(c,top+h-b,b,c2);
        if((wx>.4&&wx<.44)||(wx>.56&&wx<.6))vl(c,top+Math.floor(h*.46),Math.max(1,Math.floor(h*.12)),Math.min(255,gg*1.7))}
      else if(t===4){vl(c,top,h,(wx*8)%1<.22?Math.min(255,gg):gg*.07);const cr=Math.min(255,gg*.9),b=Math.max(1,Math.floor(h/16));vl(c,top+Math.floor(h*.12),b,cr);vl(c,top+Math.floor(h*.8),b,cr)}
      else if(t===5){let v=Math.min(255,gg*1.1);if(wx>.49&&wx<.51)v=gg*.15;vl(c,top,h,v);if(wx>.45&&wx<.55)vl(c,top+Math.floor(h*.04),Math.max(1,Math.floor(h/22)),255)}}
    const eyes=[],light=this.light;
    for(const[lx,ly]of L.floors[p.floor].lamps){const sx=lx-cx,sy=ly-cy,d=sx*dx_+sy*dy_;if(d<.3||d>14)continue;const lat=-sx*dy_+sy*dx_,scx=RW/2*(1+lat/(d*K)),
      wl=Math.max(2,Math.floor(PROJ*.55/d)),hl=Math.max(1,Math.floor(PROJ*.14/d)),ys=hor-Math.floor(PROJ*.5/d),v=Math.min(255,255*light*Math.min(1,1.4-d/12));if(v<=4)continue;
      const x0=Math.floor(scx-wl/2);for(let c=Math.max(0,x0);c<Math.min(RW,x0+wl);c++)if(d<zb[c])vl(c,ys,hl,v)}
    const items=L.floors[p.floor].stands.map(n=>[(n.x-cx)*dx_+(n.y-cy)*dy_,"stand",n]);const st=L.stairs;items.push([(st.x-cx)*dx_+(st.y-cy)*dy_,"stairs",st]);
    for(const m of this.monsters)if(m.floor===p.floor)items.push([(m.x-cx)*dx_+(m.y-cy)*dy_,"mon",m]);items.sort((a,b)=>b[0]-a[0]);
    for(const[d,k,o]of items){if(d<.2||d>16)continue;const lat=-(o.x-cx)*dy_+(o.y-cy)*dx_,scx=RW/2*(1+lat/(d*K));
      const[wu,hu,sp]=k==="stand"?[.5,.36,SPR_STAND]:k==="stairs"?[.62,.92,SPR_STAIRS[p.floor]]:[SPR_MONS[o.type].wu,SPR_MONS[o.type].hu,SPR_MONS[o.type]];
      const sw=Math.floor(PROJ*wu/d),sh=Math.floor(PROJ*hu/d);if(sw<1||sh<1||sh>900)continue;
      const bot=hor+Math.floor(PROJ*.5/d),top=bot-sh,x0=Math.floor(scx-sw/2),c0=Math.max(0,x0),c1=Math.min(RW,x0+sw);if(c0>=c1)continue;
      if(k==="mon"&&sp.ey&&scx>=0&&scx<RW&&d<zb[Math.floor(scx)])eyes.push([scx,top+sh*sp.ey,sw,sh,d]);
      const br=k==="mon"?1:Math.floor(255*Math.pow(Math.max(0,1-d/R),1.25)*.9)/255;
      for(let c=c0;c<c1;c++){if(d>=zb[c])continue;const u=Math.floor((c-x0)*sp.w/sw);
        for(let y=Math.max(0,top);y<Math.min(RH,top+sh);y++){const i=Math.floor((y-top)*sp.h/sh)*sp.w+u,a=sp.al[i];if(!a)continue;const v=sp.gy[i]*br,j=y*RW+c;buf[j]=a===255?v:buf[j]*(1-a/255)+v*a/255}}}
    if(p.hidden){buf.fill(0,0,Math.floor(RH*.3)*RW);buf.fill(0,Math.floor(RH*.7)*RW);for(let x=0;x<RW;x+=7)for(let y=0;y<RH;y++){buf[y*RW+x]=0;if(x+1<RW)buf[y*RW+x+1]=0}}
    let dm=1-Math.floor(Math.max(0,1-light)*225)/255*(1-light>.02?1:0);if(this.fstate==="long")dm=p.torch?.5:.14;
    for(let i=0;i<buf.length;i++)buf[i]*=dm*VIG[i];
    for(const[scx,ey,sw,sh,d]of eyes){const rr=Math.max(1,Math.floor(sh*.011)),v=Math.max(150,255-d*7|0);
      for(const s of[-1,1]){const ex=Math.floor(scx+s*sw*.1),ee=Math.floor(ey);for(let yy=-rr;yy<=rr;yy++)for(let xx=-rr;xx<=rr;xx++)
        if(xx*xx+yy*yy<=rr*rr&&ex+xx>=0&&ex+xx<RW&&ee+yy>=0&&ee+yy<RH)buf[(ee+yy)*RW+ex+xx]=v}}
    const gi=ri(0,7),g1=GRAIN[gi],m0=this.monsters[0],near=m0.floor===p.floor?hyp(m0.x-p.x,m0.y-p.y):99;for(let i=0;i<buf.length;i++)buf[i]+=g1[i];
    if(near<7){const g2=GRAIN[(gi+3)%8];for(let i=0;i<buf.length;i++)buf[i]+=g2[i]}
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
  hud(){const p=this.player;for(let i=0;i<LIVES;i++)heart(40+i*42,38,30,i<this.lives?"#ebebeb":"#373737");T("ЭТАЖ "+(p.floor+1),F(22),30,66,"#c8c8c8");
    ctx.fillStyle="#1e1e1e";ctx.fillRect(30,H-36,180,8);ctx.fillStyle=p.exhausted?"#787878":"#dcdcdc";ctx.fillRect(30,H-36,180*p.stamina,8);
    const it=[];it.push("КЛЮЧИ: "+this.keys+"/"+KEYS);if(this.has_code)it.push("КОД: "+this.level.code);
    it.forEach((s,i)=>{ctx.font=F(22);const w=ctx.measureText(s).width,r=rect(W-30-w-7,24+i*30-3,w+14,32);box(r,"#000","#c8c8c8",1);T(s,F(22),W-30-w,24+i*30,"#f0f0f0")});
    if(p.torch)T("[F] фонарь",F(22),30,H-66,"#c8c8c8");
    if(this.mode==="play"&&this.interact){const tip={unhide:"[E] Выйти из шкафа",hide:"[E] Спрятаться",stand:"[E] Открыть тумбочку",gate:"[E] Ворота",lift:"[E] Лифт",
      stairs:p.floor?"[E] Спуститься на 1 этаж":"[E] Подняться на 2 этаж"}[this.interact.k];T(tip,F(32,1),W/2,H-110,0,1)}
    if(this.msg_t>0)T(this.msg,F(22),W/2,90,"#ebebeb",1,Math.min(1,this.msg_t));
    if(p.hidden)T("Ты в шкафу. Тише...  [E] выйти",F(22),W/2,H-40,"#a0a0a0",1);
    if(this.mode==="play"&&!TOUCH&&!locked)T("Кликни по экрану, чтобы управлять мышью",F(22),W/2,H-150,"#a0a0a0",1)}
  draw(){const m=this.mode;
    if(m==="jumpscare"){this.draw_js();return}
    if(m==="over"||m==="win"){ctx.fillStyle="#000";ctx.fillRect(0,0,W,H);
      if(m==="over"){T("ТЫ ПОГИБ",F(120,1),W/2,H/2-100,"#fff",1);if(!TOUCH){T("Enter — начать заново",F(32,1),W/2,H/2+40,"#bebebe",1);T("Esc — в меню",F(32,1),W/2,H/2+88,"#bebebe",1)}}
      else{const mi=Math.floor(this.play_time/60),s=Math.floor(this.play_time%60);T("ТЫ СБЕЖАЛ",F(120,1),W/2,H/2-100,"#f0f0f0",1);
        T("Время: "+String(mi).padStart(2,"0")+":"+String(s).padStart(2,"0"),F(32,1),W/2,H/2+40,"#bebebe",1);T("Жизней осталось: "+this.lives,F(32,1),W/2,H/2+88,"#bebebe",1);
        if(!TOUCH)T("Enter — в меню",F(32,1),W/2,H/2+136,"#bebebe",1)}
      this.btns().forEach(([l,,r])=>this.btn(l,r));return}
    this.render_world();ctx.imageSmoothingEnabled=false;ctx.drawImage(world,0,0,W,H);ctx.imageSmoothingEnabled=true;this.draw_prox();
    if(this.fade>0){ctx.fillStyle=`rgba(0,0,0,${Math.min(1,this.fade)})`;ctx.fillRect(0,0,W,H)}
    this.hud();if(TOUCH&&m==="play")this.touch.draw(!!this.interact);
    if(m==="drawers")this.draw_drawers();else if(m==="keypad")this.draw_keypad();
    else if(m==="pause"){ctx.fillStyle="rgba(0,0,0,.78)";ctx.fillRect(0,0,W,H);T("ПАУЗА",F(120,1),W/2,H/2-70,0,1);
      if(!TOUCH)T("Esc — продолжить     Q — в меню",F(32,1),W/2,H/2+50,"#bebebe",1);this.btns().forEach(([l,,r])=>this.btn(l,r))}}
  draw_prox(){for(const m of this.monsters){if(m.type===0||m.prox<.02)continue;const nz=m.type===1?noiseR:noiseB,col=m.type===1?"200,0,0":"215,190,140";
    ctx.save();ctx.globalCompositeOperation="lighter";ctx.imageSmoothingEnabled=false;ctx.globalAlpha=Math.min(1,m.prox*1.1);ctx.drawImage(nz[ri(0,5)],0,0,W,H);
    const gd=ctx.createRadialGradient(W/2,H/2,H*.25,W/2,H/2,H*.9);gd.addColorStop(0,`rgba(${col},0)`);gd.addColorStop(1,`rgba(${col},${.55*m.prox})`);ctx.globalAlpha=1;ctx.fillStyle=gd;ctx.fillRect(0,0,W,H);ctx.restore()}}
  draw_drawers(){ctx.fillStyle="rgba(0,0,0,.75)";ctx.fillRect(0,0,W,H);const pn=this.panel();box(pn,"#262626","#c8c8c8",3);T("ТУМБОЧКА",F(32,1),W/2,pn.y+44,0,1);
    const cr=this.closeR();box(cr,"#3c3c3c","#d2d2d2",2);T("X",F(22),cr.x+cr.w/2,cr.y+cr.h/2,0,1);const n=this.ui_stand;
    this.dr().forEach((r,i)=>{const op=n.opened[i];box(r,op?"#161616":"#5c5c5c","#d2d2d2",2);const cx=r.x+r.w/2,cy=r.y+r.h/2;
      if(!op){circ(cx,cy,10,"#ebebeb");T(""+(i+1),F(22),r.x+14,r.y+10,"#141414")}
      else{const[k,txt]=n.drawers[i];if(k==="key"){ctx.strokeStyle="#ebebeb";ctx.lineWidth=5;ctx.beginPath();ctx.arc(cx-40,cy,20,0,7);ctx.stroke();ctx.lineWidth=6;ctx.beginPath();
          ctx.moveTo(cx-18,cy);ctx.lineTo(cx+60,cy);ctx.moveTo(cx+40,cy);ctx.lineTo(cx+40,cy+18);ctx.moveTo(cx+58,cy);ctx.lineTo(cx+58,cy+14);ctx.stroke();T("КЛЮЧ",F(22),cx,r.y+r.h-22,0,1)}
        else if(k==="code"){box(rc(cx,cy,220,110),"#e1e1e1");T("КОД",F(22),cx,cy-33,"#1e1e1e",1);T(txt,F(32,1),cx,cy+13,"#0a0a0a",1)}else T(txt,F(22),cx,cy,"#c8c8c8",1)}});
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
      for(let i=0;i<LIVES;i++)heart(W/2+(i-1)*60,H-55,40,i<this.lives?"#f0f0f0":"#3c3c3c")}
    if(t>JT-.5){ctx.fillStyle=`rgba(0,0,0,${Math.min(1,(t-(JT-.5))/.5)})`;ctx.fillRect(0,0,W,H)}}
}

// ---------------------------------------------------------------- меню
const noise=[],noiseR=[],noiseB=[];let scene="load",game=null,sel=0,flick=1,mrects=[],loreT=0;
const KEY_LINES=["WASD — ходьба          Мышь / ← → — поворот","Клик по экрану — захватить мышь","Shift — бег (выносливость ограничена)",
  "E — взаимодействовать (шкаф, тумбочка, ворота)","F — фонарь (видишь дальше, но и он тебя тоже)","Esc — пауза          F11 — полный экран"];
const TOUCH_LINES=["ЛЕВЫЙ ПАЛЕЦ — джойстик: куда тянешь, туда идёшь","ПРАВЫЙ ПАЛЕЦ — води по экрану, чтобы поворачивать","БЕГ — включить / выключить бег (выносливость ограничена)",
  "E — взаимодействовать (шкаф, тумбочка, ворота, лестница)","F — фонарь (видишь дальше, но и он тебя тоже)","II — пауза"];
const GOAL=["","ЦЕЛЬ: найди 5 КЛЮЧЕЙ и КОД (на обоих этажах),","дойди до ворот на 1 этаже и введи код.","Лестница (E) — проём между этажами. Монстры ходят по обоим.",
  "В шкафах можно спрятаться. Если монстр видел — найдёт.","Монстров трое: ЧЁРНЫЙ, ВАРЁНЫЙ (красный шум), САРАНЧА (бежевый).","3 жизни. У ворот монстры не ходят. Но свет однажды погаснет..."];
function addNoise(i){ctx.globalCompositeOperation="lighter";ctx.imageSmoothingEnabled=false;ctx.drawImage(noise[i],0,0,W,H);ctx.imageSmoothingEnabled=true;ctx.globalCompositeOperation="source-over"}
function drawMenu(){
  if(Math.random()<.04)flick=pick([.15,.5,1,.3]);else flick+=(1-flick)*.2;
  ctx.fillStyle="#030303";ctx.fillRect(0,0,W,H);
  const gd=ctx.createRadialGradient(W/2,H/2-60,0,W/2,H/2-60,420);gd.addColorStop(0,`rgba(255,255,255,${.07*flick})`);gd.addColorStop(1,"rgba(255,255,255,0)");ctx.fillStyle=gd;ctx.fillRect(0,0,W,H);
  addNoise(ri(0,5));const v=235*flick;
  if(Math.random()<.08)for(const d of[-6,6])T("WORST NIGHTMARE",F(100,1),W/2+d+ri(-4,4),170+ri(-3,3),"#464646",1);
  ctx.font=F(100,1);ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillStyle=gr(v);ctx.fillText("WORST NIGHTMARE",W/2,170);
  const items=[["ИГРАТЬ","play"],["УПРАВЛЕНИЕ","controls"]];mrects=[];
  items.forEach(([l],i)=>{const a=i===sel;ctx.font=F(44,1);const s=a?"> "+l+" <":l,w=ctx.measureText(s).width;
    ctx.fillStyle=a?"#f5f5f5":"#6e6e6e";ctx.fillText(s,W/2,360+i*80);mrects.push(rc(W/2,360+i*80,w+160,40+44))});
  ctx.font=F(26);ctx.fillStyle="#5f5f5f";ctx.fillText(TOUCH?"коснись пункта меню":"↑↓ / мышь — выбор     Enter — подтвердить",W/2,H-40);
  ctx.fillStyle="#000";for(let y=0;y<H;y+=4)ctx.fillRect(0,y,W,1)}
function drawControls(){ctx.fillStyle="#040404";ctx.fillRect(0,0,W,H);addNoise(ri(0,5));T("УПРАВЛЕНИЕ",F(64,1),W/2,80,"#ebebeb",1);
  [...(TOUCH?TOUCH_LINES:KEY_LINES),...GOAL].forEach((s,i)=>T(s,F(26),W/2,160+i*36,"#c8c8c8",1));
  T(TOUCH?"коснись экрана — назад":"любая клавиша — назад",F(26),W/2,H-36,"#787878",1)}
const LORE=["Ты очнулся в бесконечном сером лабиринте.","Холодные бетонные стены давят со всех сторон,","а в темноте за спиной слышатся чьи-то шаги.","Твоя единственная цель — найти выход,","пока монстры не добрались до тебя.","","Двигайся тихо и не оборачивайся."];
function drawLore(){ctx.fillStyle="#020202";ctx.fillRect(0,0,W,H);addNoise(ri(0,5));
  LORE.forEach((s,i)=>{const a=cl((loreT-i*1.6)/1.2,0,1);if(a>0)T(s,F(34),W/2,190+i*56,i===6?"#f0f0f0":"#cfcfcf",1,a)});
  if(loreT>LORE.length*1.6)T(TOUCH?"коснись экрана":"любая клавиша — начать",F(26),W/2,H-50,"#787878",1,.5+.5*Math.sin(loreT*3))}
function startGame(){game=new Game();scene="game"}
function menuAct(a){if(a==="controls")scene="controls";else if(a==="play"){CH.lamp.stop();if(TOUCH)fs();scene="lore";loreT=0}}
function menuKey(c){if(c==="ArrowUp"||c==="KeyW")sel=(sel+1)%2;else if(c==="ArrowDown"||c==="KeyS")sel=(sel+1)%2;else if(c==="Enter"||c==="Space")menuAct(["play","controls"][sel])}

// ---------------------------------------------------------------- ввод
const posOf=e=>{const r=cv.getBoundingClientRect();return[(e.clientX-r.left)*W/r.width,(e.clientY-r.top)*H/r.height]};
addEventListener("keydown",e=>{unlock();if(["Space","Tab","Backspace","ArrowUp","ArrowDown","ArrowLeft","ArrowRight","F1","F11"].includes(e.code))e.preventDefault();
  if(e.repeat)return;keys.add(e.code);
  if(scene==="menu")menuKey(e.code);else if(scene==="controls")scene="menu";else if(scene==="lore"){if(loreT>.8)startGame()}else if(scene==="game")game.key(e)});
addEventListener("keyup",e=>keys.delete(e.code));addEventListener("blur",()=>keys.clear());
addEventListener("contextmenu",e=>e.preventDefault());
document.addEventListener("touchmove",e=>e.preventDefault(),{passive:false});
document.addEventListener("mousemove",e=>{if(document.pointerLockElement===cv)mouseDX+=e.movementX});
document.addEventListener("pointerlockchange",()=>{const was=locked;locked=document.pointerLockElement===cv;if(was&&!locked&&scene==="game"&&game.mode==="play")game.pause(true)});
document.addEventListener("visibilitychange",()=>{if(document.hidden&&scene==="game"&&game.mode==="play")game.pause(true)});
cv.addEventListener("pointerdown",e=>{unlock();e.preventDefault();
  if(e.pointerType==="touch"){TOUCH=true;try{cv.setPointerCapture(e.pointerId)}catch(_){}}else if(e.button!==0)return;
  const p=posOf(e);
  if(scene==="menu"){mrects.forEach((r,i)=>{if(inR(r,p)){sel=i;menuAct(["play","controls"][i])}})}
  else if(scene==="controls")scene="menu";
  else if(scene==="lore"){if(loreT>.8)startGame()}
  else if(scene==="game"){const wasPlay=game.mode==="play";game.tap(p);if(e.pointerType==="touch"&&wasPlay)game.touchEv("down",e.pointerId,p)}});
cv.addEventListener("pointermove",e=>{const p=posOf(e);
  if(e.pointerType==="touch"){if(scene==="game")game.touchEv("move",e.pointerId,p)}else if(scene==="menu")mrects.forEach((r,i)=>{if(inR(r,p))sel=i})});
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
function frame(now){requestAnimationFrame(frame);if(now-last<12)return;const dt=Math.min((now-last)/1000,.05);last=now;
  if(scene==="load"){ctx.fillStyle="#000";ctx.fillRect(0,0,W,H);T("ЗАГРУЗКА...",F(32),W/2,H/2,"#888",1);return}
  if(scene==="menu"){if(SND.lamp&&ac&&ac.state==="running"&&!CH.lamp.busy())CH.lamp.play(SND.lamp,1,.25,.25);drawMenu()}
  else if(scene==="lore"){loreT+=dt;drawLore()}
  else if(scene==="controls")drawControls();
  else{game.update(dt);if(game.exit){game.stopLoops();CH.scream.stop();if(ac)ac.resume();unlockMouse();game=null;scene="menu"}else game.draw()}}
requestAnimationFrame(frame);
["jumpscare.png","jumpscare_boiled.png","jumpscare_locust.png"].forEach((f,t)=>{const im=new Image();JIMG[t]=im;im.onload=()=>buildJump(t,true);im.onerror=()=>buildJump(t,false);im.src=f});
const fl=Promise.all([document.fonts.load("26px MonoFont","Аб"),document.fonts.load("26px MonoFontBold","Аб")]).catch(()=>{});
Promise.race([fl,new Promise(r=>setTimeout(r,4000))]).then(()=>{for(let t=0;t<3;t++)if(!JUMPS[t])buildJump(t,false);init()});
