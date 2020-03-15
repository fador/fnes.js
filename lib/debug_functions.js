const constants = require('./constants');

exports.get_registers_string = function() {
  var registers = "A:"+Number(this.A[0]).toString(16).padStart(2,"0").toUpperCase();
  registers += " X:"+Number(this.X[0]).toString(16).padStart(2,"0").toUpperCase();
  registers += " Y:"+Number(this.Y[0]).toString(16).padStart(2,"0").toUpperCase();
  registers += " P:"+Number(this.P[0]).toString(16).padStart(2,"0").toUpperCase();
  registers += " SP:"+Number(this.S).toString(16).padStart(2,"0").toUpperCase();
  registers += " PPU:   ,   ";
  registers += " CYC:"+this.cycles;
  return registers;
}

exports.print_op_info= function(offset, string) {

  if(this.debug & constants.DEBUG_OPS) {
    var addr = Number(this.PC-offset).toString(16).padStart(4, "0").toUpperCase()+" ";
    var data = "";
    for(var i = 0; i < offset+1; i++) {
      data += " "+Number(this.memory_cpu[this.PC-offset+i]).toString(16).toUpperCase().padStart(2,"0");
    }

    console.log(addr+ data.padEnd(11) + string.padEnd(32)+this.temp_regstate);
  }
}