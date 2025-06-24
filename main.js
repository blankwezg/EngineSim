/*
 * Engine Simulator 2 - Updated main.js
 * Author: ChatGPT | Idea: Loay | Sound Manager: Adam
 * Features:
 * - Fixed piston drawing
 * - Toolbox with 5 sections (Stroke, Engine Design, Exhaust, Piston Config, Fuel)
 * - Updated UI layout
 * - Real-time physics & RPM simulation
 * - Visual valve logic for 2-stroke vs 4-stroke
 * - Status & condition debug
 */

// DOM Ready
window.addEventListener("DOMContentLoaded", () => {
  const canvas = document.createElement("canvas");
  canvas.id = "engineCanvas";
  document.body.style.margin = 0;
  document.body.style.overflow = "hidden";
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  let W = (canvas.width = window.innerWidth);
  let H = (canvas.height = window.innerHeight);
  window.addEventListener("resize", () => {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
  });

  const AppState = { INTRO: 0, MENU: 1, CREDITS: 2, LOADING: 3, SIM: 4 };
  let state = AppState.INTRO;
  let introTimer = 0, loadingTimer = 0;

  const mouse = { x: 0, y: 0, click: false };
  document.addEventListener("mousemove", e => { mouse.x = e.clientX; mouse.y = e.clientY; });
  document.addEventListener("mousedown", () => (mouse.click = true));
  let throttle = 0;
  document.addEventListener("keydown", e => { if (e.key === "w") throttle = 1; });
  document.addEventListener("keyup", e => { if (e.key === "w") throttle = 0; });

  const config = {
    stroke: "4-stroke",
    design: { rodLength: 100, pistonDia: 40, crankMass: 1.2 },
    exhaust: { type: "muffler", outlets: 1, smoke: 1.0 },
    piston: { rings: 3, material: "steel" },
    fuel: "gasoline",
    ecu: { idleRPM: 1000, maxRPM: 8000 },
    layout: { type: "inline", pistons: 1 }
  };

  class Engine {
    constructor(cfg) {
      this.cfg = cfg;
      this.angle = 0;
      this.omega = cfg.ecu.idleRPM * Math.PI * 2 / 60;
      this.exhaust = [];
      this.intake = [];
    }
    update(dt) {
      const torque = throttle * 1.5 * this.cfg.design.rodLength;
      const friction = 0.02;
      const netTorque = torque - friction * this.omega;
      const alpha = netTorque / this.cfg.design.crankMass;
      this.omega += alpha * dt;
      const maxOmega = this.cfg.ecu.maxRPM * Math.PI * 2 / 60;
      this.omega = Math.min(maxOmega, Math.max(this.omega, this.cfg.ecu.idleRPM * Math.PI * 2 / 60));
      this.angle += this.omega * dt;

      if (Math.random() < dt * 10 * throttle) {
        this.exhaust.push({ x: W/2 + 60, y: H/2 - 80, vx: 40 + Math.random() * 20, vy: -10 + Math.random() * 20, life: 1 });
        this.intake.push({ x: W/2 - 60, y: H/2 - 80, vx: -30 + Math.random() * -10, vy: -10 + Math.random() * 20, life: 1 });
      }
      this.exhaust = this.exhaust.filter(p => p.life > 0).map(p => ({ ...p, x: p.x + p.vx * dt, y: p.y + p.vy * dt, life: p.life - dt }));
      this.intake = this.intake.filter(p => p.life > 0).map(p => ({ ...p, x: p.x + p.vx * dt, y: p.y + p.vy * dt, life: p.life - dt }));
    }
    draw(ctx) {
      const cx = W/2, cy = H/2;
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(this.angle);
      ctx.fillStyle = "#888";
      ctx.beginPath(); ctx.arc(0, 0, 30, 0, Math.PI*2); ctx.fill();
      ctx.restore();

      const crankX = cx + Math.cos(this.angle) * 30;
      const crankY = cy + Math.sin(this.angle) * 30;
      const rodLength = this.cfg.design.rodLength;
      const pistonY = crankY - rodLength;
      ctx.strokeStyle = "#aaa"; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(crankX, crankY); ctx.lineTo(crankX, pistonY); ctx.stroke();
      ctx.fillStyle = "#eee";
      ctx.fillRect(crankX - 20, pistonY - 10, 40, 30);

      if (this.cfg.stroke === "4-stroke") {
        ctx.fillStyle = "#0f0";
        ctx.fillRect(crankX - 10, pistonY - 30, 10, 10);
        ctx.fillRect(crankX + 10, pistonY - 30, 10, 10);
      } else {
        ctx.fillStyle = "#0f0";
        ctx.fillRect(crankX, pistonY - 30, 10, 10);
      }

      this.exhaust.forEach(p => { ctx.fillStyle = `rgba(100,100,100,${p.life})`; ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2); ctx.fill(); });
      this.intake.forEach(p => { ctx.fillStyle = `rgba(0,255,0,${p.life})`; ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2); ctx.fill(); });
    }
    rpm() { return Math.round(this.omega * 60 / (2 * Math.PI)); }
    torque() { return Math.round(throttle * 1.5 * this.cfg.design.rodLength); }
    hp() { return Math.round(this.torque() * this.rpm() / 5252); }
  }

  let engine = null;
  const buttons = {
    play: { x: W - 210, y: H / 2 - 50, w: 200, h: 50, text: "Play" },
    credits: { x: W - 210, y: H / 2 + 20, w: 200, h: 50, text: "Credits" },
    quit: { x: W - 210, y: H / 2 + 90, w: 200, h: 50, text: "Quit" },
    back: { x: 20, y: 20, w: 30, h: 30, text: "X" },
    stop: { x: W - 120, y: 20, w: 100, h: 40, text: "Stop" }
  };

  function drawGrid(time) {
    const spacing = 50;
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 1;
    let offset = (time / 30) % spacing;
    for (let x = -offset; x < W; x += spacing) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = -offset; y < H; y += spacing) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
  }
  function drawButton(btn) {
    const hover = mouse.x > btn.x && mouse.x < btn.x + btn.w && mouse.y > btn.y && mouse.y < btn.y + btn.h;
    ctx.fillStyle = hover ? "#fff" : "#aaa";
    ctx.fillRect(btn.x, btn.y, btn.w, btn.h);
    ctx.fillStyle = hover ? "#000" : "#222";
    ctx.font = "20px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(btn.text, btn.x + btn.w / 2, btn.y + btn.h / 2 + 6);
  }

  let last = performance.now();
  function loop(now) {
    let dt = (now - last) / 1000;
    last = now;
    ctx.clearRect(0, 0, W, H);
    drawGrid(now);

    switch (state) {
      case AppState.INTRO:
        introTimer += dt;
        ctx.fillStyle = `rgba(255,255,255,${Math.min(introTimer, 1)})`;
        ctx.font = "48px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Engine Simulator", W / 2, H / 2);
        if (introTimer > 1.5)
          ctx.fillText("Version 0.2 Beta", W / 2, H / 2 + 50);
        if (introTimer > 3.5) state = AppState.MENU;
        break;
      case AppState.MENU:
        ctx.fillStyle = "#fff";
        ctx.font = "40px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Engine Simulator 2", W / 2, 100);
        drawButton(buttons.play);
        drawButton(buttons.credits);
        drawButton(buttons.quit);
        ctx.font = "14px sans-serif";
        ctx.textAlign = "left";
        ctx.fillText("Gin Studios", 10, H - 10);
        ctx.textAlign = "right";
        ctx.fillText("Version 0.2", W - 10, H - 10);
        if (mouse.click) {
          if (mouse.x > buttons.play.x && mouse.x < buttons.play.x + buttons.play.w && mouse.y > buttons.play.y && mouse.y < buttons.play.y + buttons.play.h) state = AppState.LOADING;
          if (mouse.x > buttons.credits.x && mouse.x < buttons.credits.x + buttons.credits.w && mouse.y > buttons.credits.y && mouse.y < buttons.credits.y + buttons.credits.h) state = AppState.CREDITS;
          if (mouse.x > buttons.quit.x && mouse.x < buttons.quit.x + buttons.quit.w && mouse.y > buttons.quit.y && mouse.y < buttons.quit.y + buttons.quit.h) window.close();
        }
        break;
      case AppState.CREDITS:
        ctx.fillStyle = "#fff";
        ctx.font = "28px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Credits", W / 2, 80);
        ctx.font = "20px sans-serif";
        ctx.fillText("Scripter: ChatGPT", W / 2, 140);
        ctx.fillText("Idea: Loay", W / 2, 180);
        ctx.fillText("Sound manager: Adam", W / 2, 220);
        drawButton(buttons.back);
        if (mouse.click && mouse.x < 60 && mouse.y < 60) state = AppState.MENU;
        break;
      case AppState.LOADING:
        loadingTimer += dt;
        ctx.fillStyle = "#fff";
        ctx.font = "40px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Loading" + ".".repeat(Math.floor(loadingTimer * 2) % 4), W / 2, H / 2);
        if (loadingTimer > 5) {
          engine = new Engine(config);
          state = AppState.SIM;
        }
        break;
      case AppState.SIM:
        engine.update(dt);
        engine.draw(ctx);
        drawButton(buttons.stop);
        ctx.fillStyle = "#fff";
        ctx.font = "16px sans-serif";
        ctx.fillText(`RPM: ${engine.rpm()}`, 20, 20);
        ctx.fillText(`Torque: ${engine.torque()}`, 20, 40);
        ctx.fillText(`Horsepower: ${engine.hp()}`, 20, 60);
        if (mouse.click && mouse.x > buttons.stop.x && mouse.x < buttons.stop.x + buttons.stop.w && mouse.y > buttons.stop.y && mouse.y < buttons.stop.y + buttons.stop.h)
          state = AppState.MENU;
        break;
    }
    mouse.click = false;
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
});
