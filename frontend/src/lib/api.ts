import axios, { AxiosInstance } from 'axios';
import { User, Deal, DealRiskReport, LenderPolicy, InsurerPolicy, DealMatch, SystemAssumption, MonthlyCashflow, FeeLedgerEntry, AuditLog, UserWithOverrides, ExecutedLoan, LenderDashboardStats, InsurerDashboardStats, AdminDashboardStats, LoanPayment } from '@/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface LoginResponse {
  token_type: string;
  must_change_password: boolean;
  mfa_required: boolean;
  mfa_token?: string;
  access_token?: string;
}

class ApiClient {
  private client: AxiosInstance;
  private token: string | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: `${API_URL}/api/v1`,
      headers: { 'Content-Type': 'application/json' },
      withCredentials: true,
      timeout: 120000, // 120s — AI endpoints can take 30-60s
    });

    this.client.interceptors.request.use((config) => {
      if (this.token) {
        config.headers.Authorization = `Bearer ${this.token}`;
      }
      return config;
    });

    // Auto-refresh: on 401, try the refresh endpoint once, then retry
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;
        if (
          error.response?.status === 401 &&
          !originalRequest._retry &&
          !originalRequest.url?.includes('/auth/login') &&
          !originalRequest.url?.includes('/auth/refresh')
        ) {
          originalRequest._retry = true;
          try {
            await this.client.post('/auth/refresh');
            return this.client(originalRequest);
          } catch {
            this.setToken(null);
            if (typeof window !== 'undefined') {
              window.location.href = '/login?reason=session_expired';
            }
          }
        }
        return Promise.reject(error);
      }
    );

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
    if (typeof window !== 'undefined') {
      return this.token || localStorage.getItem('token') || 'cookie-auth';
    }
    return this.token;
  }

  // ── Auth ────────────────────────────────────────────────────────────────────
  async login(email: string, password: string): Promise<LoginResponse> {
    const response = await this.client.post<LoginResponse>('/auth/login', { email, password });
    if (response.data.access_token) {
      this.setToken(response.data.access_token);
    }
    return response.data;
  }

  async verifyMFA(mfa_token: string, code: string): Promise<LoginResponse> {
    const response = await this.client.post<LoginResponse>('/auth/mfa/verify', { mfa_token, code });
    if (response.data.access_token) {
      this.setToken(response.data.access_token);
    }
    return response.data;
  }

  async getMFAEnrollment(): Promise<{ secret: string; qr_code: string; uri: string }> {
    const response = await this.client.post('/auth/mfa/enroll');
    return response.data;
  }

  async confirmMFAEnrollment(code: string): Promise<void> {
    await this.client.post('/auth/mfa/confirm', { code });
  }

  async disableMFA(): Promise<void> {
    await this.client.delete('/auth/mfa/disable');
  }

  async register(data: { email: string; password: string; full_name: string; company_name?: string; role: string }): Promise<User> {
    const response = await this.client.post<User>('/auth/register', data);
    return response.data;
  }

  async logout() {
    try {
      await this.client.post('/auth/logout');
    } catch {}
    this.setToken(null);
  }

  async getCurrentUser(): Promise<User> {
    const response = await this.client.get<User>('/auth/me');
    return response.data;
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await this.client.post('/auth/change-password', {
      current_password: currentPassword,
      new_password: newPassword,
    });
  }

  // ── Deals ───────────────────────────────────────────────────────────────────
  async getDeals(params?: { status?: string; skip?: number; limit?: number }): Promise<Deal[]> {
    const response = await this.client.get<Deal[]>('/deals/', { params });
    return response.data;
  }

  async getDeal(id: number): Promise<Deal> {
    const response = await this.client.get<Deal>(`/deals/${id}`);
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

  async submitDeal(id: number): Promise<Deal> {
    const response = await this.client.post<Deal>(`/deals/${id}/submit`);
    return response.data;
  }

  async analyzeDeal(id: number): Promise<any> {
    const response = await this.client.post(`/deals/${id}/analyze`);
    return response.data;
  }

  async deleteDeal(id: number): Promise<void> {
    await this.client.delete(`/deals/${id}`);
  }

  async getDealRiskReport(dealId: number): Promise<DealRiskReport> {
    const response = await this.client.get<DealRiskReport>(`/deals/${dealId}/risk-reports/latest`);
    return response.data;
  }

  async getLatestRiskReport(dealId: number): Promise<DealRiskReport> {
    const response = await this.client.get<DealRiskReport>(`/deals/${dealId}/risk-reports/latest`);
    return response.data;
  }

  async getVerificationStatus(dealId: number): Promise<any> {
    const response = await this.client.get(`/verification/status/${dealId}`);
    return response.data;
  }

  async uploadDocument(dealId: number, file: File, documentType: string): Promise<any> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('document_type', documentType);
    const response = await this.client.post(`/deals/${dealId}/documents`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  }

  async getDocuments(dealId: number): Promise<any[]> {
    const response = await this.client.get(`/deals/${dealId}/documents`);
    return response.data;
  }

  // ── Policies ─────────────────────────────────────────────────────────────────
  async getLenderPolicies(): Promise<LenderPolicy[]> {
    const response = await this.client.get<LenderPolicy[]>('/policies/lender');
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

  async deleteInsurerPolicy(id: number): Promise<void> {
    await this.client.delete(`/policies/insurer/${id}`);
  }

  // ── Matching ─────────────────────────────────────────────────────────────────
  async runMatching(dealId: number): Promise<any> {
    const response = await this.client.post(`/matching/deals/${dealId}/run`);
    return response.data;
  }

  async getDealMatches(dealId: number): Promise<DealMatch[]> {
    const response = await this.client.get<DealMatch[]>(`/matching/deals/${dealId}/matches`);
    return response.data;
  }

  async getMyMatches(): Promise<DealMatch[]> {
    const response = await this.client.get<DealMatch[]>('/matching/my-matches');
    return response.data;
  }

  async makeMatchDecision(matchId: number, statusOrDecision: string | { status: string; notes?: string }, notes?: string): Promise<DealMatch> {
    const decision = typeof statusOrDecision === 'string'
      ? { status: statusOrDecision, decision_notes: notes }
      : statusOrDecision;
    const response = await this.client.put<DealMatch>(`/matching/matches/${matchId}/decision`, decision);
    return response.data;
  }

  // ── Users (admin) ─────────────────────────────────────────────────────────────
  async getUsers(): Promise<User[]> {
    const response = await this.client.get<User[]>('/users/');
    return response.data;
  }

  async createUser(data: Partial<User> & { password: string }): Promise<User> {
    const response = await this.client.post<User>('/users/', data);
    return response.data;
  }

  async updateUser(id: number, data: Partial<User>): Promise<User> {
    const response = await this.client.put<User>(`/users/${id}`, data);
    return response.data;
  }

  async deleteUser(id: number): Promise<void> {
    await this.client.delete(`/users/${id}`);
  }

  // ── Assumptions ──────────────────────────────────────────────────────────────
  async getAssumptions(): Promise<SystemAssumption[]> {
    const response = await this.client.get<SystemAssumption[]>('/assumptions/');
    return response.data;
  }

  async updateAssumption(id: number, data: Partial<SystemAssumption>): Promise<SystemAssumption> {
    const response = await this.client.put<SystemAssumption>(`/assumptions/${id}`, data);
    return response.data;
  }

  // ── Audit logs ────────────────────────────────────────────────────────────────
  async getAuditLogs(params?: { entity_type?: string; entity_id?: number; action?: string; skip?: number; limit?: number }): Promise<{ items: AuditLog[]; total: number }> {
    const response = await this.client.get('/audit/', { params });
    return response.data;
  }

  // ── Collateral ────────────────────────────────────────────────────────────────
  async getAssetCategories(): Promise<any[]> {
    const response = await this.client.get('/collateral/categories');
    return response.data;
  }

  async getMyAssets(): Promise<any[]> {
    const response = await this.client.get('/collateral/my-assets');
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

  async updateAsset(id: number, data: any): Promise<any> {
    const response = await this.client.put(`/collateral/${id}`, data);
    return response.data;
  }

  async deleteAsset(id: number): Promise<void> {
    await this.client.delete(`/collateral/${id}`);
  }

  async applyCollateralToDeal(dealId: number, assetIds: number[]): Promise<any> {
    const response = await this.client.post(`/collateral/apply-to-deal/${dealId}`, { asset_ids: assetIds });
    return response.data;
  }

  // ── AI Agent ──────────────────────────────────────────────────────────────────
  async getAIAgentDashboard(): Promise<any> {
    const response = await this.client.get('/ai-agent/dashboard/alerts');
    return response.data;
  }

  async getAIAgentTiers(): Promise<any> {
    const response = await this.client.get('/ai-agent/tiers');
    return response.data;
  }

  async getAIAgentVariables(): Promise<any> {
    const response = await this.client.get('/ai-agent/variables');
    return response.data;
  }

  async scoreDealWithAIAgent(dealId: number): Promise<any> {
    const response = await this.client.post(`/ai-agent/score/deal/${dealId}`);
    return response.data;
  }

  async scoreWithAIAgent(data: any): Promise<any> {
    // Strip to only fields DealScoringRequest accepts and ensure required fields have values
    const payload = {
      loan_amount: Number(data.loan_amount) || 1500000,
      loan_purpose: data.loan_purpose || 'acquisition',
      naics_industry: String(data.naics_industry || '621'),
      business_age: Math.round(Number(data.business_age) || 5),
      loan_term: Math.round(Number(data.loan_term) || 120),
      equity_injection: Number(data.equity_injection) || 10,
      dscr: Number(data.dscr) || 1.25,
      borrower_credit_score: Math.round(Number(data.borrower_credit_score) || 700),
    };
    const response = await this.client.post('/ai-agent/score', payload);
    const d = response.data;
    // Normalize category_scores: endpoint returns {percentage, raw_score...} but page expects {score, rationale}
    if (d.category_scores) {
      const normalized: Record<string, any> = {};
      for (const [cat, val] of Object.entries(d.category_scores as Record<string, any>)) {
        normalized[cat] = {
          score: val.percentage ?? 0,
          weight: val.weight,
          rationale: val.flags?.join('; ') || '',
        };
      }
      d.category_scores = normalized;
    }
    // Normalize risk_flags to expected shape
    if (Array.isArray(d.risk_flags)) {
      d.risk_flags = d.risk_flags.map((f: any) =>
        typeof f === 'string' ? { flag: f } : f
      );
    }
    // Normalize positive_factors
    if (Array.isArray(d.positive_factors)) {
      d.positive_factors = d.positive_factors.map((f: any) =>
        typeof f === 'string' ? { factor: f } : f
      );
    }
    // Ensure conditions is array of strings
    if (Array.isArray(d.conditions)) {
      d.conditions = d.conditions.map((c: any) =>
        typeof c === 'string' ? c : JSON.stringify(c)
      );
    }
    return d;
  }

  async getAIAgentDeals(): Promise<any[]> {
    const response = await this.client.get('/ai-agent/deals');
    return response.data;
  }

  async downloadDocument(dealId: number, documentId: number, filename: string): Promise<void> {
    const response = await this.client.get(`/deals/${dealId}/documents/${documentId}/download`, { responseType: 'blob' });
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  }

  async analyzeWithAI(dealId: number, analysisType?: string): Promise<any> {
    const response = await this.client.post(`/ai-agent/analyze/${dealId}`, { analysis_type: analysisType });
    return response.data;
  }

  async chatWithAI(message: string, dealId?: number, conversationHistory?: any[]): Promise<any> {
    const response = await this.client.post('/chat/message', {
      message,
      deal_id: dealId,
      conversation_history: conversationHistory || [],
    });
    return response.data;
  }

  async getAIAlerts(): Promise<any[]> {
    const response = await this.client.get('/ai-agent/alerts');
    return response.data;
  }

  async getPortfolioInsights(): Promise<any> {
    const response = await this.client.get('/ai-agent/portfolio-insights');
    return response.data;
  }

  // ── Dashboard stats ───────────────────────────────────────────────────────────
  async getLenderDashboardStats(): Promise<LenderDashboardStats> {
    const response = await this.client.get('/financial/lender-dashboard');
    return response.data;
  }

  async getInsurerDashboardStats(): Promise<InsurerDashboardStats> {
    const response = await this.client.get('/financial/insurer-dashboard');
    return response.data;
  }

  async getAdminDashboardStats(): Promise<AdminDashboardStats> {
    const response = await this.client.get('/financial/admin-dashboard');
    return response.data;
  }

  // ── Financial ─────────────────────────────────────────────────────────────────
  async getFeeLedger(): Promise<FeeLedgerEntry[]> {
    const response = await this.client.get('/financial/fee-ledger');
    return response.data;
  }

  async getMonthlyCashflow(): Promise<MonthlyCashflow[]> {
    const response = await this.client.get('/cashflow/monthly');
    return response.data;
  }

  async getExecutedLoans(params?: { lender_id?: number; insurer_id?: number }): Promise<ExecutedLoan[]> {
    const query = params ? '?' + Object.entries(params).filter(([,v]) => v != null).map(([k,v]) => `${k}=${v}`).join('&') : '';
    const response = await this.client.get(`/financial/loans${query}`);
    return response.data;
  }

  async getLoanPayments(loanId: number): Promise<LoanPayment[]> {
    const response = await this.client.get(`/origination/loans/${loanId}/payments`);
    return response.data;
  }

  // ── SBA Compliance ────────────────────────────────────────────────────────
  async getSBARequirements(): Promise<any> {
    const response = await this.client.get('/sba-compliance/requirements');
    return response.data;
  }

  async checkSBACompliance(dealId: number): Promise<any> {
    const response = await this.client.get(`/sba-compliance/check/${dealId}`);
    return response.data;
  }

  async getLenderChecklist(dealId: number): Promise<any> {
    const response = await this.client.get(`/sba-compliance/lender-checklist/${dealId}`);
    return response.data;
  }

  // ── Verification ──────────────────────────────────────────────────────────
  async getDealVerificationStatus(dealId: number): Promise<any> {
    const response = await this.client.get(`/verification/status/${dealId}`);
    return response.data;
  }

  async createVerificationFlag(data: any): Promise<any> {
    const response = await this.client.post('/verification/flags', data);
    return response.data;
  }

  async markDealVerified(dealId: number): Promise<any> {
    const response = await this.client.post('/verification/mark-verified', { deal_id: dealId });
    return response.data;
  }

  async makeDecision(matchId: number, status: string, notes?: string): Promise<any> {
    const response = await this.client.put(`/matching/matches/${matchId}/decision`, { status, decision_notes: notes });
    return response.data;
  }

  // ── Signature Documents ───────────────────────────────────────────────────
  async getPendingSignatures(): Promise<any[]> {
    const response = await this.client.get('/signature-documents/pending');
    return response.data;
  }

  async getMyUploadedDocuments(): Promise<any[]> {
    const response = await this.client.get('/signature-documents/my-uploads');
    return response.data;
  }

  async uploadSignatureDocument(formData: FormData): Promise<any> {
    const response = await this.client.post('/signature-documents/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  }

  async signDocument(documentId: number, data?: any): Promise<any> {
    const response = await this.client.post(`/signature-documents/${documentId}/sign`, data || {});
    return response.data;
  }

  async rejectDocument(documentId: number, reason?: string): Promise<any> {
    const response = await this.client.post(`/signature-documents/${documentId}/reject`, { reason });
    return response.data;
  }

  async withdrawDocument(documentId: number): Promise<any> {
    const response = await this.client.delete(`/signature-documents/${documentId}`);
    return response.data;
  }

  async downloadSignatureDocument(documentId: number, filename: string): Promise<void> {
    const response = await this.client.get(`/signature-documents/${documentId}/download`, { responseType: 'blob' });
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  }

  // ── Secondary Market ──────────────────────────────────────────────────────
  async getSecondaryListings(): Promise<any[]> {
    const response = await this.client.get('/secondary-market/listings');
    return response.data;
  }

  async createSecondaryListing(data: any): Promise<any> {
    const response = await this.client.post('/secondary-market/listings', data);
    return response.data;
  }

  async cancelSecondaryListing(listingId: number): Promise<any> {
    const response = await this.client.delete(`/secondary-market/listings/${listingId}`);
    return response.data;
  }

  async getListingOffers(listingId: number): Promise<any[]> {
    const response = await this.client.get(`/secondary-market/listings/${listingId}/offers`);
    return response.data;
  }

  async createOffer(listingId: number, data: any): Promise<any> {
    const response = await this.client.post(`/secondary-market/listings/${listingId}/offers`, data);
    return response.data;
  }

  async respondToOffer(offerId: number, data: any): Promise<any> {
    const response = await this.client.post(`/secondary-market/offers/${offerId}/respond`, data);
    return response.data;
  }

  async withdrawOffer(offerId: number): Promise<any> {
    const response = await this.client.delete(`/secondary-market/offers/${offerId}`);
    return response.data;
  }

  async getMyOffers(): Promise<any[]> {
    const response = await this.client.get('/secondary-market/my/offers');
    return response.data;
  }

  async getSecondaryMarketStats(): Promise<any> {
    const response = await this.client.get('/secondary-market/stats');
    return response.data;
  }

  async getReinsurancePools(): Promise<any[]> {
    const response = await this.client.get('/reinsurance/pools');
    return response.data;
  }

  async createReinsurancePool(data: any): Promise<any> {
    const response = await this.client.post('/reinsurance/pools', data);
    return response.data;
  }

  async offerReinsurancePool(poolId: number, data: any): Promise<any> {
    const response = await this.client.post(`/reinsurance/pools/${poolId}/offer`, data);
    return response.data;
  }

  async getInsurerDeals(): Promise<any[]> {
    const response = await this.client.get('/reinsurance/insured-deals');
    return response.data;
  }

  // ── Financials / Dashboard ────────────────────────────────────────────────
  async getLenderDashboard(lenderId?: number): Promise<any> {
    const params = lenderId ? `?lender_id=${lenderId}` : '';
    const response = await this.client.get(`/financial/dashboard/lender${params}`);
    return response.data;
  }

  async getInsurerDashboard(insurerId?: number): Promise<any> {
    const params = insurerId ? `?insurer_id=${insurerId}` : '';
    const response = await this.client.get(`/financial/dashboard/insurer${params}`);
    return response.data;
  }

  async getAdminDashboard(): Promise<any> {
    const response = await this.client.get('/financial/dashboard/admin');
    return response.data;
  }

  async getAllUsers(): Promise<any[]> {
    const response = await this.client.get('/users/');
    return response.data;
  }

  async getLenderOrganizations(): Promise<any[]> {
    const response = await this.client.get('/users/lender-organizations');
    return response.data;
  }

  async activateUser(userId: number): Promise<any> {
    const response = await this.client.put(`/users/${userId}/activate`);
    return response.data;
  }

  async deactivateUser(userId: number): Promise<any> {
    const response = await this.client.put(`/users/${userId}/deactivate`);
    return response.data;
  }

  async adminCreateUser(data: any): Promise<any> {
    const response = await this.client.post('/users/', data);
    return response.data;
  }

  async adminResetPassword(userId: number, newPassword: string): Promise<any> {
    const response = await this.client.put(`/users/${userId}/reset-password`, { new_password: newPassword });
    return response.data;
  }

  // ── Assumptions / Origination Settings ───────────────────────────────────
  async getEffectiveAssumptions(): Promise<any[]> {
    const response = await this.client.get('/assumptions/effective');
    return response.data;
  }

  async getUsersWithOverrides(): Promise<any[]> {
    const response = await this.client.get('/assumptions/users');
    return response.data;
  }

  async createUserOverride(userId: number, data: any): Promise<any> {
    const response = await this.client.post(`/assumptions/users/${userId}/override`, data);
    return response.data;
  }

  async deleteUserOverrides(userId: number): Promise<any> {
    const response = await this.client.delete(`/assumptions/users/${userId}/overrides`);
    return response.data;
  }

  async copyDefaultsToUser(userId: number): Promise<any> {
    const response = await this.client.post(`/assumptions/users/${userId}/copy-defaults`);
    return response.data;
  }

  async getOriginationSettings(): Promise<any> {
    const response = await this.client.get('/origination/settings');
    return response.data;
  }

  async updateOriginationSettings(data: any): Promise<any> {
    const response = await this.client.put('/origination/settings', data);
    return response.data;
  }

  // ── Collateral ────────────────────────────────────────────────────────────
  async revalueAsset(assetId: number, data: any): Promise<any> {
    const response = await this.client.post(`/collateral/assets/${assetId}/revalue`, data);
    return response.data;
  }


  // ── AI Features ───────────────────────────────────────────────────────────
  async generateBankerMemo(dealId: number): Promise<any> {
    const response = await this.client.post(`/ai-features/deals/${dealId}/banker-memo`, {}, { timeout: 120000 });
    return response.data;
  }

  async askSBAQuestion(question: string, dealId?: number): Promise<any> {
    const response = await this.client.post('/ai-features/sba-qa', { question, deal_id: dealId });
    return response.data;
  }

  async getBorrowerRecommendations(dealId: number): Promise<any> {
    const response = await this.client.post(`/ai-features/deals/${dealId}/recommendations`);
    return response.data;
  }

  async checkCovenants(dealId: number, financialData: any, covenants?: any[]): Promise<any> {
    const response = await this.client.post(`/ai-features/deals/${dealId}/covenant-check`, {
      financial_data: financialData,
      covenants,
    });
    return response.data;
  }

  async normalizeDocument(documentText: string, documentType: string, businessName: string, dealId?: number): Promise<any> {
    const response = await this.client.post('/ai-features/normalize-document', {
      document_text: documentText,
      document_type: documentType,
      business_name: businessName,
      deal_id: dealId,
    });
    return response.data;
  }

  async getPortfolioInsights(): Promise<any> {
    const response = await this.client.post('/ai-features/portfolio-insights');
    return response.data;
  }


  async draftSBAForm(dealId: number, formType: string, lenderData?: any): Promise<any> {
    const response = await this.client.post(`/ai-features/deals/${dealId}/draft-sba-form`, {
      form_type: formType,
      lender_data: lenderData,
    }, { timeout: 120000 });
    return response.data;
  }

  async listSBAForms(): Promise<any> {
    const response = await this.client.get('/ai-features/sba-forms');
    return response.data;
  }

}

export const api = new ApiClient();