import { AnalyzeRequirementDto } from "../dto/analyze-requirement.dto";

export enum FeaturePriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export interface Feature {
  name: string;
  description: string;
  priority: FeaturePriority;
}

export interface Entity {
  name: string;
  attributes: string[];
  relationships: string[];
}

export enum ConstraintType {
  TECHNICAL = 'technical',
  BUSINESS = 'business',
  SECURITY = 'security',
}

export interface Constraint {
  type: ConstraintType;
  description: string;
}

export interface TechnicalStack {
  frontend: string[];
  backend: string[];
  database: string[];
  devops: string[];
}

export interface AnalysisResult {
  features: Feature[];
  entities: Entity[];
  constraints: Constraint[];
  technicalStack: TechnicalStack;
  metadata?: Record<string, any>;
}

export interface RequirementAnalysisService {
  analyzeRequirement(requirement: AnalyzeRequirementDto): Promise<Record<string, any>>;
}
