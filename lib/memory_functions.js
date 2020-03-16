const constants = require('./constants');
const {byteToSigned, byteToUnsigned} = require("./tool_functions");


exports.vram_map = function(addr) {
  if(addr === 0x3F10 || addr === 0x3F14 || addr === 0x3F18|| addr === 0x3F1C) return addr-0x10;
  if(this.mirroring) {
    if(addr >= 0x2800 && addr < 0x3000) return addr - 0x800;
  } else {
    if(addr >= 0x2400 && addr < 0x2800) return addr - 0x400;
    if(addr >= 0x2c00 && addr < 0x3000) return addr - 0x400;
  }
  if(addr >= 0x3000 && addr < 0x3f00) return addr-0x1000;
  if(addr >= 0x3f20 && addr < 0x4000) return addr-0x20;
  return addr;
}

// Memory mirroring in NES
exports.map_memory=function(addr) {
  var temp_addr = addr;
  if(temp_addr >= 0x0800 && temp_addr < 0x1000) {
    temp_addr -= 0x800;
    //console.log("Map "+Number(addr).toString(16)+" -> "+Number(temp_addr).toString(16));
  } else if(addr >= 0x1000 && addr < 0x17ff) {
    temp_addr -= 0x1000;
    //console.log("Map "+Number(addr).toString(16)+" -> "+Number(temp_addr).toString(16));
  } else if(addr >= 0x1800 && addr < 0x2000) {
    temp_addr -= 0x1800;
    //console.log("Map "+Number(addr).toString(16)+" -> "+Number(temp_addr).toString(16));
  } else if(temp_addr >= 0x2000 && temp_addr < 0x4000) {
    if(temp_addr >= 0x2008) {
      if (temp_addr & 0xf < 0x7) {
        temp_addr -= 8;
      }
      temp_addr=0x2000+(temp_addr%8);
      //console.log("Map "+Number(addr).toString(16)+" -> "+Number(temp_addr).toString(16));
    }


  }
  return temp_addr;
}

exports.read_memory=function(addr) {
  addr = this.map_memory(addr);

  this.bytes_read++;
  if(addr === constants.OAMDATA) {
    return this.oam[this.oamaddr];
  } else if(addr === constants.PPUDATA) {
    var val = 0;
    if(addr <= 0x3eff) {
      val = this.ppudata;
      this.ppudata=this.memory_ppu[this.vram_map(this.vram_addr)];
    } else {
     val=this.memory_ppu[this.vram_map(this.vram_addr)];
     this.ppudata = val;
    }
    const increment = (this.memory_cpu[0x2000]&0x4)?32:1;
    this.vram_addr+=increment;
    return val;
  } else if(addr === constants.PPUSTATUS) {
    //console.log("PPUSTATUS Read")
    this.ppu_addr_toggle = 0;
    var oldStatus = this.memory_cpu[constants.PPUSTATUS];
    this.memory_cpu[constants.PPUSTATUS] &= 0x7f;
    return oldStatus;
  } else if(addr === 0x4016) {
    //console.log("$4016 Read");
    var joyState = this.joy1_next;
    this.joy1_next++;
    if(this.joy1_next===8) this.joy1_next=0;
    return 0x40|((byteToUnsigned(this.Joy1data)>>joyState)&1);
  }

  return this.memory_cpu[addr];
}
exports.write_memory=function(addr, byte) {
  addr = this.map_memory(addr);

  if(this.mapper == 2) {
    if(addr >= 0x8000) {
      for (var i = 0; i < 0x4000; i++) this.memory_cpu[0x8000 + i] = this.full_prg_memory[byte*0x4000+i];
      return true;
    }
  }

  if(addr === constants.PPUCTRL) {
    //console.log("$"+Number(this.PC).toString(16)+" Writing byte "+Number(byte).toString(16)+" to PPU control");
  } else if(addr === constants.PPUSCROLL) {
    this.ppu_addr_toggle = this.ppu_addr_toggle?0:1;
    if(this.ppu_addr_toggle) this.ppu_scroll_x = byte;
    else this.ppu_scroll_y = byte;

    if(!this.ppu_addr_toggle) {
      //console.log("PPUSCROLL: "+this.ppu_scroll_x+","+this.ppu_scroll_y+ " Scroll: "+(this.memory_cpu[0x2000]&3));
    }
  } else if(addr === constants.PPUADDR) {
    this.ppu_addr_toggle=this.ppu_addr_toggle?0:1;
    if(this.ppu_addr_toggle) byte&=0x3f;
    this.vram_addr = (this.vram_addr&(this.ppu_addr_toggle?0x00ff:0xff00))|(byteToUnsigned(byte)<<(this.ppu_addr_toggle?8:0));
    if(!this.ppu_addr_toggle) {
      //console.log("PPUADDR: 0x"+Number(this.vram_addr).toString(16));
    }
    return true;
  } else if(addr === constants.PPUDATA) {
    const increment = (this.memory_cpu[0x2000]&0x4)?32:1;
    this.vram_addr+=increment;
    this.memory_ppu[this.vram_map(this.vram_addr)] = byte;
    return true;
  } else if(addr === constants.OAMADDR) {
    //console.log("OAM addr");
    this.oamaddr = byte;
    return true;
  } else if(addr === constants.OAMDATA) {
    console.log("OAM data");
    this.oam[(this.oamaddr++)&0xff] = byte;
    return true;
  } else if(addr >= 0x2001 && addr <= 0x2007) {
    //console.log("Writing byte "+Number(byte).toString(16)+" to "+Number(addr).toString(16));
  } else if(addr === 0x4010) {
    console.log("APU DMC to "+Number(byte).toString(16));
  } else if(addr === 0x4017) {
    //console.log("APU Frame Counter to "+Number(byte).toString(16));
  } else if(addr === 0x4014) { // DMA
    this.cycles+=513;
    for(var i = 0; i < 256; i++) this.oam[i] = this.memory_cpu[0x100*byte+i];
    return true;
    //console.log("DMA Write: "+Number(byte).toString(16));
  } else if(addr === 0x4016) {
    if(byte === 0)
      this.joy1_next = 0;
  }

  this.bytes_written++;
  this.memory_cpu[addr] = byte;
  return true;
}