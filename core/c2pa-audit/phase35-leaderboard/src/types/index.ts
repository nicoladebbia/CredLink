/**
 * Phase 35 Public Survival Leaderboard - Type Definitions
 * C2PA Content Credentials preservation testing framework
 */

// Core scoring and testing types
export interface VerificationConfig {
  tool: string;
  version: string;
  timeout: number;
  retries: number;
}

export interface LeaderboardConfig {
  version: string;
  runDate: Date;
  testAssets: TestAsset[];
  vendors: Vendor[];
  scoring: ScoringConfig;
  verification: VerificationConfig;
}

export interface TestAsset {
  id: string;
  filename: string;
  format: 'jpeg' | 'png' | 'webp' | 'avif';
  size: number;
  signed: boolean;
  remoteManifest: boolean;
  contentHash: string;
  manifestHash: string;
  url: string;
}

export interface Vendor {
  id: string;
  name: string;
  type: 'cdn' | 'cms';
  category: string;
  website: string;
  docsUrl: string;
  supportUrl?: string;
  logoUrl: string;
  testing: VendorTesting;
  scoring?: VendorScoring;
}

export interface VendorTesting {
  endpoints: TestEndpoint[];
  transforms: Transform[];
  preserveToggle?: PreserveToggle;
  auth?: AuthConfig;
  rateLimit?: RateLimitConfig;
}

export interface TestEndpoint {
  id: string;
  name: string;
  baseUrl: string;
  defaultParams: Record<string, string>;
  headers?: Record<string, string>;
  method?: 'GET' | 'POST';
}

export interface Transform {
  id: string;
  name: string;
  params: Record<string, string>;
  description: string;
  expectedBehavior: 'preserve' | 'strip' | 'modify';
}

export interface PreserveToggle {
  name: string;
  description: string;
  param: string;
  value: string;
  docsUrl: string;
}

export interface AuthConfig {
  type: 'apikey' | 'bearer' | 'basic' | 'none';
  credentials?: Record<string, string>;
}

export interface RateLimitConfig {
  requestsPerSecond: number;
  burstLimit: number;
  backoffMs: number;
}

export interface VendorScoring {
  defaultScore: number;
  bestPracticeScore: number;
  dimensions: ScoreDimension[];
  lastUpdated: Date;
  grade: 'green' | 'yellow' | 'red';
  improvementPath: string[];
}

export interface ScoreDimension {
  name: string;
  points: number;
  weight: number;
  description: string;
  result?: TestResult;
}

export interface TestResult {
  passed: boolean;
  score: number;
  details: ResultDetails;
  evidence: Evidence[];
}

export interface ResultDetails {
  embeddedManifest: boolean;
  remoteManifest: boolean;
  discoveryReliability: boolean;
  docsAlignment: boolean;
  reproducibility: boolean;
  latency: number;
  errorCount: number;
}

export interface Evidence {
  type: 'screenshot' | 'headers' | 'verify-output' | 'hash' | 'curl-command';
  content: string;
  timestamp: Date;
  url?: string;
}

// Test execution types
export interface TestExecution {
  id: string;
  vendorId: string;
  assetId: string;
  transformId: string;
  config: 'default' | 'best-practice';
  timestamp: Date;
  duration: number;
  result: ExecutionResult;
  artifacts: Artifact[];
}

export interface ExecutionResult {
  success: boolean;
  statusCode: number;
  headers: Record<string, string>;
  contentType: string;
  contentLength: number;
  contentHash: string;
  verifyResult: VerifyResult;
  discoveryResult: DiscoveryResult;
  errors: string[];
}

export interface VerifyResult {
  manifestFound: boolean;
  manifestType: 'embedded' | 'remote' | 'none';
  manifestValid: boolean;
  manifestHash?: string;
  signatureValid: boolean;
  assertions: Assertion[];
  tool: string;
  version: string;
  output: string;
}

export interface Assertion {
  label: string;
  type: string;
  data: any;
  validated: boolean;
}

export interface DiscoveryResult {
  linkHeaderFound: boolean;
  linkHeaderValue?: string;
  manifestAccessible: boolean;
  manifestUrl?: string;
  discoveryLatency: number;
  mixedContent: boolean;
}

export interface Artifact {
  type: 'original' | 'transformed' | 'verify-output' | 'headers' | 'curl-log';
  filename: string;
  path: string;
  hash: string;
  size: number;
  url?: string;
}

// Scoring rubric types
export interface ScoringConfig {
  maxPoints: number;
  dimensions: ScoringDimension[];
  grading: GradingConfig;
  tieBreakers: TieBreakerConfig[];
}

export interface ScoringDimension {
  id: string;
  name: string;
  maxPoints: number;
  weight: number;
  description: string;
  testType: 'binary' | 'scaled' | 'threshold';
}

export interface GradingConfig {
  greenThreshold: number;
  yellowThreshold: number;
  redThreshold: number;
}

export interface TieBreakerConfig {
  id: string;
  name: string;
  description: string;
  priority: number;
}

// Data pipeline types
export interface LeaderboardData {
  run: RunMetadata;
  vendors: VendorData[];
  summary: SummaryStats;
  artifacts: DataArtifact[];
}

export interface RunMetadata {
  id: string;
  version: string;
  timestamp: Date;
  commitHash: string;
  testEnvironment: TestEnvironment;
  duration: number;
  status: 'running' | 'completed' | 'failed';
}

export interface TestEnvironment {
  nodeVersion: string;
  c2paToolVersion: string;
  verifyToolVersion: string;
  os: string;
  arch: string;
  memory: number;
  cpu: string;
}

export interface VendorData {
  vendor: Vendor;
  executions: TestExecution[];
  scores: VendorScores;
  trends: ScoreTrend[];
}

export interface VendorScores {
  default: number;
  bestPractice: number;
  dimensions: DimensionScore[];
  grade: Grade;
  improvement: ImprovementMetrics;
}

export interface DimensionScore {
  dimensionId: string;
  defaultScore: number;
  bestPracticeScore: number;
  change: number;
}

export interface Grade {
  default: 'green' | 'yellow' | 'red';
  bestPractice: 'green' | 'yellow' | 'red';
}

export interface ImprovementMetrics {
  configChangesNeeded: number;
  estimatedTimeMinutes: number;
  difficulty: 'easy' | 'medium' | 'hard';
  prerequisites: string[];
}

export interface ScoreTrend {
  date: Date;
  defaultScore: number;
  bestPracticeScore: number;
  changeReason: string;
}

export interface SummaryStats {
  totalVendors: number;
  totalTests: number;
  averageDefaultScore: number;
  averageBestPracticeScore: number;
  greenVendors: number;
  yellowVendors: number;
  redVendors: number;
  testDuration: number;
}

export interface DataArtifact {
  type: 'ndjson' | 'verify-output' | 'screenshots' | 'logs' | 'raw-data';
  filename: string;
  path: string;
  hash: string;
  downloadUrl: string;
  size: number;
}

// Web interface types
export interface LeaderboardPage {
  title: string;
  description: string;
  lastUpdated: Date;
  vendors: VendorCard[];
  filters: FilterConfig[];
  sortBy: SortConfig[];
}

export interface VendorCard {
  vendor: Vendor;
  scores: VendorScores;
  lastTested: Date;
  status: 'current' | 'outdated' | 'testing';
  actions: CardAction[];
}

export interface CardAction {
  type: 'view-details' | 'get-green' | 'reproduce' | 'download-data';
  label: string;
  url: string;
  icon?: string;
}

export interface FilterConfig {
  id: string;
  name: string;
  type: 'select' | 'multiselect' | 'range' | 'toggle';
  options: FilterOption[];
}

export interface FilterOption {
  value: string;
  label: string;
  count: number;
}

export interface SortConfig {
  id: string;
  name: string;
  field: string;
  direction: 'asc' | 'desc';
}

// Correction and retest types
export interface CorrectionSubmission {
  id: string;
  vendorId: string;
  submitterInfo: SubmitterInfo;
  correctionType: 'docs' | 'config' | 'behavior' | 'other';
  description: string;
  evidence: Evidence[];
  proposedConfig?: Record<string, string>;
  docUrls: string[];
  testUrls: string[];
  submittedAt: Date;
  status: 'pending' | 'reviewed' | 'accepted' | 'rejected' | 'retested';
  reviewNotes?: string;
  retestDate?: Date;
}

export interface SubmitterInfo {
  name: string;
  email: string;
  company?: string;
  role?: string;
}

export interface RetestResult {
  correctionId: string;
  originalScore: number;
  newScore: number;
  improvement: number;
  evidence: Evidence[];
  timestamp: Date;
  published: boolean;
}

// Playbook types
export interface Playbook {
  vendorId: string;
  vendorName: string;
  category: string;
  currentScore: number;
  targetScore: number;
  estimatedTimeMinutes: number;
  difficulty: 'easy' | 'medium' | 'hard';
  steps: PlaybookStep[];
  prerequisites: string[];
  verification: VerificationStep[];
  resources: Resource[];
}

export interface PlaybookStep {
  id: string;
  order: number;
  title: string;
  description: string;
  type: 'config' | 'code' | 'ui' | 'api' | 'documentation';
  content: string;
  expectedOutcome: string;
  verification: string;
  estimatedMinutes: number;
}

export interface VerificationStep {
  title: string;
  command: string;
  expectedOutput: string;
  successCriteria: string;
}

export interface Resource {
  type: 'documentation' | 'tool' | 'example' | 'support';
  title: string;
  url: string;
  description: string;
}

// API response types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: Date;
  requestId: string;
}

export interface LeaderboardResponse extends ApiResponse<LeaderboardData> {}

export interface VendorResponse extends ApiResponse<VendorData> {}

export interface PlaybookResponse extends ApiResponse<Playbook> {}

export interface CorrectionResponse extends ApiResponse<CorrectionSubmission> {}
