exports.byteToSigned = function(val) {
  if(val&0x80) val = -((~val&0xff)-1);
  return val;
}

exports.byteToUnsigned=function(val) {
  return val&0xff;
}
