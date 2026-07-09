import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Mail, RefreshCw, Sparkles, FileSpreadsheet, ShieldCheck, Database, HelpCircle, Key, Info, LogOut, User } from 'lucide-react';
import { Campaign } from './types';
import UploadSection from './components/UploadSection';
import DashboardStats from './components/DashboardStats';
import CampaignList from './components/CampaignList';
import EmailTable from './components/EmailTable';
import MarkdownView from './components/MarkdownView';
import Login from './components/Login';

export default function App() {
  const [authToken, setAuthToken] = useState<string | null>(() => localStorage.getItem('verify_safe_token'));
  const [user, setUser] = useState<{ email: string; name: string } | null>(() => {
    const storedUser = localStorage.getItem('verify_safe_user');
    if (storedUser) {
      try {
        return JSON.parse(storedUser);
      } catch {
        return null;
      }
    }
    return null;
  });

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('');
  const [aiLoading, setAiLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'grid' | 'ai'>('grid');
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [selectedCampaignIds, setSelectedCampaignIds] = useState<string[]>([]);
  const [combinedAiInsight, setCombinedAiInsight] = useState<string>('');

  const handleLoginSuccess = (token: string, userData: { email: string; name: string }) => {
    localStorage.setItem('verify_safe_token', token);
    localStorage.setItem('verify_safe_user', JSON.stringify(userData));
    setAuthToken(token);
    setUser(userData);
  };

  const handleLogout = async () => {
    const currentToken = authToken || localStorage.getItem('verify_safe_token');
    if (currentToken) {
      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${currentToken}`
          }
        });
      } catch (err) {
        console.error('Logout API call error:', err);
      }
    }
    localStorage.removeItem('verify_safe_token');
    localStorage.removeItem('verify_safe_user');
    setAuthToken(null);
    setUser(null);
    setCampaigns([]);
  };

  // Load campaigns from Neon database on mount
  useEffect(() => {
    if (!authToken) {
      setInitialLoading(false);
      return;
    }

    async function loadInitialData() {
      setInitialLoading(true);
      try {
        const res = await fetch('/api/campaigns', {
          headers: {
            'Authorization': `Bearer ${authToken}`
          }
        });
        if (!res.ok) {
          if (res.status === 401 || res.status === 403) {
            handleLogout();
            return;
          }
          throw new Error('Failed to fetch campaigns from DB');
        }
        const data = await res.json();
        setCampaigns(data);
        setSelectedCampaignId(data[0]?.id || '');
      } catch (err) {
        console.error('Error loading campaigns from Neon, trying local storage fallback:', err);
        const stored = localStorage.getItem('email_verifier_campaigns');
        if (stored) {
          try {
            const userCampaigns = JSON.parse(stored);
            setCampaigns(userCampaigns);
            setSelectedCampaignId(userCampaigns[0]?.id || '');
          } catch (e) {
            console.error('Failed to parse stored campaigns', e);
          }
        }
      } finally {
        setInitialLoading(false);
      }
    }
    loadInitialData();
  }, [authToken]);

  // Sync user campaigns to local storage as fallback
  const syncToLocalStorage = (updatedCampaigns: Campaign[]) => {
    localStorage.setItem('email_verifier_campaigns', JSON.stringify(updatedCampaigns));
  };

  // Virtual combined campaign when in multi-select mode and at least one is selected
  let activeCampaign: Campaign | undefined = undefined;
  if (isMultiSelectMode && selectedCampaignIds.length > 0) {
    const selectedCamps = campaigns.filter(c => selectedCampaignIds.includes(c.id));
    if (selectedCamps.length > 0) {
      const combinedEmails = selectedCamps.flatMap(c => c.emails);
      const totalCount = combinedEmails.length;
      const validCount = combinedEmails.filter(e => e.status === 'valid').length;
      const invalidCount = combinedEmails.filter(e => e.status === 'invalid').length;
      const riskyCount = combinedEmails.filter(e => e.status === 'risky').length;
      const deliverabilityScore = totalCount > 0 ? Math.round((validCount / totalCount) * 100) : 0;
      const combinedHeaders = Array.from(new Set(selectedCamps.flatMap(c => c.csvHeaders || []))) as string[];
      const combinedAiSummary = selectedCamps.map(c => c.aiSummary).filter(Boolean).join('\n\n---\n\n');

      activeCampaign = {
        id: 'combined',
        name: `Combined Report (${selectedCamps.length} Lists)`,
        createdAt: selectedCamps[0]?.createdAt || new Date().toISOString(),
        totalCount,
        validCount,
        invalidCount,
        riskyCount,
        emails: combinedEmails,
        deliverabilityScore,
        csvHeaders: combinedHeaders,
        aiSummary: combinedAiInsight || combinedAiSummary || undefined
      };
    }
  } else {
    activeCampaign = campaigns.find(c => c.id === selectedCampaignId);
  }

  // Handle a new email list verification complete
  const handleVerificationComplete = (newCampaign: Campaign) => {
    const updated = [newCampaign, ...campaigns.filter(c => c.id !== newCampaign.id)];
    setCampaigns(updated);
    setSelectedCampaignId(newCampaign.id);
    setActiveTab('grid'); // switch to grid view first
    syncToLocalStorage(updated);
  };

  // Delete campaign from database
  const handleDeleteCampaign = async (id: string) => {
    try {
      const res = await fetch(`/api/campaigns/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });
      if (!res.ok) throw new Error('Failed to delete campaign from database');
    } catch (err) {
      console.error('Error deleting campaign:', err);
    }

    const updated = campaigns.filter(c => c.id !== id);
    setCampaigns(updated);
    if (selectedCampaignId === id) {
      setSelectedCampaignId(updated[0]?.id || '');
    }
    syncToLocalStorage(updated);
  };

  // Bulk delete campaigns from database
  const handleDeleteMultipleCampaigns = async (ids: string[]) => {
    try {
      const res = await fetch('/api/campaigns/delete-bulk', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ ids })
      });
      if (!res.ok) throw new Error('Failed to bulk delete campaigns from database');
    } catch (err) {
      console.error('Error bulk deleting campaigns:', err);
    }

    const updated = campaigns.filter(c => !ids.includes(c.id));
    setCampaigns(updated);
    if (ids.includes(selectedCampaignId)) {
      // Find a remaining campaign that is not being deleted
      const remaining = updated.find(c => !ids.includes(c.id));
      setSelectedCampaignId(remaining?.id || updated[0]?.id || '');
    }
    syncToLocalStorage(updated);
  };

  // Generate AI insights for selected campaign
  const handleGenerateAiInsight = async () => {
    if (!activeCampaign || aiLoading) return;

    setAiLoading(true);
    try {
      // Calculate stats counts for backend prompt
      const summary = {
        id: activeCampaign.id,
        name: activeCampaign.name,
        total: activeCampaign.totalCount,
        valid: activeCampaign.validCount,
        risky: activeCampaign.riskyCount,
        invalid: activeCampaign.invalidCount,
        disposable: activeCampaign.emails.filter(e => e.disposable).length,
        roleBased: activeCampaign.emails.filter(e => e.roleBased).length,
        syntaxErrors: activeCampaign.emails.filter(e => !e.syntax.valid).length,
        domainErrors: activeCampaign.emails.filter(e => e.syntax.valid && !e.domain.valid).length,
        typoCount: activeCampaign.emails.filter(e => e.typoSuggestion).length
      };

      const res = await fetch('/api/campaign-insight', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ summary })
      });

      if (!res.ok) {
        throw new Error('Failed to fetch AI insights from server');
      }

      const data = await res.json();
      
      if (activeCampaign.id === 'combined') {
        setCombinedAiInsight(data.insight);
      } else {
        // Update campaigns state with the new AI summary
        const updated = campaigns.map(c => {
          if (c.id === activeCampaign!.id) {
            return { ...c, aiSummary: data.insight };
          }
          return c;
        });

        setCampaigns(updated);
        syncToLocalStorage(updated);
      }
    } catch (err) {
      console.error('Error generating AI advice:', err);
    } finally {
      setAiLoading(false);
    }
  };

  if (initialLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-slate-500 font-sans">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="w-12 h-12 rounded-full border-4 border-slate-200 border-t-blue-600 animate-spin"></div>
          <div>
            <h3 className="text-sm font-semibold text-slate-800 font-display">CleanList AI Platform</h3>
            <p className="text-xs text-slate-400 mt-1">Initializing RFC checks, MX socket rules, and AI grounding...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!authToken) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 flex flex-col overflow-x-hidden">
      
      {/* 1. Global Navigation Bar - Bento style */}
      <nav className="h-16 border-b border-slate-200 bg-white flex items-center justify-between px-6 sm:px-8 flex-shrink-0 sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-xs">
            <div className="w-4 h-4 border-2 border-white rounded-full border-t-transparent animate-spin-slow"></div>
          </div>
          <span className="font-bold text-lg tracking-tight font-display text-slate-900">
            CleanList<span className="text-blue-600">AI</span>
          </span>
          <span className="hidden sm:inline-flex text-[9px] font-mono font-extrabold bg-blue-50 text-blue-600 border border-blue-100 px-1.5 py-0.5 rounded-md uppercase tracking-wider">
            v2.4
          </span>
        </div>

        {/* Right Nav Options */}
        <div className="flex items-center gap-4 text-xs font-medium text-slate-600">
          <div className="flex items-center gap-2 bg-slate-100/80 hover:bg-slate-100 border border-slate-200 py-1.5 px-3 rounded-full transition-all">
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
            <span className="text-[10px] font-bold text-slate-700">Unlimited Credits Active</span>
          </div>
          
          <div className="h-4 w-px bg-slate-200 hidden sm:block"></div>
          
          {user && (
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200/80 px-3 py-1.5 rounded-full text-slate-700">
              <div className="w-5 h-5 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-[9px] uppercase">
                {user.name.charAt(0)}
              </div>
              <span className="font-semibold text-[10px] max-w-[100px] truncate hidden md:inline">{user.name}</span>
            </div>
          )}

          <button
            id="btn-logout"
            onClick={handleLogout}
            title="Sign Out of Platform"
            className="flex items-center gap-1.5 text-slate-500 hover:text-rose-600 font-bold hover:bg-rose-50 border border-transparent hover:border-rose-100/80 px-3 py-1.5 rounded-full transition-all duration-200 cursor-pointer text-[10px] active:scale-95"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </nav>

      {/* 2. Main Content Grid Layout */}
      <div className="flex-grow p-4 sm:p-6 grid grid-cols-12 gap-4 max-w-7xl w-full mx-auto">
        
        {/* LEFT COLUMN: Controls & History (4 cols) */}
        <div className="col-span-12 lg:col-span-4 space-y-4 flex flex-col">
          
          {/* Upload Section Card */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <UploadSection onVerificationComplete={handleVerificationComplete} authToken={authToken} />
          </motion.div>

          {/* Campaign History Log */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="flex-1"
          >
            <CampaignList
              campaigns={campaigns}
              selectedId={selectedCampaignId}
              onSelectCampaign={(id) => {
                setSelectedCampaignId(id);
                // Also select this campaign in multi-select mode as the primary choice
                setSelectedCampaignIds([id]);
              }}
              onDeleteCampaign={handleDeleteCampaign}
              onDeleteMultipleCampaigns={handleDeleteMultipleCampaigns}
              isMultiSelectMode={isMultiSelectMode}
              setIsMultiSelectMode={(mode) => {
                setIsMultiSelectMode(mode);
                if (mode && selectedCampaignId) {
                  setSelectedCampaignIds([selectedCampaignId]);
                } else {
                  setSelectedCampaignIds([]);
                }
              }}
              selectedCampaignIds={selectedCampaignIds}
              setSelectedCampaignIds={setSelectedCampaignIds}
            />
          </motion.div>

        </div>

        {/* RIGHT COLUMN: Active Campaign Detail & Stats (8 cols) */}
        <div className="col-span-12 lg:col-span-8 space-y-4 flex flex-col">
          {activeCampaign ? (
            <motion.div
              key={activeCampaign.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4 }}
              className="space-y-4 flex flex-col flex-1"
            >
              
              {/* Campaign Header / Hero bar - Bento styled */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono font-bold bg-blue-50 text-blue-600 border border-blue-100/50 px-2 py-0.5 rounded-md">
                      Report View
                    </span>
                    <span className="text-[10px] text-slate-400 font-medium font-mono">
                      ID: {activeCampaign.id}
                    </span>
                  </div>
                  <h2 className="text-lg font-bold text-slate-900 mt-1.5 font-display tracking-tight">
                    {activeCampaign.name}
                  </h2>
                  <p className="text-xs text-slate-400 mt-1 flex items-center gap-1.5 font-mono">
                    Created on {new Date(activeCampaign.createdAt).toLocaleDateString()} at {new Date(activeCampaign.createdAt).toLocaleTimeString()}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right sm:block hidden">
                    <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">List Integrity</span>
                    <span className="text-xs font-semibold text-slate-600">
                      {activeCampaign.validCount} of {activeCampaign.totalCount} clean
                    </span>
                  </div>
                  
                  {/* Big Grade badge - Bento style */}
                  <div className={`p-3 rounded-xl border text-center min-w-[76px] ${
                    activeCampaign.deliverabilityScore >= 90 ? 'bg-emerald-50 border-emerald-100 text-emerald-700' :
                    activeCampaign.deliverabilityScore >= 70 ? 'bg-amber-50 border-amber-100 text-amber-700' :
                    'bg-rose-50 border-rose-100 text-rose-700'
                  }`}>
                    <span className="text-xl font-extrabold font-mono block leading-none">
                      {activeCampaign.deliverabilityScore}%
                    </span>
                    <span className="text-[8px] font-bold uppercase tracking-wide mt-1 block">Quality</span>
                  </div>
                </div>
              </div>

              {/* Statistics Panel Component */}
              <DashboardStats campaign={activeCampaign} />

              {/* Tab selector for Audit table vs AI Insights */}
              <div className="flex-1 flex flex-col bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                <div className="flex border-b border-slate-200 bg-slate-50/50">
                  <button
                    onClick={() => setActiveTab('grid')}
                    className={`px-6 py-4 text-xs font-bold uppercase tracking-wider flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
                      activeTab === 'grid'
                        ? 'border-blue-600 text-blue-600 bg-white'
                        : 'border-transparent text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <FileSpreadsheet className="w-4 h-4 text-blue-500" />
                    Verified Email Records ({activeCampaign.totalCount})
                  </button>
                  <button
                    onClick={() => setActiveTab('ai')}
                    className={`px-6 py-4 text-xs font-bold uppercase tracking-wider flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
                      activeTab === 'ai'
                        ? 'border-blue-600 text-blue-600 bg-white'
                        : 'border-transparent text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <Sparkles className="w-4 h-4 text-blue-500 fill-blue-400/20" />
                    AI Deliverability Audit
                  </button>
                </div>

                {/* Tab content rendering */}
                <div className="flex-1 p-5">
                  {activeTab === 'grid' ? (
                    <EmailTable emails={activeCampaign.emails} campaignName={activeCampaign.name} csvHeaders={activeCampaign.csvHeaders} />
                  ) : (
                    <div className="space-y-4">
                      {activeCampaign.aiSummary ? (
                        <div className="p-5 bg-slate-50/60 border border-slate-200 rounded-xl">
                          <div className="flex items-center justify-between mb-3.5 pb-2.5 border-b border-slate-200">
                            <span className="text-xs font-bold text-blue-600 flex items-center gap-1.5 uppercase tracking-wide font-display">
                              <Sparkles className="w-4 h-4 text-blue-500 fill-blue-400/20" />
                              Gemini Deliverability Recommendation Audit
                            </span>
                            <button
                              onClick={handleGenerateAiInsight}
                              disabled={aiLoading}
                              className="text-[10px] uppercase font-bold text-slate-500 hover:text-blue-600 flex items-center gap-1 cursor-pointer disabled:opacity-50 transition-colors"
                            >
                              <RefreshCw className={`w-3 h-3 ${aiLoading ? 'animate-spin' : ''}`} />
                              Re-Generate Advice
                            </button>
                          </div>
                          
                          <MarkdownView content={activeCampaign.aiSummary} />
                        </div>
                      ) : (
                        <div className="py-12 border border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center p-6 text-center space-y-3">
                          <div className="p-4 bg-blue-50 text-blue-600 rounded-full">
                            <Sparkles className="w-7 h-7 fill-blue-100 animate-pulse" />
                          </div>
                          <div>
                            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide font-display">Generate Expert AI Campaign Report</h4>
                            <p className="text-xs text-slate-400 mt-1 max-w-[360px] leading-relaxed">
                              Get estimated hard bounce rates, sender domain safety recommendations, and a personalized warmup playbook from Gemini.
                            </p>
                          </div>
                          <button
                            onClick={handleGenerateAiInsight}
                            disabled={aiLoading}
                            className="bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 font-semibold text-[10px] uppercase tracking-wider px-5 py-2.5 rounded-xl flex items-center gap-2 transition-all cursor-pointer shadow-xs"
                          >
                            {aiLoading ? (
                              <>
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                Analyzing List Health...
                              </>
                            ) : (
                              <>
                                <Sparkles className="w-3.5 h-3.5 fill-current" />
                                Request AI Report
                              </>
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

            </motion.div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs flex-1 flex flex-col items-center justify-center py-20 p-6 text-center">
              <Mail className="w-12 h-12 text-slate-300 stroke-[1.5] animate-pulse mb-3" />
              <h3 className="text-sm font-semibold text-slate-700 font-display uppercase tracking-wider">
                {isMultiSelectMode ? "Select Campaigns to Combine" : "No Active Campaign"}
              </h3>
              <p className="text-xs text-slate-400 mt-1 max-w-[280px]">
                {isMultiSelectMode
                  ? "Check multiple campaigns in the history log list on the left to see combined live analytics and tables."
                  : "Verify a new list from the upload form, or choose a report from the log history to review stats."
                }
              </p>
            </div>
          )}
        </div>

      </div>

      {/* Status Bar Footer - Bento style */}
      <footer className="h-10 bg-white border-t border-slate-200 px-6 sm:px-8 flex items-center justify-between text-[11px] text-slate-400 flex-shrink-0 mt-8">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 font-semibold text-slate-500 font-mono">
            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
            Engine v2.4.1 Online
          </span>
          <span className="hidden sm:inline font-mono">Latency: 18ms</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="font-semibold text-slate-500">Offline-first Synced</span>
          <span className="text-slate-300">|</span>
          <span>Support: help@cleanlist.ai</span>
        </div>
      </footer>

    </div>
  );
}
