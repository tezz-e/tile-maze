/**
 * ClickSpark Micro-Interaction (React Bits inspired)
 * Spawns crisp, mechanical spark particles from the cursor click point.
 */
export class ClickSpark {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private sparks: Array<{
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;
    life: number;
    maxLife: number;
    color: string;
  }> = [];
  private animFrame: number | null = null;
  private lastTime = performance.now();

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'click-spark-canvas';
    this.canvas.style.position = 'fixed';
    this.canvas.style.inset = '0';
    this.canvas.style.width = '100vw';
    this.canvas.style.height = '100vh';
    this.canvas.style.pointerEvents = 'none';
    this.canvas.style.zIndex = '9999';
    document.body.appendChild(this.canvas);

    this.ctx = this.canvas.getContext('2d', { alpha: true })!;
    this.resize();
    window.addEventListener('resize', () => this.resize());

    window.addEventListener('pointerdown', (e) => {
      this.trigger(e.clientX, e.clientY);
    });
  }

  private resize(): void {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = window.innerWidth * dpr;
    this.canvas.height = window.innerHeight * dpr;
    this.ctx.scale(dpr, dpr);
  }

  public trigger(x: number, y: number, count = 10): void {
    const colors = ['#ffffff', '#ffffff', '#EA3323', '#EA3323', '#a3a3a3'];
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
      const speed = 70 + Math.random() * 110;
      this.sparks.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 1.5 + Math.random() * 2,
        life: 0,
        maxLife: 320 + Math.random() * 140, // ms
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }

    if (!this.animFrame) {
      this.lastTime = performance.now();
      this.loop(this.lastTime);
    }
  }

  private loop = (now: number): void => {
    const dt = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;

    this.ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.life += dt * 1000;
      if (s.life >= s.maxLife) {
        this.sparks.splice(i, 1);
        continue;
      }

      const progress = s.life / s.maxLife;
      const alpha = 1.0 - progress;

      // Update position with drag
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vx *= 0.94;
      s.vy *= 0.94;

      this.ctx.save();
      this.ctx.globalAlpha = alpha;
      this.ctx.fillStyle = s.color;
      this.ctx.shadowColor = s.color;
      this.ctx.shadowBlur = 4;
      this.ctx.fillRect(s.x - s.size / 2, s.y - s.size / 2, s.size, s.size);
      this.ctx.restore();
    }

    if (this.sparks.length > 0) {
      this.animFrame = requestAnimationFrame(this.loop);
    } else {
      this.animFrame = null;
    }
  };
}
