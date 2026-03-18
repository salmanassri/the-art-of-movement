# The Art of Motion

An interactive art installation that responds to your body movements. Move in front of the camera and watch colorful particles flow and dance, creating unique patterns with every gesture. **The Art of Motion** uses your webcam to detect your movements and transforms them into flowing particle animations. It's a generative art piece that creates something different every time, influenced by how you move. Created by **RGB Trio** for an Algorithmic Art course vernissage.

## Installation & Setup

### Prerequisites
- Node.js (v14 or higher) or any local server
- Modern web browser with webcam access

### Quick Start

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/kinetic-canvas.git
   cd kinetic-canvas
   ```

2. **Run a local server**
   ```bash
   # Using Python 3
   python -m http.server 8000
   
   # Or using Node.js (http-server)
   npx http-server
   ```

3. **Open in browser**
   Navigate to `http://localhost:8000` and allow camera access when prompted.

### Dependencies
- [p5.js](https://p5js.org/) – Graphics and animation
- [ml5.js](https://learn.ml5js.org/) – Machine learning for pose estimation
- [TensorFlow.js](https://www.tensorflow.org/js) – Backend for ml5 (loaded automatically)

All dependencies are loaded via CDN—no npm installation required.

## How to Use It

1. Open the app in your browser (see setup above)
2. Allow camera access
3. Stand in front of your camera and move
4. Watch the particles respond to your motion


## Future Ideas

- Add sound that reacts to movement
- Let multiple people interact at once
- Save frames or record videos
- Different visual modes (slow, chaotic, meditative)

## Credits

**Team:** RGB Trio
- Salma Nassri
- Mariana Franco Ochoa
- Nicolas Demers-Neuwirth

**Course:** Algorithmic Art (Vernissage Project)

**Built with:** p5.js, ml5.js
