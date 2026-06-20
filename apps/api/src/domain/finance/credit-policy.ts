export type RiskBand = 'A' | 'B' | 'C' | 'D' | 'E';
export type PolicyDecision = 'APPROVED' | 'REJECTED' | 'MANUAL_REVIEW';

export interface PolicyConfig {
  version: string;
  /** Max income commitment (installment / income) for automatic approval. */
  maxCommitmentApprove: number;
  /** Above this commitment the proposal is auto-rejected. */
  maxCommitmentReject: number;
  /** Score thresholds for risk banding (inclusive lower bounds). */
  bands: { A: number; B: number; C: number; D: number };
  /** Minimum score for automatic approval. */
  minScoreApprove: number;
  /** Below this score the proposal is auto-rejected. */
  minScoreReject: number;
  /** Limit = monthlyIncome * factor[band]. */
  limitIncomeFactor: Record<RiskBand, number>;
}

export const DEFAULT_POLICY: PolicyConfig = {
  version: 'policy-2026.06',
  maxCommitmentApprove: 0.3,
  maxCommitmentReject: 0.45,
  bands: { A: 800, B: 680, C: 560, D: 420 },
  minScoreApprove: 680,
  minScoreReject: 420,
  limitIncomeFactor: { A: 12, B: 8, C: 5, D: 3, E: 1 },
};

export interface PolicyInput {
  internalScore: number; // 0-1000
  monthlyIncome: number; // reais
  requestedAmount: number; // reais
  installmentAmount: number; // reais (reference installment)
  termMonths: number;
  ageYears?: number;
  hasActiveDelinquency?: boolean;
}

export interface PolicyResult {
  decision: PolicyDecision;
  score: number;
  riskBand: RiskBand;
  suggestedLimit: number;
  approvedAmount: number | null;
  commitmentRatio: number;
  reasons: string[];
  policyVersion: string;
}

function bandForScore(score: number, cfg: PolicyConfig): RiskBand {
  if (score >= cfg.bands.A) return 'A';
  if (score >= cfg.bands.B) return 'B';
  if (score >= cfg.bands.C) return 'C';
  if (score >= cfg.bands.D) return 'D';
  return 'E';
}

/**
 * Deterministic, explainable credit decision engine.
 * Returns a decision plus the reasons that drove it (for the audit trail).
 */
export function evaluateCredit(input: PolicyInput, cfg: PolicyConfig = DEFAULT_POLICY): PolicyResult {
  const reasons: string[] = [];
  let score = Math.max(0, Math.min(1000, input.internalScore));

  const commitmentRatio =
    input.monthlyIncome > 0 ? input.installmentAmount / input.monthlyIncome : 1;

  // --- Score adjustments ---
  if (commitmentRatio <= 0.15) {
    score += 40;
    reasons.push('Baixo comprometimento de renda (<= 15%): +40 no score.');
  } else if (commitmentRatio > cfg.maxCommitmentApprove) {
    score -= 80;
    reasons.push(
      `Comprometimento de renda elevado (${(commitmentRatio * 100).toFixed(1)}%): -80 no score.`,
    );
  }

  if (input.ageYears != null && input.ageYears < 21) {
    score -= 30;
    reasons.push('Cliente com menos de 21 anos: -30 no score.');
  }

  if (input.monthlyIncome <= 0) {
    score -= 150;
    reasons.push('Renda não informada ou igual a zero: -150 no score.');
  }

  if (input.hasActiveDelinquency) {
    score -= 200;
    reasons.push('Cliente possui contrato inadimplente ativo: -200 no score.');
  }

  score = Math.max(0, Math.min(1000, score));
  const riskBand = bandForScore(score, cfg);
  const suggestedLimit = Math.round(input.monthlyIncome * cfg.limitIncomeFactor[riskBand]);

  // --- Decision ---
  let decision: PolicyDecision;
  if (input.hasActiveDelinquency) {
    decision = 'REJECTED';
    reasons.push('Recusa automática: inadimplência ativa.');
  } else if (score < cfg.minScoreReject || commitmentRatio > cfg.maxCommitmentReject) {
    decision = 'REJECTED';
    reasons.push(
      `Recusa automática: score (${score}) abaixo de ${cfg.minScoreReject} ou comprometimento acima de ${(
        cfg.maxCommitmentReject * 100
      ).toFixed(0)}%.`,
    );
  } else if (
    score >= cfg.minScoreApprove &&
    commitmentRatio <= cfg.maxCommitmentApprove &&
    input.requestedAmount <= suggestedLimit
  ) {
    decision = 'APPROVED';
    reasons.push(
      `Aprovação automática: score ${score} (faixa ${riskBand}) e comprometimento ${(
        commitmentRatio * 100
      ).toFixed(1)}% dentro da política.`,
    );
  } else {
    decision = 'MANUAL_REVIEW';
    if (input.requestedAmount > suggestedLimit) {
      reasons.push(
        `Valor solicitado (R$ ${input.requestedAmount.toFixed(
          2,
        )}) acima do limite sugerido (R$ ${suggestedLimit.toFixed(2)}): análise manual.`,
      );
    } else {
      reasons.push('Indicadores intermediários: encaminhado para análise manual.');
    }
  }

  const approvedAmount =
    decision === 'APPROVED' ? Math.min(input.requestedAmount, suggestedLimit) : null;

  return {
    decision,
    score,
    riskBand,
    suggestedLimit,
    approvedAmount,
    commitmentRatio,
    reasons,
    policyVersion: cfg.version,
  };
}
