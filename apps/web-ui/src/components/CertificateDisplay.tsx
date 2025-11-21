import { useState } from 'react';
import type { SigningResult } from '../types';
import { 
  CheckCircleIcon, 
  DocumentArrowDownIcon,
  ShareIcon,
  EyeIcon
} from '@heroicons/react/24/outline';

interface CertificateDisplayProps {
  result: SigningResult;
  onReset: () => void;
}

export function CertificateDisplay({ result, onReset }: CertificateDisplayProps) {
  const [showDetails, setShowDetails] = useState(false);

  const downloadImage = () => {
    const link = document.createElement('a');
    link.href = `data:${result.mimeType};base64,${result.signedImageData}`;
    link.download = `signed-${result.metadata.title.replace(/\s+/g, '-').toLowerCase()}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    // You could add a toast notification here
  };

  const formatDate = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  return (
    <div className="space-y-6">
      {/* Success Message */}
      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <div className="flex items-center">
          <CheckCircleIcon className="h-5 w-5 text-green-400 mr-2" />
          <h3 className="text-sm font-medium text-green-800">
            Image Successfully Signed!
          </h3>
        </div>
        <p className="mt-2 text-sm text-green-700">
          Your image has been processed and signed with a cryptographic certificate.
        </p>
      </div>

      {/* Signed Image Preview */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Signed Image</h3>
        <div className="space-y-4">
          <img
            src={`data:${result.mimeType};base64,${result.signedImageData}`}
            alt="Signed image"
            className="w-full max-h-96 object-contain rounded-lg border border-slate-200"
          />
          
          <div className="flex space-x-3">
            <button
              onClick={downloadImage}
              className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors flex items-center justify-center"
            >
              <DocumentArrowDownIcon className="h-4 w-4 mr-2" />
              Download Signed Image
            </button>
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="px-4 py-2 border border-slate-300 text-slate-700 rounded-md hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 transition-colors flex items-center"
            >
              <EyeIcon className="h-4 w-4 mr-2" />
              {showDetails ? 'Hide' : 'Show'} Details
            </button>
          </div>
        </div>
      </div>

      {/* Certificate Details */}
      {showDetails && (
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Certificate Details</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Metadata */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-slate-900">Metadata</h4>
              <dl className="space-y-2">
                <div className="flex justify-between">
                  <dt className="text-sm text-slate-500">Title:</dt>
                  <dd className="text-sm font-medium text-slate-900">{result.metadata.title}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-slate-500">Creator:</dt>
                  <dd className="text-sm font-medium text-slate-900">{result.metadata.creator}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-slate-500">Signed With:</dt>
                  <dd className="text-sm font-medium text-orange-600">{result.metadata.signedWith}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-slate-500">Timestamp:</dt>
                  <dd className="text-sm font-medium text-slate-900">{formatDate(result.timestamp)}</dd>
                </div>
              </dl>
            </div>

            {/* Technical Details */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-slate-900">Technical Details</h4>
              <dl className="space-y-2">
                <div className="flex flex-col">
                  <dt className="text-sm text-slate-500">Certificate ID:</dt>
                  <dd className="text-sm font-mono text-slate-900 break-all">{result.certificateId}</dd>
                </div>
                <div className="flex flex-col">
                  <dt className="text-sm text-slate-500">Image Hash:</dt>
                  <dd className="text-sm font-mono text-slate-900 break-all">{result.imageHash}</dd>
                </div>
                <div className="flex flex-col">
                  <dt className="text-sm text-slate-500">Manifest URI:</dt>
                  <dd className="text-sm font-mono text-slate-900 break-all">{result.manifestUri}</dd>
                </div>
                <div className="flex flex-col">
                  <dt className="text-sm text-slate-500">Proof URI:</dt>
                  <dd className="text-sm font-mono text-slate-900 break-all">{result.proofUri}</dd>
                </div>
              </dl>
            </div>
          </div>

          {/* Copy Buttons */}
          <div className="mt-6 pt-6 border-t border-slate-200">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => copyToClipboard(result.certificateId)}
                className="text-sm bg-slate-100 text-slate-700 px-3 py-1 rounded-md hover:bg-slate-200 transition-colors flex items-center"
              >
                <ShareIcon className="h-3 w-3 mr-1" />
                Copy Certificate ID
              </button>
              <button
                onClick={() => copyToClipboard(result.imageHash)}
                className="text-sm bg-slate-100 text-slate-700 px-3 py-1 rounded-md hover:bg-slate-200 transition-colors flex items-center"
              >
                <ShareIcon className="h-3 w-3 mr-1" />
                Copy Image Hash
              </button>
              <button
                onClick={() => copyToClipboard(result.manifestUri)}
                className="text-sm bg-slate-100 text-slate-700 px-3 py-1 rounded-md hover:bg-slate-200 transition-colors flex items-center"
              >
                <ShareIcon className="h-3 w-3 mr-1" />
                Copy Manifest URI
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Demo Notice */}
      <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-orange-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-orange-800">Demo Mode Notice</h3>
            <p className="mt-2 text-sm text-orange-700">
              This certificate is a mock implementation for demonstration purposes. In production, CredLink will generate real cryptographic certificates using C2PA standards that can be verified by any compatible verification service.
            </p>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex space-x-3">
        <button
          onClick={onReset}
          className="flex-1 bg-slate-600 text-white py-2 px-4 rounded-md hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 transition-colors"
        >
          Sign Another Image
        </button>
        <a
          href="https://github.com/nicoladebbia/CredLink"
          target="_blank"
          rel="noopener noreferrer"
          className="px-4 py-2 border border-slate-300 text-slate-700 rounded-md hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 transition-colors flex items-center"
        >
          View on GitHub
        </a>
      </div>
    </div>
  );
}
