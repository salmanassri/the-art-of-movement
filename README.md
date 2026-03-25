# The Art of Motion

An interactive art installation that uses your webcam and body pose detection to let you sculpt flowing particle animations with your hands. Created by **RGB Trio** for an Algorithmic Art course vernissage.

## What Is This?

**The Art of Motion** is a generative art piece inspired by [Studio ANF's Hyperschwarm](https://studioanf.com/project/hyperschwarm-generative-art-installation). Thousands of glowing particles flow across the screen, driven by a Perlin noise flow field. Using ml5.js pose detection (BlazePose), your hand movements warp and reshape the particle streams in real time — every performance is unique.

### Interactions

- **Flow distortion** — Move your hands to bend and pull streams of particles toward you. The closer particles are to your wrists, the stronger the pull.
- **Particle bursts** — Clasp both hands together to trigger an explosion of particles from the contact point. Separate your hands and clasp again to repeat.
- **Keyboard controls:**
  - **D** — Toggle wrist debug markers on/off
  - **Space** / **R** — Reset the canvas with a new flow field and color palette

## Installation & Setup

### Prerequisites
- Any local server (Python, Node.js, etc.)
- Modern web browser with webcam access

### Quick Start

1. **Clone the repository**

```bash
git clone https://github.com/yourusername/the-art-of-motion.git
cd the-art-of-motion
```

2. **Run a local server**

```bash
# Using Python 3
python3 -m http.server 8000

# Or using Node.js
npx http-server
```

3. **Open in browser**
   Navigate to `http://localhost:8000` and allow camera access when prompted.

### Dependencies
- [p5.js](https://p5js.org/) — Graphics and animation
- [ml5.js](https://learn.ml5js.org/) — Machine learning for pose estimation (BlazePose)
- [TensorFlow.js](https://www.tensorflow.org/js) — Backend for ml5 (loaded automatically)

All dependencies are loaded via CDN — no npm installation required.

## Credits

**Team:** RGB Trio
- Salma Nassri
- Mariana Franco Ochoa
- Nicolas Demers-Neuwirth

**Course:** Algorithmic Art (Vernissage Project)

**Built with:** p5.js, ml5.js (BlazePose)
