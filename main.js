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
  if(val&0x80) val -= 256;
  return val;
}

function byteToUnsigned(val) {
  return val&0xff;
}

class NESSystem {

  constructor() {

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
    this.memory_cpu[0x100+this.S] = byte;
    this.S--;
  }
  pop_stack() {
    this.S++;
    return this.memory_cpu[0x100+this.S];
  }

  load_abs_addr(addr) {
    return byteToUnsigned(this.memory_cpu[addr])+ (byteToUnsigned(this.memory_cpu[addr+1])<<8);
  }
  clip_y() {
    if(byteToSigned(this.Y) > 127) this.Y -= 256;
    if(byteToSigned(this.Y) < -128) this.Y += 256;
  }
  clip_x() {
    if(byteToSigned(this.X) > 127) this.X -= 256;
    if(byteToSigned(this.X) < -128) this.X += 256;
  }

  get_flag_zero() { return (this.P&0x2)?true:false; }
  get_flag_carry() { return (this.P&0x1)?true:false; }
  get_flag_negative() { return (this.P&0x80)?true:false; }

  set_flag_zero(bit) {
    this.P = (this.P & 0xfd) + ((bit)?2:0);
  }
  set_flag_carry(bit) {
    this.P = (this.P & 0xfe) + (bit)?1:0;
  }
  set_flag_negative(bit) {
    this.P = (this.P & 0x7f) + (bit?0x80:0);
  }
  set_flag_overflow(bit) {
    this.P = (this.P & 0xbf) + (bit?0x40:0);
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

  run() {
    var running = true;
    var cycles = 0;
    var ops = 0;
    while(running) {
      console.log(this.PC.toString(16)+": "+this.memory_cpu[this.PC].toString(16));
      switch (this.memory_cpu[this.PC]) {
        case 0x10: // BPL (Branch if positive)
          this.PC++;
          cycles++;
          if(this.get_flag_negative()) this.PC += byteToSigned(this.memory_cpu[this.PC]);
          break;
        case 0x11: // ORA indirect, Y
          cycles+=4;
          this.PC++;
          var imm = this.memory_cpu[this.PC];
          var load_addr = byteToUnsigned(imm);
          var value_addr = this.load_abs_addr(load_addr); + this.Y;
          this.A = byteToUnsigned(this.A) | byteToUnsigned(this.memory_cpu[value_addr]);
          break;
        case 0x20: // JSR (Jump to subroutine)
          this.PC++;
          cycles++;
          var abs_addr = this.load_abs_addr(this.PC);
          this.PC++;
          this.push_stack(this.PC&0xff);
          this.push_stack((this.PC&0xff00)>>8);
          this.PC = abs_addr-1;
          break;
        case 0x2c: // BIT abs
          cycles+=3;
          this.PC++;
          var abs_addr = this.load_abs_addr(this.PC);
          this.PC++;
          this.set_flag_zero((this.memory_cpu[abs_addr] & this.A)?1:0);
          this.set_flag_negative(this.memory_cpu[abs_addr]&0x80);
          this.set_flag_overflow(this.memory_cpu[abs_addr]&0x40);
          break;
        case 0x60: // RTS (return from subroutine)
          cycles++;
          var abs_addr = (byteToUnsigned(this.pop_stack())<<8) +byteToUnsigned(this.pop_stack());
          this.PC = abs_addr-1;
          break;
        case 0x78: // SEI
          this.P = (this.P | 2);
          break;
        case 0x85: // STA zero_page
          cycles+=2;
          this.PC++;
          var abs_addr = this.memory_cpu[this.PC];
          this.memory_cpu[abs_addr] = this.A;
          console.log("STA "+abs_addr.toString(16)+":"+this.A.toString(16));
          break;
        case 0x86: // STX zero_page
          cycles+=2;
          this.PC++;
          var abs_addr = this.memory_cpu[this.PC];
          this.memory_cpu[abs_addr] = this.X;
          console.log("STX "+abs_addr.toString(16)+":"+this.X.toString(16));
          break;
        case 0x88: // DEY DEcrement Y
          cycles++;
          this.Y = this.Y - 1;
          this.set_flag_negative(this.Y&0x80);
          this.set_flag_zero(this.Y);
          this.clip_y();
          break;
        case 0x8d: // STA abs
          cycles+=3;
          this.PC++;
          var abs_addr = this.load_abs_addr(this.PC);
          this.PC++;
          this.memory_cpu[abs_addr] = this.A;
          console.log("STA "+abs_addr.toString(16)+":"+this.A.toString(16));
          break;
        case 0x90: // BCC (Branch on Carry Clear)
          this.PC++;
          cycles++;
          if(this.get_flag_carry() == false) this.PC += byteToSigned(this.memory_cpu[this.PC]);
          break;
        case 0x91: // STA indirect, Y
          cycles+=4;
          this.PC++;
          var imm = this.memory_cpu[this.PC];
          var load_addr = byteToUnsigned(imm);
          var store_addr = this.load_abs_addr(load_addr); + this.Y;
          this.memory_cpu[store_addr] = this.A;
          console.log("STA "+store_addr.toString(16)+":"+this.A.toString(16)+" load: "+load_addr.toString(16));
          break;
        case 0x99: // STA abs,y
          cycles+=3;
          this.PC++;
          var abs_addr = this.load_abs_addr(this.PC)+this.Y;
          this.PC++;
          this.memory_cpu[abs_addr] = this.A;
          console.log("STA "+abs_addr.toString(16)+":"+this.A.toString(16));
          break;
        case 0x9a: // TXS
          this.set_flag_negative(this.X&0x80);
          this.S = this.X;
          break;
        case 0xa0: // LDY imm
          this.PC++;
          cycles++;
          this.Y = this.memory_cpu[this.PC];
          this.set_flag_zero(this.Y == 0);
          this.set_flag_negative(this.Y&0x80);
          break;
        case 0xa2: // LDX imm
          this.PC++;
          cycles++;
          this.X = this.memory_cpu[this.PC];
          this.set_flag_zero(this.X == 0);
          this.set_flag_negative(this.X&0x80);
          break;
        case 0xa9: // LDA imm
          this.PC++;
          cycles++;
          this.A = this.memory_cpu[this.PC];
          this.set_flag_zero(this.A == 0);
          this.set_flag_negative(this.A&0x80);
          break;
        case 0xad: // LDA abs
          this.PC++;
          cycles+=3;
          var abs_addr = this.load_abs_addr(this.PC);
          this.A = this.memory_cpu[abs_addr];
          this.PC++;
          this.set_flag_zero(this.A == 0);
          this.set_flag_negative(this.A&0x80);
          break;
        case 0xb0: // BCS (Branch on Carry Set)
          this.PC++;
          cycles++;
          if(this.get_flag_carry()) this.PC += byteToSigned(this.memory_cpu[this.PC]);
          break;
        case 0xbd: // LDA abs,X
          this.PC++;
          cycles+=3;
          var abs_addr = this.load_abs_addr(this.PC)+this.X;
          this.A = this.memory_cpu[abs_addr];
          this.PC++;
          this.set_flag_zero(this.A == 0);
          this.set_flag_negative(this.A&0x80);
          break;
        case 0xc0: // CPY imm
          this.PC++;
          cycles++;
          var imm = this.memory_cpu[this.PC];
          var diff = this.Y-imm;
          this.set_flag_carry(this.Y>imm);
          this.set_flag_zero(this.Y==imm);
          this.set_flag_negative(diff&0x80);
          break;
        case 0xc8: // INY INcrement Y
          cycles++;
          this.Y = this.Y + 1;
          this.set_flag_negative(this.Y&0x80);
          this.set_flag_zero(this.Y);
          this.clip_y();
          break;
        case 0xc9: // CMP imm
          this.PC++;
          cycles++;
          var imm = this.memory_cpu[this.PC];
          var diff = this.A-imm;
          this.set_flag_carry(this.A>imm);
          this.set_flag_zero(this.A==imm);
          this.set_flag_negative(diff&0x80);
          break;
        case 0xca: // DEX DEcrement X
          cycles++;
          this.X = this.X - 1;
          this.set_flag_negative(this.X&0x80);
          this.set_flag_zero(this.X);
          this.clip_x();
          break;
        case 0xd0: // BNE (Branch if not equal)
          this.PC++;
          cycles++;
          if(this.get_flag_zero() == false) this.PC += byteToSigned(this.memory_cpu[this.PC]);
          break;
        case 0xd8: // CLD
          this.P = (this.P & ~4);
          break;
        case 0xe0: // CMX imm
          this.PC++;
          cycles++;
          var imm = this.memory_cpu[this.PC];
          var diff = this.X-imm;
          this.set_flag_carry(this.X>imm);
          this.set_flag_zero(this.X==imm);
          this.set_flag_negative(diff&0x80);
          break;
        default:
          console.log("A:" + this.A.toString(16)+" X:" + this.X.toString(16)+" Y:" + this.Y.toString(16)+" PC " + this.PC.toString(16) + ": " + this.memory_cpu[this.PC].toString(16));
          console.log("Cycles/ops processed: " + cycles+"/"+ops);
          console.log("Status: " + this.P.toString(2));
          return;
      }
      this.PC++;
      cycles++;
      ops++;
    }
  }
}





function main()
{
  var system = new NESSystem();
  var binaryData = fs.readFileSync('./mario.nes');
  if(system.parseHeader(binaryData)) {
    system.run();
  } else {
    console.log("ROM failure: header not valid");
  }

  return;
}



main();