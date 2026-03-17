function setup() {
  createCanvas(800, 600);
}

function draw() {
  background(26, 26, 26);
  
  // Example: a moving circle
  noStroke();
  fill(255, 200, 100);
  circle(mouseX, mouseY, 60);
}
