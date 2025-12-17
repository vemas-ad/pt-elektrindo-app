declare module "formidable" {
  import { IncomingMessage } from "http";

  export interface File {
    filepath: string;
    originalFilename?: string | null;
    mimetype?: string | null;
  }

  export interface Files {
    [key: string]: File | File[];
  }

  export interface Fields {
    [key: string]: string | string[];
  }

  export interface FormidableOptions {
    multiples?: boolean;
    uploadDir?: string;
    keepExtensions?: boolean;
  }

  export default class IncomingForm {
    constructor(options?: FormidableOptions);
    parse(
      req: IncomingMessage,
      callback: (err: any, fields: Fields, files: Files) => void
    ): void;
  }
}
