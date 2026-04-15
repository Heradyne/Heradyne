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

  async makeMatchDecision(matchId: number, decision: { status: string; notes?: string }): Promise<DealMatch> {
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
    const response = await this.client.get('/ai-agent/dashboard');
    return response.data;
  }

  async getAIAgentDeals(): Promise<any[]> {
    const response = await this.client.get('/ai-agent/deals');
    return response.data;
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

  async getExecutedLoans(): Promise<ExecutedLoan[]> {
    const response = await this.client.get('/origination/executed-loans');
    return response.data;
  }

  async getLoanPayments(loanId: number): Promise<LoanPayment[]> {
    const response = await this.client.get(`/origination/loans/${loanId}/payments`);
    return response.data;
  }
}

export const api = new ApiClient();
