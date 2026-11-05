export interface User {
  id: number;
  email: string;
  full_name?: string;
  role: "user" | "admin";
  is_active: boolean;
  preferences?: {
    favorite_categories?: string[];
    favorite_sources?: string[];
    only_verified?: boolean;
  };
  created_at: string;
}

export interface TrustScoreBreakdown {
  score: number;
  verdict: "Verified" | "Caution" | "Suspicious" | "High Risk" | string;
  stylometry_score: number;
  source_reputation_score: number;
  ml_authenticity_score: number;
  corroboration_score: number;
  fact_check_flag: boolean;
  manipulation_markers: string[];
  explanation: string;
}

export interface Article {
  id: number;
  title: string;
  url: string;
  source_name: string;
  domain: string;
  summary?: string;
  author?: string;
  language: string;
  category: string;
  published_at: string;
  image_url?: string;
  trust_score: number;
  verdict: string;
  created_at: string;
  is_bookmarked?: boolean;
}

export interface NewsFeedResponse {
  total: number;
  page: number;
  page_size: number;
  items: Article[];
}

export interface HistoryItem {
  id: number;
  user_id: number;
  query_type: "url" | "text";
  query_preview: string;
  trust_score: number;
  verdict: string;
  analysis_id?: number;
  created_at: string;
}

export interface Source {
  id: number;
  name: string;
  domain: string;
  homepage_url?: string;
  language: string;
  country: string;
  reliability_rating: number;
  is_whitelisted: boolean;
  is_blacklisted: boolean;
  created_at: string;
}

export interface FactCheckClaim {
  id: number;
  claim: string;
  claimant?: string;
  fact_checker: string;
  review_url: string;
  rating: string;
  explanation?: string;
  language: string;
  published_at?: string;
  created_at: string;
}

export interface FactCheckListResponse {
  total: number;
  items: FactCheckClaim[];
}

