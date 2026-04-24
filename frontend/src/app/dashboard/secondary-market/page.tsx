'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { 
  DollarSign, TrendingUp, Package, Shield, Plus, Eye, 
  Send, Check, X, Clock, RefreshCw, Filter, Users, MapPin,
  Building2, BarChart3, PieChart, ChevronDown, ChevronUp
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { SecondaryListing, SecondaryOffer, ExecutedLoan, SecondaryMarketStats } from '@/types';
import { formatCurrency, formatPercent, formatDate } from '@/lib/utils';

interface InsuredDeal {
  id: number;
  deal_id: number;
  deal_name: string;
  borrower_name: string;
  industry: string;
  state: string;
  loan_amount: number;
  guarantee_percentage: number;
  guaranteed_amount: number;
  premium_rate: number;
  annual_premium: number;
  probability_of_default: number;
  expected_loss: number;
  status: string;
  origination_date: string;
}

interface ReinsurancePool {
  id: number;
  name: string;
  description: string;
  status: string;
  deal_ids: number[];
  total_exposure: number;
  total_premium: number;
  weighted_pd: number;
  expected_loss: number;
  industry_distribution: Record<string, number>;
  geographic_distribution: Record<string, number>;
  cession_percentage: number;
  asking_price: number;
  created_at: string;
}

interface PoolAnalytics {
  total_exposure: number;
  total_premium: number;
  weighted_pd: number;
  expected_loss: number;
  loss_ratio: number;
  diversification_score: number;
  industries: { name: string; exposure: number; percentage: number }[];
  states: { name: string; exposure: number; percentage: number }[];
  deal_count: number;
  avg_deal_size: number;
  avg_guarantee_pct: number;
}

export default function SecondaryMarketPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // Data
  const [listings, setListings] = useState<SecondaryListing[]>([]);
  const [myListings, setMyListings] = useState<SecondaryListing[]>([]);
  const [myOffers, setMyOffers] = useState<SecondaryOffer[]>([]);
  const [myLoans, setMyLoans] = useState<ExecutedLoan[]>([]);
  const [stats, setStats] = useState<SecondaryMarketStats | null>(null);
  
  // Reinsurance data (insurer only)
  const [insuredDeals, setInsuredDeals] = useState<InsuredDeal[]>([]);
  const [reinsurancePools, setReinsurancePools] = useState<ReinsurancePool[]>([]);
  const [selectedDeals, setSelectedDeals] = useState<Set<number>>(new Set());
  
  // UI State
  const [activeTab, setActiveTab] = useState<'browse' | 'my-listings' | 'my-offers' | 'reinsurance'>('browse');
  const [listingTypeFilter, setListingTypeFilter] = useState<string>('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showOfferModal, setShowOfferModal] = useState(false);
  const [showOffersModal, setShowOffersModal] = useState(false);
  const [selectedListing, setSelectedListing] = useState<SecondaryListing | null>(null);
  const [listingOffers, setListingOffers] = useState<SecondaryOffer[]>([]);
  
  // Reinsurance modals
  const [showCreatePoolModal, setShowCreatePoolModal] = useState(false);
  const [showPoolDetailModal, setShowPoolDetailModal] = useState<ReinsurancePool | null>(null);
  const [showOfferPoolModal, setShowOfferPoolModal] = useState<ReinsurancePool | null>(null);
  
  // Form state
  const [newListing, setNewListing] = useState({
    listing_type: '',
    loan_id: 0,
    title: '',
    description: '',
    participation_percentage: 100,
    asking_price: 0,
    implied_yield: 0,
  });
  const [offerPrice, setOfferPrice] = useState(0);
  const [offerMessage, setOfferMessage] = useState('');
  
  // Reinsurance form state
  const [newPool, setNewPool] = useState({
    name: '',
    description: '',
    cession_percentage: 50,
  });
  const [poolOfferForm, setPoolOfferForm] = useState({
    asking_price: 0,
    cession_percentage: 50,
    notes: '',
  });

  useEffect(() => {
    loadData();
  }, [user]);

  useEffect(() => {
    loadListings();
  }, [listingTypeFilter]);

  const loadData = async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      setError('');
      
      const [listingsData, statsData] = await Promise.all([
        api.getSecondaryListings({ listing_type: listingTypeFilter || undefined }),
        api.getSecondaryMarketStats()
      ]);
      
      setListings(listingsData);
      setStats(statsData);
      
      // Load my listings
      const myListingsData = await api.getSecondaryListings({ my_listings: true });
      setMyListings(myListingsData);
      
      // Load my offers
      const myOffersData = await api.getMyOffers();
      setMyOffers(myOffersData);
      
      // Load my loans for creating listings
      if (user.role === 'lender' || user.role === 'insurer') {
        const loansData = await api.getExecutedLoans();
        setMyLoans(loansData);
      }
      
      // Load reinsurance data for insurers
      if (user.role === 'insurer') {
        try {
          const [dealsData, poolsData] = await Promise.all([
            api.getInsurerDeals(),
            api.getReinsurancePools(),
          ]);
          setInsuredDeals(dealsData);
          setReinsurancePools(poolsData);
        } catch (err) {
          console.error('Failed to load reinsurance data:', err);
        }
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const loadListings = async () => {
    try {
      const listingsData = await api.getSecondaryListings({ 
        listing_type: listingTypeFilter || undefined 
      });
      setListings(listingsData);
    } catch (err: any) {
      console.error('Failed to load listings:', err);
    }
  };

  const handleCreateListing = async () => {
    try {
      const selectedLoan = myLoans.find(l => l.id === newListing.loan_id);
      if (!selectedLoan) {
        alert('Please select a loan');
        return;
      }
      
      const listingData = {
        listing_type: user?.role === 'lender' ? 'loan_participation' : 'risk_transfer',
        loan_id: newListing.loan_id,
        title: newListing.title || `${selectedLoan.loan_number} - ${newListing.participation_percentage}% Participation`,
        description: newListing.description,
        participation_percentage: newListing.participation_percentage / 100,
        principal_amount: selectedLoan.current_principal_balance * (newListing.participation_percentage / 100),
        risk_percentage: user?.role === 'insurer' ? newListing.participation_percentage / 100 : undefined,
        premium_share: user?.role === 'insurer' ? newListing.participation_percentage / 100 : undefined,
        asking_price: newListing.asking_price,
        implied_yield: newListing.implied_yield / 100,
      };
      
      await api.createSecondaryListing(listingData);
      setShowCreateModal(false);
      setNewListing({
        listing_type: '',
        loan_id: 0,
        title: '',
        description: '',
        participation_percentage: 100,
        asking_price: 0,
        implied_yield: 0,
      });
      loadData();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to create listing');
    }
  };

  const handleMakeOffer = async () => {
    if (!selectedListing) {
      console.error('No listing selected');
      return;
    }
    
    if (!offerPrice || offerPrice <= 0) {
      alert('Please enter a valid offer price');
      return;
    }
    
    try {
      console.log('Making offer:', { listingId: selectedListing.id, offerPrice, offerMessage });
      await api.createOffer(selectedListing.id, {
        offer_price: offerPrice,
        message: offerMessage || undefined,
      });
      setShowOfferModal(false);
      setOfferPrice(0);
      setOfferMessage('');
      loadData();
      alert('Offer submitted successfully!');
    } catch (err: any) {
      console.error('Offer error:', err);
      const errorMsg = err.response?.data?.detail || err.message || 'Failed to submit offer';
      alert(errorMsg);
    }
  };

  const handleViewOffers = async (listing: SecondaryListing) => {
    try {
      const offers = await api.getListingOffers(listing.id);
      setListingOffers(offers);
      setSelectedListing(listing);
      setShowOffersModal(true);
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to load offers');
    }
  };

  const handleRespondToOffer = async (offerId: number, action: 'accept' | 'reject') => {
    try {
      await api.respondToOffer(offerId, action);
      loadData();
      setShowOffersModal(false);
      alert(action === 'accept' ? 'Offer accepted! Sale completed.' : 'Offer rejected.');
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to respond to offer');
    }
  };

  const handleCancelListing = async (listingId: number) => {
    if (!confirm('Are you sure you want to cancel this listing?')) return;
    
    try {
      await api.cancelSecondaryListing(listingId);
      loadData();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to cancel listing');
    }
  };

  const handleWithdrawOffer = async (offerId: number) => {
    if (!confirm('Are you sure you want to withdraw this offer?')) return;
    
    try {
      await api.withdrawOffer(offerId);
      loadData();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to withdraw offer');
    }
  };

  // Reinsurance functions
  const calculatePoolAnalytics = (dealIds: number[]): PoolAnalytics => {
    const selectedDealsList = insuredDeals.filter(d => dealIds.includes(d.id));
    
    if (selectedDealsList.length === 0) {
      return {
        total_exposure: 0,
        total_premium: 0,
        weighted_pd: 0,
        expected_loss: 0,
        loss_ratio: 0,
        diversification_score: 0,
        industries: [],
        states: [],
        deal_count: 0,
        avg_deal_size: 0,
        avg_guarantee_pct: 0,
      };
    }
    
    const total_exposure = selectedDealsList.reduce((sum, d) => sum + d.guaranteed_amount, 0);
    const total_premium = selectedDealsList.reduce((sum, d) => sum + d.annual_premium, 0);
    const weighted_pd = selectedDealsList.reduce((sum, d) => 
      sum + (d.probability_of_default * d.guaranteed_amount), 0) / total_exposure;
    const expected_loss = selectedDealsList.reduce((sum, d) => sum + d.expected_loss, 0);
    const loss_ratio = total_premium > 0 ? expected_loss / total_premium : 0;
    
    const industryMap: Record<string, number> = {};
    selectedDealsList.forEach(d => {
      industryMap[d.industry] = (industryMap[d.industry] || 0) + d.guaranteed_amount;
    });
    const industries = Object.entries(industryMap)
      .map(([name, exposure]) => ({ name, exposure, percentage: exposure / total_exposure }))
      .sort((a, b) => b.exposure - a.exposure);
    
    const stateMap: Record<string, number> = {};
    selectedDealsList.forEach(d => {
      const state = d.state || 'Unknown';
      stateMap[state] = (stateMap[state] || 0) + d.guaranteed_amount;
    });
    const states = Object.entries(stateMap)
      .map(([name, exposure]) => ({ name, exposure, percentage: exposure / total_exposure }))
      .sort((a, b) => b.exposure - a.exposure);
    
    const diversification_score = Math.min(100, (industries.length * 10) + (states.length * 5));
    
    return {
      total_exposure,
      total_premium,
      weighted_pd,
      expected_loss,
      loss_ratio,
      diversification_score,
      industries,
      states,
      deal_count: selectedDealsList.length,
      avg_deal_size: total_exposure / selectedDealsList.length,
      avg_guarantee_pct: selectedDealsList.reduce((sum, d) => sum + d.guarantee_percentage, 0) / selectedDealsList.length,
    };
  };

  const toggleDealSelection = (dealId: number) => {
    const newSelection = new Set(selectedDeals);
    if (newSelection.has(dealId)) {
      newSelection.delete(dealId);
    } else {
      newSelection.add(dealId);
    }
    setSelectedDeals(newSelection);
  };

  const selectAllDeals = () => {
    if (selectedDeals.size === insuredDeals.length) {
      setSelectedDeals(new Set());
    } else {
      setSelectedDeals(new Set(insuredDeals.map(d => d.id)));
    }
  };

  const handleCreatePool = async () => {
    if (!newPool.name || selectedDeals.size === 0) {
      setError('Please enter a pool name and select at least one deal');
      return;
    }
    
    try {
      await api.createReinsurancePool({
        name: newPool.name,
        description: newPool.description,
        deal_ids: Array.from(selectedDeals),
        cession_percentage: newPool.cession_percentage,
      });
      setSuccess('Reinsurance pool created successfully');
      setShowCreatePoolModal(false);
      setSelectedDeals(new Set());
      setNewPool({ name: '', description: '', cession_percentage: 50 });
      loadData();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to create pool');
    }
  };

  const handleOfferPool = async () => {
    if (!showOfferPoolModal) return;
    
    try {
      await api.offerReinsurancePool(showOfferPoolModal.id, {
        asking_price: poolOfferForm.asking_price,
        cession_percentage: poolOfferForm.cession_percentage,
        notes: poolOfferForm.notes,
      });
      setSuccess('Pool offered for reinsurance');
      setShowOfferPoolModal(null);
      loadData();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to offer pool');
    }
  };

  const selectedPoolAnalytics = calculatePoolAnalytics(Array.from(selectedDeals));

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      active: 'bg-green-100 text-green-800',
      pending: 'bg-yellow-100 text-yellow-800',
      sold: 'bg-blue-100 text-blue-800',
      cancelled: 'bg-gray-100 text-gray-800',
      expired: 'bg-red-100 text-red-800',
      accepted: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800',
      withdrawn: 'bg-gray-100 text-gray-800',
    };
    return styles[status] || 'bg-gray-100 text-gray-800';
  };

  const getListingTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      loan_participation: 'Loan Participation',
      whole_loan: 'Whole Loan',
      risk_transfer: 'Risk Transfer',
    };
    return labels[type] || type;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Secondary Market</h1>
          <p className="text-gray-600">
            {user?.role === 'lender' && 'Buy and sell loan participations'}
            {user?.role === 'insurer' && 'Buy and sell risk positions'}
            {user?.role === 'admin' && 'Platform-wide secondary market activity'}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={loadData} className="btn btn-secondary inline-flex items-center">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </button>
          {(user?.role === 'lender' || user?.role === 'insurer') && (
            <button 
              onClick={() => setShowCreateModal(true)} 
              className="btn btn-primary inline-flex items-center"
            >
              <Plus className="h-4 w-4 mr-2" />
              Create Listing
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

      {/* Market Stats */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="card bg-gradient-to-br from-blue-500 to-blue-600 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-blue-100 text-sm">Active Loan Listings</p>
                <p className="text-2xl font-bold">{stats.active_loan_listings}</p>
                <p className="text-xs text-blue-200">{formatCurrency(stats.total_loan_volume)} volume</p>
              </div>
              <Package className="h-10 w-10 text-blue-200" />
            </div>
          </div>
          
          <div className="card bg-gradient-to-br from-purple-500 to-purple-600 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-purple-100 text-sm">Active Risk Listings</p>
                <p className="text-2xl font-bold">{stats.active_risk_listings}</p>
                <p className="text-xs text-purple-200">{formatCurrency(stats.total_risk_volume)} volume</p>
              </div>
              <Shield className="h-10 w-10 text-purple-200" />
            </div>
          </div>
          
          <div className="card bg-gradient-to-br from-green-500 to-green-600 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-green-100 text-sm">Sales (30 Days)</p>
                <p className="text-2xl font-bold">{stats.sales_last_30_days}</p>
                <p className="text-xs text-green-200">{formatCurrency(stats.total_sales_volume_30_days)}</p>
              </div>
              <TrendingUp className="h-10 w-10 text-green-200" />
            </div>
          </div>
          
          <div className="card bg-gradient-to-br from-orange-500 to-orange-600 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-orange-100 text-sm">Avg Loan Yield</p>
                <p className="text-2xl font-bold">{(stats.avg_loan_yield || 0).toFixed(2)}%</p>
              </div>
              <DollarSign className="h-10 w-10 text-orange-200" />
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex space-x-8">
          {['browse', 'my-listings', 'my-offers', ...(user?.role === 'insurer' ? ['reinsurance'] : [])].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab === 'browse' && 'Browse Listings'}
              {tab === 'my-listings' && `My Listings (${myListings.length})`}
              {tab === 'my-offers' && `My Offers (${myOffers.length})`}
              {tab === 'reinsurance' && `Reinsurance (${reinsurancePools.length})`}
            </button>
          ))}
        </nav>
      </div>

      {/* Browse Tab */}
      {activeTab === 'browse' && (
        <div>
          {/* Filters */}
          <div className="flex gap-4 mb-4">
            <select
              value={listingTypeFilter}
              onChange={(e) => setListingTypeFilter(e.target.value)}
              className="input w-48"
            >
              {user?.role === 'lender' && (
                <>
                  <option value="">All Loan Listings</option>
                  <option value="loan_participation">Loan Participations</option>
                  <option value="whole_loan">Whole Loans</option>
                </>
              )}
              {user?.role === 'insurer' && (
                <>
                  <option value="">All Risk Listings</option>
                  <option value="risk_transfer">Risk Transfers</option>
                </>
              )}
              {user?.role === 'admin' && (
                <>
                  <option value="">All Types</option>
                  <option value="loan_participation">Loan Participations</option>
                  <option value="whole_loan">Whole Loans</option>
                  <option value="risk_transfer">Risk Transfers</option>
                </>
              )}
            </select>
          </div>

          {/* Listings Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {listings
              .filter(l => l.seller_id !== user?.id)
              .filter(l => {
                // Lenders only see loan listings, insurers only see risk listings
                if (user?.role === 'lender') {
                  return l.listing_type !== 'risk_transfer';
                } else if (user?.role === 'insurer') {
                  return l.listing_type === 'risk_transfer';
                }
                return true; // Admin sees all
              })
              .map((listing) => (
              <div key={listing.id} className="card hover:shadow-lg transition-shadow">
                <div className="flex justify-between items-start mb-3">
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    listing.listing_type === 'risk_transfer' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
                  }`}>
                    {getListingTypeLabel(listing.listing_type)}
                  </span>
                  <span className={`px-2 py-1 text-xs rounded-full ${getStatusBadge(listing.status)}`}>
                    {listing.status}
                  </span>
                </div>
                
                <h3 className="font-semibold text-lg mb-2">{listing.title}</h3>
                
                {listing.description && (
                  <p className="text-gray-600 text-sm mb-3 line-clamp-2">{listing.description}</p>
                )}
                
                <div className="space-y-2 text-sm mb-4">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Asking Price</span>
                    <span className="font-semibold text-green-600">{formatCurrency(listing.asking_price)}</span>
                  </div>
                  {listing.principal_amount && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Principal</span>
                      <span className="font-medium">{formatCurrency(listing.principal_amount)}</span>
                    </div>
                  )}
                  {listing.participation_percentage && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Participation</span>
                      <span className="font-medium">{(listing.participation_percentage * 100).toFixed(1)}%</span>
                    </div>
                  )}
                  {listing.implied_yield && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Implied Yield</span>
                      <span className="font-medium text-blue-600">{(listing.implied_yield * 100).toFixed(2)}%</span>
                    </div>
                  )}
                  {listing.remaining_term_months && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Remaining Term</span>
                      <span className="font-medium">{listing.remaining_term_months} months</span>
                    </div>
                  )}
                  {listing.interest_rate && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Interest Rate</span>
                      <span className="font-medium">{(listing.interest_rate * 100).toFixed(2)}%</span>
                    </div>
                  )}
                </div>
                
                <div className="text-xs text-gray-500 mb-3">
                  <div>Loan: {listing.loan_number}</div>
                  <div>Industry: {listing.loan_industry} | State: {listing.loan_state}</div>
                  <div>Seller: {listing.seller_name}</div>
                </div>
                
                {listing.status === 'active' && (
                  <button
                    onClick={() => {
                      setSelectedListing(listing);
                      setOfferPrice(listing.asking_price);
                      setShowOfferModal(true);
                    }}
                    className="btn btn-primary w-full"
                  >
                    <Send className="h-4 w-4 mr-2" />
                    Make Offer
                  </button>
                )}
              </div>
            ))}
            
            {listings
              .filter(l => l.seller_id !== user?.id)
              .filter(l => {
                if (user?.role === 'lender') return l.listing_type !== 'risk_transfer';
                if (user?.role === 'insurer') return l.listing_type === 'risk_transfer';
                return true;
              }).length === 0 && (
              <div className="col-span-3 text-center py-12 text-gray-500">
                {user?.role === 'lender' && 'No loan participations or whole loans available.'}
                {user?.role === 'insurer' && 'No risk transfer listings available.'}
                {user?.role === 'admin' && 'No listings available.'}
                {' '}Check back later or adjust your filters.
              </div>
            )}
          </div>
        </div>
      )}

      {/* My Listings Tab */}
      {activeTab === 'my-listings' && (
        <div>
          {myListings.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Package className="h-12 w-12 mx-auto mb-4 text-gray-400" />
              <p>You haven't created any listings yet.</p>
              <button 
                onClick={() => setShowCreateModal(true)}
                className="btn btn-primary mt-4"
              >
                Create Your First Listing
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left py-3 px-4">Title</th>
                    <th className="text-left py-3 px-4">Type</th>
                    <th className="text-right py-3 px-4">Asking Price</th>
                    <th className="text-right py-3 px-4">Offers</th>
                    <th className="text-center py-3 px-4">Status</th>
                    <th className="text-left py-3 px-4">Listed</th>
                    <th className="text-center py-3 px-4">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {myListings.map((listing) => (
                    <tr key={listing.id} className="border-b hover:bg-gray-50">
                      <td className="py-3 px-4">
                        <div className="font-medium">{listing.title}</div>
                        <div className="text-xs text-gray-500">{listing.loan_number}</div>
                      </td>
                      <td className="py-3 px-4">{getListingTypeLabel(listing.listing_type)}</td>
                      <td className="py-3 px-4 text-right">{formatCurrency(listing.asking_price)}</td>
                      <td className="py-3 px-4 text-right">
                        {listing.offer_count > 0 ? (
                          <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs">
                            {listing.offer_count} pending
                          </span>
                        ) : (
                          <span className="text-gray-400">0</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`px-2 py-1 text-xs rounded-full ${getStatusBadge(listing.status)}`}>
                          {listing.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-gray-500 text-sm">{formatDate(listing.listed_date)}</td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex gap-2 justify-center">
                          {listing.offer_count > 0 && (
                            <button
                              onClick={() => handleViewOffers(listing)}
                              className="text-blue-600 hover:text-blue-800"
                              title="View Offers"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                          )}
                          {listing.status === 'active' && (
                            <button
                              onClick={() => handleCancelListing(listing.id)}
                              className="text-red-600 hover:text-red-800"
                              title="Cancel Listing"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* My Offers Tab */}
      {activeTab === 'my-offers' && (
        <div>
          {myOffers.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Send className="h-12 w-12 mx-auto mb-4 text-gray-400" />
              <p>You haven't made any offers yet.</p>
              <button 
                onClick={() => setActiveTab('browse')}
                className="btn btn-primary mt-4"
              >
                Browse Listings
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left py-3 px-4">Listing</th>
                    <th className="text-right py-3 px-4">Your Offer</th>
                    <th className="text-center py-3 px-4">Status</th>
                    <th className="text-left py-3 px-4">Date</th>
                    <th className="text-left py-3 px-4">Response</th>
                    <th className="text-center py-3 px-4">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {myOffers.map((offer) => (
                    <tr key={offer.id} className="border-b hover:bg-gray-50">
                      <td className="py-3 px-4 font-medium">{offer.listing_title}</td>
                      <td className="py-3 px-4 text-right">{formatCurrency(offer.offer_price)}</td>
                      <td className="py-3 px-4 text-center">
                        <span className={`px-2 py-1 text-xs rounded-full ${getStatusBadge(offer.status)}`}>
                          {offer.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-gray-500 text-sm">{formatDate(offer.offer_date)}</td>
                      <td className="py-3 px-4 text-sm">
                        {offer.seller_message || (offer.status === 'pending' ? 'Awaiting response...' : '-')}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {offer.status === 'pending' && (
                          <button
                            onClick={() => handleWithdrawOffer(offer.id)}
                            className="text-red-600 hover:text-red-800 text-sm"
                          >
                            Withdraw
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Reinsurance Tab (Insurer Only) */}
      {activeTab === 'reinsurance' && user?.role === 'insurer' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Deal Selection */}
          <div>
            <div className="card">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold">Select Deals for Pool</h2>
                <div className="flex gap-2">
                  <button 
                    onClick={selectAllDeals}
                    className="text-sm text-primary-600 hover:text-primary-800"
                  >
                    {selectedDeals.size === insuredDeals.length ? 'Deselect All' : 'Select All'}
                  </button>
                  {selectedDeals.size > 0 && (
                    <button 
                      onClick={() => setShowCreatePoolModal(true)}
                      className="btn btn-primary btn-sm inline-flex items-center"
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Create Pool ({selectedDeals.size})
                    </button>
                  )}
                </div>
              </div>
              
              {insuredDeals.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No insured deals found.</p>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {insuredDeals.map((deal) => (
                    <div 
                      key={deal.id}
                      onClick={() => toggleDealSelection(deal.id)}
                      className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedDeals.has(deal.id) 
                          ? 'bg-purple-50 border-purple-300' 
                          : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                            selectedDeals.has(deal.id) 
                              ? 'bg-purple-600 border-purple-600' 
                              : 'border-gray-300'
                          }`}>
                            {selectedDeals.has(deal.id) && <Check className="h-3 w-3 text-white" />}
                          </div>
                          <div>
                            <p className="font-medium text-sm">{deal.deal_name}</p>
                            <p className="text-xs text-gray-500">{deal.industry} • {deal.state || 'N/A'}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-medium text-sm">{formatCurrency(deal.guaranteed_amount)}</p>
                          <p className="text-xs text-gray-500">PD: {(deal.probability_of_default * 100).toFixed(2)}%</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Selected Pool Analytics */}
            {selectedDeals.size > 0 && (
              <div className="card mt-4">
                <h3 className="font-semibold mb-4 flex items-center">
                  <BarChart3 className="h-5 w-5 mr-2 text-purple-600" />
                  Selected Pool Analytics
                </h3>
                
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500">Total Exposure</p>
                    <p className="text-lg font-bold">{formatCurrency(selectedPoolAnalytics.total_exposure)}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500">Annual Premium</p>
                    <p className="text-lg font-bold">{formatCurrency(selectedPoolAnalytics.total_premium)}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500">Weighted PD</p>
                    <p className="text-lg font-bold">{(selectedPoolAnalytics.weighted_pd * 100).toFixed(2)}%</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500">Expected Loss</p>
                    <p className="text-lg font-bold">{formatCurrency(selectedPoolAnalytics.expected_loss)}</p>
                  </div>
                </div>

                {/* Industry Distribution */}
                <div className="mb-4">
                  <p className="text-sm font-medium text-gray-700 mb-2">Industry Distribution</p>
                  <div className="space-y-2">
                    {(selectedPoolAnalytics.industries || []).slice(0, 5).map((ind) => (
                      <div key={ind.name} className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-purple-600 h-2 rounded-full" 
                            style={{ width: `${ind.percentage * 100}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-600 w-24 truncate">{ind.name}</span>
                        <span className="text-xs font-medium w-12 text-right">{(ind.percentage * 100).toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Geographic Distribution */}
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Geographic Distribution</p>
                  <div className="space-y-2">
                    {(selectedPoolAnalytics.states || []).slice(0, 5).map((state) => (
                      <div key={state.name} className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-blue-600 h-2 rounded-full" 
                            style={{ width: `${state.percentage * 100}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-600 w-24 truncate">{state.name}</span>
                        <span className="text-xs font-medium w-12 text-right">{(state.percentage * 100).toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right: Existing Pools */}
          <div>
            <div className="card">
              <h2 className="text-lg font-semibold mb-4">Reinsurance Pools</h2>
              
              {reinsurancePools.length === 0 ? (
                <p className="text-gray-500 text-center py-8">
                  No reinsurance pools created yet. Select deals and create a pool to get started.
                </p>
              ) : (
                <div className="space-y-4">
                  {reinsurancePools.map((pool) => {
                    const poolAnalytics = calculatePoolAnalytics(pool.deal_ids);
                    return (
                      <div key={pool.id} className="border rounded-lg p-4">
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <h3 className="font-semibold">{pool.name}</h3>
                            <p className="text-sm text-gray-500">{pool.description || 'No description'}</p>
                          </div>
                          <span className={`px-2 py-1 text-xs rounded-full ${
                            pool.status === 'draft' ? 'bg-gray-100 text-gray-700' :
                            pool.status === 'active' ? 'bg-green-100 text-green-700' :
                            pool.status === 'offered' ? 'bg-blue-100 text-blue-700' :
                            pool.status === 'sold' ? 'bg-purple-100 text-purple-700' :
                            'bg-red-100 text-red-700'
                          }`}>
                            {pool.status.charAt(0).toUpperCase() + pool.status.slice(1)}
                          </span>
                        </div>
                        
                        <div className="grid grid-cols-3 gap-2 mb-3">
                          <div className="bg-gray-50 rounded p-2">
                            <p className="text-xs text-gray-500">Exposure</p>
                            <p className="font-medium text-sm">{formatCurrency(poolAnalytics.total_exposure)}</p>
                          </div>
                          <div className="bg-gray-50 rounded p-2">
                            <p className="text-xs text-gray-500">Premium</p>
                            <p className="font-medium text-sm">{formatCurrency(poolAnalytics.total_premium)}</p>
                          </div>
                          <div className="bg-gray-50 rounded p-2">
                            <p className="text-xs text-gray-500">Deals</p>
                            <p className="font-medium text-sm">{pool.deal_ids.length}</p>
                          </div>
                        </div>
                        
                        <div className="flex gap-2">
                          <button
                            onClick={() => setShowPoolDetailModal(pool)}
                            className="btn btn-secondary btn-sm flex-1 inline-flex items-center justify-center"
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            Details
                          </button>
                          {pool.status === 'draft' && (
                            <button
                              onClick={() => {
                                setPoolOfferForm({
                                  asking_price: poolAnalytics.total_premium * 3,
                                  cession_percentage: pool.cession_percentage,
                                  notes: '',
                                });
                                setShowOfferPoolModal(pool);
                              }}
                              className="btn btn-primary btn-sm flex-1 inline-flex items-center justify-center"
                            >
                              <Send className="h-4 w-4 mr-1" />
                              Offer to Market
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create Listing Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-semibold mb-4">
              Create {user?.role === 'lender' ? 'Loan Participation' : 'Risk Transfer'} Listing
            </h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Select {user?.role === 'lender' ? 'Loan' : 'Policy'} *
                </label>
                <select
                  value={newListing.loan_id}
                  onChange={(e) => setNewListing({ ...newListing, loan_id: parseInt(e.target.value) })}
                  className="input w-full"
                >
                  <option value={0}>Select...</option>
                  {myLoans.map((loan) => (
                    <option key={loan.id} value={loan.id}>
                      {loan.loan_number} - {formatCurrency(loan.current_principal_balance)} ({loan.industry})
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                <input
                  type="text"
                  value={newListing.title}
                  onChange={(e) => setNewListing({ ...newListing, title: e.target.value })}
                  className="input w-full"
                  placeholder="Optional - auto-generated if blank"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={newListing.description}
                  onChange={(e) => setNewListing({ ...newListing, description: e.target.value })}
                  className="input w-full"
                  rows={3}
                  placeholder="Describe the opportunity..."
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {user?.role === 'lender' ? 'Participation' : 'Risk'} Percentage *
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={newListing.participation_percentage}
                    onChange={(e) => setNewListing({ ...newListing, participation_percentage: parseFloat(e.target.value) })}
                    className="input w-24"
                    min="1"
                    max="100"
                  />
                  <span>%</span>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Asking Price *</label>
                <input
                  type="number"
                  value={newListing.asking_price}
                  onChange={(e) => setNewListing({ ...newListing, asking_price: parseFloat(e.target.value) })}
                  className="input w-full"
                  min="0"
                  step="1000"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Implied Yield (%)</label>
                <input
                  type="number"
                  value={newListing.implied_yield}
                  onChange={(e) => setNewListing({ ...newListing, implied_yield: parseFloat(e.target.value) })}
                  className="input w-full"
                  min="0"
                  step="0.1"
                />
              </div>
            </div>
            
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowCreateModal(false)} className="btn btn-secondary">
                Cancel
              </button>
              <button onClick={handleCreateListing} className="btn btn-primary">
                Create Listing
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Make Offer Modal */}
      {showOfferModal && selectedListing && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h2 className="text-xl font-semibold mb-4">Make an Offer</h2>
            
            <div className="bg-gray-50 p-3 rounded-lg mb-4">
              <div className="font-medium">{selectedListing.title}</div>
              <div className="text-sm text-gray-600">Asking: {formatCurrency(selectedListing.asking_price)}</div>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Your Offer *</label>
                <input
                  type="number"
                  value={offerPrice}
                  onChange={(e) => setOfferPrice(parseFloat(e.target.value))}
                  className="input w-full"
                  min="0"
                  step="1000"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Message (Optional)</label>
                <textarea
                  value={offerMessage}
                  onChange={(e) => setOfferMessage(e.target.value)}
                  className="input w-full"
                  rows={3}
                  placeholder="Add a message to the seller..."
                />
              </div>
            </div>
            
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowOfferModal(false)} className="btn btn-secondary">
                Cancel
              </button>
              <button onClick={handleMakeOffer} className="btn btn-primary">
                Submit Offer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Offers Modal */}
      {showOffersModal && selectedListing && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-semibold mb-4">Offers for: {selectedListing.title}</h2>
            
            {listingOffers.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No offers yet.</p>
            ) : (
              <div className="space-y-4">
                {listingOffers.map((offer) => (
                  <div key={offer.id} className="border rounded-lg p-4">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <div className="font-medium">{offer.buyer_name}</div>
                        <div className="text-sm text-gray-500">{formatDate(offer.offer_date)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xl font-bold text-green-600">{formatCurrency(offer.offer_price)}</div>
                        <span className={`px-2 py-1 text-xs rounded-full ${getStatusBadge(offer.status)}`}>
                          {offer.status}
                        </span>
                      </div>
                    </div>
                    
                    {offer.message && (
                      <div className="bg-gray-50 p-2 rounded text-sm mb-3">
                        "{offer.message}"
                      </div>
                    )}
                    
                    {offer.status === 'pending' && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleRespondToOffer(offer.id, 'accept')}
                          className="btn btn-primary flex-1"
                        >
                          <Check className="h-4 w-4 mr-2" />
                          Accept
                        </button>
                        <button
                          onClick={() => handleRespondToOffer(offer.id, 'reject')}
                          className="btn btn-secondary flex-1"
                        >
                          <X className="h-4 w-4 mr-2" />
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            
            <div className="flex justify-end mt-6">
              <button onClick={() => setShowOffersModal(false)} className="btn btn-secondary">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Reinsurance Pool Modal */}
      {showCreatePoolModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-lg w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Create Reinsurance Pool</h2>
              <button onClick={() => setShowCreatePoolModal(false)}>
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Pool Name *</label>
                <input
                  type="text"
                  value={newPool.name}
                  onChange={(e) => setNewPool({ ...newPool, name: e.target.value })}
                  className="input w-full"
                  placeholder="e.g., Q1 2024 Manufacturing Pool"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={newPool.description}
                  onChange={(e) => setNewPool({ ...newPool, description: e.target.value })}
                  className="input w-full"
                  rows={3}
                  placeholder="Describe the pool characteristics..."
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cession Percentage</label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="10"
                    max="100"
                    value={newPool.cession_percentage}
                    onChange={(e) => setNewPool({ ...newPool, cession_percentage: parseInt(e.target.value) })}
                    className="flex-1"
                  />
                  <span className="w-16 text-right font-medium">{newPool.cession_percentage}%</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Percentage of risk to cede to reinsurer
                </p>
              </div>
              
              <div className="bg-purple-50 rounded-lg p-4">
                <p className="text-sm font-medium text-purple-700 mb-2">Pool Summary</p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-gray-600">Deals:</span>
                    <span className="ml-2 font-medium">{selectedDeals.size}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Exposure:</span>
                    <span className="ml-2 font-medium">{formatCurrency(selectedPoolAnalytics.total_exposure)}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Ceded Amount:</span>
                    <span className="ml-2 font-medium">
                      {formatCurrency(selectedPoolAnalytics.total_exposure * newPool.cession_percentage / 100)}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600">Ceded Premium:</span>
                    <span className="ml-2 font-medium">
                      {formatCurrency(selectedPoolAnalytics.total_premium * newPool.cession_percentage / 100)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowCreatePoolModal(false)} className="btn btn-secondary">
                Cancel
              </button>
              <button onClick={handleCreatePool} className="btn btn-primary">
                Create Pool
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pool Detail Modal */}
      {showPoolDetailModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">{showPoolDetailModal.name}</h2>
              <button onClick={() => setShowPoolDetailModal(null)}>
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>
            
            {(() => {
              const analytics = calculatePoolAnalytics(showPoolDetailModal.deal_ids);
              return (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <div className="bg-purple-50 rounded-lg p-3">
                      <p className="text-xs text-purple-600">Total Exposure</p>
                      <p className="text-lg font-bold text-purple-700">{formatCurrency(analytics.total_exposure)}</p>
                    </div>
                    <div className="bg-green-50 rounded-lg p-3">
                      <p className="text-xs text-green-600">Annual Premium</p>
                      <p className="text-lg font-bold text-green-700">{formatCurrency(analytics.total_premium)}</p>
                    </div>
                    <div className="bg-orange-50 rounded-lg p-3">
                      <p className="text-xs text-orange-600">Weighted PD</p>
                      <p className="text-lg font-bold text-orange-700">{(analytics.weighted_pd * 100).toFixed(2)}%</p>
                    </div>
                    <div className="bg-red-50 rounded-lg p-3">
                      <p className="text-xs text-red-600">Expected Loss</p>
                      <p className="text-lg font-bold text-red-700">{formatCurrency(analytics.expected_loss)}</p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-6 mb-6">
                    <div>
                      <h3 className="font-medium mb-3 flex items-center">
                        <Building2 className="h-4 w-4 mr-2" />
                        Industry Breakdown
                      </h3>
                      <div className="space-y-2">
                        {(analytics.industries || []).map((ind) => (
                          <div key={ind.name} className="flex items-center justify-between bg-gray-50 p-2 rounded">
                            <span className="text-sm">{ind.name}</span>
                            <div className="text-right">
                              <p className="text-sm font-medium">{formatCurrency(ind.exposure)}</p>
                              <p className="text-xs text-gray-500">{(ind.percentage * 100).toFixed(1)}%</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    
                    <div>
                      <h3 className="font-medium mb-3 flex items-center">
                        <MapPin className="h-4 w-4 mr-2" />
                        Geographic Breakdown
                      </h3>
                      <div className="space-y-2">
                        {(analytics.states || []).map((state) => (
                          <div key={state.name} className="flex items-center justify-between bg-gray-50 p-2 rounded">
                            <span className="text-sm">{state.name}</span>
                            <div className="text-right">
                              <p className="text-sm font-medium">{formatCurrency(state.exposure)}</p>
                              <p className="text-xs text-gray-500">{(state.percentage * 100).toFixed(1)}%</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h3 className="font-medium mb-2">Pool Statistics</h3>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <span className="text-gray-600">Deal Count:</span>
                        <span className="ml-2 font-medium">{analytics.deal_count}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Avg Deal Size:</span>
                        <span className="ml-2 font-medium">{formatCurrency(analytics.avg_deal_size)}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Avg Guarantee:</span>
                        <span className="ml-2 font-medium">{analytics.avg_guarantee_pct.toFixed(0)}%</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Loss Ratio:</span>
                        <span className="ml-2 font-medium">{(analytics.loss_ratio * 100).toFixed(1)}%</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Diversification:</span>
                        <span className="ml-2 font-medium">{analytics.diversification_score}/100</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Cession:</span>
                        <span className="ml-2 font-medium">{showPoolDetailModal.cession_percentage}%</span>
                      </div>
                    </div>
                  </div>
                </>
              );
            })()}
            
            <div className="flex justify-end mt-6">
              <button onClick={() => setShowPoolDetailModal(null)} className="btn btn-secondary">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Offer Pool to Market Modal */}
      {showOfferPoolModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-lg w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Offer Pool to Market</h2>
              <button onClick={() => setShowOfferPoolModal(null)}>
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>
            
            <p className="text-gray-600 mb-4">
              Offer <strong>{showOfferPoolModal.name}</strong> to reinsurers in the marketplace.
            </p>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Asking Price</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">$</span>
                  <input
                    type="number"
                    value={poolOfferForm.asking_price}
                    onChange={(e) => setPoolOfferForm({ ...poolOfferForm, asking_price: parseFloat(e.target.value) })}
                    className="input w-full pl-8"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Suggested: {formatCurrency(calculatePoolAnalytics(showOfferPoolModal.deal_ids).total_premium * 3)} (3x annual premium)
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cession Percentage</label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="10"
                    max="100"
                    value={poolOfferForm.cession_percentage}
                    onChange={(e) => setPoolOfferForm({ ...poolOfferForm, cession_percentage: parseInt(e.target.value) })}
                    className="flex-1"
                  />
                  <span className="w-16 text-right font-medium">{poolOfferForm.cession_percentage}%</span>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes for Reinsurers</label>
                <textarea
                  value={poolOfferForm.notes}
                  onChange={(e) => setPoolOfferForm({ ...poolOfferForm, notes: e.target.value })}
                  className="input w-full"
                  rows={3}
                  placeholder="Any additional information for potential buyers..."
                />
              </div>
            </div>
            
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowOfferPoolModal(null)} className="btn btn-secondary">
                Cancel
              </button>
              <button onClick={handleOfferPool} className="btn btn-primary inline-flex items-center">
                <Send className="h-4 w-4 mr-2" />
                Offer to Market
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}