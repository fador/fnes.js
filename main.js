var fs = require('fs');


class NESHeader {

  constructor()
  {
    this.prg_size = 0;
    this.chr_size = 0;
    this.pal = false;


  }
}

class NESSystem {

  constructor() {
    this.header = new NESHeader();
    this.memory = Buffer.alloc(0xffff);
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
    this.header.chr_size = data[5] * 8*1024 || 8*1024;
    this.pal = data[9] ? true:false;
    data.copy(this.memory, 0x8000, 16, 16+this.header.prg_size);

    console.log("PRG ROM: "+this.header.prg_size);
    console.log("CHR ROM: "+this.header.chr_size);
    return true;
  }
}





function main()
{
  var system = new NESSystem();
  var binaryData = fs.readFileSync('./mario.nes');
  if(system.parseHeader(binaryData)) {

  } else {
    console.log("ROM failure: header not valid");
  }

  return;
}



main();