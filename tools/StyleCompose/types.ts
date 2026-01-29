
export interface AuditResult {
  matchScore: number;
  geneTable: {
    backgroundColor: string;
    accentColor: string;
    fontColor: string;
    materialTexture: string;
    layout: string;
  };
  exportAdvice: string;
}

export interface ImagePreview {
  url: string;
  base64: string;
  mimeType: string;
}
