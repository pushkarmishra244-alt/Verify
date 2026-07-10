import React, { useState, useRef } from 'react';
import { Upload, Clipboard, Play, AlertCircle, FileText, Check, Layers, X, Files } from 'lucide-react';
import { Campaign } from '../types';

interface UploadSectionProps {
  onVerificationComplete: (campaign: Campaign) => void;
  authToken: string | null;
}

export default function UploadSection({ onVerificationComplete, authToken }: UploadSectionProps) {
  const [activeTab, setActiveTab] = useState<'csv' | 'paste'>('csv');
  const [listName, setListName] = useState('');
  const [pastedEmails, setPastedEmails] = useState('');
  const [isDragActive, setIsDragActive] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [fileStatuses, setFileStatuses] = useState<{ [fileName: string]: 'pending' | 'verifying' | 'success' | 'failed' }>({});
  const [currentFileIndex, setCurrentFileIndex] = useState<number>(-1);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Smart, highly robust CSV parser with delimiter auto-detection and column-scanning
  const parseCSVFull = (text: string): { emails: { email: string; originalRow: string[] }[]; csvHeaders: string[] } => {
    if (!text || !text.trim()) return { emails: [], csvHeaders: [] };

    // Auto-detect delimiter by scanning the first few lines
    const firstFewLines = text.split(/\r?\n/).slice(0, 5);
    let delimiter = ',';
    let commaCount = 0;
    let semicolonCount = 0;
    let tabCount = 0;
    
    for (const line of firstFewLines) {
      commaCount += (line.match(/,/g) || []).length;
      semicolonCount += (line.match(/;/g) || []).length;
      tabCount += (line.match(/\t/g) || []).length;
    }
    
    if (semicolonCount > commaCount && semicolonCount > tabCount) {
      delimiter = ';';
    } else if (tabCount > commaCount && tabCount > semicolonCount) {
      delimiter = '\t';
    }

    const parsedRows: string[][] = [];
    let currentRow: string[] = [];
    let currentValue = '';
    let inQuotes = false;

    // Standard state machine to parse CSV correctly, supporting newlines inside quotes
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          // Double quotes inside quotes is an escaped quote
          currentValue += '"';
          i++; // skip next quote
        } else {
          // Toggle quote state
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        currentRow.push(currentValue.trim());
        currentValue = '';
      } else if ((char === '\r' || char === '\n') && !inQuotes) {
        if (char === '\r' && nextChar === '\n') {
          i++; // skip \n
        }
        currentRow.push(currentValue.trim());
        if (currentRow.length > 0 && currentRow.some(cell => cell.length > 0)) {
          parsedRows.push(currentRow);
        }
        currentRow = [];
        currentValue = '';
      } else {
        currentValue += char;
      }
    }
    
    // Add the final cell and row if any
    if (currentValue || currentRow.length > 0) {
      currentRow.push(currentValue.trim());
      if (currentRow.some(cell => cell.length > 0)) {
        parsedRows.push(currentRow);
      }
    }

    if (parsedRows.length === 0) return { emails: [], csvHeaders: [] };

    // Find the email column by checking ALL rows for emails
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const maxCols = Math.max(...parsedRows.map(r => r.length));
    const votes = new Array(maxCols).fill(0);

    for (const row of parsedRows) {
      for (let i = 0; i < row.length; i++) {
        const val = row[i]?.replace(/["']/g, '').trim();
        if (val && emailRegex.test(val)) {
          votes[i]++;
        }
      }
    }

    // Determine the column with the most email votes
    let emailColIdx = -1;
    let maxVotes = 0;
    for (let i = 0; i < votes.length; i++) {
      if (votes[i] > maxVotes) {
        maxVotes = votes[i];
        emailColIdx = i;
      }
    }

    // Tiered fallback on column header matching if no columns had valid emails (e.g. all bad syntax or empty file)
    if (emailColIdx === -1) {
      const firstRow = parsedRows[0];
      const cleanHeaders = firstRow.map(h => h.replace(/["']/g, '').trim().toLowerCase());
      const exactEmailHeaders = ['email', 'email address', 'email_address', 'e-mail', 'e-mail address', 'e-mail_address', 'mail', 'email id', 'email_id', 'emailid'];
      
      for (const term of exactEmailHeaders) {
        const idx = cleanHeaders.indexOf(term);
        if (idx !== -1) {
          emailColIdx = idx;
          break;
        }
      }
      
      if (emailColIdx === -1) {
        for (let i = 0; i < cleanHeaders.length; i++) {
          const val = cleanHeaders[i];
          if (val.includes('email') || val.includes('e-mail')) {
            emailColIdx = i;
            break;
          }
        }
      }

      if (emailColIdx === -1) {
        for (let i = 0; i < cleanHeaders.length; i++) {
          const val = cleanHeaders[i];
          if (val.includes('recipient') || val.includes('subscriber') || val.includes('contact')) {
            emailColIdx = i;
            break;
          }
        }
      }
    }

    // Default fallback
    if (emailColIdx === -1) {
      emailColIdx = 0;
    }

    // Determine if the first row is a header row
    const firstRow = parsedRows[0];
    const firstRowVal = firstRow[emailColIdx]?.replace(/["']/g, '').trim().toLowerCase() || '';
    const isHeaderRow = firstRowVal.includes('email') || 
                        firstRowVal.includes('mail') || 
                        !emailRegex.test(firstRowVal);

    const startIdx = isHeaderRow ? 1 : 0;

    // Build headers
    const csvHeaders = isHeaderRow 
      ? firstRow.map(h => h.replace(/["']/g, '').trim())
      : Array.from({ length: maxCols }, (_, i) => i === emailColIdx ? 'Email' : `Column ${i + 1}`);

    // Pre-calculate occurrences (frequencies) of each email in the parsed data
    const emailCounts: { [email: string]: number } = {};
    for (let i = startIdx; i < parsedRows.length; i++) {
      const row = parsedRows[i];
      if (row && row[emailColIdx] !== undefined) {
        const cleanEmail = row[emailColIdx].replace(/["']/g, '').trim();
        if (cleanEmail) {
          const lowerEmail = cleanEmail.toLowerCase();
          emailCounts[lowerEmail] = (emailCounts[lowerEmail] || 0) + 1;
        }
      }
    }

    const emails: { email: string; originalRow: string[]; occurrences: number }[] = [];
    const seenEmails = new Set<string>();

    for (let i = startIdx; i < parsedRows.length; i++) {
      const row = parsedRows[i];
      if (row && row[emailColIdx] !== undefined) {
        const cleanEmail = row[emailColIdx].replace(/["']/g, '').trim();
        if (cleanEmail) {
          const lowerEmail = cleanEmail.toLowerCase();
          // We only exclude EXACT duplicates (meaning identical lowercased emails)
          if (!seenEmails.has(lowerEmail)) {
            seenEmails.add(lowerEmail);
            // Ensure originalRow has correct length aligned with headers
            const alignedRow = Array.from({ length: maxCols }, (_, colIdx) => row[colIdx] !== undefined && row[colIdx] !== null ? row[colIdx] : '');
            emails.push({
              email: cleanEmail,
              originalRow: alignedRow,
              occurrences: emailCounts[lowerEmail] || 1
            });
          }
        }
      }
    }

    return { emails, csvHeaders };
  };

  const addFiles = (files: FileList) => {
    const validFiles: File[] = [];
    let ignoredCount = 0;
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.name.endsWith('.csv') || file.name.endsWith('.txt')) {
        validFiles.push(file);
      } else {
        ignoredCount++;
      }
    }

    if (ignoredCount > 0) {
      setErrorMessage(`Ignored ${ignoredCount} file(s) because they are not .csv or .txt format.`);
    }

    setSelectedFiles(prev => {
      const combined = [...prev, ...validFiles];
      if (combined.length > 10) {
        setErrorMessage('Maximum 10 files can be uploaded at a single time. Kept the first 10 files.');
        return combined.slice(0, 10);
      }
      return combined;
    });
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragActive(true);
    } else if (e.type === "dragleave") {
      setIsDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    setErrorMessage('');
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMessage('');
    if (e.target.files && e.target.files.length > 0) {
      addFiles(e.target.files);
    }
  };

  const readFileAsText = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => resolve(event.target?.result as string);
      reader.onerror = () => reject(new Error(`Failed to read file ${file.name}`));
      reader.readAsText(file);
    });
  };

  const processFilesQueue = async (files: File[]) => {
    setIsLoading(true);
    setErrorMessage('');
    
    // Initialize file statuses
    const initialStatuses: { [fileName: string]: 'pending' | 'verifying' | 'success' | 'failed' } = {};
    files.forEach(f => {
      initialStatuses[f.name] = 'pending';
    });
    setFileStatuses(initialStatuses);

    let succeededCampaigns = 0;
    const failedFiles: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setCurrentFileIndex(i);
      setFileStatuses(prev => ({ ...prev, [file.name]: 'verifying' }));
      setProgress(10);
      setStatusText(`Parsing ${file.name}...`);

      const interval = setInterval(() => {
        setProgress(prev => {
          if (prev < 45) {
            setStatusText(`[File ${i + 1}/${files.length}] Handshaking SMTP/DNS for ${file.name}...`);
            return prev + 12;
          }
          if (prev < 75) {
            setStatusText(`[File ${i + 1}/${files.length}] Checking disposable & role-based emails...`);
            return prev + 8;
          }
          if (prev < 90) {
            setStatusText(`[File ${i + 1}/${files.length}] Correcting potential typos...`);
            return prev + 4;
          }
          return prev;
        });
      }, 450);

      try {
        const text = await readFileAsText(file);
        const { emails, csvHeaders } = parseCSVFull(text);

        if (emails.length === 0) {
          throw new Error('No valid emails found in file');
        }

        // Custom individual list names
        const campaignName = listName.trim() 
          ? `${listName.trim()} - ${file.name.replace(/\.[^/.]+$/, "")}`
          : file.name.replace(/\.[^/.]+$/, "");

        const payload = {
          emails,
          name: campaignName,
          csvHeaders
        };

        const response = await fetch('/api/verify', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
          },
          body: JSON.stringify(payload),
        });

        clearInterval(interval);
        setProgress(95);
        setStatusText(`Finalizing statistics for ${file.name}...`);

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Verification failed on server');
        }

        const campaign = await response.json();
        
        onVerificationComplete(campaign);
        succeededCampaigns++;
        setFileStatuses(prev => ({ ...prev, [file.name]: 'success' }));
        setProgress(100);

      } catch (err: any) {
        clearInterval(interval);
        console.error(`Error verifying file ${file.name}:`, err);
        setFileStatuses(prev => ({ ...prev, [file.name]: 'failed' }));
        failedFiles.push(file.name);
      }

      // Small pause between processing individual files
      await new Promise(resolve => setTimeout(resolve, 850));
    }

    setIsLoading(false);
    setProgress(0);
    setCurrentFileIndex(-1);

    if (failedFiles.length > 0) {
      setErrorMessage(`Verification batch finished. Succeeded: ${succeededCampaigns}. Failed files: ${failedFiles.join(', ')}`);
      // Keep only failed files in selection for inspection
      setSelectedFiles(prev => prev.filter(f => failedFiles.includes(f.name)));
    } else {
      setSelectedFiles([]);
      setListName('');
    }
  };

  const triggerVerification = async (emails: any[], csvHeaders?: string[]) => {
    if (emails.length === 0) {
      setErrorMessage('No emails found to verify.');
      return;
    }

    setIsLoading(true);
    setErrorMessage('');
    setProgress(15);
    setStatusText('Parsing list payload...');

    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev < 45) {
          setStatusText('Initiating direct SMTP & DNS MX Record handshakes...');
          return prev + 12;
        }
        if (prev < 75) {
          setStatusText('Scanning for Disposable Domains & Role-based accounts...');
          return prev + 8;
        }
        if (prev < 90) {
          setStatusText('Checking domain status and keyboard typos...');
          return prev + 4;
        }
        return prev;
      });
    }, 450);

    try {
      const payload = {
        emails,
        name: listName.trim() || undefined,
        csvHeaders
      };

      const response = await fetch('/api/verify', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify(payload),
      });

      clearInterval(interval);
      setProgress(95);
      setStatusText('Processing final campaign metrics...');

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Verification failed on server');
      }

      const campaign = await response.json();
      setProgress(100);
      setStatusText('Success!');
      
      setTimeout(() => {
        onVerificationComplete(campaign);
        setIsLoading(false);
        setProgress(0);
        setSelectedFiles([]);
        setPastedEmails('');
        setListName('');
      }, 500);

    } catch (err: any) {
      clearInterval(interval);
      setIsLoading(false);
      setProgress(0);
      setErrorMessage(err.message || 'Verification service failed. Please try again.');
    }
  };

  const handleVerifyClick = () => {
    setErrorMessage('');
    if (activeTab === 'csv') {
      if (selectedFiles.length === 0) {
        setErrorMessage('Please select at least one CSV or Text file.');
        return;
      }
      processFilesQueue(selectedFiles);
    } else {
      if (!pastedEmails.trim()) {
        setErrorMessage('Please paste at least one email address.');
        return;
      }
      
      const rawEmails = pastedEmails
        .split(/[\n,;\t]+/)
        .map(e => e.trim())
        .filter(e => e.length > 0 && e.includes('@'));
      
      const seenPasted = new Set<string>();
      const emails: string[] = [];
      for (const e of rawEmails) {
        const lower = e.toLowerCase();
        if (!seenPasted.has(lower)) {
          seenPasted.add(lower);
          emails.push(e);
        }
      }
      
      triggerVerification(emails);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
      
      {/* Tab Navigation */}
      <div className="flex border-b border-slate-200 bg-slate-50/50">
        <button
          onClick={() => { setActiveTab('csv'); setErrorMessage(''); }}
          className={`flex-1 py-4 text-xs font-semibold uppercase tracking-wider flex items-center justify-center gap-2 border-b-2 transition-all cursor-pointer ${
            activeTab === 'csv'
              ? 'border-blue-600 text-blue-600 bg-white'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Layers className="w-4 h-4 text-blue-600" />
          Bulk CSV / TXT Upload
        </button>
        <button
          onClick={() => { setActiveTab('paste'); setErrorMessage(''); }}
          className={`flex-1 py-4 text-xs font-semibold uppercase tracking-wider flex items-center justify-center gap-2 border-b-2 transition-all cursor-pointer ${
            activeTab === 'paste'
              ? 'border-blue-600 text-blue-600 bg-white'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Clipboard className="w-4 h-4 text-blue-600" />
          Paste Email List
        </button>
      </div>

      <div className="p-6 space-y-5">
        
        {/* Campaign Name Input */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
            Campaign Prefix / Name <span className="text-slate-400 font-normal">(Optional)</span>
          </label>
          <input
            type="text"
            placeholder={activeTab === 'csv' && selectedFiles.length > 0 ? (selectedFiles.length === 1 ? selectedFiles[0].name.replace(/\.[^/.]+$/, "") : `${selectedFiles.length} Lists Selected`) : "E.g., Q3 Marketing Newsletter"}
            value={listName}
            onChange={(e) => setListName(e.target.value)}
            disabled={isLoading}
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-100 focus:border-blue-500 disabled:bg-slate-50 disabled:text-slate-400"
          />
        </div>

        {/* Tab 1: CSV Drag & Drop */}
        {activeTab === 'csv' && (
          <div className="space-y-4">
            <div
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              onClick={() => !isLoading && fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-7 flex flex-col items-center justify-center gap-3 transition-all cursor-pointer group ${
                isLoading ? 'bg-slate-50 border-slate-200 cursor-not-allowed opacity-60' :
                isDragActive ? 'border-blue-500 bg-blue-50/40' :
                selectedFiles.length > 0 ? 'border-blue-300 bg-blue-50/10 hover:bg-blue-50/20' :
                'border-slate-200 hover:border-blue-400 bg-slate-50/30'
              }`}
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".csv,.txt"
                multiple
                className="hidden"
                disabled={isLoading}
              />
              
              <div className={`p-4 rounded-full transition-transform group-hover:scale-105 ${selectedFiles.length > 0 ? 'bg-blue-100/70 text-blue-600' : 'bg-blue-50 text-blue-600'}`}>
                {selectedFiles.length > 0 ? <Files className="w-8 h-8" /> : <Upload className="w-8 h-8" />}
              </div>

              <div className="text-center">
                <p className="text-sm font-semibold text-slate-800 font-display">
                  {selectedFiles.length > 0 ? `Add more CSVs to queue (${selectedFiles.length} selected)` : 'Upload multiple CSVs for bulk verification'}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Drop up to 10 CSV or TXT files here or click to browse
                </p>
              </div>
            </div>

            {/* File Queue Section */}
            {selectedFiles.length > 0 && (
              <div className="space-y-2.5">
                <div className="flex justify-between items-center px-1">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    File Queue ({selectedFiles.length} / 10)
                  </span>
                  {!isLoading && (
                    <button
                      onClick={() => setSelectedFiles([])}
                      className="text-[10px] uppercase tracking-wider font-bold text-rose-500 hover:text-rose-700 transition-colors cursor-pointer"
                    >
                      Clear All
                    </button>
                  )}
                </div>
                
                <div className="max-h-56 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                  {selectedFiles.map((file, idx) => {
                    const status = fileStatuses[file.name] || 'pending';
                    const isCurrent = currentFileIndex === idx;
                    
                    return (
                      <div 
                        key={`${file.name}-${idx}`} 
                        className={`p-3 rounded-xl border flex items-center justify-between transition-all ${
                          isCurrent 
                            ? 'bg-blue-50/60 border-blue-200 shadow-xs' 
                            : status === 'success' 
                              ? 'bg-emerald-50/30 border-emerald-100' 
                              : status === 'failed' 
                                ? 'bg-rose-50/30 border-rose-100'
                                : 'bg-white border-slate-200'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`p-2 rounded-lg shrink-0 ${
                            isCurrent 
                              ? 'bg-blue-100 text-blue-600 animate-pulse' 
                              : status === 'success' 
                                ? 'bg-emerald-100 text-emerald-600' 
                                : status === 'failed' 
                                  ? 'bg-rose-100 text-rose-600'
                                  : 'bg-slate-100 text-slate-500'
                          }`}>
                            <FileText className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-slate-700 truncate max-w-[180px] sm:max-w-[260px]">
                              {file.name}
                            </p>
                            <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                              {(file.size / 1024).toFixed(1)} KB
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {status === 'verifying' && (
                            <span className="text-[10px] font-bold text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full animate-pulse">
                              Verifying
                            </span>
                          )}
                          {status === 'success' && (
                            <span className="text-[10px] font-bold text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full flex items-center gap-0.5">
                              <Check className="w-3 h-3" /> Done
                            </span>
                          )}
                          {status === 'failed' && (
                            <span className="text-[10px] font-bold text-rose-600 bg-rose-100 px-2 py-0.5 rounded-full">
                              Failed
                            </span>
                          )}
                          {status === 'pending' && (
                            <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                              Queued
                            </span>
                          )}

                          {!isLoading && (
                            <button
                              onClick={() => {
                                setSelectedFiles(prev => prev.filter((_, i) => i !== idx));
                              }}
                              className="p-1 text-slate-400 hover:text-rose-500 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
                              title="Remove from queue"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Clipboard Paste */}
        {activeTab === 'paste' && (
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
              Paste Email Addresses
            </label>
            <textarea
              placeholder="alex@gmail.com&#10;sarah@apple.com&#10;support@startup.co, user@10minutemail.com"
              rows={6}
              value={pastedEmails}
              onChange={(e) => setPastedEmails(e.target.value)}
              disabled={isLoading}
              className="w-full px-4 py-3 rounded-2xl border border-slate-200 text-sm font-mono placeholder:font-sans focus:outline-hidden focus:ring-2 focus:ring-blue-100 focus:border-blue-500 disabled:bg-slate-50 disabled:text-slate-400"
            />
            <p className="text-[10px] text-slate-400 mt-1">
              Supports emails separated by commas, semicolons, tabs, or line breaks.
            </p>
          </div>
        )}

        {/* Error Notification */}
        {errorMessage && (
          <div className="p-3.5 bg-rose-50 border border-rose-100 rounded-xl flex items-start gap-2.5 text-rose-700 text-xs font-medium">
            <AlertCircle className="w-4.5 h-4.5 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Action Button & Progress */}
        {isLoading ? (
          <div className="space-y-3 pt-2">
            <div className="flex justify-between items-center text-xs font-semibold">
              <span className="text-slate-600 animate-pulse">{statusText}</span>
              <span className="text-blue-600 font-mono font-bold">{progress}%</span>
            </div>
            
            {/* Custom animated progress bar */}
            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
              <div 
                className="h-full bg-blue-600 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
            
            <p className="text-[10px] text-slate-400 text-center italic">
              Verifying records. Standard checks run in batches to prevent server overload.
            </p>
          </div>
        ) : (
          <button
            onClick={handleVerifyClick}
            className="w-full bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 px-5 py-3 rounded-xl font-semibold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm hover:shadow-blue-100 hover:shadow-md"
          >
            <Play className="w-4 h-4 fill-current" />
            {activeTab === 'csv' && selectedFiles.length > 1 
              ? `Start Batch Verification (${selectedFiles.length} Lists)` 
              : 'Start Verification Clean'
            }
          </button>
        )}

      </div>
    </div>
  );
}
