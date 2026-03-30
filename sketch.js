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

let video;
let bodyPose;
let poses = [];

const INFLUENCE_RADIUS = 350;
const DISTORTION_STRENGTH = 0.85;
const PULL_STRENGTH = 0.22;
const MIN_CONFIDENCE = 0.3; // minimum confidence level for a keypoint to be considered active

let showDebug = true;

let burstParticles = [];
const CLASP_DISTANCE = 80;
const CLASP_COOLDOWN = 30;
let claspReady = true;
let claspCooldownTimer = 0;
const BURST_COUNT = 70;
const BURST_LIFESPAN = 350;

let claspSynth;
let swipeSynth;
let motionReverb;
let audioInitialized = false;
let audioReady = false;

const SWIPE_SPEED_THRESHOLD = 24;
const SWIPE_COOLDOWN = 14;
let swipeCooldownTimer = 0;
let prevLeftWrist = null;
let prevRightWrist = null;

function preload() {
  // bodyPose = ml5.bodyPose("MoveNet"); // load the MoveNet model
  bodyPose = ml5.bodyPose("BlazePose"); // load the PoseNet model
  // bodyPose = ml5.bodyPose("MoveNet", { modelType: "SINGLEPOSE_THUNDER" });
}

// callback function to keep the poses array updated every frame
function gotPoses(results) {
  poses = results;
}

function setup() {
  createCanvas(W, H);
  colorMode(HSB, 360, 100, 100, 100);
  randomSeed(floor(random(1e9)));
  noiseSeed(floor(random(1e9)));
  initAudioEngine();

  video = createCapture(VIDEO); // hidden video capture object 
  video.size(W, H); // set the size of the video capture object to the canvas size
  video.hide(); 
  bodyPose.detectStart(video, gotPoses); // start the body pose detection

  hueAnchor = random(360);
  nextPaletteAt = frameCount + int(random(400, 900));

  // three different spatial frequencies (small/medium/large) with low per-dot alpha so marks merge
  layers.push(
    new SwarmLayer(6400, 0.78, 3.4, 8, 0.0026, 0.016),
    new SwarmLayer(2800, 1.0, 5.8, 11, 0.0014, 0.024),
    new SwarmLayer(960, 1.25, 9.5, 14, 0.00085, 0.036)
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
        const mx = W - kp.x;
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
      triggerClaspSound(globalHue, handDist);
      claspReady = false;
      claspCooldownTimer = CLASP_COOLDOWN;
    } else if (handDist > CLASP_DISTANCE * 2) {
      claspReady = true;
    }
  }

  detectSwipeGesture(leftWrist, rightWrist, globalHue);

  for (const layer of layers) {
    layer.update(zFlow, globalHue, activeKeypoints);
    layer.display(globalHue);
  }

  updateBurstParticles();
  displayBurstParticles(globalHue);

  if (!audioReady) {
    noStroke();
    fill(0, 0, 100, 70);
    textAlign(CENTER, CENTER);
    textSize(14);
    text("Click or press a key to enable sound", width / 2, height - 26);
  }

  if (showDebug) {
    drawDebugSkeleton();
  }
}

function initAudioEngine() {
  claspSynth = new p5.MonoSynth();
  swipeSynth = new p5.MonoSynth();
  motionReverb = new p5.Reverb();
  motionReverb.process(claspSynth, 2.8, 2);
  motionReverb.process(swipeSynth, 1.9, 1.2);
  audioInitialized = true;
}

function ensureAudioStarted() {
  if (!audioInitialized) return;
  userStartAudio();
  const ctx = getAudioContext();
  if (ctx && ctx.state !== "running") {
    ctx.resume();
  }
  audioReady = true;
}

function triggerClaspSound(globalHue, handDist) {
  if (!audioReady) return;
  const hue = (globalHue + 360) % 360;
  const midi = int(map(hue, 0, 360, 48, 76));
  const freq = midiToFreq(midi);
  const velocity = constrain(map(handDist, CLASP_DISTANCE, 0, 0.45, 0.95), 0.35, 0.95);
  claspSynth.play(freq, velocity, 0, 0.2);
}

function detectSwipeGesture(leftWrist, rightWrist, globalHue) {
  if (swipeCooldownTimer > 0) swipeCooldownTimer--;

  if (leftWrist && rightWrist && prevLeftWrist && prevRightWrist) {
    const leftSpeed = dist(leftWrist.x, leftWrist.y, prevLeftWrist.x, prevLeftWrist.y);
    const rightSpeed = dist(rightWrist.x, rightWrist.y, prevRightWrist.x, prevRightWrist.y);
    const speed = max(leftSpeed, rightSpeed);

    if (speed > SWIPE_SPEED_THRESHOLD && swipeCooldownTimer <= 0) {
      triggerSwipeSound(speed, globalHue);
      swipeCooldownTimer = SWIPE_COOLDOWN;
    }
  }

  prevLeftWrist = leftWrist ? { x: leftWrist.x, y: leftWrist.y } : null;
  prevRightWrist = rightWrist ? { x: rightWrist.x, y: rightWrist.y } : null;
}

function triggerSwipeSound(speed, globalHue) {
  if (!audioReady) return;
  const speedNorm = constrain(map(speed, SWIPE_SPEED_THRESHOLD, 70, 0, 1), 0, 1);
  const hue = (globalHue + 360) % 360;
  const midi = int(map(speedNorm, 0, 1, 62, 90) + map(hue, 0, 360, -3, 3));
  const freq = midiToFreq(midi);
  const velocity = 0.2 + speedNorm * 0.5;
  swipeSynth.play(freq, velocity, 0, 0.08);
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
    if (bp.life <= 0 || bp.x < -20 || bp.x > W + 20 || bp.y < -20 || bp.y > H + 20) {
      burstParticles.splice(i, 1); // remove particle from array if it's off the screen or has no life left
    }
  }
}

// draws each burst particle as a glowing dot with a soft halo
function displayBurstParticles(globalHue) {
  noStroke();
  blendMode(ADD);
  for (const bp of burstParticles) {
    const t = bp.life / bp.maxLife; // normalized life of the particle (0-1)
     // makes particles ramp in quickly at birth (first 10% of life progression), then stay at full
    const fadeIn = constrain(1 - bp.life / bp.maxLife, 0, 1) < 0.1 ? (1 - bp.life / bp.maxLife) / 0.1 : 1;
    const a = t * fadeIn * 18; // compute alpha (strong early, then fades as t drops)
    const b = 70 + 30 * t; // compute brightness (bright early, then fades as t drops)

    fill(bp.hue, 45, b, a * 0.25); // fill with color and alpha
    circle(bp.x, bp.y, bp.r * 3.5); // cirlce with soft halo

    fill(bp.hue, 40, b, a); // fill with color and alpha
    circle(bp.x, bp.y, bp.r); // draw the particle as a circle
  }
  blendMode(BLEND); // reset blend mode to normal
}

// this function iterpolate smoothly from angle a toward angle b by fraction t
function lerpAngle(a, b, t) {
  let diff = b - a;
  while (diff > PI) diff -= TWO_PI;
  while (diff < -PI) diff += TWO_PI;
  return a + diff * t;
}

function drawDebugSkeleton() {
  for (const pose of poses) {
    for (const kp of pose.keypoints) {
      if (kp.confidence > MIN_CONFIDENCE && (kp.name === "left_wrist" || kp.name === "right_wrist")) {
        const x = W - kp.x;
        const y = kp.y;
        noStroke();
        fill(0, 0, 100, 30);
        circle(x, y, 18);
        fill(0, 0, 100, 60);
        circle(x, y, 8);
      }
    }
  }
}

function keyPressed() {
  ensureAudioStarted();

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

function mousePressed() {
  ensureAudioStarted();
}

function touchStarted() {
  ensureAudioStarted();
  return false;
}
