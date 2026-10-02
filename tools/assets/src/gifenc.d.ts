declare module 'gifenc' {
  export type Palette = number[][]
  export type FrameOptions = { palette?: Palette; delay?: number; repeat?: number; transparent?: boolean; transparentIndex?: number; dispose?: number }
  export type Encoder = {
    writeFrame(index: Uint8Array, width: number, height: number, opts?: FrameOptions): void
    finish(): void
    bytes(): Uint8Array
  }
  const gifenc: { GIFEncoder(opts?: { auto?: boolean }): Encoder }
  export default gifenc
}
