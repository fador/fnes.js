const regex = /(?:([\w]*)[\s]([\w]*)[\s]([\w]*)[\s]?)/gm;
const str = `52 52 52 01 1A 51 0F 0F 65 23 06 63 36 03 4B 40 04 26 3F 09 04 32 13 00 1F 20 00 0B 2A 00 00 2F 00 00 2E 0A 00 26 2D 00 00 00 00 00 00 00 00 00 A0 A0 A0 1E 4A 9D 38 37 BC 58 28 B8 75 21 94 84 23 5C 82 2E 24 6F 3F 00 51 52 00 31 63 00 1A 6B 05 0E 69 2E 10 5C 68 00 00 00 00 00 00 00 00 00 FE FF FF 69 9E FC 89 87 FF AE 76 FF CE 6D F1 E0 70 B2 DE 7C 70 C8 91 3E A6 A7 25 81 BA 28 63 C4 46 54 C1 7D 56 B3 C0 3C 3C 3C 00 00 00 00 00 00 FE FF FF BE D6 FD CC CC FF DD C4 FF EA C0 F9 F2 C1 DF F1 C7 C2 E8 D0 AA D9 DA 9D C9 E2 9E BC E6 AE B4 E5 C7 B5 DF E4 A9 A9 A9 00 00 00 00 00 00`;
let m;

global.color = 0;

while ((m = regex.exec(str)) !== null) {
    // This is necessary to avoid infinite loops with zero-width matches
    if (m.index === regex.lastIndex) {
        regex.lastIndex++;
    }
    
    var out = "";
    
    // The result can be accessed through the `m`-variable.
    m.forEach((match, groupIndex) => {
        if(groupIndex == 0) out="[";
        if(groupIndex == 1) out+="0x"+match+",";
        if(groupIndex == 2) out+="0x"+match+",";
        if(groupIndex == 3) {
          out+="0x"+match+"], // 0x"+Number(global.color++).toString(16);
          console.log(out);
          
          
        }
        
    });
}