'use client';

export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { ArrowRight, Shield, BarChart3, Users, FileCheck } from 'lucide-react';
import { DISCLAIMER } from '@/lib/utils';

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center">
              <Shield className="h-8 w-8 text-primary-600" />
              <span className="ml-2 text-xl font-bold text-gray-900">Heradyne</span>
            </div>
            <div className="flex items-center space-x-4">
              <Link href="/login" className="text-gray-600 hover:text-gray-900">
                Log in
              </Link>
              <Link href="/register" className="btn btn-primary">
                Get Started
              </Link>
            </div>
          </div>
        </nav>
      </header>

      {/* Hero */}
      <main>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <div className="text-center">
            <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-6">
              SMB Deal Structuring &<br />
              <span className="text-primary-600">Intelligent Matching</span>
            </h1>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto mb-8">
              Heradyne helps borrowers, lenders, and insurers connect through 
              data-driven underwriting analysis and policy matching.
            </p>
            <div className="flex justify-center space-x-4">
              <Link href="/register" className="btn btn-primary text-lg px-8 py-3">
                Start Free <ArrowRight className="inline ml-2 h-5 w-5" />
              </Link>
              <Link href="/login" className="btn btn-secondary text-lg px-8 py-3">
                Log In
              </Link>
            </div>
          </div>
        </div>

        {/* Features */}
        <div className="bg-white py-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">
              How It Works
            </h2>
            <div className="grid md:grid-cols-3 gap-8">
              <div className="text-center p-6">
                <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <FileCheck className="h-8 w-8 text-primary-600" />
                </div>
                <h3 className="text-xl font-semibold mb-2">Submit Your Deal</h3>
                <p className="text-gray-600">
                  Borrowers enter deal information and upload supporting documents 
                  to the secure data room.
                </p>
              </div>
              <div className="text-center p-6">
                <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <BarChart3 className="h-8 w-8 text-primary-600" />
                </div>
                <h3 className="text-xl font-semibold mb-2">Automated Analysis</h3>
                <p className="text-gray-600">
                  Our engines analyze cash flow, calculate PD, value the business, 
                  and assess collateral coverage.
                </p>
              </div>
              <div className="text-center p-6">
                <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Users className="h-8 w-8 text-primary-600" />
                </div>
                <h3 className="text-xl font-semibold mb-2">Match & Connect</h3>
                <p className="text-gray-600">
                  Deals are matched to lender and insurer policies with 
                  approve-if restructuring scenarios.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Roles */}
        <div className="py-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">
              For Every Stakeholder
            </h2>
            <div className="grid md:grid-cols-3 gap-8">
              <div className="card">
                <h3 className="text-xl font-semibold mb-3 text-primary-600">Borrowers</h3>
                <ul className="space-y-2 text-gray-600">
                  <li>• Create and manage loan deals</li>
                  <li>• Upload supporting documents</li>
                  <li>• View underwriting analysis</li>
                  <li>• Track deal status and matches</li>
                </ul>
              </div>
              <div className="card">
                <h3 className="text-xl font-semibold mb-3 text-primary-600">Lenders</h3>
                <ul className="space-y-2 text-gray-600">
                  <li>• Define lending policies</li>
                  <li>• View matched deals</li>
                  <li>• Accept or reject with audit trail</li>
                  <li>• Request additional information</li>
                </ul>
              </div>
              <div className="card">
                <h3 className="text-xl font-semibold mb-3 text-primary-600">Insurers</h3>
                <ul className="space-y-2 text-gray-600">
                  <li>• Set risk parameters</li>
                  <li>• View matched deals with premiums</li>
                  <li>• Manage coverage decisions</li>
                  <li>• Track portfolio exposure</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Disclaimer */}
        <div className="bg-gray-100 py-8">
          <div className="max-w-4xl mx-auto px-4 text-center">
            <p className="text-sm text-gray-600">{DISCLAIMER}</p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center">
            <div className="flex items-center">
              <Shield className="h-6 w-6 text-primary-400" />
              <span className="ml-2 font-bold">Heradyne</span>
            </div>
            <p className="text-gray-400 text-sm">
              © 2024 Heradyne. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
