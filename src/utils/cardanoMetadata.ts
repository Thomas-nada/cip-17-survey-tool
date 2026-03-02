const MAX_METADATA_STRING_BYTES = 64;

function chunkString(str: string, maxBytes: number): string[] {
  const encoder = new TextEncoder();
  const encoded = encoder.encode(str);
  if (encoded.length <= maxBytes) return [str];

  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let offset = 0;
  while (offset < encoded.length) {
    let end = Math.min(offset + maxBytes, encoded.length);
    while (end > offset && (encoded[end] & 0xc0) === 0x80) {
      end--;
    }
    chunks.push(decoder.decode(encoded.slice(offset, end)));
    offset = end;
  }
  return chunks;
}

/**
 * Convert a JS value into Cardano JSON metadata-safe shape:
 * - strings >64 bytes are split into string[] chunks
 * - booleans become 0/1
 * - undefined fields are omitted
 * - null becomes empty string for compatibility with tx metadata constraints
 */
export function toCardanoJsonMetadata(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === null) return '';

  if (typeof value === 'string') {
    const chunks = chunkString(value, MAX_METADATA_STRING_BYTES);
    return chunks.length === 1 ? chunks[0] : chunks;
  }

  if (typeof value === 'boolean') return value ? 1 : 0;

  if (typeof value === 'number') {
    if (Number.isInteger(value)) return value;
    return String(value);
  }

  if (typeof value === 'bigint') return value.toString();

  if (Array.isArray(value)) {
    return value
      .map((item) => toCardanoJsonMetadata(item))
      .filter((item) => item !== undefined);
  }

  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const converted = toCardanoJsonMetadata(v);
      if (converted !== undefined) out[k] = converted;
    }
    return out;
  }

  return String(value);
}

