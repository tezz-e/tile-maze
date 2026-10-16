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

    // 1. Sky Gradient from zenith (y=0) down through horizon (y=256) to nadir (y=512)
    const skyGrad = ctx.createLinearGradient(0, 0, 0, 512);
    if (isNight) {
      skyGrad.addColorStop(0.0, topColor);
      skyGrad.addColorStop(0.35, '#050b14');
      skyGrad.addColorStop(0.50, '#0f172a');
      skyGrad.addColorStop(0.68, '#070d18');
      skyGrad.addColorStop(1.0, bottomColor);
    } else {
      skyGrad.addColorStop(0.0, topColor);
      skyGrad.addColorStop(0.25, topColor);
      skyGrad.addColorStop(0.48, '#bae6fd');
      skyGrad.addColorStop(0.50, '#fed7aa');
      skyGrad.addColorStop(0.68, bottomColor);
      skyGrad.addColorStop(1.0, bottomColor);
    }
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, 1024, 512);

    // 2. Warm Sun Corona / Glowing Night Moon at ~12° above horizon (Y=215, X=620)
    const sunX = 620;
    const sunY = 215;
    const sunGrad = ctx.createRadialGradient(sunX, sunY, 15, sunX, sunY, 180);
    if (isNight) {
      sunGrad.addColorStop(0.0, 'rgba(255, 255, 255, 0.95)');
      sunGrad.addColorStop(0.12, 'rgba(224, 242, 254, 0.85)');
      sunGrad.addColorStop(0.35, 'rgba(186, 230, 253, 0.45)');
      sunGrad.addColorStop(0.7, 'rgba(56, 189, 248, 0.15)');
      sunGrad.addColorStop(1.0, 'rgba(56, 189, 248, 0.0)');
    } else {
      sunGrad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
      sunGrad.addColorStop(0.12, 'rgba(255, 252, 230, 0.95)');
      sunGrad.addColorStop(0.35, 'rgba(254, 240, 138, 0.55)');
      sunGrad.addColorStop(0.7, 'rgba(253, 224, 71, 0.18)');
      sunGrad.addColorStop(1.0, 'rgba(253, 224, 71, 0.0)');
    }
    ctx.fillStyle = sunGrad;
    ctx.beginPath();
    ctx.arc(sunX, sunY, 180, 0, Math.PI * 2);
    ctx.fill();

    // 3. Clouds or Stars
    if (isNight) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      for (let i = 0; i < 45; i++) {
        const sx = (i * 137 + 53) % 1024;
        const sy = (i * 89 + 17) % 230;
        const sSize = i % 3 === 0 ? 2 : 1;
        ctx.fillRect(sx, sy, sSize, sSize);
      }
    } else {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      for (let i = 0; i < 20; i++) {
        const cx = (i * 60 + 30) % 1024;
        const cy = 250 + Math.sin(i * 1.3) * 15;
        const r = 45 + Math.cos(i * 0.9) * 18;
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
  public static createMarbleDecal(): THREE.Texture {
    const c = this.createCanvas(512, 256);
    if (!c) {
      const tex = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
      tex.needsUpdate = true;
      return tex;
    }
    const { canvas, ctx } = c;

    // Bright reflective chrome base
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(0, 0, 512, 256);

    // Warm metallic gradient
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0.0, '#ffffff');
    grad.addColorStop(0.3, '#f1f5f9');
    grad.addColorStop(0.7, '#cbd5e1');
    grad.addColorStop(1.0, '#94a3b8');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 256);

    // Sporty racing insignia: double orange & white racing stripes running horizontally around the equator
    const stripeY = 128;

    // Wide golden-orange center stripe
    ctx.fillStyle = '#f97316';
    ctx.fillRect(0, stripeY - 24, 512, 48);

    // Thin white border pinstripes
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, stripeY - 30, 512, 6);
    ctx.fillRect(0, stripeY + 24, 512, 6);

    // Inner bright yellow-amber speed accent
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(0, stripeY - 6, 512, 12);

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
}
