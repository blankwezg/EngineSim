// engine-sim.js — Ultimate Engine Simulator 2
// ============================================

(() => {
  // —————————————————————————————————————————————————————————————————
  // CANVAS SETUP
  const canvas = document.createElement('canvas');
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  function resize(){ canvas.width = innerWidth; canvas.height = innerHeight; }
  window.addEventListener('resize', resize);
  resize();

  // —————————————————————————————————————————————————————————————————
  // CONFIG & STATE
  const config = {
    stroke: '4-stroke',   // '2-stroke' or '4-stroke'
    layout: 'inline',     // 'inline', 'v', or 'boxer'
    pistonCount: 4,       // 1–12
    rings: 2,             // 0–5
    material: 'steel',    // 'steel','aluminum','ceramic'
    exhaust: 'muffler',   // 'none','muffler','turbo'
    fuel: 'gasoline',     // 'gasoline','diesel'
    idleRPM: 1000,        // 500–3000
    maxRPM: 8000,         // 4000–12000
    throttle: 0,          // 0–1
    running: false
  };
  let crankAngle = 0, crankVel = 0;
  let lastTime = 0;

  // —————————————————————————————————————————————————————————————————
  // INPUT
  window.addEventListener('keydown', e => {
    if (e.key.toLowerCase() === 'w') config.throttle = 1;
  });
  window.addEventListener('keyup', e => {
    if (e.key.toLowerCase() === 'w') config.throttle = 0;
  });

  // —————————————————————————————————————————————————————————————————
  // PARTICLES
  const particles = [];
  function spawnParticle(x,y,dx,dy,color){
    particles.push({x,y,dx,dy,life:1,color});
  }
  function updateParticles(dt){
    for (let p of particles){
      p.x+=p.dx*dt; p.y+=p.dy*dt; p.life-=dt;
    }
    for (let i=particles.length-1;i>=0;i--){
      if (particles[i].life<=0) particles.splice(i,1);
    }
  }
  function drawParticles(){
    ctx.save();
    for (let p of particles){
      ctx.globalAlpha=p.life;
      ctx.fillStyle=p.color;
      ctx.beginPath();
      ctx.arc(p.x,p.y,4,0,2*Math.PI);
      ctx.fill();
    }
    ctx.restore();
  }

  // —————————————————————————————————————————————————————————————————
  // AUDIO STUBS
  const sounds = {
    start: new Audio('/sounds/start.mp3'),
    idle:  new Audio('/sounds/idle.mp3'),
    stop:  new Audio('/sounds/stop.mp3'),
    ignite:new Audio('/sounds/ignite.mp3'),
    rev:   new Audio('/sounds/rev.mp3')
  };
  sounds.idle.loop = true;
  function playSound(name,rate=1){
    const s=sounds[name]; if(!s) return;
    s.pause(); s.currentTime=0; s.play().catch(()=>{});
    s.playbackRate=rate;
  }

  // —————————————————————————————————————————————————————————————————
  // UTILS
  const toRad = a => a * Math.PI/180;
  const rpmToAng = rpm => rpm*2*Math.PI/60;
  const angToRPM = ang => ang*60/(2*Math.PI);

  // —————————————————————————————————————————————————————————————————
  // UI TOOLBOX
  const toolbox = document.createElement('div');
  Object.assign(toolbox.style,{
    position:'fixed',left:'0',top:'0',width:'260px',height:'100%',
    background:'#222',color:'#eee',padding:'10px',
    fontFamily:'monospace',fontSize:'14px',overflowY:'auto',
    zIndex:10
  });
  document.body.appendChild(toolbox);

  function addLabel(txt){
    const d=document.createElement('div');
    d.textContent=txt; d.style.marginTop='12px';
    toolbox.appendChild(d);
  }
  function addSelect(opts,onCh){
    const s=document.createElement('select');
    s.style.width='100%';
    opts.forEach(o=>{let opt=document.createElement('option');opt.value=o;opt.textContent=o;s.appendChild(opt)});
    s.onchange=e=>onCh(e.target.value);
    toolbox.appendChild(s);
    return s;
  }
  function addSlider(min,max,step,val,onI){
    const r=document.createElement('input');
    r.type='range'; r.min=min;r.max=max;r.step=step;r.value=val;
    r.style.width='100%'; r.oninput=e=>onI(+e.target.value);
    toolbox.appendChild(r); return r;
  }

  // Build Controls
  addLabel('Stroke Type');   addSelect(['2-stroke','4-stroke'],v=>config.stroke=v);
  addLabel('Layout');        addSelect(['inline','v','boxer'],v=>config.layout=v);
  addLabel('Pistons');       addSlider(1,12,1,4,v=>config.pistonCount=v);
  addLabel('Rings');         addSlider(0,5,1,2,v=>config.rings=v);
  addLabel('Material');      addSelect(['steel','aluminum','ceramic'],v=>config.material=v);
  addLabel('Exhaust');       addSelect(['none','muffler','turbo'],v=>config.exhaust=v);
  addLabel('Fuel');          addSelect(['gasoline','diesel'],v=>config.fuel=v);
  addLabel('Idle RPM');      addSlider(500,3000,100,1000,v=>config.idleRPM=v);
  addLabel('Max RPM');       addSlider(4000,12000,100,8000,v=>config.maxRPM=v);
  toolbox.appendChild(document.createElement('hr'));

  const btnStart=document.createElement('button');
  btnStart.textContent='START'; btnStart.onclick=()=>{
    config.running=true; playSound('start'); crankVel=rpmToAng(config.idleRPM); sounds.idle.play();
  };
  toolbox.appendChild(btnStart);

  const btnStop=document.createElement('button');
  btnStop.textContent='STOP'; btnStop.onclick=()=>{
    config.running=false; sounds.idle.pause(); playSound('stop');
  };
  toolbox.appendChild(btnStop);

  // Engine Spec Display (top-left)
  const specDiv=document.createElement('div');
  Object.assign(specDiv.style,{
    position:'fixed',top:'10px',left:'280px',
    padding:'6px 12px',background:'rgba(0,0,0,0.6)',
    color:'#fff',fontFamily:'monospace',fontSize:'14px',zIndex:5
  });
  document.body.appendChild(specDiv);

  // Status/Warn Panel (bottom-right)
  const statusDiv=document.createElement('div');
  Object.assign(statusDiv.style,{
    position:'fixed',bottom:'10px',right:'10px',
    padding:'6px 12px',background:'rgba(0,0,0,0.6)',
    color:'#0f0',fontFamily:'monospace',fontSize:'12px',zIndex:5
  });
  document.body.appendChild(statusDiv);

  // —————————————————————————————————————————————————————————————————
  // MAIN UPDATE
  function update(dt){
    // throttle → target RPM
    let target = config.idleRPM + (config.maxRPM-config.idleRPM)*config.throttle;
    let targetAng = rpmToAng(target);
    // smooth crankVel
    crankVel += (targetAng-crankVel)*dt*2;
    if(!config.running) crankVel += (0-crankVel)*dt*1.5;
    crankAngle += crankVel*dt;

    // per-cylinder particles
    const baseX=innerWidth/2, baseY=innerHeight/2;
    for(let i=0;i<config.pistonCount;i++){
      const phase = crankAngle + i*(2*Math.PI/config.pistonCount);
      const ang=phase%(2*Math.PI);
      // compute port positions
      let px = baseX + (i-(config.pistonCount-1)/2)*60;
      if(config.layout==='v') px = baseX + (i%2?80:-80);
      if(config.layout==='boxer') px = baseX + (i%2?100:-100);
      const py = baseY - Math.sqrt(Math.max(0,120*120 - Math.sin(ang)*40*40)) - 30;
      // intake always
      if(Math.random()<dt*20)
        spawnParticle(px-30,py+10, -10+Math.random()*20, -20+Math.random()*10,'lime');
      // exhaust
      if(Math.random()<dt*20)
        spawnParticle(px+30,py+10, -20+Math.random()*30, -30+Math.random()*15,'gray');
    }
    updateParticles(dt);

    // idle sound pitch
    if(config.running) sounds.idle.playbackRate = 0.5 + angToRPM(crankVel)/config.maxRPM;
  }

  // —————————————————————————————————————————————————————————————————
  // DRAW
  function draw(){
    // background
    ctx.fillStyle='#111';
    ctx.fillRect(0,0,innerWidth,innerHeight);

    // moving grid
    const g=50, o=(performance.now()/15)%g;
    ctx.strokeStyle='#222'; ctx.lineWidth=1;
    for(let x=-o;x<innerWidth;x+=g){
      ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,innerHeight);ctx.stroke();
    }
    for(let y=-o;y<innerHeight;y+=g){
      ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(innerWidth,y);ctx.stroke();
    }

    // draw crankshaft center circle
    const cx=innerWidth/2, cy=innerHeight/2+20;
    ctx.fillStyle='#333';
    ctx.beginPath(); ctx.arc(cx,cy,60,0,2*Math.PI); ctx.fill();

    // draw each piston via z-sorting
    let pistons=[]
    for(let i=0;i<config.pistonCount;i++){
      const phase=crankAngle+i*(2*Math.PI/config.pistonCount);
      const ang=phase%(2*Math.PI);
      const yOff = Math.sqrt(Math.max(0,120*120 - Math.sin(ang)*40*40));
      let px = cx+(i-(config.pistonCount-1)/2)*60;
      if(config.layout==='v') px=cx+(i%2?80:-80);
      if(config.layout==='boxer') px=cx+(i%2?100:-100);
      const py = cy - yOff;
      pistons.push({i,px,py,ang,phase});
    }
    // sort back→front by py (higher y = further back)
    pistons.sort((a,b)=>b.py - a.py);
    for(let p of pistons) drawPiston(p);

    drawParticles();
    drawSpec();
    drawStatus();
  }

  function drawPiston({i,px,py,ang,phase}){
    // crank pin
    const cx=innerWidth/2, cy=innerHeight/2+20;
    const crankX = cx + Math.cos(ang)*40;
    const crankY = cy + Math.sin(ang)*40;
    // rod
    ctx.strokeStyle='#888'; ctx.lineWidth=6;
    ctx.beginPath();ctx.moveTo(crankX,crankY);ctx.lineTo(px,py);ctx.stroke();
    // rings
    for(let r=0;r<config.rings;r++){
      ctx.strokeStyle='#444';
      ctx.strokeRect(px-22,py+4+r*6,44,4);
    }
    // piston
    ctx.fillStyle = (config.material==='steel'?'#aaa':config.material==='aluminum'?'#ddd':'#f90');
    ctx.fillRect(px-20,py,40,30);
    // cylinder
    ctx.strokeStyle='#555'; ctx.lineWidth=3;
    ctx.strokeRect(px-25,py-30,50,100);
    // valves or ports
    if(config.stroke==='4-stroke'){
      // animate valves every stroke (open for 60° around top dead center)
      const open = Math.abs((phase % (2*Math.PI)) - Math.PI/2) < toRad(30);
      ctx.fillStyle='#0f0';
      if(open){
        ctx.fillRect(px-12,py-32,8,16);
        ctx.fillRect(px+4, py-32,8,16);
      } else {
        ctx.fillRect(px-12,py-20,8,4);
        ctx.fillRect(px+4, py-20,8,4);
      }
      // spark
      if(Math.abs((phase%(2*Math.PI)) - Math.PI/2) < toRad(3) && config.running){
        ctx.fillStyle='yellow';
        ctx.beginPath();ctx.arc(px,py-40,6,0,2*Math.PI);ctx.fill();
        playSound('ignite');
      }
    } else {
      // 2-stroke: intake port left, exhaust port right
      ctx.fillStyle='lime';
      ctx.beginPath();
      ctx.arc(px-15,py+10,8,Math.PI,0);
      ctx.fill();
      ctx.fillStyle='gray';
      ctx.beginPath();
      ctx.arc(px+15,py+10,8,0,Math.PI);
      ctx.fill();
    }
    // turbo on exhaust if selected (draw spinning wheel at exhaust port)
    if(config.exhaust==='turbo'){
      const angle = -phase*2;
      const tx = px + (config.stroke==='2-stroke' ? 15 : 15);
      const ty = py + 10;
      ctx.save();
      ctx.translate(tx,ty);
      ctx.rotate(angle);
      ctx.strokeStyle='#aaa'; ctx.lineWidth=3;
      ctx.beginPath(); ctx.arc(0,0,12,0,Math.PI*1.5); ctx.stroke();
      ctx.restore();
    }
  }

  function drawSpec(){
    const spec = 
      (config.layout==='inline'?'Inline':
      config.layout==='v'?'V':'Boxer')
      + ' ' + config.pistonCount;
    specDiv.textContent = spec;
  }

  function drawStatus(){
    const rpm = Math.round(angToRPM(crankVel));
    const torque = Math.round(rpm*0.1);
    const hp = Math.round(torque*rpm/5252);
    let txt = `RPM: ${rpm}\nTQ: ${torque}Nm\nHP: ${hp}`;
    let warn = '';
    if(rpm>config.maxRPM) warn+='⚠ Over RPM\n';
    if(config.material==='ceramic' && torque>500) warn+='⚠ Ceramic Fragile\n';
    if(config.throttle===1 && config.fuel==='diesel') warn+='⚠ Diesel no spark\n';
    statusDiv.textContent = txt + (warn?'\n'+warn:'');
  }

  // —————————————————————————————————————————————————————————————————
  // MAIN LOOP
  function loop(ts){
    const dt = (ts - lastTime)/1000;
    lastTime = ts;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(ts=>{lastTime=ts; loop(ts);});
})();
