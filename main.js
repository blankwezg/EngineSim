// engine-sim.js — Engine Simulator 2 (No Menu/Loading)
// ====================================================

(() => {
  // —— GLOBAL SETUP —————————————————————————————————————————————————
  const canvas = document.createElement('canvas');
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  function resize() {
    canvas.width = innerWidth;
    canvas.height = innerHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  // —— CONFIG & STATE —————————————————————————————————————————————
  const config = {
    stroke: '4-stroke',
    layout: 'inline',
    pistonCount: 4,
    rings: 2,
    material: 'steel',
    exhaust: 'muffler',
    fuel: 'gasoline',
    idleRPM: 1000,
    maxRPM: 8000,
    throttle: 0,
    running: false
  };
  let crankAngle = 0, crankVel = 0;
  let lastTime = 0;

  // —— INPUT ——————————————————————————————————————————————————————  
  window.addEventListener('keydown', e => {
    if (e.key.toLowerCase() === 'w') config.throttle = 1;
  });
  window.addEventListener('keyup', e => {
    if (e.key.toLowerCase() === 'w') config.throttle = 0;
  });

  // —— PARTICLES ———————————————————————————————————————————————————  
  const particles = [];
  function spawnParticle(x,y,dx,dy,color){
    particles.push({ x,y,dx,dy,life:1,color });
  }
  function updateParticles(dt){
    for (let p of particles){
      p.x += p.dx*dt; p.y += p.dy*dt; p.life -= dt;
    }
    for (let i=particles.length-1; i>=0; i--){
      if (particles[i].life <= 0) particles.splice(i,1);
    }
  }
  function drawParticles(){
    for (let p of particles){
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x,p.y,4,0,2*Math.PI);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // —— AUDIO (stubs—you need to supply your own files) —————————————————  
  const sounds = {
    start:  new Audio('/sounds/start.mp3'),
    idle:   new Audio('/sounds/idle.mp3'),
    ignite: new Audio('/sounds/ignite.mp3'),
    stop:   new Audio('/sounds/stop.mp3')
  };
  sounds.idle.loop = true;
  function playSound(name){
    const s = sounds[name];
    if (!s) return;
    s.pause(); s.currentTime = 0;
    s.play().catch(()=>{});
  }

  // —— UI TOOLBOX ———————————————————————————————————————————————  
  const toolbox = document.createElement('div');
  Object.assign(toolbox.style, {
    position:'fixed',left:0,top:0,width:'260px',height:'100%',
    background:'#222',color:'#eee',padding:'10px',
    fontFamily:'monospace',fontSize:'14px',overflowY:'auto',
    zIndex:1
  });
  document.body.appendChild(toolbox);

  function addLabel(txt){
    const d = document.createElement('div');
    d.textContent = txt; d.style.marginTop='10px';
    toolbox.appendChild(d);
  }
  function addSelect(options, onCh){
    const s = document.createElement('select');
    s.style.width = '100%';
    options.forEach(o => {
      const opt = document.createElement('option');
      opt.value = o; opt.textContent = o;
      s.appendChild(opt);
    });
    s.onchange = e => onCh(e.target.value);
    toolbox.appendChild(s);
    return s;
  }
  function addSlider(min,max,step,val,onI){
    const r = document.createElement('input');
    r.type = 'range'; r.min = min; r.max = max; r.step = step; r.value = val;
    r.style.width = '100%';
    r.oninput = e => onI(+e.target.value);
    toolbox.appendChild(r);
    return r;
  }

  // Build controls
  addLabel('Stroke Type');
  addSelect(['2-stroke','4-stroke'], v => config.stroke = v);
  addLabel('Layout');
  addSelect(['inline','v','boxer'], v => config.layout = v);
  addLabel('Pistons');
  addSlider(1,12,1,4, v => config.pistonCount = v);
  addLabel('Rings');
  addSlider(0,5,1,2, v => config.rings = v);
  addLabel('Material');
  addSelect(['steel','aluminum','ceramic'], v => config.material = v);
  addLabel('Exhaust');
  addSelect(['none','muffler','turbo'], v => config.exhaust = v);
  addLabel('Fuel');
  addSelect(['gasoline','diesel'], v => config.fuel = v);
  addLabel('Idle RPM');
  addSlider(500,3000,100,1000, v => config.idleRPM = v);
  addLabel('Max RPM');
  addSlider(4000,12000,100,8000, v => config.maxRPM = v);

  toolbox.appendChild(document.createElement('hr'));
  const btnStart = document.createElement('button');
  btnStart.textContent = 'START';
  btnStart.onclick = () => { config.running = true; crankVel = rpmToAng(config.idleRPM); playSound('start'); sounds.idle.play(); };
  toolbox.appendChild(btnStart);

  const btnStop = document.createElement('button');
  btnStop.textContent = 'STOP';
  btnStop.onclick = () => { config.running = false; sounds.idle.pause(); playSound('stop'); };
  toolbox.appendChild(btnStop);

  const statusDiv = document.createElement('div');
  Object.assign(statusDiv.style, {
    position:'absolute',bottom:'10px',right:'10px',
    background:'rgba(0,0,0,0.6)',color:'#0f0',
    padding:'8px',fontFamily:'monospace',fontSize:'12px'
  });
  toolbox.appendChild(statusDiv);

  // —— PHYSICS HELPERS —————————————————————————————————————————————  
  function rpmToAng(rpm){ return rpm * 2 * Math.PI / 60; }
  function angToRPM(ang){ return ang * 60 / (2 * Math.PI); }

  // —— ENGINE UPDATE —————————————————————————————————————————————  
  function updateEngine(dt){
    // target angular velocity based on throttle
    const targetRPM = config.idleRPM + (config.maxRPM - config.idleRPM) * config.throttle;
    const targetAng = rpmToAng(targetRPM);
    // smooth approach
    crankVel += (targetAng - crankVel) * dt * 2;
    if (!config.running) crankVel += (0 - crankVel) * dt * 1.5;
    crankAngle += crankVel * dt;

    // continuous particles
    const cx = canvas.width/2, cy = canvas.height/2;
    if (Math.random() < dt * 30) {
      spawnParticle(cx-100, cy-50, -5+Math.random()*10, -30+Math.random()*10, 'lime');
      spawnParticle(cx+100, cy-50, -10+Math.random()*20, -40+Math.random()*20, 'gray');
    }
    updateParticles(dt);

    // adjust idle sound pitch
    if (config.running) {
      sounds.idle.playbackRate = 0.5 + angToRPM(crankVel)/config.maxRPM;
    }
  }

  // —— DRAWING —————————————————————————————————————————————————————  
  function draw(){
    // background
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // moving grid
    const gap=50, off=(performance.now()/20)%gap;
    ctx.strokeStyle='#222'; ctx.lineWidth=1;
    for(let x=-off; x<canvas.width; x+=gap){
      ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,canvas.height); ctx.stroke();
    }
    for(let y=-off; y<canvas.height; y+=gap){
      ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(canvas.width,y); ctx.stroke();
    }

    // engine
    drawEngine();
    drawParticles();
    drawStatus();
  }

  function drawEngine(){
    const cx = canvas.width/2, cy = canvas.height/2 + 50;
    const rodLen = 120;
    for (let i = 0; i < config.pistonCount; i++){
      const phase = crankAngle + i*(2*Math.PI/config.pistonCount);
      const ang = phase % (2*Math.PI);
      const crankX = cx + Math.cos(ang)*40;
      const crankY = cy + Math.sin(ang)*40;
      const yOff = Math.sqrt(Math.max(0, rodLen*rodLen - Math.sin(ang)*40*40));
      const pistonY = cy - yOff;

      // X position by layout
      let px = cx + (i-(config.pistonCount-1)/2)*80;
      if (config.layout==='v') px = cx + (i%2?80:-80);
      if (config.layout==='boxer') px = cx + (i%2?100:-100);

      // rod
      ctx.strokeStyle='#888'; ctx.lineWidth=6;
      ctx.beginPath(); ctx.moveTo(crankX,crankY); ctx.lineTo(px,pistonY); ctx.stroke();

      // rings
      for(let r=0; r<config.rings; r++){
        ctx.strokeStyle='#444';
        ctx.strokeRect(px-22, pistonY+4+r*6, 44,4);
      }

      // piston
      ctx.fillStyle = config.material==='steel'? '#aaa':
                      config.material==='aluminum'? '#ddd':'#f90';
      ctx.fillRect(px-20, pistonY, 40,30);

      // cylinder
      ctx.strokeStyle='#555'; ctx.lineWidth=3;
      ctx.strokeRect(px-25, pistonY-30, 50,100);

      // valves or ports + spark
      if (config.stroke==='4-stroke'){
        ctx.fillStyle='orange';
        ctx.fillRect(px-10,pistonY-32,8,16);
        ctx.fillRect(px+2, pistonY-32,8,16);
        if (Math.abs(ang - Math.PI/2)<0.05 && config.running){
          ctx.fillStyle='yellow';
          ctx.beginPath(); ctx.arc(px,pistonY-40,6,0,2*Math.PI); ctx.fill();
          playSound('ignite');
        }
      } else {
        ctx.fillStyle='lime';
        ctx.beginPath();
        ctx.arc(px, pistonY+10, 10, Math.PI, 0);
        ctx.fill();
      }
    }
  }

  function drawStatus(){
    const rpm = Math.round(angToRPM(crankVel));
    const torque = Math.round(rpm*0.1);
    const hp = Math.round(torque*rpm/5252);
    statusDiv.textContent =
      `RPM: ${rpm}\nTQ: ${torque} Nm\nHP: ${hp}\n`;
    // warnings
    let w='';
    if (rpm > config.maxRPM) w+='⚠ Over RPM\n';
    if (config.material==='ceramic' && torque>500) w+='⚠ Ceramic Fragile\n';
    if (config.throttle===1 && config.fuel==='diesel') w+='⚠ Diesel needs no spark\n';
    if (w) statusDiv.textContent += w;
  }

  // —— MAIN LOOP ———————————————————————————————————————————————————
  function loop(ts){
    const dt = (ts - lastTime)/1000;
    lastTime = ts;
    updateEngine(dt);
    draw();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(ts => { lastTime = ts; loop(ts); });
})();
