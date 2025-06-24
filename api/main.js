// main.js - EngineSim
// Single-file 2D Engine Simulator with manual physics and UI

// Create and configure canvas
document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.createElement('canvas');
  document.body.style.margin = '0';
  document.body.style.overflow = 'hidden';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  let W = canvas.width = window.innerWidth;
  let H = canvas.height = window.innerHeight;
  window.addEventListener('resize', () => { W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; });

  // Application state
  const State = { INTRO: 0, MENU: 1, CREDITS: 2, LOADING: 3, GAME: 4 };
  let state = State.INTRO;

  // Timers
  let introTime = 0;
  const INTRO_DURATION = 3000;   // ms until full fade-in
  const TITLE_DELAY = 1000;

  let loadingTime = 0;
  const LOADING_DURATION = 10000;
  let loadingDots = 0;

  // Mouse and keyboard
  let mouse = { x:0, y:0, clicked:false };
  canvas.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });
  canvas.addEventListener('mousedown', e => { mouse.clicked = true; });
  document.addEventListener('keydown', e => { if(e.key === 'w' || e.key === 'W') throttle = 1; });
  document.addEventListener('keyup', e => { if(e.key === 'w' || e.key === 'W') throttle = 0; });

  // UI button definitions
  const buttons = {
    play: { x: W - 200, y: H/2 - 60, w: 150, h: 40, text: 'Play' },
    credits: { x: W - 200, y: H/2, w: 150, h: 40, text: 'Credits' },
    quit: { x: W - 200, y: H/2 + 60, w: 150, h: 40, text: 'Quit' },
    creditsBack: { x: 20, y: 20, w: 30, h: 30, text: 'X' }
  };

  // Engine configuration defaults
  const config = {
    strokeType: '4-stroke', // '2-stroke'
    pistonDiameter: 40,
    rodLength: 100,
    crankRadius: 40,
    crankInertia: 1,
    valves: 2,
    smokeDensity: 0.5,
    muffler: true,
    rings: 3,
    material: 'steel',
    fuel: 'gasoline', // 'diesel'
    idleRPM: 1000,
    maxRPM: 8000,
    layout: 'inline', // 'v', 'flat'
    cylinders: 1
  };

  // Engine simulation state
  class Engine {
    constructor(cfg) {
      this.cfg = cfg;
      this.angle = 0;           // radians
      this.omega = cfg.idleRPM * 2 * Math.PI / 60; // rad/s
      this.throttle = 0;
      this.particles = [];
    }
    update(dt) {
      // compute torque base on throttle and displacement
      const disp = Math.PI * Math.pow(this.cfg.pistonDiameter/2,2) * this.cfg.rodLength * this.cfg.cylinders;
      let torque = disp * this.throttle * 0.001; // simplistic
      // friction torque
      const friction = 0.05;
      const netTorque = torque - friction;
      const alpha = netTorque / this.cfg.crankInertia;
      this.omega += alpha * dt;
      // clamp RPM
      const maxOmega = this.cfg.maxRPM * 2 * Math.PI/60;
      if(this.omega > maxOmega) this.omega = maxOmega;
      if(this.omega < this.cfg.idleRPM * 2*Math.PI/60) this.omega = this.cfg.idleRPM * 2*Math.PI/60;
      this.angle += this.omega * dt;
      // spawn particles on exhaust stroke
      const cycle = this.angle % (Math.PI*(this.cfg.strokeType==='4-stroke'?2:1));
      if(cycle < this.omega*dt) {
        // spawn exhaust
        this.particles.push({ x: W/2, y: H/2 - this.cfg.rodLength - 20, vx: 50, vy: -20, life:1 });
      }
      this.particles = this.particles.filter(p => p.life>0).map(p => ({ x:p.x+p.vx*dt, y:p.y+p.vy*dt, vx:p.vx, vy:p.vy, life:p.life- dt }));
    }
    draw(ctx) {
      // draw crank
      const cx = W/2, cy = H/2;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(this.angle);
      ctx.beginPath(); ctx.arc(0,0,this.cfg.crankRadius,0,2*Math.PI); ctx.fill();
      ctx.restore();
      // draw rod and piston
      const r = this.cfg.crankRadius;
      const L = this.cfg.rodLength;
      const a = this.angle;
      const x = cx + r*Math.cos(a);
      const y = cy + r*Math.sin(a);
      const dx = x - cx;
      const dy = y - cy;
      // rod
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x, y); ctx.lineWidth=5; ctx.stroke();
      // piston
      const pistonY = cy - L;
      ctx.fillRect(x-20, pistonY, 40, 30);
      // particles
      this.particles.forEach(p=>{
        ctx.globalAlpha = p.life;
        ctx.beginPath(); ctx.arc(p.x,p.y,5,0,2*Math.PI); ctx.fill();
        ctx.globalAlpha = 1;
      });
    }
  }

  let engine;
  let throttle = 0;

  // Main loop
  let last = performance.now();
  function loop(now) {
    const dt = (now - last)/1000;
    last = now;
    ctx.clearRect(0,0,W,H);
    drawGrid(ctx, now);

    switch(state) {
      case State.INTRO: drawIntro(ctx, dt); break;
      case State.MENU: drawMenu(ctx); handleMenuClick(); break;
      case State.CREDITS: drawCredits(ctx); handleCreditsClick(); break;
      case State.LOADING: drawLoading(ctx, dt); break;
      case State.GAME:
        if(!engine) engine = new Engine(config);
        engine.throttle = throttle;
        engine.update(dt);
        engine.draw(ctx);
        drawGameUI(ctx);
        break;
    }
    mouse.clicked = false;
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // Drawing functions:
  function drawGrid(ctx, t) {
    const spacing = 50;
    ctx.strokeStyle = '#444'; ctx.lineWidth=1;
    ctx.beginPath();
    const offset = (t/100)%spacing;
    for(let x = -offset; x< W; x += spacing) { ctx.moveTo(x,0); ctx.lineTo(x,H); }
    for(let y = -offset; y< H; y += spacing) { ctx.moveTo(0,y); ctx.lineTo(W,y); }
    ctx.stroke();
  }
  function drawIntro(ctx, dt) {
    introTime += dt*1000;
    const alpha = Math.min(introTime/INTRO_DURATION,1);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#fff'; ctx.textAlign='center';
    ctx.font = '48px sans-serif'; ctx.fillText('Engine Simulator', W/2, H/2);
    if(introTime > TITLE_DELAY) {
      const a2 = Math.min((introTime-TITLE_DELAY)/(INTRO_DURATION/2),1);
      ctx.globalAlpha = a2;
      ctx.font = '24px sans-serif'; ctx.fillText('Version 0.2 Beta', W/2, H/2 + 40);
    }
    ctx.globalAlpha = 1;
    if(introTime > INTRO_DURATION + 1000) state = State.MENU;
  }
  function drawMenu(ctx) {
    ctx.fillStyle = '#fff'; ctx.textAlign='center';
    ctx.font = '56px sans-serif'; ctx.fillText('Engine Simulator 2', W/2, H/4);
    for(let key of ['play','credits','quit']) drawButton(ctx, buttons[key]);
    ctx.font='14px sans-serif'; ctx.textAlign='right'; ctx.fillText('Version 0.2', W-10, H-10);
    ctx.textAlign='left'; ctx.fillText('Gin Studios', 10, H-10);
  }
  function drawCredits(ctx) {
    ctx.fillStyle='#fff'; ctx.font='24px sans-serif'; ctx.textAlign='center';
    ctx.fillText('Credits', W/2, 80);
    ctx.font='18px sans-serif';
    ctx.fillText('Scripter: ChatGPT', W/2, 140);
    ctx.fillText('Idea: Loay', W/2, 180);
    ctx.fillText('Sound manager: Adam', W/2, 220);
    drawButton(ctx, buttons.creditsBack);
  }
  function drawLoading(ctx, dt) {
    loadingTime += dt*1000;
    if(Math.floor(loadingTime/500) > loadingDots) loadingDots = Math.floor(loadingTime/500);
    ctx.fillStyle='#fff'; ctx.textAlign='center';
    ctx.font='48px sans-serif'; ctx.fillText('Loading' + '.'.repeat(loadingDots % 4), W/2, H/2);
    if(loadingTime > LOADING_DURATION) state = State.GAME;
  }
  function drawGameUI(ctx) {
    ctx.fillStyle='#fff'; ctx.font='16px sans-serif'; ctx.textAlign='left';
    const rpm = Math.round(engine.omega*60/(2*Math.PI));
    const torque = (Math.PI * Math.pow(config.pistonDiameter/2,2) * config.rodLength * config.cylinders) * engine.throttle * 0.001;
    const hp = Math.round(torque * rpm / 5252);
    ctx.fillText(`RPM: ${rpm}`, 10, 20);
    ctx.fillText(`Torque: ${torque.toFixed(1)}`, 10, 40);
    ctx.fillText(`HP: ${hp}`, 10, 60);
  }
  function drawButton(ctx, b) {
    const hover = mouse.x > b.x && mouse.x < b.x+b.w && mouse.y > b.y && mouse.y < b.y+b.h;
    ctx.save();
    ctx.fillStyle = hover ? '#fff' : '#888';
    const dx = hover ? -10 : 0;
    ctx.fillRect(b.x+dx, b.y, b.w, b.h);
    ctx.fillStyle = hover ? '#000' : '#fff';
    ctx.font='20px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(b.text, b.x + b.w/2 + dx, b.y + b.h/2);
    ctx.restore();
  }
  function handleMenuClick() {
    if(!mouse.clicked) return;
    for(let key of ['play','credits','quit']) {
      const b = buttons[key];
      if(mouse.x>b.x && mouse.x<b.x+b.w && mouse.y>b.y && mouse.y<b.y+b.h) {
        if(key==='play') { state = State.LOADING; }
        else if(key==='credits') { state = State.CREDITS; }
        else if(key==='quit') { window.close(); }
      }
    }
  }
  function handleCreditsClick() {
    if(!mouse.clicked) return;
    const b = buttons.creditsBack;
    if(mouse.x>b.x && mouse.x<b.x+b.w && mouse.y>b.y && mouse.y<b.y+b.h) {
      state = State.MENU;
    }
  }
});
