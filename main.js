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

class NESSystem {

  constructor() {

    this.PC = 0x8000;
    this.S = 0;
    this.P = Buffer.alloc(1);
    this.A = Buffer.alloc(1);
    this.X = Buffer.alloc(1);
    this.Y = Buffer.alloc(1);
    this.header = new NESHeader();
    this.memory_cpu = Buffer.alloc(0xffff);
    this.memory_ppu = Buffer.alloc(0x3fff);
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
      switch (this.memory_cpu[this.PC]) {
        case 0x10: // BPL (Branch if positive)
          this.PC++;
          cycles++;
          if(this.P&0x80 == 0) this.PC += byteToSigned(this.memory_cpu[this.PC]);
          break;
        case 0x78: // SEI
          this.P = (this.P | 2);
          break;
        case 0x8d: // STA abs
          cycles+=3;
          this.PC++;
          var abs_addr = this.memory_cpu[this.PC]+(this.memory_cpu[this.PC+1]<<8);
          this.PC++;
          this.memory_cpu[abs_addr] = this.A;
          console.log("STA "+abs_addr.toString(16)+":"+this.A.toString(16));
          break;
        case 0x9a: // TXS
          this.P = (this.P & 0x7f) + (this.X&0x80);
          this.S = this.X;
          break;
        case 0xa0: // LDY imm
          this.PC++;
          cycles++;
          this.Y = this.memory_cpu[this.PC];
          this.P = (this.P & ~0x2) + (this.Y == 0)?2:0;
          this.P = (this.P & 0x78) + (this.Y & 0x80);
          break;
        case 0xa2: // LDX imm
          this.PC++;
          cycles++;
          this.X = this.memory_cpu[this.PC];
          this.P = (this.P & ~0x2) + (this.X == 0)?2:0;
          this.P = (this.P & 0x78) + (this.X & 0x80);
          break;

        case 0xa9: // LDA imm
          this.PC++;
          cycles++;
          this.A = this.memory_cpu[this.PC];
          this.P = (this.P & ~0x2) + (this.A == 0)?2:0;
          this.P = (this.P & 0x78) + (this.A&0x80);
          break;
        case 0xad: // LDA abs
          this.PC++;
          cycles+=3;
          var abs_addr = this.memory_cpu[this.PC]+(this.memory_cpu[this.PC+1]<<8);
          this.A = this.memory_cpu[abs_addr];
          this.PC++;
          this.P = (this.P & ~0x2) + (this.A == 0)?2:0;
          this.P = (this.P & 0x78) + (this.A&0x80);
          break;
        case 0xd8: // CLD
          this.P = (this.P & ~4);
          break;
        default:
          console.log("A:" + this.A.toString(16)+" X:" + this.X.toString(16)+" Y:" + this.Y.toString(16)+" PC " + this.PC.toString(16) + ": " + this.memory_cpu[this.PC].toString(16));
          console.log("Cycles/ops processed: " + cycles+"/"+ops);
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