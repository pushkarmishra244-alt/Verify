import React from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { CheckCircle2, AlertTriangle, XCircle, Mail, Award, ThumbsUp, ShieldAlert, BadgeHelp } from 'lucide-react';
import { Campaign } from '../types';

interface DashboardStatsProps {
  campaign: Campaign;
}

export default function DashboardStats({ campaign }: DashboardStatsProps) {
  const data = [
    { name: 'Valid (Deliverable)', value: campaign.validCount, color: '#10b981' }, // Emerald-500
    { name: 'Risky (Warning)', value: campaign.riskyCount, color: '#f59e0b' },   // Amber-500
    { name: 'Invalid (Undeliverable)', value: campaign.invalidCount, color: '#f43f5e' }, // Rose-500
  ].filter(item => item.value > 0);

  // Score status styling
  const getScoreColor = (score: number) => {
    if (score >= 90) return { text: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100', bar: 'bg-emerald-500', label: 'Excellent' };
    if (score >= 75) return { text: 'text-teal-600', bg: 'bg-teal-50', border: 'border-teal-100', bar: 'bg-teal-500', label: 'Good' };
    if (score >= 50) return { text: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100', bar: 'bg-amber-500', label: 'Risky' };
    return { text: 'text-rose-600', bg: 'bg-rose-50', border: 'border-rose-100', bar: 'bg-rose-500', label: 'Critical' };
  };

  const scoreStyle = getScoreColor(campaign.deliverabilityScore);

  // Compute stats details
  const syntaxErrors = campaign.emails.filter(e => !e.syntax.valid).length;
  const domainErrors = campaign.emails.filter(e => e.syntax.valid && !e.domain.valid).length;
  const disposableCount = campaign.emails.filter(e => e.disposable).length;
  const roleBasedCount = campaign.emails.filter(e => e.roleBased).length;
  const typoCount = campaign.emails.filter(e => e.typoSuggestion).length;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      
      {/* 1. Deliverability Score Gauge - Bento layout */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-bold text-slate-400 font-sans uppercase tracking-wider">Deliverability Score</h3>
          <span className={`text-[10px] px-2.5 py-1 font-bold rounded-full uppercase tracking-wider ${scoreStyle.bg} ${scoreStyle.text}`}>
            {scoreStyle.label}
          </span>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center py-4">
          <div className="relative flex items-center justify-center w-36 h-36">
            {/* Simple CSS Circular Progress Gauge */}
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
              <circle
                cx="50"
                cy="50"
                r="42"
                stroke="#f1f5f9"
                strokeWidth="8"
                fill="transparent"
              />
              <circle
                cx="50"
                cy="50"
                r="42"
                stroke={campaign.deliverabilityScore >= 75 ? '#10b981' : campaign.deliverabilityScore >= 50 ? '#f59e0b' : '#f43f5e'}
                strokeWidth="8"
                strokeDasharray={`${2 * Math.PI * 42}`}
                strokeDashoffset={`${2 * Math.PI * 42 * (1 - campaign.deliverabilityScore / 100)}`}
                strokeLinecap="round"
                fill="transparent"
                className="transition-all duration-1000 ease-out"
              />
            </svg>
            <div className="absolute flex flex-col items-center justify-center">
              <span className="text-3xl font-extrabold text-slate-800 font-display">{campaign.deliverabilityScore}%</span>
              <span className="text-[10px] text-slate-400 font-mono tracking-wider uppercase mt-0.5">List Quality</span>
            </div>
          </div>
          
          <p className="text-xs text-center text-slate-500 mt-4 leading-relaxed max-w-[220px]">
            {campaign.deliverabilityScore >= 90 
              ? 'Excellent quality. Highly safe to send campaigns with negligible bounce rates.'
              : campaign.deliverabilityScore >= 70
              ? 'Moderate quality. Recommendation is to filter out risky role-based addresses.'
              : 'Caution required. Significant bounce and spam trap risk. Run recommended cleanups.'
            }
          </p>
        </div>
      </div>

      {/* 2. Visual Distribution Chart - Bento layout */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
        <h3 className="text-xs font-bold text-slate-400 font-sans uppercase tracking-wider mb-4">List Distribution</h3>
        
        <div className="flex-1 flex items-center justify-center min-h-[160px]">
          {data.length > 0 ? (
            <div className="w-full h-40 relative flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={65}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {data.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ background: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '12px' }}
                    itemStyle={{ color: '#fff' }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute text-center">
                <span className="text-2xl font-bold text-slate-800">{campaign.totalCount}</span>
                <p className="text-[10px] text-slate-400 font-mono tracking-wider uppercase">Scanned</p>
              </div>
            </div>
          ) : (
            <div className="text-slate-400 text-xs flex flex-col items-center gap-2">
              <Mail className="w-8 h-8 opacity-30" />
              No items to chart
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="grid grid-cols-3 gap-2 mt-2 pt-3 border-t border-slate-200">
          <div className="text-center">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-1.5 align-middle"></span>
            <span className="text-xs text-slate-500 font-medium">Valid</span>
            <p className="text-sm font-semibold text-emerald-600 mt-0.5">{campaign.validCount}</p>
          </div>
          <div className="text-center">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-500 mr-1.5 align-middle"></span>
            <span className="text-xs text-slate-500 font-medium">Risky</span>
            <p className="text-sm font-semibold text-amber-600 mt-0.5">{campaign.riskyCount}</p>
          </div>
          <div className="text-center">
            <span className="inline-block w-2 h-2 rounded-full bg-rose-500 mr-1.5 align-middle"></span>
            <span className="text-xs text-slate-500 font-medium">Invalid</span>
            <p className="text-sm font-semibold text-rose-600 mt-0.5">{campaign.invalidCount}</p>
          </div>
        </div>
      </div>

      {/* 3. Issue Breakdown Bento Card */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
        <h3 className="text-xs font-bold text-slate-400 font-sans uppercase tracking-wider mb-4">Flag Breakdown</h3>
        
        <div className="flex-1 space-y-2">
          <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl hover:bg-slate-100/70 transition-colors">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 bg-amber-100/60 text-amber-600 rounded-lg">
                <ShieldAlert className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-700">Disposable Emails</p>
                <p className="text-[10px] text-slate-400 font-medium">Temporary inbox risk</p>
              </div>
            </div>
            <span className="text-xs font-bold font-mono text-slate-700 bg-white shadow-xs px-2 py-0.5 rounded-md border border-slate-200">
              {disposableCount}
            </span>
          </div>

          <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl hover:bg-slate-100/70 transition-colors">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 bg-blue-100/60 text-blue-600 rounded-lg">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-700">Role-Based Addresses</p>
                <p className="text-[10px] text-slate-400 font-medium">group inbox (info@, help@)</p>
              </div>
            </div>
            <span className="text-xs font-bold font-mono text-slate-700 bg-white shadow-xs px-2 py-0.5 rounded-md border border-slate-200">
              {roleBasedCount}
            </span>
          </div>

          <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl hover:bg-slate-100/70 transition-colors">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 bg-red-100/60 text-red-600 rounded-lg">
                <XCircle className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-700">Syntax & Format Errors</p>
                <p className="text-[10px] text-slate-400 font-medium">Malformed addresses</p>
              </div>
            </div>
            <span className="text-xs font-bold font-mono text-slate-700 bg-white shadow-xs px-2 py-0.5 rounded-md border border-slate-200">
              {syntaxErrors}
            </span>
          </div>

          <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl hover:bg-slate-100/70 transition-colors">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 bg-rose-100/60 text-rose-600 rounded-lg">
                <Mail className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-700">Domain / MX Failures</p>
                <p className="text-[10px] text-slate-400 font-medium">Mail server lookup errors</p>
              </div>
            </div>
            <span className="text-xs font-bold font-mono text-slate-700 bg-white shadow-xs px-2 py-0.5 rounded-md border border-slate-200">
              {domainErrors}
            </span>
          </div>
        </div>

        <div className="text-[10px] text-blue-600 font-semibold font-mono tracking-wider flex items-center justify-end gap-1 mt-3">
          <ThumbsUp className="w-3.5 h-3.5 text-blue-500" />
          {typoCount} RECOVERABLE TYPO SUGGESTIONS FOUND
        </div>
      </div>

    </div>
  );
}
