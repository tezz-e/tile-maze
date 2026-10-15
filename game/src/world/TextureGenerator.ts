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
   * Generates a 1024x512 equirectangular sky canvas texture with a bright sunny sky,
   * warm horizon, and golden sun corona.
   */
  public static createSkyEquirectangular(): THREE.Texture {
    const c = this.createCanvas(1024, 512);
    if (!c) {
      const tex = new THREE.DataTexture(new Uint8Array([56, 189, 248, 255]), 1, 1);
      tex.needsUpdate = true;
      return tex;
    }
    const { canvas, ctx } = c;

    // 1. Sky Gradient from zenith down to horizon
    const skyGrad = ctx.createLinearGradient(0, 0, 0, 512);
    skyGrad.addColorStop(0.0, '#1d4ed8'); // Deep vibrant zenith blue
    skyGrad.addColorStop(0.35, '#38bdf8'); // Sky blue
    skyGrad.addColorStop(0.65, '#93c5fd'); // Soft light blue
    skyGrad.addColorStop(0.85, '#e0f2fe'); // Atmospheric haze
    skyGrad.addColorStop(1.0, '#fef08a'); // Warm golden horizon
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, 1024, 512);

    // 2. Warm Sun Corona & Disc at ~35% height, 65% width
    const sunX = 660;
    const sunY = 160;
    const sunGrad = ctx.createRadialGradient(sunX, sunY, 15, sunX, sunY, 160);
    sunGrad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
    sunGrad.addColorStop(0.15, 'rgba(255, 250, 220, 0.9)');
    sunGrad.addColorStop(0.4, 'rgba(254, 240, 138, 0.45)');
    sunGrad.addColorStop(0.8, 'rgba(253, 224, 71, 0.15)');
    sunGrad.addColorStop(1.0, 'rgba(253, 224, 71, 0.0)');
    ctx.fillStyle = sunGrad;
    ctx.beginPath();
    ctx.arc(sunX, sunY, 160, 0, Math.PI * 2);
    ctx.fill();

    // 3. Soft cloud bands near horizon
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    for (let i = 0; i < 18; i++) {
      const cx = (i * 70 + 40) % 1024;
      const cy = 380 + Math.sin(i * 1.3) * 25;
      const r = 55 + Math.cos(i * 0.9) * 20;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.mapping = THREE.EquirectangularReflectionMapping;
    texture.needsUpdate = true;
    return texture;
  }

  /**
   * Generates a seamless 512x512 blue tiled texture with subtle tile gloss
   * and clean white grout seams, matching the screenshot's skyway tiles.
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
      for (let c = 0; c < tilesPerSide; c++) {
        const x = c * tileSize;
        const y = r * tileSize;

        // Base tile gradient for subtle ceramic curvature
        const grad = ctx.createLinearGradient(x, y, x + tileSize, y + tileSize);
        grad.addColorStop(0.0, '#60a5fa'); // Light blue specular top-left
        grad.addColorStop(0.45, '#3b82f6'); // Rich royal blue body
        grad.addColorStop(1.0, '#2563eb'); // Deep blue edge

        ctx.fillStyle = grad;
        ctx.fillRect(x + seamWidth, y + seamWidth, tileSize - seamWidth * 2, tileSize - seamWidth * 2);

        // Subtle inner bevel highlight
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x + seamWidth + 1, y + tileSize - seamWidth);
        ctx.lineTo(x + seamWidth + 1, y + seamWidth + 1);
        ctx.lineTo(x + tileSize - seamWidth, y + seamWidth + 1);
        ctx.stroke();

        // Subtle inner bevel shadow
        ctx.strokeStyle = 'rgba(15, 23, 42, 0.25)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x + tileSize - seamWidth - 1, y + seamWidth + 2);
        ctx.lineTo(x + tileSize - seamWidth - 1, y + tileSize - seamWidth - 1);
        ctx.lineTo(x + seamWidth + 2, y + tileSize - seamWidth - 1);
        ctx.stroke();
      }
    }

    // Grout / Seam lines: crisp light cyan-white
    ctx.strokeStyle = '#e0f2fe';
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
   * Generates a 256x256 yellow ramp texture with white forward chevrons (>>).
   */
  public static createChevrons(): THREE.Texture {
    const c = this.createCanvas(256, 256);
    if (!c) {
      const tex = new THREE.DataTexture(new Uint8Array([245, 158, 11, 255]), 1, 1);
      tex.needsUpdate = true;
      return tex;
    }
    const { canvas, ctx } = c;

    // Yellow ramp surface
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(0, 0, 256, 256);

    // Warm amber gradient
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0.0, '#fbbf24');
    grad.addColorStop(1.0, '#d97706');
    ctx.fillStyle = grad;
    ctx.fillRect(8, 8, 240, 240);

    // Two big crisp forward white chevrons (^ facing up / forward)
    ctx.strokeStyle = '#ffffff';
    ctx.fillStyle = '#ffffff';
    ctx.lineWidth = 18;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'miter';

    const drawChevron = (centerY: number) => {
      ctx.beginPath();
      ctx.moveTo(48, centerY + 30);
      ctx.lineTo(128, centerY - 25);
      ctx.lineTo(208, centerY + 30);
      ctx.stroke();
    };

    drawChevron(90);
    drawChevron(175);

    const texture = new THREE.CanvasTexture(canvas);
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
      for (let c = 0; c < cols; c++) {
        ctx.fillStyle = (r + c) % 2 === 0 ? '#ffffff' : '#0f172a';
        ctx.fillRect(c * w, r * h, w, h);
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }
}
