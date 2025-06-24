// engine-sim.js — Engine Simulator 2 Complete (Buttons Fixed)
// ============================================================

(() => {
  // —— INJECT GLOBAL STYLES ———————————————————————————————————————
  const style = document.createElement('style');
  style.textContent = `
    button {
      cursor: pointer;
      transition: all 0.2s ease;
      background: #333;
      color: #fff;
      border: 1px solid #555;
      padding: 8px 12px;
      margin: 5px 0;
      font-size: 16px;
      width: 100%;
      box-sizing: border-box;
    }
    button:hover {
      transform: translateX(-8px);
      filter: brightness(1.2);
      background: #444;
    }
    /* ensure UI layers accept pointer events */
    #uiLayer, #menuDiv, #creditsDiv, #loadingDiv, #toolbox {
      pointer-events: auto !important;
    }
  `;
  document.head.appendChild(style);

  // —— CANVAS SETUP ——————————————————————————————————————————————
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

  // —— APPLICATION STATE ———————————————————————————————————————————
  const STATE = { MENU: 0, LOADING: 1, PLAY: 2, CREDITS: 3 };
  let appState = STATE.MENU;
  let lastTime = 0;

  // —— PHYSICS STATE —————————————————————————————————————————————
  let crankAngle = 0, crankVel = 0;

  // —— CONFIGURATION —————————————————————————————————————————————
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

  function rpmToAng(rpm) { return rpm * 2 * Math.PI / 60; }
  function angToRPM(ang) { return ang * 60 / (2 * Math.PI); }

  // —— INPUT HANDLING —————————————————————————————————————————————
  window.addEventListener('keydown', e => {
    if (appState === STATE.PLAY && e.key.toLowerCase() === 'w') config.throttle = 1;
  });
  window.addEventListener('keyup', e => {
    if (appState === STATE.PLAY && e.key.toLowerCase() === 'w') config.throttle = 0;
  });

  // —— PARTICLES ———————————————————————————————————————————————————
  const particles = [];
  function spawnParticle(x,y,dx,dy,color){
    particles.push({ x,y,dx,dy,life:1,color });
  }
  function updateParticles(dt){
    for (let p of particles) {
      p.x += p.dx*dt;
      p.y += p.dy*dt;
      p.life -= dt;
    }
    for (let i=particles.length-1; i>=0; i--){
      if (particles[i].life<=0) particles.splice(i,1);
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

  // —— AUDIO STUBS —————————————————————————————————————————————————
  const sounds = {
    start: new Audio('/sounds/start.mp3'),
    idle: new Audio('/sounds/idle.mp3'),
    stop:  new Audio('/ounds/stop.mp3'),
    ignite:new Audio('/sounds/ignite.mp3'),
    rev:   new Audio('/sounds/rev.mp3')
  };
  sounds.idle.loop = true;
  function playSound(name){
    const s = sounds[name];
    if (!s) return;
    s.pause();
    s.currentTime = 0;
    s.play().catch(()=>{});
  }

  // —— UI LAYERS ————————————————————————————————————————————————————
  const uiLayer = document.createElement('div');
  uiLayer.id = 'uiLayer';
  Object.assign(uiLayer.style,{
    position:'fixed',left:0,top:0,width:'100%',height:'100%',
    pointerEvents:'auto' // enable clicks
  });
  document.body.appendChild(uiLayer);

  // --- MENU DIV ---
  const menuDiv = document.createElement('div');
  menuDiv.id = 'menuDiv';
  Object.assign(menuDiv.style,{
    position:'absolute',width:'100%',height:'100%',
    background:'#111', display:'flex',flexDirection:'column',
    alignItems:'center',justifyContent:'center', color:'#fff',
    fontFamily:'sans-serif', fontSize:'32px'
  });
  menuDiv.innerHTML = `
    <div style="margin-bottom:30px;">Engine Simulator</div>
    <div style="font-size:18px;margin-bottom:60px;">Version 0.2 Beta</div>
    <button id="btnPlay">Play</button>
    <button id="btnCredits">Credits</button>
    <button id="btnQuit">Quit</button>
  `;
  uiLayer.appendChild(menuDiv);

  // --- CREDITS DIV ---
  const creditsDiv = document.createElement('div');
  creditsDiv.id = 'creditsDiv';
  Object.assign(creditsDiv.style,{
    position:'absolute',width:'100%',height:'100%',
    background:'#111', color:'#fff', fontFamily:'sans-serif',
    padding:'20px', display:'none'
  });
  creditsDiv.innerHTML = `
    <button id="btnBack">&larr; Back</button>
    <h2>Credits</h2>
    <p>Scripter: ChatGPT<br>Idea: Loay<br>Sound: Adam</p>
  `;
  uiLayer.appendChild(creditsDiv);

  // --- LOADING DIV ---
  let loadingDots = 0;
  const loadingDiv = document.createElement('div');
  loadingDiv.id = 'loadingDiv';
  Object.assign(loadingDiv.style,{
    position:'absolute',width:'100%',height:'100%',
    background:'#111', color:'#fff', fontFamily:'sans-serif',
    display:'none', alignItems:'center',justifyContent:'center',
    fontSize:'24px', display:'flex'
  });
  loadingDiv.innerHTML = `<div>Loading<span id="dots"></span></div>`;
  uiLayer.appendChild(loadingDiv);

  // --- TOOLBOX ---
  const toolbox = document.createElement('div');
  toolbox.id = 'toolbox';
  Object.assign(toolbox.style,{
    position:'fixed',left:'0',top:'0',width:'260px',height:'100%',
    background:'#222',color:'#eee',padding:'10px',
    fontFamily:'monospace',fontSize:'14px',overflowY:'auto',
    display:'none'
  });
  uiLayer.appendChild(toolbox);

  // helper for toolbox
  function addLabel(txt){
    const d=document.createElement('div');
    d.textContent=txt; d.style.marginTop='10px';
    toolbox.appendChild(d);
  }
  function addSelect(options, onCh){
    const s=document.createElement('select');
    s.style.width='100%';
    options.forEach(o=>{
      const opt=document.createElement('option');
      opt.value=o; opt.textContent=o;
      s.appendChild(opt);
    });
    s.onchange=e=>onCh(e.target.value);
    toolbox.appendChild(s);
    return s;
  }
  function addSlider(min,max,step,val,onI){
    const r=document.createElement('input');
    r.type='range'; r.min=min; r.max=max; r.step=step; r.value=val;
    r.style.width='100%'; r.oninput=e=>onI(+e.target.value);
    toolbox.appendChild(r);
    return r;
  }

  // build controls
  addLabel('Stroke Type');
  addSelect(['2-stroke','4-stroke'], v=>config.stroke=v);
  addLabel('Layout');
  addSelect(['inline','v','boxer'], v=>config.layout=v);
  addLabel('Pistons');
  addSlider(1,12,1,4, v=>config.pistonCount=v);
  addLabel('Rings');
  addSlider(0,5,1,2, v=>config.rings=v);
  addLabel('Material');
  addSelect(['steel','aluminum','ceramic'], v=>config.material=v);
  addLabel('Exhaust');
  addSelect(['none','muffler','turbo'], v=>config.exhaust=v);
  addLabel('Fuel');
  addSelect(['gasoline','diesel'], v=>config.fuel=v);
  addLabel('Idle RPM');
  addSlider(500,3000,100,1000,v=>config.idleRPM=v);
  addLabel('Max RPM');
  addSlider(4000,12000,100,8000,v=>config.maxRPM=v);

  toolbox.appendChild(document.createElement('hr'));
  const btnStart = document.createElement('button');
  btnStart.textContent='START';
  btnStart.onclick = ()=> { config.running=true; playSound('start'); };
  toolbox.appendChild(btnStart);
  const btnStop = document.createElement('button');
  btnStop.textContent='STOP';
  btnStop.onclick = ()=> { config.running=false; playSound('stop'); };
  toolbox.appendChild(btnStop);

  // status panel
  const statusDiv = document.createElement('div');
  Object.assign(statusDiv.style,{
    position:'absolute', bottom:'10px', right:'10px',
    background:'rgba(0,0,0,0.6)', color:'#0f0',
    padding:'8px', fontFamily:'monospace', fontSize:'12px'
  });
  toolbox.appendChild(statusDiv);

  // —— BUTTON LOGIC ———————————————————————————————————————————————
  document.getElementById('btnPlay').onclick = ()=>{
    appState = STATE.LOADING;
    menuDiv.style.display='none';
    loadingDiv.style.display='flex';
    loadingDots=0;
    const di = setInterval(()=>{
      loadingDots=(loadingDots+1)%4;
      document.getElementById('dots').textContent='.'.repeat(loadingDots);
    },500);
    setTimeout(()=>{
      clearInterval(di);
      loadingDiv.style.display='none';
      appState = STATE.PLAY;
      toolbox.style.display='block';
    }, 2000);
  };
  document.getElementById('btnCredits').onclick = ()=>{
    appState = STATE.CREDITS;
    menuDiv.style.display='none';
    creditsDiv.style.display='block';
  };
  document.getElementById('btnQuit').onclick = ()=>window.close();
  document.getElementById('btnBack').onclick = ()=>{
    appState = STATE.MENU;
    creditsDiv.style.display='none';
    menuDiv.style.display='flex';
  };

  // —— ENGINE UPDATE —————————————————————————————————————————————
  function updateEngine(dt){
    // smooth velocity towards throttle-target
    const targetRPM = config.idleRPM + (config.maxRPM-config.idleRPM)*config.throttle;
    const targetAng = rpmToAng(targetRPM);
    crankVel += (targetAng - crankVel)*dt*2;
    if(!config.running) crankVel += (0-crankVel)*dt*1.5;
    crankAngle += crankVel*dt;

    // continuous particles
    const cx=canvas.width/2, cy=canvas.height/2;
    for(let i=0;i<2;i++){
      if(Math.random()<dt*20){
        spawnParticle(cx-100, cy-50, -5+Math.random()*10, -30+Math.random()*10,'lime');
        spawnParticle(cx+100, cy-50, -10+Math.random()*20, -40+Math.random()*20,'gray');
      }
    }
    updateParticles(dt);

    // idle sound pitch
    if(config.running) sounds.idle.playbackRate = 0.5 + angToRPM(crankVel)/config.maxRPM;
  }

  // —— RENDERING —————————————————————————————————————————————————————
  function draw(){
    // clear bg
    ctx.fillStyle='#111';
    ctx.fillRect(0,0,canvas.width,canvas.height);

    // grid
    const gap=50, off=(performance.now()/20)%gap;
    ctx.strokeStyle='#222'; ctx.lineWidth=1;
    for(let x=-off;x<canvas.width;x+=gap){
      ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,canvas.height);ctx.stroke();
    }
    for(let y=-off;y<canvas.height;y+=gap){
      ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(canvas.width,y);ctx.stroke();
    }

    if(appState===STATE.PLAY){
      drawEngine();
      drawParticles();
      drawStatus();
    }
  }

  function drawEngine(){
    const cx=canvas.width/2, cy=canvas.height/2+50;
    const rodLen=120;
    for(let i=0;i<config.pistonCount;i++){
      const phase = crankAngle + i*(2*Math.PI/config.pistonCount);
      const ang = phase%(2*Math.PI);
      const crankX = cx + Math.cos(ang)*40;
      const crankY = cy + Math.sin(ang)*40;
      const yOff = Math.sqrt(Math.max(0,rodLen*rodLen - Math.sin(ang)*40*40));
      const pistonY = cy - yOff;
      // layout X shift
      let px = cx + (i-(config.pistonCount-1)/2)*80;
      if(config.layout==='v'){
        px = cx + (i%2?80:-80);
      } else if(config.layout==='boxer'){
        px = cx + (i%2?100:-100);
      }
      // rod
      ctx.strokeStyle='#888'; ctx.lineWidth=6;
      ctx.beginPath();ctx.moveTo(crankX,crankY);ctx.lineTo(px,pistonY);ctx.stroke();
      // rings
      for(let r=0;r<config.rings;r++){
        ctx.strokeStyle='#444';
        ctx.strokeRect(px-22, pistonY+4+r*6,44,4);
      }
      // piston
      ctx.fillStyle = config.material==='steel'?'#aaa':config.material==='aluminum'?'#ddd':'#f90';
      ctx.fillRect(px-20,pistonY,40,30);
      // cylinder
      ctx.strokeStyle='#555'; ctx.lineWidth=3;
      ctx.strokeRect(px-25,pistonY-30,50,100);
      // valves/spark or ports
      if(config.stroke==='4-stroke'){
        // static valves
        ctx.fillStyle='#0f0';
        ctx.fillRect(px-10,pistonY-32,8,16);
        ctx.fillRect(px+2, pistonY-32,8,16);
        // spark at 90°
        if(Math.abs(ang-Math.PI/2)<0.05 && config.running){
          ctx.fillStyle='yellow';
          ctx.beginPath();ctx.arc(px,pistonY-40,6,0,2*Math.PI);ctx.fill();
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

  function drawStatus(){
    const rpm = Math.round(angToRPM(crankVel));
    const torque = Math.round(rpm*0.1);
    const hp = Math.round(torque*rpm/5252);
    statusDiv.textContent =
      `RPM: ${rpm}\nTQ: ${torque}Nm\nHP: ${hp}\n`;
    // warnings
    let w='';
    if(rpm>config.maxRPM) w+='⚠ Over RPM!\n';
    if(config.material==='ceramic' && torque>500) w+='⚠ Fragile ceramic\n';
    if(config.throttle===1 && config.fuel==='diesel') w+='⚠ Diesel no spark\n';
    if(w) statusDiv.textContent += w;
  }

  // —— MAIN LOOP ———————————————————————————————————————————————————
  function loop(ts){
    const dt=(ts-lastTime)/1000;
    lastTime=ts;
    if(appState===STATE.PLAY) updateEngine(dt);
    draw();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(ts=>{ lastTime=ts; loop(ts); });
})();
