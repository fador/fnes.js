
var fs = require('fs');
const fnes = require('./fnes_system').fnes;
const NS = require('node-sdl2');
const SDL = NS.require('SDL');
const SDL_render = NS.require('SDL_render');
const SDL_pixels = NS.require('SDL_pixels');

// Test app begin
const App = NS.createAppWithFlags(SDL.SDL_InitFlags.SDL_INIT_EVERYTHING);

var render_ppu_nametable = false;
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
    render_ppu_nametable = render_ppu_nametable?false:true
    console.log("Render Sprite = "+render_ppu_nametable);
  }
  if(key.scancode === 7) { // 'D'
    debugMode = debugMode?false:true
    system.debug = debugMode?DEBUG_OPS:0;
    console.log("Debug mode = "+debugMode);
  }
  if(key.scancode === 40) { // Start
    Joy1data = (1<<3);
    console.log("Start");
  }
  if(key.scancode === 79) { // Right
    Joy1data = (1<<7);
    console.log("Right");
  }
  if(key.scancode === 80) { // Left
    Joy1data = (1<<6);
    console.log("Left");
  }
  if(key.scancode === 81) { // Down
    Joy1data = (1<<5);
    console.log("Down");
  }
  if(key.scancode === 82) { // Up
    Joy1data = (1<<4);
    console.log("Up");
  }
  if(key.scancode === 12) { // 'I''
                            //Generate an interrupt
    system.cycles += 2;
    var addr = system.PC;
    system.push_stack((addr & 0xff00) >> 8);
    system.push_stack(addr & 0xff);
    system.push_stack(system.P);
    system.P |= (1 << 2); // Interrupt disable
    system.PC = system.load_abs_addr(0xFFFE);
    console.log("IRQ $" + Number(system.PC).toString(16) + " From $" + Number(addr).toString(16) + " Stack: " + Number(system.S + 3).toString(16));
  }

  system.Joy1data = Joy1data;
});

win.on('keyup', (key) => {
  Joy1data = 0;
  system.Joy1data = Joy1data;
});


// Texture
const WIDTH = 256, HEIGHT = 256;
const texture = win.render.createTexture(
  WIDTH, HEIGHT, SDL_pixels.PixelFormat.ABGR8888, SDL_render.SDL_TextureAccess.SDL_TEXTUREACCESS_STREAMING);
const pixels = new Uint8Array(WIDTH * HEIGHT * 4);
const pitch = WIDTH * 4;

var tempTile = Buffer.alloc(8*8);

function getTile(index, table) {
  var base_index = table + index*16;
  for(var y = 0; y < 8; y++) {
    for (var x = 0; x < 8; x++) {
      var byte = ((system.memory_ppu[base_index + y] >> (7 - x)) & 1) ? 1 : 0;
      byte += ((system.memory_ppu[base_index + y + 8] >> (7 - x)) & 1) ? 2 : 0;
      tempTile[y*8+x] = byte;
    }
  }
  return tempTile;
}

function getColor(pixel,palette,sprite) {
  return system.memory_ppu[0x3F01+pixel+(palette<<2)+(sprite<<4)];
}

function draw() {

  if (!render_ppu_nametable) {

    var oam = (system.memory_cpu[0x2001] >> 4) & 1;
    var background = (system.memory_cpu[0x2001] >> 3) & 1;
    if (background) {
      var tiles = 32 * 30;
      var nametables = system.mirroring?[0x2000, 0x2400, 0x2000, 0x2400]:[0x2000, 0x2000, 0x2800, 0x2800];

      const tileTable = nametables[system.memory_cpu[0x2000] & 3];
      const palette_addr = tileTable + 0x3C1;

      const selected_tile_table = system.memory_cpu[0x2000] & (1 << 3) ? 0:0x1000;
      const background_color_list = [0x1f, 0x11, 0x19, 0x00, 0x16];
      const background_color = system.color_map[background_color_list[(system.memory_cpu[0x2001]>>5)&0x7]];

      for (let i = 0; i < tiles; ++i) {
        var sprite = system.memory_ppu[tileTable + i];
        var tile = getTile(sprite, selected_tile_table);
        var tilerow = Math.floor(i / 32);
        var tilecol = Math.floor(i % 32);

        var colorTable = system.memory_ppu[palette_addr + (Math.floor(tilerow / 4) * 8) + Math.floor(tilecol / 4)];
        var colors = (colorTable >> ((Math.floor((tilerow / 2)) & 1) * 4 + (Math.floor((tilecol / 2)) & 1)*2)) & 0x3;

        for (var y = 0; y < 8; y++) {
          for (var x = 0; x < 8; x++) {
            var index = ((tilerow * 8 + y) * 256 + (tilecol * 8) + x) * 4;
            var color = getColor(tile[y * 8 + x], colors, 0);
            var pixel;
            if(tile[y * 8 + x] != 0) {
              pixel = system.color_map[color];
            } else {
              pixel = background_color;
            }
            pixels[index] = pixel[0];
            pixels[index + 1] = pixel[1];
            pixels[index + 2] = pixel[2];
            pixels[index + 3] = 255;

          }
        }
      }
    }

    if (oam) {
      for (var i = 0; i < 256; i += 4) {
        var y_pos = system.oam[i];
        var sprite = system.oam[i + 1];
        var x_pos = system.oam[i + 3];
        var attributes = system.oam[i + 2];

        const spriteSize = (system.memory_cpu[0x2000] & (1 << 5))?1:0;

        const spriteTables = [0x0000,0x1000];
        const spriteTable = spriteTables[(system.memory_cpu[0x2000] & (1 << 3))?1:0];

        const flip_y = (attributes&0x80)?1:0;
        const flip_x = (attributes&0x40)?1:0;

        var tile = getTile(sprite, spriteTable);
        for (var y = 0; y < 8; y++) {
          for (var x = 0; x < 8; x++) {
            var index = ((y_pos + y) * 256 + (x_pos) + x) * 4;
            //var pixel = tile[y * 8 + x] * 128;
            var tileColor = tile[(flip_y?(7-y):y) * 8 + (flip_x?(7-x):x)];
            var color = getColor(tileColor, attributes&3, 1);
            if(tileColor) {
              var pixel = system.color_map[color];
              pixels[index] = pixel[0];
              pixels[index + 1] = pixel[1];
              pixels[index + 2] = pixel[2];
              pixels[index + 3] = 255;
            }
          }
        }
      }
    }

  } else {
    var tiles = 32 * 30;
    const tileTable = 0x2000;
    const palette = tileTable + 0x3C0;


    for (let i = 0; i < tiles; ++i) {
      var tile = getTile(i, 0);
      var tilerow = Math.floor(i / 32);
      var tilecol = Math.floor(i % 32);

      var colorTable = system.memory_ppu[palette + ((tilerow / 4) * 8) + (tilecol / 4)];
      var colors = (colorTable >> (((tilerow / 2) & 1) * 4 + ((tilecol / 2) & 1))) & 0x3;

      for (var y = 0; y < 8; y++) {
        for (var x = 0; x < 8; x++) {
          var index = ((tilerow * 8 + y) * 256 + (tilecol * 8) + x) * 4;
          var pixel = system.color_map[getColor(tile[y * 8 + x], colors, 0)];
          pixels[index] = pixel[0];
          pixels[index + 1] = pixel[1];
          pixels[index + 2] = pixel[2];
          pixels[index + 3] = 255;
        }
      }
    }
  }

  // Show palette
  for(var palette_table = 0; palette_table< 4; palette_table++) {
    for (var palette_idx = 0; palette_idx < 4; palette_idx++) {
      for (var y = 0; y < 10; y++) {
        for (var x = 0; x < 10; x++) {
          var index = ((240 + y) * 256 + (palette_idx * 8+palette_table*32) + x) * 4;
          var pixel = system.color_map[getColor(palette_idx, palette_table, 0)];
          pixels[index] = pixel[0];
          pixels[index + 1] = pixel[1];
          pixels[index + 2] = pixel[2];
          pixels[index + 3] = 255;
        }
      }
    }
  }

  texture.update(null, pixels, pitch);
  win.render.copy(texture, null, null);
  win.render.present();
}


var system = new fnes();

/*
process.on('SIGINT', function() {
  console.log("Caught interrupt signal");
  system.debug();
  process.exit(0);
});
*/

async function main()
{

  var binaryData = fs.readFileSync('./test/arkanoid.nes');
  if(system.parseHeader(binaryData)) {
    var running = true;
    var tempcycles = 0;
    while(running) {
      if(!system.run()) break;
      if(!system.run_ppu()) break;
      if(system.cycles-tempcycles > 100000) {
        tempcycles = system.cycles;
        await new Promise(resolve => setTimeout(resolve, 10));
        if(system.cycles < 200000) {
          console.log("Palette:" +Number(getColor(0, 0, 0)).toString(16));
          console.log("Palette:" +Number(getColor(1, 0, 0)).toString(16));
          console.log("Palette:" +Number(getColor(2, 0, 0)).toString(16));
          console.log("Palette:" +Number(getColor(3, 0, 0)).toString(16));
        }
      }
    }
    system.debug_print();
  } else {
    console.log("ROM failure: header not valid");
  }


}

main();

setInterval(draw, 10);