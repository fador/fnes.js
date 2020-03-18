

var canvas;
var ctx;
var canvasWidth;
var canvasHeight;
var id;

const fnes = require("../lib/fnes_system.js").fnes;

function InitSystem() {
  canvas = document.getElementById('canvas');
  ctx = canvas.getContext('2d');
  canvasWidth = canvas.width;
  canvasHeight = canvas.height;
  id = ctx.getImageData(0, 0, 1, 1);

}
const DEBUG_OPS = 1<<0;
var debugMode = false;
var Joy1data = 0;

document.addEventListener('keydown',handleKeyDown,false);
document.addEventListener('keyup',handleKeyUp,false);
function handleKeyDown(e) {
   var code = e.keyCode;
  if(code === 32) { // Space
    system.render_ppu_nametable = system.render_ppu_nametable?false:true
    console.log("Render Sprite = "+system.render_ppu_nametable);
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
    system.extradelay+=10;
    console.log("Delay "+system.extradelay+"ms");
  }
  
  if(code === 106) { // Minus
    system.extradelay-=10;
    if(system.extradelay < 0) system.extradelay = 0;
    console.log("Delay "+system.extradelay+"ms");    
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

var audioCtx = new (window.AudioContext || window.webkitAudioContext)();

// Create an empty two second stereo buffer at the
// sample rate of the AudioContext
var frameCount = 480;
var myArrayBuffer = audioCtx.createBuffer(1, frameCount, audioCtx.sampleRate);

function draw() {
  
  var array = myArrayBuffer.getChannelData(0);
  system.apu_audio_sample(audioCtx.sampleRate,array);
  // Get an AudioBufferSourceNode.
  // This is the AudioNode to use when we want to play an AudioBuffer
  var source = audioCtx.createBufferSource();
  // set the buffer in the AudioBufferSourceNode
  source.buffer = myArrayBuffer;
  // connect the AudioBufferSourceNode to the
  // destination so we can hear the sound
  source.connect(audioCtx.destination);
  // start the source playing
  source.start();
 system.ppu_draw(pixels);
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
  setInterval(draw, 10);
  await system.mainloop(binaryData);
}


function load(url, callback) {
  var xhr = new XMLHttpRequest();

  xhr.onreadystatechange = function() {
    if (xhr.readyState === 4) {
      if(xhr.response !== "") {
        InitSystem();
        main(new Uint8Array(xhr.response));      
      }
    }
  }
  xhr.responseType="arraybuffer";
  xhr.open('GET', url, true);
  xhr.send('');
}

var system = new fnes();
load("./arkanoid.nes", main);

function handleFileSelect(evt) {
    var files = evt.target.files; // FileList object
    var file = files[0];
    console.log("Loading file "+file);
    var reader = new FileReader();
    reader.readAsArrayBuffer(file);
    reader.onloadend = function () {  
      InitSystem();
      system.running = false;      
      main(new Uint8Array(reader.result));
    };
}

setTimeout(function(){document.getElementById('nesfile').addEventListener('change', handleFileSelect, false);},1000);



