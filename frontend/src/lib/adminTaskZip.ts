import type { TaskFile } from '@itp/types';

type ZipTask = {
  path: string;
  files: TaskFile[];
  instructionsMarkdown: string;
  sequenceOrder: number;
  title: string;
};

const encoder = new TextEncoder();
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
  let value = n;
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  crcTable[n] = value >>> 0;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function write16(view: DataView, offset: number, value: number) {
  view.setUint16(offset, value, true);
}

function write32(view: DataView, offset: number, value: number) {
  view.setUint32(offset, value >>> 0, true);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((length, part) => length + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

/** Removes unsafe path characters and normalizes a single ZIP path segment. */
export function safeZipName(value: string): string {
  const safe = value
    .normalize('NFKC')
    .replace(/[\\/]+/g, '-')
    .replace(/[<>:"|?*]/g, '')
    .split('')
    .filter((character) => character.charCodeAt(0) >= 32)
    .join('')
    .replace(/\.\.+/g, '.')
    .trim()
    .replace(/[. ]+$/g, '');
  return safe || 'unnamed';
}

/** Builds a ZIP archive using the ZIP store method, avoiding runtime-specific compression APIs. */
export function createTasksZip(tasks: ZipTask[]): Blob {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;
  let count = 0;

  for (const task of tasks) {
    for (const file of [
      ...task.files,
      { path: 'INSTRUCTIONS.md', content: task.instructionsMarkdown },
    ]) {
      const relativePath = file.path.split('/').filter(Boolean).map(safeZipName).join('/');
      const filePath = `${task.path}/${relativePath}`;
      const name = encoder.encode(filePath);
      const content = encoder.encode(file.content);
      const checksum = crc32(content);

      const local = new Uint8Array(30 + name.length);
      const localView = new DataView(local.buffer);
      write32(localView, 0, 0x04034b50);
      write16(localView, 4, 20);
      write16(localView, 6, 0x0800);
      write16(localView, 8, 0);
      write32(localView, 14, checksum);
      write32(localView, 18, content.length);
      write32(localView, 22, content.length);
      write16(localView, 26, name.length);
      local.set(name, 30);
      localParts.push(local, content);

      const central = new Uint8Array(46 + name.length);
      const centralView = new DataView(central.buffer);
      write32(centralView, 0, 0x02014b50);
      write16(centralView, 4, 20);
      write16(centralView, 6, 20);
      write16(centralView, 8, 0x0800);
      write16(centralView, 10, 0);
      write32(centralView, 16, checksum);
      write32(centralView, 20, content.length);
      write32(centralView, 24, content.length);
      write16(centralView, 28, name.length);
      write32(centralView, 42, offset);
      central.set(name, 46);
      centralParts.push(central);
      offset += local.length + content.length;
      count += 1;
    }
  }

  if (count === 0) throw new Error('No saved task files are available to download.');
  const centralDirectory = concat(centralParts);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  write32(endView, 0, 0x06054b50);
  write16(endView, 8, count);
  write16(endView, 10, count);
  write32(endView, 12, centralDirectory.length);
  write32(endView, 16, offset);
  const archive = concat([...localParts, centralDirectory, end]);
  return new Blob([archive.buffer as ArrayBuffer], { type: 'application/zip' });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
