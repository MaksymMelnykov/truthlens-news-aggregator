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

export interface XAITokenContribution {
  token: string;
  weight: number;
  direction: "fake_indicator" | "real_indicator" | string;
}

export interface CorroboratingArticleItem {
  id: number;
  title: string;
  url: string;
  source_name: string;
  domain: string;
  trust_score: number;
  verdict: string;
  similarity: number;
  is_whitelisted: boolean;
  published_at?: string;
}

export interface SemanticFactCheckMatch {
  id: number;
  claim_text: string;
  verdict: string;
  rating: string;
  explanation?: string;
  source_url?: string;
  fact_checker: string;
  similarity: number;
}

export interface XAIReasoningStep {
  step: number;
  component: string;
  score: number;
  status: "good" | "warning" | "danger" | "neutral" | string;
  summary: string;
}

export interface SentenceAnalysisItem {
  index: number;
  sentence: string;
  score: number;
  status: "factual" | "neutral" | "manipulative" | string;
  reason: string;
  is_headline?: boolean;
}

export interface AttributionAnalysis {
  status: "verified" | "unverified" | "mixed" | "neutral" | string;
  attribution_score: number;
  verified_entities: string[];
  unverified_claims: string[];
  direct_quotes_count: number;
  reporting_verbs_count: number;
  summary: string;
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
  models_breakdown?: Record<string, number>;
  xai_top_tokens?: XAITokenContribution[];
  corroborating_articles?: CorroboratingArticleItem[];
  corroboration_summary?: string;
  matched_fact_checks?: SemanticFactCheckMatch[];
  xai_reasoning_steps?: XAIReasoningStep[];
  sentence_analysis?: SentenceAnalysisItem[];
  attribution_analysis?: AttributionAnalysis;
}

export interface ArticleDetail extends Article {
  full_text: string;
  trust_breakdown: TrustScoreBreakdown;
  similar_articles: Article[];
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

