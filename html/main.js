

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

var tempTile = new Uint8Array(8*8);

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
   var startTime;
  if(system.parseHeader(binaryData)) {
    var running = true;
    var tempcycles = 0;
    setInterval(draw, 10);
    startTime = new Date();
    while(running) {
      if(!system.cpu6502_one_op()) break;
      if(!system.run_ppu()) break;
      if(system.cycles-tempcycles > 100000) {
        tempcycles = system.cycles;
        temp_endtime = new Date();
        var difftime = (temp_endtime-startTime)-(0.1/1.79)*1000;
        if(difftime > 0) difftime = 0;
        await new Promise(resolve => setTimeout(resolve, (-difftime)+delay));
        startTime = temp_endtime;
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





