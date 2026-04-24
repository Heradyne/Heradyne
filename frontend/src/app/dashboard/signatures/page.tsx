'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { 
  FileSignature, Upload, Download, CheckCircle, XCircle, 
  Clock, AlertCircle, Eye, Send, RefreshCw, Loader2, FileText
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { formatDate, formatCurrency } from '@/lib/utils';

interface SignatureDocument {
  id: number;
  deal_id: number;
  uploaded_by_id: number;
  title: string;
  description: string | null;
  document_type: string;
  file_name: string;
  file_type: string;
  file_size: number | null;
  status: string;
  signature_requested_at: string | null;
  signature_due_date: string | null;
  signed_at: string | null;
  signed_by_id: number | null;
  signature_notes: string | null;
  loan_id: number | null;
  created_at: string;
  uploaded_by_name: string | null;
  uploaded_by_role: string | null;
  signed_by_name: string | null;
  deal_name: string | null;
  borrower_name: string | null;
}

interface Deal {
  id: number;
  name: string;
}

export default function SignaturesPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // Documents
  const [pendingDocs, setPendingDocs] = useState<SignatureDocument[]>([]);
  const [uploadedDocs, setUploadedDocs] = useState<SignatureDocument[]>([]);
  
  // For lenders/insurers - deals they can upload to
  const [matchedDeals, setMatchedDeals] = useState<Deal[]>([]);
  
  // Upload modal
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadForm, setUploadForm] = useState({
    deal_id: 0,
    title: '',
    description: '',
    document_type: 'other',
    signature_due_date: '',
    file: null as File | null,
  });
  
  // Sign/Reject modal
  const [showSignModal, setShowSignModal] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<SignatureDocument | null>(null);
  const [signNotes, setSignNotes] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);
  const [signing, setSigning] = useState(false);
  
  // View modal
  const [showViewModal, setShowViewModal] = useState(false);
  const [viewingDoc, setViewingDoc] = useState<SignatureDocument | null>(null);

  const isBorrower = user?.role === 'borrower';
  const isLenderOrInsurer = user?.role === 'lender' || user?.role === 'insurer';

  useEffect(() => {
    loadData();
  }, [user]);

  const loadData = async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      setError('');
      
      if (isBorrower) {
        // Load pending signatures for borrower
        const pending = await api.getPendingSignatures();
        setPendingDocs(pending);
      } else if (isLenderOrInsurer) {
        // Load uploaded documents for lender/insurer
        const uploads = await api.getMyUploadedDocuments();
        setUploadedDocs(uploads);
        
        // Load matched deals they can upload to
        const matches = await api.getMyMatches();
        const acceptedMatches = (matches || []).filter((m: any) => 
          m.status === 'accepted' || m.status === 'counter_accepted'
        );
        const deals = (acceptedMatches || []).map((m: any) => ({
          id: m.deal_id,
          name: m.deal_name || `Deal #${m.deal_id}`
        }));
        // Remove duplicates
        const uniqueDeals = (deals || []).filter((deal: Deal, index: number, self: Deal[]) =>
          index === (self || []).findIndex((d) => d.id === deal.id)
        );
        setMatchedDeals(uniqueDeals);
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadForm.file || !uploadForm.deal_id) {
      setError('Please select a deal and file');
      return;
    }
    
    setUploading(true);
    setError('');
    
    try {
      const formData = new FormData();
      formData.append('deal_id', uploadForm.deal_id.toString());
      formData.append('title', uploadForm.title);
      formData.append('description', uploadForm.description);
      formData.append('document_type', uploadForm.document_type);
      if (uploadForm.signature_due_date) {
        formData.append('signature_due_date', uploadForm.signature_due_date);
      }
      formData.append('file', uploadForm.file);
      
      await api.uploadSignatureDocument(formData);
      
      setSuccess('Document uploaded successfully. The borrower will be notified.');
      setShowUploadModal(false);
      setUploadForm({
        deal_id: 0,
        title: '',
        description: '',
        document_type: 'other',
        signature_due_date: '',
        file: null,
      });
      loadData();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to upload document');
    } finally {
      setUploading(false);
    }
  };

  const handleSign = async () => {
    if (!selectedDoc) return;
    
    setSigning(true);
    setError('');
    
    try {
      await api.signDocument(selectedDoc.id, signNotes);
      setSuccess('Document signed successfully!');
      setShowSignModal(false);
      setSelectedDoc(null);
      setSignNotes('');
      loadData();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to sign document');
    } finally {
      setSigning(false);
    }
  };

  const handleReject = async () => {
    if (!selectedDoc || !rejectReason.trim()) {
      setError('Please provide a reason for rejection');
      return;
    }
    
    setSigning(true);
    setError('');
    
    try {
      await api.rejectDocument(selectedDoc.id, rejectReason);
      setSuccess('Document rejected.');
      setShowSignModal(false);
      setSelectedDoc(null);
      setRejectReason('');
      setIsRejecting(false);
      loadData();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to reject document');
    } finally {
      setSigning(false);
    }
  };

  const handleDownload = async (doc: SignatureDocument) => {
    try {
      const data = await api.downloadSignatureDocument(doc.id);
      
      // Decode base64 and create download
      const byteCharacters = atob(data.file_data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: data.file_type });
      
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = data.file_name;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to download document');
    }
  };

  const handleWithdraw = async (doc: SignatureDocument) => {
    if (!confirm('Are you sure you want to withdraw this document?')) return;
    
    try {
      await api.withdrawDocument(doc.id);
      setSuccess('Document withdrawn successfully');
      loadData();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to withdraw document');
    }
  };

  const openSignModal = (doc: SignatureDocument) => {
    setSelectedDoc(doc);
    setShowSignModal(true);
    setIsRejecting(false);
    setSignNotes('');
    setRejectReason('');
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'signed':
        return 'bg-green-100 text-green-800';
      case 'rejected':
        return 'bg-red-100 text-red-800';
      case 'withdrawn':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getDocTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      loan_agreement: 'Loan Agreement',
      guarantee_contract: 'Guarantee Contract',
      term_sheet: 'Term Sheet',
      promissory_note: 'Promissory Note',
      security_agreement: 'Security Agreement',
      personal_guarantee: 'Personal Guarantee',
      other: 'Other',
    };
    return labels[type] || type;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isBorrower ? 'Documents for Signature' : 'Signature Requests'}
          </h1>
          <p className="text-gray-600">
            {isBorrower 
              ? 'Review and sign documents from lenders and insurers' 
              : 'Upload documents for borrower signature'}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={loadData} className="btn btn-secondary inline-flex items-center">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </button>
          {isLenderOrInsurer && (
            <button 
              onClick={() => setShowUploadModal(true)} 
              className="btn btn-primary inline-flex items-center"
              disabled={matchedDeals.length === 0}
            >
              <Upload className="h-4 w-4 mr-2" />
              Upload Document
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg mb-6">
          {error}
          <button onClick={() => setError('')} className="float-right">×</button>
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 text-green-600 px-4 py-3 rounded-lg mb-6">
          {success}
          <button onClick={() => setSuccess('')} className="float-right">×</button>
        </div>
      )}

      {/* Borrower View - Pending Signatures */}
      {isBorrower && (
        <div>
          {pendingDocs.length === 0 ? (
            <div className="card text-center py-12">
              <FileSignature className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <p className="text-gray-600">No documents pending your signature.</p>
              <p className="text-sm text-gray-500 mt-2">
                Documents from lenders and insurers will appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {(pendingDocs || []).map((doc) => (
                <div key={doc.id} className="card hover:shadow-lg transition-shadow">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4">
                      <div className="p-3 bg-yellow-100 rounded-lg">
                        <FileText className="h-6 w-6 text-yellow-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-lg">{doc.title}</h3>
                        <p className="text-sm text-gray-500">
                          From: {doc.uploaded_by_name} ({doc.uploaded_by_role})
                        </p>
                        <p className="text-sm text-gray-500">
                          Deal: {doc.deal_name}
                        </p>
                        {doc.description && (
                          <p className="text-sm text-gray-600 mt-1">{doc.description}</p>
                        )}
                        <div className="flex gap-4 mt-2 text-sm text-gray-500">
                          <span>{getDocTypeLabel(doc.document_type)}</span>
                          <span>{doc.file_name}</span>
                          {doc.signature_due_date && (
                            <span className="text-orange-600">
                              Due: {formatDate(doc.signature_due_date)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleDownload(doc)}
                        className="btn btn-secondary text-sm"
                      >
                        <Download className="h-4 w-4 mr-1" />
                        Download
                      </button>
                      <button
                        onClick={() => openSignModal(doc)}
                        className="btn btn-primary text-sm"
                      >
                        <FileSignature className="h-4 w-4 mr-1" />
                        Review & Sign
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Lender/Insurer View - Uploaded Documents */}
      {isLenderOrInsurer && (
        <div>
          {matchedDeals.length === 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <p className="text-blue-700">
                You need to have accepted deals before you can upload signature documents.
                Go to Matched Deals to accept deals first.
              </p>
            </div>
          )}
          
          {uploadedDocs.length === 0 ? (
            <div className="card text-center py-12">
              <Upload className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <p className="text-gray-600">No documents uploaded yet.</p>
              <p className="text-sm text-gray-500 mt-2">
                Upload documents that require borrower signature.
              </p>
            </div>
          ) : (
            <div className="card">
              <h2 className="text-lg font-semibold mb-4">Uploaded Documents</h2>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Document</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Deal</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Borrower</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Uploaded</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {(uploadedDocs || []).map((doc) => (
                      <tr key={doc.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div>
                            <p className="font-medium">{doc.title}</p>
                            <p className="text-sm text-gray-500">{getDocTypeLabel(doc.document_type)}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm">{doc.deal_name}</td>
                        <td className="px-4 py-3 text-sm">{doc.borrower_name}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 text-xs rounded-full ${getStatusBadge(doc.status)}`}>
                            {doc.status}
                          </span>
                          {doc.signed_at && (
                            <p className="text-xs text-gray-500 mt-1">
                              {doc.status === 'signed' ? 'Signed' : 'Responded'}: {formatDate(doc.signed_at)}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {formatDate(doc.created_at)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleDownload(doc)}
                              className="text-blue-600 hover:text-blue-800 text-sm"
                            >
                              Download
                            </button>
                            {doc.status === 'pending' && (
                              <button
                                onClick={() => handleWithdraw(doc)}
                                className="text-red-600 hover:text-red-800 text-sm"
                              >
                                Withdraw
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-lg w-full mx-4">
            <h2 className="text-xl font-semibold mb-4">Upload Document for Signature</h2>
            
            <form onSubmit={handleUpload} className="space-y-4">
              <div>
                <label className="label">Deal *</label>
                <select
                  value={uploadForm.deal_id}
                  onChange={(e) => setUploadForm({ ...uploadForm, deal_id: parseInt(e.target.value) })}
                  className="input"
                  required
                >
                  <option value={0}>Select a deal...</option>
                  {(matchedDeals || []).map((deal) => (
                    <option key={deal.id} value={deal.id}>{deal.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label">Document Title *</label>
                <input
                  type="text"
                  value={uploadForm.title}
                  onChange={(e) => setUploadForm({ ...uploadForm, title: e.target.value })}
                  className="input"
                  required
                  placeholder="e.g., Loan Agreement"
                />
              </div>

              <div>
                <label className="label">Document Type</label>
                <select
                  value={uploadForm.document_type}
                  onChange={(e) => setUploadForm({ ...uploadForm, document_type: e.target.value })}
                  className="input"
                >
                  <option value="loan_agreement">Loan Agreement</option>
                  <option value="guarantee_contract">Guarantee Contract</option>
                  <option value="term_sheet">Term Sheet</option>
                  <option value="promissory_note">Promissory Note</option>
                  <option value="security_agreement">Security Agreement</option>
                  <option value="personal_guarantee">Personal Guarantee</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="label">Description</label>
                <textarea
                  value={uploadForm.description}
                  onChange={(e) => setUploadForm({ ...uploadForm, description: e.target.value })}
                  className="input"
                  rows={2}
                  placeholder="Brief description of the document..."
                />
              </div>

              <div>
                <label className="label">Signature Due Date (optional)</label>
                <input
                  type="date"
                  value={uploadForm.signature_due_date}
                  onChange={(e) => setUploadForm({ ...uploadForm, signature_due_date: e.target.value })}
                  className="input"
                />
              </div>

              <div>
                <label className="label">File *</label>
                <input
                  type="file"
                  onChange={(e) => setUploadForm({ ...uploadForm, file: e.target.files?.[0] || null })}
                  className="input"
                  accept=".pdf,.doc,.docx"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">PDF, DOC, or DOCX files accepted</p>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploading}
                  className="btn btn-primary inline-flex items-center"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      Upload Document
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Sign/Reject Modal */}
      {showSignModal && selectedDoc && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-lg w-full mx-4">
            <h2 className="text-xl font-semibold mb-4">
              {isRejecting ? 'Reject Document' : 'Review & Sign Document'}
            </h2>
            
            <div className="bg-gray-50 rounded-lg p-4 mb-4">
              <h3 className="font-medium">{selectedDoc.title}</h3>
              <p className="text-sm text-gray-500">From: {selectedDoc.uploaded_by_name}</p>
              <p className="text-sm text-gray-500">File: {selectedDoc.file_name}</p>
              {selectedDoc.description && (
                <p className="text-sm text-gray-600 mt-2">{selectedDoc.description}</p>
              )}
              <button
                onClick={() => handleDownload(selectedDoc)}
                className="mt-3 text-blue-600 hover:text-blue-800 text-sm inline-flex items-center"
              >
                <Download className="h-4 w-4 mr-1" />
                Download to review
              </button>
            </div>

            {!isRejecting ? (
              <div className="space-y-4">
                <div>
                  <label className="label">Notes (optional)</label>
                  <textarea
                    value={signNotes}
                    onChange={(e) => setSignNotes(e.target.value)}
                    className="input"
                    rows={2}
                    placeholder="Add any notes about your signature..."
                  />
                </div>

                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                  <p className="text-sm text-yellow-800">
                    <AlertCircle className="h-4 w-4 inline mr-1" />
                    By signing, you acknowledge that you have reviewed and agree to the terms of this document.
                  </p>
                </div>

                <div className="flex justify-between gap-3 pt-4">
                  <button
                    onClick={() => setIsRejecting(true)}
                    className="btn bg-red-600 text-white hover:bg-red-700"
                  >
                    Decline to Sign
                  </button>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowSignModal(false)}
                      className="btn btn-secondary"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSign}
                      disabled={signing}
                      className="btn btn-primary inline-flex items-center"
                    >
                      {signing ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Signing...
                        </>
                      ) : (
                        <>
                          <CheckCircle className="h-4 w-4 mr-2" />
                          Sign Document
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="label">Reason for Rejection *</label>
                  <textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    className="input"
                    rows={3}
                    placeholder="Please explain why you are declining to sign..."
                    required
                  />
                </div>

                <div className="flex justify-end gap-3 pt-4">
                  <button
                    onClick={() => setIsRejecting(false)}
                    className="btn btn-secondary"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleReject}
                    disabled={signing || !rejectReason.trim()}
                    className="btn bg-red-600 text-white hover:bg-red-700 inline-flex items-center"
                  >
                    {signing ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Rejecting...
                      </>
                    ) : (
                      <>
                        <XCircle className="h-4 w-4 mr-2" />
                        Reject Document
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}