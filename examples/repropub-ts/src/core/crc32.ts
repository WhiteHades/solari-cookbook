const TABLE = new Uint32Array(256);

for (let index = 0; index < TABLE.length; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  TABLE[index] = value >>> 0;
}

export function crc32(data: Buffer): number {
  let value = 0xffffffff;
  for (const byte of data) {
    const tableIndex = (value ^ byte) & 0xff;
    value = (TABLE[tableIndex] ?? 0) ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
}
