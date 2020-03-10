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
    this.S = 0xfd;
    this.P = Buffer.alloc(1);
    this.P[0] = 0x24;
    this.A = Buffer.alloc(1);
    this.X = Buffer.alloc(1);
    this.Y = Buffer.alloc(1);
    this.header = new NESHeader();
    this.memory_cpu = Buffer.alloc(0xffff);
    this.memory_ppu = Buffer.alloc(0x3fff);

    this.temp_regstate = "";
    this.temp_load_addr = 0;
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
    this.set_flag_zero(val == 0);
    this.set_flag_negative(val&0x80);
  }

  get_addr_absolute() {
    var addr = this.load_abs_addr(this.PC+1);
    this.PC += 2;
    return addr;
  }

  get_addr_indirect() {
    var fetch_addr = this.get_addr_absolute(this.PC+1);
    this.PC += 2;
    var addr = this.get_addr_absolute(fetch_addr);
    return addr;
  }

  get_imm() {
    var imm = this.read_memory(this.PC+1);
    this.PC++;
    return imm;
  }

  get_addr_zero_page() {
    var addr = this.read_memory(this.PC+1);
    this.PC++;
    return addr;
  }

  debug_print() {
    console.log("A:" + this.A[0].toString(16)+" X:" + this.X[0].toString(16)+" Y:" + this.Y[0].toString(16)+" PC " + this.PC.toString(16) + ": " + this.memory_cpu[this.PC].toString(16));
    console.log("Cycles/ops processed: " + this.cycles+" / "+this.ops);
    console.log("Status: " + this.P[0].toString(2));
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
    this.pal = !!data[9];
    if(this.header.prg_size == 16384) this.PC = 0xc000;
    data.copy(this.memory_cpu, this.PC, 16, 16+this.header.prg_size);
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
      if(this.debug & DEBUG_OPS) this.temp_regstate = this.get_registers_string();
    //console.log(this.PC.toString(16)+": "+this.memory_cpu[this.PC].toString(16));
      //if(this.PC == 0x8057) return 0;
      //console.log("A:" + Number(this.A[0]).toString(16)+" X:" + Number(this.X[0]).toString(16)+" Y:" + Number(this.Y[0]).toString(16)+" PC " + this.PC.toString(16));
      if(this.nmi) {
        console.log("NMI");
        this.nmi = false;
        this.cycles+=2;
        this.push_stack(this.P);
        var addr = this.PC-1;
        this.push_stack((addr&0xff00)>>8);
        this.push_stack(addr&0xff);
        this.PC = this.load_abs_addr(0xFFFA);
      }
      var original_PC;
      switch (this.read_memory(this.PC)) {
        case 0x1:  // ORA indirect, X
          original_PC = this.PC;
          this.cycles+=4;
          this.A[0] = byteToUnsigned(this.A[0]) | byteToUnsigned(this.read_indirect_x());
          this.set_negative_zero(this.A[0]);
          this.print_op_info(this.PC-original_PC,"ORA ($"+(Number(this.temp_load_addr).toString(16))+", X)");
          break;
        case 0x03:  // *SLO indirect,X (arithmetic shift left)
          original_PC = this.PC;
          this.cycles++;
          var val = this.read_indirect_x();
          val = this.asl(this.temp_load_addr, val);
          this.A[0] = byteToUnsigned(this.A[0]) | byteToUnsigned(val);
          this.set_negative_zero(this.A[0]);
          this.print_op_info(this.PC-original_PC,"*SLO ($"+Number(this.temp_load_addr).toString(16)+",X)");
          break;
        case 0x4:  // *NOP zeropage
          original_PC = this.PC;
          this.cycles+=2;
          var imm = this.get_imm();
          this.print_op_info(this.PC-original_PC,"*NOP $"+Number(imm).toString(16));
          break;
        case 0x5:  // ORA zero_page
          original_PC = this.PC;
          this.cycles++;
          var imm = this.read_zeropage();
          this.A[0] = byteToUnsigned(this.A[0]) | byteToUnsigned(imm);
          this.set_negative_zero(this.A[0]);
          this.print_op_info(this.PC-original_PC,"ORA $"+Number(this.temp_load_addr).toString(16));
          break;
        case 0x06:  // ASL zeropage (arithmetic shift left), accumulator
          original_PC = this.PC;
          this.cycles++;
          var val = this.read_zeropage();
          this.asl(this.temp_load_addr, val);
          this.print_op_info(this.PC-original_PC,"ASL $"+Number(this.temp_load_addr).toString(16));
          break;
        case 0x07:  // *SLO zeropage (arithmetic shift left)
          original_PC = this.PC;
          this.cycles++;
          var val = this.read_zeropage();
          val = this.asl(this.temp_load_addr, val);
          this.A[0] = byteToUnsigned(this.A[0]) | byteToUnsigned(val);
          this.set_negative_zero(this.A[0]);
          this.print_op_info(this.PC-original_PC,"*SLO $"+Number(this.temp_load_addr).toString(16));
          break;
        case 0x8:  // PHP (Push Processor status)
          original_PC = this.PC;
          this.cycles+=2;
          this.push_stack(this.get_processor_status());
          this.print_op_info(this.PC-original_PC,"PHP");
          break;
        case 0x9:  // ORA imm
          original_PC = this.PC;
          this.cycles++;
          var imm = this.get_imm();
          this.A[0] = byteToUnsigned(this.A[0]) | byteToUnsigned(imm);
          this.set_negative_zero(this.A[0]);
          this.print_op_info(this.PC-original_PC,"ORA #"+imm);
          break;
        case 0x0a:  // ASL (arithmetic shift left), accumulator
          original_PC = this.PC;
          this.cycles++;
          this.set_flag_carry((this.A[0]&0x80)?1:0);
          this.A[0] = byteToUnsigned(this.A[0])<<1;
          this.set_negative_zero(this.A[0]);
          this.print_op_info(this.PC-original_PC,"ASL A");
          break;
        case 0xc:  // *NOP abs
          original_PC = this.PC;
          this.cycles+=2;
          var abs_addr = this.get_addr_absolute();
          this.print_op_info(this.PC-original_PC,"*NOP $"+Number(abs_addr).toString(16));
          break;
        case 0xd:  // ORA abs
          original_PC = this.PC;
          this.cycles+=4;
          var abs_addr = this.get_addr_absolute();
          this.A[0] = byteToUnsigned(this.A[0]) | byteToUnsigned(this.read_memory(abs_addr));
          this.set_negative_zero(this.A[0]);
          this.print_op_info(this.PC-original_PC,"ORA $"+(Number(this.temp_load_addr).toString(16)));
          break;
        case 0x0e:  // ASL abs (arithmetic shift left)
          original_PC = this.PC;
          this.cycles++;
          var val = this.read_absolute();
          this.asl(this.temp_load_addr, val);
          this.print_op_info(this.PC-original_PC,"ASL $"+Number(this.temp_load_addr).toString(16));
          break;
        case 0x0f:  // *SLO abs (arithmetic shift left)
          original_PC = this.PC;
          this.cycles++;
          var val = this.read_absolute();
          val = this.asl(this.temp_load_addr, val);
          this.A[0] = byteToUnsigned(this.A[0]) | byteToUnsigned(val);
          this.set_negative_zero(this.A[0]);
          this.print_op_info(this.PC-original_PC,"*SLO $"+Number(this.temp_load_addr).toString(16));
          break;
        case 0x10:  // BPL (Branch if positive)
          original_PC = this.PC;
          this.PC++;
          this.cycles++;
          var offset = byteToSigned(this.read_memory(this.PC));
          if(offset < 0) offset -= 2;
          this.print_op_info(this.PC-original_PC,"BPL $"+(this.PC+offset+1).toString(16));
          if(this.get_flag_negative() == false) this.PC += offset;
          break;
        case 0x11:  // ORA indirect, Y
          original_PC = this.PC;
          this.cycles+=4;
          this.A[0] = byteToUnsigned(this.A[0]) | byteToUnsigned(this.read_indirect_y());
          this.set_negative_zero(this.A[0]);
          this.print_op_info(this.PC-original_PC,"ORA ($"+(Number(this.temp_load_addr).toString(16))+"), Y");
          break;
        case 0x13:  // *SLO indirect,Y (arithmetic shift left)
          original_PC = this.PC;
          this.cycles++;
          var val = this.read_indirect_y();
          val = this.asl(this.temp_load_addr, val);
          this.A[0] = byteToUnsigned(this.A[0]) | byteToUnsigned(val);
          this.set_negative_zero(this.A[0]);
          this.print_op_info(this.PC-original_PC,"*SLO ($"+Number(this.temp_load_addr).toString(16)+"),Y");
          break;
        case 0x14:  // *NOP zeropage,X
          original_PC = this.PC;
          this.cycles+=3;
          var imm = this.get_imm();
          this.print_op_info(this.PC-original_PC,"*NOP $"+Number(imm).toString(16));
          break;
        case 0x15:  // ORA zero_page,X
          original_PC = this.PC;
          this.cycles++;
          var addr = (this.get_imm()+this.X[0])&0xff;
          var imm = this.read_memory(byteToUnsigned(addr));
          this.A[0] = byteToUnsigned(this.A[0]) | byteToUnsigned(imm);
          this.set_negative_zero(this.A[0]);
          this.print_op_info(this.PC-original_PC,"ORA $"+Number(imm).toString(16)+",X");
          break;
        case 0x16:  // ASL zero_page,X (arithmetic shift left),
          original_PC = this.PC;
          this.cycles++;
          var val = this.read_zeropage_x();
          this.asl(this.temp_load_addr, val);
          this.print_op_info(this.PC-original_PC,"ASL $"+Number(this.temp_load_addr).toString(16)+",X");
          break;
        case 0x17:  // *SLO zeropage,X (arithmetic shift left)
          original_PC = this.PC;
          this.cycles++;
          var val = this.read_zeropage_x();
          val = this.asl(this.temp_load_addr, val);
          this.A[0] = byteToUnsigned(this.A[0]) | byteToUnsigned(val);
          this.set_negative_zero(this.A[0]);
          this.print_op_info(this.PC-original_PC,"*SLO $"+Number(this.temp_load_addr).toString(16)+",X");
          break;
        case 0x18:  // CLC (clear carry)
          original_PC = this.PC;
          this.cycles++;
          this.set_flag_carry(0);
          this.print_op_info(this.PC-original_PC,"CLC");
          break;
        case 0x19:  // ORA abs, Y
          original_PC = this.PC;
          this.cycles+=4;
          this.PC++;
          var value_addr = this.load_abs_addr(this.PC)+this.Y[0];
          this.PC++;
          this.A[0] = byteToUnsigned(this.A[0]) | byteToUnsigned(this.read_memory(value_addr));
          this.set_negative_zero(this.A[0]);
          this.print_op_info(this.PC-original_PC,"ORA $"+(Number(this.temp_load_addr).toString(16))+", Y");
          break;
        case 0x1a:  // *NOP
        case 0x3a:
        case 0x5a:
        case 0x7a:
        case 0xda:
        case 0xfa:
          original_PC = this.PC;
          this.cycles++;
          this.print_op_info(this.PC-original_PC,"*NOP");
          break;
        case 0x1b:  // *SLO abs,Y (arithmetic shift left)
          original_PC = this.PC;
          this.cycles++;
          var val = this.read_absolute_y();
          val = this.asl(this.temp_load_addr, val);
          this.A[0] = byteToUnsigned(this.A[0]) | byteToUnsigned(val);
          this.set_negative_zero(this.A[0]);
          this.print_op_info(this.PC-original_PC,"*SLO $"+Number(this.temp_load_addr).toString(16)+",Y");
          break;
        case 0x1c:  // *NOP imm
        case 0x3c:
        case 0x5c:
        case 0x7c:
        case 0xdc:
        case 0xfc:
          original_PC = this.PC;
          this.cycles++;
          var abs_addr = this.get_addr_absolute();
          this.print_op_info(this.PC-original_PC,"*NOP #$"+Number(abs_addr).toString(16));
          break;
        case 0x1d:  // ORA abs,X
          original_PC = this.PC;
          this.cycles+=4;
          var val = this.read_absolute_x();
          this.A[0] = byteToUnsigned(this.A[0]) | byteToUnsigned(val);
          this.set_negative_zero(this.A[0]);
          this.print_op_info(this.PC-original_PC,"ORA $"+(Number(this.temp_load_addr).toString(16)));
          break;
        case 0x1e:  // ASL abs,X (arithmetic shift left)
          original_PC = this.PC;
          this.cycles++;
          var val = this.read_absolute_x();
          this.asl(this.temp_load_addr, val);
          this.print_op_info(this.PC-original_PC,"ASL $"+Number(this.temp_load_addr).toString(16)+",X");
          break;
        case 0x1f:  // *SLO abs,X (arithmetic shift left)
          original_PC = this.PC;
          this.cycles++;
          var val = this.read_absolute_x();
          val = this.asl(this.temp_load_addr, val);
          this.A[0] = byteToUnsigned(this.A[0]) | byteToUnsigned(val);
          this.set_negative_zero(this.A[0]);
          this.print_op_info(this.PC-original_PC,"*SLO $"+Number(this.temp_load_addr).toString(16)+",X");
          break;
        case 0x20:  // JSR (Jump to subroutine)
          original_PC = this.PC;
          this.cycles++;
          var abs_addr = this.get_addr_absolute();
          this.push_stack(((this.PC)&0xff00)>>8);
          this.push_stack((this.PC)&0xff);
          this.print_op_info(this.PC-original_PC,"JSR $"+(Number(abs_addr).toString(16)));
          this.PC = abs_addr-1;
          break;
        case 0x21:  // AND indirect,X
          original_PC = this.PC;
          this.cycles++;
          this.A[0] = byteToUnsigned(this.A[0]) & this.read_indirect_x();
          this.set_negative_zero(this.A[0]);
          this.print_op_info(this.PC-original_PC,"AND ($"+(Number(this.temp_load_addr).toString(16))+",X)");
          break;
        case 0x23:  // *RLA indirect,X (ROL+AND)
          original_PC = this.PC;
          this.cycles++;
          var val = this.read_indirect_x();
          val=this.rol(this.temp_load_addr, val);
          this.A[0] = byteToUnsigned(this.A[0]) & val;
          this.set_negative_zero(this.A[0]);
          this.print_op_info(this.PC-original_PC,"*RLA $"+(Number(this.temp_load_addr).toString(16)));
          break;
        case 0x24:  // BIT zeropage
          original_PC = this.PC;
          this.cycles+=2;
          var abs_addr = this.get_imm();
          var val = this.read_memory(abs_addr);
          this.set_flag_zero((byteToUnsigned(val) & byteToUnsigned(this.A[0]))?0:1);
          this.set_flag_negative(val&0x80);
          this.set_flag_overflow(val&0x40);
          this.print_op_info(this.PC-original_PC,"BIT $"+Number(abs_addr).toString(16));
          break;
        case 0x25:  // AND zeropage
          original_PC = this.PC;
          this.cycles++;
          this.A[0] = byteToUnsigned(this.A[0]) & this.read_zeropage();
          this.set_negative_zero(this.A[0]);
          this.print_op_info(this.PC-original_PC,"AND $"+(Number(this.temp_load_addr).toString(16)));
          break;
        case 0x26:  // ROL zeropage (rotate left)
          original_PC = this.PC;
          this.cycles++;
          var val = this.read_zeropage();
          this.rol(this.temp_load_addr, val);
          this.print_op_info(this.PC-original_PC,"ROL $"+(Number(this.temp_load_addr).toString(16)));
          break;
        case 0x27:  // *RLA zeropage (ROL+AND)
          original_PC = this.PC;
          this.cycles++;
          var val = this.read_zeropage();
          val=this.rol(this.temp_load_addr, val);
          this.A[0] = byteToUnsigned(this.A[0]) & val;
          this.set_negative_zero(this.A[0]);
          this.print_op_info(this.PC-original_PC,"*RLA $"+(Number(this.temp_load_addr).toString(16)));
          break;
        case 0x28:  // PLP (Pull Processor status)
          original_PC = this.PC;
          this.cycles+=3;
          this.set_processor_status(this.pop_stack());
          this.print_op_info(this.PC-original_PC,"PLP");
          break;
        case 0x29:  // AND imm
          original_PC = this.PC;
          this.cycles++;
          var imm = this.get_imm();
          this.A[0] = byteToUnsigned(this.A[0]) & byteToUnsigned(imm);
          this.set_negative_zero(this.A[0]);
          this.print_op_info(this.PC-original_PC,"AND #"+imm);
          break;
        case 0x2a:  // ROL A (rotate left, A)
          original_PC = this.PC;
          this.cycles++;
          var carry = this.get_flag_carry();
          this.set_flag_carry((this.A[0]&0x80)?1:0);
          this.A[0] = (byteToUnsigned(this.A[0])<<1)+carry;
          this.set_negative_zero(this.A[0]);
          this.print_op_info(this.PC-original_PC,"ROL A");
          break;
        case 0x2c:  // BIT abs
          original_PC = this.PC;
          this.cycles+=3;
          var val = this.read_absolute();
          this.set_flag_zero((byteToUnsigned(val) & byteToUnsigned(this.A[0]))?0:1);
          this.set_flag_negative(val&0x80);
          this.set_flag_overflow(val&0x40);
          this.print_op_info(this.PC-original_PC,"BIT $"+Number(abs_addr).toString(16));
          break;
        case 0x2d:  // AND abs
          original_PC = this.PC;
          this.cycles++;
          var val = this.read_absolute();
          this.A[0] = byteToUnsigned(this.A[0]) & val;
          this.set_negative_zero(this.A[0]);
          this.print_op_info(this.PC-original_PC,"AND $"+(Number(abs_addr).toString(16)));
          break;
        case 0x2e:  // ROL abs (rotate left)
          original_PC = this.PC;
          this.cycles++;
          var val = this.read_absolute();
          this.rol(this.temp_load_addr, val);
          this.print_op_info(this.PC-original_PC,"ROL $"+(Number(this.temp_load_addr).toString(16)));
          break;
        case 0x2f:  // *RLA abs (ROL+AND)
          original_PC = this.PC;
          this.cycles++;
          var val = this.read_absolute();
          val=this.rol(this.temp_load_addr, val);
          this.A[0] = byteToUnsigned(this.A[0]) & val;
          this.set_negative_zero(this.A[0]);
          this.print_op_info(this.PC-original_PC,"*RLA $"+(Number(this.temp_load_addr).toString(16)));
          break;
        case 0x30:  // BMI (Branch on MInus)
          original_PC = this.PC;
          this.cycles++;
          var offset = byteToSigned(this.get_imm());
          if(offset < 0) offset -= 2;
          this.print_op_info(this.PC-original_PC,"BMI $"+(this.PC+offset+1).toString(16));
          if(this.get_flag_negative()) this.PC += offset;
          break;
        case 0x31:  // AND indirect,Y
          original_PC = this.PC;
          this.cycles++;
          this.A[0] = byteToUnsigned(this.A[0]) & this.read_indirect_y();
          this.set_negative_zero(this.A[0]);
          this.print_op_info(this.PC-original_PC,"AND ($"+(Number(this.temp_load_addr).toString(16))+"),Y");
          break;
        case 0x33:  // *RLA indirect,Y (ROL+AND)
          original_PC = this.PC;
          this.cycles++;
          var val = this.read_indirect_y();
          val=this.rol(this.temp_load_addr, val);
          this.A[0] = byteToUnsigned(this.A[0]) & val;
          this.set_negative_zero(this.A[0]);
          this.print_op_info(this.PC-original_PC,"*RLA ($"+(Number(this.temp_load_addr).toString(16))+"),Y");
          break;
        case 0x34:  // *NOP zeropage,X
          original_PC = this.PC;
          this.cycles+=3;
          var imm = this.get_imm();
          this.print_op_info(this.PC-original_PC,"*NOP $"+Number(imm).toString(16));
          break;
        case 0x35:  // AND zeropage,X
          original_PC = this.PC;
          this.cycles++;
          this.A[0] = byteToUnsigned(this.A[0]) & this.read_zeropage_x();
          this.set_negative_zero(this.A[0]);
          this.print_op_info(this.PC-original_PC,"AND $"+(Number(this.temp_load_addr).toString(16))+",X");
          break;
        case 0x36:  // ROL zeropage,X (rotate left)
          original_PC = this.PC;
          this.cycles++;
          var val = this.read_zeropage_x();
          this.rol(this.temp_load_addr, val);
          this.print_op_info(this.PC-original_PC,"ROL $"+(Number(this.temp_load_addr).toString(16))+",X");
          break;
        case 0x37:  // *RLA zeropage,X (ROL+AND)
          original_PC = this.PC;
          this.cycles++;
          var val = this.read_zeropage_x();
          val=this.rol(this.temp_load_addr, val);
          this.A[0] = byteToUnsigned(this.A[0]) & val;
          this.set_negative_zero(this.A[0]);
          this.print_op_info(this.PC-original_PC,"*RLA $"+(Number(this.temp_load_addr).toString(16))+",X");
          break;
        case 0x38:  // SEC (set Carry)
          original_PC = this.PC;
          this.cycles++;
          this.set_flag_carry(1);
          this.print_op_info(this.PC-original_PC,"SEC");
          break;
        case 0x39:  // AND abs,Y
          original_PC = this.PC;
          this.cycles++;
          var val = this.read_absolute_y();
          this.A[0] = byteToUnsigned(this.A[0]) & val;
          this.set_negative_zero(this.A[0]);
          this.print_op_info(this.PC-original_PC,"AND $"+(Number(abs_addr).toString(16)));
          break;
        case 0x3b:  // *RLA abs,Y (ROL+AND)
          original_PC = this.PC;
          this.cycles++;
          var val = this.read_absolute_y();
          val=this.rol(this.temp_load_addr, val);
          this.A[0] = byteToUnsigned(this.A[0]) & val;
          this.set_negative_zero(this.A[0]);
          this.print_op_info(this.PC-original_PC,"*RLA $"+(Number(this.temp_load_addr).toString(16))+",Y");
          break;
        case 0x3d:  // AND abs,X
          original_PC = this.PC;
          this.PC++;
          this.cycles+=3;
          var abs_addr = this.load_abs_addr(this.PC)+this.X[0];
          this.PC++;
          var val = this.read_memory(abs_addr);
          this.A[0] &= val;
          this.set_negative_zero(this.A[0]);
          this.print_op_info(this.PC-original_PC,"AND $"+Number(abs_addr).toString(16)+",X");
          break;
        case 0x3e:  // ROL abs,X (rotate left)
          original_PC = this.PC;
          this.cycles++;
          var val = this.read_absolute_x();
          this.rol(this.temp_load_addr, val);
          this.print_op_info(this.PC-original_PC,"ROL $"+(Number(this.temp_load_addr).toString(16))+",X");
          break;
        case 0x3f:  // *RLA abs,X (ROL+AND)
          original_PC = this.PC;
          this.cycles++;
          var val = this.read_absolute_x();
          val=this.rol(this.temp_load_addr, val);
          this.A[0] = byteToUnsigned(this.A[0]) & val;
          this.set_negative_zero(this.A[0]);
          this.print_op_info(this.PC-original_PC,"*RLA $"+(Number(this.temp_load_addr).toString(16))+",X");
          break;
        case 0x40:  // RTI (return from interrupt)
          original_PC = this.PC;
          this.cycles++;
          this.set_processor_status(this.pop_stack());
          var abs_addr = (byteToUnsigned(this.pop_stack())) +(byteToUnsigned(this.pop_stack())<<8);
          this.print_op_info(this.PC-original_PC,"RTI $"+Number(abs_addr).toString(16));
          this.PC = abs_addr-1;
          break;
        case 0x41:  // EOR indirect,X (Exclusive or)
          original_PC = this.PC;
          this.cycles+=2;
          var val = this.read_indirect_x()^this.A[0];
          this.A[0] = val;
          this.set_negative_zero(val);
          this.print_op_info(this.PC-original_PC,"EOR ($"+Number(this.temp_load_addr).toString(16)+",X)");
          break;
        case 0x43:  // *SRE indirect,X (LSR+EOR)
          original_PC = this.PC;
          this.cycles++;
          var val = this.read_indirect_x();
          this.A[0] = this.lsr(this.temp_load_addr,val)^this.A[0];
          this.set_negative_zero(this.A[0]);
          this.print_op_info(this.PC-original_PC,"*SRE ($"+Number(this.temp_load_addr).toString(16)+",X)");
          break;
        case 0x44:  // *NOP zeropage
          original_PC = this.PC;
          this.cycles+=2;
          var imm = this.get_imm();
          this.print_op_info(this.PC-original_PC,"*NOP $"+Number(imm).toString(16));
          break;
        case 0x45:  // EOR zero_page (Exclusive or)
          original_PC = this.PC;
          this.cycles+=2;
          var val = this.read_zeropage()^this.A[0];
          this.A[0] = val;
          this.set_negative_zero(val);
          this.print_op_info(this.PC-original_PC,"EOR $00"+Number(this.temp_load_addr).toString(16));
          break;
        case 0x46:  // LSR zeropage (logical shift right)
          original_PC = this.PC;
          this.cycles++;
          var val = this.read_zeropage();
          this.lsr(this.temp_load_addr,val);
          this.print_op_info(this.PC-original_PC,"LSR $"+Number(this.temp_load_addr).toString(16));
          break;
        case 0x47:  // *SRE zeropage (LSR+EOR)
          original_PC = this.PC;
          this.cycles++;
          var val = this.read_zeropage();
          this.A[0] = this.lsr(this.temp_load_addr,val)^this.A[0];
          this.set_negative_zero(this.A[0]);
          this.print_op_info(this.PC-original_PC,"*SRE $"+Number(this.temp_load_addr).toString(16));
          break;
        case 0x48:  // PHA (Push Accumulator)
          original_PC = this.PC;
          this.cycles+=2;
          this.push_stack(this.A[0]);
          this.print_op_info(this.PC-original_PC,"PHA");
          break;
        case 0x49:  // EOR imm (Exclusive or)
          original_PC = this.PC;
          this.cycles+=2;
          var val = this.get_imm()^this.A[0];
          this.A[0] = val;
          this.set_negative_zero(val);
          this.print_op_info(this.PC-original_PC,"EOR #$"+Number(val).toString(16));
          break;
        case 0x4a:  // LSR (logical shift right)
          original_PC = this.PC;
          this.cycles++;
          this.set_flag_carry(this.A[0]&1);
          this.A[0] = byteToUnsigned(this.A[0])>>1;
          this.set_negative_zero(this.A[0]);
          this.print_op_info(this.PC-original_PC,"LSR");
          break;
        case 0x4c:  // JMP, abs
          original_PC = this.PC;
          this.cycles+=2;
          var abs_addr = this.get_addr_absolute();
          this.print_op_info(this.PC-original_PC,"JMP $"+Number(abs_addr).toString(16));
          this.PC = abs_addr-1;
          break;
        case 0x4d:  // EOR abs (Exclusive or)
          original_PC = this.PC;
          this.cycles+=3;
          var val = this.read_absolute()^this.A[0];
          this.A[0] = val;
          this.set_negative_zero(val);
          this.print_op_info(this.PC-original_PC,"EOR $"+Number(this.temp_load_addr).toString(16));
          break;
        case 0x4e:  // LSR abs (logical shift right)
          original_PC = this.PC;
          this.cycles++;
          var val = this.read_absolute();
          this.lsr(this.temp_load_addr,val);
          this.print_op_info(this.PC-original_PC,"LSR $"+Number(this.temp_load_addr).toString(16));
          break;
        case 0x4f:  // *SRE abs (LSR+EOR)
          original_PC = this.PC;
          this.cycles++;
          var val = this.read_absolute();
          this.A[0] = this.lsr(this.temp_load_addr,val)^this.A[0];
          this.set_negative_zero(this.A[0]);
          this.print_op_info(this.PC-original_PC,"*SRE $"+Number(this.temp_load_addr).toString(16));
          break;
        case 0x50:  // BVC (Branch on oVerflow Clear)
          original_PC = this.PC;
          this.PC++;
          this.cycles++;
          var offset = byteToSigned(this.read_memory(this.PC));
          if(offset < 0) offset -= 2;
          this.print_op_info(this.PC-original_PC,"BVC $"+(this.PC+offset+1).toString(16));
          if(this.get_flag_overflow() == false) this.PC += offset;
          break;
        case 0x51:  // EOR indirect,Y (Exclusive or)
          original_PC = this.PC;
          this.cycles+=2;
          var val = this.read_indirect_y()^this.A[0];
          this.A[0] = val;
          this.set_negative_zero(val);
          this.print_op_info(this.PC-original_PC,"EOR ($"+Number(this.temp_load_addr).toString(16)+"),Y");
          break;
        case 0x53:  // *SRE indirect,Y (LSR+EOR)
          original_PC = this.PC;
          this.cycles++;
          var val = this.read_indirect_y();
          this.A[0] = this.lsr(this.temp_load_addr,val)^this.A[0];
          this.set_negative_zero(this.A[0]);
          this.print_op_info(this.PC-original_PC,"*SRE ($"+Number(this.temp_load_addr).toString(16)+"),Y");
          break;
        case 0x54:  // *NOP zeropage,X
          original_PC = this.PC;
          this.cycles+=3;
          var imm = this.get_imm();
          this.print_op_info(this.PC-original_PC,"*NOP $"+Number(imm).toString(16));
          break;
        case 0x55:  // EOR zero_page,X (Exclusive or)
          original_PC = this.PC;
          this.cycles+=2;
          var val = this.read_zeropage_x()^this.A[0];
          this.A[0] = val;
          this.set_negative_zero(val);
          this.print_op_info(this.PC-original_PC,"EOR $"+Number(this.temp_load_addr).toString(16)+",X");
          break;
        case 0x56:  // LSR zeropage,X (logical shift right)
          original_PC = this.PC;
          this.cycles++;
          var val = this.read_zeropage_x();
          this.lsr(this.temp_load_addr,val);
          this.print_op_info(this.PC-original_PC,"LSR "+Number(this.temp_load_addr).toString(16)+",X");
          break;
        case 0x57:  // *SRE zeropage,X (LSR+EOR)
          original_PC = this.PC;
          this.cycles++;
          var val = this.read_zeropage_x();
          this.A[0] = this.lsr(this.temp_load_addr,val)^this.A[0];
          this.set_negative_zero(this.A[0]);
          this.print_op_info(this.PC-original_PC,"*SRE $"+Number(this.temp_load_addr).toString(16)+",X");
          break;
        case 0x59:  // EOR abs,Y (Exclusive or)
          original_PC = this.PC;
          this.cycles+=3;
          var val = this.read_absolute_y()^this.A[0];
          this.A[0] = val;
          this.set_negative_zero(val);
          this.print_op_info(this.PC-original_PC,"EOR $"+Number(this.temp_load_addr).toString(16)+",Y");
          break;
        case 0x5b:  // *SRE abs,Y (LSR+EOR)
          original_PC = this.PC;
          this.cycles++;
          var val = this.read_absolute_y();
          this.A[0] = this.lsr(this.temp_load_addr,val)^this.A[0];
          this.set_negative_zero(this.A[0]);
          this.print_op_info(this.PC-original_PC,"*SRE $"+Number(this.temp_load_addr).toString(16)+",Y");
          break;
        case 0x5d:  // EOR abs,X (Exclusive or)
          original_PC = this.PC;
          this.cycles+=3;
          var val = this.read_absolute_x()^this.A[0];
          this.A[0] = val;
          this.set_negative_zero(val);
          this.print_op_info(this.PC-original_PC,"EOR $"+Number(this.temp_load_addr).toString(16)+",X");
          break;
        case 0x5e:  // LSR abs,X (logical shift right)
          original_PC = this.PC;
          this.cycles++;
          var val = this.read_absolute_x();
          this.lsr(this.temp_load_addr,val);
          this.print_op_info(this.PC-original_PC,"LSR $"+Number(this.temp_load_addr).toString(16)+",X");
          break;
        case 0x5f:  // *SRE abs,X (LSR+EOR)
          original_PC = this.PC;
          this.cycles++;
          var val = this.read_absolute_x();
          this.A[0] = this.lsr(this.temp_load_addr,val)^this.A[0];
          this.set_negative_zero(this.A[0]);
          this.print_op_info(this.PC-original_PC,"*SRE $"+Number(this.temp_load_addr).toString(16)+",X");
          break;
        case 0x60:  // RTS (return from subroutine)
          original_PC = this.PC;
          this.cycles++;
          var abs_addr = (byteToUnsigned(this.pop_stack())) +(byteToUnsigned(this.pop_stack())<<8);
          this.print_op_info(this.PC-original_PC,"RTS $"+Number(abs_addr).toString(16));
          this.PC = abs_addr;
          break;
        case 0x61:  // ADC indirect, X (add with carry)
          original_PC = this.PC;
          this.cycles++;
          var val = this.read_indirect_x();
          this.adc(val);
          this.print_op_info(this.PC-original_PC,"ADC ($"+(val).toString(16)+",X)");
          break;
        case 0x63:  // *RRA indirect,X (ROR+ADC)
          original_PC = this.PC;
          this.cycles++;
          var val = this.read_indirect_x();
          val = this.ror(this.temp_load_addr, val);
          this.adc(val);
          this.print_op_info(this.PC-original_PC,"*RRA ($"+(this.temp_load_addr).toString(16)+",X)");
          break;
        case 0x64:  // *NOP zeropage
          original_PC = this.PC;
          this.cycles+=2;
          var imm = this.get_imm();
          this.print_op_info(this.PC-original_PC,"*NOP $"+Number(imm).toString(16));
          break;
        case 0x65:  // ADC zeropage (add with carry)
          original_PC = this.PC;
          this.cycles++;
          var val = this.read_zeropage();
          this.adc(val);
          this.print_op_info(this.PC-original_PC,"ADC $"+(val).toString(16));
          break;
        case 0x66:  // ROR zeropage (rotate right)
          original_PC = this.PC;
          this.cycles++;
          var val = this.read_zeropage();
          this.ror(this.temp_load_addr, val);
          this.print_op_info(this.PC-original_PC,"ROR $"+(this.temp_load_addr).toString(16));
          break;
        case 0x67:  // *RRA zeropage (ROR+ADC)
          original_PC = this.PC;
          this.cycles++;
          var val = this.read_zeropage();
          val = this.ror(this.temp_load_addr, val);
          this.adc(val);
          this.print_op_info(this.PC-original_PC,"*RRA $"+(this.temp_load_addr).toString(16));
          break;
        case 0x68:  // PLA (Pull Accumulator)
          original_PC = this.PC;
          this.cycles+=3;
          this.A[0] = this.pop_stack();
          this.set_negative_zero(this.A[0]);
          this.print_op_info(this.PC-original_PC,"PLA");
          break;
        case 0x69:  // ADC imm (add with carry)
          original_PC = this.PC;
          this.cycles++;
          var val = this.get_imm();
          this.adc(val);
          this.print_op_info(this.PC-original_PC,"ADC #$"+(val).toString(16));
          break;
        case 0x6a:  // ROR A (rotate right, A)
          original_PC = this.PC;
          this.cycles++;
          var carry = this.get_flag_carry();
          this.set_flag_carry((this.A[0]&1));
          this.A[0] = (byteToUnsigned(this.A[0])>>1)+(carry?0x80:0);
          this.set_negative_zero(this.A[0]);
          this.print_op_info(this.PC-original_PC,"ROR A");
          break;
        case 0x6c:  // JMP, indirect
          original_PC = this.PC;
          this.cycles+=4;
          var abs_addr = this.get_addr_absolute();
          this.print_op_info(this.PC-original_PC,"JMP ($"+Number(abs_addr).toString(16)+")");
          var jmp_addr = 0;
          if(abs_addr&0xff == 0xff) {
            jmp_addr = byteToUnsigned(this.read_memory(abs_addr))+ (byteToUnsigned(this.read_memory(abs_addr&0xff00))<<8);
          } else {
            jmp_addr = this.load_abs_addr(abs_addr);
          }
          this.PC = jmp_addr-1;
          break;
        case 0x6d:  // ADC abs (add with carry)
          original_PC = this.PC;
          this.cycles+=3;
          this.adc(this.read_absolute());
          this.print_op_info(this.PC-original_PC,"ADC $"+(this.temp_load_addr).toString(16));
          break;
        case 0x6e:  // ROR abs (rotate right)
          original_PC = this.PC;
          this.cycles++;
          var val = this.read_absolute();
          this.ror(this.temp_load_addr, val);
          this.print_op_info(this.PC-original_PC,"ROR $"+(this.temp_load_addr).toString(16));
          break;
        case 0x6f:  // *RRA abs (ROR+ADC)
          original_PC = this.PC;
          this.cycles++;
          var val = this.read_absolute();
          val = this.ror(this.temp_load_addr, val);
          this.adc(val);
          this.print_op_info(this.PC-original_PC,"*RRA $"+(this.temp_load_addr).toString(16));
          break;
        case 0x70:  // BVS (Branch on oVerflow Set)
          original_PC = this.PC;
          this.PC++;
          this.cycles++;
          var offset = byteToSigned(this.read_memory(this.PC));
          if(offset < 0) offset -= 2;
          this.print_op_info(this.PC-original_PC,"BVS $"+(this.PC+offset+1).toString(16));
          if(this.get_flag_overflow()) this.PC += offset;
          break;
        case 0x71:  // ADC indirect, Y (add with carry)
          original_PC = this.PC;
          this.cycles++;
          var val = this.read_indirect_y();
          this.adc(val);
          this.print_op_info(this.PC-original_PC,"ADC ($"+(val).toString(16)+"),Y");
          break;
        case 0x73:  // *RRA indirect,Y (ROR+ADC)
          original_PC = this.PC;
          this.cycles++;
          var val = this.read_indirect_y();
          val = this.ror(this.temp_load_addr, val);
          this.adc(val);
          this.print_op_info(this.PC-original_PC,"*RRA ($"+(this.temp_load_addr).toString(16)+"),Y");
          break;
        case 0x74:  // *NOP zeropage,X
          original_PC = this.PC;
          this.cycles+=3;
          var imm = this.get_imm();
          this.print_op_info(this.PC-original_PC,"*NOP $"+Number(imm).toString(16));
          break;
        case 0x75:  // ADC zeropage,X (add with carry)
          original_PC = this.PC;
          this.cycles++;
          var val = this.read_zeropage_x();
          this.adc(val);
          this.print_op_info(this.PC-original_PC,"ADC $"+Number(this.temp_load_addr).toString(16)+",X");
          break;
        case 0x76:  // ROR zeropage,X (rotate right)
          original_PC = this.PC;
          this.cycles++;
          var val = this.read_zeropage_x();
          this.ror(this.temp_load_addr, val);
          this.print_op_info(this.PC-original_PC,"ROR $"+(this.temp_load_addr).toString(16)+",X");
          break;
        case 0x77:  // *RRA zeropage,X (ROR+ADC)
          original_PC = this.PC;
          this.cycles++;
          var val = this.read_zeropage_x();
          val = this.ror(this.temp_load_addr, val);
          this.adc(val);
          this.print_op_info(this.PC-original_PC,"*RRA $"+(this.temp_load_addr).toString(16)+",X");
          break;
        case 0x78:  // SEI
          original_PC = this.PC;
          this.P[0] = (this.P[0] | 2);
          this.print_op_info(this.PC-original_PC,"SEI");
          break;
        case 0x79:  // ADC abs,Y (add with carry)
          original_PC = this.PC;
          this.cycles+=3;
          this.adc(this.read_absolute_y());
          this.print_op_info(this.PC-original_PC,"ADC $"+(this.temp_load_addr).toString(16));
          break;
        case 0x7b:  // *RRA abs,Y (ROR+ADC)
          original_PC = this.PC;
          this.cycles++;
          var val = this.read_absolute_y();
          val = this.ror(this.temp_load_addr, val);
          this.adc(val);
          this.print_op_info(this.PC-original_PC,"*RRA $"+(this.temp_load_addr).toString(16)+",Y");
          break;
        case 0x7d:  // ADC abs,X (add with carry)
          original_PC = this.PC;
          this.cycles+=3;
          this.adc(this.read_absolute_x());
          this.print_op_info(this.PC-original_PC,"ADC $"+(this.temp_load_addr).toString(16)+",X");
          break;
        case 0x7e:  // ROR abs,X
          original_PC = this.PC;
          this.cycles+=3;
          var val = this.read_absolute_x();
          this.ror(this.temp_load_addr, val);
          this.print_op_info(this.PC-original_PC,"ROR $"+Number(abs_addr).toString(16)+",X");
          break;
        case 0x7f:  // *RRA abs,X (ROR+ADC)
          original_PC = this.PC;
          this.cycles++;
          var val = this.read_absolute_x();
          val = this.ror(this.temp_load_addr, val);
          this.adc(val);
          this.print_op_info(this.PC-original_PC,"*RRA $"+(this.temp_load_addr).toString(16)+",X");
          break;
        case 0x80:  // *NOP imm
          original_PC = this.PC;
          this.cycles++;
          var imm = this.get_imm();
          this.print_op_info(this.PC-original_PC,"*NOP #$"+Number(imm).toString(16));
          break;
        case 0x81:  // STA indirect, X
          original_PC = this.PC;
          this.cycles+=4;
          this.write_indirect_x(this.A[0]);
          this.print_op_info(this.PC-original_PC,"STA ($"+(this.temp_load_addr).toString(16)+",X)");
          break;
        case 0x83:  // *SAX indirect, X
          original_PC = this.PC;
          this.cycles+=4;
          this.write_indirect_x(this.A[0]&this.X[0]);
          this.print_op_info(this.PC-original_PC,"*SAX ($"+(this.temp_load_addr).toString(16)+",X)");
          break;
        case 0x84:  // STY zero_page
          original_PC = this.PC;
          this.cycles+=2;
          var abs_addr = this.get_imm();
          this.write_memory(abs_addr, this.Y[0]);
          this.print_op_info(this.PC-original_PC,"STY $"+Number(abs_addr).toString(16));
          break;
        case 0x85:  // STA zero_page
          original_PC = this.PC;
          this.cycles+=2;
          var abs_addr = this.get_imm();
          this.write_memory(abs_addr, this.A[0]);
          this.print_op_info(this.PC-original_PC,"STA $"+Number(abs_addr).toString(16));
          break;
        case 0x86:  // STX zero_page
          original_PC = this.PC;
          this.cycles+=2;
          var abs_addr = this.get_imm();
          this.write_memory(abs_addr, this.X[0]);
          this.print_op_info(this.PC-original_PC,"STX $"+Number(abs_addr).toString(16));
          break;
        case 0x87:  // *SAX zero_page
          original_PC = this.PC;
          this.cycles+=2;
          var abs_addr = this.get_imm();
          this.write_memory(abs_addr, this.A[0]&this.X[0]);
          this.print_op_info(this.PC-original_PC,"*SAX $"+Number(abs_addr).toString(16));
          break;
        case 0x88:  // DEY DEcrement Y
          original_PC = this.PC;
          this.cycles++;
          this.Y[0] = this.Y[0] - 1;
          this.set_negative_zero(this.Y[0]);
          this.print_op_info(this.PC-original_PC,"DEY");
          break;
        case 0x8a:  // TXA (Transfer X to A)
          original_PC = this.PC;
          this.cycles++;
          this.set_negative_zero(this.X[0]);
          this.A[0] = this.X[0];
          this.print_op_info(this.PC-original_PC,"TXA");
          break;
        case 0x8c:  // STY abs
          original_PC = this.PC;
          this.cycles+=2;
          var abs_addr = this.get_addr_absolute();
          this.write_memory(abs_addr, this.Y[0]);
          this.print_op_info(this.PC-original_PC,"STY $"+Number(abs_addr).toString(16));
          break;
        case 0x8d:  // STA abs
          original_PC = this.PC;
          this.cycles+=3;
          var abs_addr = this.get_addr_absolute();
          this.write_memory(abs_addr, this.A[0]);
          this.print_op_info(this.PC-original_PC,"STA $"+Number(abs_addr).toString(16));
          break;
        case 0x8e:  // STX abs
          original_PC = this.PC;
          this.cycles+=3;
          var abs_addr = this.get_addr_absolute();
          this.write_memory(abs_addr, this.X[0]);
          this.print_op_info(this.PC-original_PC,"STX $"+Number(abs_addr).toString(16));
          break;
        case 0x8f:  // *SAX abs
          original_PC = this.PC;
          this.cycles+=4;
          var abs_addr = this.get_addr_absolute();
          this.write_memory(abs_addr, this.A[0]&this.X[0]);
          this.print_op_info(this.PC-original_PC,"*SAX $"+Number(abs_addr).toString(16));
          break;
        case 0x90:  // BCC (Branch on Carry Clear)
          original_PC = this.PC;
          this.PC++;
          this.cycles++;
          var offset = byteToSigned(this.read_memory(this.PC));
          if(offset < 0) offset -= 2;
          this.print_op_info(this.PC-original_PC,"BCC $"+(this.PC+offset+1).toString(16));
          if(this.get_flag_carry() == false) this.PC += offset;
          break;
        case 0x91:  // STA indirect, Y
          original_PC = this.PC;
          this.cycles+=4;
          this.write_indirect_y(this.A[0]);
          this.print_op_info(this.PC-original_PC,"STA ($"+Number(this.temp_load_addr).toString(16)+"),Y");
          break;
        case 0x94:  // STY zero_page,X
          original_PC = this.PC;
          this.cycles+=2;
          var abs_addr = (this.get_imm()+this.X[0])&0xff;
          this.write_memory(abs_addr, this.Y[0]);
          this.print_op_info(this.PC-original_PC,"STY $00"+Number(abs_addr).toString(16));
          break;
        case 0x95:  // STA zero_page,X
          original_PC = this.PC;
          this.cycles+=2;
          var abs_addr = this.get_imm();
          this.write_memory((abs_addr+this.X[0])&0xff, this.A[0]);
          this.print_op_info(this.PC-original_PC,"STA $"+Number(abs_addr).toString(16)+",X");
          break;
        case 0x96:  // STX zero_page,Y
          original_PC = this.PC;
          this.cycles+=2;
          var abs_addr = (this.get_imm()+this.Y[0])&0xff;
          this.write_memory(abs_addr, this.X[0]);
          this.print_op_info(this.PC-original_PC,"STX $"+Number(abs_addr).toString(16)+",Y");
          break;
        case 0x97:  // *SAX zero_page,Y
          original_PC = this.PC;
          this.cycles+=2;
          var abs_addr = (this.get_imm()+this.Y[0])&0xff;
          this.write_memory(abs_addr, this.A[0]&this.X[0]);
          this.print_op_info(this.PC-original_PC,"*SAX $"+Number(abs_addr).toString(16)+",Y");
          break;
        case 0x98:  // TYA (Transfer Y to A)
          original_PC = this.PC;
          this.cycles++;
          this.set_negative_zero(this.Y[0]);
          this.A[0] = this.Y[0];
          this.print_op_info(this.PC-original_PC,"TYA");
          break;
        case 0x99:  // STA abs,y
          original_PC = this.PC;
          this.cycles+=3;
          this.PC++;
          var abs_addr = this.load_abs_addr(this.PC)+this.Y[0];
          this.PC++;
          this.write_memory(abs_addr, this.A[0]);
          this.print_op_info(this.PC-original_PC,"STA $"+(abs_addr).toString(16)+",Y");
          break;
        case 0x9a:  // TXS
          original_PC = this.PC;
          this.S = this.X[0];
          this.print_op_info(this.PC-original_PC,"TXS");
          break;
        case 0x9d:  // STA abs,X
          original_PC = this.PC;
          this.PC++;
          this.cycles+=3;
          var abs_addr = this.load_abs_addr(this.PC)+this.X[0];
          this.write_memory(abs_addr, this.A[0]);
          this.PC++;
          this.print_op_info(this.PC-original_PC,"STA $"+Number(abs_addr).toString(16)+",X");
          break;
        case 0xa0:  // LDY imm
          original_PC = this.PC;
          this.PC++;
          this.cycles++;
          var imm = this.read_memory(this.PC);
          this.Y[0] = imm;
          this.set_negative_zero(this.Y[0]);
          this.print_op_info(this.PC-original_PC,"LDY #"+imm);
          break;
        case 0xa1:  // LDA indirect, X
          original_PC = this.PC;
          this.cycles+=4;
          this.A[0] = this.read_indirect_x();
          this.set_negative_zero(this.A[0]);
          this.print_op_info(this.PC-original_PC,"LDA ($"+Number(this.temp_load_addr).toString(16)+",X) @ "
            +" = "
            +Number(this.A[0]).toString(16).padStart(2,"0"));
          break;
        case 0xa2:  // LDX imm
          original_PC = this.PC;
          this.PC++;
          this.cycles++;
          var imm = this.read_memory(this.PC);
          this.X[0] = imm;
          this.set_negative_zero(this.X[0]);
          this.print_op_info(this.PC-original_PC,"LDX #"+imm);
          break;
        case 0xa3:  // *LAX indirect, X
          original_PC = this.PC;
          this.cycles+=4;
          this.A[0] = this.X[0] = this.read_indirect_x();
          this.set_negative_zero(this.X[0]);
          this.print_op_info(this.PC-original_PC,"*LDX ($"+Number(this.temp_load_addr).toString(16)+",X) @ "
            +" = "
            +Number(this.X[0]).toString(16).padStart(2,"0"));
          break;
        case 0xa4:  // LDY zeropage
          original_PC = this.PC;
          this.cycles+=2;
          var addr = this.get_imm();
          this.Y[0] = this.read_memory(addr);
          this.set_negative_zero(this.Y[0]);
          this.print_op_info(this.PC-original_PC,"LDY $00"+Number(addr).toString(16));
          break;
        case 0xa5:  // LDA zeropage
          original_PC = this.PC;
          this.cycles+=2;
          this.A[0] = this.read_zeropage();
          this.set_negative_zero(this.A[0]);
          this.print_op_info(this.PC-original_PC,"LDA $"+Number(this.temp_load_addr).toString(16));
          break;
        case 0xa6:  // LDX zeropage
          original_PC = this.PC;
          this.cycles+=2;
          this.X[0] = this.read_zeropage();
          this.set_negative_zero(this.X[0]);
          this.print_op_info(this.PC-original_PC,"LDX $"+Number(this.temp_load_addr).toString(16));
          break;
        case 0xa7:  // *LAX zeropage
          original_PC = this.PC;
          this.cycles+=4;
          this.A[0] = this.X[0] = this.read_zeropage();
          this.set_negative_zero(this.X[0]);
          this.print_op_info(this.PC-original_PC,"*LDX $"+Number(this.temp_load_addr).toString(16)+" @ "
            +" = "
            +Number(this.X[0]).toString(16).padStart(2,"0"));
          break;
        case 0xa8:  // TAY (Transfer A to Y)
          original_PC = this.PC;
          this.cycles++;
          this.set_negative_zero(this.A[0]);
          this.Y[0] = this.A[0];
          this.print_op_info(this.PC-original_PC,"TAY");
          break;
        case 0xa9:  // LDA imm
          original_PC = this.PC;
          this.cycles++;
          var imm = this.get_imm();
          this.A[0] = imm;
          this.set_negative_zero(this.A[0]);
          this.print_op_info(this.PC-original_PC,"LDA #"+imm);
          break;
        case 0xaa:  // TAX (Transfer A to X)
          original_PC = this.PC;
          this.cycles++;
          this.set_negative_zero(this.A[0]);
          this.X[0] = this.A[0];
          this.print_op_info(this.PC-original_PC,"TAX");
          break;
        case 0xac:  // LDY abs
          original_PC = this.PC;
          this.cycles+=3;
          this.Y[0] = this.read_absolute();
          this.set_negative_zero(this.Y[0]);
          this.print_op_info(this.PC-original_PC,"LDY $"+Number(this.temp_load_addr).toString(16));
          break;
        case 0xad:  // LDA abs
          original_PC = this.PC;
          this.cycles+=3;
          this.A[0] = this.read_absolute();
          this.set_negative_zero(this.A[0]);
          this.print_op_info(this.PC-original_PC,"LDA $"+Number(this.temp_load_addr).toString(16));
          break;
        case 0xae:  // LDX abs
          original_PC = this.PC;
          this.PC++;
          this.cycles+=3;
          var abs_addr = this.load_abs_addr(this.PC);
          this.X[0] = this.read_memory(abs_addr);
          this.PC++;
          this.set_negative_zero(this.X[0]);
          this.print_op_info(this.PC-original_PC,"LDX $"+Number(abs_addr).toString(16));
          break;
        case 0xaf:  // *LAX abs
          original_PC = this.PC;
          this.cycles+=3;
          this.A[0] = this.X[0] = this.read_absolute();
          this.set_negative_zero(this.X[0]);
          this.print_op_info(this.PC-original_PC,"*LDX $"+Number(this.temp_load_addr).toString(16)+" @ "
            +" = "
            +Number(this.X[0]).toString(16).padStart(2,"0"));
          break;
        case 0xb0:  // BCS (Branch on Carry Set)
          original_PC = this.PC;
          this.PC++;
          this.cycles++;
          var offset = byteToSigned(this.read_memory(this.PC));
          if(offset < 0) offset -= 2;
          this.print_op_info(this.PC-original_PC,"BCS $"+(this.PC+offset+1).toString(16));
          if(this.get_flag_carry()) this.PC += offset;
          break;
        case 0xb1:  // LDA indirect, Y
          original_PC = this.PC;
          this.cycles+=4;
          this.A[0] = this.read_indirect_y();
          this.set_negative_zero(this.A[0]);
          this.print_op_info(this.PC-original_PC,"LDA ($"+Number(this.temp_load_addr).toString(16)+"),Y");
          break;
        case 0xb3:  // *LAX indirect,Y
          original_PC = this.PC;
          this.cycles+=3;
          this.A[0] = this.X[0] = this.read_indirect_y();
          this.set_negative_zero(this.X[0]);
          this.print_op_info(this.PC-original_PC,"*LDX ($"+Number(this.temp_load_addr).toString(16)+"),Y @ "
            +" = "
            +Number(this.X[0]).toString(16).padStart(2,"0"));
          break;
        case 0xb4:  // LDY zeropage,X
          original_PC = this.PC;
          this.cycles+=2;
          var addr = this.get_imm();
          this.Y[0] = this.read_memory((addr+this.X[0])&0xff);
          this.set_negative_zero(this.Y[0]);
          this.print_op_info(this.PC-original_PC,"LDY $"+Number(addr).toString(16)+",X");
          break;
        case 0xb5:  // LDA zeropage,X
          original_PC = this.PC;
          this.cycles+=2;
          this.A[0] = this.read_zeropage_x();
          this.set_negative_zero(this.A[0]);
          this.print_op_info(this.PC-original_PC,"LDA $"+Number(this.temp_load_addr).toString(16)+",X");
          break;
        case 0xb6:  // LDX zeropage,Y
          original_PC = this.PC;
          this.cycles+=2;
          this.X[0] = this.read_zeropage_y();
          this.set_negative_zero(this.X[0]);
          this.print_op_info(this.PC-original_PC,"LDX $"+Number(this.temp_load_addr).toString(16)+",Y");
          break;
        case 0xb7:  // *LAX zeropage,Y
          original_PC = this.PC;
          this.cycles+=3;
          this.A[0] = this.X[0] = this.read_zeropage_y();
          this.set_negative_zero(this.X[0]);
          this.print_op_info(this.PC-original_PC,"*LDX $"+Number(this.temp_load_addr).toString(16)+",Y @ "
            +" = "
            +Number(this.X[0]).toString(16).padStart(2,"0"));
          break;
        case 0xb8:  // CLV
          original_PC = this.PC;
          this.cycles++;
          this.set_flag_overflow(0);
          this.print_op_info(this.PC-original_PC,"CLV");
          break;
        case 0xb9:  // LDA abs, Y
          original_PC = this.PC;
          this.cycles+=4;
          this.A[0] = this.read_absolute_y();
          this.set_negative_zero(this.A[0]);
          this.print_op_info(this.PC-original_PC,"LDA ($"+Number(this.temp_load_addr).toString(16)+"),Y) @ "
            +Number(abs_addr+this.Y[0]).toString(16).padStart(2,"0")+ " = "
            +Number(this.A[0]).toString(16).padStart(2,"0"));
          break;
        case 0xba:  // TSX
          original_PC = this.PC;
          this.X[0] = this.S;
          this.set_negative_zero(this.X[0]);
          this.print_op_info(this.PC-original_PC,"TSX");
          break;
        case 0xbd:  // LDA abs,X
          original_PC = this.PC;
          this.cycles+=3;
          this.A[0] = this.read_absolute_x();
          this.set_negative_zero(this.A[0]);
          this.print_op_info(this.PC-original_PC,"LDA $"+Number(this.temp_load_addr).toString(16)+",X");
          break;
        case 0xbc:  // LDY abs,X
          original_PC = this.PC;
          this.cycles+=3;
          this.Y[0] = this.read_absolute_x();
          this.set_negative_zero(this.Y[0]);
          this.print_op_info(this.PC-original_PC,"LDY $"+Number(this.temp_load_addr).toString(16)+",X");
          break;
        case 0xbe:  // LDX abs,y
          original_PC = this.PC;
          this.cycles+=3;
          var abs_addr = this.get_addr_absolute();
          this.X[0] = this.read_memory(abs_addr+this.Y[0]);
          this.set_negative_zero(this.X[0]);
          this.print_op_info(this.PC-original_PC,"LDX $"+(abs_addr).toString(16)+",Y");
          break;
        case 0xbf:  // *LAX abs,Y
          original_PC = this.PC;
          this.cycles+=2;
          this.A[0] = this.X[0] = this.read_absolute_y();
          this.set_negative_zero(this.X[0]);
          this.print_op_info(this.PC-original_PC,"*LAX $"+Number(this.temp_load_addr).toString(16)+",Y");
          break;
        case 0xc0:  // CPY imm
          original_PC = this.PC;
          this.cycles++;
          var imm = this.get_imm();
          this.cmp(this.Y[0], imm);
          this.print_op_info(this.PC-original_PC,"CPY #"+imm);
          break;
        case 0xc1:  // CMP indirect, X
          original_PC = this.PC;
          this.cycles++;
          var imm = this.read_indirect_x();
          this.cmp(this.A[0], imm);
          this.print_op_info(this.PC-original_PC,"CMP ($"+Number(this.temp_load_addr).toString(16)+", X)");
          break;
        case 0xc3:  // *DCP indirect,X (DEC+CMP)
          original_PC = this.PC;
          this.cycles+=5;
          var val = this.read_indirect_x();
          val = this.dec(this.temp_load_addr,val);
          this.cmp(this.A[0], val);
          this.print_op_info(this.PC-original_PC,"*DCP ($"+Number(this.temp_load_addr).toString(16)+",X)");
          break;
        case 0xc4:  // CPY zeropage
          original_PC = this.PC;
          this.cycles++;
          var imm = this.read_zeropage();
          this.cmp(this.Y[0], imm);
          this.print_op_info(this.PC-original_PC,"CPY $00");
          break;
        case 0xc5:  // CMP zeropage
          original_PC = this.PC;
          this.cycles++;
          var imm = this.read_zeropage();
          this.cmp(this.A[0], imm);
          this.print_op_info(this.PC-original_PC,"CMP $00");
          break;
        case 0xc6:  // DEC zero_page
          original_PC = this.PC;
          this.cycles+=2;
          var val = this.read_zeropage();
          this.dec(this.temp_load_addr,val);
          this.print_op_info(this.PC-original_PC,"DEC $"+Number(this.temp_load_addr).toString(16));
          break;
        case 0xc7:  // *DCP zeropage (DEC+CMP)
          original_PC = this.PC;
          this.cycles+=5;
          var val = this.read_zeropage();
          val = this.dec(this.temp_load_addr,val);
          this.cmp(this.A[0], val);
          this.print_op_info(this.PC-original_PC,"*DCP $"+Number(this.temp_load_addr).toString(16));
          break;
        case 0xc8:  // INY INcrement Y
          original_PC = this.PC;
          this.cycles++;
          this.Y[0] = this.Y[0] + 1;
          this.set_negative_zero(this.Y[0]);
          this.print_op_info(this.PC-original_PC,"INY");
          break;
        case 0xc9:  // CMP imm
          original_PC = this.PC;
          this.cycles++;
          var imm = this.get_imm();
          this.cmp(this.A[0], imm);
          this.print_op_info(this.PC-original_PC,"CMP #"+imm);
          break;
        case 0xca:  // DEX DEcrement X
          original_PC = this.PC;
          this.cycles++;
          this.X[0] = this.X[0] - 1;
          this.set_negative_zero(this.X[0]);
          this.print_op_info(this.PC-original_PC,"DEX");
          break;
        case 0xcc:  // CPY abs
          original_PC = this.PC;
          this.cycles++;
          var imm = this.read_absolute();
          this.cmp(this.Y[0], imm);
          this.print_op_info(this.PC-original_PC,"CPY $"+Number(abs_addr).toString(16));
          break;
        case 0xcd:  // CMP abs
          original_PC = this.PC;
          this.cycles++;
          var val = this.read_absolute();
          this.cmp(this.A[0], val);
          this.print_op_info(this.PC-original_PC,"CMP $"+Number(this.temp_load_addr).toString(16));
          break;
        case 0xce:  // DEC abs
          original_PC = this.PC;
          this.cycles+=5;
          var val = this.read_absolute();
          this.dec(this.temp_load_addr,val);
          this.print_op_info(this.PC-original_PC,"DEC $"+Number(this.temp_load_addr).toString(16));
          break;
        case 0xcf:  // *DCP abs (DEC+CMP)
          original_PC = this.PC;
          this.cycles+=5;
          var val = this.read_absolute();
          val = this.dec(this.temp_load_addr,val);
          this.cmp(this.A[0], val);
          this.print_op_info(this.PC-original_PC,"*DCP $"+Number(this.temp_load_addr).toString(16));
          break;
        case 0xd0:  // BNE (Branch if not equal)
          original_PC = this.PC;
          this.PC++;
          this.cycles++;
          var offset = byteToSigned(this.read_memory(this.PC));
          if(offset < 0) offset -= 2;
          this.print_op_info(this.PC-original_PC,"BNE $"+(this.PC+offset+1).toString(16));
          if(this.get_flag_zero() == false) this.PC += offset;
          break;
        case 0xd1:  // CMP indirect, Y
          original_PC = this.PC;
          this.cycles++;
          var imm = this.read_indirect_y();
          this.cmp(this.A[0], imm);
          this.print_op_info(this.PC-original_PC,"CMP ($"+Number(this.temp_load_addr).toString(16)+"), Y");
          break;
        case 0xd3:  // *DCP indirect,Y (DEC+CMP)
          original_PC = this.PC;
          this.cycles+=5;
          var val = this.read_indirect_y();
          val = this.dec(this.temp_load_addr,val);
          this.cmp(this.A[0], val);
          this.print_op_info(this.PC-original_PC,"*DCP ($"+Number(this.temp_load_addr).toString(16)+"),Y");
          break;
        case 0xd4:  // *NOP zeropage,X
          original_PC = this.PC;
          this.cycles+=3;
          var imm = this.get_imm();
          this.print_op_info(this.PC-original_PC,"*NOP $"+Number(imm).toString(16));
          break;
        case 0xd5:  // CMP zeropage,X
          original_PC = this.PC;
          this.cycles++;
          var imm = this.read_zeropage_x();
          this.cmp(this.A[0], imm);
          this.print_op_info(this.PC-original_PC,"CMP $"+Number(this.temp_load_addr).toString(16)+",X");
          break;
        case 0xd6:  // DEC zero_page,X
          original_PC = this.PC;
          this.cycles+=2;
          var val = this.read_zeropage_x();
          this.dec(this.temp_load_addr,val);
          this.print_op_info(this.PC-original_PC,"DEC $"+Number(this.temp_load_addr).toString(16)+",X");
          break;
        case 0xd7:  // *DCP zero_page,X (DEC+CMP)
          original_PC = this.PC;
          this.cycles+=5;
          var val = this.read_zeropage_x();
          val = this.dec(this.temp_load_addr,val);
          this.cmp(this.A[0], val);
          this.print_op_info(this.PC-original_PC,"*DCP $"+Number(this.temp_load_addr).toString(16)+",X");
          break;
        case 0xd8:  // CLD
          original_PC = this.PC;
          this.P[0] = (this.P[0] & 0xf7);
          this.print_op_info(this.PC-original_PC,"CLD");
          break;
        case 0xd9:  // CMP abs,Y
          original_PC = this.PC;
          this.cycles++;
          var val = this.read_absolute_y();
          this.cmp(this.A[0], val);
          this.print_op_info(this.PC-original_PC,"CMP $"+Number(this.temp_load_addr).toString(16)+",Y");
          break;
        case 0xdb:  // *DCP abs,Y (DEC+CMP)
          original_PC = this.PC;
          this.cycles+=5;
          var val = this.read_absolute_y();
          val = this.dec(this.temp_load_addr,val);
          this.cmp(this.A[0], val);
          this.print_op_info(this.PC-original_PC,"*DCP $"+Number(this.temp_load_addr).toString(16)+",Y");
          break;
        case 0xdd:  // CMP abs,X
          original_PC = this.PC;
          this.cycles++;
          var val = this.read_absolute_x();
          this.cmp(this.A[0], val);
          this.print_op_info(this.PC-original_PC,"CMP $"+Number(this.temp_load_addr).toString(16), ",X");
          break;
        case 0xde:  // DEC abs,X
          original_PC = this.PC;
          this.cycles+=5;
          var val = this.read_absolute_x();
          this.dec(this.temp_load_addr,val);
          this.print_op_info(this.PC-original_PC,"DEC $"+Number(this.temp_load_addr).toString(16)+",X");
          break;
        case 0xdf:  // *DCP abs,X (DEC+CMP)
          original_PC = this.PC;
          this.cycles+=5;
          var val = this.read_absolute_x();
          val = this.dec(this.temp_load_addr,val);
          this.cmp(this.A[0], val);
          this.print_op_info(this.PC-original_PC,"*DCP $"+Number(this.temp_load_addr).toString(16)+",X");
          break;
        case 0xe0:  // CPX imm
          original_PC = this.PC;
          this.cycles++;
          var imm = this.get_imm();
          this.cmp(this.X[0], imm);
          this.print_op_info(this.PC-original_PC,"CPX #"+imm);
          break;
        case 0xe1:  // SBC indirect, X (substract with carry)
          original_PC = this.PC;
          this.cycles++;
          var val = byteToUnsigned(this.read_indirect_x());
          val ^= 0xff;
          this.adc(val);
          this.print_op_info(this.PC-original_PC,"SBC ($,X)");
          break;
        case 0xe3:  // *ISB indirect, X (INC+SBC)
          original_PC = this.PC;
          this.cycles++;
          var val = byteToUnsigned(this.read_indirect_x()+1);
          this.write_memory(this.temp_load_addr, val);
          val ^= 0xff;
          this.adc(val);
          this.print_op_info(this.PC-original_PC,"*ISB ($"+Number(this.temp_load_addr).toString(16)+",X)");
          break;
        case 0xe4:  // CPX zeropage
          original_PC = this.PC;
          this.cycles++;
          var imm = this.read_zeropage();
          this.cmp(this.X[0], imm);
          this.print_op_info(this.PC-original_PC,"CPX $00");
          break;
        case 0xe5:  // SBC zeropage (substract with carry)
          original_PC = this.PC;
          this.cycles++;
          var val = byteToUnsigned(this.read_zeropage());
          val ^= 0xff;
          this.adc(val);
          this.print_op_info(this.PC-original_PC,"SBC $00");
          break;
        case 0xe6:  // INC zero_page
          original_PC = this.PC;
          this.cycles+=4;
          var val = (this.read_zeropage()+1)&0xff;
          this.write_memory(this.temp_load_addr, val);
          this.set_negative_zero(val);
          this.print_op_info(this.PC-original_PC,"INC $"+Number(this.temp_load_addr).toString(16));
          break;
        case 0xe7:  // *ISB zeropage (INC+SBC)
          original_PC = this.PC;
          this.cycles++;
          var val = byteToUnsigned(this.read_zeropage()+1);
          this.write_memory(this.temp_load_addr, val);
          val ^= 0xff;
          this.adc(val);
          this.print_op_info(this.PC-original_PC,"*ISB $"+Number(this.temp_load_addr).toString(16));
          break;
        case 0xe8:  // INX INcrement X
          original_PC = this.PC;
          this.cycles++;
          this.X[0] = this.X[0] + 1;
          this.set_negative_zero(this.X[0]);
          this.print_op_info(this.PC-original_PC,"INX");
          break;
        case 0xe9:  // SBC imm (substract with carry)
          original_PC = this.PC;
          this.cycles++;
          var val = byteToUnsigned(this.get_imm());
          val ^= 0xff;
          this.adc(val);
          this.print_op_info(this.PC-original_PC,"SBC #$"+Number(val).toString(16));
          break;
        case 0xea:  // NOP
          original_PC = this.PC;
          this.print_op_info(this.PC-original_PC,"NOP");
          break;
        case 0xeb:  // *SBC imm (substract with carry)
          original_PC = this.PC;
          this.cycles++;
          var val = byteToUnsigned(this.get_imm());
          val ^= 0xff;
          this.adc(val);
          this.print_op_info(this.PC-original_PC,"*SBC #$"+Number(val).toString(16));
          break;
        case 0xec:  // CPX abs
          original_PC = this.PC;
          this.cycles++;
          var val = this.read_absolute();
          this.cmp(this.X[0], val);
          this.print_op_info(this.PC-original_PC,"CPX $"+Number(this.temp_load_addr).toString(16));
          break;
        case 0xed:  // SBC abs (substract with carry)
          original_PC = this.PC;
          this.cycles++;
          var val = byteToUnsigned(this.read_absolute());
          val ^= 0xff;
          this.adc(val);
          this.print_op_info(this.PC-original_PC,"SBC $"+Number(this.temp_load_addr).toString(16));
          break;
        case 0xee: // INC abs
          original_PC = this.PC;
          this.cycles+=2;
          var val = byteToUnsigned(this.read_absolute());
          val = (val+1)&0xff;
          this.write_memory(this.temp_load_addr, val);
          this.set_negative_zero(val);
          this.print_op_info(this.PC-original_PC,"INC $"+Number(this.temp_load_addr).toString(16));
          break;
        case 0xef:  // *ISB abs (INC+SBC)
          original_PC = this.PC;
          this.cycles++;
          var val = byteToUnsigned(this.read_absolute()+1);
          this.write_memory(this.temp_load_addr, val);
          val ^= 0xff;
          this.adc(val);
          this.print_op_info(this.PC-original_PC,"*ISB $"+Number(this.temp_load_addr).toString(16));
          break;
        case 0xf0:  // BEQ (Branch if equal)
          original_PC = this.PC;
          this.PC++;
          this.cycles++;
          var offset = byteToSigned(this.read_memory(this.PC));
          if(offset < 0) offset -= 2;
          this.print_op_info(this.PC-original_PC,"BEQ $"+(this.PC+offset+1).toString(16));
          if(this.get_flag_zero()) this.PC += offset;
          break;
        case 0xf1:  // SBC indirect, Y (substract with carry)
          original_PC = this.PC;
          this.cycles++;
          var val = byteToUnsigned(this.read_indirect_y());
          val ^= 0xff;
          this.adc(val);
          this.print_op_info(this.PC-original_PC,"SBC ($),Y");
          break;
        case 0xf3:  // *ISB indirect,Y (INC+SBC)
          original_PC = this.PC;
          this.cycles++;
          var val = byteToUnsigned(this.read_indirect_y()+1);
          this.write_memory(this.temp_load_addr, val);
          val ^= 0xff;
          this.adc(val);
          this.print_op_info(this.PC-original_PC,"*ISB $"+Number(this.temp_load_addr).toString(16));
          break;
        case 0xf4:  // *NOP zeropage,X
          original_PC = this.PC;
          this.cycles+=3;
          var imm = this.get_imm();
          this.print_op_info(this.PC-original_PC,"*NOP $"+Number(imm).toString(16));
          break;
        case 0xf5:  // SBC zeropage,X (substract with carry)
          original_PC = this.PC;
          this.cycles++;
          var val = byteToUnsigned(this.read_zeropage_x());
          val ^= 0xff;
          this.adc(val);
          this.print_op_info(this.PC-original_PC,"SBC $"+Number(this.temp_load_addr).toString(16)+",X");
          break;
        case 0xf6:  // INC zero_page,X
          original_PC = this.PC;
          this.cycles+=4;
          var val = (this.read_zeropage_x()+1)&0xff;
          this.write_memory(this.temp_load_addr, val);
          this.set_negative_zero(val);
          this.print_op_info(this.PC-original_PC,"INC $"+Number(this.temp_load_addr).toString(16)+",X");
          break;
        case 0xf7:  // *ISB zeropage,X (INC+SBC)
          original_PC = this.PC;
          this.cycles++;
          var val = byteToUnsigned(this.read_zeropage_x()+1);
          this.write_memory(this.temp_load_addr, val);
          val ^= 0xff;
          this.adc(val);
          this.print_op_info(this.PC-original_PC,"*ISB $"+Number(this.temp_load_addr).toString(16));
          break;
        case 0xf8:  // SED
          original_PC = this.PC;
          this.P[0] = (this.P[0] | 0x8);
          this.print_op_info(this.PC-original_PC,"SED");
          break;
        case 0xf9:  // SBC abs,Y (substract with carry)
          original_PC = this.PC;
          this.cycles+=3;
          var val = this.read_absolute_y();
          this.adc(val^0xff);
          this.print_op_info(this.PC-original_PC,"SBC $"+Number(this.temp_load_addr).toString(16)+",Y");
          break;
        case 0xfb:  // *ISB abs,Y (INC+SBC)
          original_PC = this.PC;
          this.cycles++;
          var val = byteToUnsigned(this.read_absolute_y()+1);
          this.write_memory(this.temp_load_addr, val);
          val ^= 0xff;
          this.adc(val);
          this.print_op_info(this.PC-original_PC,"*ISB $"+Number(this.temp_load_addr).toString(16)+",Y");
          break;
        case 0xfd:  // SBC abs,X (substract with carry)
          original_PC = this.PC;
          this.cycles++;
          var val = byteToUnsigned(this.read_absolute_x());
          val ^= 0xff;
          this.adc(val);
          this.print_op_info(this.PC-original_PC,"SBC $"+Number(this.temp_load_addr).toString(16)+",X");
          break;
        case 0xfe: // INC abs,X
          original_PC = this.PC;
          this.cycles+=2;
          var val = byteToUnsigned(this.read_absolute_x());
          val = (val+1)&0xff;
          this.write_memory(this.temp_load_addr, val);
          this.set_negative_zero(val);
          this.print_op_info(this.PC-original_PC,"INC $"+Number(this.temp_load_addr).toString(16)+",X");
          break;
        case 0xff:  // *ISB abs,X (INC+SBC)
          original_PC = this.PC;
          this.cycles++;
          var val = byteToUnsigned(this.read_absolute_x()+1);
          this.write_memory(this.temp_load_addr, val);
          val ^= 0xff;
          this.adc(val);
          this.print_op_info(this.PC-original_PC,"*ISB $"+Number(this.temp_load_addr).toString(16)+",X");
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

  get_registers_string() {
    var registers = "A:"+Number(this.A[0]).toString(16).padStart(2,"0").toUpperCase();
    registers += " X:"+Number(this.X[0]).toString(16).padStart(2,"0").toUpperCase();
    registers += " Y:"+Number(this.Y[0]).toString(16).padStart(2,"0").toUpperCase();
    registers += " P:"+Number(this.P[0]).toString(16).padStart(2,"0").toUpperCase();
    registers += " SP:"+Number(this.S).toString(16).padStart(2,"0").toUpperCase();
    return registers;
  }

  print_op_info(offset, string) {

    if(this.debug & DEBUG_OPS) {
      var addr = Number(this.PC-offset).toString(16).padStart(4, "0").toUpperCase()+" ";
      var data = "";
      for(var i = 0; i < offset+1; i++) {
        data += " "+Number(this.memory_cpu[this.PC-offset+i]).toString(16).toUpperCase().padStart(2,"0");
      }

      console.log(addr+ data.padEnd(11) + string.padEnd(32)+this.temp_regstate);
    }
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
}

var system = new NESSystem();

process.on('SIGINT', function() {
  console.log("Caught interrupt signal");
  system.debug();
  process.exit(0);
});


function main()
{

  var binaryData = fs.readFileSync('./test/nestest.nes');
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


}



main();