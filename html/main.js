

var canvas;
var ctx;
var canvasWidth;
var canvasHeight;
var id;

const fnes = require("../fnes_system.js").fnes;

function InitSystem() {
  canvas = document.getElementById('canvas');
  ctx = canvas.getContext('2d');
  canvasWidth = canvas.width;
  canvasHeight = canvas.height;
  id = ctx.getImageData(0, 0, 1, 1);

}

var delay = 0;
var render_ppu_nametable = false;
var debugMode = false;
var Joy1data = 0;

document.addEventListener('keydown',handleKeyDown,false);
document.addEventListener('keyup',handleKeyUp,false);
function handleKeyDown(e) {
   var code = e.keyCode;
  if(code === 32) { // Space
    render_ppu_nametable = render_ppu_nametable?false:true
    console.log("Render Sprite = "+render_ppu_nametable);
  }
  if(code === 68) { // 'D'
    debugMode = debugMode?false:true
    system.debug = debugMode?DEBUG_OPS:0;
    console.log("Debug mode = "+debugMode);
  }
  if(code === 13) { // Start
    Joy1data |= (1<<3);
    console.log("Start");
  }
  if(code === 39) { // Right
    Joy1data |= (1<<7);
    console.log("Right");
  }
  if(code === 37) { // Left
    Joy1data |= (1<<6);
    console.log("Left");
  }
  if(code === 40) { // Down
    Joy1data |= (1<<5);
    console.log("Down");
  }
  if(code === 38) { // Up
    Joy1data |= (1<<4);
    console.log("Up");
  }
  if(code === 90) { // 'Z'  
    Joy1data |= (1<<0);
    console.log("A");
  }
  if(code === 88) { // 'X'
    Joy1data |= (1<<1);
    console.log("B");
  }
  if(code === 79) { // 'L'
    Joy1data |= (1<<2);
    console.log("select");
  }
  if(code === 107) { // Plus
    delay+=10;
    console.log("Delay "+delay+"ms");
  }
  
  if(code === 106) { // Minus
    delay-=10;
    if(delay < 0) delay = 0;
    console.log("Delay "+delay+"ms");    
  }
  system.Joy1data = Joy1data;
}
function handleKeyUp(e) {
  var code = e.keyCode;
  if(code === 13) { // Start
    Joy1data &= (1<<3)^0xff;
    console.log("Start");
  }
  if(code === 39) { // Right
    Joy1data &= (1<<7)^0xff;
    console.log("Right");
  }
  if(code === 37) { // Left
    Joy1data &= (1<<6)^0xff;
    console.log("Left");
  }
  if(code === 40) { // Down
    Joy1data &= (1<<5)^0xff;
    console.log("Down");
  }
  if(code === 38) { // Up
    Joy1data &= (1<<4)^0xff;
    console.log("Up");
  }
  if(code === 90) { // 'Z'  
    Joy1data &= (1<<0)^0xff;
    console.log("A");
  }
  if(code === 88) { // 'X'
    Joy1data &= (1<<1)^0xff;
    console.log("B");
  }
  if(code === 79) { // 'L'
    Joy1data &= (1<<2)^0xff;
    console.log("select");
  }
  system.Joy1data = Joy1data;
}


// Texture
const WIDTH = 256, HEIGHT = 256;
const pixels = new Uint8Array(WIDTH * HEIGHT * 4);
const pitch = WIDTH * 4;

function draw() {
 pixels = system.ppu_draw(pixels);
 imageData();
}

function imageData() {  
  var id = ctx.getImageData(0, 0, 256, 256);
  var canvas_pixels = id.data;
  for(var i = 0; i < 256*256*4; i++) canvas_pixels[i] = pixels[i];
  ctx.putImageData(id, 0, 0);
}

async function main(binaryData)
{
  await system.mainloop(binaryData);
}


function load(url, callback) {
  var xhr = new XMLHttpRequest();

  xhr.onreadystatechange = function() {
    if (xhr.readyState === 4) {
      InitSystem();
      main(new Uint8Array(xhr.response));      
    }
  }
  xhr.responseType="arraybuffer";
  xhr.open('GET', url, true);
  xhr.send('');
}

var system = new fnes();
load("./arkanoid.nes", main);





