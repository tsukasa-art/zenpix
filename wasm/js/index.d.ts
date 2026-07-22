export interface AvifEncodeOptions {
  quality?: number;
  speed?: number;
}

export type AvifEncoderVariant = "baseline" | "simd";

export interface CreateAvifEncoderOptions {
  variant?: AvifEncoderVariant;
  wasmUrl?: string;
}

export interface AvifEncoder {
  encode(
    pixels: Uint8Array,
    width: number,
    height: number,
    options?: AvifEncodeOptions,
  ): Uint8Array | null;
  readonly version: string;
  dispose(): void;
}

export function createAvifEncoder(
  options?: string | CreateAvifEncoderOptions,
): Promise<AvifEncoder>;
