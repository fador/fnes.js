const {map_memory,read_memory,write_memory} = require("./memory_functions");

exports.apu_audio_sample = function(sampleRate,audio_array) {

  var enable = this.memory_cpu[0x4015];


  for (let i = 0; i < audio_array.length; ++i) {
    audio_array[i]=0.0;
  };

  if(enable&1 === 1) // Pulse 1
  {
    var pulse1 = this.memory_cpu[0x4000];
    const duty = [0.125, 0.25, 0.5, -0.25];
    const timer = ((this.memory_cpu[0x4003]&7)<<8)|this.memory_cpu[0x4002];
    // Pulse
    const f = (1700000) / (16 * (timer + 1));
    const t = ((1700000) / (16 * f)) - 1;
    //console.log(Number(t).toString(16));
    const tone = f;  // Hz
    let c = 0;
    for (let i = 0; i < audio_array.length; ++i) {
      audio_array[i] = (t<8)?0.0:Math.sin(c * tone * Math.PI * 2 / sampleRate);
      c = (c + 1) % sampleRate;
    }
  }
  if(enable&2 === 2) // Pulse 2
  {
    var pulse1 = this.memory_cpu[0x4001];
    const duty = [0.125, 0.25, 0.5, -0.25];
    const timer = ((this.memory_cpu[0x4007]&7)<<8)|this.memory_cpu[0x4006];
    // Pulse
    const f = (1700000) / (16 * (timer + 1));
    const t = ((1700000) / (16 * f)) - 1;

    const tone = f;  // Hz
    let c = 0;
    for (let i = 0; i < audio_array.length; ++i) {
      audio_array[i] = (t<8)?0.0:Math.sin(c * tone * Math.PI * 2 / sampleRate);
      c = (c + 1) % sampleRate;
    }
  }
  if(enable&4) // Triangle
  {

  }
  if(enable&8) // Noise
  {

  }
  if(enable&16) // DMC
  {

  }


  return audio_array;
};