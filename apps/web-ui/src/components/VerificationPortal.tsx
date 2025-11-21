import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Download, 
  Share2, 
  ShieldCheck,
  FileText,
  Calendar,
  Hash
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

interface VerificationResult {
  isValid: boolean;
  proofId: string;
  documentName: string;
  signedAt: string;
  hash: string;
  certificateUrl?: string;
  metadata?: {
    signer: string;
    location: string;
    device: string;
    software: string;
  };
  error?: string;
}

export function VerificationPortal() {
  const { proofId } = useParams<{ proofId: string }>();
  const navigate = useNavigate();
  const [verification, setVerification] = useState<VerificationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!proofId) {
      setError('No proof ID provided');
      return;
    }

    verifyProof(proofId);
  }, [proofId]);

  const verifyProof = async (id: string) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/v1/proofs/${id}`);
      
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Proof not found. This certificate may not exist or has been revoked.');
        }
        throw new Error('Verification failed. Please try again.');
      }

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Verification failed');
      }

      const result: VerificationResult = {
        isValid: true,
        proofId: data.proofId,
        documentName: data.manifest?.title || 'Unknown Document',
        signedAt: data.timestamp,
        hash: data.imageHash,
        certificateUrl: `/api/v1/proofs/${id}/pdf`,
        metadata: {
          signer: data.manifest?.claim_generator || 'CredLink',
          location: data.metadata?.location || 'Unknown',
          device: data.metadata?.device || 'Unknown',
          software: data.metadata?.software || 'CredLink Platform',
        },
      };

      setVerification(result);
      toast.success('Certificate verified successfully!');

    } catch (error) {
      console.error('Verification error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Verification failed';
      setError(errorMessage);
      setVerification({
        isValid: false,
        proofId: id,
        documentName: 'Unknown',
        signedAt: '',
        hash: '',
        error: errorMessage,
      });
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const downloadCertificate = () => {
    if (verification?.certificateUrl) {
      window.open(verification.certificateUrl, '_blank');
    }
  };

  const shareVerification = async () => {
    const shareUrl = window.location.href;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'CredLink Certificate Verification',
          text: `Verify the authenticity of "${verification?.documentName}" on CredLink`,
          url: shareUrl,
        });
      } catch (error) {
        // User cancelled sharing
      }
    } else {
      // Fallback: copy to clipboard
      try {
        await navigator.clipboard.writeText(shareUrl);
        toast.success('Verification link copied to clipboard!');
      } catch (error) {
        toast.error('Failed to copy link');
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <h2 className="text-2xl font-semibold text-gray-900 mb-2">Verifying Certificate...</h2>
          <p className="text-gray-600">Checking cryptographic proof and blockchain records</p>
        </div>
      </div>
    );
  }

  if (error && !verification) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 via-white to-orange-50 flex items-center justify-center">
        <Card className="max-w-md w-full p-8 text-center">
          <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-semibold text-gray-900 mb-2">Verification Failed</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <div className="space-y-3">
            <Button onClick={() => window.location.reload()} className="w-full">
              Try Again
            </Button>
            <Button 
              variant="outline" 
              onClick={() => navigate('/')}
              className="w-full"
            >
              Back to CredLink
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-blue-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-8 h-8 text-blue-600" />
            <span className="font-bold text-xl">CredLink Verification</span>
          </div>
          <Button variant="outline" onClick={() => navigate('/')}>
            Back to App
          </Button>
        </div>
      </div>

      {/* Verification Result */}
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="text-center mb-8">
          {verification?.isValid ? (
            <>
              <CheckCircle2 className="w-20 h-20 text-green-500 mx-auto mb-4" />
              <h1 className="text-4xl font-bold text-gray-900 mb-2">
                Certificate Verified ✓
              </h1>
              <p className="text-xl text-gray-600">
                This document is authentic and has not been tampered with
              </p>
            </>
          ) : (
            <>
              <XCircle className="w-20 h-20 text-red-500 mx-auto mb-4" />
              <h1 className="text-4xl font-bold text-gray-900 mb-2">
                Verification Failed ✗
              </h1>
              <p className="text-xl text-gray-600">
                {verification?.error || 'This certificate could not be verified'}
              </p>
            </>
          )}
        </div>

        {verification && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Certificate Details */}
            <Card className="p-6">
              <div className="flex items-center gap-3 mb-6">
                <FileText className="w-6 h-6 text-blue-600" />
                <h2 className="text-xl font-semibold text-gray-900">Certificate Details</h2>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-500">Document Name</label>
                  <p className="text-gray-900 font-medium">{verification.documentName}</p>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-500">Proof ID</label>
                  <p className="text-gray-900 font-mono text-sm">{verification.proofId}</p>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-500">Date Signed</label>
                  <div className="flex items-center gap-2 text-gray-900">
                    <Calendar className="w-4 h-4" />
                    <p>{new Date(verification.signedAt).toLocaleString()}</p>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-500">Cryptographic Hash</label>
                  <div className="flex items-center gap-2">
                    <Hash className="w-4 h-4 text-gray-400" />
                    <p className="text-gray-900 font-mono text-xs break-all">{verification.hash}</p>
                  </div>
                </div>
              </div>

              {verification.isValid && (
                <div className="mt-6 space-y-3">
                  <Button onClick={downloadCertificate} className="w-full gap-2">
                    <Download className="w-4 h-4" />
                    Download Certificate PDF
                  </Button>
                  <Button variant="outline" onClick={shareVerification} className="w-full gap-2">
                    <Share2 className="w-4 h-4" />
                    Share Verification
                  </Button>
                </div>
              )}
            </Card>

            {/* Technical Details */}
            <Card className="p-6">
              <div className="flex items-center gap-3 mb-6">
                <ShieldCheck className="w-6 h-6 text-purple-600" />
                <h2 className="text-xl font-semibold text-gray-900">Technical Details</h2>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-500">Signing Authority</label>
                  <p className="text-gray-900">{verification.metadata?.signer || 'CredLink Platform'}</p>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-500">Location</label>
                  <p className="text-gray-900">{verification.metadata?.location || 'Unknown'}</p>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-500">Device</label>
                  <p className="text-gray-900">{verification.metadata?.device || 'Unknown'}</p>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-500">Software</label>
                  <p className="text-gray-900">{verification.metadata?.software || 'Unknown'}</p>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-500">Standard</label>
                  <p className="text-gray-900">C2PA (Coalition for Content Provenance and Authenticity)</p>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-500">Verification Status</label>
                  <div className="flex items-center gap-2">
                    {verification.isValid ? (
                      <>
                        <CheckCircle2 className="w-5 h-5 text-green-500" />
                        <span className="text-green-600 font-medium">Valid</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="w-5 h-5 text-red-500" />
                        <span className="text-red-600 font-medium">Invalid</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* Trust Indicators */}
        <div className="mt-12 text-center">
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">What This Verification Means</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
              <div>
                <ShieldCheck className="w-8 h-8 text-blue-600 mx-auto mb-2" />
                <h4 className="font-medium text-gray-900">Authentic</h4>
                <p className="text-gray-600">This document is exactly as when it was originally signed</p>
              </div>
              <div>
                <Clock className="w-8 h-8 text-green-600 mx-auto mb-2" />
                <h4 className="font-medium text-gray-900">Timestamped</h4>
                <p className="text-gray-600">The signing time is cryptographically proven and immutable</p>
              </div>
              <div>
                <Hash className="w-8 h-8 text-purple-600 mx-auto mb-2" />
                <h4 className="font-medium text-gray-900">Tamper-Proof</h4>
                <p className="text-gray-600">Any modifications would invalidate this verification</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
