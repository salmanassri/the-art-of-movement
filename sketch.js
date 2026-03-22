/**
 * Single-panel generative sketch inspired by Studio ANF's Hyperschwarm
 * Reference: https://studioanf.com/project/hyperschwarm-generative-art-installation
 */

const W = 960;
const H = 720;

let layers = []; // array of swarm layers
let zFlow = 0; // depth of the flow field
let hueAnchor = 0; // base hue for the palette
let hueDrift = 0; // drift of the hue
let palettePhase = 0; // phase of the palette
let nextPaletteAt = 0; // time to switch to a new palette

function setup() {
  createCanvas(W, H);
  colorMode(HSB, 360, 100, 100, 100);
  randomSeed(floor(random(1e9)));
  noiseSeed(floor(random(1e9)));

  hueAnchor = random(360);
  nextPaletteAt = frameCount + int(random(400, 900));

  // three different spatial frequencies (small/medium/large) with low per-dot alpha so marks merge
  layers.push(
    new SwarmLayer(3200, 0.78, 3.4, 8, 0.0026, 0.016),
    new SwarmLayer(1400, 1.0, 5.8, 11, 0.0014, 0.024),
    new SwarmLayer(480, 1.25, 9.5, 14, 0.00085, 0.036)
  );

  background(0, 0, 6);
}

function draw() {
  // Fade previous frame (new marks blend over the last set)
  noStroke();
  fill(0, 0, 0, 8);
  rect(0, 0, width, height);

  // Update the depth of the flow field, the drift of the hue, and the phase of the palette
  zFlow += 0.0007;
  hueDrift += 0.12;
  palettePhase += 0.003;

  // Slow global hue rotation + occasional palette change
  if (frameCount >= nextPaletteAt) {
    hueAnchor = (hueAnchor + random(40, 120)) % 360;
    nextPaletteAt = frameCount + int(random(500, 1400));
  }
  // Calculate the global hue based on the anchor, drift, and phase
  const globalHue = (hueAnchor + hueDrift * 0.08 + sin(palettePhase) * 18) % 360;

  // Update and display each layer
  for (const layer of layers) {
    layer.update(zFlow, globalHue);
    layer.display(globalHue);
  }
}

class SwarmLayer {
  /**
   * @param {number} n - particle count
   * @param {number} maxSpeed - steering cap
   * @param {number} r - draw radius
   * @param {number} alpha - max opacity (0–100)
   * @param {number} noiseScale - spatial frequency of flow field
   * @param {number} curl - extra swirl from secondary noise
   */
  constructor(n, maxSpeed, r, alpha, noiseScale, curl) {
    this.particles = []; 
    this.maxSpeed = maxSpeed;
    this.r = r;
    this.alpha = alpha; 
    this.noiseScale = noiseScale; 
    this.curl = curl; 
    // Initialize the particles in the layer with random positions, velocities, and color jitter
    for (let i = 0; i < n; i++) {
      this.particles.push({
        x: random(width),
        y: random(height),
        vx: random(-0.5, 0.5),
        vy: random(-0.5, 0.5),
        hueJitter: random(-28, 28),
        satJitter: random(-12, 18),
        briJitter: random(-10, 15),
      });
    }
  }

  update(z, globalHue) {
    for (const p of this.particles) {
      const nx = p.x * this.noiseScale; // scale the position by the noise scale
      const ny = p.y * this.noiseScale;
      const a1 = noise(nx, ny, z) * TWO_PI * 2; // calculate the angle of the flow field
      const a2 = noise(nx + 400, ny - 200, z * 1.3 + 10) * TWO_PI;
      const ax = cos(a1) + cos(a2) * this.curl * 40; // calculate the acceleration of the particles
      const ay = sin(a1) + sin(a2) * this.curl * 40;

      // Update the velocity of the particles
      p.vx += ax * 0.045;
      p.vy += ay * 0.045;

      const sp = sqrt(p.vx * p.vx + p.vy * p.vy);
      if (sp > this.maxSpeed) {
        p.vx = (p.vx / sp) * this.maxSpeed; // limit the velocity to the maximum speed
        p.vy = (p.vy / sp) * this.maxSpeed;
      }

      // Update the position of the particles
      p.x += p.vx;
      p.y += p.vy;

      // if the particle is outside the canvas, wrap it around to the other side
      if (p.x < -20) p.x = width + 20;
      if (p.x > width + 20) p.x = -20;
      if (p.y < -20) p.y = height + 20;
      if (p.y > height + 20) p.y = -20;
    }
  }

  display(globalHue) {
    // Display the particles with the global hue, color jitter, and noise
    noStroke();
    for (const p of this.particles) {
      const h = (globalHue + p.hueJitter + noise(p.x * 0.01, p.y * 0.01, frameCount * 0.002) * 35) % 360;
      const s = constrain(62 + p.satJitter + noise(p.x * 0.008, p.y * 0.008) * 22, 35, 100);
      const b = constrain(48 + p.briJitter + noise(p.y * 0.007, p.x * 0.007) * 28, 25, 100);
      const a = this.alpha * (0.28 + noise(p.x * 0.02, p.y * 0.02) * 0.42);
      fill(h, s, b, a);
      circle(p.x, p.y, this.r);
    }
  }
}

function keyPressed() {
  // Reset the sketch if the space bar, r, or R key is pressed
  if (key === " " || key === "r" || key === "R") {
    noiseSeed(floor(random(1e9)));
    randomSeed(floor(random(1e9)));
    hueAnchor = random(360);
    for (const layer of layers) {
      for (const p of layer.particles) {
        p.x = random(width);
        p.y = random(height);
        p.vx = random(-0.5, 0.5);
        p.vy = random(-0.5, 0.5);
      }
    }
    background(0, 0, 6);
  }
}
