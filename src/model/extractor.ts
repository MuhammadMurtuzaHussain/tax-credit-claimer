// The only seam between the pipeline and a model. Swap implementations with
// --model; the validator never knows which one ran.

export type InputDoc = {
  /** Path relative to the shoebox folder. */
  name: string;
  mime: string;
  /** Text content for text files and PDFs with a text layer. Null for images and scans. */
  text: string | null;
  /** The same text split by page (one entry for a text file), so long statements can be read a page at a time. */
  pages: string[] | null;
  /** Images for a vision model: a photo or screenshot, or the drawn pages of a scanned PDF. */
  images: Buffer[];
};

export interface Extractor {
  readonly label: string;
  /** Returns the model's raw JSON. The pipeline parses it; a bad shape becomes "needs review", never a crash. */
  extract(doc: InputDoc): Promise<unknown>;
}
