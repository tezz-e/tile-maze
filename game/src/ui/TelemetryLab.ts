import * as THREE from 'three';
import {
  PACKET_SIZE,
  decodeTelemetry,
  formatHexDump,
  BUTTON_BOOST,
  BUTTON_BRAKE,
  BUTTON_SHAKE,
  BUTTON_RECALIBRATE,
  hasButton,
} from '@tiltmaze/protocol';

export class TelemetryLab {
  private container: HTMLElement;
  private isVisible = false;

  // 3D Phone Wireframe elements
  private phoneCanvas!: HTMLCanvasElement;
  private phoneRenderer!: THREE.WebGLRenderer;
  private phoneScene!: THREE.Scene;
  private phoneCamera!: THREE.PerspectiveCamera;
  private phoneMesh!: THREE.Group;

  // Oscilloscope elements
  private oscCanvas!: HTMLCanvasElement;
  private oscCtx!: CanvasRenderingContext2D;
  private rawHistory: number[] = [];
  private filteredHistory: number[] = [];
  private maxHistoryLen = 150;

  // Hex Inspector elements
  private hexDisplayEl!: HTMLElement;
  private bitmaskDisplayEl!: HTMLElement;
  private fieldsDisplayEl!: HTMLElement;

  // NTP elements
  private rttEl!: HTMLElement;
  private skewEl!: HTMLElement;
  private hzEl!: HTMLElement;
  private jitterEl!: HTMLElement;

  constructor(parent: HTMLElement) {
    this.container = document.createElement('div');
    this.container.id = 'telemetry-lab-modal';
    this.container.className = 'interactive';
    this.buildDOM();
    parent.appendChild(this.container);

    this.initPhone3D();
    this.initOscilloscope();
  }

  private buildDOM(): void {
    this.container.innerHTML = `
      <style>
        #telemetry-lab-modal {
          position: absolute;
          inset: 0;
          background: rgba(11, 15, 25, 0.96);
          backdrop-filter: blur(12px);
          display: none;
          flex-direction: column;
          z-index: 200;
          padding: 1.5rem;
          color: #f3f4f6;
          font-family: system-ui, sans-serif;
          overflow-y: auto;
        }
        .lab-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid #334155;
          padding-bottom: 1rem;
          margin-bottom: 1.5rem;
        }
        .lab-header h2 {
          color: #38bdf8;
          font-size: 1.5rem;
          margin: 0;
          display: flex;
          align-items: center;
          gap: 0.6rem;
        }
        .lab-close-btn {
          background: #1e293b;
          border: 1px solid #475569;
          color: #f8fafc;
          padding: 0.4rem 1rem;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 700;
        }
        .lab-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 1.5rem;
        }
        @media (max-width: 840px) {
          .lab-grid { grid-template-columns: 1fr; }
        }
        .lab-card {
          background: #161e2e;
          border: 1px solid #334155;
          border-radius: 12px;
          padding: 1.2rem;
          display: flex;
          flex-direction: column;
        }
        .lab-card-title {
          font-size: 0.95rem;
          font-weight: 700;
          color: #94a3b8;
          margin-bottom: 0.8rem;
          display: flex;
          justify-content: space-between;
        }
        .hex-dump-box {
          font-family: monospace;
          font-size: 0.95rem;
          background: #0f172a;
          border: 1px solid #1e293b;
          border-radius: 6px;
          padding: 0.8rem;
          color: #38bdf8;
          letter-spacing: 0.08em;
          word-break: break-all;
        }
        .metrics-row {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 0.8rem;
          margin-top: 0.8rem;
        }
        .metric-pill {
          background: #0f172a;
          border: 1px solid #1e293b;
          padding: 0.6rem;
          border-radius: 6px;
          text-align: center;
        }
        .metric-value {
          font-family: monospace;
          font-size: 1.2rem;
          font-weight: 800;
          color: #34d399;
        }
        .metric-label {
          font-size: 0.75rem;
          color: #94a3b8;
        }
        .bitmask-badges {
          display: flex;
          gap: 0.4rem;
          flex-wrap: wrap;
          margin-top: 0.5rem;
        }
        .bit-badge {
          font-size: 0.75rem;
          padding: 0.2rem 0.5rem;
          border-radius: 4px;
          background: #334155;
          color: #94a3b8;
          font-weight: 700;
        }
        .bit-badge.active {
          background: #0284c7;
          color: #ffffff;
        }
      </style>

      <div class="lab-header">
        <h2>FLIGHT RECORDER & TELEMETRY LAB</h2>
        <button id="lab-close" class="lab-close-btn">Close [T]</button>
      </div>

      <div class="lab-grid">
        <!-- Card 1: 3D Wireframe Smartphone Gimbal -->
        <div class="lab-card">
          <div class="lab-card-title">
            <span>3D CONTROLLER ORIENTATION TRACKER</span>
            <span style="color: #38bdf8;">60 Hz Real-Time</span>
          </div>
          <div style="width: 100%; height: 240px; background: #0f172a; border-radius: 8px; overflow: hidden; display: flex; justify-content: center; align-items: center;">
            <canvas id="phone-canvas" width="360" height="240"></canvas>
          </div>
        </div>

        <!-- Card 2: Dual-Trace Oscilloscope -->
        <div class="lab-card">
          <div class="lab-card-title">
            <span>DUAL-TRACE SENSOR OSCILLOSCOPE</span>
            <span style="font-size: 0.8rem;">
              <span style="color: #ef4444;">● Raw Sensor</span>
              &nbsp;|&nbsp;
              <span style="color: #10b981;">● One-Euro Filtered</span>
            </span>
          </div>
          <div style="width: 100%; height: 240px; background: #0f172a; border-radius: 8px; overflow: hidden;">
            <canvas id="osc-canvas" width="460" height="240" style="width: 100%; height: 100%;"></canvas>
          </div>
        </div>

        <!-- Card 3: 20-Byte Hex Packet Inspector -->
        <div class="lab-card" style="grid-column: span 2;">
          <div class="lab-card-title">
            <span>20-BYTE ZERO-COPY BINARY INSPECTOR</span>
            <span style="color: #a855f7;">Hot Path ArrayBuffer</span>
          </div>
          <div id="hex-display" class="hex-dump-box">
            01 01 00 00 | 00 00 00 00 | 00 00 00 00 | 00 00 00 00 | 00 00 00 00
          </div>
          <div class="bitmask-badges" id="bitmask-display">
            <span class="bit-badge" id="bit-boost">NITRO BOOST</span>
            <span class="bit-badge" id="bit-brake">BRAKE</span>
            <span class="bit-badge" id="bit-shake">SHAKE TO JUMP</span>
            <span class="bit-badge" id="bit-recal">RECALIBRATED</span>
          </div>
          <div id="fields-display" style="font-family: monospace; font-size: 0.85rem; color: #94a3b8; margin-top: 0.8rem;">
            Pitch: 0.0000 | Roll: 0.0000 | Yaw Rate: 0.0000 | Seq: 0 | Client Time: 0
          </div>

          <!-- Card 4: NTP Sync Metrics -->
          <div class="metrics-row">
            <div class="metric-pill">
              <div id="metric-rtt" class="metric-value">-- ms</div>
              <div class="metric-label">ROUND TRIP (RTT)</div>
            </div>
            <div class="metric-pill">
              <div id="metric-skew" class="metric-value">-- ms</div>
              <div class="metric-label">CLOCK SKEW (θ)</div>
            </div>
            <div class="metric-pill">
              <div id="metric-hz" class="metric-value">60 Hz</div>
              <div class="metric-label">PACKET RATE</div>
            </div>
            <div class="metric-pill">
              <div id="metric-jitter" class="metric-value">-- ms</div>
              <div class="metric-label">ARRIVAL JITTER</div>
            </div>
          </div>
        </div>
      </div>
    `;

    this.phoneCanvas = this.container.querySelector('#phone-canvas')!;
    this.oscCanvas = this.container.querySelector('#osc-canvas')!;
    this.oscCtx = this.oscCanvas.getContext('2d')!;
    this.hexDisplayEl = this.container.querySelector('#hex-display')!;
    this.bitmaskDisplayEl = this.container.querySelector('#bitmask-display')!;
    this.fieldsDisplayEl = this.container.querySelector('#fields-display')!;

    this.rttEl = this.container.querySelector('#metric-rtt')!;
    this.skewEl = this.container.querySelector('#metric-skew')!;
    this.hzEl = this.container.querySelector('#metric-hz')!;
    this.jitterEl = this.container.querySelector('#metric-jitter')!;

    this.container.querySelector('#lab-close')!.addEventListener('click', () => {
      this.toggle();
    });
  }

  private initPhone3D(): void {
    this.phoneScene = new THREE.Scene();
    this.phoneCamera = new THREE.PerspectiveCamera(45, 360 / 240, 0.1, 100);
    this.phoneCamera.position.set(0, 0, 7);

    this.phoneRenderer = new THREE.WebGLRenderer({
      canvas: this.phoneCanvas,
      alpha: true,
      antialias: true,
    });
    this.phoneRenderer.setSize(360, 240);

    const ambient = new THREE.AmbientLight(0xffffff, 0.8);
    this.phoneScene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0x38bdf8, 1.2);
    dirLight.position.set(2, 4, 3);
    this.phoneScene.add(dirLight);

    // Build 3D Smartphone Model (Nothing Phone shape)
    this.phoneMesh = new THREE.Group();

    // Body
    const bodyGeo = new THREE.BoxGeometry(2.4, 4.4, 0.25);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.8,
      roughness: 0.2,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    this.phoneMesh.add(body);

    // Screen
    const screenGeo = new THREE.PlaneGeometry(2.2, 4.2);
    const screenMat = new THREE.MeshBasicMaterial({
      color: 0x0284c7,
      wireframe: true,
    });
    const screen = new THREE.Mesh(screenGeo, screenMat);
    screen.position.z = 0.13;
    this.phoneMesh.add(screen);

    // Wireframe edges
    const wireGeo = new THREE.EdgesGeometry(bodyGeo);
    const wireMat = new THREE.LineBasicMaterial({ color: 0x38bdf8 });
    const wire = new THREE.LineSegments(wireGeo, wireMat);
    this.phoneMesh.add(wire);

    this.phoneScene.add(this.phoneMesh);
  }

  private initOscilloscope(): void {
    for (let i = 0; i < this.maxHistoryLen; i++) {
      this.rawHistory.push(0);
      this.filteredHistory.push(0);
    }
  }

  public updatePacket(rawBuffer: ArrayBuffer, filteredPitch: number): void {
    if (rawBuffer.byteLength < PACKET_SIZE) return;

    try {
      const frame = decodeTelemetry(rawBuffer);

      // 1. Update Hex Display
      this.hexDisplayEl.textContent = formatHexDump(rawBuffer);

      // 2. Update Bitmask Badges
      const boostEl = this.container.querySelector('#bit-boost')!;
      const brakeEl = this.container.querySelector('#bit-brake')!;
      const shakeEl = this.container.querySelector('#bit-shake')!;
      const recalEl = this.container.querySelector('#bit-recal')!;

      boostEl.classList.toggle('active', hasButton(frame.buttonBitmask, BUTTON_BOOST));
      brakeEl.classList.toggle('active', hasButton(frame.buttonBitmask, BUTTON_BRAKE));
      shakeEl.classList.toggle('active', hasButton(frame.buttonBitmask, BUTTON_SHAKE));
      recalEl.classList.toggle('active', hasButton(frame.buttonBitmask, BUTTON_RECALIBRATE));

      // 3. Update Fields summary
      this.fieldsDisplayEl.textContent = `Pitch: ${frame.calibratedPitch.toFixed(4)} | Roll: ${frame.calibratedRoll.toFixed(4)} | Yaw Rate: ${frame.rawYawRate.toFixed(4)} | Seq: ${frame.sequenceNumber} | Time: ${frame.clientTimestamp}`;

      // 4. Update 3D Phone Mesh Rotation
      if (this.isVisible) {
        // Pitch: X-axis, Roll: Z-axis, Yaw: Y-axis
        this.phoneMesh.rotation.x = frame.calibratedPitch * 0.5;
        this.phoneMesh.rotation.z = -frame.calibratedRoll * 0.5;
        this.phoneMesh.rotation.y = frame.rawYawRate * 0.2;
        this.phoneRenderer.render(this.phoneScene, this.phoneCamera);

        // 5. Update Oscilloscope Trace
        this.rawHistory.push(frame.calibratedPitch);
        if (this.rawHistory.length > this.maxHistoryLen) this.rawHistory.shift();

        this.filteredHistory.push(filteredPitch);
        if (this.filteredHistory.length > this.maxHistoryLen) this.filteredHistory.shift();

        this.drawOscilloscope();
      }
    } catch {
      // Ignore packet parse error
    }
  }

  private drawOscilloscope(): void {
    const ctx = this.oscCtx;
    const w = this.oscCanvas.width;
    const h = this.oscCanvas.height;

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, w, h);

    // Draw Grid
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();

    const stepX = w / (this.maxHistoryLen - 1);

    // Trace 1: Raw Sensor (Red)
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < this.rawHistory.length; i++) {
      const x = i * stepX;
      // Map [-1.0, 1.0] to [h, 0]
      const y = h / 2 - this.rawHistory[i] * (h / 2.2);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Trace 2: Filtered Output (Neon Green)
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    for (let i = 0; i < this.filteredHistory.length; i++) {
      const x = i * stepX;
      const y = h / 2 - this.filteredHistory[i] * (h / 2.2);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  public updateMetrics(rttMs: number, skewMs: number, hz: number, jitterMs: number): void {
    this.rttEl.textContent = `${rttMs} ms`;
    this.skewEl.textContent = `${skewMs} ms`;
    this.hzEl.textContent = `${hz} Hz`;
    this.jitterEl.textContent = `${jitterMs} ms`;
  }

  public toggle(): void {
    this.isVisible = !this.isVisible;
    this.container.style.display = this.isVisible ? 'flex' : 'none';
  }

  public isOpen(): boolean {
    return this.isVisible;
  }
}
