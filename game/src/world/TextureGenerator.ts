import * as THREE from 'three';

/**
 * Procedural Texture Generator
 * Generates lightweight, crisp canvas textures matching the Skyway visual style.
 */
export class TextureGenerator {
  private static createCanvas(width: number, height: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
    if (typeof document === 'undefined' || !document.createElement) {
      return null;
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    return { canvas, ctx };
  }

  /**
   * Generates a 1024x512 equirectangular sky canvas texture with theme parameters.
   */
  public static createSkyEquirectangular(
    topColor: string = '#1e3a8a',
    bottomColor: string = '#60a5fa',
    isNight: boolean = false
  ): THREE.Texture {
    const c = this.createCanvas(1024, 512);
    if (!c) {
      const tex = new THREE.DataTexture(new Uint8Array([56, 189, 248, 255]), 1, 1);
      tex.needsUpdate = true;
      return tex;
    }
    const { canvas, ctx } = c;

    const cTop = new THREE.Color(topColor);
    const cBottom = new THREE.Color(bottomColor);

    // 1. Sky Gradient from zenith (y=0) down through horizon (y=256) to nadir (y=512)
    // Smooth continuous gradient stops with low contrast near the horizon to eliminate banding in reflections
    const skyGrad = ctx.createLinearGradient(0, 0, 0, 512);
    if (isNight) {
      skyGrad.addColorStop(0.0, cTop.getStyle());
      skyGrad.addColorStop(0.38, cTop.getStyle());
      skyGrad.addColorStop(0.46, cTop.clone().lerp(cBottom, 0.45).getStyle());
      skyGrad.addColorStop(0.50, cBottom.getStyle());
      skyGrad.addColorStop(0.54, cBottom.clone().lerp(cTop, 0.20).getStyle());
      skyGrad.addColorStop(0.72, cBottom.getStyle());
      skyGrad.addColorStop(1.0, cBottom.getStyle());
    } else {
      // Zenith blue extends down to 0.38 so the camera's upper elevation (+22 deg) captures vivid sky color
      skyGrad.addColorStop(0.0, cTop.getStyle());
      skyGrad.addColorStop(0.38, cTop.getStyle());
      // Smooth, soft transition into horizon haze (stop 0.50 = horizon y=256)
      skyGrad.addColorStop(0.46, cTop.clone().lerp(cBottom, 0.40).getStyle());
      skyGrad.addColorStop(0.50, cBottom.getStyle());
      skyGrad.addColorStop(0.54, cBottom.clone().lerp(cTop, 0.15).getStyle());
      skyGrad.addColorStop(0.72, cBottom.getStyle());
      skyGrad.addColorStop(1.0, cBottom.getStyle());
    }
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, 1024, 512);

    // 2. Warm Sun Corona (gentle smooth radial falloff, no harsh rings)
    const sunX = 620;
    const sunY = 215;
    const sunGrad = ctx.createRadialGradient(sunX, sunY, 10, sunX, sunY, 200);
    if (isNight) {
      sunGrad.addColorStop(0.0, 'rgba(255, 255, 255, 0.95)');
      sunGrad.addColorStop(0.20, 'rgba(224, 242, 254, 0.6)');
      sunGrad.addColorStop(0.55, 'rgba(186, 230, 253, 0.2)');
      sunGrad.addColorStop(1.0, 'rgba(56, 189, 248, 0.0)');
    } else {
      sunGrad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
      sunGrad.addColorStop(0.18, 'rgba(255, 250, 235, 0.85)');
      sunGrad.addColorStop(0.45, 'rgba(254, 243, 199, 0.35)');
      sunGrad.addColorStop(0.75, 'rgba(254, 243, 199, 0.1)');
      sunGrad.addColorStop(1.0, 'rgba(254, 243, 199, 0.0)');
    }
    ctx.fillStyle = sunGrad;
    ctx.beginPath();
    ctx.arc(sunX, sunY, 200, 0, Math.PI * 2);
    ctx.fill();

    // 3. Clouds or Stars with soft edges
    if (isNight) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      for (let i = 0; i < 45; i++) {
        const sx = (i * 137 + 53) % 1024;
        const sy = (i * 89 + 17) % 230;
        const sSize = i % 3 === 0 ? 2 : 1;
        ctx.fillRect(sx, sy, sSize, sSize);
      }
    } else {
      // Soft wispy horizon cirrus with low opacity
      ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
      for (let i = 0; i < 16; i++) {
        const cx = (i * 70 + 40) % 1024;
        const cy = 245 + Math.sin(i * 1.3) * 12;
        const r = 50 + Math.cos(i * 0.9) * 15;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.mapping = THREE.EquirectangularReflectionMapping;
    texture.needsUpdate = true;
    return texture;
  }

  /**
   * Generates a seamless 512x512 blue tiled texture with subtle ceramic tile gloss
   * and clean white grout seams, matching the reference skyway tiles.
   */
  public static createBlueTiles(): THREE.Texture {
    const c = this.createCanvas(512, 512);
    if (!c) {
      const tex = new THREE.DataTexture(new Uint8Array([59, 130, 246, 255]), 1, 1);
      tex.needsUpdate = true;
      return tex;
    }
    const { canvas, ctx } = c;

    const tilesPerSide = 2;
    const tileSize = 512 / tilesPerSide;
    const seamWidth = 6;

    for (let r = 0; r < tilesPerSide; r++) {
      for (let col = 0; col < tilesPerSide; col++) {
        const x = col * tileSize;
        const y = r * tileSize;

        // Base tile gradient for rich, deep ceramic azure gloss
        const grad = ctx.createLinearGradient(x, y, x + tileSize, y + tileSize);
        grad.addColorStop(0.0, '#38bdf8'); // Vivid cyan-blue gloss top-left
        grad.addColorStop(0.2, '#0ea5e9'); // Bright ocean blue
        grad.addColorStop(0.55, '#0284c7'); // Deep royal blue body
        grad.addColorStop(0.85, '#0369a1'); // Deep ceramic blue
        grad.addColorStop(1.0, '#075985'); // Navy ceramic edge

        ctx.fillStyle = grad;
        ctx.fillRect(x + seamWidth, y + seamWidth, tileSize - seamWidth * 2, tileSize - seamWidth * 2);

        // Top-left crisp specular bevel highlight
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x + seamWidth + 1.5, y + tileSize - seamWidth - 1);
        ctx.lineTo(x + seamWidth + 1.5, y + seamWidth + 1.5);
        ctx.lineTo(x + tileSize - seamWidth - 1, y + seamWidth + 1.5);
        ctx.stroke();

        // Bottom-right subtle bevel shadow
        ctx.strokeStyle = 'rgba(2, 44, 90, 0.55)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x + tileSize - seamWidth - 1.5, y + seamWidth + 2);
        ctx.lineTo(x + tileSize - seamWidth - 1.5, y + tileSize - seamWidth - 1.5);
        ctx.lineTo(x + seamWidth + 2, y + tileSize - seamWidth - 1.5);
        ctx.stroke();
      }
    }

    // Grout / Seam lines: crisp bright white
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = seamWidth;
    for (let i = 0; i <= tilesPerSide; i++) {
      const p = i * tileSize;
      // Vertical seam
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, 512);
      ctx.stroke();

      // Horizontal seam
      ctx.beginPath();
      ctx.moveTo(0, p);
      ctx.lineTo(512, p);
      ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.needsUpdate = true;
    return texture;
  }

  /**
   * Generates a 256x256 yellow ramp texture with bold white forward chevrons (>>).
   */
  public static createChevrons(): THREE.Texture {
    const c = this.createCanvas(256, 256);
    if (!c) {
      const tex = new THREE.DataTexture(new Uint8Array([245, 158, 11, 255]), 1, 1);
      tex.needsUpdate = true;
      return tex;
    }
    const { canvas, ctx } = c;

    // Rich golden amber base
    ctx.fillStyle = '#d97706';
    ctx.fillRect(0, 0, 256, 256);

    // Warm radiant golden-amber gradient
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0.0, '#fef08a');
    grad.addColorStop(0.25, '#fbbf24');
    grad.addColorStop(0.65, '#f59e0b');
    grad.addColorStop(1.0, '#b45309');
    ctx.fillStyle = grad;
    ctx.fillRect(6, 6, 244, 244);

    // Subtle edge pinstripe
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.strokeRect(10, 10, 236, 236);

    // Two big crisp forward white chevrons (^ facing forward)
    const drawChevron = (centerY: number) => {
      // Glow underlay in deep orange
      ctx.save();
      ctx.strokeStyle = '#b45309';
      ctx.lineWidth = 28;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'miter';
      ctx.beginPath();
      ctx.moveTo(38, centerY + 36);
      ctx.lineTo(128, centerY - 26);
      ctx.lineTo(218, centerY + 36);
      ctx.stroke();

      // Bright white chevron core
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 20;
      ctx.beginPath();
      ctx.moveTo(38, centerY + 36);
      ctx.lineTo(128, centerY - 26);
      ctx.lineTo(218, centerY + 36);
      ctx.stroke();
      ctx.restore();
    };

    drawChevron(84);
    drawChevron(172);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  /**
   * Generates a 256x256 concentric bullseye target texture for spring bouncer pads.
   */
  public static createTargetBouncer(): THREE.Texture {
    const c = this.createCanvas(256, 256);
    if (!c) {
      const tex = new THREE.DataTexture(new Uint8Array([244, 63, 94, 255]), 1, 1);
      tex.needsUpdate = true;
      return tex;
    }
    const { canvas, ctx } = c;

    const cx = 128;
    const cy = 128;

    // Dark charcoal backing rim
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(cx, cy, 126, 0, Math.PI * 2);
    ctx.fill();

    // Outer bold hot-pink / magenta ring
    ctx.fillStyle = '#f43f5e';
    ctx.beginPath();
    ctx.arc(cx, cy, 118, 0, Math.PI * 2);
    ctx.fill();

    // Middle crisp white ring
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx, cy, 82, 0, Math.PI * 2);
    ctx.fill();

    // Inner hot-pink bullseye core
    ctx.fillStyle = '#e11d48';
    ctx.beginPath();
    ctx.arc(cx, cy, 48, 0, Math.PI * 2);
    ctx.fill();

    // Center white dot
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx, cy, 18, 0, Math.PI * 2);
    ctx.fill();

    // Subtle specular gloss arc
    const gloss = ctx.createLinearGradient(0, 0, 256, 256);
    gloss.addColorStop(0.0, 'rgba(255, 255, 255, 0.5)');
    gloss.addColorStop(0.4, 'rgba(255, 255, 255, 0.08)');
    gloss.addColorStop(1.0, 'rgba(0, 0, 0, 0.25)');
    ctx.fillStyle = gloss;
    ctx.beginPath();
    ctx.arc(cx, cy, 118, 0, Math.PI * 2);
    ctx.fill();

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  /**
   * Generates a 512x256 racing stripe decal texture for the liquid chrome marble.
   */
  /**
   * Generates a 512x256 high-polish chrome map with a subtle cool silvery-blue sheen
   * and clean precision racing pinstripes, ensuring the marble reads as liquid chrome.
   */
  public static createMarbleDecal(): THREE.Texture {
    const c = this.createCanvas(512, 256);
    if (!c) {
      const tex = new THREE.DataTexture(new Uint8Array([240, 244, 248, 255]), 1, 1);
      tex.needsUpdate = true;
      return tex;
    }
    const { canvas, ctx } = c;

    // Liquid chrome base with cool silvery tint
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0.0, '#f8fafc');
    grad.addColorStop(0.25, '#f1f5f9');
    grad.addColorStop(0.50, '#e2e8f0');
    grad.addColorStop(0.75, '#cbd5e1');
    grad.addColorStop(1.0, '#e2e8f0');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 256);

    // Subtle cool cyan-silver specular glaze
    const glaze = ctx.createLinearGradient(0, 0, 512, 0);
    glaze.addColorStop(0.0, 'rgba(240, 249, 255, 0.35)');
    glaze.addColorStop(0.5, 'rgba(224, 242, 254, 0.1)');
    glaze.addColorStop(1.0, 'rgba(240, 249, 255, 0.35)');
    ctx.fillStyle = glaze;
    ctx.fillRect(0, 0, 512, 256);

    // Minimalist precision equator pinstripe (subtle chrome speed line, not a candy stripe)
    const stripeY = 128;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.fillRect(0, stripeY - 2, 512, 4);

    ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, stripeY - 4);
    ctx.lineTo(512, stripeY - 4);
    ctx.moveTo(0, stripeY + 4);
    ctx.lineTo(512, stripeY + 4);
    ctx.stroke();

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.needsUpdate = true;
    return texture;
  }

  /**
   * Generates a 256x64 checkered black-and-white finish line banner texture.
   */
  public static createFinishCheckered(): THREE.Texture {
    const c = this.createCanvas(256, 64);
    if (!c) {
      const tex = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
      tex.needsUpdate = true;
      return tex;
    }
    const { canvas, ctx } = c;

    const rows = 2;
    const cols = 8;
    const w = 256 / cols;
    const h = 64 / rows;

    for (let r = 0; r < rows; r++) {
      for (let col = 0; col < cols; col++) {
        ctx.fillStyle = (r + col) % 2 === 0 ? '#ffffff' : '#0f172a';
        ctx.fillRect(col * w, r * h, w, h);
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  /**
   * Generates a 128x128 soft radial dark blob shadow for the marble.
   */
  public static createBlobShadow(): THREE.Texture {
    const c = this.createCanvas(128, 128);
    if (!c) {
      const tex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 180]), 1, 1);
      tex.needsUpdate = true;
      return tex;
    }
    const { canvas, ctx } = c;
    const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0.0, 'rgba(15, 23, 42, 0.75)');
    grad.addColorStop(0.45, 'rgba(15, 23, 42, 0.4)');
    grad.addColorStop(0.8, 'rgba(15, 23, 42, 0.1)');
    grad.addColorStop(1.0, 'rgba(15, 23, 42, 0.0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(64, 64, 64, 0, Math.PI * 2);
    ctx.fill();

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  /**
   * Generates a 256x512 textured stone monolith map with stone block seams,
   * horizontal architectural banding, and subtle vertical lighting gradient.
   */
  public static createPillarTexture(
    baseColorHex: number,
    isNight: boolean = false
  ): THREE.Texture {
    const c = this.createCanvas(256, 512);
    if (!c) {
      const tex = new THREE.DataTexture(new Uint8Array([150, 150, 150, 255]), 1, 1);
      tex.needsUpdate = true;
      return tex;
    }
    const { canvas, ctx } = c;

    const baseColor = new THREE.Color(baseColorHex);
    // Subtle vertical gradient (ground level is slightly deeper in tone, top catches sky light)
    const topColor = baseColor.clone().offsetHSL(0, 0, 0.07).getStyle();
    const bottomColor = baseColor.clone().offsetHSL(0, 0, -0.12).getStyle();

    const grad = ctx.createLinearGradient(0, 512, 0, 0);
    grad.addColorStop(0.0, bottomColor);
    grad.addColorStop(1.0, topColor);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 512);

    // Architectural horizontal banding and stone seams
    const bandHeight = 32;
    for (let y = 0; y < 512; y += bandHeight) {
      const isAlt = (y / bandHeight) % 2 === 0;
      ctx.fillStyle = isAlt ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.04)';
      ctx.fillRect(0, y, 256, bandHeight);

      // Horizontal mortar seam groove
      ctx.strokeStyle = isNight ? 'rgba(0, 0, 0, 0.45)' : 'rgba(0, 0, 0, 0.09)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(256, y);
      ctx.stroke();

      // Sunlit edge highlight below groove
      ctx.strokeStyle = isNight ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.18)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, y + 2);
      ctx.lineTo(256, y + 2);
      ctx.stroke();
    }

    // Vertical stone block seams (staggered by band)
    const blockWidth = 64;
    for (let y = 0; y < 512; y += bandHeight) {
      const rowIdx = y / bandHeight;
      const xOffset = (rowIdx % 2) * (blockWidth / 2);
      for (let x = xOffset; x < 256; x += blockWidth) {
        ctx.strokeStyle = isNight ? 'rgba(0, 0, 0, 0.40)' : 'rgba(0, 0, 0, 0.08)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + bandHeight);
        ctx.stroke();

        ctx.strokeStyle = isNight ? 'rgba(255, 255, 255, 0.04)' : 'rgba(255, 255, 255, 0.18)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + 1, y);
        ctx.lineTo(x + 1, y + bandHeight);
        ctx.stroke();
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.needsUpdate = true;
    return texture;
  }

  /**
   * Generates a 256x512 emissive window strip map for Level 4 cyber monoliths.
   */
  public static createPillarWindowTexture(): THREE.Texture {
    const c = this.createCanvas(256, 512);
    if (!c) {
      const tex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
      tex.needsUpdate = true;
      return tex;
    }
    const { canvas, ctx } = c;

    // Pitch black background (no emission)
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, 256, 512);

    // Glowing vertical window columns
    const colXPositions = [40, 84, 164, 208];
    colXPositions.forEach((x, colIdx) => {
      for (let y = 24; y < 490; y += 38) {
        // Deterministic pseudo-random pattern of illuminated windows
        const lit = ((x * 19 + y * 29) % 10) > 4;
        if (lit) {
          const isCyan = (colIdx + y) % 3 !== 0;
          ctx.fillStyle = isCyan ? '#38bdf8' : '#f43f5e';
          ctx.fillRect(x, y, 14, 22);
        }
      }
    });

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.needsUpdate = true;
    return texture;
  }
}
