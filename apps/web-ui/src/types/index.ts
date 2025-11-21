export interface SigningResult {
  success: boolean;
  signedImageData: string;
  mimeType: string;
  manifestUri: string;
  proofUri: string;
  certificateId: string;
  imageHash: string;
  timestamp: string;
  metadata: {
    title: string;
    creator: string;
    signedWith: string;
  };
}

export interface ImageMetadata {
  title: string;
  creator: string;
}

export interface SigningProgress {
  stage: 'uploading' | 'processing' | 'signing' | 'completed';
  progress: number;
  message: string;
}
