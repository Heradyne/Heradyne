import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatPercent(value: number, decimals: number = 1): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

export function formatNumber(value: number, decimals: number = 2): string {
  return value.toFixed(decimals);
}

export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatDateTime(dateString: string): string {
  return new Date(dateString).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-800',
    submitted: 'bg-blue-100 text-blue-800',
    analyzing: 'bg-yellow-100 text-yellow-800',
    analyzed: 'bg-green-100 text-green-800',
    matched: 'bg-purple-100 text-purple-800',
    pending_lender: 'bg-orange-100 text-orange-800',
    pending_insurer: 'bg-orange-100 text-orange-800',
    approved: 'bg-green-100 text-green-800',
    rejected: 'bg-red-100 text-red-800',
    closed: 'bg-gray-100 text-gray-800',
    pending: 'bg-yellow-100 text-yellow-800',
    accepted: 'bg-green-100 text-green-800',
    info_requested: 'bg-blue-100 text-blue-800',
  };
  return colors[status] || 'bg-gray-100 text-gray-800';
}

export function getRoleLabel(role: string): string {
  const labels: Record<string, string> = {
    borrower: 'Borrower',
    lender: 'Lender',
    loan_officer: 'Loan Officer',
    credit_committee: 'Credit Committee',
    insurer: 'Insurer/Fund',
    admin: 'Administrator',
  };
  return labels[role] || role;
}

// Role groupings for permission checks
export const LENDER_ROLES = ['lender', 'loan_officer', 'credit_committee'];
export const LENDER_DECISION_ROLES = ['lender', 'credit_committee'];
export const LENDER_VERIFICATION_ROLES = ['lender', 'loan_officer'];

export function isLenderRole(role: string): boolean {
  return LENDER_ROLES.includes(role);
}

export function canMakeDecisions(role: string): boolean {
  return LENDER_DECISION_ROLES.includes(role) || role === 'admin';
}

export function canVerifyDocuments(role: string): boolean {
  return LENDER_VERIFICATION_ROLES.includes(role) || role === 'admin';
}

export const INDUSTRIES = [
  'manufacturing',
  'retail',
  'services',
  'technology',
  'healthcare',
  'construction',
  'restaurants',
  'hospitality',
  'transportation',
  'wholesale',
  'professional_services',
];

export const DISCLAIMER = 
  "DISCLAIMER: Heradyne is an informational platform only. It does NOT lend money, provide guarantees, or issue insurance policies. All outputs are recommendations for informational purposes.";
