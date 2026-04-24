'use client';
export const dynamic = 'force-dynamic';

import { useState, useRef, useEffect } from 'react';
import { Scale, Send, Loader, BookOpen, ChevronDown } from 'lucide-react';
import { api } from '@/lib/api';

const QUICK_QUESTIONS = [
  "What is the minimum equity injection required for a 7(a) loan?",
  "Can a borrower use gifted funds for equity injection?",
  "What DSCR is required to approve a 7(a) loan?",
  "What are the size standards for SBA 7(a) eligibility?",
  "How does SBA define 'change of ownership' for loan purposes?",
  "What personal financial statement is required and when must it be dated?",
  "What are the collateral requirements for loans over $500,000?",
  "Can a borrower be on the SBA CAIVRS system and still get a loan?",
  "What is the maximum loan amount for a standard 7(a) loan?",
  "What are the rules around seller notes in an acquisition?",
];

interface Message {
  role: 'user' | 'assistant';
  content: string;
  dealContext?: string;
}

export default function SBAQAPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [deals, setDeals] = useState<any[]>([]);
  const [selectedDealId, setSelectedDealId] = useState<number | null>(null);
  const [showDeals, setShowDeals] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.getDeals().then(setDeals).catch(() => {});
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const ask = async (question: string) => {
    if (!question.trim() || loading) return;
    const userMsg: Message = { role: 'user', content: question };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const result = await api.askSBAQuestion(question, selectedDealId || undefined);
      const selectedDeal = (deals || []).find(d => d.id === selectedDealId);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: result.answer,
        dealContext: selectedDeal?.name,
      }]);
    } catch (e: any) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, the AI service is unavailable. Please check that ANTHROPIC_API_KEY is configured.',
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      ask(input);
    }
  };

  const selectedDeal = (deals || []).find(d => d.id === selectedDealId);

  return (
    <div className="max-w-4xl mx-auto h-full flex flex-col">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Scale className="h-6 w-6 text-blue-600" />
          SBA Compliance Q&A
        </h1>
        <p className="text-gray-500 mt-1">
          Ask any SBA SOP 50 10 7.1 compliance question. Get answers with specific section citations.
        </p>
      </div>

      {/* Deal context selector */}
      <div className="mb-4 relative">
        <button
          onClick={() => setShowDeals(!showDeals)}
          className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm hover:border-gray-300 bg-white"
        >
          <BookOpen className="h-4 w-4 text-gray-400" />
          {selectedDeal ? (
            <span className="text-gray-700">Context: <strong>{selectedDeal.name}</strong></span>
          ) : (
            <span className="text-gray-400">Add deal context (optional — get deal-specific answers)</span>
          )}
          <ChevronDown className="h-3 w-3 text-gray-400 ml-auto" />
        </button>
        {showDeals && (
          <div className="absolute top-full left-0 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto">
            <button
              onClick={() => { setSelectedDealId(null); setShowDeals(false); }}
              className="w-full text-left px-4 py-2 text-sm text-gray-500 hover:bg-gray-50"
            >
              No deal context (general question)
            </button>
            {(deals || []).map(deal => (
              <button
                key={deal.id}
                onClick={() => { setSelectedDealId(deal.id); setShowDeals(false); }}
                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 border-t border-gray-50"
              >
                {deal.name}
                <span className="text-gray-400 ml-2 text-xs">{deal.industry}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 bg-white border border-gray-200 rounded-xl overflow-y-auto p-4 space-y-4 min-h-96 max-h-[500px]">
        {messages.length === 0 && (
          <div className="text-center py-8">
            <Scale className="h-12 w-12 text-gray-200 mx-auto mb-4" />
            <p className="text-gray-400 font-medium">Ask any SBA compliance question</p>
            <p className="text-gray-300 text-sm mt-1">Answers cite specific SOP 50 10 7.1 sections</p>
          </div>
        )}

        {(messages || []).map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-3xl rounded-2xl px-4 py-3 ${
              msg.role === 'user'
                ? 'bg-blue-600 text-white rounded-br-sm'
                : 'bg-gray-50 border border-gray-200 text-gray-800 rounded-bl-sm'
            }`}>
              {msg.dealContext && msg.role === 'assistant' && (
                <p className="text-xs text-blue-500 mb-1 font-medium">📋 Applied to: {msg.dealContext}</p>
              )}
              <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-50 border border-gray-200 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-2">
              <Loader className="h-4 w-4 animate-spin text-blue-500" />
              <span className="text-sm text-gray-500">Looking up SOP reference...</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Quick questions */}
      {messages.length === 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold text-gray-400 uppercase mb-2">Common Questions</p>
          <div className="flex flex-wrap gap-2">
            {(QUICK_QUESTIONS || []).slice(0, 6).map((q, i) => (
              <button
                key={i}
                onClick={() => ask(q)}
                className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-full text-xs text-gray-600 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700 transition-colors"
              >
                {q.length > 55 ? q.slice(0, 55) + '…' : q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="mt-4 flex gap-2">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask an SBA compliance question... (Enter to send, Shift+Enter for new line)"
          className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:border-blue-400 min-h-[52px] max-h-32"
          rows={2}
          disabled={loading}
        />
        <button
          onClick={() => ask(input)}
          disabled={!input.trim() || loading}
          className="px-4 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center"
        >
          {loading ? <Loader className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
        </button>
      </div>

      <p className="text-center text-xs text-gray-400 mt-3">
        Answers reference SBA SOP 50 10 7.1. Always verify with your SBA District Office for final compliance decisions.
      </p>
    </div>
  );
}