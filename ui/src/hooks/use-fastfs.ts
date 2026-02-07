import { serialize as borshSerialize } from "borsh";
import type { FastfsData } from "../types/fastdata";

class BorshSchema {
  FastfsFileContent = {
    struct: {
      mimeType: "string" as const,
      content: { array: { type: "u8" as const } },
    },
  };

  SimpleFastfs = {
    struct: {
      relativePath: "string" as const,
      content: { option: this.FastfsFileContent },
    },
  };

  PartialFastfs = {
    struct: {
      relativePath: "string" as const,
      // The offset has to be aligned to 1Mb (1048576 bytes).
      offset: "u32" as const,
      // The full content size in bytes up to 32Mb (33554432 bytes).
      fullSize: "u32" as const,
      mimeType: "string" as const,
      // The content chunk up to 1Mb (1048576 bytes). We assume zero bytes tail if the chunk is
      // smaller than 1Mb, but inside the file.
      contentChunk: { array: { type: "u8" as const } },
      // A nonce to differentiate different uploads at the same relative path.
      // The nonce should match for all parts of the same file.
      // Max value is i32::MAX.
      // Min value should be 1, to differentiate from simple fastfs entries.
      nonce: "u32" as const,
    },
  };

  FastfsData = {
    enum: [{ struct: { simple: this.SimpleFastfs } }, { struct: { partial: this.PartialFastfs } }],
  };
}

const FastfsSchema = new BorshSchema();

export function encodeFfs(ffs: FastfsData): Uint8Array {
  // biome-ignore lint/suspicious/noExplicitAny: borsh schema type incompatibility requires assertion
  return borshSerialize(FastfsSchema.FastfsData as any, ffs);
}
