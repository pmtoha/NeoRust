'use strict';
/* =====================================================
   NEON RUSH — Enhanced Speed Racer
   All graphics: Canvas 2D · All audio: Web Audio API
   ===================================================== */

// ---------- DOM ----------
const $ = id => document.getElementById(id);
const startScreen=$('startScreen'), startButton=$('startButton'), menuBest=$('menuBest');
const gameContainer=$('gameContainer'), canvas=$('gameCanvas'), ctx=canvas.getContext('2d');
const scoreVal=$('scoreVal'), coinVal=$('coinVal'), distVal=$('distVal'),
      levelVal=$('levelVal'), speedVal=$('speedVal'), bestVal=$('bestVal'),
      comboTag=$('comboTag'), nitroFill=$('nitroFill'),
      pauseBtn=$('pauseBtn'), muteBtn=$('muteBtn'),
      countdownEl=$('countdown'),
      pauseOverlay=$('pauseOverlay'), gameoverOverlay=$('gameoverOverlay'),
      newRecordEl=$('newRecord'),
      goScore=$('goScore'), goCoins=$('goCoins'), goDist=$('goDist'),
      goLevel=$('goLevel'), goBest=$('goBest'),
      leftBtn=$('leftBtn'), rightBtn=$('rightBtn');

// ---------- Constants ----------
const W=400, H=600, ROAD_X=50, ROAD_W=300, LANES=4, LANE_W=ROAD_W/LANES;
const BOOST_MAX=3500, SHIELD_MAX=8000;
const ECOLORS=['#e05252','#e0a13a','#4fa8e0','#7bc86f','#b06fd0','#d8d8d8'];
const BLDG=['#141b30','#101728','#1a2340','#0d1322','#182035'];
const STATE={MENU:0,COUNTDOWN:1,PLAYING:2,PAUSED:3,GAMEOVER:4};

// ---------- State ----------
let state=STATE.MENU, lastTime=0, time=0;
let score=0, coinCount=0, distance=0, level=1, combo=1, comboTimer=0;
let highScore=0, newRecord=false;
try{ highScore=parseInt(localStorage.getItem('neonRushHigh'))||0; }catch(e){}
let roadSpeed=4.6, scrollRoad=0, scrollSide=0;
let boostTime=0, shake=0, flash=0;
let countdownTime=0, cdLabel='';
let goTimeout=null;

const car={ x:W/2-20, y:H-115, w:40, h:64, tilt:0, touchX:null,
            shield:false, shieldTime:0, dead:false };

let obstacles=[], coins=[], powerups=[], particles=[], floaters=[], lines=[];
const spawnT={obs:800, coin:900, pow:6000};
const keys={left:false, right:false};

// ---------- Helpers ----------
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const rnd=(a,b)=>a+Math.random()*(b-a);
const pick=a=>a[Math.floor(Math.random()*a.length)];
function rrPath(x,y,w,h,r){
  r=Math.min(r,w/2,h/2); ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r);     ctx.arcTo(x,y,x+w,y,r);
  ctx.closePath();
}
function shade(hex,m){
  const n=parseInt(hex.slice(1),16);
  const r=Math.min(255,((n>>16)&255)*m|0), g=Math.min(255,((n>>8)&255)*m|0), b=Math.min(255,(n&255)*m|0);
  return `rgb(${r},${g},${b})`;
}
function saveHS(){ try{ localStorage.setItem('neonRushHigh', highScore); }catch(e){} }

// HiDPI canvas
(function setupCanvas(){
  const dpr=Math.min(window.devicePixelRatio||1,2);
  canvas.width=W*dpr; canvas.height=H*dpr;
  canvas.style.width=W+'px'; canvas.style.height=H+'px';
  ctx.setTransform(dpr,0,0,dpr,0,0);
})();

// ---------- World generation ----------
const stars=[]; for(let i=0;i<90;i++) stars.push({x:Math.random()*W, y:Math.random()*H*.9, r:Math.random()<.8?1:2, ph:Math.random()*7});
function genSide(xBase, span){
  const arr=[]; let y=-20;
  while(y<H*1.7){
    const w=rnd(24,44), h=rnd(46,145);
    const cols=Math.max(1,Math.floor((w-6)/9)), rows=Math.max(2,Math.floor((h-8)/12));
    const lit=[]; for(let i=0;i<cols*rows;i++) lit.push(Math.random()<.55?1:0);
    arr.push({x:xBase+Math.random()*Math.max(1,span-w), w, h, y, c:pick(BLDG), cols, rows, lit});
    y+=h+rnd(4,14);
  }
  arr.S=y+20; return arr;
}
const leftB=genSide(1, ROAD_X-6), rightB=genSide(ROAD_X+ROAD_W+5, W-ROAD_X-ROAD_W-6);

let vignette;
(function(){ const v=ctx.createRadialGradient(W/2,H/2,H*.32,W/2,H/2,H*.75);
  v.addColorStop(0,'rgba(0,0,0,0)'); v.addColorStop(1,'rgba(0,0,12,.45)'); vignette=v; })();

// =====================================================
//  AUDIO — Web Audio API (synthesized, no files)
// =====================================================
let AC=null, master, sfxBus, musicBus, noiseBuf, muted=false;
try{ muted = localStorage.getItem('neonRushMuted')==='1'; }catch(e){}

function initAudio(){
  if(AC){ if(AC.state==='suspended') AC.resume(); return; }
  AC=new (window.AudioContext||window.webkitAudioContext)();
  master=AC.createGain(); master.gain.value=muted?0:0.9; master.connect(AC.destination);
  sfxBus=AC.createGain(); sfxBus.gain.value=0.9; sfxBus.connect(master);
  musicBus=AC.createGain(); musicBus.gain.value=0.5; musicBus.connect(master);
  noiseBuf=AC.createBuffer(1,AC.sampleRate*0.5,AC.sampleRate);
  const d=noiseBuf.getChannelData(0);
  for(let i=0;i<d.length;i++) d[i]=Math.random()*2-1;
}
function noteAt(freq,when,dur,type='square',vol=0.12,lp=0,slideTo=0,bus){
  if(!AC) return;
  bus=bus||sfxBus;
  const o=AC.createOscillator(), g=AC.createGain();
  o.type=type; o.frequency.setValueAtTime(freq,when);
  if(slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20,slideTo),when+dur);
  g.gain.setValueAtTime(vol,when);
  g.gain.exponentialRampToValueAtTime(0.001,when+dur);
  let node=o;
  if(lp){ const f=AC.createBiquadFilter(); f.type='lowpass'; f.frequency.value=lp; o.connect(f); node=f; }
  node.connect(g); g.connect(bus);
  o.start(when); o.stop(when+dur+0.05);
}
function tone(freq,dur,type,vol,slideTo,delay){
  if(!AC) return;
  noteAt(freq, AC.currentTime+(delay||0), dur, type||'square', vol||0.14, 0, slideTo||0, sfxBus);
}
function noiseHit(when,dur,vol,filterType,freq,bus){
  if(!AC) return;
  const s=AC.createBufferSource(); s.buffer=noiseBuf; s.loop=true;
  const f=AC.createBiquadFilter(); f.type=filterType; f.frequency.value=freq;
  const g=AC.createGain();
  g.gain.setValueAtTime(vol,when); g.gain.exponentialRampToValueAtTime(0.001,when+dur);
  s.connect(f); f.connect(g); g.connect(bus||sfxBus);
  s.start(when); s.stop(when+dur+0.05);
}
function kick(t){
  if(!AC) return;
  const o=AC.createOscillator(), g=AC.createGain();
  o.type='sine'; o.frequency.setValueAtTime(140,t);
  o.frequency.exponentialRampToValueAtTime(38,t+0.12);
  g.gain.setValueAtTime(0.55,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.17);
  o.connect(g); g.connect(musicBus); o.start(t); o.stop(t+0.2);
}
// SFX
const sCoin =()=>{ tone(987,.07,'square',.11); tone(1318,.12,'square',.11,0,.06); };
const sBoost=()=>tone(180,.45,'sawtooth',.16,760);
const sShield=()=>{ tone(520,.22,'sine',.14,1040); tone(1560,.14,'sine',.08,0,.08); };
const sShieldBreak=()=>{ tone(300,.3,'square',.2,70); noiseHit(AC?AC.currentTime:0,.2,.2,'highpass',2000); };
const sLevel=()=>[523,659,784,1046].forEach((f,i)=>tone(f,.12,'square',.12,0,i*.09));
const sClick=()=>tone(600,.05,'square',.08);
function sCrash(){
  if(!AC) return; const t=AC.currentTime;
  noiseHit(t,.55,.5,'lowpass',800);
  noteAt(90,t,.4,'sine',.4,0,30,sfxBus);
}
// Engine hum
let engOsc=null;
function startEngine(){
  if(!AC||engOsc) return;
  engOsc=AC.createOscillator(); engOsc.type='sawtooth'; engOsc.frequency.value=55;
  const f=AC.createBiquadFilter(); f.type='lowpass'; f.frequency.value=240;
  const g=AC.createGain(); g.gain.value=0.05;
  engOsc.connect(f); f.connect(g); g.connect(master); engOsc.start(); engOsc._g=g;
}
function setEngine(){
  if(engOsc){ const tgt=40+(boostTime>0?roadSpeed*1.6:roadSpeed)*8;
    engOsc.frequency.value+=(tgt-engOsc.frequency.value)*0.08; }
}
function stopEngine(){ if(engOsc){ try{engOsc.stop();}catch(e){} engOsc=null; } }
// Music sequencer (synthwave loop)
const BPM=126, STEP=60/BPM/2;
let nextStep=0, stepIdx=0;
const ARP=[220,262,330,392,440,392,330,262], BASS=[55,55,65.4,49], MUL=[1,1,1.335,1.498];
setInterval(()=>{
  if(!AC||muted) return;
  if(state!==STATE.PLAYING && state!==STATE.COUNTDOWN){ nextStep=0; return; }
  const now=AC.currentTime;
  if(!nextStep || nextStep<now-0.3) nextStep=now+0.06;
  while(nextStep<now+0.25){
    const i=stepIdx, t=nextStep, bar=(i>>3)&3;
    if(i%4===0) kick(t);
    if(i%4===2) noiseHit(t,.05,.045,'highpass',6000,musicBus);
    if(i%8===4) noiseHit(t,.09,.06,'bandpass',1800,musicBus);
    if(i%2===0) noteAt(BASS[bar],t,.22,'triangle',.2,420,0,musicBus);
    noteAt(ARP[i%8]*MUL[bar]*2,t,.11,'square',.04,1800,0,musicBus);
    stepIdx=(stepIdx+1)%32; nextStep+=STEP;
  }
},80);
function toggleMute(){
  muted=!muted;
  muteBtn.textContent=muted?'🔇':'🔊';
  if(AC) master.gain.value=muted?0:0.9;
  try{ localStorage.setItem('neonRushMuted',muted?'1':'0'); }catch(e){}
}
muteBtn.textContent=muted?'🔇':'🔊';

// =====================================================
//  INPUT
// =====================================================
document.addEventListener('keydown', e=>{
  if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' '].includes(e.key)) e.preventDefault();
  initAudio();
  if(e.code==='ArrowLeft'||e.code==='KeyA')  keys.left=true;
  if(e.code==='ArrowRight'||e.code==='KeyD') keys.right=true;
  if(e.code==='KeyP'||e.code==='Escape') togglePause();
  if(e.code==='KeyM') toggleMute();
  if(e.code==='Space'||e.code==='Enter'){
    if(state===STATE.MENU) startButton.click();
    else if(state===STATE.GAMEOVER && gameoverOverlay.classList.contains('show')) restart();
  }
  if(e.code==='KeyR' && state===STATE.GAMEOVER) restart();
});
document.addEventListener('keyup', e=>{
  if(e.code==='ArrowLeft'||e.code==='KeyA')  keys.left=false;
  if(e.code==='ArrowRight'||e.code==='KeyD') keys.right=false;
});
function bindHold(btn,on,off){
  btn.addEventListener('pointerdown',e=>{ e.preventDefault(); try{btn.setPointerCapture(e.pointerId);}catch(_){} on(); });
  ['pointerup','pointercancel','lostpointercapture'].forEach(ev=>btn.addEventListener(ev,off));
  btn.addEventListener('contextmenu',e=>e.preventDefault());
}
bindHold(leftBtn, ()=>keys.left=true,  ()=>keys.left=false);
bindHold(rightBtn,()=>keys.right=true, ()=>keys.right=false);

// Drag steering on canvas (touch + mouse via Pointer Events)
let dragging=false;
canvas.addEventListener('pointerdown',e=>{ dragging=true; try{canvas.setPointerCapture(e.pointerId);}catch(_){} point(e); });
canvas.addEventListener('pointermove',e=>{ if(dragging) point(e); });
['pointerup','pointercancel'].forEach(ev=>canvas.addEventListener(ev,()=>{ dragging=false; car.touchX=null; }));
function point(e){
  const r=canvas.getBoundingClientRect();
  car.touchX=(e.clientX-r.left)*(W/r.width);
}

// Auto-pause when tab hidden
document.addEventListener('visibilitychange',()=>{ if(document.hidden && state===STATE.PLAYING) pauseGame(); });
window.addEventListener('blur',()=>{ if(state===STATE.PLAYING) pauseGame(); });

// Buttons
pauseBtn.addEventListener('click',()=>{ initAudio(); sClick(); togglePause(); });
muteBtn.addEventListener('click',()=>{ initAudio(); toggleMute(); });
 $('resumeBtn').addEventListener('click',()=>{ sClick(); togglePause(); });
 $('restartBtnP').addEventListener('click',()=>{ sClick(); restart(); });
 $('quitBtn').addEventListener('click',()=>{ sClick(); goMenu(); });
 $('restartBtnG').addEventListener('click',()=>{ sClick(); restart(); });
 $('menuBtnG').addEventListener('click',()=>{ sClick(); goMenu(); });
startButton.addEventListener('click',()=>{ initAudio(); sClick(); startGame(); });

// =====================================================
//  GAME FLOW
// =====================================================
function startGame(){
  startScreen.style.display='none';
  gameContainer.style.display='block';
  resetRace();
}
function resetRace(){
  clearTimeout(goTimeout);
  obstacles=[]; coins=[]; powerups=[]; particles=[]; floaters=[]; lines=[];
  score=0; coinCount=0; distance=0; level=1; combo=1; comboTimer=0;
  boostTime=0; shake=0; flash=0; newRecord=false;
  roadSpeed=4.6; spawnT.obs=900; spawnT.coin=800; spawnT.pow=5500;
  car.x=W/2-car.w/2; car.tilt=0; car.touchX=null;
  car.shield=false; car.shieldTime=0; car.dead=false;
  pauseOverlay.classList.remove('show'); gameoverOverlay.classList.remove('show');
  hud.c={}; updateHUD(); updateComboTag(); nitroFill.style.width='0%';
  state=STATE.COUNTDOWN; countdownTime=3200; cdLabel='';
  countdownEl.style.display='flex';
}
function restart(){ resetRace(); }
function goMenu(){
  state=STATE.MENU; stopEngine(); clearTimeout(goTimeout);
  countdownEl.style.display='none';
  pauseOverlay.classList.remove('show'); gameoverOverlay.classList.remove('show');
  gameContainer.style.display='none';
  startScreen.style.display='flex';
  menuBest.textContent=highScore;
}
function pauseGame(){
  if(state!==STATE.PLAYING) return;
  state=STATE.PAUSED; pauseOverlay.classList.add('show'); stopEngine();
}
function resumeGame(){
  if(state!==STATE.PAUSED) return;
  state=STATE.PLAYING; pauseOverlay.classList.remove('show'); startEngine();
}
function togglePause(){
  if(state===STATE.PLAYING) pauseGame();
  else if(state===STATE.PAUSED) resumeGame();
}
function crash(){
  state=STATE.GAMEOVER; car.dead=true; car.touchX=null;
  stopEngine(); sCrash();
  shake=14; flash=0.5;
  explode(car.x+car.w/2, car.y+car.h/2);
  newRecord = score>highScore;
  if(newRecord){ highScore=score; saveHS(); }
  bestVal.textContent=highScore;
  goScore.textContent=score; goCoins.textContent=coinCount;
  goDist.textContent=Math.floor(distance)+'m'; goLevel.textContent=level;
  goBest.textContent=highScore;
  newRecordEl.classList.toggle('show',newRecord);
  comboTag.classList.remove('on');
  goTimeout=setTimeout(()=>{ if(state===STATE.GAMEOVER) gameoverOverlay.classList.add('show'); },900);
}

// =====================================================
//  SPAWNING
// =====================================================
function topBlocked(x,w){
  return obstacles.some(o=> o.y<140 && o.x<x+w+24 && o.x+o.w>x-24);
}
function spawnObstacle(){
  const roll=Math.random();
  let type,w,h;
  if(roll<0.45){ type='cone'; w=22; h=22; }
  else if(roll<0.75){ type='barrier'; w=rnd(64,114)|0; h=20; }
  else { type='car'; w=38; h=62; }
  for(let t=0;t<8;t++){
    const x=ROAD_X+6+Math.random()*(ROAD_W-w-12);
    if(!topBlocked(x,w)){
      obstacles.push({x,y:-h-10,w,h,type,color:pick(ECOLORS),
        speed:type==='car'?0.55:1, passed:false});
      return true;
    }
  }
  return false;
}
function spawnCoins(){
  const n=Math.random()<0.35?4:1;
  const lane=Math.floor(Math.random()*LANES);
  const cx=ROAD_X+lane*LANE_W+LANE_W/2;
  const diag=n>1&&Math.random()<0.5;
  for(let i=0;i<n;i++)
    coins.push({x:cx+(diag?(i-1.5)*22:0), y:-20-i*44, r:11, ph:Math.random()*7});
}
function spawnPowerup(){
  const kind=(!car.shield&&Math.random()<0.45)?'shield':'boost';
  powerups.push({x:ROAD_X+20+Math.random()*(ROAD_W-54), y:-44, w:34, h:34, kind, ph:Math.random()*7});
}

// =====================================================
//  COLLISIONS
// =====================================================
const hitbox=()=>({x:car.x+7,y:car.y+9,w:car.w-14,h:car.h-16});
function obstacleBox(o){
  const i=o.type==='cone'?4:o.type==='barrier'?3:5;
  return {x:o.x+i,y:o.y+i,w:o.w-2*i,h:o.h-2*i};
}
function rectsCollide(a,b){
  return a.x<b.x+b.w && a.x+a.w>b.x && a.y<b.y+b.h && a.y+a.h>b.y;
}
function circRect(c,r){
  const dx=Math.abs(c.x-(r.x+r.w/2)), dy=Math.abs(c.y-(r.y+r.h/2));
  if(dx>r.w/2+c.r||dy>r.h/2+c.r) return false;
  if(dx<=r.w/2||dy<=r.h/2) return true;
  const ox=dx-r.w/2, oy=dy-r.h/2;
  return ox*ox+oy*oy<=c.r*c.r;
}

// =====================================================
//  FX
// =====================================================
function floater(x,y,text,color,size=15){ floaters.push({x,y,text,color,size,life:900,max:900}); }
function sparkBurst(x,y,color,n){
  for(let i=0;i<n;i++) particles.push({x,y,vx:rnd(-2.2,2.2),vy:rnd(-2.8,1),
    r:rnd(1.5,3.5),life:rnd(350,650),max:650,color,grav:0.05});
}
function explode(x,y){
  const cols=['#ffdd55','#ff8833','#ff4422','#aaaaaa','#ffffff'];
  for(let i=0;i<48;i++) particles.push({x,y,vx:rnd(-6,6),vy:rnd(-7,4),
    r:rnd(2,5),life:rnd(550,1150),max:1150,color:pick(cols),grav:0.12});
}
function exhaust(){
  [car.x+9, car.x+car.w-9].forEach(px=>{
    if(Math.random()<0.55) particles.push({x:px+rnd(-2,2),y:car.y+car.h-3,
      vx:rnd(-.4,.4),vy:rnd(1.4,2.6),r:rnd(1.5,3),life:320,max:320,
      color:boostTime>0?'#41f1ff':'#8a8a94',grav:0});
  });
}
function addScore(v){ score+=v; }

// =====================================================
//  UPDATE
// =====================================================
function updateFX(dt){
  const f=dt/16.666;
  for(let i=particles.length-1;i>=0;i--){
    const p=particles[i];
    p.x+=p.vx*f; p.y+=p.vy*f; if(p.grav) p.vy+=p.grav*f;
    if((p.life-=dt)<=0) particles.splice(i,1);
  }
  for(let i=floaters.length-1;i>=0;i--){
    const fl=floaters[i]; fl.y-=0.55*f;
    if((fl.life-=dt)<=0) floaters.splice(i,1);
  }
  for(let i=lines.length-1;i>=0;i--){
    const l=lines[i]; l.y+=(roadSpeed*3+8)*f;
    if(l.y>H+60) lines.splice(i,1);
  }
  shake*=Math.pow(0.9,f); if(shake<0.3) shake=0;
  flash=Math.max(0,flash-dt*0.0012);
}

function update(dt){
  const f=dt/16.666; time+=dt;
  setEngine();

  // timers
  if(boostTime>0) boostTime=Math.max(0,boostTime-dt);
  if(car.shield && (car.shieldTime-=dt)<=0) car.shield=false;
  if(comboTimer>0 && (comboTimer-=dt)<=0){ combo=1; updateComboTag(); }

  // difficulty / speed
  const target=Math.min(11, 4.6+(level-1)*0.55);
  roadSpeed=boostTime>0?target*1.65:target;
  distance+=roadSpeed*f*0.09;
  const nl=1+Math.floor(distance/350);
  if(nl>level){ level=nl; sLevel(); flash=0.22;
    floater(W/2,185,'LEVEL '+level,'#7df9ff',26); }

  // movement
  const prevX=car.x;
  const lat=5.2*(boostTime>0?1.35:1);
  if(keys.left)  car.x-=lat*f;
  if(keys.right) car.x+=lat*f;
  if(car.touchX!==null){
    const tx=clamp(car.touchX-car.w/2, ROAD_X+4, ROAD_X+ROAD_W-car.w-4);
    const d=tx-car.x, mv=lat*f*1.5;
    car.x+=Math.abs(d)<mv?d:Math.sign(d)*mv;
  }
  car.x=clamp(car.x, ROAD_X+4, ROAD_X+ROAD_W-car.w-4);
  const tTilt=clamp((car.x-prevX)/(lat*f+0.001),-1,1)*0.14;
  car.tilt+=(tTilt-car.tilt)*Math.min(1,0.25*f);

  scrollRoad+=roadSpeed*f; scrollSide+=roadSpeed*f*0.45;

  // spawning
  if((spawnT.obs-=dt)<=0){
    spawnT.obs = spawnObstacle()? Math.max(430,1250-level*75)+Math.random()*300 : 200;
  }
  if((spawnT.coin-=dt)<=0){ spawnCoins(); spawnT.coin=1200+Math.random()*1200; }
  if((spawnT.pow-=dt)<=0){ spawnPowerup(); spawnT.pow=8000+Math.random()*5000; }

  const mv=roadSpeed*f, hb=hitbox();

  // obstacles
  for(let i=obstacles.length-1;i>=0;i--){
    const o=obstacles[i]; o.y+=mv*o.speed;
    if(!o.passed && o.y>car.y+car.h){ o.passed=true; addScore(5); }
    if(o.y>H+90){ obstacles.splice(i,1); continue; }
    if(rectsCollide(hb,obstacleBox(o))){
      if(car.shield){
        car.shield=false; sShieldBreak(); shake=6;
        sparkBurst(o.x+o.w/2,o.y+o.h/2,'#41f1ff',16);
        floater(car.x+car.w/2,car.y-14,'SHIELD!','#41f1ff',18);
        obstacles.splice(i,1); continue;
      }
      return crash();
    }
  }
  // coins
  for(let i=coins.length-1;i>=0;i--){
    const c=coins[i]; c.y+=mv;
    if(c.y>H+30){ coins.splice(i,1); continue; }
    if(circRect(c,hb)){
      coins.splice(i,1);
      const gain=10*combo;
      addScore(gain); coinCount++;
      floater(c.x,c.y-14,'+'+gain+(combo>1?' x'+combo:''),'#ffd94a',15);
      sparkBurst(c.x,c.y,'#ffd94a',8); sCoin();
      combo=Math.min(5,combo+1); comboTimer=2500; updateComboTag();
    }
  }
  // powerups
  for(let i=powerups.length-1;i>=0;i--){
    const p=powerups[i]; p.y+=mv;
    if(p.y>H+40){ powerups.splice(i,1); continue; }
    if(rectsCollide(hb,p)){
      powerups.splice(i,1);
      sparkBurst(p.x+17,p.y+17,p.kind==='boost'?'#5f5':'#4ff',12);
      if(p.kind==='boost'){ boostTime=BOOST_MAX; sBoost();
        floater(p.x+17,p.y,'NITRO!','#7dff7d',18); }
      else { car.shield=true; car.shieldTime=SHIELD_MAX; sShield();
        floater(p.x+17,p.y,'SHIELD!','#41f1ff',18); }
    }
  }

  if(!car.dead) exhaust();
  if(boostTime>0 && Math.random()<0.8)
    lines.push({x:ROAD_X+Math.random()*ROAD_W, y:-40, len:rnd(40,85)});

  updateFX(dt);
  updateHUD();
}

function updateHUD(){
  const set=(el,v)=>{ if(hud.c[el.id]!==v){ hud.c[el.id]=v; el.textContent=v; } };
  set(scoreVal,String(score)); set(coinVal,String(coinCount));
  set(distVal,String(Math.floor(distance))); set(levelVal,String(level));
  set(speedVal,String(Math.round(roadSpeed*16))); set(bestVal,String(highScore));
  nitroFill.style.width=(boostTime/BOOST_MAX*100)+'%';
}
const hud={c:{}};
function updateComboTag(){
  if(combo>1&&comboTimer>0){ comboTag.textContent='COMBO x'+combo; comboTag.classList.add('on'); }
  else comboTag.classList.remove('on');
}

// =====================================================
//  DRAW
// =====================================================
function drawBackground(){
  const g=ctx.createLinearGradient(0,0,0,H);
  g.addColorStop(0,'#070b18'); g.addColorStop(.6,'#0d1730'); g.addColorStop(1,'#131f42');
  ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
  stars.forEach(s=>{
    ctx.globalAlpha=0.25+0.55*Math.abs(Math.sin(time*0.0012+s.ph));
    ctx.fillStyle='#cfe0ff'; ctx.fillRect(s.x,s.y,s.r,s.r);
  });
  ctx.globalAlpha=1;
  drawBuildings(leftB); drawBuildings(rightB);
}
function drawBuildings(list){
  const S=list.S, off=((scrollSide%S)+S)%S;
  for(const b of list){
    let y=((b.y+off)%S+S)%S;
    drawB(b,y); drawB(b,y-S);
  }
}
function drawB(b,y){
  if(y+b.h<0||y>H) return;
  ctx.fillStyle=b.c; ctx.fillRect(b.x,y,b.w,b.h);
  for(let r=0;r<b.rows;r++)for(let c=0;c<b.cols;c++){
    if(b.lit[r*b.cols+c]){
      ctx.fillStyle=(r+c)%5?'rgba(255,214,120,.7)':'rgba(140,220,255,.75)';
      ctx.fillRect(b.x+3+c*9,y+4+r*12,4,6);
    }
  }
}
function drawRoad(){
  ctx.fillStyle='#23232d'; ctx.fillRect(ROAD_X,0,ROAD_W,H);
  ctx.fillStyle='rgba(0,229,255,.28)';
  ctx.fillRect(ROAD_X-2,-2,3,4); ctx.fillRect(ROAD_X+ROAD_W-1,-2,3,4);
  ctx.shadowColor='#00e5ff'; ctx.shadowBlur=10;
  ctx.fillStyle='#00e5ff'; ctx.fillRect(ROAD_X,0,ROAD_W,2.5);
  ctx.shadowBlur=0;
  // curbs
  const off=((scrollRoad%36)+36)%36;
  for(let y=-36+off;y<H;y+=36){
    ctx.fillStyle='#e33'; ctx.fillRect(ROAD_X-8,y,8,18);
    ctx.fillStyle='#eee'; ctx.fillRect(ROAD_X-8,y+18,8,18);
    ctx.fillStyle='#eee'; ctx.fillRect(ROAD_X+ROAD_W,y,8,18);
    ctx.fillStyle='#e33'; ctx.fillRect(ROAD_X+ROAD_W,y+18,8,18);
  }
  // lane dashes
  const dOff=((scrollRoad%44)+44)%44;
  ctx.fillStyle='rgba(255,255,255,.7)';
  for(let k=1;k<LANES;k++){
    const x=ROAD_X+k*LANE_W-2;
    for(let y=-44+dOff;y<H;y+=44) ctx.fillRect(x,y,4,24);
  }
}
function drawCoin(c){
  const t=time*0.005+c.ph, s=1+0.15*Math.sin(t*2), sq=Math.max(0.25,Math.abs(Math.cos(t)));
  ctx.save(); ctx.translate(c.x,c.y); ctx.scale(sq*s,s);
  ctx.shadowColor='rgba(255,200,40,.9)'; ctx.shadowBlur=12;
  ctx.fillStyle='#ffcc33'; ctx.beginPath(); ctx.arc(0,0,c.r,0,7); ctx.fill();
  ctx.shadowBlur=0;
  ctx.fillStyle='#e6a817'; ctx.beginPath(); ctx.arc(0,0,c.r*.72,0,7); ctx.fill();
  ctx.fillStyle='#7a5000'; ctx.font='bold 11px Orbitron,Arial';
  ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('$',0,1);
  ctx.restore();
}
function drawPowerup(p){
  const bob=Math.sin(time*0.005+p.ph)*4;
  ctx.save(); ctx.translate(p.x+17,p.y+17+bob);
  if(p.kind==='boost'){
    ctx.shadowColor='#5f5'; ctx.shadowBlur=16;
    const g=ctx.createLinearGradient(0,-17,0,17);
    g.addColorStop(0,'#aef7a0'); g.addColorStop(1,'#0f9d3a');
    rrPath(-16,-16,32,32,8); ctx.fillStyle=g; ctx.fill(); ctx.shadowBlur=0;
    ctx.strokeStyle='rgba(255,255,255,.75)'; ctx.lineWidth=2; ctx.stroke();
    ctx.fillStyle='#fff'; ctx.font='bold 20px Arial';
    ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('⚡',0,1);
  } else {
    ctx.shadowColor='#4ff'; ctx.shadowBlur=16;
    ctx.fillStyle='#1565c0'; ctx.beginPath(); ctx.arc(0,0,16,0,7); ctx.fill();
    ctx.shadowBlur=0;
    ctx.strokeStyle='#bfe9ff'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.arc(0,0,16,0,7); ctx.stroke();
    ctx.font='17px serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText('🛡',0,1);
  }
  ctx.restore();
}
function drawObstacle(o){
  if(o.type==='car') return drawEnemy(o);
  if(o.type==='cone') return drawCone(o);
  drawBarrier(o);
}
function drawEnemy(o){
  const cx=o.x+o.w/2;
  ctx.save();
  ctx.globalAlpha=.3; ctx.fillStyle='#000';
  ctx.beginPath(); ctx.ellipse(cx+2,o.y+o.h+2,o.w*.5,5,0,0,7); ctx.fill();
  ctx.globalAlpha=1;
  const g=ctx.createLinearGradient(0,o.y,0,o.y+o.h);
  g.addColorStop(0,shade(o.color,1.25)); g.addColorStop(1,shade(o.color,.65));
  rrPath(o.x,o.y,o.w,o.h,8); ctx.fillStyle=g; ctx.fill();
  ctx.strokeStyle='rgba(0,0,0,.4)'; ctx.lineWidth=1.5; ctx.stroke();
  ctx.fillStyle='rgba(18,28,48,.92)';
  rrPath(o.x+5,o.y+12,o.w-10,o.h*.34,4); ctx.fill();
  ctx.shadowColor='#f33'; ctx.shadowBlur=9; ctx.fillStyle='#ff5555';
  rrPath(o.x+4,o.y+o.h-7,8,4,2); ctx.fill();
  rrPath(o.x+o.w-12,o.y+o.h-7,8,4,2); ctx.fill();
  ctx.restore();
}
function drawCone(o){
  const cx=o.x+o.w/2, by=o.y+o.h;
  ctx.fillStyle='rgba(0,0,0,.3)';
  ctx.beginPath(); ctx.ellipse(cx,by,o.w*.6,4,0,0,7); ctx.fill();
  ctx.fillStyle='#cc5500'; rrPath(o.x-2,by-6,o.w+4,6,2); ctx.fill();
  ctx.fillStyle='#ff7722';
  ctx.beginPath(); ctx.moveTo(cx,o.y); ctx.lineTo(o.x+o.w,by-5); ctx.lineTo(o.x,by-5);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle='#fff';
  const f1=.42,f2=.6,w1=o.w/2*f1,w2=o.w/2*f2;
  ctx.beginPath();
  ctx.moveTo(cx-w1,o.y+o.h*f1); ctx.lineTo(cx+w1,o.y+o.h*f1);
  ctx.lineTo(cx+w2,o.y+o.h*f2); ctx.lineTo(cx-w2,o.y+o.h*f2);
  ctx.closePath(); ctx.fill();
}
function drawBarrier(o){
  rrPath(o.x,o.y,o.w,o.h,3);
  ctx.fillStyle='#d63031'; ctx.fill();
  ctx.save(); rrPath(o.x,o.y,o.w,o.h,3); ctx.clip();
  ctx.fillStyle='rgba(255,255,255,.85)';
  for(let sx=o.x-o.h;sx<o.x+o.w+o.h;sx+=20){
    ctx.beginPath();
    ctx.moveTo(sx,o.y+o.h); ctx.lineTo(sx+o.h,o.y);
    ctx.lineTo(sx+o.h+9,o.y); ctx.lineTo(sx+9,o.y+o.h);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  rrPath(o.x,o.y,o.w,o.h,3);
  ctx.strokeStyle='rgba(0,0,0,.5)'; ctx.lineWidth=2; ctx.stroke();
}
function drawPlayer(){
  const cx=car.x+car.w/2, cy=car.y+car.h/2, w=car.w, h=car.h;
  ctx.save(); ctx.globalAlpha=.35; ctx.fillStyle='#000';
  ctx.beginPath(); ctx.ellipse(cx+3,cy+h/2+2,w*.55,7,0,0,7); ctx.fill();
  ctx.restore();
  // headlight beams
  ctx.save(); ctx.globalCompositeOperation='lighter'; ctx.globalAlpha=.07;
  ctx.fillStyle='#ffeeaa';
  ctx.beginPath();
  ctx.moveTo(cx-14,cy-h/2+6); ctx.lineTo(cx-27,cy-h/2-95);
  ctx.lineTo(cx+27,cy-h/2-95); ctx.lineTo(cx+14,cy-h/2+6);
  ctx.closePath(); ctx.fill(); ctx.restore();

  ctx.save(); ctx.translate(cx,cy); ctx.rotate(car.tilt);
  if(boostTime>0){
    [-11,11].forEach(fx=>{
      const fl=14+Math.random()*16;
      const g=ctx.createLinearGradient(0,h/2,0,h/2+fl);
      g.addColorStop(0,'#fff'); g.addColorStop(.4,'#41f1ff');
      g.addColorStop(1,'rgba(65,241,255,0)');
      ctx.fillStyle=g;
      ctx.beginPath(); ctx.moveTo(fx-5,h/2-2); ctx.lineTo(fx,h/2+fl);
      ctx.lineTo(fx+5,h/2-2); ctx.closePath(); ctx.fill();
    });
  }
  // wheels
  ctx.fillStyle='#0b0b0f';
  [-1,1].forEach(sx=>[-h*.32,h*.14].forEach(yy=>{
    rrPath(sx>0?w/2-3:-w/2-4, yy, 7,16,3); ctx.fill();
  }));
  // body
  const bg=ctx.createLinearGradient(0,-h/2,0,h/2);
  bg.addColorStop(0,'#4fc3ff'); bg.addColorStop(.5,'#1899ff'); bg.addColorStop(1,'#0b57c4');
  rrPath(-w/2,-h/2,w,h,10); ctx.fillStyle=bg; ctx.fill();
  ctx.strokeStyle='rgba(255,255,255,.35)'; ctx.lineWidth=1.5; ctx.stroke();
  // cabin & glass
  ctx.fillStyle='#0a1a2f'; rrPath(-w/2+5,-h/2+16,w-10,19,5); ctx.fill();
  ctx.fillStyle='#7fd8ff'; rrPath(-w/2+7,-h/2+18,w-14,7,3); ctx.fill();
  ctx.globalAlpha=.8; rrPath(-w/2+7,h/2-19,w-14,6,3); ctx.fill(); ctx.globalAlpha=1;
  // stripe
  ctx.fillStyle='rgba(255,255,255,.25)';
  ctx.fillRect(-2,-h/2+3,4,11); ctx.fillRect(-2,h/2-11,4,8);
  // lights
  ctx.fillStyle='#fff9c4';
  ctx.beginPath(); ctx.arc(-10,-h/2+5,3,0,7); ctx.arc(10,-h/2+5,3,0,7); ctx.fill();
  ctx.fillStyle='#ff4444';
  rrPath(-14,h/2-7,8,4,2); ctx.fill(); rrPath(6,h/2-7,8,4,2); ctx.fill();
  ctx.restore();

  // shield ring
  if(car.shield){
    const blink=car.shieldTime<2000?(Math.sin(time*0.02)>0?1:.25):1;
    ctx.save(); ctx.globalAlpha=.7*blink;
    ctx.strokeStyle='#41f1ff'; ctx.lineWidth=2.5;
    ctx.shadowColor='#41f1ff'; ctx.shadowBlur=12;
    ctx.beginPath(); ctx.arc(cx,cy,42+Math.sin(time*.008)*3,0,7); ctx.stroke();
    ctx.restore();
  }
}
function draw(){
  ctx.save();
  if(shake>0.3) ctx.translate((Math.random()-.5)*shake,(Math.random()-.5)*shake);
  drawBackground();
  drawRoad();
  powerups.forEach(drawPowerup);
  coins.forEach(drawCoin);
  obstacles.forEach(drawObstacle);
  if(lines.length){
    ctx.strokeStyle='rgba(180,240,255,.5)'; ctx.lineWidth=2;
    lines.forEach(l=>{ ctx.beginPath(); ctx.moveTo(l.x,l.y); ctx.lineTo(l.x,l.y+l.len); ctx.stroke(); });
  }
  if(!car.dead) drawPlayer();
  particles.forEach(p=>{
    ctx.globalAlpha=Math.max(0,p.life/p.max);
    ctx.fillStyle=p.color;
    ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,7); ctx.fill();
  });
  ctx.globalAlpha=1;
  floaters.forEach(fl=>{
    ctx.globalAlpha=Math.max(0,fl.life/fl.max);
    ctx.fillStyle=fl.color; ctx.font=`bold ${fl.size}px Orbitron,Arial`;
    ctx.textAlign='center'; ctx.fillText(fl.text,fl.x,fl.y);
  });
  ctx.globalAlpha=1;
  ctx.restore();
  if(flash>0){ ctx.fillStyle=`rgba(255,255,255,${flash})`; ctx.fillRect(0,0,W,H); }
  ctx.fillStyle=vignette; ctx.fillRect(0,0,W,H);
}

// =====================================================
//  MAIN LOOP
// =====================================================
function updateCountdown(dt){
  time+=dt; countdownTime-=dt;
  const f=dt/16.666;
  scrollRoad+=2.2*f; scrollSide+=2.2*0.45*f;
  const n=countdownTime>2400?'3':countdownTime>1600?'2':countdownTime>800?'1':'GO!';
  if(n!==cdLabel){
    cdLabel=n; countdownEl.textContent=n;
    countdownEl.classList.remove('pop'); void countdownEl.offsetWidth;
    countdownEl.classList.add('pop');
  }
  if(countdownTime<=0){
    countdownEl.style.display='none';
    state=STATE.PLAYING; startEngine();
  }
}
function updateGameover(dt){
  time+=dt;
  roadSpeed*=Math.pow(0.965,dt/16.666); if(roadSpeed<0.05) roadSpeed=0;
  const mv=roadSpeed*dt/16.666;
  obstacles.forEach(o=>o.y+=mv*o.speed);
  coins.forEach(c=>c.y+=mv);
  powerups.forEach(p=>p.y+=mv);
  scrollRoad+=mv; scrollSide+=mv*0.45;
  updateFX(dt);
}
function loop(ts){
  requestAnimationFrame(loop);
  const dt=Math.min(50,ts-lastTime||16.666); lastTime=ts;
  if(state===STATE.MENU) return;
  if(state===STATE.PLAYING) update(dt);
  else if(state===STATE.COUNTDOWN) updateCountdown(dt);
  else if(state===STATE.GAMEOVER) updateGameover(dt);
  if(state!==STATE.PAUSED) draw();
}
menuBest.textContent=highScore;
requestAnimationFrame(loop);
