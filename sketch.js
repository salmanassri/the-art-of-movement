/**
 * Single-panel generative sketch inspired by Studio ANF's Hyperschwarm
 * Reference: https://studioanf.com/project/hyperschwarm-generative-art-installation
 */

let layers = []; // array of swarm layers
let zFlow = 0; // depth of the flow field
let hueAnchor = 0; // base hue for the palette
let hueDrift = 0; // drift of the hue
let palettePhase = 0; // phase of the palette
let nextPaletteAt = 0; // time to switch to a new palette

let video;
let bodyPose;
let poses = [];

const INFLUENCE_RADIUS = 350;
const DISTORTION_STRENGTH = 0.85;
const PULL_STRENGTH = 0.22;
const MIN_CONFIDENCE = 0.3; // minimum confidence level for a keypoint to be considered active

let showDebug = true;

/** Display size (width in px) for wrist marker image in debug overlay */
const WRIST_IMG_DISPLAY_W = 40;

let wristImg;

let burstParticles = [];
const CLASP_DISTANCE = 80;
const CLASP_COOLDOWN = 30;
let claspReady = true;
let claspCooldownTimer = 0;
const BURST_COUNT = 35;
const BURST_LIFESPAN = 150;

function preload() {
  wristImg = loadImage("hand.png");
  // bodyPose = ml5.bodyPose("MoveNet"); // load the MoveNet model
  bodyPose = ml5.bodyPose("BlazePose"); // load the PoseNet model
  // bodyPose = ml5.bodyPose("MoveNet", { modelType: "SINGLEPOSE_THUNDER" });
}

// callback function to keep the poses array updated every frame
function gotPoses(results) {
  poses = results;
}

function setup() {
  createCanvas(windowWidth, windowHeight);
  colorMode(HSB, 360, 100, 100, 100);
  randomSeed(floor(random(1e9)));
  noiseSeed(floor(random(1e9)));

  video = createCapture(VIDEO); // hidden video capture object 
  video.size(windowWidth, windowHeight); // set the size of the video capture object to the canvas size
  video.hide(); 
  bodyPose.detectStart(video, gotPoses); // start the body pose detection

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

  const activeKeypoints = [];
  let leftWrist = null;
  let rightWrist = null;
  for (const pose of poses) {
    for (const kp of pose.keypoints) {
      if (kp.confidence > MIN_CONFIDENCE && (kp.name === "left_wrist" || kp.name === "right_wrist")) {
        // Mirror to match a front-facing webcam; use canvas width so coords match video.size(windowWidth, windowHeight).
        const mx = width - kp.x;
        const my = kp.y;
        activeKeypoints.push({ x: mx, y: my });
        if (kp.name === "left_wrist") leftWrist = { x: mx, y: my };
        if (kp.name === "right_wrist") rightWrist = { x: mx, y: my };
      }
    }
  }

  // Spawn burst when hands clasp together
  if (!claspReady) {
    claspCooldownTimer--;
    if (claspCooldownTimer <= 0) claspReady = true;
  }
  if (leftWrist && rightWrist) {
    const dx = leftWrist.x - rightWrist.x;
    const dy = leftWrist.y - rightWrist.y;
    const handDist = sqrt(dx * dx + dy * dy);
    if (handDist < CLASP_DISTANCE && claspReady) {
      const cx = (leftWrist.x + rightWrist.x) / 2;
      const cy = (leftWrist.y + rightWrist.y) / 2;
      spawnBurst(cx, cy, globalHue);
      claspReady = false;
      claspCooldownTimer = CLASP_COOLDOWN;
    } else if (handDist > CLASP_DISTANCE * 2) {
      claspReady = true;
    }
  }

  for (const layer of layers) {
    layer.update(zFlow, globalHue, activeKeypoints);
    layer.display(globalHue);
  }

  updateBurstParticles();
  displayBurstParticles(globalHue);

  if (showDebug) {
    drawDebugSkeleton();
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

  update(z, globalHue, keypoints) {
    for (const p of this.particles) {
      const nx = p.x * this.noiseScale;
      const ny = p.y * this.noiseScale;
      let a1 = noise(nx, ny, z) * TWO_PI * 2;
      const a2 = noise(nx + 400, ny - 200, z * 1.3 + 10) * TWO_PI;

      // Track the strongest keypoint influence on this particle
      let maxInfluence = 0;
      let pullX = 0;
      let pullY = 0;

      for (const kp of keypoints) {
        const dx = kp.x - p.x;
        const dy = kp.y - p.y;
        const d = sqrt(dx * dx + dy * dy);
        if (d < INFLUENCE_RADIUS && d > 1) {
          const toward = atan2(dy, dx);
          const falloff = pow(1 - d / INFLUENCE_RADIUS, 2);
          a1 = lerpAngle(a1, toward, falloff * DISTORTION_STRENGTH);

          // Direct velocity pull toward keypoint
          if (falloff > maxInfluence) {
            maxInfluence = falloff;
            const normD = 1 / d;
            pullX = dx * normD * falloff * PULL_STRENGTH;
            pullY = dy * normD * falloff * PULL_STRENGTH;
          }
        }
      }

      // Suppress the curl noise near keypoints so the body's pull dominates
      const curlFade = 1 - maxInfluence * 0.8;
      const ax = cos(a1) + cos(a2) * this.curl * 40 * curlFade;
      const ay = sin(a1) + sin(a2) * this.curl * 40 * curlFade;

      p.vx += ax * 0.045 + pullX;
      p.vy += ay * 0.045 + pullY;

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
    noStroke();
    blendMode(ADD);
    for (const p of this.particles) {
      const h = (globalHue + p.hueJitter + noise(p.x * 0.01, p.y * 0.01, frameCount * 0.002) * 35) % 360;
      const s = constrain(52 + p.satJitter + noise(p.x * 0.008, p.y * 0.008) * 22, 25, 100);
      const b = constrain(68 + p.briJitter + noise(p.y * 0.007, p.x * 0.007) * 28, 40, 100);
      const a = this.alpha * (0.45 + noise(p.x * 0.02, p.y * 0.02) * 0.45);

      fill(h, s, b, a * 0.3);
      circle(p.x, p.y, this.r * 2.5);

      fill(h, s, b, a);
      circle(p.x, p.y, this.r);
    }
    blendMode(BLEND);
  }
}

function spawnBurst(x, y, globalHue) {
  for (let i = 0; i < BURST_COUNT; i++) {
    const angle = random(TWO_PI); // random direction angle for each particle
    const spd = random(2, 5); // random speed for each particle
    burstParticles.push({
      x: x + random(-8, 8), // random x offset from the center of the burst
      y: y + random(-8, 8), // random y offset from the center of the burst
      vx: cos(angle) * spd, // x velocity based on the angle and speed
      vy: sin(angle) * spd, // y velocity based on the angle and speed
      life: BURST_LIFESPAN,
      maxLife: BURST_LIFESPAN,
      hue: (globalHue + random(-30, 30)) % 360,
      r: random(2, 7), // random radius for each particle
    });
  }
}

function updateBurstParticles() {
  // loop backwards through the burst particles array to safely remove items during iteration
  for (let i = burstParticles.length - 1; i >= 0; i--) {
    const bp = burstParticles[i];
    bp.vx *= 0.97; // gradually reduce the velocity of the particle
    bp.vy *= 0.97; // gradually reduce the velocity of the particle
    bp.x += bp.vx; // move particle by current velocity
    bp.y += bp.vy; // move particle by current velocity
    bp.life--; // decrement life of particle by 1 frame
    if (bp.life <= 0 || bp.x < -20 || bp.x > width + 20 || bp.y < -20 || bp.y > height + 20) {
      burstParticles.splice(i, 1); // remove particle from array if it's off the screen or has no life left
    }
  }
}

function displayBurstParticles(globalHue) {
  noStroke();
  blendMode(ADD);
  for (const bp of burstParticles) {
    const t = bp.life / bp.maxLife;
    const fadeIn = constrain(1 - bp.life / bp.maxLife, 0, 1) < 0.1 ? (1 - bp.life / bp.maxLife) / 0.1 : 1;
    const a = t * fadeIn * 18;
    const b = 70 + 30 * t;

    fill(bp.hue, 45, b, a * 0.25);
    circle(bp.x, bp.y, bp.r * 3.5);

    fill(bp.hue, 40, b, a);
    circle(bp.x, bp.y, bp.r);
  }
  blendMode(BLEND);
}

function lerpAngle(a, b, t) {
  let diff = b - a;
  while (diff > PI) diff -= TWO_PI;
  while (diff < -PI) diff += TWO_PI;
  return a + diff * t;
}

function drawDebugSkeleton() {
  if (!wristImg || wristImg.width <= 0) return;

  const displayH = WRIST_IMG_DISPLAY_W * (wristImg.height / wristImg.width);
  imageMode(CENTER);
  noStroke();

  for (const pose of poses) {
    for (const kp of pose.keypoints) {
      if (kp.confidence > MIN_CONFIDENCE && (kp.name === "left_wrist" || kp.name === "right_wrist")) {
        const x = width - kp.x;
        const y = kp.y;
        push();
        translate(x, y);
        // Mirror one wrist so a directional hand asset reads correctly on both sides
        if (kp.name === "left_wrist") scale(-1, 1);
        image(wristImg, 0, 0, WRIST_IMG_DISPLAY_W, displayH);
        pop();
      }
    }
  }

  imageMode(CORNER);
}

function keyPressed() {
  if (key === "d" || key === "D") {
    showDebug = !showDebug;
  }
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
