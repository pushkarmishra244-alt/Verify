export interface EmailVerificationResult {
  email: string;
  status: 'valid' | 'invalid' | 'risky';
  score: number; // 0 - 100
  syntax: {
    valid: boolean;
    error?: string;
  };
  domain: {
    valid: boolean;
    hasMx: boolean;
    error?: string;
  };
  disposable: boolean;
  roleBased: boolean;
  typoSuggestion?: string;
  originalRow?: string[];
}

export interface Campaign {
  id: string;
  name: string;
  createdAt: string;
  totalCount: number;
  validCount: number;
  invalidCount: number;
  riskyCount: number;
  emails: EmailVerificationResult[];
  aiSummary?: string;
  deliverabilityScore: number; // overall percentage
  csvHeaders?: string[];
}

export interface VerificationSummary {
  total: number;
  valid: number;
  invalid: number;
  risky: number;
  disposable: number;
  roleBased: number;
  syntaxErrors: number;
  domainErrors: number;
  typoCount: number;
}
