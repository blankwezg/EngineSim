// engine-sim.js — Engine Simulator 2 Complete
// ============================================
// Includes: Start Menu → Loading → Game with Toolbox, UI, Physics,
// Rendering (crank, rod, piston, valves), Particles, Firing Order,
// Sound, Diagnostics, and full interactivity in one file.

// —— GLOBAL SETUP ———————————————————————————————————————————————————
(() => {
  // Canvas & Context
  const canvas = document.createElement('canvas');
  canvas.id = 'engineCanvas';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  function resize() {
    canvas.width = innerWidth;
    canvas.height = innerHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  // App States
  const STATE = { MENU: 0, LOADING: 1, PLAY: 2, CREDITS: 3 };
  let appState = STATE.MENU;

  // Timing
  let lastTime = 0;

  // Crank / Physics
  let crankAngle = 0, crankVel = 0;

  // Configuration defaults
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

  // Helper: map RPM <-> Angular velocity
  function rpmToAng(rpm) { return rpm * 2 * Math.PI / 60; }
  function angToRPM(ang) { return ang * 60 / (2 * Math.PI); }

  // Key handling
  const keys = {};
  window.addEventListener('keydown', e => {
    keys[e.key.toLowerCase()] = true;
    if (appState === STATE.PLAY && e.key.toLowerCase() === 'w') config.throttle = 1;
  });
  window.addEventListener('keyup', e => {
    keys[e.key.toLowerCase()] = false;
    if (appState === STATE.PLAY && e.key.toLowerCase() === 'w') config.throttle = 0;
  });

  // Particles
  const particles = [];
  function spawnParticle(x,y,dx,dy,color) {
    particles.push({ x, y, dx, dy, life: 1, color });
  }
  function updateParticles(dt) {
    for (let p of particles) {
      p.x += p.dx * dt;
      p.y += p.dy * dt;
      p.life -= dt;
    }
    // remove dead
    for (let i = particles.length - 1; i >= 0; i--) {
      if (particles[i].life <= 0) particles.splice(i, 1);
    }
  }
  function drawParticles() {
    for (let p of particles) {
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, 2 * Math.PI);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // Audio (stub paths; provide your own files)
  const sounds = {
    start: new Audio('/sounds/start.mp3'),
    idle: new Audio('/sounds/idle.mp3'),
    stop: new Audio('/sounds/stop.mp3'),
    rev: new Audio('/sounds/rev.mp3'),
    ignite: new Audio('/sounds/ignite.mp3')
  };
  sounds.idle.loop = true;

  function playSound(name, rate=1) {
    const s = sounds[name];
    if (!s) return;
    s.pause(); s.currentTime = 0;
    s.play().catch(()=>{});
    s.playbackRate = rate;
  }

  // —— UI ELEMENTS ——————————————————————————————————————————————————————

  // Container for all HTML controls
  const uiLayer = document.createElement('div');
  Object.assign(uiLayer.style, {
    position:'fixed', left:0, top:0, width:'100%', height:'100%',
    pointerEvents:'none' // allow canvas clicks through
  });
  document.body.appendChild(uiLayer);

  // MENU UI
  const menuDiv = document.createElement('div');
  Object.assign(menuDiv.style, {
    position:'absolute', width:'100%', height:'100%',
    background:'#111', display:'flex', flexDirection:'column',
    alignItems:'center', justifyContent:'center', color:'#fff',
    fontFamily:'sans-serif', fontSize:'32px'
  });
  menuDiv.innerHTML = `
    <div style="margin-bottom:40px;">Engine Simulator</div>
    <div style="font-size:18px;margin-bottom:80px;">Version 0.2 Beta</div>
    <button id="btnPlay" style="width:200px;height:50px;margin:10px;font-size:18px;">Play</button>
    <button id="btnCredits" style="width:200px;height:50px;margin:10px;font-size:18px;">Credits</button>
    <button id="btnQuit" style="width:200px;height:50px;margin:10px;font-size:18px;">Quit</button>
  `;
  uiLayer.appendChild(menuDiv);

  // CREDITS UI
  const creditsDiv = document.createElement('div');
  Object.assign(creditsDiv.style, {
    position:'absolute', width:'100%', height:'100%',
    background:'#111', color:'#fff', fontFamily:'sans-serif',
    padding:'20px', display:'none'
  });
  creditsDiv.innerHTML = `
    <button id="btnBack" style="font-size:18px;">&larr; Back</button>
    <h2>Credits</h2>
    <p>Scripter: ChatGPT<br>Idea: Loay<br>Sound: Adam</p>
  `;
  uiLayer.appendChild(creditsDiv);

  // LOADING
  let loadingDots = 0;
  const loadingDiv = document.createElement('div');
  Object.assign(loadingDiv.style, {
    position:'absolute', width:'100%', height:'100%',
    background:'#111', color:'#fff', fontFamily:'sans-serif',
    display:'none', alignItems:'center', justifyContent:'center',
    fontSize:'24px'
  });
  loadingDiv.innerHTML = `<div>Loading<span id="dots"></span></div>`;
  uiLayer.appendChild(loadingDiv);

  // TOOLBOX (hidden until PLAY)
  const toolbox = document.createElement('div');
  Object.assign(toolbox.style, {
    position:'fixed', left:'0', top:'0', width:'260px', height:'100%',
    background:'#222', color:'#eee', padding:'10px',
    fontFamily:'monospace', fontSize:'14px', overflowY:'auto',
    display:'none', pointerEvents:'auto', zIndex:'10'
  });
  uiLayer.appendChild(toolbox);

  // Helper to build controls
  function addLabel(txt) {
    const d = document.createElement('div');
    d.textContent = txt; d.style.marginTop='10px';
    toolbox.appendChild(d);
  }
  function addSelect(options, onCh) {
    const s = document.createElement('select');
    s.style.width='100%';
    options.forEach(o => {
      const oEl = document.createElement('option');
      oEl.value = o; oEl.textContent = o;
      s.appendChild(oEl);
    });
    s.onchange = e => onCh(e.target.value);
    toolbox.appendChild(s);
    return s;
  }
  function addSlider(min,max,step,val,onI) {
    const r = document.createElement('input');
    r.type='range'; r.min=min; r.max=max; r.step=step; r.value=val;
    r.style.width='100%'; r.oninput = e => onI(+e.target.value);
    toolbox.appendChild(r);
    return r;
  }
  // Build toolbox controls
  addLabel('Stroke Type');
  addSelect(['2-stroke','4-stroke'], v => config.stroke=v);
  addLabel('Layout');
  addSelect(['inline','v','boxer'], v => config.layout=v);
  addLabel('Pistons');
  addSlider(1,12,1,4  , v=>config.pistonCount=v);
  addLabel('Rings');
  addSlider(0,5,1,2   , v=>config.rings=v);
  addLabel('Material');
  addSelect(['steel','aluminum','ceramic'], v=>config.material=v);
  addLabel('Exhaust');
  addSelect(['none','muffler','turbo'], v=>config.exhaust=v);
  addLabel('Fuel');
  addSelect(['gasoline','diesel'], v=>config.fuel=v);
  addLabel('Idle RPM');
  addSlider(500,3000,100,1000, v=>config.idleRPM=v);
  addLabel('Max RPM');
  addSlider(4000,12000,100,8000, v=>config.maxRPM=v);
  toolbox.appendChild(document.createElement('hr'));
  const btnStart = document.createElement('button');
  btnStart.textContent = 'START'; btnStart.style.width='100%';
  btnStart.onclick = startEngine;
  toolbox.appendChild(btnStart);
  const btnStop = document.createElement('button');
  btnStop.textContent = 'STOP'; btnStop.style.width='100%';
  btnStop.onclick = stopEngine;
  toolbox.appendChild(btnStop);
  const statusDiv = document.createElement('div');
  statusDiv.style.position='absolute';
  statusDiv.style.bottom='10px'; statusDiv.style.right='10px';
  statusDiv.style.background='rgba(0,0,0,0.5)';
  statusDiv.style.color='#0f0'; statusDiv.style.padding='5px';
  statusDiv.style.fontFamily='monospace'; statusDiv.style.fontSize='12px';
  toolbox.appendChild(statusDiv);

  // Button wiring
  document.getElementById('btnPlay').onclick = () => {
    appState = STATE.LOADING;
    menuDiv.style.display='none';
    loadingDiv.style.display='flex';
    loadingDots = 0;
    const dotInt = setInterval(()=>{
      loadingDots = (loadingDots+1)%4;
      document.getElementById('dots').textContent = '.'.repeat(loadingDots);
    }, 500);
    setTimeout(()=>{
      clearInterval(dotInt);
      loadingDiv.style.display='none';
      appState = STATE.PLAY;
      toolbox.style.display='block';
      playSound('start');
    }, 3000);
  };
  document.getElementById('btnCredits').onclick = () => {
    appState = STATE.CREDITS;
    menuDiv.style.display='none';
    creditsDiv.style.display='block';
  };
  document.getElementById('btnQuit').onclick = () => window.close();
  document.getElementById('btnBack').onclick = () => {
    appState = STATE.MENU;
    creditsDiv.style.display='none';
    menuDiv.style.display='flex';
  };

  // —— ENGINE FUNCTIONS —————————————————————————————————————————————

  // Start / Stop
  function startEngine() {
    config.running = true;
    playSound('idle');
    crankVel = rpmToAng(config.idleRPM);
  }
  function stopEngine() {
    config.running = false;
    sounds.idle.pause();
  }

  // Engine update
  function updateEngine(dt) {
    // throttle controls torque
    let targetRPM = config.idleRPM + (config.maxRPM - config.idleRPM) * config.throttle;
    let targetAng = rpmToAng(targetRPM);
    // simple smoothing towards target
    crankVel += (targetAng - crankVel) * dt * 2;
    if (!config.running) {
      crankVel += (0 - crankVel) * dt * 1.5;
    }
    crankAngle += crankVel * dt;
    // spawn continuous particles
    const baseX = canvas.width/2, baseY = canvas.height/2;
    const intakeX = baseX - 100, intakeY = baseY - 50;
    const exhaustX= baseX + 100, exhaustY= baseY - 50;
    if (Math.random() < dt * 30) {
      spawnParticle(intakeX, intakeY,
        -10 + Math.random()*20, -30 + Math.random()*10,
        'lime'
      );
      spawnParticle(exhaustX, exhaustY,
        -20 + Math.random()*40, -50 + Math.random()*20,
        'gray'
      );
    }
    updateParticles(dt);
    // sound pitch
    if (config.running) {
      sounds.idle.playbackRate = 0.5 + angToRPM(crankVel) / config.maxRPM;
    }
  }

  // —— RENDER LOOP ——————————————————————————————————————————————————

  function draw() {
    // clear
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // moving grid
    const gap = 50, off = (performance.now()/10)%gap;
    ctx.strokeStyle = '#222'; ctx.lineWidth=1;
    for (let x=-off; x<canvas.width; x+=gap) {
      ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,canvas.height); ctx.stroke();
    }
    for (let y=-off; y<canvas.height; y+=gap) {
      ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(canvas.width,y); ctx.stroke();
    }

    if (appState === STATE.PLAY) {
      drawEngine();
      drawParticles();
      drawStatus();
    }
  }

  function drawEngine() {
    const cx = canvas.width/2, cy = canvas.height/2 + 50;
    const rodLength = 120;
    // draw each piston bank
    for (let i = 0; i < config.pistonCount; i++) {
      // phase offset for firing order
      const phase = crankAngle + i * (2*Math.PI/config.pistonCount);
      const ang = phase % (2*Math.PI);
      // compute crank pin & piston positions
      const crankX = cx + Math.cos(ang) * 40;
      const crankY = cy + Math.sin(ang) * 40;
      // piston 'y' via slider-crank relation
      const yOff = Math.sqrt(Math.max(0, rodLength*rodLength - Math.sin(ang)*40*40));
      const pistonY = cy - yOff;
      // layout shift X
      let px = cx + (i - (config.pistonCount-1)/2) * 80;
      if (config.layout==='v') {
        const side = (i%2===0 ? -1 : 1);
        px = cx + side * 100;
      } else if (config.layout==='boxer') {
        const side = (i%2===0 ? -1 : 1);
        px = cx + side * ((i<(config.pistonCount/2))?60:140);
      }
      // draw connecting rod
      ctx.strokeStyle='#888'; ctx.lineWidth=6;
      ctx.beginPath();
      ctx.moveTo(crankX, crankY);
      ctx.lineTo(px, pistonY);
      ctx.stroke();
      // draw piston rings
      for (let r=0; r<config.rings; r++) {
        ctx.strokeStyle='#444';
        ctx.strokeRect(px-22, pistonY-5 + r*6, 44, 4);
      }
      // draw piston body
      ctx.fillStyle = (config.material==='steel'? '#aaa' : config.material==='aluminum'? '#ddd' : '#f90');
      ctx.fillRect(px-20, pistonY, 40, 30);
      // draw cylinder
      ctx.strokeStyle='#555'; ctx.lineWidth=3;
      ctx.strokeRect(px-25, pistonY-30, 50, 100);
      // spark/valves
      if (config.stroke==='4-stroke') {
        // valves static
        ctx.fillStyle='orange';
        ctx.fillRect(px-12, pistonY-32, 8, 16);
        ctx.fillRect(px+4, pistonY-32, 8, 16);
        // spark on power stroke
        if (Math.abs(ang - Math.PI/2) < 0.1 && config.running) {
          ctx.fillStyle='yellow';
          ctx.beginPath();
          ctx.arc(px, pistonY-40, 6, 0, 2*Math.PI);
          ctx.fill();
          playSound('ignite');
        }
      } else {
        // 2-stroke ports
        ctx.fillStyle='lime';
        ctx.beginPath();
        ctx.arc(px, pistonY+10, 10, Math.PI, 0);
        ctx.fill();
      }
    }
  }

  function drawStatus() {
    // bottom-right in toolbox
    const rpm = Math.round(angToRPM(crankVel));
    const torque = Math.round(rpm*0.1);
    const hp = Math.round(torque * rpm / 5252);
    statusDiv.textContent =
      `RPM: ${rpm}\n`+
      `TQ: ${torque}Nm\n`+
      `HP: ${hp}\n`;
    // warnings
    let warn = '';
    if (rpm > config.maxRPM) warn += '⚠ Over RPM!\n';
    if (config.material==='ceramic' && torque>500) warn += '⚠ Ceramic overload\n';
    if (config.throttle===1 && config.fuel==='diesel') warn += '⚠ Diesel no spark\n';
    if (warn) statusDiv.textContent += warn;
  }

  // —— MAIN LOOP —————————————————————————————————————————————————————
  function loop(ts) {
    const dt = (ts - lastTime)/1000;
    lastTime = ts;
    if (appState === STATE.PLAY) updateEngine(dt);
    draw();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(ts => { lastTime = ts; loop(ts); });
})();
