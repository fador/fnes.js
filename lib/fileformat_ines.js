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
exports.ines_parseHeader = function(data) {

  // Check that the header is "NES\n"
  if(data[0] !== 0x4E || data[1] !== 0x45 || data[2] !== 0x53 || data[3] !== 0x1A)
  {
    console.log(data.slice(0,4));
    return false;
  }
  this.header.prg_size = data[4] * 16*1024;
  this.header.chr_size = data[5] * 8*1024;
  this.pal = !!data[9];
  this.mirroring = data[6]&1;
  this.mapper = data[6]>>4;
  this.mapper += data[7]&0xf;
  console.log("Mapper: "+this.mapper);
  if(this.header.prg_size === 16384) this.PC = 0xc000;
  //data.copy(this.memory_cpu, this.PC, 16, 16+this.header.prg_size);
  //data.copy(this.memory_ppu, 0, 16+this.header.prg_size, 16+this.header.prg_size+this.header.chr_size);
  if(this.mapper == 2) {
    this.full_prg_memory = new Uint8Array(this.header.prg_size);
    for (var i = 16; i < 16 + this.header.prg_size; i++) this.full_prg_memory[i-16] = data[i];
    for (var i = 16; i < 16 + 0x4000; i++) this.memory_cpu[0x8000 + i - 16] = data[i];
    for (var i = 16 + 0x1C000; i < 16 + 0x1ffff +1; i++) this.memory_cpu[i - 0x10000 - 16] = data[i];
  } else {
    if(this.mapper!==0) {
      console.log("Mapper "+this.mapper+" Not supported");
      return false;
    }
    for (var i = 16; i < 16 + this.header.prg_size; i++) this.memory_cpu[this.PC + i - 16] = data[i];
    for (var i = 16 + this.header.prg_size; i < 16 + this.header.prg_size + this.header.chr_size; i++) this.memory_ppu[i - (16 + this.header.prg_size)] = data[i];
  }
  this.PC=this.load_abs_addr(0xFFFC);
  console.log("PRG ROM: "+this.header.prg_size);
  console.log("CHR ROM: "+this.header.chr_size);
  return true;
}