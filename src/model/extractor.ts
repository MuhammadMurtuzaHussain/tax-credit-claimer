// The only seam between the pipeline and a model. Swap implementations with
// --model; the validator never knows which one ran.

export type InputDoc = {
  /** Path relative to the shoebox folder. */
  name: string;
  mime: string;
  /** Text content for .txt / .md / .eml. Null for images. */
  text: string | null;
  /** Raw bytes for images, so a vision model can read them. */
  bytes: Buffer | null;
};

export interface Extractor {
  readonly label: string;
  /** Returns the model's raw JSON. The pipeline parses it; a bad shape becomes "needs review", never a crash. */
  extract(doc: InputDoc): Promise<unknown>;
}
