var fs = require('fs');


class NESHeader {

  constructor()
  {
    this.prg_size = 0;
    this.chr_size = 0;
    this.pal = false;


  }
}

function byteToSigned(val) {

  if(val&0x80) val = -((~val&0xff)-1);
  return val;
}

function byteToUnsigned(val) {
  return val&0xff;
}

const DEBUG_OPS = 1<<0;
const DEBUG_MEMORY = 1<<1;

const PPUCTRL = 0x2000;
const PPUSTATUS = 0x2002;
const PPU_CYCLES_PER_LINE = 341;
const PPU_CYCLES_PER_FRAME = 89342;

class NESSystem {

  constructor() {

    this.cycles_ppu_this_frame = 0;
    this.cycles_this_line = 0;
    this.ppu_scanline = 0;
    this.ppu_off_x = 0;
    this.ppu_off_y = 0;
    this.ppu_render = false;
    this.cycles_ppu = 0;

    this.nmi = false;
    this.bytes_read = 0;
    this.bytes_written = 0;
    this.debug = DEBUG_OPS;
    this.cycles = 0;
    this.ops = 0;
    this.PC = 0x8000;
    this.S = 0xff;
    this.P = Buffer.alloc(1);
    this.A = Buffer.alloc(1);
    this.X = Buffer.alloc(1);
    this.Y = Buffer.alloc(1);
    this.header = new NESHeader();
    this.memory_cpu = Buffer.alloc(0xffff);
    this.memory_ppu = Buffer.alloc(0x3fff);
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

  read_memory(addr) {
    this.bytes_read++;
    return this.memory_cpu[addr];
  }
  write_memory(addr, byte) {
    if(addr == PPUCTRL) {
      console.log("Writing byte "+Number(byte).toString(16)+" to PPU control");
    }
    if(addr == 0x4014) {
      console.log("DMA Write: "+Number(byte).toString(16));
    }
    this.bytes_written++;
    this.memory_cpu[addr] = byte;
    return true;
  }

  clip_y() {
    //this.Y[0] = this.Y[0]&0xff;
  }
  clip_x() {
    //this.X[0] = this.X[0]&0xff;
  }

  get_flag_zero() { return (this.P[0]&0x2)?true:false; }
  get_flag_carry() { return (this.P[0]&0x1)?true:false; }
  get_flag_negative() { return (this.P[0]&0x80)?true:false; }
  get_flag_overflow() { return (this.P[0]&0x40)?true:false; }

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

  debug_print() {
    console.log("A:" + this.A[0].toString(16)+" X:" + this.X[0].toString(16)+" Y:" + this.Y[0].toString(16)+" PC " + this.PC.toString(16) + ": " + this.memory_cpu[this.PC].toString(16));
    console.log("Cycles/ops processed: " + this.cycles+" / "+this.ops);
    console.log("Status: " + this.P[0].toString(2));
    console.log("Bytes read / written: "+this.bytes_read + " / "+this.bytes_written);
  }

  adc(val) {
    var temp = this.A[0] + val + this.get_flag_carry();
    this.set_flag_overflow(((this.A[0]^temp) & (val ^ temp) & 0x80) == 0x80);
    this.set_flag_carry(temp&0x100 == 0x100);
    this.A[0] = temp&0xff;
    this.set_flag_zero(this.A[0] == 0);
    this.set_flag_negative(this.A[0]&0x80);
  }
  /*
  0-3: Constant $4E $45 $53 $1A ("NES" followed by MS-DOS end-of-file)
  4: Size of PRG ROM in 16 KB units
  5: Size of CHR ROM in 8 KB units (Value 0 means the board uses CHR RAM)
  6: Flags 6 - Mapper, mirroring, battery, trainer
  7: Flags 7 - Mapper, VS/Playchoice, NES 2.0
  8: Flags 8 - PRG-RAM size (rarely used extension)
  9: Flags 9 - TV system (rarely used extension)
  10: Flags 10 - TV system, PRG-RAM presence (unofficial, rarely used extension)
  11-15: Unused padding (should be filled with zero, but some rippers put their name across bytes 7-15)
  */
  parseHeader(data) {

    if(Buffer.compare(data.slice(0,4), Buffer.from([0x4E, 0x45, 0x53, 0x1A])))
    {
      console.log(data.slice(0,4));
      return false;
    }
    this.header.prg_size = data[4] * 16*1024;
    this.header.chr_size = data[5] * 8*1024;
    this.pal = data[9] ? true:false;
    data.copy(this.memory_cpu, 0x8000, 16, 16+this.header.prg_size);
    data.copy(this.memory_ppu, 0x0000, 16+this.header.prg_size, this.header.chr_size);

    console.log("PRG ROM: "+this.header.prg_size);
    console.log("CHR ROM: "+this.header.chr_size);
    return true;
  }

  run_ppu() {
    while(this.cycles_ppu < this.cycles*3) {

      if(this.cycles_ppu_this_frame<PPU_CYCLES_PER_LINE*20) {
        this.memory_cpu[PPUSTATUS] |= 0x80;
        if(this.memory_cpu[PPUCTRL]&0x80) {
          this.memory_cpu[PPUCTRL] &= 0x7f;
          this.nmi = true;
        }
      }
      else this.memory_cpu[PPUSTATUS] &= 0x7f;

      this.cycles_ppu++;
      this.cycles_ppu_this_frame++;
      this.cycles_this_line++;
      if(this.cycles_this_line == PPU_CYCLES_PER_LINE) this.cycles_this_line = 0;
      if(this.cycles_ppu_this_frame == 89342) this.cycles_ppu_this_frame = 0;
    }

    return 1;
  }

  run() {
      //console.log(this.PC.toString(16)+": "+this.memory_cpu[this.PC].toString(16));
      //if(this.PC == 0x8057) return 0;
      //console.log("A:" + Number(this.A[0]).toString(16)+" X:" + Number(this.X[0]).toString(16)+" Y:" + Number(this.Y[0]).toString(16)+" PC " + this.PC.toString(16));
      if(this.nmi) {
        console.log("NMI");
        this.nmi = false;
        this.cycles+=2;
        this.push_stack(this.P);
        var addr = this.PC-1;
        this.push_stack(addr&0xff);
        this.push_stack((addr&0xff00)>>8);
        this.PC = this.load_abs_addr(0xFFFA);
      }

      switch (this.read_memory(this.PC)) {
        case 0x5: // ORA zero_page
          this.cycles++;
          this.PC++;
          var addr = this.read_memory(this.PC);
          var imm = this.read_memory(byteToUnsigned(addr));
          this.A[0] = byteToUnsigned(this.A[0]) | byteToUnsigned(imm);
          this.set_flag_negative(this.A[0]&0x80);
          this.set_flag_zero(this.A[0]==0);
          if(this.debug & DEBUG_OPS) console.log("$"+Number(this.PC).toString(16)+": "+"ORA $"+Number(imm).toString(16));
          break;
        case 0x9: // ORA imm
          this.cycles++;
          this.PC++;
          var imm = this.read_memory(this.PC);
          this.A[0] = byteToUnsigned(this.A[0]) | byteToUnsigned(imm);
          this.set_flag_negative(this.A[0]&0x80);
          this.set_flag_zero(this.A[0]==0);
          if(this.debug & DEBUG_OPS) console.log("$"+Number(this.PC).toString(16)+": "+"ORA #"+imm);
          break;
        case 0x0a: // ASL (arithmetic shift left), accumulator
          this.cycles++;
          this.set_flag_carry((this.A[0]&0x80)?1:0);
          this.A[0] = byteToUnsigned(this.A[0])<<1;
          this.set_flag_zero(this.A[0] == 0);
          this.set_flag_negative(this.A[0]&0x80);
          if(this.debug & DEBUG_OPS) console.log("$"+Number(this.PC).toString(16)+": "+"ASL A");
          break;
        case 0x10: // BPL (Branch if positive)
          this.PC++;
          this.cycles++;
          var offset = byteToSigned(this.read_memory(this.PC));
          if(offset < 0) offset -= 2;
          if(this.debug & DEBUG_OPS) console.log("$"+Number(this.PC).toString(16)+": "+"BPL $"+(this.PC+offset+1).toString(16));
          if(this.get_flag_negative() == false) this.PC += offset;

          break;
        case 0x11: // ORA indirect, Y
          this.cycles+=4;
          this.PC++;
          var imm = this.read_memory(this.PC);
          var load_addr = byteToUnsigned(imm);
          var value_addr = this.load_abs_addr(load_addr) + this.Y[0];
          this.A[0] = byteToUnsigned(this.A[0]) | byteToUnsigned(this.read_memory(value_addr));
          this.set_flag_negative(this.A[0]&0x80);
          this.set_flag_zero(this.A[0]==0);
          if(this.debug & DEBUG_OPS) console.log("$"+Number(this.PC).toString(16)+": "+"ORA ($"+(Number(load_addr).toString(16))+"), Y");
          break;
        case 0x16: // ASL (arithmetic shift left), zero_page,X
          this.PC++;
          this.cycles++;
          var imm = this.read_memory(this.PC);
          var load_addr = byteToUnsigned(imm)+this.X;
          var val = this.read_memory(load_addr);
          this.set_flag_carry((val&0x80)?1:0);
          val = byteToUnsigned(val)<<shift;
          this.set_flag_zero(val == 0);
          this.set_flag_negative(val&0x80);
          if(this.debug & DEBUG_OPS) console.log("$"+Number(this.PC).toString(16)+": "+"ASL $00"+Number(imm).toString(16)+",X");
          break;
        case 0x18: // CLC (clear carry)
          this.cycles++;
          this.set_flag_carry(0);
          if(this.debug & DEBUG_OPS) console.log("$"+Number(this.PC).toString(16)+": "+"CLC");
          break;
        case 0x19: // ORA abs, Y
          this.cycles+=4;
          this.PC++;
          var value_addr = this.load_abs_addr(this.PC)+this.Y[0];
          this.PC++;
          this.A[0] = byteToUnsigned(this.A[0]) | byteToUnsigned(this.read_memory(value_addr));
          this.set_flag_negative(this.A[0]&0x80);
          this.set_flag_zero(this.A[0]==0);
          if(this.debug & DEBUG_OPS) console.log("$"+Number(this.PC).toString(16)+": "+"ORA $"+(Number(load_addr).toString(16))+", Y");
          break;
        case 0x20: // JSR (Jump to subroutine)
          this.PC++;
          this.cycles++;
          var abs_addr = this.load_abs_addr(this.PC);
          this.PC++;
          this.PC++;
          this.push_stack(this.PC&0xff);
          this.push_stack((this.PC&0xff00)>>8);
          if(this.debug & DEBUG_OPS) console.log("$"+Number(this.PC).toString(16)+": "+"JSR $"+(Number(abs_addr).toString(16)));
          this.PC = abs_addr-1;
          break;
        case 0x29: // AND imm
          this.cycles++;
          this.PC++;
          var imm = this.read_memory(this.PC);
          this.A[0] = byteToUnsigned(this.A[0]) & byteToUnsigned(imm);
          this.set_flag_negative(this.A[0]&0x80);
          this.set_flag_zero(this.A[0]==0);
          if(this.debug & DEBUG_OPS) console.log("$"+Number(this.PC).toString(16)+": "+"AND #"+imm);
          break;
        case 0x2a: // ROL A (rotate left, A)
          this.PC++;
          this.cycles++;
          var carry = this.get_flag_carry();
          this.set_flag_carry((this.A[0]&0x80)?1:0);
          this.A[0] = (byteToUnsigned(this.A[0])<<1)+carry;
          this.set_flag_zero(this.A[0] == 0);
          this.set_flag_negative(this.A[0]&0x80);
          if(this.debug & DEBUG_OPS) console.log("$"+Number(this.PC).toString(16)+": "+"ROL A");
          break;
        case 0x2c: // BIT abs
          this.cycles+=3;
          this.PC++;
          var abs_addr = this.load_abs_addr(this.PC);
          this.PC++;
          var val = this.read_memory(abs_addr);
          this.set_flag_zero((byteToUnsigned(val) & byteToUnsigned(this.A[0]))?1:0);
          this.set_flag_negative(val&0x80);
          this.set_flag_overflow(val&0x40);
          if(this.debug & DEBUG_OPS) console.log("$"+Number(this.PC).toString(16)+": "+"BIT $"+Number(abs_addr).toString(16));
          break;
        case 0x38: // SEC (set Carry)
          this.cycles++;
          this.set_flag_carry(1);
          if(this.debug & DEBUG_OPS) console.log("$"+Number(this.PC).toString(16)+": "+"SEC");
          break;
        case 0x3d: // AND abs,X
          this.PC++;
          this.cycles+=3;
          var abs_addr = this.load_abs_addr(this.PC)+this.X[0];
          this.PC++;
          var val = this.read_memory(abs_addr);
          this.A[0] &= val;
          this.set_flag_zero(this.A[0] == 0);
          this.set_flag_negative(this.A[0]&0x80);
          if(this.debug & DEBUG_OPS) console.log("$"+Number(this.PC).toString(16)+": "+"AND $"+Number(abs_addr).toString(16)+",X");
          break;
        case 0x45: // EOR zero_page (Exclusive or)
          this.cycles+=2;
          this.PC++;
          var addr = this.read_memory(this.PC);
          var val = this.read_memory(addr)^this.A[0];
          this.A[0] = val;
          this.set_flag_negative(val&0x80);
          this.set_flag_zero(val==0);
          if(this.debug & DEBUG_OPS) console.log("$"+Number(this.PC).toString(16)+": "+"EOR $00"+Number(addr).toString(16));
          break;
        case 0x48: // PHA (Push Accumulator)
          this.cycles+=2;
          this.push_stack(this.A[0]);
          if(this.debug & DEBUG_OPS) console.log("$"+Number(this.PC).toString(16)+": "+"PHA");
          break;
        case 0x4a: // LSR (logical shift right)
          this.cycles++;
          this.set_flag_carry(this.A[0]&1);
          this.A[0] = byteToUnsigned(this.A[0])>>1;
          this.set_flag_zero(this.A[0] == 0);
          this.set_flag_negative(this.A[0]&0x80);
          if(this.debug & DEBUG_OPS) console.log("$"+Number(this.PC).toString(16)+": "+"LSR");
          break;
        case 0x4c: // JMP
          this.PC++;
          this.cycles++;
          var abs_addr = this.load_abs_addr(this.PC);
          this.PC++;
          this.PC = abs_addr-1;
          //if(this.debug & DEBUG_OPS) console.log("$"+Number(this.PC).toString(16)+": "+"JMP $"+Number(abs_addr).toString(16));
          break;
        case 0x60: // RTS (return from subroutine)
          this.cycles++;
          var abs_addr = (byteToUnsigned(this.pop_stack())<<8) +byteToUnsigned(this.pop_stack());
          this.PC = abs_addr-1;
          if(this.debug & DEBUG_OPS) console.log("$"+Number(this.PC).toString(16)+": "+"RTS $"+Number(abs_addr).toString(16));
          break;
        case 0x68: // PLA (Pull Accumulator)
          this.cycles+=3;
          this.A[0] = this.pop_stack();
          if(this.debug & DEBUG_OPS) console.log("$"+Number(this.PC).toString(16)+": "+"PLA");
          break;
        case 0x78: // SEI
          this.P[0] = (this.P[0] | 2);
          if(this.debug & DEBUG_OPS) console.log("$"+Number(this.PC).toString(16)+": "+"SEI");
          break;
        case 0x7e: // ROR abs,X
          this.PC++;
          this.cycles+=3;
          var abs_addr = this.load_abs_addr(this.PC)+this.X[0];
          var val = this.read_memory(abs_addr);
          var carry = this.get_flag_carry();
          this.set_flag_carry(val&1);
          val = byteToUnsigned(val) >> 1;
          val = val + (carry?0x80:0);
          this.write_memory(abs_addr, val);
          this.PC++;
          this.set_flag_zero(val == 0);
          this.set_flag_negative(val&0x80);
          if(this.debug & DEBUG_OPS) console.log("$"+Number(this.PC).toString(16)+": "+"ROR $"+Number(abs_addr).toString(16)+",X");
          break;
        case 0x85: // STA zero_page
          this.cycles+=2;
          this.PC++;
          var abs_addr = this.read_memory(this.PC);
          this.write_memory(abs_addr, this.A[0]);
          if(this.debug & DEBUG_OPS) console.log("$"+Number(this.PC).toString(16)+": "+"STA $00"+Number(abs_addr).toString(16));
          break;
        case 0x86: // STX zero_page
          this.cycles+=2;
          this.PC++;
          var abs_addr = this.read_memory(this.PC);
          this.write_memory(abs_addr, this.X[0]);
          if(this.debug & DEBUG_OPS) console.log("$"+Number(this.PC).toString(16)+": "+"STX $00"+Number(abs_addr).toString(16));
          break;
        case 0x88: // DEY DEcrement Y
          this.cycles++;
          this.Y[0] = this.Y[0] - 1;
          this.set_flag_negative(this.Y[0]&0x80);
          this.set_flag_zero(this.Y[0]==0);
          this.clip_y();
          if(this.debug & DEBUG_OPS) console.log("$"+Number(this.PC).toString(16)+": "+"DEY");
          break;
        case 0x8a: // TXA (Transfer X to A)
          this.cycles++;
          this.set_flag_negative(this.X[0]&0x80);
          this.set_flag_zero(this.X[0]==0);
          this.A[0] = this.X[0];
          if(this.debug & DEBUG_OPS) console.log("$"+Number(this.PC).toString(16)+": "+"TXA");
          break;
        case 0x8d: // STA abs
          this.cycles+=3;
          this.PC++;
          var abs_addr = this.load_abs_addr(this.PC);
          this.PC++;
          this.write_memory(abs_addr, this.A[0]);
          if(this.debug & DEBUG_OPS) console.log("$"+Number(this.PC).toString(16)+": "+"STA $"+Number(abs_addr).toString(16));
          break;
        case 0x90: // BCC (Branch on Carry Clear)
          this.PC++;
          this.cycles++;
          var offset = byteToSigned(this.read_memory(this.PC));
          if(offset < 0) offset -= 2;
          if(this.debug & DEBUG_OPS) console.log("$"+Number(this.PC).toString(16)+": "+"BCC $"+(this.PC+offset+1).toString(16));
          if(this.get_flag_carry() == false) this.PC += offset;
          break;
        case 0x91: // STA indirect, Y
          this.cycles+=4;
          this.PC++;
          var imm = this.read_memory(this.PC);
          var load_addr = byteToUnsigned(imm);
          var store_addr = this.load_abs_addr(load_addr) + this.Y[0];
          this.write_memory(store_addr, this.A[0]);
          if(this.debug & DEBUG_OPS) console.log("$"+Number(this.PC).toString(16)+": "+"STA ($"+(load_addr).toString(16)+"),Y");
          break;
        case 0x99: // STA abs,y
          this.cycles+=3;
          this.PC++;
          var abs_addr = this.load_abs_addr(this.PC)+this.Y[0];
          this.PC++;
          this.write_memory(abs_addr, this.A[0]);
          if(this.debug & DEBUG_OPS) console.log("$"+Number(this.PC).toString(16)+": "+"STA $"+(abs_addr).toString(16)+",Y");
          break;
        case 0x9a: // TXS
          this.set_flag_negative(this.X[0]&0x80);
          this.S = this.X[0];
          if(this.debug & DEBUG_OPS) console.log("$"+Number(this.PC).toString(16)+": "+"TXS");
          break;
        case 0x9d: // STA abs,X
          this.PC++;
          this.cycles+=3;
          var abs_addr = this.load_abs_addr(this.PC)+this.X[0];
          this.write_memory(abs_addr, this.A[0]);
          this.PC++;
          if(this.debug & DEBUG_OPS) console.log("$"+Number(this.PC).toString(16)+": "+"STA $"+Number(abs_addr).toString(16)+",X");
          break;
        case 0xa0: // LDY imm
          this.PC++;
          this.cycles++;
          var imm = this.read_memory(this.PC);
          this.Y[0] = imm;
          this.set_flag_zero(this.Y[0] == 0);
          this.set_flag_negative(this.Y[0]&0x80);
          if(this.debug & DEBUG_OPS) console.log("$"+Number(this.PC).toString(16)+": "+"LDY #"+imm);
          break;
        case 0xa2: // LDX imm
          this.PC++;
          this.cycles++;
          var imm = this.read_memory(this.PC);
          this.X[0] = imm;
          this.set_flag_zero(this.X[0] == 0);
          this.set_flag_negative(this.X[0]&0x80);
          if(this.debug & DEBUG_OPS) console.log("$"+Number(this.PC).toString(16)+": "+"LDX #"+imm);
          break;
        case 0xa8: // TAY (Transfer A to Y)
          this.cycles++;
          this.set_flag_negative(this.A[0]&0x80);
          this.set_flag_zero(this.A[0]==0);
          this.Y[0] = this.A[0];
          if(this.debug & DEBUG_OPS) console.log("$"+Number(this.PC).toString(16)+": "+"TAY");
          break;
        case 0xa9: // LDA imm
          this.PC++;
          this.cycles++;
          var imm = this.read_memory(this.PC);
          this.A[0] = imm;
          this.set_flag_zero(this.A[0] == 0);
          this.set_flag_negative(this.A[0]&0x80);
          if(this.debug & DEBUG_OPS) console.log("$"+Number(this.PC).toString(16)+": "+"LDA #"+imm);
          break;
        case 0xaa: // TAX (Transfer A to X)
          this.cycles++;
          this.set_flag_negative(this.A[0]&0x80);
          this.set_flag_zero(this.A[0]==0);
          this.X[0] = this.A[0];
          if(this.debug & DEBUG_OPS) console.log("$"+Number(this.PC).toString(16)+": "+"TAX");
          break;
        case 0xac: // LDY abs
          this.PC++;
          this.cycles+=3;
          var abs_addr = this.load_abs_addr(this.PC);
          this.Y[0] = this.read_memory(abs_addr);
          this.PC++;
          this.set_flag_zero(this.Y[0] == 0);
          this.set_flag_negative(this.Y[0]&0x80);
          if(this.debug & DEBUG_OPS) console.log("$"+Number(this.PC).toString(16)+": "+"LDY $"+Number(abs_addr).toString(16));
          break;
        case 0xad: // LDA abs
          this.PC++;
          this.cycles+=3;
          var abs_addr = this.load_abs_addr(this.PC);
          this.A[0] = this.read_memory(abs_addr);
          this.PC++;
          this.set_flag_zero(this.A[0] == 0);
          this.set_flag_negative(this.A[0]&0x80);
          if(this.debug & DEBUG_OPS) console.log("$"+Number(this.PC).toString(16)+": "+"LDA $"+Number(abs_addr).toString(16));
          break;
        case 0xae: // LDX abs
          this.PC++;
          this.cycles+=3;
          var abs_addr = this.load_abs_addr(this.PC);
          this.X[0] = this.read_memory(abs_addr);
          this.PC++;
          this.set_flag_zero(this.X[0] == 0);
          this.set_flag_negative(this.X[0]&0x80);
          if(this.debug & DEBUG_OPS) console.log("$"+Number(this.PC).toString(16)+": "+"LDX $"+Number(abs_addr).toString(16));
          break;
        case 0xb0: // BCS (Branch on Carry Set)
          this.PC++;
          this.cycles++;
          var offset = byteToSigned(this.read_memory(this.PC));
          if(offset < 0) offset -= 2;
          if(this.debug & DEBUG_OPS) console.log("$"+Number(this.PC).toString(16)+": "+"BCS $"+(this.PC+offset+1).toString(16));
          if(this.get_flag_carry()) this.PC += offset;
          break;
        case 0xb1: // LDA indirect, Y
          this.cycles+=4;
          this.PC++;
          var imm = this.read_memory(this.PC);
          var load_addr = byteToUnsigned(imm);
          var value_addr = this.load_abs_addr(load_addr) + this.Y[0];
          this.A[0] = this.read_memory(value_addr);
          this.set_flag_negative(this.A[0]&0x80);
          this.set_flag_zero(this.A[0]==0);
          if(this.debug & DEBUG_OPS) console.log("$"+Number(this.PC).toString(16)+": "+"LDA ($"+Number(load_addr).toString(16)+"),Y");
          break;
        case 0xbd: // LDA abs,X
          this.PC++;
          this.cycles+=3;
          var abs_addr = this.load_abs_addr(this.PC)+this.X[0];
          this.A[0] = this.read_memory(abs_addr);
          this.PC++;
          this.set_flag_zero(this.A[0] == 0);
          this.set_flag_negative(this.A[0]&0x80);
          if(this.debug & DEBUG_OPS) console.log("$"+Number(this.PC).toString(16)+": "+"LDA $"+Number(abs_addr).toString(16)+",X");
          break;
        case 0xbe: // LDX abs,y
          this.cycles+=3;
          this.PC++;
          var abs_addr = this.load_abs_addr(this.PC)+this.Y[0];
          this.PC++;
          this.X[0] = this.read_memory(abs_addr);
          this.set_flag_zero(this.X[0] == 0);
          this.set_flag_negative(this.X[0]&0x80);
          if(this.debug & DEBUG_OPS) console.log("$"+Number(this.PC).toString(16)+": "+"LDX $"+(abs_addr).toString(16)+",Y");
          break;
        case 0xc0: // CPY imm
          this.PC++;
          this.cycles++;
          var imm = this.read_memory(this.PC);
          var diff = this.Y[0]-imm;
          this.set_flag_carry(this.Y[0]>imm);
          this.set_flag_zero(this.Y[0]==imm);
          this.set_flag_negative(diff&0x80);
          if(this.debug & DEBUG_OPS) console.log("$"+Number(this.PC).toString(16)+": "+"CPY #"+imm);
          break;
        case 0xc8: // INY INcrement Y
          this.cycles++;
          this.Y[0] = this.Y[0] + 1;
          this.set_flag_negative(this.Y[0]&0x80);
          this.set_flag_zero(this.Y[0]==0);
          this.clip_y();
          if(this.debug & DEBUG_OPS) console.log("$"+Number(this.PC).toString(16)+": "+"INY");
          break;
        case 0xc9: // CMP imm
          this.PC++;
          this.cycles++;
          var imm = this.read_memory(this.PC);
          var diff = this.A[0]-imm;
          this.set_flag_carry(this.A[0]>imm);
          this.set_flag_zero(this.A[0]==imm);
          this.set_flag_negative(diff&0x80);
          if(this.debug & DEBUG_OPS) console.log("$"+Number(this.PC).toString(16)+": "+"CMP #"+imm);
          break;
        case 0xca: // DEX DEcrement X
          this.cycles++;
          this.X[0] = this.X[0] - 1;
          this.set_flag_negative(this.X[0]&0x80);
          this.set_flag_zero(this.X[0]==0);
          this.clip_x();
          if(this.debug & DEBUG_OPS) console.log("$"+Number(this.PC).toString(16)+": "+"DEX");
          break;
        case 0xcc: // CPY abs
          this.PC++;
          this.cycles++;
          var abs_addr = this.load_abs_addr(this.PC)+this.X[0];
          var imm = this.read_memory(abs_addr);
          this.PC++;
          var diff = this.Y[0]-imm;
          this.set_flag_carry(this.Y[0]>imm);
          this.set_flag_zero(this.Y[0]==imm);
          this.set_flag_negative(diff&0x80);
          if(this.debug & DEBUG_OPS) console.log("$"+Number(this.PC).toString(16)+": "+"CPY $"+Number(abs_addr).toString(16));
          break;
        case 0xce: // DEC abs
          this.cycles+=5;
          this.PC++;
          var abs_addr = this.load_abs_addr(this.PC);
          this.PC++;
          var val = this.read_memory(abs_addr)-1;
          this.write_memory(abs_addr,val);
          this.set_flag_negative(val&0x80);
          this.set_flag_zero(val==0);
          if(this.debug & DEBUG_OPS) console.log("$"+Number(this.PC).toString(16)+": "+"INC $"+Number(abs_addr).toString(16));
          break;
        case 0xd0: // BNE (Branch if not equal)
          this.PC++;
          this.cycles++;
          var offset = byteToSigned(this.read_memory(this.PC));
          if(offset < 0) offset -= 2;
          if(this.debug & DEBUG_OPS) console.log("$"+Number(this.PC).toString(16)+": "+"BNE $"+(this.PC+offset+1).toString(16));
          if(this.get_flag_zero() == false) this.PC += offset;
          break;
        case 0xd6: // DEC zero_page,X
          this.cycles+=2;
          this.PC++;
          var abs_addr = this.read_memory(this.PC)+this.X[0];
          var val = this.read_memory(abs_addr)-1;
          this.write_memory(abs_addr,val);
          this.set_flag_negative(val&0x80);
          this.set_flag_zero(val==0);
          if(this.debug & DEBUG_OPS) console.log("$"+Number(this.PC).toString(16)+": "+"DEC $00"+Number(this.memory_cpu[this.PC]).toString(16)+",X");
          break;
        case 0xd8: // CLD
          this.P[0] = (this.P[0] & 0xf7);
          if(this.debug & DEBUG_OPS) console.log("$"+Number(this.PC).toString(16)+": "+"CLD");
          break;
        case 0xe0: // CPX imm
          this.PC++;
          this.cycles++;
          var imm = this.read_memory(this.PC);
          var diff = this.X[0]-imm;
          this.set_flag_carry(this.X[0]>imm);
          this.set_flag_zero(this.X[0]==imm);
          this.set_flag_negative(diff&0x80);
          if(this.debug & DEBUG_OPS) console.log("$"+Number(this.PC).toString(16)+": "+"CPX #"+imm);
          break;
        case 0xe6: // INC zero_page
          this.cycles+=4;
          this.PC++;
          var addr = this.read_memory(this.PC);
          var val = this.read_memory(addr);
          this.write_memory(addr, val);
          this.set_flag_negative(val&0x80);
          this.set_flag_zero(val==0);
          if(this.debug & DEBUG_OPS) console.log("$"+Number(this.PC).toString(16)+": "+"INC $00"+Number(addr).toString(16));
          break;
        case 0xe8: // INX INcrement X
          this.cycles++;
          this.X[0] = this.X[0] + 1;
          this.set_flag_negative(this.X[0]&0x80);
          this.set_flag_zero(this.X[0]==0);
          this.clip_x();
          if(this.debug & DEBUG_OPS) console.log("$"+Number(this.PC).toString(16)+": "+"INX");
          break;
        case 0xee: // INC abs
          this.cycles+=2;
          this.PC++;
          var abs_addr = this.load_abs_addr(this.PC);
          this.PC++;
          var val = this.read_memory(abs_addr)+1;
          this.write_memory(abs_addr, val);
          this.set_flag_negative(val&0x80);
          this.set_flag_zero(val==0);
          if(this.debug & DEBUG_OPS) console.log("$"+Number(this.PC).toString(16)+": "+"INC $"+Number(abs_addr).toString(16));
          break;
        case 0xf0: // BEQ (Branch if equal)
          this.PC++;
          this.cycles++;
          var offset = byteToSigned(this.read_memory(this.PC));
          if(offset < 0) offset -= 2;
          if(this.debug & DEBUG_OPS) console.log("$"+Number(this.PC).toString(16)+": "+"BEQ $"+(this.PC+offset+1).toString(16));
          if(this.get_flag_zero()) this.PC += offset;
          break;
        case 0xf8: // SED
          this.P[0] = (this.P[0] | 0x8);
          if(this.debug & DEBUG_OPS) console.log("$"+Number(this.PC).toString(16)+": "+"SED");
          break;
        case 0xf9: // SBC (substract with carry) abs,Y
          this.cycles+=3;
          this.PC++;
          var abs_addr = this.load_abs_addr(this.PC);
          this.PC++;
          var val = this.read_memory(abs_addr+this.Y[0]);
          val = ~val;
          this.adc(val);
          if(this.debug & DEBUG_OPS) console.log("$"+Number(this.PC).toString(16)+": "+"SBC $"+(abs_addr).toString(16)+",Y");
          break;
        default:
          this.debug_print();
          return 0;
      }
      this.PC++;
      this.cycles++;
      this.ops++;
      return 1;
  }
}

var system = new NESSystem();

process.on('SIGINT', function() {
  console.log("Caught interrupt signal");
  system.debug();
  process.exit(0);
});


function main()
{

  var binaryData = fs.readFileSync('./mario.nes');
  if(system.parseHeader(binaryData)) {
    var running = true;
    while(running) {
      if(!system.run()) break;
      if(!system.run_ppu()) break;
    }
    system.debug_print();
  } else {
    console.log("ROM failure: header not valid");
  }

  return;
}



main();