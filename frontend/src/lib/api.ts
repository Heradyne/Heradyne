import axios, { AxiosInstance, AxiosError } from 'axios';
import { Token, User, Deal, DealRiskReport, LenderPolicy, InsurerPolicy, DealMatch, SystemAssumption, MonthlyCashflow, FeeLedgerEntry, AuditLog, UserWithOverrides, ExecutedLoan, LenderDashboardStats, InsurerDashboardStats, AdminDashboardStats, LoanPayment } from '@/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface LoginResponse {
  access_token: string;
  token_type: string;
  must_change_password: boolean;
}

class ApiClient {
  private client: AxiosInstance;
  private token: string | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: `${API_URL}/api/v1`,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add auth interceptor
    this.client.interceptors.request.use((config) => {
      if (this.token) {
        config.headers.Authorization = `Bearer ${this.token}`;
      }
      return config;
    });

    // Load token from localStorage on init
    if (typeof window !== 'undefined') {
      this.token = localStorage.getItem('token');
    }
  }

  setToken(token: string | null) {
    this.token = token;
    if (typeof window !== 'undefined') {
      if (token) {
        localStorage.setItem('token', token);
      } else {
        localStorage.removeItem('token');
      }
    }
  }

  getToken(): string | null {
    return this.token;
  }

  // Auth
  async login(email: string, password: string): Promise<LoginResponse> {
    const response = await this.client.post<LoginResponse>('/auth/login', { email, password });
    this.setToken(response.data.access_token);
    return response.data;
  }

  async register(data: { email: string; password: string; full_name: string; company_name?: string; role: string }): Promise<User> {
    const response = await this.client.post<User>('/auth/register', data);
    return response.data;
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await this.client.post('/auth/change-password', {
      current_password: currentPassword,
      new_password: newPassword
    });
  }

  logout() {
    this.setToken(null);
  }

  // Users
  async getCurrentUser(): Promise<User> {
    const response = await this.client.get<User>('/users/me');
    return response.data;
  }

  async updateCurrentUser(data: { full_name?: string; company_name?: string }): Promise<User> {
    const response = await this.client.put<User>('/users/me', data);
    return response.data;
  }

  // Admin user management
  async adminCreateUser(data: {
    email: string;
    full_name: string;
    company_name?: string;
    role: string;
    temporary_password: string;
    organization_id?: number | null;
    skip_password_change?: boolean;
  }): Promise<any> {
    const response = await this.client.post('/users/', data);
    return response.data;
  }

  async getLenderOrganizations(): Promise<any[]> {
    const response = await this.client.get('/users/lender-organizations');
    return response.data;
  }

  async adminResetPassword(userId: number): Promise<User> {
    const response = await this.client.put<User>(`/users/${userId}/reset-password`);
    return response.data;
  }

  // Deals
  async getDeals(status?: string): Promise<Deal[]> {
    const params = status ? { status } : {};
    const response = await this.client.get<Deal[]>('/deals/', { params });
    return response.data;
  }

  async getDeal(id: number): Promise<Deal & { documents: any[]; risk_reports: DealRiskReport[] }> {
    const response = await this.client.get(`/deals/${id}`);
    return response.data;
  }

  async createDeal(data: Partial<Deal>): Promise<Deal> {
    const response = await this.client.post<Deal>('/deals/', data);
    return response.data;
  }

  async updateDeal(id: number, data: Partial<Deal>): Promise<Deal> {
    const response = await this.client.put<Deal>(`/deals/${id}`, data);
    return response.data;
  }

  async deleteDeal(id: number): Promise<void> {
    await this.client.delete(`/deals/${id}`);
  }

  async submitDeal(id: number): Promise<{ deal_id: number; status: string; message: string }> {
    const response = await this.client.post(`/deals/${id}/submit`);
    return response.data;
  }

  async analyzeDealSync(id: number): Promise<{ deal_id: number; status: string; message: string }> {
    const response = await this.client.post(`/deals/${id}/analyze-sync`);
    return response.data;
  }

  async uploadDocument(dealId: number, file: File, documentType?: string): Promise<any> {
    const formData = new FormData();
    formData.append('file', file);
    if (documentType) {
      formData.append('document_type', documentType);
    }
    const response = await this.client.post(`/deals/${dealId}/documents`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  }

  async downloadDocument(dealId: number, documentId: number, filename: string): Promise<boolean> {
    // Only run in browser
    if (typeof window === 'undefined') {
      return false;
    }
    
    try {
      // Ensure token is loaded from localStorage
      if (!this.token) {
        this.token = localStorage.getItem('token');
      }
      
      if (!this.token) {
        alert('Download error: Not authenticated. Please log in again.');
        return false;
      }
      
      console.log('Downloading document...');
      console.log('Deal ID:', dealId);
      console.log('Document ID:', documentId);
      console.log('Token (first 20 chars):', this.token.substring(0, 20) + '...');
      
      // Use axios with blob response type - it has the auth interceptor
      const response = await this.client.get(
        `/deals/${dealId}/documents/${documentId}/download`,
        { responseType: 'blob' }
      );
      
      console.log('Response received, status:', response.status);
      
      // Get the blob and download it
      const blob = new Blob([response.data]);
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);
      return true;
    } catch (error: any) {
      console.error('Download failed:', error);
      
      let errorMessage = 'Download failed';
      
      if (error.response) {
        console.error('Response status:', error.response.status);
        
        // Try to read error from blob response
        if (error.response.data instanceof Blob) {
          try {
            const text = await error.response.data.text();
            console.error('Error response:', text);
            const json = JSON.parse(text);
            errorMessage = json.detail || errorMessage;
          } catch (e) {
            errorMessage = `Error ${error.response.status}`;
          }
        } else if (error.response.data?.detail) {
          errorMessage = error.response.data.detail;
        }
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      alert(`Download error: ${errorMessage}`);
      return false;
    }
  }

  // Alternative: Get direct download URL (for use in anchor tags)
  getDocumentDownloadUrl(dealId: number, documentId: number): string {
    return `${API_URL}/api/v1/deals/${dealId}/documents/${documentId}/download`;
  }

  async getLatestRiskReport(dealId: number): Promise<DealRiskReport> {
    const response = await this.client.get<DealRiskReport>(`/deals/${dealId}/risk-reports/latest`);
    return response.data;
  }

  async getVerificationStatus(dealId: number): Promise<any> {
    const response = await this.client.get(`/deals/${dealId}/verification`);
    return response.data;
  }

  async runVerification(dealId: number): Promise<any> {
    const response = await this.client.post(`/deals/${dealId}/verify-documents`);
    return response.data;
  }

  // Policies
  async getLenderPolicies(): Promise<LenderPolicy[]> {
    const response = await this.client.get<LenderPolicy[]>('/policies/lender');
    return response.data;
  }

  async getLenderPolicy(id: number): Promise<LenderPolicy> {
    const response = await this.client.get<LenderPolicy>(`/policies/lender/${id}`);
    return response.data;
  }

  async createLenderPolicy(data: Partial<LenderPolicy>): Promise<LenderPolicy> {
    const response = await this.client.post<LenderPolicy>('/policies/lender', data);
    return response.data;
  }

  async updateLenderPolicy(id: number, data: Partial<LenderPolicy>): Promise<LenderPolicy> {
    const response = await this.client.put<LenderPolicy>(`/policies/lender/${id}`, data);
    return response.data;
  }

  async deleteLenderPolicy(id: number): Promise<void> {
    await this.client.delete(`/policies/lender/${id}`);
  }

  async getInsurerPolicies(): Promise<InsurerPolicy[]> {
    const response = await this.client.get<InsurerPolicy[]>('/policies/insurer');
    return response.data;
  }

  async createInsurerPolicy(data: Partial<InsurerPolicy>): Promise<InsurerPolicy> {
    const response = await this.client.post<InsurerPolicy>('/policies/insurer', data);
    return response.data;
  }

  async updateInsurerPolicy(id: number, data: Partial<InsurerPolicy>): Promise<InsurerPolicy> {
    const response = await this.client.put<InsurerPolicy>(`/policies/insurer/${id}`, data);
    return response.data;
  }

  // Matching
  async runMatching(dealId: number): Promise<any> {
    const response = await this.client.post(`/matching/deals/${dealId}/run`, { generate_scenarios: true });
    return response.data;
  }

  async getMyMatches(): Promise<DealMatch[]> {
    const response = await this.client.get<DealMatch[]>('/matching/my-matches');
    return response.data;
  }

  async getDealMatches(dealId: number): Promise<DealMatch[]> {
    const response = await this.client.get<DealMatch[]>(`/matching/deals/${dealId}/matches`);
    return response.data;
  }

  async makeMatchDecision(matchId: number, status: string, notes?: string): Promise<DealMatch> {
    const response = await this.client.put<DealMatch>(`/matching/matches/${matchId}/decision`, {
      status,
      decision_notes: notes,
    });
    return response.data;
  }

  async respondToCounterOffer(matchId: number, response: 'accepted' | 'rejected', notes?: string): Promise<DealMatch> {
    const res = await this.client.put<DealMatch>(`/matching/matches/${matchId}/counter-offer-response`, {
      response,
      notes,
    });
    return res.data;
  }

  async getCounterOfferDetails(matchId: number): Promise<any> {
    const response = await this.client.get(`/matching/matches/${matchId}/counter-offer`);
    return response.data;
  }

  // Cashflow
  async addMonthlyCashflow(dealId: number, data: Partial<MonthlyCashflow>): Promise<MonthlyCashflow> {
    const response = await this.client.post<MonthlyCashflow>(`/cashflow/deals/${dealId}/monthly`, data);
    return response.data;
  }

  async getMonthlyCashflows(dealId: number): Promise<MonthlyCashflow[]> {
    const response = await this.client.get<MonthlyCashflow[]>(`/cashflow/deals/${dealId}/monthly`);
    return response.data;
  }

  async calculateFees(dealId: number): Promise<{ deal_id: number; total_fees: number; entries: FeeLedgerEntry[] }> {
    const response = await this.client.post(`/cashflow/deals/${dealId}/calculate-fees`);
    return response.data;
  }

  async exportFeeLedger(dealId: number): Promise<Blob> {
    const response = await this.client.get(`/cashflow/deals/${dealId}/fee-ledger/export`, {
      responseType: 'blob',
    });
    return response.data;
  }

  // Assumptions
  async getAssumptions(category?: string, userId?: number): Promise<SystemAssumption[]> {
    const params: any = {};
    if (category) params.category = category;
    if (userId !== undefined) params.user_id = userId;
    const response = await this.client.get<SystemAssumption[]>('/assumptions/', { params });
    return response.data;
  }

  async getEffectiveAssumptions(userId: number, category?: string): Promise<SystemAssumption[]> {
    const params: any = { user_id: userId };
    if (category) params.category = category;
    const response = await this.client.get<SystemAssumption[]>('/assumptions/effective', { params });
    return response.data;
  }

  async getUsersWithOverrides(): Promise<UserWithOverrides[]> {
    const response = await this.client.get<UserWithOverrides[]>('/assumptions/users');
    return response.data;
  }

  async getUserOverrides(userId: number): Promise<SystemAssumption[]> {
    const response = await this.client.get<SystemAssumption[]>(`/assumptions/users/${userId}/overrides`);
    return response.data;
  }

  async updateAssumption(category: string, key: string, value: any, description?: string, userId?: number): Promise<SystemAssumption> {
    const params: any = {};
    if (userId !== undefined) params.user_id = userId;
    const response = await this.client.put<SystemAssumption>(`/assumptions/${category}/${key}`, {
      value,
      description,
    }, { params });
    return response.data;
  }

  async createUserOverride(userId: number, category: string, key: string, value: any, description?: string): Promise<SystemAssumption> {
    const response = await this.client.post<SystemAssumption>(`/assumptions/users/${userId}/override`, {
      user_id: userId,
      category,
      key,
      value,
      description,
    });
    return response.data;
  }

  async copyDefaultsToUser(userId: number, categories?: string[]): Promise<SystemAssumption[]> {
    const params: any = {};
    if (categories) params.categories = categories;
    const response = await this.client.post<SystemAssumption[]>(`/assumptions/users/${userId}/copy-defaults`, null, { params });
    return response.data;
  }

  async deleteUserOverrides(userId: number): Promise<void> {
    await this.client.delete(`/assumptions/users/${userId}/overrides`);
  }

  async deleteAssumption(category: string, key: string, userId?: number): Promise<void> {
    const params: any = {};
    if (userId !== undefined) params.user_id = userId;
    await this.client.delete(`/assumptions/${category}/${key}`, { params });
  }

  // Audit
  async getAuditLogs(params?: { entity_type?: string; entity_id?: number; action?: string }): Promise<{ total: number; items: AuditLog[] }> {
    const response = await this.client.get('/audit/', { params });
    return response.data;
  }

  // Users (for admin)
  async getAllUsers(): Promise<User[]> {
    const response = await this.client.get<User[]>('/users/');
    return response.data;
  }

  // Financial Dashboard
  async getLenderDashboard(lenderId?: number): Promise<LenderDashboardStats> {
    const params = lenderId ? { lender_id: lenderId } : {};
    const response = await this.client.get<LenderDashboardStats>('/financial/dashboard/lender', { params });
    return response.data;
  }

  async getInsurerDashboard(insurerId?: number): Promise<InsurerDashboardStats> {
    const params = insurerId ? { insurer_id: insurerId } : {};
    const response = await this.client.get<InsurerDashboardStats>('/financial/dashboard/insurer', { params });
    return response.data;
  }

  async getAdminDashboard(): Promise<AdminDashboardStats> {
    const response = await this.client.get<AdminDashboardStats>('/financial/dashboard/admin');
    return response.data;
  }

  async getExecutedLoans(params?: {
    lender_id?: number;
    insurer_id?: number;
    status?: string;
    state?: string;
    industry?: string;
  }): Promise<ExecutedLoan[]> {
    const response = await this.client.get<ExecutedLoan[]>('/financial/loans', { params });
    return response.data;
  }

  async getExecutedLoan(loanId: number): Promise<ExecutedLoan> {
    const response = await this.client.get<ExecutedLoan>(`/financial/loans/${loanId}`);
    return response.data;
  }

  async getLoanPayments(loanId: number): Promise<LoanPayment[]> {
    const response = await this.client.get<LoanPayment[]>(`/financial/loans/${loanId}/payments`);
    return response.data;
  }

  async getLoansGroupedByLender(): Promise<any[]> {
    const response = await this.client.get('/financial/loans/by-lender');
    return response.data;
  }

  async getLoansGroupedByInsurer(): Promise<any[]> {
    const response = await this.client.get('/financial/loans/by-insurer');
    return response.data;
  }

  // Secondary Market
  async getSecondaryListings(params?: {
    listing_type?: string;
    status?: string;
    min_price?: number;
    max_price?: number;
    industry?: string;
    state?: string;
    my_listings?: boolean;
  }): Promise<any[]> {
    const response = await this.client.get('/secondary-market/listings', { params });
    return response.data;
  }

  async getSecondaryListing(listingId: number): Promise<any> {
    const response = await this.client.get(`/secondary-market/listings/${listingId}`);
    return response.data;
  }

  async createSecondaryListing(data: {
    listing_type: string;
    loan_id: number;
    title: string;
    description?: string;
    participation_percentage?: number;
    principal_amount?: number;
    risk_percentage?: number;
    premium_share?: number;
    asking_price: number;
    minimum_price?: number;
    implied_yield?: number;
    expiry_date?: string;
  }): Promise<any> {
    const response = await this.client.post('/secondary-market/listings', data);
    return response.data;
  }

  async updateSecondaryListing(listingId: number, data: any): Promise<any> {
    const response = await this.client.put(`/secondary-market/listings/${listingId}`, data);
    return response.data;
  }

  async cancelSecondaryListing(listingId: number): Promise<void> {
    await this.client.delete(`/secondary-market/listings/${listingId}`);
  }

  async getListingOffers(listingId: number): Promise<any[]> {
    const response = await this.client.get(`/secondary-market/listings/${listingId}/offers`);
    return response.data;
  }

  async createOffer(listingId: number, data: {
    offer_price: number;
    message?: string;
    expiry_date?: string;
  }): Promise<any> {
    const response = await this.client.post(`/secondary-market/listings/${listingId}/offers`, {
      listing_id: listingId,
      ...data
    });
    return response.data;
  }

  async respondToOffer(offerId: number, action: 'accept' | 'reject', message?: string): Promise<any> {
    const response = await this.client.post(`/secondary-market/offers/${offerId}/respond`, {
      action,
      message
    });
    return response.data;
  }

  async withdrawOffer(offerId: number): Promise<void> {
    await this.client.delete(`/secondary-market/offers/${offerId}`);
  }

  async getMyOffers(status?: string): Promise<any[]> {
    const params = status ? { status_filter: status } : {};
    const response = await this.client.get('/secondary-market/my/offers', { params });
    return response.data;
  }

  async getMyParticipations(): Promise<any[]> {
    const response = await this.client.get('/secondary-market/my/participations');
    return response.data;
  }

  async getMyRiskPositions(): Promise<any[]> {
    const response = await this.client.get('/secondary-market/my/risk-positions');
    return response.data;
  }

  async getSecondaryMarketStats(): Promise<any> {
    const response = await this.client.get('/secondary-market/stats');
    return response.data;
  }

  // Loan Origination
  async getOriginatableMatches(): Promise<any[]> {
    const response = await this.client.get('/origination/originatable-matches');
    return response.data;
  }

  async originateLoan(data: {
    match_id: number;
    principal_amount: number;
    interest_rate: number;
    term_months: number;
    origination_date?: string;
    notes?: string;
  }): Promise<any> {
    const response = await this.client.post('/origination/originate-loan', data);
    return response.data;
  }

  async getGuaranteeableMatches(): Promise<any[]> {
    const response = await this.client.get('/origination/guaranteeable-matches');
    return response.data;
  }

  async issueGuarantee(data: {
    match_id: number;
    guarantee_percentage: number;
    premium_rate: number;
    effective_date?: string;
    notes?: string;
  }): Promise<any> {
    const response = await this.client.post('/origination/issue-guarantee', data);
    return response.data;
  }

  async getMyOriginatedLoans(status?: string): Promise<any[]> {
    const params = status ? { status_filter: status } : {};
    const response = await this.client.get('/origination/my-originated-loans', { params });
    return response.data;
  }

  async getMyGuaranteedLoans(status?: string): Promise<any[]> {
    const params = status ? { status_filter: status } : {};
    const response = await this.client.get('/origination/my-guaranteed-loans', { params });
    return response.data;
  }

  async getOriginationSettings(): Promise<{
    require_dual_acceptance: boolean;
    require_insurer_for_origination: boolean;
  }> {
    const response = await this.client.get('/origination/settings');
    return response.data;
  }

  async updateOriginationSettings(data: {
    require_dual_acceptance?: boolean;
    require_insurer_for_origination?: boolean;
  }): Promise<any> {
    const response = await this.client.put('/origination/settings', data);
    return response.data;
  }

  // Signature Documents
  async uploadSignatureDocument(formData: FormData): Promise<any> {
    const response = await this.client.post('/signature-documents/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  }

  async getPendingSignatures(): Promise<any[]> {
    const response = await this.client.get('/signature-documents/pending');
    return response.data;
  }

  async getDealSignatureDocuments(dealId: number): Promise<any[]> {
    const response = await this.client.get(`/signature-documents/deal/${dealId}`);
    return response.data;
  }

  async getMyUploadedDocuments(status?: string): Promise<any[]> {
    const params = status ? { status_filter: status } : {};
    const response = await this.client.get('/signature-documents/my-uploads', { params });
    return response.data;
  }

  async getSignatureDocument(documentId: number): Promise<any> {
    const response = await this.client.get(`/signature-documents/${documentId}`);
    return response.data;
  }

  async downloadSignatureDocument(documentId: number): Promise<any> {
    const response = await this.client.get(`/signature-documents/${documentId}/download`);
    return response.data;
  }

  async signDocument(documentId: number, notes?: string): Promise<any> {
    const response = await this.client.post(`/signature-documents/${documentId}/sign`, {
      signature_notes: notes
    });
    return response.data;
  }

  async rejectDocument(documentId: number, reason: string): Promise<any> {
    const response = await this.client.post(`/signature-documents/${documentId}/reject`, {
      rejection_reason: reason
    });
    return response.data;
  }

  async withdrawDocument(documentId: number): Promise<void> {
    await this.client.delete(`/signature-documents/${documentId}`);
  }

  // Default Protection
  async getMyProtections(): Promise<any[]> {
    const response = await this.client.get('/protection/my-protections');
    return response.data;
  }

  async getProtection(protectionId: number): Promise<any> {
    const response = await this.client.get(`/protection/${protectionId}`);
    return response.data;
  }

  async getProtectionEvents(protectionId: number): Promise<any[]> {
    const response = await this.client.get(`/protection/${protectionId}/events`);
    return response.data;
  }

  async enrollTier2(protectionId: number, monthlyFee: number): Promise<any> {
    const response = await this.client.post(`/protection/${protectionId}/enroll-tier-2`, {
      monthly_fee: monthlyFee
    });
    return response.data;
  }

  async makeTier2Payment(protectionId: number, amount: number, paymentMethod?: string): Promise<any> {
    const response = await this.client.post(`/protection/${protectionId}/tier-2-payment`, {
      amount,
      payment_method: paymentMethod || 'card'
    });
    return response.data;
  }

  async getSuggestedTier2Fee(loanId: number): Promise<any> {
    const response = await this.client.get(`/protection/suggested-tier-2-fee/${loanId}`);
    return response.data;
  }

  async simulateDefault(protectionId: number, missedAmount: number): Promise<any> {
    const response = await this.client.post(`/protection/${protectionId}/simulate-default`, {
      missed_amount: missedAmount
    });
    return response.data;
  }

  // Collateral / Pre-Qualified Assets
  async getAssetCategories(): Promise<any[]> {
    const response = await this.client.get('/collateral/categories');
    return response.data;
  }

  async getMyAssets(assetType?: string, activeOnly: boolean = true): Promise<any[]> {
    const params: any = { active_only: activeOnly };
    if (assetType) params.asset_type = assetType;
    const response = await this.client.get('/collateral/my-assets', { params });
    return response.data;
  }

  async getCollateralSummary(): Promise<any> {
    const response = await this.client.get('/collateral/summary');
    return response.data;
  }

  async createAsset(data: any): Promise<any> {
    const response = await this.client.post('/collateral/', data);
    return response.data;
  }

  async getAsset(assetId: number): Promise<any> {
    const response = await this.client.get(`/collateral/${assetId}`);
    return response.data;
  }

  async updateAsset(assetId: number, data: any): Promise<any> {
    const response = await this.client.put(`/collateral/${assetId}`, data);
    return response.data;
  }

  async deleteAsset(assetId: number): Promise<void> {
    await this.client.delete(`/collateral/${assetId}`);
  }

  async revalueAsset(assetId: number): Promise<any> {
    const response = await this.client.post(`/collateral/${assetId}/revalue`);
    return response.data;
  }

  async applyAssetsToDeal(dealId: number, assetIds: number[]): Promise<any> {
    const response = await this.client.post(`/collateral/apply-to-deal/${dealId}`, assetIds);
    return response.data;
  }

  async getAssetsForDeal(dealId: number): Promise<any> {
    const response = await this.client.get(`/collateral/for-deal/${dealId}`);
    return response.data;
  }

  // Verification APIs
  async getDealsForVerification(statusFilter?: string): Promise<any[]> {
    const params = statusFilter ? { status_filter: statusFilter } : {};
    const response = await this.client.get('/verification/my-deals', { params });
    return response.data;
  }

  async createVerificationFlag(data: {
    deal_id: number;
    match_id?: number;
    field_name: string;
    reported_value?: string;
    expected_value?: string;
    difference_description?: string;
    severity: string;
    notes?: string;
  }): Promise<any> {
    const response = await this.client.post('/verification/flags', data);
    return response.data;
  }

  async getDealFlags(dealId: number): Promise<any[]> {
    const response = await this.client.get(`/verification/flags/${dealId}`);
    return response.data;
  }

  async resolveFlag(flagId: number, data: { status: string; resolution_notes?: string }): Promise<any> {
    const response = await this.client.put(`/verification/flags/${flagId}/resolve`, data);
    return response.data;
  }

  async markDealVerified(data: { match_id: number; verification_notes?: string }): Promise<any> {
    const response = await this.client.post('/verification/mark-verified', data);
    return response.data;
  }

  async updateVerificationChecklist(dealId: number, data: {
    financials_verified?: boolean;
    documents_reviewed?: boolean;
    collateral_verified?: boolean;
    references_checked?: boolean;
    verification_notes?: string;
  }): Promise<any> {
    const response = await this.client.put(`/verification/checklist/${dealId}`, data);
    return response.data;
  }

  async getDealVerificationStatus(dealId: number): Promise<any> {
    const response = await this.client.get(`/verification/status/${dealId}`);
    return response.data;
  }

  // Reinsurance APIs
  async getInsurerDeals(): Promise<any[]> {
    const response = await this.client.get('/reinsurance/insured-deals');
    return response.data;
  }

  async getReinsurancePools(): Promise<any[]> {
    const response = await this.client.get('/reinsurance/pools');
    return response.data;
  }

  async createReinsurancePool(data: {
    name: string;
    description?: string;
    deal_ids: number[];
    cession_percentage: number;
  }): Promise<any> {
    const response = await this.client.post('/reinsurance/pools', data);
    return response.data;
  }

  async getReinsurancePool(poolId: number): Promise<any> {
    const response = await this.client.get(`/reinsurance/pools/${poolId}`);
    return response.data;
  }

  async offerReinsurancePool(poolId: number, data: {
    asking_price: number;
    cession_percentage?: number;
    notes?: string;
  }): Promise<any> {
    const response = await this.client.post(`/reinsurance/pools/${poolId}/offer`, data);
    return response.data;
  }

  async deleteReinsurancePool(poolId: number): Promise<any> {
    const response = await this.client.delete(`/reinsurance/pools/${poolId}`);
    return response.data;
  }

  async getReinsuranceMarket(): Promise<any[]> {
    const response = await this.client.get('/reinsurance/market');
    return response.data;
  }

  async makeReinsuranceOffer(poolId: number, data: {
    offered_price: number;
    offered_cession_pct?: number;
    notes?: string;
  }): Promise<any> {
    const response = await this.client.post(`/reinsurance/market/${poolId}/offer`, data);
    return response.data;
  }

  async getReceivedReinsuranceOffers(): Promise<any[]> {
    const response = await this.client.get('/reinsurance/offers/received');
    return response.data;
  }

  async acceptReinsuranceOffer(offerId: number): Promise<any> {
    const response = await this.client.put(`/reinsurance/offers/${offerId}/accept`);
    return response.data;
  }

  async rejectReinsuranceOffer(offerId: number, notes?: string): Promise<any> {
    const response = await this.client.put(`/reinsurance/offers/${offerId}/reject`, { response_notes: notes });
    return response.data;
  }

  // AI Agent
  async scoreWithAIAgent(data: {
    loan_amount: number;
    loan_purpose: string;
    naics_industry: string;
    business_age: number;
    equity_injection: number;
    dscr: number;
    borrower_credit_score: number;
    [key: string]: any;
  }): Promise<any> {
    const response = await this.client.post('/ai-agent/score', data);
    return response.data;
  }

  async scoreDealWithAIAgent(dealId: number): Promise<any> {
    const response = await this.client.post(`/ai-agent/score/deal/${dealId}`);
    return response.data;
  }

  async monitorLoanWithAIAgent(data: {
    loan_id: number;
    dscr_current?: number;
    sba_payment_status?: string;
    [key: string]: any;
  }): Promise<any> {
    const response = await this.client.post('/ai-agent/monitor', data);
    return response.data;
  }

  async getAIAgentDashboard(): Promise<any> {
    const response = await this.client.get('/ai-agent/dashboard/alerts');
    return response.data;
  }

  async getAIAgentVariables(category?: string): Promise<any> {
    const params = category ? { category } : {};
    const response = await this.client.get('/ai-agent/variables', { params });
    return response.data;
  }

  async getAIAgentTiers(): Promise<any> {
    const response = await this.client.get('/ai-agent/tiers');
    return response.data;
  }

  // SBA Compliance
  async checkSBACompliance(dealId: number): Promise<any> {
    const response = await this.client.get(`/sba-compliance/check/${dealId}`);
    return response.data;
  }

  async getLenderChecklist(dealId: number): Promise<any> {
    const response = await this.client.get(`/sba-compliance/lender-checklist/${dealId}`);
    return response.data;
  }

  async getSBARequirements(): Promise<any> {
    const response = await this.client.get('/sba-compliance/requirements');
    return response.data;
  }

  // Actuarial Pricing (Actuary-in-a-Box)
  async priceSubmission(submission: any, policyTerms: any): Promise<any> {
    const response = await this.client.post('/actuarial/price', {
      submission: submission,
      policy_terms: policyTerms
    });
    return response.data;
  }

  async priceDeal(dealId: number, policyTerms: any): Promise<any> {
    const response = await this.client.post(`/actuarial/price/deal/${dealId}`, policyTerms);
    return response.data;
  }

  async optimizeStructure(submission: any, scenarios: any[]): Promise<any> {
    const response = await this.client.post('/actuarial/structure-optimizer', {
      submission: submission,
      policy_terms: { attachment_point: 0, coinsurance: 1.0 },
      scenarios: scenarios
    });
    return response.data;
  }

  async getCohortAnalysis(filters?: any): Promise<any> {
    const response = await this.client.get('/actuarial/cohort-analysis', { params: filters });
    return response.data;
  }

  async runStressTest(submission: any, policyTerms: any, scenarios: any[]): Promise<any> {
    const response = await this.client.post('/actuarial/stress-test', {
      submission,
      policy_terms: policyTerms,
      stress_scenarios: scenarios
    });
    return response.data;
  }

  async getPortfolioMetrics(): Promise<any> {
    const response = await this.client.get('/actuarial/portfolio-metrics');
    return response.data;
  }

  async getModelGovernance(): Promise<any> {
    const response = await this.client.get('/actuarial/model-governance');
    return response.data;
  }
}

export const api = new ApiClient();
