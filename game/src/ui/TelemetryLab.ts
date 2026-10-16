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
          background-color: #000000;
          background-image: 
            linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px),
            repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255, 255, 255, 0.015) 2px, rgba(255, 255, 255, 0.015) 4px);
          background-size: 32px 32px, 32px 32px, 100% 4px;
          display: none;
          flex-direction: column;
          z-index: 200;
          padding: 1.5rem;
          color: #ffffff;
          font-family: var(--font-mono);
          overflow-y: auto;
          box-sizing: border-box;
        }

        .lab-panel {
          position: relative;
          background: #080808;
          border: 1px solid #ffffff;
          box-shadow: 0 0 0 1px #000000, 0 30px 60px rgba(0, 0, 0, 0.95);
          max-width: 960px;
          width: 100%;
          margin: 0 auto;
          padding: 1.75rem 2rem;
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
          box-sizing: border-box;
        }

        /* Corner crosshairs */
        .lab-corner {
          position: absolute;
          width: 9px;
          height: 9px;
          color: #EA3323;
          font-family: var(--font-mono);
          font-size: 11px;
          line-height: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          pointer-events: none;
        }
        .lab-tl { top: -6px; left: -6px; }
        .lab-tr { top: -6px; right: -6px; }
        .lab-bl { bottom: -6px; left: -6px; }
        .lab-br { bottom: -6px; right: -6px; }

        .lab-meta-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid #222222;
          padding-bottom: 0.6rem;
          font-size: 0.72rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #888888;
        }
        .lab-meta-bar span.accent {
          color: #EA3323;
          font-weight: 700;
        }

        .lab-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.5rem;
        }
        .lab-header h2 {
          color: #ffffff;
          font-size: 1.6rem;
          font-weight: 700;
          letter-spacing: -0.04em;
          text-transform: uppercase;
          margin: 0;
        }
        .lab-close-btn {
          background: transparent;
          border: 1px solid #ffffff;
          color: #ffffff;
          padding: 0.5rem 1.2rem;
          font-family: var(--font-mono);
          font-size: 0.8rem;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          cursor: pointer;
          transition: all 0.15s;
        }
        .lab-close-btn:hover {
          background: #ffffff;
          color: #000000;
        }

        .lab-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 1.25rem;
        }
        @media (max-width: 840px) {
          .lab-grid { grid-template-columns: 1fr; }
        }

        .lab-card {
          background: #000000;
          border: 1px solid #222222;
          padding: 1rem;
          display: flex;
          flex-direction: column;
          box-sizing: border-box;
          position: relative;
        }
        .lab-card-title {
          font-size: 0.75rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #888888;
          margin-bottom: 0.8rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid #111111;
          padding-bottom: 0.4rem;
        }

        .hex-dump-box {
          font-family: var(--font-mono);
          font-size: 0.88rem;
          background: #000000;
          border: 1px solid #222222;
          padding: 0.8rem;
          color: #ffffff;
          letter-spacing: 0.08em;
          word-break: break-all;
        }

        .metrics-row {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 0.75rem;
          margin-top: 1rem;
        }
        @media (max-width: 600px) {
          .metrics-row { grid-template-columns: repeat(2, 1fr); }
        }
        .metric-pill {
          background: #000000;
          border: 1px solid #222222;
          padding: 0.65rem;
          text-align: left;
        }
        .metric-value {
          font-family: var(--font-mono);
          font-size: 1.25rem;
          font-weight: 700;
          color: #ffffff;
          letter-spacing: -0.02em;
        }
        .metric-label {
          font-size: 0.68rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #888888;
          margin-top: 2px;
        }

        .bitmask-badges {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
          margin-top: 0.8rem;
        }
        .bit-badge {
          font-family: var(--font-mono);
          font-size: 0.72rem;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          padding: 0.35rem 0.6rem;
          border: 1px solid #333333;
          background: #111111;
          color: #666666;
        }
        .bit-badge.active {
          background: #EA3323;
          border-color: #EA3323;
          color: #ffffff;
        }
      </style>

      <div class="lab-panel">
        <div class="lab-corner lab-tl">+</div>
        <div class="lab-corner lab-tr">+</div>
        <div class="lab-corner lab-bl">+</div>
        <div class="lab-corner lab-br">+</div>

        <div class="lab-meta-bar">
          <div>[ SYS // FLIGHT_RECORDER ] <span class="accent">20-BYTE ZERO-COPY STREAM</span></div>
          <div>NOTHING PHONE (3) • 100HZ REAL-TIME TELEMETRY</div>
        </div>

        <div class="lab-header">
          <h2>TELEMETRY LAB</h2>
          <button id="lab-close" class="lab-close-btn">[ ESC // CLOSE ]</button>
        </div>

        <div class="lab-grid">
          <!-- Card 1: 3D Wireframe Smartphone Gimbal -->
          <div class="lab-card">
            <div class="lab-card-title">
              <span>[ 01 // 3D ORIENTATION GIMBAL ]</span>
              <span style="color: #ffffff;">100 HZ IMU</span>
            </div>
            <div style="width: 100%; height: 230px; background: #000000; border: 1px solid #222222; overflow: hidden; display: flex; justify-content: center; align-items: center;">
              <canvas id="phone-canvas" width="360" height="230"></canvas>
            </div>
          </div>

          <!-- Card 2: Dual-Trace Oscilloscope -->
          <div class="lab-card">
            <div class="lab-card-title">
              <span>[ 02 // SENSOR OSCILLOSCOPE ]</span>
              <span style="font-size: 0.72rem;">
                <span style="color: #EA3323;">■ RAW</span>
                &nbsp;|&nbsp;
                <span style="color: #ffffff;">■ 1-EURO FILTER</span>
              </span>
            </div>
            <div style="width: 100%; height: 230px; background: #000000; border: 1px solid #222222; overflow: hidden;">
              <canvas id="osc-canvas" width="460" height="230" style="width: 100%; height: 100%;"></canvas>
            </div>
          </div>

          <!-- Card 3: 20-Byte Hex Packet Inspector -->
          <div class="lab-card" style="grid-column: span 2;">
            <div class="lab-card-title">
              <span>[ 03 // 20-BYTE ZERO-COPY BINARY PACKET DUMP ]</span>
              <span style="color: #EA3323;">HOT PATH ARRAYBUFFER</span>
            </div>
            <div id="hex-display" class="hex-dump-box">
              01 01 00 00 | 00 00 00 00 | 00 00 00 00 | 00 00 00 00 | 00 00 00 00
            </div>
            <div class="bitmask-badges" id="bitmask-display">
              <span class="bit-badge" id="bit-boost">[ NITRO BOOST ]</span>
              <span class="bit-badge" id="bit-brake">[ BRAKE ]</span>
              <span class="bit-badge" id="bit-shake">[ SHAKE TO JUMP ]</span>
              <span class="bit-badge" id="bit-recal">[ RECALIBRATED ]</span>
            </div>
            <div id="fields-display" style="font-family: var(--font-mono); font-size: 0.78rem; color: #888888; margin-top: 0.8rem; letter-spacing: 0.04em;">
              PITCH: 0.0000 | ROLL: 0.0000 | YAW RATE: 0.0000 | SEQ: 0 | CLIENT TIME: 0
            </div>

            <!-- Card 4: NTP Sync Metrics -->
            <div class="metrics-row">
              <div class="metric-pill">
                <div id="metric-rtt" class="metric-value">-- ms</div>
                <div class="metric-label">[ RTT // ROUND TRIP ]</div>
              </div>
              <div class="metric-pill">
                <div id="metric-skew" class="metric-value">-- ms</div>
                <div class="metric-label">[ CLOCK SKEW ]</div>
              </div>
              <div class="metric-pill">
                <div id="metric-hz" class="metric-value">100 Hz</div>
                <div class="metric-label">[ PACKET RATE ]</div>
              </div>
              <div class="metric-pill">
                <div id="metric-jitter" class="metric-value">-- ms</div>
                <div class="metric-label">[ ARRIVAL JITTER ]</div>
              </div>
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
    this.phoneCamera = new THREE.PerspectiveCamera(45, 360 / 230, 0.1, 100);
    this.phoneCamera.position.set(0, 0, 7);

    this.phoneRenderer = new THREE.WebGLRenderer({
      canvas: this.phoneCanvas,
      alpha: true,
      antialias: true,
    });
    this.phoneRenderer.setSize(360, 230);

    const ambient = new THREE.AmbientLight(0xffffff, 1.0);
    this.phoneScene.add(ambient);

    // Build 3D Smartphone Model (Monochrome Brutalist Nothing Phone wireframe)
    this.phoneMesh = new THREE.Group();

    // Body
    const bodyGeo = new THREE.BoxGeometry(2.4, 4.4, 0.25);
    const bodyMat = new THREE.MeshBasicMaterial({
      color: 0x050505,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    this.phoneMesh.add(body);

    // Wireframe edges
    const wireGeo = new THREE.EdgesGeometry(bodyGeo);
    const wireMat = new THREE.LineBasicMaterial({ color: 0xffffff });
    const wire = new THREE.LineSegments(wireGeo, wireMat);
    this.phoneMesh.add(wire);

    // Screen glyph outline
    const screenGeo = new THREE.PlaneGeometry(2.0, 3.8);
    const screenWireGeo = new THREE.EdgesGeometry(screenGeo);
    const screenWireMat = new THREE.LineBasicMaterial({ color: 0x444444 });
    const screenWire = new THREE.LineSegments(screenWireGeo, screenWireMat);
    screenWire.position.z = 0.13;
    this.phoneMesh.add(screenWire);

    // Red orientation ray
    const rayGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, 2.5),
    ]);
    const rayMat = new THREE.LineBasicMaterial({ color: 0xEA3323 });
    const ray = new THREE.Line(rayGeo, rayMat);
    this.phoneMesh.add(ray);

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
      this.fieldsDisplayEl.textContent = `PITCH: ${frame.calibratedPitch.toFixed(4)} | ROLL: ${frame.calibratedRoll.toFixed(4)} | YAW: ${frame.yaw.toFixed(4)} | SEQ: ${frame.sequenceNumber} | TIME: ${frame.clientTimestamp}`;

      // 4. Update 3D Phone Mesh Rotation
      if (this.isVisible) {
        // Pitch: X-axis, Roll: Z-axis, Yaw: Y-axis
        this.phoneMesh.rotation.x = frame.calibratedPitch * 0.5;
        this.phoneMesh.rotation.z = -frame.calibratedRoll * 0.5;
        this.phoneMesh.rotation.y = frame.yaw * 0.2;
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

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, h);

    // Draw Grid
    ctx.strokeStyle = '#181818';
    ctx.lineWidth = 1;

    // Horizontal center line
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();

    // Vertical subdivisions
    const gridCols = 8;
    for (let c = 1; c < gridCols; c++) {
      ctx.beginPath();
      ctx.moveTo((w / gridCols) * c, 0);
      ctx.lineTo((w / gridCols) * c, h);
      ctx.stroke();
    }

    const stepX = w / (this.maxHistoryLen - 1);

    // Trace 1: Raw Sensor (Nothing Red #EA3323)
    ctx.strokeStyle = '#EA3323';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < this.rawHistory.length; i++) {
      const x = i * stepX;
      const y = h / 2 - this.rawHistory[i] * (h / 2.2);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Trace 2: Filtered Output (Crisp White #ffffff)
    ctx.strokeStyle = '#ffffff';
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
