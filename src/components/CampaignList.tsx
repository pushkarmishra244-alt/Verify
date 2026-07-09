import React, { useState } from 'react';
import { Mail, Search, Trash2, Calendar, ShieldCheck, ChevronRight, CheckSquare, Square, Download, Check } from 'lucide-react';
import { Campaign } from '../types';

interface CampaignListProps {
  campaigns: Campaign[];
  selectedId: string;
  onSelectCampaign: (id: string) => void;
  onDeleteCampaign: (id: string) => void;
  onDeleteMultipleCampaigns?: (ids: string[]) => void;
  isMultiSelectMode: boolean;
  setIsMultiSelectMode: (mode: boolean) => void;
  selectedCampaignIds: string[];
  setSelectedCampaignIds: React.Dispatch<React.SetStateAction<string[]>>;
}

export default function CampaignList({
  campaigns,
  selectedId,
  onSelectCampaign,
  onDeleteCampaign,
  onDeleteMultipleCampaigns,
  isMultiSelectMode,
  setIsMultiSelectMode,
  selectedCampaignIds,
  setSelectedCampaignIds
}: CampaignListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  
  const [bulkConfirmDelete, setBulkConfirmDelete] = useState(false);

  const filteredCampaigns = campaigns.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatDate = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      return isoString;
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-emerald-500 bg-emerald-50 border-emerald-100';
    if (score >= 70) return 'text-amber-500 bg-amber-50 border-amber-100';
    return 'text-rose-500 bg-rose-50 border-rose-100';
  };

  // Click handler for list items
  const handleItemClick = (campId: string) => {
    if (isMultiSelectMode) {
      setSelectedCampaignIds(prev => 
        prev.includes(campId) 
          ? prev.filter(id => id !== campId) 
          : [...prev, campId]
      );
    } else {
      onSelectCampaign(campId);
    }
  };

  // Combined downloads
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

  const handleExportMergedClean = () => {
    const selectedCamps = campaigns.filter(c => selectedCampaignIds.includes(c.id));
    const seenEmails = new Set<string>();
    const mergedValidEmails: string[] = [];

    for (const camp of selectedCamps) {
      for (const item of camp.emails) {
        if (item.status === 'valid') {
          const lowerEmail = item.email.toLowerCase().trim();
          if (!seenEmails.has(lowerEmail)) {
            seenEmails.add(lowerEmail);
            mergedValidEmails.push(item.email);
          }
        }
      }
    }

    const headers = ['Email'];
    const csvContent = [
      headers.join(','),
      ...mergedValidEmails.map(email => `"${email.replace(/"/g, '""')}"`)
    ].join('\n');

    triggerDownload(csvContent, `merged_clean_emails_${Date.now()}.csv`);
  };

  const handleExportMergedFull = () => {
    const selectedCamps = campaigns.filter(c => selectedCampaignIds.includes(c.id));
    const headers = [
      'Campaign Name',
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

    const rows: string[][] = [];

    for (const camp of selectedCamps) {
      for (const item of camp.emails) {
        rows.push([
          camp.name,
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
      }
    }

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    triggerDownload(csvContent, `merged_full_audit_report_${Date.now()}.csv`);
  };

  const toggleSelectAll = () => {
    if (selectedCampaignIds.length === filteredCampaigns.length) {
      setSelectedCampaignIds([]);
    } else {
      setSelectedCampaignIds(filteredCampaigns.map(c => c.id));
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 flex flex-col h-full min-h-[400px]">
      
      {/* Header and Search */}
      <div className="space-y-3 mb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Campaign Log History</h3>
            <span className="text-[10px] font-mono bg-slate-100 px-2 py-0.5 rounded-full text-slate-500 font-bold">
              {campaigns.length} total
            </span>
          </div>
          
          {campaigns.length > 0 && (
            <button
              onClick={() => {
                setIsMultiSelectMode(!isMultiSelectMode);
                setSelectedCampaignIds([]);
                setBulkConfirmDelete(false);
              }}
              className={`px-2.5 py-1 text-[10px] font-bold rounded-lg border transition-all flex items-center justify-center gap-1 cursor-pointer ${
                isMultiSelectMode
                  ? 'bg-blue-600 border-blue-600 text-white shadow-xs'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <CheckSquare className="w-3.5 h-3.5" />
              {isMultiSelectMode ? 'Single View' : 'Select Multiple'}
            </button>
          )}
        </div>
        
        <div className="relative">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search campaigns..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-blue-100 focus:border-blue-500"
          />
        </div>

        {/* Select All Row */}
        {isMultiSelectMode && filteredCampaigns.length > 0 && (
          <div className="flex items-center justify-between py-1 px-1 border-b border-slate-100 bg-slate-50/50 rounded-lg p-2">
            <button
              onClick={toggleSelectAll}
              className="text-[10px] font-bold text-blue-600 hover:text-blue-800 transition-colors cursor-pointer flex items-center gap-1"
            >
              <Check className="w-3 h-3" />
              {selectedCampaignIds.length === filteredCampaigns.length ? 'Deselect All' : 'Select All Filtered'}
            </button>
            <span className="text-[10px] text-slate-400 font-medium">
              {selectedCampaignIds.length} selected
            </span>
          </div>
        )}
      </div>

      {/* Campaigns Listing */}
      <div className="flex-1 overflow-y-auto max-h-[300px] lg:max-h-none space-y-2 pr-1">
        {filteredCampaigns.length > 0 ? (
          filteredCampaigns.map((camp) => {
            const isSelected = camp.id === selectedId;
            const isChecked = selectedCampaignIds.includes(camp.id);
            const scoreStyle = getScoreColor(camp.deliverabilityScore);

            return (
              <div
                key={camp.id}
                onClick={() => handleItemClick(camp.id)}
                className={`group p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                  isMultiSelectMode
                    ? isChecked
                      ? 'border-blue-500 bg-blue-50/10 shadow-blue-50 shadow-xs'
                      : 'border-slate-100 bg-white hover:bg-slate-50'
                    : isSelected
                      ? 'border-blue-500 bg-blue-50/15 shadow-blue-50 shadow-sm'
                      : 'border-slate-100 bg-white hover:bg-slate-50 hover:border-slate-200'
                }`}
              >
                <div className="flex items-start gap-2.5 min-w-0 flex-1">
                  {/* Select Multiple Checkbox */}
                  {isMultiSelectMode && (
                    <div className="shrink-0 mt-2.5">
                      {isChecked ? (
                        <CheckSquare className="w-4 h-4 text-blue-600 fill-blue-50" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-300 group-hover:text-slate-400" />
                      )}
                    </div>
                  )}

                  <div className={`p-2 rounded-lg shrink-0 mt-0.5 ${
                    isMultiSelectMode 
                      ? isChecked ? 'bg-blue-600 text-white' : 'bg-slate-50 text-slate-500'
                      : isSelected ? 'bg-blue-600 text-white' : 'bg-slate-50 text-slate-500 group-hover:bg-slate-100'
                  }`}>
                    <Mail className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className={`text-xs font-semibold text-slate-800 truncate mb-0.5 group-hover:text-blue-600 transition-colors ${
                      isMultiSelectMode && isChecked ? 'text-blue-700' : ''
                    }`}>
                      {camp.name}
                    </h4>
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-mono">
                      <Calendar className="w-3 h-3 shrink-0" />
                      <span>{formatDate(camp.createdAt)}</span>
                    </div>
                    <div className="flex gap-2 items-center mt-1.5">
                      <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-md">
                        {camp.totalCount} emails
                      </span>
                      <span className="text-[10px] font-semibold text-emerald-600">
                        {Math.round((camp.validCount / camp.totalCount) * 100)}% valid
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {/* Score */}
                  <div className={`flex flex-col items-center justify-center border rounded-lg px-2 py-1 ${scoreStyle}`}>
                    <span className="text-xs font-bold font-mono leading-none">{camp.deliverabilityScore}%</span>
                    <span className="text-[6px] tracking-wider font-bold font-sans uppercase mt-0.5">Score</span>
                  </div>

                  {/* Actions (Delete icon with inline confirmation) */}
                  {!isMultiSelectMode && (
                    confirmDeleteId === camp.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDeleteId(null);
                          }}
                          className="text-[9px] font-bold uppercase tracking-wider text-slate-400 hover:text-slate-600 px-1.5 py-1 rounded bg-slate-100 cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteCampaign(camp.id);
                            setConfirmDeleteId(null);
                          }}
                          className="text-[9px] font-bold uppercase tracking-wider text-white bg-rose-600 hover:bg-rose-700 px-2 py-1 rounded flex items-center gap-1 cursor-pointer"
                          title="Confirm Delete"
                        >
                          <Trash2 className="w-3 h-3" />
                          Delete
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDeleteId(camp.id);
                        }}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all cursor-pointer"
                        title="Delete Campaign"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )
                  )}
                  
                  {!isMultiSelectMode && (
                    <ChevronRight className={`w-4 h-4 text-slate-400 ${isSelected ? 'text-blue-500' : 'opacity-0'}`} />
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <div className="flex flex-col items-center justify-center py-10 text-center text-slate-400 space-y-1">
            <ShieldCheck className="w-8 h-8 stroke-[1.5] text-slate-300" />
            <p className="text-xs font-semibold text-slate-500">No campaigns found</p>
            <p className="text-[10px] text-slate-400">Import or paste a new list above</p>
          </div>
        )}
      </div>

      {/* Merged Bulk Actions Menu */}
      {isMultiSelectMode && selectedCampaignIds.length > 0 && (
        <div className="mt-4 p-4 rounded-xl border border-blue-200 bg-blue-50/30 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide">Bulk Actions</h4>
              <p className="text-[10px] text-slate-500 font-medium font-mono">{selectedCampaignIds.length} campaigns selected</p>
            </div>
            <span className="text-[10px] font-mono bg-blue-100 px-2 py-0.5 rounded text-blue-700 font-bold">
              {selectedCampaignIds.reduce((sum, id) => sum + (campaigns.find(c => c.id === id)?.totalCount || 0), 0)} emails
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleExportMergedClean}
              className="px-3 py-2 text-[10px] font-bold rounded-lg bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center gap-1.5 cursor-pointer transition-colors shadow-xs"
              title="Download unique clean email addresses only"
            >
              <Download className="w-3.5 h-3.5" />
              Clean CSV
            </button>
            <button
              onClick={handleExportMergedFull}
              className="px-3 py-2 text-[10px] font-bold rounded-lg border border-blue-200 bg-white hover:bg-blue-50 text-blue-700 flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
              title="Download complete status verification spreadsheet"
            >
              <Download className="w-3.5 h-3.5" />
              Full Audit CSV
            </button>
          </div>

          {onDeleteMultipleCampaigns && (
            <div className="pt-2 border-t border-blue-100">
              {bulkConfirmDelete ? (
                <div className="flex items-center justify-between gap-2 bg-rose-50 p-2 rounded-lg border border-rose-150">
                  <span className="text-[10px] font-semibold text-rose-700">Delete all {selectedCampaignIds.length} lists?</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setBulkConfirmDelete(false)}
                      className="text-[9px] font-bold uppercase tracking-wider text-slate-500 px-2 py-1 rounded bg-slate-100 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        onDeleteMultipleCampaigns(selectedCampaignIds);
                        setSelectedCampaignIds([]);
                        setBulkConfirmDelete(false);
                      }}
                      className="text-[9px] font-bold uppercase tracking-wider text-white bg-rose-600 hover:bg-rose-700 px-2.5 py-1 rounded flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                      Delete All
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setBulkConfirmDelete(true)}
                  className="w-full py-1.5 text-[10px] font-bold text-rose-600 hover:text-rose-700 hover:bg-rose-50 border border-transparent hover:border-rose-100 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete Selected Lists
                </button>
              )}
            </div>
          )}
        </div>
      )}

    </div>
  );
}
