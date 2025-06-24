// engine-sim.js — Engine Simulator 2, Complete Build
// -------------------------------------------------
// All-in-one frontend JS: UI, physics, rendering, particles, sounds, and warnings
// Usage: Include in your HTML after the <body> tag. Requires sound files in /sounds/.
//
// Example index.html:
// <!DOCTYPE html>
// <html><head>
//   <meta charset="UTF-8"><title>Engine Sim</title>
//   <style>body,html{margin:0;overflow:hidden}#engineCanvas{position:absolute;top:0;left:0;}</style>
// </head>
// <body>
//   <script src="engine-sim.js"></script>
// </body></html>
//
// Sound assets needed:
// /sounds/start.mp3, /sounds/idle.mp3, /sounds/stop.mp3

(function(){
  // === Canvas Setup ===
  const canvas = document.createElement('canvas');
  canvas.id = 'engineCanvas';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  // === Toolbox UI ===
  const toolbox = document.createElement('div');
  Object.assign(toolbox.style,{
    position:'fixed',left:0,top:0,width:'260px',height:'100%',
    background:'#111',color:'#eee',padding:'10px',overflowY:'auto',zIndex:1,
    fontFamily:'monospace',fontSize:'14px'
  });
  document.body.appendChild(toolbox);
  function makeLabel(txt){
    const l = document.createElement('div');
    l.textContent = txt; l.style.marginTop='10px';
    return l;
  }
  function makeSelect(opts, onch){
    const s = document.createElement('select');
    s.style.width='100%';
    opts.forEach(o=>s.appendChild(Object.assign(document.createElement('option'),{value:o,textContent:o})));
    s.onchange=onch;
    return s;
  }
  function makeSlider(min,max,step,val,onin){
    const r=document.createElement('input');
    r.type='range'; r.min=min; r.max=max; r.step=step; r.value=val;
    r.style.width='100%'; r.oninput=onin;
    return r;
  }
  // Controls object
  const config = {
    stroke:'4-stroke', layout:'inline', pistonCount:4, rings:2,
    material:'steel', exhaust:'muffler', fuel:'gasoline',
    idleRPM:1000, maxRPM:8000, running:false, throttle:0
  };
  // Stroke Type
  toolbox.append(makeLabel('Stroke Type'));
  toolbox.append(
    makeSelect(['2-stroke','4-stroke'],e=>config.stroke=e.target.value)
  );
  // Layout
  toolbox.append(makeLabel('Engine Layout'));
  toolbox.append(
    makeSelect(['inline','v','boxer'],e=>config.layout=e.target.value)
  );
  // Piston Count
  toolbox.append(makeLabel('Piston Count'));
  toolbox.append(
    makeSlider(1,12,1,4,e=>config.pistonCount=+e.target.value)
  );
  // Rings
  toolbox.append(makeLabel('Ring Count'));
  toolbox.append(
    makeSlider(1,5,1,2,e=>config.rings=+e.target.value)
  );
  // Material
  toolbox.append(makeLabel('Piston Material'));
  toolbox.append(
    makeSelect(['steel','aluminum','ceramic'],e=>config.material=e.target.value)
  );
  // Exhaust
  toolbox.append(makeLabel('Exhaust Setup'));
  toolbox.append(
    makeSelect(['none','muffler','turbo'],e=>config.exhaust=e.target.value)
  );
  // Fuel
  toolbox.append(makeLabel('Fuel Type'));
  toolbox.append(
    makeSelect(['gasoline','diesel'],e=>config.fuel=e.target.value)
  );
  // Idle RPM
  toolbox.append(makeLabel('Idle RPM'));
  toolbox.append(
    makeSlider(500,3000,100,1000,e=>config.idleRPM=+e.target.value)
  );
  // Max RPM
  toolbox.append(makeLabel('Max RPM'));
  toolbox.append(
    makeSlider(4000,12000,100,8000,e=>config.maxRPM=+e.target.value)
  );
  // Start/Stop Buttons
  const btnStart = document.createElement('button');
  btnStart.textContent='Start Engine';
  btnStart.onclick=()=>{ config.running=true; playSound('start'); loopIdle(); };
  toolbox.append(btnStart);
  const btnStop = document.createElement('button');
  btnStop.textContent='Stop Engine';
  btnStop.style.marginLeft='10px';
  btnStop.onclick=()=>{ config.running=false; playSound('stop'); stopIdle(); };
  toolbox.append(btnStop);

  // === Audio Setup ===
  const sounds = {
    start: new Audio('/sounds/start.mp3'),
    idle: new Audio('/sounds/idle.mp3'),
    stop: new Audio('/sounds/stop.mp3'),
    rev:  new Audio('/sounds/idle.mp3') // reuse idle, will modulate rate
  };
  sounds.idle.loop = true;
  function playSound(name){
    const s=sounds[name];
    if(!s) return;
    s.pause(); s.currentTime=0; s.play().catch(()=>{});
  }
  function loopIdle(){
    playSound('idle');
  }
  function stopIdle(){
    sounds.idle.pause(); sounds.idle.currentTime=0;
  }

  // === Physics State ===
  let crankAngle=0;
  let lastTime = performance.now();
  let keys = {};

  window.addEventListener('keydown', e=>{
    if(e.key==='w') config.throttle=1;
    keys[e.key]=true;
  });
  window.addEventListener('keyup', e=>{
    if(e.key==='w') config.throttle=0;
    keys[e.key]=false;
  });

  // === Particle System ===
  const particles = [];
  function spawnParticle(x,y,dx,dy,color){
    particles.push({x,y,dx,dy,life:1,color});
  }
  function updateParticles(dt){
    for(let p of particles){
      p.x += p.dx*dt;
      p.y += p.dy*dt;
      p.life -= dt;
    }
    // remove dead
    for(let i=particles.length-1;i>=0;i--){
      if(particles[i].life<=0) particles.splice(i,1);
    }
  }
  function drawParticles(){
    for(let p of particles){
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x,p.y,5,0,Math.PI*2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // === Engine Simulation ===
  function updateEngine(dt){
    if(config.running){
      // simple torque model
      const torqueBase = config.throttle * config.idleRPM;
      const frictionTorque = 0.0001 * crankAngVel;
      const angularAccel = (torqueBase - frictionTorque) / 10;
      crankAngVel += angularAccel*dt;
      // clamp RPM
      const maxAng = config.maxRPM*(2*Math.PI)/60;
      const minAng = config.idleRPM*(2*Math.PI)/60;
      crankAngVel = Math.max(minAng, Math.min(maxAng, crankAngVel));
      // spawn particles
      const cx = canvas.width/2;
      const cy = canvas.height/2;
      if(Math.random()<dt*config.throttle*20){
        spawnParticle(cx+100,cy-80, 50, -10, 'gray');
        spawnParticle(cx-100,cy-80,-50,-10, 'lime');
      }
    } else {
      crankAngVel *= 0.98;
      if(crankAngVel < 0.1) crankAngVel = 0;
    }
    crankAngle += crankAngVel*dt;
    updateParticles(dt);
    // sound pitch mapping
    if(sounds.idle.playing) sounds.idle.playbackRate = 0.5 + (crankAngVel/(config.maxRPM*2*Math.PI/60))*1.5;
  }
  let crankAngVel = 0;

  // === Rendering ===
  function drawEngine(){
    const W=canvas.width, H=canvas.height;
    ctx.clearRect(0,0,W,H);
    // moving grid background
    const spacing=50, off=(performance.now()/20)%spacing;
    ctx.strokeStyle='#222'; ctx.lineWidth=1;
    for(let x=-off;x<W;x+=spacing){
      ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke();
    }
    for(let y=-off;y<H;y+=spacing){
      ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke();
    }
    const cx=W/2, cy=H/2+50;
    // draw pistons
    const n=config.pistonCount;
    for(let i=0;i<n;i++){
      // compute crank geometry per cylinder
      const phase = crankAngle + i*(Math.PI*2/n);
      const px = cx + ((config.layout==='v')?Math.cos(i%2?Math.PI/6:-Math.PI/6)*(n*30): (i-n/2)*80);
      const py = cy - 100;
      const crankX = px + Math.cos(phase)*40;
      const crankY = py + Math.sin(phase)*40;
      // rod
      ctx.strokeStyle='#888'; ctx.lineWidth=6;
      ctx.beginPath(); ctx.moveTo(crankX,crankY); ctx.lineTo(px,py-rodLen(n)); ctx.stroke();
      // piston
      ctx.fillStyle='#ccc';
      ctx.fillRect(px-20, py-rodLen(n)-30, 40, 30);
      // cylinder tube
      ctx.strokeStyle='#555'; ctx.lineWidth=3;
      ctx.strokeRect(px-25,py-rodLen(n)-60,50,100);
      // valves if 4-stroke
      if(config.stroke==='4-stroke'){
        ctx.fillStyle='#0f0';
        ctx.fillRect(px-12,py-rodLen(n)-64,8,16);
        ctx.fillRect(px+4, py-rodLen(n)-64,8,16);
      }
      // spark on every full cycle
      if(config.running && ((Math.floor(phase/(Math.PI*2)*60)%60)<1)){
        ctx.fillStyle='yellow';
        ctx.beginPath();
        ctx.arc(px,py-rodLen(n)-70,6,0,Math.PI*2);
        ctx.fill();
      }
    }
    drawParticles();
    // status
    ctx.fillStyle='white'; ctx.font='16px monospace';
    ctx.fillText(`RPM: ${Math.round(crankAngVel*60/(2*Math.PI))}`,20,30);
    ctx.fillText(`Torque: ${Math.round(crankAngVel*0.1)} Nm`,20,50);
    ctx.fillText(`HP: ${Math.round((crankAngVel*0.1*crankAngVel*60/(2*Math.PI))/5252)}`,20,70);
    // warnings
    let wy=90;
    if(crankAngVel*60/(2*Math.PI) > config.maxRPM) ctx.fillStyle='red',ctx.fillText('⚠ Over RPM!',20,wy+=20);
    if(config.material==='ceramic' && config.pistonCount>8) ctx.fillStyle='red',ctx.fillText('⚠ Ceramic fragile!',20,wy+=20);
  }

  // helper rod length
  function rodLen(n){
    return 120; /* could vary per cylinder but fixed for simplicity */
  }

  // === Main Loop ===
  let last = performance.now();
  function mainLoop(now){
    const dt = (now-last)/1000;
    last=now;
    updateEngine(dt);
    drawEngine();
    requestAnimationFrame(mainLoop);
  }
  requestAnimationFrame(mainLoop);
})();
