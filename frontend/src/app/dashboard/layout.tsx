'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  Shield, Home, FileText, Users, Settings, LogOut, 
  Building2, ShieldCheck, BarChart3, DollarSign, TrendingUp, CreditCard, FileSignature, ShieldAlert,
  ClipboardCheck, Brain, Scale, Calculator, Database
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { cn, getRoleLabel, DISCLAIMER, isLenderRole } from '@/lib/utils';

const navigation = {
  borrower: [
    { name: 'Dashboard', href: '/dashboard', icon: Home },
    { name: 'My Deals', href: '/dashboard/deals', icon: FileText },
    { name: 'Business Dashboard', href: '/dashboard/loan-health', icon: Activity },
    { name: 'Collateral', href: '/dashboard/collateral', icon: Building2 },
    { name: 'Signatures', href: '/dashboard/signatures', icon: FileSignature },
    { name: 'Default Protection', href: '/dashboard/protection', icon: ShieldAlert },
  ],
  lender: [
    { name: 'Dashboard', href: '/dashboard', icon: Home },
    { name: 'My Policies', href: '/dashboard/policies', icon: Building2 },
    { name: 'Matched Deals', href: '/dashboard/matches', icon: FileText },
    { name: 'Portfolio', href: '/dashboard/monitoring', icon: Activity },
    { name: 'Origination', href: '/dashboard/origination', icon: CreditCard },
    { name: 'SBA Compliance', href: '/dashboard/sba-compliance', icon: Scale },
    { name: 'AI Agent', href: '/dashboard/ai-agent', icon: Brain },
    { name: 'Signatures', href: '/dashboard/signatures', icon: FileSignature },
    { name: 'Financials', href: '/dashboard/financials', icon: DollarSign },
    { name: 'Secondary Market', href: '/dashboard/secondary-market', icon: TrendingUp },
  ],
  loan_officer: [
    { name: 'Dashboard', href: '/dashboard', icon: Home },
    { name: 'Matched Deals', href: '/dashboard/matches', icon: FileText },
    { name: 'SBA Compliance', href: '/dashboard/sba-compliance', icon: Scale },
    { name: 'Verification', href: '/dashboard/verification', icon: ClipboardCheck },
    { name: 'Signatures', href: '/dashboard/signatures', icon: FileSignature },
  ],
  credit_committee: [
    { name: 'Dashboard', href: '/dashboard', icon: Home },
    { name: 'My Policies', href: '/dashboard/policies', icon: Building2 },
    { name: 'Matched Deals', href: '/dashboard/matches', icon: FileText },
    { name: 'Origination', href: '/dashboard/origination', icon: CreditCard },
    { name: 'SBA Compliance', href: '/dashboard/sba-compliance', icon: Scale },
    { name: 'AI Agent', href: '/dashboard/ai-agent', icon: Brain },
    { name: 'Signatures', href: '/dashboard/signatures', icon: FileSignature },
    { name: 'Financials', href: '/dashboard/financials', icon: DollarSign },
    { name: 'Secondary Market', href: '/dashboard/secondary-market', icon: TrendingUp },
  ],
  insurer: [
    { name: 'Dashboard', href: '/dashboard', icon: Home },
    { name: 'My Policies', href: '/dashboard/policies', icon: ShieldCheck },
    { name: 'Matched Deals', href: '/dashboard/matches', icon: FileText },
    { name: 'Portfolio', href: '/dashboard/monitoring', icon: Activity },
    { name: 'Actuary Advisor', href: '/dashboard/actuary-advisor', icon: Calculator },
    { name: 'Actuarial Workbench', href: '/dashboard/actuarial-workbench', icon: Database },
    { name: 'Guarantees', href: '/dashboard/origination', icon: Shield },
    { name: 'AI Agent', href: '/dashboard/ai-agent', icon: Brain },
    { name: 'Signatures', href: '/dashboard/signatures', icon: FileSignature },
    { name: 'Financials', href: '/dashboard/financials', icon: DollarSign },
    { name: 'Secondary Market', href: '/dashboard/secondary-market', icon: TrendingUp },
  ],
  admin: [
    { name: 'Dashboard', href: '/dashboard', icon: Home },
    { name: 'All Deals', href: '/dashboard/deals', icon: FileText },
    { name: 'Portfolio', href: '/dashboard/monitoring', icon: Activity },
    { name: 'SBA Compliance', href: '/dashboard/sba-compliance', icon: Scale },
    { name: 'AI Agent', href: '/dashboard/ai-agent', icon: Brain },
    { name: 'Financials', href: '/dashboard/financials', icon: DollarSign },
    { name: 'Secondary Market', href: '/dashboard/secondary-market', icon: TrendingUp },
    { name: 'Users', href: '/dashboard/users', icon: Users },
    { name: 'Assumptions', href: '/dashboard/assumptions', icon: Settings },
    { name: 'Audit Logs', href: '/dashboard/audit', icon: BarChart3 },
  ],
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isLoading, isAuthenticated, mustChangePassword, loadUser, logout } = useAuth();

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isLoading, isAuthenticated, router]);

  useEffect(() => {
    if (!isLoading && isAuthenticated && mustChangePassword) {
      router.push('/change-password');
    }
  }, [isLoading, isAuthenticated, mustChangePassword, router]);

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const navItems = navigation[user.role as keyof typeof navigation] || navigation.borrower;

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Sidebar */}
      <div className="fixed inset-y-0 left-0 w-64 bg-gray-900">
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center h-16 px-4 bg-gray-800">
            <Shield className="h-8 w-8 text-primary-400" />
            <span className="ml-2 text-xl font-bold text-white">Heradyne</span>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-2 py-4 space-y-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    'flex items-center px-4 py-2 text-sm rounded-lg transition-colors',
                    isActive
                      ? 'bg-gray-800 text-white'
                      : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                  )}
                >
                  <item.icon className="h-5 w-5 mr-3" />
                  {item.name}
                </Link>
              );
            })}
          </nav>

          {/* User info */}
          <div className="p-4 border-t border-gray-800">
            <div className="flex items-center">
              <div className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center text-white font-medium">
                {user.full_name.charAt(0)}
              </div>
              <div className="ml-3 flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">
                  {user.full_name}
                </p>
                <p className="text-xs text-gray-400 truncate">
                  {getRoleLabel(user.role)}
                </p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="mt-4 flex items-center w-full px-4 py-2 text-sm text-gray-300 hover:bg-gray-800 rounded-lg transition-colors"
            >
              <LogOut className="h-5 w-5 mr-3" />
              Sign out
            </button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="pl-64">
        {/* Disclaimer banner */}
        <div className="bg-yellow-50 border-b border-yellow-200 px-4 py-2">
          <p className="text-xs text-yellow-800 text-center">
            {DISCLAIMER}
          </p>
        </div>

        {/* Page content */}
        <main className="p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
