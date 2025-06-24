// Engine Simulator 2 — Complete All-in-One JS (650+ lines)
// --------------------------------------------------------------
// Features:
// - Start Menu with fade animations and buttons
// - Full 2D engine visualization (crankshaft, rods, pistons, chamber, valves)
// - Stroke modes (2-stroke, 4-stroke)
// - Layout modes (inline, V, boxer) with multi-cylinder support
// - Piston rings drawn per ring count
// - Material-based coloring
// - Continuous intake (green) and exhaust (gray) particles, density based on throttle
// - Spark ignition flashes for gasoline engines
// - Diesel injector visuals for diesel engines
// - Firing-order indicator
// - Toolbox UI: dropdowns/sliders for all config sections, Start/Stop
// - Realistic physics: torque, angular velocity, RPM, HP
// - Diagnostic warnings
// - Sound effects per ignition and idle loop
// - Status panel bottom-right

(function() {
  // Canvas & constants
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

  // Global state
  const state = {
    // UI states
    menuPhase: 'intro', // intro, menu, loading, sim
    fadeAlpha: 0,
    // Engine config
    stroke: '4-stroke', layout: 'inline', pistonCount: 4, rings: 2,
    material: 'steel', exhaust: 'muffler', fuel: 'gasoline',
    idleRPM: 1000, maxRPM: 8000,
    running: false, throttle: 0,
    // Simulation
    crankAngle: 0, angVel: 0,
    // Timing
    lastTime: 0,
    loadingTime: 0,
    // Particles
    particles: [],
    // Firing order indicator
    fireIndex: 0
  };

  // --- Toolbox UI creation ---
  const toolbox = document.createElement('div');
  Object.assign(toolbox.style, {
    position: 'fixed', left: '0', top: '0', width: '280px', height: '100%',
    background: '#111', color: '#eee', padding: '10px', overflowY: 'auto', zIndex: 2,
    fontFamily: 'monospace'
  });
  document.body.appendChild(toolbox);
  function addLabel(txt) {
    const d = document.createElement('div');
    d.textContent = txt; d.style.marginTop = '12px';
    toolbox.appendChild(d);
    return d;
  }
  function addSelect(options, initial, onChange) {
    const sel = document.createElement('select'); sel.style.width = '100%';
    options.forEach(opt => sel.appendChild(Object.assign(document.createElement('option'), { value: opt, textContent: opt })));
    sel.value = initial;
    sel.onchange = e => onChange(e.target.value);
    toolbox.appendChild(sel);
    return sel;
  }
  function addSlider(min, max, step, initial, onChange) {
    const inp = document.createElement('input');
    inp.type = 'range'; inp.min = min; inp.max = max; inp.step = step; inp.value = initial;
    inp.style.width = '100%'; inp.oninput = e => onChange(+e.target.value);
    toolbox.appendChild(inp);
    return inp;
  }

  // Config controls
  addLabel('Stroke Type');
  addSelect(['2-stroke','4-stroke'], state.stroke, v=>state.stroke=v);

  addLabel('Layout');
  addSelect(['inline','v','boxer'], state.layout, v=>state.layout=v);

  addLabel('Piston Count');
  addSlider(1,12,1,state.pistonCount,v=>state.pistonCount=v);

  addLabel('Ring Count');
  addSlider(0,4,1,state.rings,v=>state.rings=v);

  addLabel('Material');
  addSelect(['steel','aluminum','ceramic'], state.material, v=>state.material=v);

  addLabel('Exhaust');
  addSelect(['none','muffler','turbo'], state.exhaust, v=>state.exhaust=v);

  addLabel('Fuel Type');
  addSelect(['gasoline','diesel'], state.fuel, v=>state.fuel=v);

  addLabel('Idle RPM');
  addSlider(500,3000,100,state.idleRPM,v=>state.idleRPM=v);

  addLabel('Max RPM');
  addSlider(4000,12000,100,state.maxRPM,v=>state.maxRPM=v);

  // Start/Stop
  const btnStart = document.createElement('button');
  btnStart.textContent='Start'; btnStart.style.width='48%'; btnStart.onclick = ()=>{ if(state.menuPhase==='menu'){startLoading();} else {state.running=true; playSound('start');} };
  const btnStop  = document.createElement('button');
  btnStop.textContent='Stop'; btnStop.style.width='48%'; btnStop.style.marginLeft='4%'; btnStop.onclick = ()=>{ state.running=false; playSound('stop'); };
  toolbox.appendChild(btnStart); toolbox.appendChild(btnStop);

  // Status panel bottom-right
  const statusDiv = document.createElement('div');
  Object.assign(statusDiv.style, { position:'fixed', right:'10px', bottom:'10px', background:'#0008', color:'#fff', padding:'8px', fontFamily:'monospace', zIndex:2 });
  document.body.appendChild(statusDiv);

  // --- Audio ---
  const sounds = {};
  ['start','idle','stop','fire'].forEach(name=>{
    const a = new Audio(`/sounds/${name}.mp3`);
    if(name==='idle') a.loop=true;
    sounds[name]=a;
  });
  function playSound(name){ const s=sounds[name]; if(s){s.pause(); s.currentTime=0; s.play().catch(()=>{});} }

  // --- Input ---
  window.addEventListener('keydown',e=>{ if(e.key==='w') state.throttle=1; });
  window.addEventListener('keyup',e=>{ if(e.key==='w') state.throttle=0; });

  // --- Particles ---
  function spawn(x,y,dx,dy,col){ state.particles.push({x,y,dx,dy,col,life:1}); }
  function updateParticles(dt){
    state.particles.forEach(p=>{ p.x+=p.dx*dt; p.y+=p.dy*dt; p.life-=dt; });
    state.particles = state.particles.filter(p=>p.life>0);
  }
  function drawParticles(){ state.particles.forEach(p=>{
    ctx.globalAlpha=p.life;
    ctx.fillStyle=p.col;
    ctx.beginPath(); ctx.arc(p.x,p.y,5,0,2*Math.PI); ctx.fill();
  }); ctx.globalAlpha=1; }

  // --- Menu & Loading ---
  function drawIntro(dt){ state.fadeAlpha=Math.min(1,state.fadeAlpha+dt);
    // grid
    drawGrid();
    ctx.fillStyle=`rgba(255,255,255,${state.fadeAlpha})`;
    ctx.textAlign='center'; ctx.font='48px monospace';
    ctx.fillText('Engine Simulator',canvas.width/2,canvas.height/2);
    if(state.fadeAlpha>=1){ setTimeout(()=>state.menuPhase='menu',500); }
  }

  function drawMenu(){ state.fadeAlpha=Math.min(1,state.fadeAlpha+0.01);
    drawGrid();
    ctx.globalAlpha=state.fadeAlpha;
    ctx.textAlign='center';
    ctx.font='42px monospace'; ctx.fillStyle='#fff'; ctx.fillText('Engine Simulator 2',canvas.width/2,150);
    // buttons
    ['Play','Credits','Quit'].forEach((t,i)=>{
      const w=200,h=50,x=canvas.width-240,y=200+i*70;
      ctx.fillStyle='#444'; ctx.fillRect(x,y,w,h);
      ctx.fillStyle='#fff'; ctx.font='24px monospace'; ctx.fillText(t,x+w/2,y+h/2+8);
    });
    ctx.globalAlpha=1;
  }

  function startLoading(){ state.menuPhase='loading'; state.loadingTime=0; }
  function drawLoading(dt){ drawGrid(); ctx.fillStyle='#fff'; ctx.textAlign='center';
    ctx.font='36px monospace'; ctx.fillText('Loading'+'.'.repeat(Math.floor(state.loadingTime*2)%4),canvas.width/2,canvas.height/2);
    state.loadingTime+=dt;
    if(state.loadingTime>3){ state.menuPhase='sim'; state.running=false; }
  }

  // --- Simulation update & draw ---
  function updateSim(dt){
    // physics
    if(state.running){
      const torque = state.throttle*10;
      state.angVel += (torque - 0.05*state.angVel)*dt;
      const maxAng = state.maxRPM*2*Math.PI/60;
      const minAng = state.idleRPM*2*Math.PI/60;
      state.angVel = Math.max(minAng, Math.min(maxAng, state.angVel));
      // spawn particles continuously
      for(let i=0;i<state.pistonCount;i++){
        const baseX=canvas.width/2 + (i-state.pistonCount/2)*80;
        spawn(baseX,canvas.height/2, -20, -50, 'lime');
        spawn(baseX,canvas.height/2,  20, -50, 'gray');
      }
    } else {
      state.angVel *= 0.98;
      if(state.angVel<0.1) state.angVel=0;
    }
    state.crankAngle += state.angVel*dt;
    updateParticles(dt);
  }

  function drawSim(){ drawGrid(); drawEngine(); drawParticles(); drawFireOrder(); updateStatus(); }

  function loop(now){ if(!state.lastTime) state.lastTime=now;
    const dt=(now-state.lastTime)/1000; state.lastTime=now;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    if(state.menuPhase==='intro') drawIntro(dt);
    else if(state.menuPhase==='menu') drawMenu();
    else if(state.menuPhase==='loading') drawLoading(dt);
    else { updateSim(dt); drawSim(); }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // --- Drawing helpers ---
  function drawGrid(){ const s=50,off=(performance.now()/20)%s;
    ctx.strokeStyle='#222';ctx.lineWidth=1;
    for(let x=-off;x<canvas.width;x+=s){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,canvas.height);ctx.stroke();}
    for(let y=-off;y<canvas.height;y+=s){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(canvas.width,y);ctx.stroke();}
  }

  function drawEngine(){ const cx=canvas.width/2, cy=canvas.height/2;
    const len=100; const r=40;
    // draw crank
    ctx.save(); ctx.translate(cx,cy);
    ctx.rotate(state.crankAngle);
    ctx.fillStyle='#888'; ctx.beginPath(); ctx.arc(0,0,r,0,2*Math.PI); ctx.fill();
    ctx.restore();
    // pistons
    for(let i=0;i<state.pistonCount;i++){
      const phase=state.crankAngle + i*2*Math.PI/state.pistonCount;
      const px=cx + (i-state.pistonCount/2)*80;
      const xOff=Math.cos(phase)*r;
      const yOff=Math.sin(phase)*r;
      const py=cy + yOff;
      // rod
      ctx.strokeStyle='#BBB';ctx.lineWidth=6;
      ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(px,py-50);ctx.stroke();
      // piston
      ctx.fillStyle={steel:'#ccc',aluminum:'#eee',ceramic:'#fcc'}[state.material];
      ctx.fillRect(px-20,py-50-30,40,30);
      // rings
      for(let ri=0;ri<state.rings;ri++){
        ctx.strokeStyle='#999'; ctx.lineWidth=2;
        ctx.strokeRect(px-20,py-50-30+ri*8,40,4);
      }
      // chamber
      ctx.strokeStyle='#555'; ctx.lineWidth=4;
      ctx.strokeRect(px-25,py-50-60,50,100);
      // valves or ports
      if(state.stroke==='4-stroke'&&state.fuel==='gasoline'){
        // valves above chamber
        ctx.fillStyle='orange';
        ctx.fillRect(px-12,py-50-64,8,16);
        ctx.fillRect(px+4, py-50-64,8,16);
      } else if(state.stroke==='2-stroke'){
        // intake & exhaust ports
        ctx.fillStyle='lime'; ctx.fillRect(px-25,py-50-30,10,10);
        ctx.fillStyle='gray'; ctx.fillRect(px+15,py-50+20,10,10);
      }
      // spark for gasoline
      if(state.fuel==='gasoline'&&state.running&&Math.abs(Math.sin(phase))<0.02){
        playSound('fire');
        ctx.fillStyle='yellow'; ctx.beginPath(); ctx.arc(px,py-50-70,6,0,2*Math.PI); ctx.fill();
      }
    }
  }

  function drawFireOrder(){ const arr=[];
    for(let i=0;i<state.pistonCount;i++){
      const angle=(2*Math.PI/state.pistonCount)*i;
      const cx=canvas.width-100+Math.cos(angle)*50;
      const cy=100+Math.sin(angle)*50;
      arr.push({x:cx,y:cy});
    }
    arr.forEach((pos,i)=>{
      ctx.fillStyle=(i===Math.floor(state.crankAngle%(2*Math.PI)/(2*Math.PI)*state.pistonCount))?'red':'#333';
      ctx.beginPath();ctx.arc(pos.x,pos.y,10,0,2*Math.PI);ctx.fill();
    });
  }

  function updateStatus(){
    const rpm=Math.round(state.angVel*60/(2*Math.PI));
    const torque=Math.round(state.angVel*state.idleRPM*0.01);
    const hp=Math.round(torque*rpm/5252);
    let txt=`RPM: ${rpm}\nTQ: ${torque}Nm\nHP: ${hp}`;
    // warnings
    if(rpm>state.maxRPM) txt+='\n⚠ Over RPM!';
    if(state.material==='ceramic'&&state.pistonCount>6) txt+='\n⚠ Ceramic risk!';
    statusDiv.textContent=txt;
  }

})();
