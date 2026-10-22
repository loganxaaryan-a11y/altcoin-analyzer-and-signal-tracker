export type ReviewPackageFile = { path: string; content: string };

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function pushU16(target: number[], value: number): void { target.push(value & 255, (value >>> 8) & 255); }
function pushU32(target: number[], value: number): void { target.push(value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255); }

/** Deterministic ZIP writer using STORE entries; avoids runtime compression dependencies. */
export function createReviewZip(files: ReviewPackageFile[]): Uint8Array {
  const encoder = new TextEncoder(); const body: number[] = []; const central: number[] = [];
  for (const file of files) {
    const name = encoder.encode(file.path); const data = encoder.encode(file.content); const checksum = crc32(data); const offset = body.length;
    pushU32(body, 0x04034b50); pushU16(body, 20); pushU16(body, 0x0800); pushU16(body, 0); pushU16(body, 0); pushU16(body, 0); pushU32(body, checksum); pushU32(body, data.length); pushU32(body, data.length); pushU16(body, name.length); pushU16(body, 0); for (const byte of name) body.push(byte); for (const byte of data) body.push(byte);
    pushU32(central, 0x02014b50); pushU16(central, 20); pushU16(central, 20); pushU16(central, 0x0800); pushU16(central, 0); pushU16(central, 0); pushU16(central, 0); pushU32(central, checksum); pushU32(central, data.length); pushU32(central, data.length); pushU16(central, name.length); pushU16(central, 0); pushU16(central, 0); pushU16(central, 0); pushU16(central, 0); pushU32(central, 0); pushU32(central, offset); for (const byte of name) central.push(byte);
  }
  const centralOffset = body.length; for (const byte of central) body.push(byte); pushU32(body, 0x06054b50); pushU16(body, 0); pushU16(body, 0); pushU16(body, files.length); pushU16(body, files.length); pushU32(body, central.length); pushU32(body, centralOffset); pushU16(body, 0);
  return Uint8Array.from(body);
}
