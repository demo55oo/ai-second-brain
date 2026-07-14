/**
 * Minimal ZIP reader for .md vault uploads.
 * Supports store (0) and deflate (8) entries — enough for Obsidian exports.
 */
import zlib from "node:zlib";
import { promisify } from "node:util";

const inflateRaw = promisify(zlib.inflateRaw);

function readU16(buf: Buffer, off: number) {
  return buf.readUInt16LE(off);
}
function readU32(buf: Buffer, off: number) {
  return buf.readUInt32LE(off);
}

export type ZipEntry = { path: string; data: Buffer };

export async function unzipBuffer(buf: Buffer): Promise<ZipEntry[]> {
  const out: ZipEntry[] = [];
  let i = 0;
  while (i + 30 <= buf.length) {
    const sig = readU32(buf, i);
    if (sig !== 0x04034b50) break; // local file header
    const method = readU16(buf, i + 8);
    const compSize = readU32(buf, i + 18);
    const nameLen = readU16(buf, i + 26);
    const extraLen = readU16(buf, i + 28);
    const nameStart = i + 30;
    const name = buf.subarray(nameStart, nameStart + nameLen).toString("utf8");
    const dataStart = nameStart + nameLen + extraLen;
    const compressed = buf.subarray(dataStart, dataStart + compSize);
    i = dataStart + compSize;

    if (name.endsWith("/")) continue;
    let data: Buffer;
    if (method === 0) data = Buffer.from(compressed);
    else if (method === 8) data = await inflateRaw(compressed);
    else continue; // unsupported compression

    out.push({ path: name.replace(/\\/g, "/"), data });
  }
  return out;
}
