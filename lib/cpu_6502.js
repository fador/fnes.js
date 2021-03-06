const {get_registers_string,print_op_info} = require("./debug_functions");
const {map_memory,read_memory,write_memory} = require("./memory_functions");
const {byteToSigned, byteToUnsigned} = require("./tool_functions");
const constants = require('./constants');

exports.cpu6502_one_op = function() {
  var addr = 0;
  var imm = 0;
  var abs_addr = 0;
  var val = 0;
  var value_addr = 0;
  var offset = 0;
  var carry = 0;

  if(this.debug & constants.DEBUG_OPS) this.temp_regstate = this.get_registers_string();
  //console.log(this.PC.toString(16)+": "+this.memory_cpu[this.PC].toString(16));
  //if(this.PC == 0x8057) return 0;
  //console.log("A:" + Number(this.A[0]).toString(16)+" X:" + Number(this.X[0]).toString(16)+" Y:" + Number(this.Y[0]).toString(16)+" PC " + this.PC.toString(16));
  if(this.nmi) {
    this.nmi = false;
    this.cycles+=2;
    addr = this.PC;
    this.push_stack((addr&0xff00)>>8);
    this.push_stack(addr&0xff);
    this.push_stack(this.P);
    this.PC = this.load_abs_addr(0xFFFA);
    //console.log("NMI $"+Number(this.PC).toString(16)+ " From $"+Number(addr).toString(16)+" Stack: "+Number(this.S+3).toString(16));
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
      val = this.read_indirect_x();
      val = this.asl(this.temp_load_addr, val);
      this.A[0] = byteToUnsigned(this.A[0]) | byteToUnsigned(val);
      this.set_negative_zero(this.A[0]);
      this.print_op_info(this.PC-original_PC,"*SLO ($"+Number(this.temp_load_addr).toString(16)+",X)");
      break;
    case 0x4:  // *NOP zeropage
      original_PC = this.PC;
      this.cycles+=2;
      imm = this.get_imm();
      this.print_op_info(this.PC-original_PC,"*NOP $"+Number(imm).toString(16));
      break;
    case 0x5:  // ORA zero_page
      original_PC = this.PC;
      this.cycles++;
      imm = this.read_zeropage();
      this.A[0] = byteToUnsigned(this.A[0]) | byteToUnsigned(imm);
      this.set_negative_zero(this.A[0]);
      this.print_op_info(this.PC-original_PC,"ORA $"+Number(this.temp_load_addr).toString(16));
      break;
    case 0x06:  // ASL zeropage (arithmetic shift left), accumulator
      original_PC = this.PC;
      this.cycles++;
      val = this.read_zeropage();
      this.asl(this.temp_load_addr, val);
      this.print_op_info(this.PC-original_PC,"ASL $"+Number(this.temp_load_addr).toString(16));
      break;
    case 0x07:  // *SLO zeropage (arithmetic shift left)
      original_PC = this.PC;
      this.cycles++;
      val = this.read_zeropage();
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
      imm = this.get_imm();
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
      abs_addr = this.get_addr_absolute();
      this.print_op_info(this.PC-original_PC,"*NOP $"+Number(abs_addr).toString(16));
      break;
    case 0xd:  // ORA abs
      original_PC = this.PC;
      this.cycles+=4;
      abs_addr = this.get_addr_absolute();
      this.A[0] = byteToUnsigned(this.A[0]) | byteToUnsigned(this.read_memory(abs_addr));
      this.set_negative_zero(this.A[0]);
      this.print_op_info(this.PC-original_PC,"ORA $"+(Number(this.temp_load_addr).toString(16)));
      break;
    case 0x0e:  // ASL abs (arithmetic shift left)
      original_PC = this.PC;
      this.cycles++;
      val = this.read_absolute();
      this.asl(this.temp_load_addr, val);
      this.print_op_info(this.PC-original_PC,"ASL $"+Number(this.temp_load_addr).toString(16));
      break;
    case 0x0f:  // *SLO abs (arithmetic shift left)
      original_PC = this.PC;
      this.cycles++;
      val = this.read_absolute();
      val = this.asl(this.temp_load_addr, val);
      this.A[0] = byteToUnsigned(this.A[0]) | byteToUnsigned(val);
      this.set_negative_zero(this.A[0]);
      this.print_op_info(this.PC-original_PC,"*SLO $"+Number(this.temp_load_addr).toString(16));
      break;
    case 0x10:  // BPL (Branch if positive)
      original_PC = this.PC;
      this.PC++;
      this.cycles++;
      offset = byteToSigned(this.read_memory(this.PC));
      if(offset < 0) offset -= 2;
      this.print_op_info(this.PC-original_PC,"BPL $"+(this.PC+offset+1).toString(16));
      if(this.get_flag_negative() === false) this.PC += offset;
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
      val = this.read_indirect_y();
      val = this.asl(this.temp_load_addr, val);
      this.A[0] = byteToUnsigned(this.A[0]) | byteToUnsigned(val);
      this.set_negative_zero(this.A[0]);
      this.print_op_info(this.PC-original_PC,"*SLO ($"+Number(this.temp_load_addr).toString(16)+"),Y");
      break;
    case 0x14:  // *NOP zeropage,X
      original_PC = this.PC;
      this.cycles+=3;
      imm = this.get_imm();
      this.print_op_info(this.PC-original_PC,"*NOP $"+Number(imm).toString(16));
      break;
    case 0x15:  // ORA zero_page,X
      original_PC = this.PC;
      this.cycles++;
      addr = (this.get_imm()+this.X[0])&0xff;
      imm = this.read_memory(byteToUnsigned(addr));
      this.A[0] = byteToUnsigned(this.A[0]) | byteToUnsigned(imm);
      this.set_negative_zero(this.A[0]);
      this.print_op_info(this.PC-original_PC,"ORA $"+Number(imm).toString(16)+",X");
      break;
    case 0x16:  // ASL zero_page,X (arithmetic shift left),
      original_PC = this.PC;
      this.cycles++;
      val = this.read_zeropage_x();
      this.asl(this.temp_load_addr, val);
      this.print_op_info(this.PC-original_PC,"ASL $"+Number(this.temp_load_addr).toString(16)+",X");
      break;
    case 0x17:  // *SLO zeropage,X (arithmetic shift left)
      original_PC = this.PC;
      this.cycles++;
      val = this.read_zeropage_x();
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
      value_addr = this.load_abs_addr(this.PC)+this.Y[0];
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
      val = this.read_absolute_y();
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
      abs_addr = this.get_addr_absolute();
      this.print_op_info(this.PC-original_PC,"*NOP #$"+Number(abs_addr).toString(16));
      break;
    case 0x1d:  // ORA abs,X
      original_PC = this.PC;
      this.cycles+=4;
      val = this.read_absolute_x();
      this.A[0] = byteToUnsigned(this.A[0]) | byteToUnsigned(val);
      this.set_negative_zero(this.A[0]);
      this.print_op_info(this.PC-original_PC,"ORA $"+(Number(this.temp_load_addr).toString(16)));
      break;
    case 0x1e:  // ASL abs,X (arithmetic shift left)
      original_PC = this.PC;
      this.cycles++;
      val = this.read_absolute_x();
      this.asl(this.temp_load_addr, val);
      this.print_op_info(this.PC-original_PC,"ASL $"+Number(this.temp_load_addr).toString(16)+",X");
      break;
    case 0x1f:  // *SLO abs,X (arithmetic shift left)
      original_PC = this.PC;
      this.cycles++;
      val = this.read_absolute_x();
      val = this.asl(this.temp_load_addr, val);
      this.A[0] = byteToUnsigned(this.A[0]) | byteToUnsigned(val);
      this.set_negative_zero(this.A[0]);
      this.print_op_info(this.PC-original_PC,"*SLO $"+Number(this.temp_load_addr).toString(16)+",X");
      break;
    case 0x20:  // JSR (Jump to subroutine)
      original_PC = this.PC;
      this.cycles+=5;
      abs_addr = this.get_addr_absolute();
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
      val = this.read_indirect_x();
      val=this.rol(this.temp_load_addr, val);
      this.A[0] = byteToUnsigned(this.A[0]) & val;
      this.set_negative_zero(this.A[0]);
      this.print_op_info(this.PC-original_PC,"*RLA $"+(Number(this.temp_load_addr).toString(16)));
      break;
    case 0x24:  // BIT zeropage
      original_PC = this.PC;
      this.cycles+=2;
      abs_addr = this.get_imm();
      val = this.read_memory(abs_addr);
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
      val = this.read_zeropage();
      this.rol(this.temp_load_addr, val);
      this.print_op_info(this.PC-original_PC,"ROL $"+(Number(this.temp_load_addr).toString(16)));
      break;
    case 0x27:  // *RLA zeropage (ROL+AND)
      original_PC = this.PC;
      this.cycles++;
      val = this.read_zeropage();
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
      imm = this.get_imm();
      this.A[0] = byteToUnsigned(this.A[0]) & byteToUnsigned(imm);
      this.set_negative_zero(this.A[0]);
      this.print_op_info(this.PC-original_PC,"AND #"+imm);
      break;
    case 0x2a:  // ROL A (rotate left, A)
      original_PC = this.PC;
      this.cycles++;
      carry = this.get_flag_carry();
      this.set_flag_carry((this.A[0]&0x80)?1:0);
      this.A[0] = (byteToUnsigned(this.A[0])<<1)+carry;
      this.set_negative_zero(this.A[0]);
      this.print_op_info(this.PC-original_PC,"ROL A");
      break;
    case 0x2c:  // BIT abs
      original_PC = this.PC;
      this.cycles+=3;
      val = this.read_absolute();
      this.set_flag_zero((byteToUnsigned(val) & byteToUnsigned(this.A[0]))?0:1);
      this.set_flag_negative(val&0x80);
      this.set_flag_overflow(val&0x40);
      this.print_op_info(this.PC-original_PC,"BIT $"+Number(abs_addr).toString(16));
      break;
    case 0x2d:  // AND abs
      original_PC = this.PC;
      this.cycles++;
      val = this.read_absolute();
      this.A[0] = byteToUnsigned(this.A[0]) & val;
      this.set_negative_zero(this.A[0]);
      this.print_op_info(this.PC-original_PC,"AND $"+(Number(abs_addr).toString(16)));
      break;
    case 0x2e:  // ROL abs (rotate left)
      original_PC = this.PC;
      this.cycles++;
      val = this.read_absolute();
      this.rol(this.temp_load_addr, val);
      this.print_op_info(this.PC-original_PC,"ROL $"+(Number(this.temp_load_addr).toString(16)));
      break;
    case 0x2f:  // *RLA abs (ROL+AND)
      original_PC = this.PC;
      this.cycles++;
      val = this.read_absolute();
      val=this.rol(this.temp_load_addr, val);
      this.A[0] = byteToUnsigned(this.A[0]) & val;
      this.set_negative_zero(this.A[0]);
      this.print_op_info(this.PC-original_PC,"*RLA $"+(Number(this.temp_load_addr).toString(16)));
      break;
    case 0x30:  // BMI (Branch on MInus)
      original_PC = this.PC;
      this.cycles++;
      offset = byteToSigned(this.get_imm());
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
      val = this.read_indirect_y();
      val=this.rol(this.temp_load_addr, val);
      this.A[0] = byteToUnsigned(this.A[0]) & val;
      this.set_negative_zero(this.A[0]);
      this.print_op_info(this.PC-original_PC,"*RLA ($"+(Number(this.temp_load_addr).toString(16))+"),Y");
      break;
    case 0x34:  // *NOP zeropage,X
      original_PC = this.PC;
      this.cycles+=3;
      imm = this.get_imm();
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
      val = this.read_zeropage_x();
      this.rol(this.temp_load_addr, val);
      this.print_op_info(this.PC-original_PC,"ROL $"+(Number(this.temp_load_addr).toString(16))+",X");
      break;
    case 0x37:  // *RLA zeropage,X (ROL+AND)
      original_PC = this.PC;
      this.cycles++;
      val = this.read_zeropage_x();
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
      val = this.read_absolute_y();
      this.A[0] = byteToUnsigned(this.A[0]) & val;
      this.set_negative_zero(this.A[0]);
      this.print_op_info(this.PC-original_PC,"AND $"+(Number(abs_addr).toString(16)));
      break;
    case 0x3b:  // *RLA abs,Y (ROL+AND)
      original_PC = this.PC;
      this.cycles++;
      val = this.read_absolute_y();
      val=this.rol(this.temp_load_addr, val);
      this.A[0] = byteToUnsigned(this.A[0]) & val;
      this.set_negative_zero(this.A[0]);
      this.print_op_info(this.PC-original_PC,"*RLA $"+(Number(this.temp_load_addr).toString(16))+",Y");
      break;
    case 0x3d:  // AND abs,X
      original_PC = this.PC;
      this.PC++;
      this.cycles+=3;
      abs_addr = this.load_abs_addr(this.PC)+this.X[0];
      this.PC++;
      val = this.read_memory(abs_addr);
      this.A[0] &= val;
      this.set_negative_zero(this.A[0]);
      this.print_op_info(this.PC-original_PC,"AND $"+Number(abs_addr).toString(16)+",X");
      break;
    case 0x3e:  // ROL abs,X (rotate left)
      original_PC = this.PC;
      this.cycles++;
      val = this.read_absolute_x();
      this.rol(this.temp_load_addr, val);
      this.print_op_info(this.PC-original_PC,"ROL $"+(Number(this.temp_load_addr).toString(16))+",X");
      break;
    case 0x3f:  // *RLA abs,X (ROL+AND)
      original_PC = this.PC;
      this.cycles++;
      val = this.read_absolute_x();
      val=this.rol(this.temp_load_addr, val);
      this.A[0] = byteToUnsigned(this.A[0]) & val;
      this.set_negative_zero(this.A[0]);
      this.print_op_info(this.PC-original_PC,"*RLA $"+(Number(this.temp_load_addr).toString(16))+",X");
      break;
    case 0x40:  // RTI (return from interrupt)
      original_PC = this.PC;
      this.cycles++;
      this.set_processor_status(this.pop_stack());
      abs_addr = (byteToUnsigned(this.pop_stack())) +(byteToUnsigned(this.pop_stack())<<8);
      this.print_op_info(this.PC-original_PC,"RTI $"+Number(abs_addr).toString(16));
      //console.log("RTI $"+Number(abs_addr).toString(16)+" Stack: "+Number(this.S).toString(16));
      this.PC = abs_addr-1;
      break;
    case 0x41:  // EOR indirect,X (Exclusive or)
      original_PC = this.PC;

      this.cycles+=2;
      val = this.read_indirect_x()^this.A[0];
      this.A[0] = val;
      this.set_negative_zero(val);
      this.print_op_info(this.PC-original_PC,"EOR ($"+Number(this.temp_load_addr).toString(16)+",X)");
      break;
    case 0x43:  // *SRE indirect,X (LSR+EOR)
      original_PC = this.PC;
      this.cycles++;
      val = this.read_indirect_x();
      this.A[0] = this.lsr(this.temp_load_addr,val)^this.A[0];
      this.set_negative_zero(this.A[0]);
      this.print_op_info(this.PC-original_PC,"*SRE ($"+Number(this.temp_load_addr).toString(16)+",X)");
      break;
    case 0x44:  // *NOP zeropage
      original_PC = this.PC;
      this.cycles+=2;
      imm = this.get_imm();
      this.print_op_info(this.PC-original_PC,"*NOP $"+Number(imm).toString(16));
      break;
    case 0x45:  // EOR zero_page (Exclusive or)
      original_PC = this.PC;
      this.cycles+=2;
      val = this.read_zeropage()^this.A[0];
      this.A[0] = val;
      this.set_negative_zero(val);
      this.print_op_info(this.PC-original_PC,"EOR $00"+Number(this.temp_load_addr).toString(16));
      break;
    case 0x46:  // LSR zeropage (logical shift right)
      original_PC = this.PC;
      this.cycles++;
      val = this.read_zeropage();
      this.lsr(this.temp_load_addr,val);
      this.print_op_info(this.PC-original_PC,"LSR $"+Number(this.temp_load_addr).toString(16));
      break;
    case 0x47:  // *SRE zeropage (LSR+EOR)
      original_PC = this.PC;
      this.cycles++;
      val = this.read_zeropage();
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
      val = this.get_imm()^this.A[0];
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
      abs_addr = this.get_addr_absolute();
      this.print_op_info(this.PC-original_PC,"JMP $"+Number(abs_addr).toString(16));
      this.PC = abs_addr-1;
      break;
    case 0x4d:  // EOR abs (Exclusive or)
      original_PC = this.PC;
      this.cycles+=3;
      val = this.read_absolute()^this.A[0];
      this.A[0] = val;
      this.set_negative_zero(val);
      this.print_op_info(this.PC-original_PC,"EOR $"+Number(this.temp_load_addr).toString(16));
      break;
    case 0x4e:  // LSR abs (logical shift right)
      original_PC = this.PC;
      this.cycles++;
      val = this.read_absolute();
      this.lsr(this.temp_load_addr,val);
      this.print_op_info(this.PC-original_PC,"LSR $"+Number(this.temp_load_addr).toString(16));
      break;
    case 0x4f:  // *SRE abs (LSR+EOR)
      original_PC = this.PC;
      this.cycles++;
      val = this.read_absolute();
      this.A[0] = this.lsr(this.temp_load_addr,val)^this.A[0];
      this.set_negative_zero(this.A[0]);
      this.print_op_info(this.PC-original_PC,"*SRE $"+Number(this.temp_load_addr).toString(16));
      break;
    case 0x50:  // BVC (Branch on oVerflow Clear)
      original_PC = this.PC;
      this.PC++;
      this.cycles++;
      offset = byteToSigned(this.read_memory(this.PC));
      if(offset < 0) offset -= 2;
      this.print_op_info(this.PC-original_PC,"BVC $"+(this.PC+offset+1).toString(16));
      if(this.get_flag_overflow() === false) this.PC += offset;
      break;
    case 0x51:  // EOR indirect,Y (Exclusive or)
      original_PC = this.PC;
      this.cycles+=2;
      val = this.read_indirect_y()^this.A[0];
      this.A[0] = val;
      this.set_negative_zero(val);
      this.print_op_info(this.PC-original_PC,"EOR ($"+Number(this.temp_load_addr).toString(16)+"),Y");
      break;
    case 0x53:  // *SRE indirect,Y (LSR+EOR)
      original_PC = this.PC;
      this.cycles++;
      val = this.read_indirect_y();
      this.A[0] = this.lsr(this.temp_load_addr,val)^this.A[0];
      this.set_negative_zero(this.A[0]);
      this.print_op_info(this.PC-original_PC,"*SRE ($"+Number(this.temp_load_addr).toString(16)+"),Y");
      break;
    case 0x54:  // *NOP zeropage,X
      original_PC = this.PC;
      this.cycles+=3;
      imm = this.get_imm();
      this.print_op_info(this.PC-original_PC,"*NOP $"+Number(imm).toString(16));
      break;
    case 0x55:  // EOR zero_page,X (Exclusive or)
      original_PC = this.PC;
      this.cycles+=2;
      val = this.read_zeropage_x()^this.A[0];
      this.A[0] = val;
      this.set_negative_zero(val);
      this.print_op_info(this.PC-original_PC,"EOR $"+Number(this.temp_load_addr).toString(16)+",X");
      break;
    case 0x56:  // LSR zeropage,X (logical shift right)
      original_PC = this.PC;
      this.cycles++;
      val = this.read_zeropage_x();
      this.lsr(this.temp_load_addr,val);
      this.print_op_info(this.PC-original_PC,"LSR "+Number(this.temp_load_addr).toString(16)+",X");
      break;
    case 0x57:  // *SRE zeropage,X (LSR+EOR)
      original_PC = this.PC;
      this.cycles++;
      val = this.read_zeropage_x();
      this.A[0] = this.lsr(this.temp_load_addr,val)^this.A[0];
      this.set_negative_zero(this.A[0]);
      this.print_op_info(this.PC-original_PC,"*SRE $"+Number(this.temp_load_addr).toString(16)+",X");
      break;
    case 0x58:  // CLI
      original_PC = this.PC;
      this.P[0] = (this.P[0] & (0xFB));
      this.print_op_info(this.PC-original_PC,"CLI");
      break;
    case 0x59:  // EOR abs,Y (Exclusive or)
      original_PC = this.PC;
      this.cycles+=3;
      val = this.read_absolute_y()^this.A[0];
      this.A[0] = val;
      this.set_negative_zero(val);
      this.print_op_info(this.PC-original_PC,"EOR $"+Number(this.temp_load_addr).toString(16)+",Y");
      break;
    case 0x5b:  // *SRE abs,Y (LSR+EOR)
      original_PC = this.PC;
      this.cycles++;
      val = this.read_absolute_y();
      this.A[0] = this.lsr(this.temp_load_addr,val)^this.A[0];
      this.set_negative_zero(this.A[0]);
      this.print_op_info(this.PC-original_PC,"*SRE $"+Number(this.temp_load_addr).toString(16)+",Y");
      break;
    case 0x5d:  // EOR abs,X (Exclusive or)
      original_PC = this.PC;
      this.cycles+=3;
      val = this.read_absolute_x()^this.A[0];
      this.A[0] = val;
      this.set_negative_zero(val);
      this.print_op_info(this.PC-original_PC,"EOR $"+Number(this.temp_load_addr).toString(16)+",X");
      break;
    case 0x5e:  // LSR abs,X (logical shift right)
      original_PC = this.PC;
      this.cycles++;
      val = this.read_absolute_x();
      this.lsr(this.temp_load_addr,val);
      this.print_op_info(this.PC-original_PC,"LSR $"+Number(this.temp_load_addr).toString(16)+",X");
      break;
    case 0x5f:  // *SRE abs,X (LSR+EOR)
      original_PC = this.PC;
      this.cycles++;
      val = this.read_absolute_x();
      this.A[0] = this.lsr(this.temp_load_addr,val)^this.A[0];
      this.set_negative_zero(this.A[0]);
      this.print_op_info(this.PC-original_PC,"*SRE $"+Number(this.temp_load_addr).toString(16)+",X");
      break;
    case 0x60:  // RTS (return from subroutine)
      original_PC = this.PC;
      this.cycles++;
      abs_addr = (byteToUnsigned(this.pop_stack())) +(byteToUnsigned(this.pop_stack())<<8);
      this.print_op_info(this.PC-original_PC,"RTS $"+Number(abs_addr).toString(16));
      this.PC = abs_addr;
      break;
    case 0x61:  // ADC indirect, X (add with carry)
      original_PC = this.PC;
      this.cycles++;
      val = this.read_indirect_x();
      this.adc(val);
      this.print_op_info(this.PC-original_PC,"ADC ($"+(val).toString(16)+",X)");
      break;
    case 0x63:  // *RRA indirect,X (ROR+ADC)
      original_PC = this.PC;
      this.cycles++;
      val = this.read_indirect_x();
      val = this.ror(this.temp_load_addr, val);
      this.adc(val);
      this.print_op_info(this.PC-original_PC,"*RRA ($"+(this.temp_load_addr).toString(16)+",X)");
      break;
    case 0x64:  // *NOP zeropage
      original_PC = this.PC;
      this.cycles+=2;
      imm = this.get_imm();
      this.print_op_info(this.PC-original_PC,"*NOP $"+Number(imm).toString(16));
      break;
    case 0x65:  // ADC zeropage (add with carry)
      original_PC = this.PC;
      this.cycles++;
      val = this.read_zeropage();
      this.adc(val);
      this.print_op_info(this.PC-original_PC,"ADC $"+(val).toString(16));
      break;
    case 0x66:  // ROR zeropage (rotate right)
      original_PC = this.PC;
      this.cycles++;
      val = this.read_zeropage();
      this.ror(this.temp_load_addr, val);
      this.print_op_info(this.PC-original_PC,"ROR $"+(this.temp_load_addr).toString(16));
      break;
    case 0x67:  // *RRA zeropage (ROR+ADC)
      original_PC = this.PC;
      this.cycles++;
      val = this.read_zeropage();
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
      val = this.get_imm();
      this.adc(val);
      this.print_op_info(this.PC-original_PC,"ADC #$"+(val).toString(16));
      break;
    case 0x6a:  // ROR A (rotate right, A)
      original_PC = this.PC;
      this.cycles++;
      carry = this.get_flag_carry();
      this.set_flag_carry((this.A[0]&1));
      this.A[0] = (byteToUnsigned(this.A[0])>>1)+(carry?0x80:0);
      this.set_negative_zero(this.A[0]);
      this.print_op_info(this.PC-original_PC,"ROR A");
      break;
    case 0x6c:  // JMP, indirect
      original_PC = this.PC;
      this.cycles+=4;
      abs_addr = this.get_addr_absolute();
      this.print_op_info(this.PC-original_PC,"JMP ($"+Number(abs_addr).toString(16)+")");
      var jmp_addr = 0;
      if((abs_addr&0xff) === 0xff) {
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
      val = this.read_absolute();
      this.ror(this.temp_load_addr, val);
      this.print_op_info(this.PC-original_PC,"ROR $"+(this.temp_load_addr).toString(16));
      break;
    case 0x6f:  // *RRA abs (ROR+ADC)
      original_PC = this.PC;
      this.cycles++;
      val = this.read_absolute();
      val = this.ror(this.temp_load_addr, val);
      this.adc(val);
      this.print_op_info(this.PC-original_PC,"*RRA $"+(this.temp_load_addr).toString(16));
      break;
    case 0x70:  // BVS (Branch on oVerflow Set)
      original_PC = this.PC;
      this.PC++;
      this.cycles++;
      offset = byteToSigned(this.read_memory(this.PC));
      if(offset < 0) offset -= 2;
      this.print_op_info(this.PC-original_PC,"BVS $"+(this.PC+offset+1).toString(16));
      if(this.get_flag_overflow()) this.PC += offset;
      break;
    case 0x71:  // ADC indirect, Y (add with carry)
      original_PC = this.PC;
      this.cycles++;
      val = this.read_indirect_y();
      this.adc(val);
      this.print_op_info(this.PC-original_PC,"ADC ($"+(val).toString(16)+"),Y");
      break;
    case 0x73:  // *RRA indirect,Y (ROR+ADC)
      original_PC = this.PC;
      this.cycles++;
      val = this.read_indirect_y();
      val = this.ror(this.temp_load_addr, val);
      this.adc(val);
      this.print_op_info(this.PC-original_PC,"*RRA ($"+(this.temp_load_addr).toString(16)+"),Y");
      break;
    case 0x74:  // *NOP zeropage,X
      original_PC = this.PC;
      this.cycles+=3;
      imm = this.get_imm();
      this.print_op_info(this.PC-original_PC,"*NOP $"+Number(imm).toString(16));
      break;
    case 0x75:  // ADC zeropage,X (add with carry)
      original_PC = this.PC;
      this.cycles++;
      val = this.read_zeropage_x();
      this.adc(val);
      this.print_op_info(this.PC-original_PC,"ADC $"+Number(this.temp_load_addr).toString(16)+",X");
      break;
    case 0x76:  // ROR zeropage,X (rotate right)
      original_PC = this.PC;
      this.cycles++;
      val = this.read_zeropage_x();
      this.ror(this.temp_load_addr, val);
      this.print_op_info(this.PC-original_PC,"ROR $"+(this.temp_load_addr).toString(16)+",X");
      break;
    case 0x77:  // *RRA zeropage,X (ROR+ADC)
      original_PC = this.PC;
      this.cycles++;
      val = this.read_zeropage_x();
      val = this.ror(this.temp_load_addr, val);
      this.adc(val);
      this.print_op_info(this.PC-original_PC,"*RRA $"+(this.temp_load_addr).toString(16)+",X");
      break;
    case 0x78:  // SEI
      original_PC = this.PC;
      this.P[0] = (this.P[0] | (1<<2));
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
      val = this.read_absolute_y();
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
      val = this.read_absolute_x();
      this.ror(this.temp_load_addr, val);
      this.print_op_info(this.PC-original_PC,"ROR $"+Number(abs_addr).toString(16)+",X");
      break;
    case 0x7f:  // *RRA abs,X (ROR+ADC)
      original_PC = this.PC;
      this.cycles++;
      val = this.read_absolute_x();
      val = this.ror(this.temp_load_addr, val);
      this.adc(val);
      this.print_op_info(this.PC-original_PC,"*RRA $"+(this.temp_load_addr).toString(16)+",X");
      break;
    case 0x80:  // *NOP imm
      original_PC = this.PC;
      this.cycles++;
      imm = this.get_imm();
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
      abs_addr = this.get_imm();
      this.write_memory(abs_addr, this.Y[0]);
      this.print_op_info(this.PC-original_PC,"STY $"+Number(abs_addr).toString(16));
      break;
    case 0x85:  // STA zero_page
      original_PC = this.PC;
      this.cycles+=2;
      abs_addr = this.get_imm();
      this.write_memory(abs_addr, this.A[0]);
      this.print_op_info(this.PC-original_PC,"STA $"+Number(abs_addr).toString(16));
      break;
    case 0x86:  // STX zero_page
      original_PC = this.PC;
      this.cycles+=2;
      abs_addr = this.get_imm();
      this.write_memory(abs_addr, this.X[0]);
      this.print_op_info(this.PC-original_PC,"STX $"+Number(abs_addr).toString(16));
      break;
    case 0x87:  // *SAX zero_page
      original_PC = this.PC;
      this.cycles+=2;
      abs_addr = this.get_imm();
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
      abs_addr = this.get_addr_absolute();
      this.write_memory(abs_addr, this.Y[0]);
      this.print_op_info(this.PC-original_PC,"STY $"+Number(abs_addr).toString(16));
      break;
    case 0x8d:  // STA abs
      original_PC = this.PC;
      this.cycles+=3;
      abs_addr = this.get_addr_absolute();
      this.write_memory(abs_addr, this.A[0]);
      this.print_op_info(this.PC-original_PC,"STA $"+Number(abs_addr).toString(16));
      break;
    case 0x8e:  // STX abs
      original_PC = this.PC;
      this.cycles+=3;
      abs_addr = this.get_addr_absolute();
      this.write_memory(abs_addr, this.X[0]);
      this.print_op_info(this.PC-original_PC,"STX $"+Number(abs_addr).toString(16));
      break;
    case 0x8f:  // *SAX abs
      original_PC = this.PC;
      this.cycles+=4;
      abs_addr = this.get_addr_absolute();
      this.write_memory(abs_addr, this.A[0]&this.X[0]);
      this.print_op_info(this.PC-original_PC,"*SAX $"+Number(abs_addr).toString(16));
      break;
    case 0x90:  // BCC (Branch on Carry Clear)
      original_PC = this.PC;
      this.PC++;
      this.cycles++;
      offset = byteToSigned(this.read_memory(this.PC));
      if(offset < 0) offset -= 2;
      this.print_op_info(this.PC-original_PC,"BCC $"+(this.PC+offset+1).toString(16));
      if(this.get_flag_carry() === false) this.PC += offset;
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
      abs_addr = (this.get_imm()+this.X[0])&0xff;
      this.write_memory(abs_addr, this.Y[0]);
      this.print_op_info(this.PC-original_PC,"STY $00"+Number(abs_addr).toString(16));
      break;
    case 0x95:  // STA zero_page,X
      original_PC = this.PC;
      this.cycles+=2;
      abs_addr = this.get_imm();
      this.write_memory((abs_addr+this.X[0])&0xff, this.A[0]);
      this.print_op_info(this.PC-original_PC,"STA $"+Number(abs_addr).toString(16)+",X");
      break;
    case 0x96:  // STX zero_page,Y
      original_PC = this.PC;
      this.cycles+=2;
      abs_addr = (this.get_imm()+this.Y[0])&0xff;
      this.write_memory(abs_addr, this.X[0]);
      this.print_op_info(this.PC-original_PC,"STX $"+Number(abs_addr).toString(16)+",Y");
      break;
    case 0x97:  // *SAX zero_page,Y
      original_PC = this.PC;
      this.cycles+=2;
      abs_addr = (this.get_imm()+this.Y[0])&0xff;
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
      abs_addr = this.load_abs_addr(this.PC)+this.Y[0];
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
      abs_addr = this.load_abs_addr(this.PC)+this.X[0];
      this.write_memory(abs_addr, this.A[0]);
      this.PC++;
      this.print_op_info(this.PC-original_PC,"STA $"+Number(abs_addr).toString(16)+",X");
      break;
    case 0xa0:  // LDY imm
      original_PC = this.PC;
      this.PC++;
      this.cycles++;
      imm = this.read_memory(this.PC);
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
      imm = this.read_memory(this.PC);
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
      addr = this.get_imm();
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
      imm = this.get_imm();
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
      abs_addr = this.load_abs_addr(this.PC);
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
      this.cycles+=2;
      offset = byteToSigned(this.read_memory(this.PC));
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
      addr = this.get_imm();
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
      abs_addr = this.get_addr_absolute();
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
      imm = this.get_imm();
      this.cmp(this.Y[0], imm);
      this.print_op_info(this.PC-original_PC,"CPY #"+imm);
      break;
    case 0xc1:  // CMP indirect, X
      original_PC = this.PC;
      this.cycles++;
      imm = this.read_indirect_x();
      this.cmp(this.A[0], imm);
      this.print_op_info(this.PC-original_PC,"CMP ($"+Number(this.temp_load_addr).toString(16)+", X)");
      break;
    case 0xc3:  // *DCP indirect,X (DEC+CMP)
      original_PC = this.PC;
      this.cycles+=5;
      val = this.read_indirect_x();
      val = this.dec(this.temp_load_addr,val);
      this.cmp(this.A[0], val);
      this.print_op_info(this.PC-original_PC,"*DCP ($"+Number(this.temp_load_addr).toString(16)+",X)");
      break;
    case 0xc4:  // CPY zeropage
      original_PC = this.PC;
      this.cycles++;
      imm = this.read_zeropage();
      this.cmp(this.Y[0], imm);
      this.print_op_info(this.PC-original_PC,"CPY $"+Number(this.temp_load_addr).toString(16));
      break;
    case 0xc5:  // CMP zeropage
      original_PC = this.PC;
      this.cycles++;
      imm = this.read_zeropage();
      this.cmp(this.A[0], imm);
      this.print_op_info(this.PC-original_PC,"CMP $"+Number(this.temp_load_addr).toString(16));
      break;
    case 0xc6:  // DEC zero_page
      original_PC = this.PC;
      this.cycles+=2;
      val = this.read_zeropage();
      this.dec(this.temp_load_addr,val);
      this.print_op_info(this.PC-original_PC,"DEC $"+Number(this.temp_load_addr).toString(16));
      break;
    case 0xc7:  // *DCP zeropage (DEC+CMP)
      original_PC = this.PC;
      this.cycles+=5;
      val = this.read_zeropage();
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
      imm = this.get_imm();
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
      imm = this.read_absolute();
      this.cmp(this.Y[0], imm);
      this.print_op_info(this.PC-original_PC,"CPY $"+Number(abs_addr).toString(16));
      break;
    case 0xcd:  // CMP abs
      original_PC = this.PC;
      this.cycles++;
      val = this.read_absolute();
      this.cmp(this.A[0], val);
      this.print_op_info(this.PC-original_PC,"CMP $"+Number(this.temp_load_addr).toString(16));
      break;
    case 0xce:  // DEC abs
      original_PC = this.PC;
      this.cycles+=5;
      val = this.read_absolute();
      this.dec(this.temp_load_addr,val);
      this.print_op_info(this.PC-original_PC,"DEC $"+Number(this.temp_load_addr).toString(16));
      break;
    case 0xcf:  // *DCP abs (DEC+CMP)
      original_PC = this.PC;
      this.cycles+=5;
      val = this.read_absolute();
      val = this.dec(this.temp_load_addr,val);
      this.cmp(this.A[0], val);
      this.print_op_info(this.PC-original_PC,"*DCP $"+Number(this.temp_load_addr).toString(16));
      break;
    case 0xd0:  // BNE (Branch if not equal)
      original_PC = this.PC;
      this.PC++;
      this.cycles++;
      offset = byteToSigned(this.read_memory(this.PC));
      if(offset < 0) offset -= 2;
      this.print_op_info(this.PC-original_PC,"BNE $"+(this.PC+offset+1).toString(16));
      if(this.get_flag_zero() === false) this.PC += offset;
      break;
    case 0xd1:  // CMP indirect, Y
      original_PC = this.PC;
      this.cycles++;
      imm = this.read_indirect_y();
      this.cmp(this.A[0], imm);
      this.print_op_info(this.PC-original_PC,"CMP ($"+Number(this.temp_load_addr).toString(16)+"), Y");
      break;
    case 0xd3:  // *DCP indirect,Y (DEC+CMP)
      original_PC = this.PC;
      this.cycles+=5;
      val = this.read_indirect_y();
      val = this.dec(this.temp_load_addr,val);
      this.cmp(this.A[0], val);
      this.print_op_info(this.PC-original_PC,"*DCP ($"+Number(this.temp_load_addr).toString(16)+"),Y");
      break;
    case 0xd4:  // *NOP zeropage,X
      original_PC = this.PC;
      this.cycles+=3;
      imm = this.get_imm();
      this.print_op_info(this.PC-original_PC,"*NOP $"+Number(imm).toString(16));
      break;
    case 0xd5:  // CMP zeropage,X
      original_PC = this.PC;
      this.cycles++;
      imm = this.read_zeropage_x();
      this.cmp(this.A[0], imm);
      this.print_op_info(this.PC-original_PC,"CMP $"+Number(this.temp_load_addr).toString(16)+",X");
      break;
    case 0xd6:  // DEC zero_page,X
      original_PC = this.PC;
      this.cycles+=2;
      val = this.read_zeropage_x();
      this.dec(this.temp_load_addr,val);
      this.print_op_info(this.PC-original_PC,"DEC $"+Number(this.temp_load_addr).toString(16)+",X");
      break;
    case 0xd7:  // *DCP zero_page,X (DEC+CMP)
      original_PC = this.PC;
      this.cycles+=5;
      val = this.read_zeropage_x();
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
      val = this.read_absolute_y();
      this.cmp(this.A[0], val);
      this.print_op_info(this.PC-original_PC,"CMP $"+Number(this.temp_load_addr).toString(16)+",Y");
      break;
    case 0xdb:  // *DCP abs,Y (DEC+CMP)
      original_PC = this.PC;
      this.cycles+=5;
      val = this.read_absolute_y();
      val = this.dec(this.temp_load_addr,val);
      this.cmp(this.A[0], val);
      this.print_op_info(this.PC-original_PC,"*DCP $"+Number(this.temp_load_addr).toString(16)+",Y");
      break;
    case 0xdd:  // CMP abs,X
      original_PC = this.PC;
      this.cycles++;
      val = this.read_absolute_x();
      this.cmp(this.A[0], val);
      this.print_op_info(this.PC-original_PC,"CMP $"+Number(this.temp_load_addr).toString(16), ",X");
      break;
    case 0xde:  // DEC abs,X
      original_PC = this.PC;
      this.cycles+=5;
      val = this.read_absolute_x();
      this.dec(this.temp_load_addr,val);
      this.print_op_info(this.PC-original_PC,"DEC $"+Number(this.temp_load_addr).toString(16)+",X");
      break;
    case 0xdf:  // *DCP abs,X (DEC+CMP)
      original_PC = this.PC;
      this.cycles+=5;
      val = this.read_absolute_x();
      val = this.dec(this.temp_load_addr,val);
      this.cmp(this.A[0], val);
      this.print_op_info(this.PC-original_PC,"*DCP $"+Number(this.temp_load_addr).toString(16)+",X");
      break;
    case 0xe0:  // CPX imm
      original_PC = this.PC;
      this.cycles++;
      imm = this.get_imm();
      this.cmp(this.X[0], imm);
      this.print_op_info(this.PC-original_PC,"CPX #"+imm);
      break;
    case 0xe1:  // SBC indirect, X (substract with carry)
      original_PC = this.PC;
      this.cycles++;
      val = byteToUnsigned(this.read_indirect_x());
      val ^= 0xff;
      this.adc(val);
      this.print_op_info(this.PC-original_PC,"SBC ($,X)");
      break;
    case 0xe3:  // *ISB indirect, X (INC+SBC)
      original_PC = this.PC;
      this.cycles++;
      val = byteToUnsigned(this.read_indirect_x()+1);
      this.write_memory(this.temp_load_addr, val);
      val ^= 0xff;
      this.adc(val);
      this.print_op_info(this.PC-original_PC,"*ISB ($"+Number(this.temp_load_addr).toString(16)+",X)");
      break;
    case 0xe4:  // CPX zeropage
      original_PC = this.PC;
      this.cycles++;
      imm = this.read_zeropage();
      this.cmp(this.X[0], imm);
      this.print_op_info(this.PC-original_PC,"CPX $00");
      break;
    case 0xe5:  // SBC zeropage (substract with carry)
      original_PC = this.PC;
      this.cycles++;
      val = byteToUnsigned(this.read_zeropage());
      val ^= 0xff;
      this.adc(val);
      this.print_op_info(this.PC-original_PC,"SBC $00");
      break;
    case 0xe6:  // INC zero_page
      original_PC = this.PC;
      this.cycles+=4;
      val = (this.read_zeropage()+1)&0xff;
      this.write_memory(this.temp_load_addr, val);
      this.set_negative_zero(val);
      this.print_op_info(this.PC-original_PC,"INC $"+Number(this.temp_load_addr).toString(16));
      break;
    case 0xe7:  // *ISB zeropage (INC+SBC)
      original_PC = this.PC;
      this.cycles++;
      val = byteToUnsigned(this.read_zeropage()+1);
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
      val = byteToUnsigned(this.get_imm());
      val ^= 0xff;
      this.adc(val);
      this.print_op_info(this.PC-original_PC,"SBC #$"+Number(val).toString(16));
      break;
    case 0xea:  // NOP
      this.cycles++;
      original_PC = this.PC;
      this.print_op_info(this.PC-original_PC,"NOP");
      break;
    case 0xeb:  // *SBC imm (substract with carry)
      original_PC = this.PC;
      this.cycles++;
      val = byteToUnsigned(this.get_imm());
      val ^= 0xff;
      this.adc(val);
      this.print_op_info(this.PC-original_PC,"*SBC #$"+Number(val).toString(16));
      break;
    case 0xec:  // CPX abs
      original_PC = this.PC;
      this.cycles++;
      val = this.read_absolute();
      this.cmp(this.X[0], val);
      this.print_op_info(this.PC-original_PC,"CPX $"+Number(this.temp_load_addr).toString(16));
      break;
    case 0xed:  // SBC abs (substract with carry)
      original_PC = this.PC;
      this.cycles++;
      val = byteToUnsigned(this.read_absolute());
      val ^= 0xff;
      this.adc(val);
      this.print_op_info(this.PC-original_PC,"SBC $"+Number(this.temp_load_addr).toString(16));
      break;
    case 0xee: // INC abs
      original_PC = this.PC;
      this.cycles+=2;
      val = byteToUnsigned(this.read_absolute());
      val = (val+1)&0xff;
      this.write_memory(this.temp_load_addr, val);
      this.set_negative_zero(val);
      this.print_op_info(this.PC-original_PC,"INC $"+Number(this.temp_load_addr).toString(16));
      break;
    case 0xef:  // *ISB abs (INC+SBC)
      original_PC = this.PC;
      this.cycles++;
      val = byteToUnsigned(this.read_absolute()+1);
      this.write_memory(this.temp_load_addr, val);
      val ^= 0xff;
      this.adc(val);
      this.print_op_info(this.PC-original_PC,"*ISB $"+Number(this.temp_load_addr).toString(16));
      break;
    case 0xf0:  // BEQ (Branch if equal)
      original_PC = this.PC;
      this.PC++;
      this.cycles++;
      offset = byteToSigned(this.read_memory(this.PC));
      if(offset < 0) offset -= 2;
      this.print_op_info(this.PC-original_PC,"BEQ $"+(this.PC+offset+1).toString(16));
      if(this.get_flag_zero()) this.PC += offset;
      break;
    case 0xf1:  // SBC indirect, Y (substract with carry)
      original_PC = this.PC;
      this.cycles++;
      val = byteToUnsigned(this.read_indirect_y());
      val ^= 0xff;
      this.adc(val);
      this.print_op_info(this.PC-original_PC,"SBC ($),Y");
      break;
    case 0xf3:  // *ISB indirect,Y (INC+SBC)
      original_PC = this.PC;
      this.cycles++;
      val = byteToUnsigned(this.read_indirect_y()+1);
      this.write_memory(this.temp_load_addr, val);
      val ^= 0xff;
      this.adc(val);
      this.print_op_info(this.PC-original_PC,"*ISB $"+Number(this.temp_load_addr).toString(16));
      break;
    case 0xf4:  // *NOP zeropage,X
      original_PC = this.PC;
      this.cycles+=3;
      imm = this.get_imm();
      this.print_op_info(this.PC-original_PC,"*NOP $"+Number(imm).toString(16));
      break;
    case 0xf5:  // SBC zeropage,X (substract with carry)
      original_PC = this.PC;
      this.cycles++;
      val = byteToUnsigned(this.read_zeropage_x());
      val ^= 0xff;
      this.adc(val);
      this.print_op_info(this.PC-original_PC,"SBC $"+Number(this.temp_load_addr).toString(16)+",X");
      break;
    case 0xf6:  // INC zero_page,X
      original_PC = this.PC;
      this.cycles+=4;
      val = (this.read_zeropage_x()+1)&0xff;
      this.write_memory(this.temp_load_addr, val);
      this.set_negative_zero(val);
      this.print_op_info(this.PC-original_PC,"INC $"+Number(this.temp_load_addr).toString(16)+",X");
      break;
    case 0xf7:  // *ISB zeropage,X (INC+SBC)
      original_PC = this.PC;
      this.cycles++;
      val = byteToUnsigned(this.read_zeropage_x()+1);
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
      val = this.read_absolute_y();
      this.adc(val^0xff);
      this.print_op_info(this.PC-original_PC,"SBC $"+Number(this.temp_load_addr).toString(16)+",Y");
      break;
    case 0xfb:  // *ISB abs,Y (INC+SBC)
      original_PC = this.PC;
      this.cycles++;
      val = byteToUnsigned(this.read_absolute_y()+1);
      this.write_memory(this.temp_load_addr, val);
      val ^= 0xff;
      this.adc(val);
      this.print_op_info(this.PC-original_PC,"*ISB $"+Number(this.temp_load_addr).toString(16)+",Y");
      break;
    case 0xfd:  // SBC abs,X (substract with carry)
      original_PC = this.PC;
      this.cycles++;
      val = byteToUnsigned(this.read_absolute_x());
      val ^= 0xff;
      this.adc(val);
      this.print_op_info(this.PC-original_PC,"SBC $"+Number(this.temp_load_addr).toString(16)+",X");
      break;
    case 0xfe: // INC abs,X
      original_PC = this.PC;
      this.cycles+=2;
      val = byteToUnsigned(this.read_absolute_x());
      val = (val+1)&0xff;
      this.write_memory(this.temp_load_addr, val);
      this.set_negative_zero(val);
      this.print_op_info(this.PC-original_PC,"INC $"+Number(this.temp_load_addr).toString(16)+",X");
      break;
    case 0xff:  // *ISB abs,X (INC+SBC)
      original_PC = this.PC;
      this.cycles++;
      val = byteToUnsigned(this.read_absolute_x()+1);
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