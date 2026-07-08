import React, { useState } from 'react';
import { Search, ArrowDownToLine, ChevronLeft, ChevronRight, Check, AlertTriangle, XCircle, Sparkles, Filter, HelpCircle } from 'lucide-react';
import { EmailVerificationResult } from '../types';

interface EmailTableProps {
  emails: EmailVerificationResult[];
  campaignName: string;
  csvHeaders?: string[];
}

export default function EmailTable({ emails, campaignName, csvHeaders }: EmailTableProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'valid' | 'risky' | 'invalid' | 'typo'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const itemsPerPage = 12;

  // Filter matching
  const filteredEmails = emails.filter(item => {
    const matchesSearch = item.email.toLowerCase().includes(searchTerm.toLowerCase());
    if (!matchesSearch) return false;

    if (statusFilter === 'all') return true;
    if (statusFilter === 'valid') return item.status === 'valid';
    if (statusFilter === 'risky') return item.status === 'risky';
    if (statusFilter === 'invalid') return item.status === 'invalid';
    if (statusFilter === 'typo') return !!item.typoSuggestion;
    return true;
  });

  // Pagination bounds
  const totalPages = Math.max(1, Math.ceil(filteredEmails.length / itemsPerPage));
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredEmails.slice(indexOfFirstItem, indexOfLastItem);

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
      setExpandedRow(null);
    }
  };

  const toggleRow = (index: number) => {
    if (expandedRow === index) {
      setExpandedRow(null);
    } else {
      setExpandedRow(index);
    }
  };

  // Helper to generate CSV content, preserving original format if available & removing duplicate emails
  const generateCSVContent = (
    items: EmailVerificationResult[], 
    statusFilter?: 'valid' | 'risky' | 'invalid'
  ): string => {
    // 1. Filter by status
    let filtered = statusFilter 
      ? items.filter(item => item.status === statusFilter)
      : items;

    // 2. Remove duplicate emails, keeping the first occurrence
    const seen = new Set<string>();
    const deduplicated: EmailVerificationResult[] = [];
    for (const item of filtered) {
      const emailLower = item.email.trim().toLowerCase();
      if (!seen.has(emailLower)) {
        seen.add(emailLower);
        deduplicated.push(item);
      }
    }

    // 3. Generate CSV lines
    if (csvHeaders && csvHeaders.length > 0) {
      // Reconstruct original CSV structure perfectly
      const csvLines = [
        csvHeaders.map(h => `"${h.replace(/"/g, '""')}"`).join(',')
      ];

      for (const item of deduplicated) {
        if (item.originalRow && item.originalRow.length > 0) {
          const rowLine = item.originalRow.map(val => {
            const valStr = val !== undefined && val !== null ? String(val) : '';
            return `"${valStr.replace(/"/g, '""')}"`;
          }).join(',');
          csvLines.push(rowLine);
        } else {
          // Fallback padding
          const rowLine = csvHeaders.map((_, idx) => {
            if (idx === 0) return `"${item.email.replace(/"/g, '""')}"`;
            return '""';
          }).join(',');
          csvLines.push(rowLine);
        }
      }

      return csvLines.join('\n');
    } else {
      // Fallback for simple pasted lists
      const headers = ['Email', 'Status', 'Deliverability Score'];
      const csvLines = [headers.join(',')];

      for (const item of deduplicated) {
        csvLines.push(`"${item.email.replace(/"/g, '""')}", "${item.status.toUpperCase()}", "${item.score}/100"`);
      }

      return csvLines.join('\n');
    }
  };

  // Export handlers
  const handleExportCategory = (status: 'valid' | 'risky' | 'invalid') => {
    const csvContent = generateCSVContent(emails, status);
    triggerDownload(csvContent, `${campaignName}_${status}_emails_deduped.csv`);
  };

  const handleExportFullReport = () => {
    const headers = [
      'Email', 
      'Status', 
      'Deliverability Score', 
      'Syntax Check', 
      'Syntax Error Reason',
      'Domain Verified', 
      'MX Records Found', 
      'Domain Error Reason',
      'Disposable Provider', 
      'Role-Based Prefix', 
      'Typo Suggestion'
    ];

    // Deduplicate the full report too
    const seen = new Set<string>();
    const deduplicated = emails.filter(item => {
      const emailLower = item.email.trim().toLowerCase();
      if (seen.has(emailLower)) return false;
      seen.add(emailLower);
      return true;
    });

    const rows = deduplicated.map(item => [
      item.email,
      item.status.toUpperCase(),
      `${item.score}/100`,
      item.syntax.valid ? 'VALID' : 'INVALID',
      item.syntax.error || '',
      item.domain.valid ? 'VALID' : 'INVALID',
      item.domain.hasMx ? 'YES' : 'NO',
      item.domain.error || '',
      item.disposable ? 'YES' : 'NO',
      item.roleBased ? 'YES' : 'NO',
      item.typoSuggestion || ''
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    triggerDownload(csvContent, `${campaignName}_full_deduped_report.csv`);
  };

  const triggerDownload = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", filename.replace(/\s+/g, '_'));
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Counts & Duplicate Detection
  const validCount = emails.filter(e => e.status === 'valid').length;
  const riskyCount = emails.filter(e => e.status === 'risky').length;
  const invalidCount = emails.filter(e => e.status === 'invalid').length;
  const typoCount = emails.filter(e => e.typoSuggestion).length;

  const totalCount = emails.length;
  const uniqueEmailsSet = new Set(emails.map(e => e.email.trim().toLowerCase()));
  const duplicateCount = totalCount - uniqueEmailsSet.size;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex flex-col h-full">
      
      {/* 1. Header Toolbar & CSV Export */}
      <div className="p-5 border-b border-slate-200 flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-slate-50/40">
        <div>
          <h3 className="text-sm font-bold text-slate-900 font-display">Email Audit Record Grid</h3>
          <p className="text-xs mt-0.5">
            {duplicateCount > 0 ? (
              <span className="text-amber-600 font-semibold flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
                {duplicateCount} duplicate email{duplicateCount > 1 ? 's' : ''} detected — will be auto-removed on download
              </span>
            ) : (
              <span className="text-slate-400">Filter, review issue tags, and download separate categorized CSV sheets</span>
            )}
          </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => handleExportCategory('valid')}
            disabled={validCount === 0}
            title="Download Valid & Deliverable emails in the exact input CSV format, with duplicates removed"
            className="px-3 py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-50 disabled:text-slate-400 disabled:shadow-none text-white flex items-center gap-1.5 cursor-pointer shadow-xs transition-all active:scale-95"
          >
            <ArrowDownToLine className="w-3.5 h-3.5" />
            Download Valid CSV ({emails.filter(e => e.status === 'valid').map(e => e.email.toLowerCase()).filter((val, idx, self) => self.indexOf(val) === idx).length})
          </button>
          
          <button
            onClick={() => handleExportCategory('risky')}
            disabled={riskyCount === 0}
            title="Download Risky emails (Catch-All, Role-based) in the exact input CSV format, with duplicates removed"
            className="px-3 py-2 text-xs font-bold rounded-xl bg-amber-500 hover:bg-amber-600 disabled:bg-slate-50 disabled:text-slate-400 disabled:shadow-none text-white flex items-center gap-1.5 cursor-pointer shadow-xs transition-all active:scale-95"
          >
            <ArrowDownToLine className="w-3.5 h-3.5" />
            Download Risky CSV ({emails.filter(e => e.status === 'risky').map(e => e.email.toLowerCase()).filter((val, idx, self) => self.indexOf(val) === idx).length})
          </button>

          <button
            onClick={() => handleExportCategory('invalid')}
            disabled={invalidCount === 0}
            title="Download Invalid emails (bounced, failed MX records, syntax errors) in the exact input CSV format, with duplicates removed"
            className="px-3 py-2 text-xs font-bold rounded-xl bg-rose-600 hover:bg-rose-700 disabled:bg-slate-50 disabled:text-slate-400 disabled:shadow-none text-white flex items-center gap-1.5 cursor-pointer shadow-xs transition-all active:scale-95"
          >
            <ArrowDownToLine className="w-3.5 h-3.5" />
            Download Invalid CSV ({emails.filter(e => e.status === 'invalid').map(e => e.email.toLowerCase()).filter((val, idx, self) => self.indexOf(val) === idx).length})
          </button>

          <button
            onClick={handleExportFullReport}
            title="Download the complete detailed audit report as CSV, with duplicates removed"
            className="px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100/80 flex items-center gap-1.5 cursor-pointer transition-all"
          >
            <ArrowDownToLine className="w-3.5 h-3.5" />
            Full Audit Report
          </button>
        </div>
      </div>

      {/* 2. Searching & Filtration Bar */}
      <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 w-4.5 h-4.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search email address..."
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
            className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-blue-100 focus:border-blue-500"
          />
        </div>

        {/* Filter badging row */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => { setStatusFilter('all'); setCurrentPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer ${
              statusFilter === 'all'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
            }`}
          >
            All ({emails.length})
          </button>
          <button
            onClick={() => { setStatusFilter('valid'); setCurrentPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1 ${
              statusFilter === 'valid'
                ? 'bg-emerald-600 text-white'
                : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100/50'
            }`}
          >
            Valid ({validCount})
          </button>
          <button
            onClick={() => { setStatusFilter('risky'); setCurrentPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1 ${
              statusFilter === 'risky'
                ? 'bg-amber-500 text-white'
                : 'bg-amber-50 text-amber-600 hover:bg-amber-100/50'
            }`}
          >
            Risky ({riskyCount})
          </button>
          <button
            onClick={() => { setStatusFilter('invalid'); setCurrentPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1 ${
              statusFilter === 'invalid'
                ? 'bg-rose-500 text-white'
                : 'bg-rose-50 text-rose-600 hover:bg-rose-100/50'
            }`}
          >
            Invalid ({invalidCount})
          </button>
          {typoCount > 0 && (
            <button
              onClick={() => { setStatusFilter('typo'); setCurrentPage(1); }}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1 ${
                statusFilter === 'typo'
                  ? 'bg-blue-600 text-white'
                  : 'bg-blue-50 text-blue-600 hover:bg-blue-100/50'
              }`}
            >
              <Sparkles className="w-3 h-3 fill-current" />
              Typos ({typoCount})
            </button>
          )}
        </div>
      </div>

      {/* 3. Table Output */}
      <div className="flex-1 overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50/70 border-b border-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              <th className="py-3 px-4">Email Address</th>
              <th className="py-3 px-4 text-center">Score</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4">Issue Flag / Insight</th>
              <th className="py-3 px-4 text-right">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs text-slate-600">
            {currentItems.length > 0 ? (
              currentItems.map((item, index) => {
                const globalIndex = indexOfFirstItem + index;
                const isExpanded = expandedRow === globalIndex;

                return (
                  <React.Fragment key={globalIndex}>
                    <tr 
                      onClick={() => toggleRow(globalIndex)}
                      className={`hover:bg-slate-50/60 transition-colors cursor-pointer ${isExpanded ? 'bg-slate-50/30' : ''}`}
                    >
                      {/* Email column */}
                      <td className="py-3.5 px-4 font-medium text-slate-800">
                        <div className="flex flex-col">
                          <span>{item.email}</span>
                          {item.typoSuggestion && (
                            <span className="text-[10px] text-blue-600 font-semibold flex items-center gap-1 mt-0.5">
                              <Sparkles className="w-3 h-3 fill-current shrink-0" />
                              Did you mean: {item.typoSuggestion}?
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Score Badge */}
                      <td className="py-3.5 px-4">
                        <div className="flex flex-col items-center justify-center">
                          <span className="font-semibold font-mono text-slate-700">{item.score}/100</span>
                          <div className="w-14 h-1 bg-slate-100 rounded-full mt-1 overflow-hidden">
                            <div 
                              className={`h-full rounded-full ${
                                item.score >= 90 ? 'bg-emerald-500' :
                                item.score >= 70 ? 'bg-teal-500' :
                                item.score >= 40 ? 'bg-amber-500' : 'bg-rose-500'
                              }`}
                              style={{ width: `${item.score}%` }}
                            ></div>
                          </div>
                        </div>
                      </td>

                      {/* Status badge */}
                      <td className="py-3.5 px-4">
                        {item.status === 'valid' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700">
                            <Check className="w-3 h-3 text-emerald-500 stroke-[3]" />
                            Deliverable
                          </span>
                        )}
                        {item.status === 'risky' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-50 text-amber-700">
                            <AlertTriangle className="w-3 h-3 text-amber-500 stroke-[3]" />
                            Risky
                          </span>
                        )}
                        {item.status === 'invalid' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-50 text-rose-700">
                            <XCircle className="w-3 h-3 text-rose-500 stroke-[3]" />
                            Bouncing
                          </span>
                        )}
                      </td>

                      {/* Issue Flag text */}
                      <td className="py-3.5 px-4">
                        <div className="flex flex-wrap gap-1.5">
                          {item.disposable && (
                            <span className="text-[10px] font-semibold bg-rose-50 text-rose-600 border border-rose-100/50 px-2 py-0.5 rounded">
                              Disposable
                            </span>
                          )}
                          {item.roleBased && (
                            <span className="text-[10px] font-semibold bg-blue-50 text-blue-600 border border-blue-100/50 px-2 py-0.5 rounded">
                              Role Account
                            </span>
                          )}
                          {!item.syntax.valid && (
                            <span className="text-[10px] font-semibold bg-red-50 text-red-600 border border-red-100/50 px-2 py-0.5 rounded">
                              Syntax Err
                            </span>
                          )}
                          {!item.domain.valid && item.syntax.valid && (
                            <span className="text-[10px] font-semibold bg-rose-50 text-rose-600 border border-rose-100/50 px-2 py-0.5 rounded">
                              No MX/DNS
                            </span>
                          )}
                          {item.status === 'valid' && (
                            <span className="text-[10px] font-semibold bg-emerald-50 text-emerald-600 border border-emerald-100/50 px-2 py-0.5 rounded">
                              Clean inbox
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Details toggler */}
                      <td className="py-3.5 px-4 text-right">
                        <button className="text-xs font-semibold text-blue-600 hover:text-blue-800 uppercase tracking-wide">
                          {isExpanded ? 'Hide' : 'Inspect'}
                        </button>
                      </td>
                    </tr>

                    {/* Expanded details dropdown block */}
                    {isExpanded && (
                      <tr>
                        <td colSpan={5} className="bg-slate-50/50 p-4 border-l-4 border-blue-500">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                            <div>
                              <h4 className="font-semibold text-slate-800 mb-2 uppercase tracking-wider text-[10px] text-blue-600">Verification Handshakes</h4>
                              <ul className="space-y-1.5 font-sans">
                                <li className="flex items-center gap-1.5">
                                  <span className={`w-2 h-2 rounded-full ${item.syntax.valid ? 'bg-emerald-500' : 'bg-red-500'}`}></span>
                                  <span className="text-slate-500">Format & RFC Syntax:</span>
                                  <span className="font-bold">{item.syntax.valid ? 'Passed' : `Failed (${item.syntax.error})`}</span>
                                </li>
                                <li className="flex items-center gap-1.5">
                                  <span className={`w-2 h-2 rounded-full ${item.domain.valid ? 'bg-emerald-500' : 'bg-red-500'}`}></span>
                                  <span className="text-slate-500">Domain Validity:</span>
                                  <span className="font-bold">{item.domain.valid ? 'Active Domain' : 'Inactive / Dead Domain'}</span>
                                </li>
                                <li className="flex items-center gap-1.5">
                                  <span className={`w-2 h-2 rounded-full ${item.domain.hasMx ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
                                  <span className="text-slate-500">SMTP MX Records:</span>
                                  <span className="font-bold">{item.domain.hasMx ? 'Found Mail Servers' : (item.domain.error || 'No SMTP servers found')}</span>
                                </li>
                              </ul>
                            </div>
                            
                            <div>
                              <h4 className="font-semibold text-slate-800 mb-2 uppercase tracking-wider text-[10px] text-blue-600">Classification Details</h4>
                              <ul className="space-y-1.5 font-sans">
                                <li className="flex items-center gap-1.5">
                                  <span className={`w-2 h-2 rounded-full ${item.disposable ? 'bg-amber-500' : 'bg-emerald-500'}`}></span>
                                  <span className="text-slate-500">Disposable Email Check:</span>
                                  <span className="font-bold">{item.disposable ? 'Warning: Temporary Inbox' : 'Safe Personal Provider'}</span>
                                </li>
                                <li className="flex items-center gap-1.5">
                                  <span className={`w-2 h-2 rounded-full ${item.roleBased ? 'bg-blue-500' : 'bg-emerald-500'}`}></span>
                                  <span className="text-slate-500">Role Mailbox Check:</span>
                                  <span className="font-bold">{item.roleBased ? 'Warning: Group Account (info/sales)' : 'Safe Individual Mailbox'}</span>
                                </li>
                                {item.typoSuggestion && (
                                  <li className="flex items-center gap-1.5 p-1 bg-blue-50 border border-blue-100 rounded">
                                    <Sparkles className="w-3.5 h-3.5 text-blue-500 fill-current" />
                                    <span className="text-slate-600">Typo suggestion correction:</span>
                                    <span className="font-extrabold text-blue-700">{item.typoSuggestion}</span>
                                  </li>
                                )}
                              </ul>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            ) : (
              <tr>
                <td colSpan={5} className="py-12 text-center text-slate-400">
                  <HelpCircle className="w-8 h-8 mx-auto text-slate-300 stroke-[1.5] mb-2" />
                  <p className="text-xs font-semibold">No emails match the selected filters</p>
                  <p className="text-[10px] text-slate-400">Try searching for another address or changing filter status</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 4. Pagination */}
      {totalPages > 1 && (
        <div className="p-4 border-t border-slate-200 flex items-center justify-between bg-slate-50/20">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Showing {indexOfFirstItem + 1} - {Math.min(indexOfLastItem, filteredEmails.length)} of {filteredEmails.length} records
          </span>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent cursor-pointer transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                // simple windowed page numbers
                let pageNum = i + 1;
                if (currentPage > 3 && totalPages > 5) {
                  pageNum = currentPage - 3 + i;
                  if (pageNum + (4 - i) > totalPages) {
                    pageNum = totalPages - 4 + i;
                  }
                }
                
                return (
                  <button
                    key={pageNum}
                    onClick={() => handlePageChange(pageNum)}
                    className={`w-7 h-7 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      currentPage === pageNum
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'border border-slate-200 text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent cursor-pointer transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
