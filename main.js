
var fs = require('fs');
const fnes = require('./lib/fnes_system').fnes;
const NS = require('node-sdl2');
const SDL = NS.require('SDL');
const SDL_render = NS.require('SDL_render');
const SDL_pixels = NS.require('SDL_pixels');

// Test app begin
const App = NS.createAppWithFlags(SDL.SDL_InitFlags.SDL_INIT_EVERYTHING);


var debugMode = false;
var Joy1data = 0;
const DEBUG_OPS = 1<<0;
const DEBUG_MEMORY = 1<<1;

// Test window begin
const Window = NS.window;
const win = new Window({
  title: 'fNES.js',
  w: 256 * 2,
  h: 256 * 2,
});
win.on('close', function() {
  App.quit()
});
win.on('keydown', (key) => {
  if (key.scancode === 41)  // Escape
    return App.quit();
  if(key.scancode === 44) { // Space
    system.render_ppu_nametable = system.render_ppu_nametable?false:true
    //console.log("Render Sprite = "+system.render_ppu_nametable);
  }
  if(key.scancode === 7) { // 'D'
    debugMode = debugMode?false:true
    system.debug = debugMode?DEBUG_OPS:0;
    //console.log("Debug mode = "+debugMode);
  }
  if(key.scancode === 40) { // Start
    Joy1data |= (1<<3);
    //console.log("Start");
  }
  if(key.scancode === 79) { // Right
    Joy1data |= (1<<7);
    //console.log("Right");
  }
  if(key.scancode === 80) { // Left
    Joy1data |= (1<<6);
    //console.log("Left");
  }
  if(key.scancode === 81) { // Down
    Joy1data |= (1<<5);
    //console.log("Down");
  }
  if(key.scancode === 82) { // Up
    Joy1data |= (1<<4);
    //console.log("Up");
  }

  if(key.scancode === 29) { // 'Z'
    Joy1data |= (1<<0);
    //console.log("A");
  }
  if(key.scancode === 27) { // 'X'
    Joy1data |= (1<<1);
    //console.log("B");
  }
  if(key.scancode === 15) { // 'L'
    Joy1data |= (1<<2);
    //console.log("select");
  }

  if(key.scancode === 87) { // Plus
    system.extradelay+=10;
    //console.log("Delay "+system.extradelay+"ms");
  }

  if(key.scancode === 86) { // Minus
    system.extradelay-=10;
    if(system.extradelay < 0) system.extradelay = 0;
    //console.log("Delay "+system.extradelay+"ms");
  }

  if(key.scancode === 12) { // 'I''
                            //Generate an interrupt
    system.nmi = true;
  }

  system.Joy1data = Joy1data;
});

win.on('keyup', (key) => {
  if(key.scancode === 40) { // Start
    Joy1data &= (1<<3)^0xff;
    //console.log("Start");
  }
  if(key.scancode === 79) { // Right
    Joy1data &= (1<<7)^0xff;
    //console.log("Right");
  }
  if(key.scancode === 80) { // Left
    Joy1data &= (1<<6)^0xff;
    //console.log("Left");
  }
  if(key.scancode === 81) { // Down
    Joy1data &= (1<<5)^0xff;
    //console.log("Down");
  }
  if(key.scancode === 82) { // Up
    Joy1data &= (1<<4)^0xff;
    //console.log("Up");
  }
  if(key.scancode === 29) { // 'Z'
    Joy1data &= (1<<0)^0xff;
    //console.log("A");
  }
  if(key.scancode === 27) { // 'X'
    Joy1data &= (1<<1)^0xff;
    //console.log("B");
  }
  if(key.scancode === 15) { // 'L'
    Joy1data &= (1<<2)^0xff;
    //console.log("select");
  }
  system.Joy1data = Joy1data;
});


// Texture
const WIDTH = 256, HEIGHT = 256;
const texture = win.render.createTexture(
  WIDTH, HEIGHT, SDL_pixels.PixelFormat.ABGR8888, SDL_render.SDL_TextureAccess.SDL_TEXTUREACCESS_STREAMING);
var pixels = new Uint8Array(WIDTH * HEIGHT * 4);
const pitch = WIDTH * 4;

// Audio.
const SDL_audio = NS.require('SDL_audio');
const audio = NS.audio.create();
const options = {
  freq: 22000,
  channels: 1,
  format: SDL_audio.SDL_AudioFormatFlag.AUDIO_F32,
  samples: 480,
};

/// Play sine wave.
const tone = 440  // Hz
let counter = 0;
var audioInit = false;
/*
audio.openAudioDevice(options, (arrayBuffer) => {
  if(!audioInit) return;
  const array = new Float32Array(arrayBuffer);
  const len = array.length;
  const sampleRate = audio.spec.freq;
  system.apu_audio_sample(sampleRate,array);
});
*/
function draw()
{
  audioInit=true;
  system.ppu_draw(pixels);
  texture.update(null, pixels, pitch);
  win.render.copy(texture, null, null);
  win.render.present();
}

var system = new fnes();

async function main()
{
  var binaryData = fs.readFileSync('./test/arkanoid.nes');
  setInterval(draw, 10);
  await system.mainloop(binaryData);
}

main();

