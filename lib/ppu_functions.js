
const {byteToSigned, byteToUnsigned} = require("./tool_functions");

var tempTile = Buffer.alloc(8*8);

exports.getTile = function(index, table) {
  var base_index = table + index*16;
  for(var y = 0; y < 8; y++) {
    var byte1 = this.memory_ppu[base_index + y];
    var byte2 = this.memory_ppu[base_index + y + 8]
    for (var x = 0; x < 8; x++) {
      tempTile[y*8+x] = ((byte1 >> (7 - x)) & 1)+(((byte2 >> (7 - x)) & 1)<<1);
    }
  }
  return tempTile;
}

exports.getColor = function(pixel,palette,sprite) {
  return this.memory_ppu[0x3F01+pixel+(palette<<2)+(sprite<<4)];
}

exports.ppu_draw = function(pixels) {
  for(var i = 0; i < 256*256*4;i++) pixels[i]=this.pixels[i];
};

exports.ppu_draw_internal = function(pixels) {

  if (!this.render_ppu_nametable) {

    const oam = (this.memory_cpu[0x2001] >> 4) & 1;
    const background = (this.memory_cpu[0x2001] >> 3) & 1;
    if (background) {
      const tiles = 32 * 30;
      const nametables = this.mirroring?[0x2000, 0x2400, 0x2000, 0x2400]:[0x2000, 0x2000, 0x2800, 0x2800];

      const tileTable = nametables[this.memory_cpu[0x2000] & 3];

      const background_color_list = [0x1f, 0x21, 0x19, 0x00, 0x16];
      const background_color = this.color_map[this.memory_ppu[0x3f00]];

      const selected_tile_table = (this.memory_cpu[0x2000] & (1 << 3)) ? 0:0x1000;

      for(var tilerow = 0; tilerow < 30; tilerow++)
      {
        for(var tilecol = Math.floor(this.ppu_scroll_x/8); tilecol < 32+Math.floor(this.ppu_scroll_x/8); tilecol++)
        {
          var tiletable_temp = tileTable;
          var tilecol_temp = tilecol;
          if (tilecol_temp >= 32) {
            tilecol_temp -= 32;
            if(tileTable===0x2000) tiletable_temp += 0x400;
            else tiletable_temp -= 0x400;
          }
          var sprite = this.memory_ppu[tiletable_temp + tilerow * 32 + tilecol_temp];
          var tile = this.getTile(sprite, selected_tile_table);
          const palette_addr = tiletable_temp + 0x3C1;

          var colorTable = this.memory_ppu[palette_addr + (Math.floor(tilerow / 4) * 8) + Math.floor(tilecol_temp / 4)];
          var colors = (colorTable >> ((Math.floor((tilerow / 2)) & 1) * 4 + (Math.floor((tilecol_temp / 2)) & 1) * 2)) & 0x3;

          tilecol_temp-=Math.floor(this.ppu_scroll_x/8);

          for (var y = 0; y < 8; y++) {
            for (var x = 0; x < 8; x++) {
              var index = ((tilerow * 8 + y - ((this.ppu_scroll_y & 7))) * 256 + (tilecol_temp * 8) + x - (this.ppu_scroll_x & 7)) * 4;
              var color = this.getColor(tile[y * 8 + x], colors, 0);
              var pixel;

              pixel = this.color_map[color & 0x3f];

              pixels[index] = pixel[0];
              pixels[index + 1] = pixel[1];
              pixels[index + 2] = pixel[2];
              pixels[index + 3] = 255;

            }
          }
        }
      }
    }

    if (oam) {
      for (var i = 0; i < 256; i += 4) {
        var y_pos = this.oam[i]+1;
        var sprite = this.oam[i + 1];
        var x_pos = this.oam[i + 3];
        var attributes = this.oam[i + 2];

        const spriteSize = (this.memory_cpu[0x2000] & (1 << 5))?1:0;

        const spriteTables = [0x0000,0x1000];
        const spriteTable = spriteTables[(this.memory_cpu[0x2000] & (1 << 3))?1:0];

        const flip_y = (attributes&0x80)?1:0;
        const flip_x = (attributes&0x40)?1:0;

        var tile = this.getTile(sprite, spriteTable);
        for (var y = 0; y < 8; y++) {
          for (var x = 0; x < 8; x++) {
            var index = ((y_pos + y) * 256 + (x_pos) + x) * 4;
            //var pixel = tile[y * 8 + x] * 128;
            var tileColor = tile[(flip_y?(7-y):y) * 8 + (flip_x?(7-x):x)];
            var color = this.getColor(tileColor, attributes&3, 1);
            if(tileColor) {
              var pixel = this.color_map[color&0x3f];
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
    var tiles = 256*2;

    for (let i = 0; i < tiles; ++i) {
      var tile = this.getTile(i, 0);
      var tilerow = Math.floor(i / 16);
      var tilecol = Math.floor(i % 16);

      for (var y = 0; y < 8; y++) {
        for (var x = 0; x < 8; x++) {
          var index = ((tilerow * 8 + y) * 256 + (tilecol * 8) + x) * 4;
          var pixel = this.color_map[this.getColor(tile[y * 8 + x], 0, 0)&0x3f];
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
          var pixel = this.color_map[this.getColor(palette_idx, palette_table, 0)&0x3f];
          pixels[index] = pixel[0];
          pixels[index + 1] = pixel[1];
          pixels[index + 2] = pixel[2];
          pixels[index + 3] = 255;
        }
      }
    }
  }
  return pixels;
}
