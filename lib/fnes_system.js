const {get_registers_string,print_op_info} = require("./debug_functions");
const {vram_map,map_memory,read_memory,write_memory} = require("./memory_functions");
const {byteToSigned, byteToUnsigned} = require("./tool_functions");
const {cpu6502_one_op} = require("./cpu_6502");
const {ines_parseHeader} = require("./fileformat_ines");
const {getTile,getColor,ppu_draw,ppu_draw_internal} = require("./ppu_functions");
const {apu_audio_sample} = require("./apu_functions");

const constants = require('./constants');

class NESHeader {

  constructor()
  {
    this.prg_size = 0;
    this.chr_size = 0;
    this.pal = false;
  }
}


class NESSystem {

  reset() {
    this.cycles = 7;
    this.ops = 0;
    this.S = 0xfd;
    this.P[0] = 0x24;
    this.A[0] = 0;
    this.X[0] = 0;
    this.Y[0] = 0;
  }

  constructor() {
    this.mapper = 0;
    this.full_prg_memory = null;
    this.running = false;

    this.extradelay=0;
    this.render_ppu_nametable = false;
    this.cycles_ppu_this_frame = 0;
    this.cycles_this_line = 0;
    this.ppu_scanline = -1;
    this.ppu_scroll_x = 0;
    this.ppu_scroll_x_per_line = new Uint8Array(256);
    this.ppu_x = 0;
    this.ppu_scroll_y = 0;
    this.ppu_scroll_toggle = 0;
    this.ppu_render = false;
    this.ppudata = 0;
    this.cycles_ppu = 0;
    this.ppu_addr_toggle=0;
    this.vram_addr=0;
    this.oam = new Uint8Array(0xff);
    this.oamaddr = 0;
    this.joy1_next = 0;
    this.Joy1data = 0;

    this.mirroring = 0;

    this.nmi = false;
    this.bytes_read = 0;
    this.bytes_written = 0;
    this.debug = 0;//constants.DEBUG_OPS;
    this.cycles = 7;
    this.ops = 0;
    this.PC = 0x8000;
    this.S = 0xfd;
    this.P = new Uint8Array(1);
    this.P[0] = 0x24;
    this.A = new Uint8Array(1);
    this.X = new Uint8Array(1);
    this.Y = new Uint8Array(1);
    this.header = new NESHeader();
    this.memory_cpu = new Uint8Array(0xffff);
    this.memory_ppu = new Uint8Array(0x3fff);

    this.memory_cpu[0x4017] = 0x40; //APU Interrupt disable
    this.temp_regstate = "";
    this.temp_load_addr = 0;

    this.color_map = new Array(0x3f);
    this.pixels = new Uint8Array(256 * 256 * 4);

    this.init_palette();

    // Map external functions
    // Debug
    NESSystem.prototype.get_registers_string=get_registers_string.bind(this);
    NESSystem.prototype.print_op_info=print_op_info.bind(this);

    //Memory
    NESSystem.prototype.map_memory=map_memory.bind(this);
    NESSystem.prototype.read_memory=read_memory.bind(this);
    NESSystem.prototype.write_memory=write_memory.bind(this);
    NESSystem.prototype.vram_map=vram_map.bind(this);

    // CPU
    NESSystem.prototype.cpu6502_one_op=cpu6502_one_op.bind(this);

    //PPU
    NESSystem.prototype.getTile=getTile.bind(this);
    NESSystem.prototype.getColor=getColor.bind(this);
    NESSystem.prototype.ppu_draw=ppu_draw.bind(this);
    NESSystem.prototype.ppu_draw_internal=ppu_draw_internal.bind(this);

    // Headers
    NESSystem.prototype.ines_parseHeader=ines_parseHeader.bind(this);

    // APU
    NESSystem.prototype.apu_audio_sample=apu_audio_sample.bind(this);
  }

  init_palette() {
    this.color_map = [
      [0x52,0x52,0x52], // 0x0
      [0x01,0x1A,0x51], // 0x1
      [0x0F,0x0F,0x65], // 0x2
      [0x23,0x06,0x63], // 0x3
      [0x36,0x03,0x4B], // 0x4
      [0x40,0x04,0x26], // 0x5
      [0x3F,0x09,0x04], // 0x6
      [0x32,0x13,0x00], // 0x7
      [0x1F,0x20,0x00], // 0x8
      [0x0B,0x2A,0x00], // 0x9
      [0x00,0x2F,0x00], // 0xa
      [0x00,0x2E,0x0A], // 0xb
      [0x00,0x26,0x2D], // 0xc
      [0x00,0x00,0x00], // 0xd
      [0x00,0x00,0x00], // 0xe
      [0x00,0x00,0x00], // 0xf
      [0xA0,0xA0,0xA0], // 0x10
      [0x1E,0x4A,0x9D], // 0x11
      [0x38,0x37,0xBC], // 0x12
      [0x58,0x28,0xB8], // 0x13
      [0x75,0x21,0x94], // 0x14
      [0x84,0x23,0x5C], // 0x15
      [0x82,0x2E,0x24], // 0x16
      [0x6F,0x3F,0x00], // 0x17
      [0x51,0x52,0x00], // 0x18
      [0x31,0x63,0x00], // 0x19
      [0x1A,0x6B,0x05], // 0x1a
      [0x0E,0x69,0x2E], // 0x1b
      [0x10,0x5C,0x68], // 0x1c
      [0x00,0x00,0x00], // 0x1d
      [0x00,0x00,0x00], // 0x1e
      [0x00,0x00,0x00], // 0x1f
      [0xFE,0xFF,0xFF], // 0x20
      [0x69,0x9E,0xFC], // 0x21
      [0x89,0x87,0xFF], // 0x22
      [0xAE,0x76,0xFF], // 0x23
      [0xCE,0x6D,0xF1], // 0x24
      [0xE0,0x70,0xB2], // 0x25
      [0xDE,0x7C,0x70], // 0x26
      [0xC8,0x91,0x3E], // 0x27
      [0xA6,0xA7,0x25], // 0x28
      [0x81,0xBA,0x28], // 0x29
      [0x63,0xC4,0x46], // 0x2a
      [0x54,0xC1,0x7D], // 0x2b
      [0x56,0xB3,0xC0], // 0x2c
      [0x3C,0x3C,0x3C], // 0x2d
      [0x00,0x00,0x00], // 0x2e
      [0x00,0x00,0x00], // 0x2f
      [0xFE,0xFF,0xFF], // 0x30
      [0xBE,0xD6,0xFD], // 0x31
      [0xCC,0xCC,0xFF], // 0x32
      [0xDD,0xC4,0xFF], // 0x33
      [0xEA,0xC0,0xF9], // 0x34
      [0xF2,0xC1,0xDF], // 0x35
      [0xF1,0xC7,0xC2], // 0x36
      [0xE8,0xD0,0xAA], // 0x37
      [0xD9,0xDA,0x9D], // 0x38
      [0xC9,0xE2,0x9E], // 0x39
      [0xBC,0xE6,0xAE], // 0x3a
      [0xB4,0xE5,0xC7], // 0x3b
      [0xB5,0xDF,0xE4], // 0x3c
      [0xA9,0xA9,0xA9], // 0x3d
      [0x00,0x00,0x00], // 0x3e
      [0x00,0x00,0x00], // 0x3f
    ];
  }

  push_stack(byte) {
    this.write_memory(0x100+this.S, byte);
    this.S--;
  }
  pop_stack() {
    this.S++;
    return this.read_memory(0x100+this.S);
  }

  load_abs_addr(addr) {
    return byteToUnsigned(this.read_memory(addr))+ (byteToUnsigned(this.read_memory(addr+1))<<8);
  }

  load_abs_addr_zeropage(addr) {
    return byteToUnsigned(this.read_memory(addr&0xff))+ (byteToUnsigned(this.read_memory((addr+1)&0xff))<<8);
  }


  get_flag_zero() { return !!(this.P[0] & 0x2); }
  get_flag_carry() { return !!(this.P[0] & 0x1); }
  get_flag_negative() { return !!(this.P[0] & 0x80); }
  get_flag_overflow() { return !!(this.P[0] & 0x40); }

  set_flag_zero(bit) {
    this.P[0] = (this.P[0] & 0xfd) + ((bit)?2:0);
  }
  set_flag_carry(bit) {
    this.P[0] = (this.P[0] & 0xfe) + ((bit)?1:0);
  }
  set_flag_negative(bit) {
    this.P[0] = (this.P[0] & 0x7f) + (bit?0x80:0);
  }
  set_flag_overflow(bit) {
    this.P[0] = (this.P[0] & 0xbf) + (bit?0x40:0);
  }

  set_negative_zero(val) {
    this.set_flag_zero(val === 0);
    this.set_flag_negative(val&0x80);
  }

  get_addr_absolute() {
    var addr;
    addr = this.load_abs_addr(this.PC + 1);
    this.PC += 2;
    return addr;
  }

  get_addr_indirect() {
    var fetch_addr = this.get_addr_absolute(this.PC+1);
    this.PC += 2;
    return this.get_addr_absolute(fetch_addr);
  }

  get_imm() {
    var imm;
    imm = this.read_memory(this.PC + 1);
    this.PC++;
    return imm;
  }

  get_addr_zero_page() {
    var addr;
    addr = this.read_memory(this.PC + 1);
    this.PC++;
    return addr;
  }

  debug_print() {
    console.log("A:" + this.A[0].toString(16)+" X:" + this.X[0].toString(16)+" Y:" + this.Y[0].toString(16)+" PC " + this.PC.toString(16) + ": " + this.memory_cpu[this.PC].toString(16));
    console.log("Cycles/ops processed: " + this.cycles+" / "+this.ops);
    console.log("Status: " + this.P.toString(2));
    console.log("Bytes read / written: "+this.bytes_read + " / "+this.bytes_written);
  }

  adc(val) {
    var temp = Number(this.A[0]) + val + (this.get_flag_carry()?1:0);
    this.set_flag_overflow(((this.A[0]^temp) & (val ^ temp) & 0x80) == 0x80);
    //console.log("ADC temp: "+temp);
    this.set_flag_carry((temp>>8)?1:0);
    this.A[0] = temp&0xff;
    this.set_negative_zero(this.A[0]);
  }

  run_ppu() {
    while(this.cycles_ppu < this.cycles*3) {
      //this.nmi = false;

      // Set PPU NMI bit at the beginning of vsync "NMI_occurred"
      if(this.ppu_scanline===240 && this.cycles_this_line === 0) {
        this.ppu_draw_internal(this.pixels);
        //console.log("VSync "+this.cycles);
        this.memory_cpu[constants.PPUSTATUS] &= (0x40)^0xff;
        this.memory_cpu[constants.PPUSTATUS] |= 0x80;
      }

      // Generate NMI when "NMI_occurred" and "NMI_output"
      if(this.ppu_scanline>=241 && this.ppu_scanline<260) {
        if (this.memory_cpu[constants.PPUSTATUS] & 0x80 && this.memory_cpu[constants.PPUCTRL] & 0x80) {
          this.memory_cpu[constants.PPUCTRL] &= 0x7f;
          this.nmi = true;
        }
      }

      // End Vsync
      if(this.ppu_scanline===260 && this.cycles_this_line === 0) {
        this.memory_cpu[constants.PPUSTATUS] &= 0x7f;
        //console.log("VSync over "+this.cycles );
      }
      if(this.ppu_scanline===1) {

        this.memory_cpu[constants.PPUSTATUS] |= (1<<4);
      } else {
        this.memory_cpu[constants.PPUSTATUS] &= (1<<4)^0xff;
      }
      if(this.ppu_scanline===30 && this.cycles_this_line === 0) {
         this.memory_cpu[constants.PPUSTATUS] |= 0x40;
      }


      if(this.ppu_scanline>0 && this.ppu_scanline<240) this.ppu_scroll_x_per_line[this.ppu_scanline] = this.ppu_scroll_x;
      this.cycles_ppu++;
      this.cycles_ppu_this_frame++;
      this.cycles_this_line++;
      if(this.cycles_this_line === constants.PPU_CYCLES_PER_LINE) {
        this.cycles_this_line = 0;
        this.ppu_scanline++;
        if(this.ppu_scanline === 261) {
          // If frame interrupts enabled
          if(this.memory_cpu[0x4017]&0x40 === 0 && this.P&(1<<2) === 0) {
            //Generate an interrupt
            this.cycles+=2;
            var addr = this.PC;
            this.push_stack((addr&0xff00)>>8);
            this.push_stack(addr&0xff);
            this.push_stack(this.P);
            this.P |= (1<<2); // Interrupt disable
            this.PC = this.load_abs_addr(0xFFFE);
            console.log("IRQ $"+Number(this.PC).toString(16)+ " From $"+Number(addr).toString(16)+" Stack: "+Number(this.S+3).toString(16));
          }
          this.ppu_scanline=-1;
          this.cycles_ppu_this_frame=0;
        }
      }
    }

    return 1;
  }

  set_processor_status(val) {
    this.P[0] = (val|0x20)&0xef;
  }
  get_processor_status() {
    return this.P[0]|0x10;
  }

  read_indirect_x() {
    var imm = this.get_imm();
    var load_addr = byteToUnsigned(imm)+this.X[0];
    var value_addr = this.load_abs_addr_zeropage(load_addr);
    this.temp_load_addr = value_addr;
    return this.read_memory(value_addr);
  }

  write_indirect_x(val) {
    var imm = this.get_imm();
    var load_addr = byteToUnsigned(imm) + this.X[0];
    var store_addr = this.load_abs_addr_zeropage(load_addr);
    this.write_memory(store_addr, val);
    this.temp_load_addr = load_addr;
  }

  read_indirect_y() {
    var imm = this.get_imm();
    var load_addr = byteToUnsigned(imm);
    var value_addr = this.load_abs_addr_zeropage(load_addr) + this.Y[0];
    this.temp_load_addr = value_addr;
    return this.read_memory(value_addr&0xffff);
  }

  write_indirect_y(val) {
    var imm = this.get_imm();
    var load_addr = byteToUnsigned(imm);
    var store_addr = this.load_abs_addr(load_addr) + this.Y[0];
    this.write_memory(store_addr&0xffff, val);
    this.temp_load_addr = load_addr;
  }


  read_absolute_x() {
    this.temp_load_addr = (this.get_addr_absolute()+this.X[0])&0xffff;
    return this.read_memory(this.temp_load_addr);
  }
  read_absolute_y() {
    this.temp_load_addr = (this.get_addr_absolute()+this.Y[0])&0xffff;
    return this.read_memory(this.temp_load_addr);
  }

  read_absolute() {
    this.temp_load_addr = this.get_addr_absolute();
    return this.read_memory(this.temp_load_addr);
  }

  cmp(reg, val) {
    var diff = reg-val;
    this.set_flag_carry(reg>=val);
    this.set_flag_zero(reg==val);
    this.set_flag_negative(reg==val?0:diff&0x80);
  }

  read_zeropage() {
    this.temp_load_addr = this.get_imm();
    return this.read_memory(this.temp_load_addr);
  }

  read_zeropage_x() {
    this.temp_load_addr = (this.get_imm()+this.X[0])&0xff;
    return this.read_memory(this.temp_load_addr);
  }

  read_zeropage_y() {
    this.temp_load_addr = (this.get_imm()+this.Y[0])&0xff;
    return this.read_memory(this.temp_load_addr);
  }

  asl(addr, val) {
    this.set_flag_carry((val&0x80)?1:0);
    val = (byteToUnsigned(val)<<1)&0xff;
    this.write_memory(addr,val);
    this.set_negative_zero(val);
    return val;
  }

  rol(addr, val) {
    var carry = this.get_flag_carry();
    this.set_flag_carry((val&0x80)?1:0);
    val = ((byteToUnsigned(val)<<1)+carry)&0xff;
    this.write_memory(addr, val);
    this.set_negative_zero(val);
    return val;
  }

  lsr(addr, val) {
    this.set_flag_carry(val&1);
    val = byteToUnsigned(val)>>1;
    this.write_memory(addr, val);
    this.set_negative_zero(val);
    return val;
  }

  ror(addr, val) {
    var carry = this.get_flag_carry();
    this.set_flag_carry((val&1));
    val = (byteToUnsigned(val)>>1)+(carry?0x80:0);
    this.write_memory(addr, val);
    this.set_negative_zero(val);
    return val;
  }

  dec(addr, inval) {
    var val = (inval-1)&0xff;
    this.write_memory(addr,val);
    this.set_negative_zero(val);
    return val;
  }

  async mainloop(binaryData) {
    if (this.ines_parseHeader(binaryData)) {
      var startTime;
      this.running = true;
      this.reset();
      var tempcycles = 0;
      startTime = new Date();
      while (this.running) {
        if (!this.cpu6502_one_op()) break;
        if (!this.run_ppu()) break;
        if (this.cycles - tempcycles > 100000) {
          tempcycles = this.cycles;
          var temp_endtime = new Date();
          var difftime = (temp_endtime - startTime) - (0.1 / 1.79) * 1000;
          if (difftime > 0) difftime = 0;
          await new Promise(resolve => setTimeout(resolve, (-difftime) + this.extradelay));
          startTime = new Date();
          if (this.cycles < 200000) {
            console.log("Palette:" + Number(this.getColor(0, 0, 0)).toString(16));
            console.log("Palette:" + Number(this.getColor(1, 0, 0)).toString(16));
            console.log("Palette:" + Number(this.getColor(2, 0, 0)).toString(16));
            console.log("Palette:" + Number(this.getColor(3, 0, 0)).toString(16));
          }
        }
      }
      this.debug_print();
    } else {
      console.log("ROM failure: header not valid");
    }
  }

}

exports.fnes=NESSystem;