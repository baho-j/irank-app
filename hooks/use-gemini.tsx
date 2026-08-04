import { useState, useCallback } from 'react';
import { useAction } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { useAuth } from '@/hooks/use-auth';

interface ValidationResult {
  isAppropriate: boolean;
  issues?: string[];
  suggestions?: string[];
  confidence: number;
}

interface FactCheckResult {
  isValid: boolean;
  result: 'true' | 'false' | 'partially_true' | 'inconclusive';
  sources?: string[];
  explanation?: string;
  confidence: number;
}

interface BiasCheckResult {
  hasBias: boolean;
  biasType?: string[];
  suggestions?: string[];
  confidence: number;
}

interface GeminiError {
  code: string;
  message: string;
  isRetryable: boolean;
}

const clampConfidence = (value: unknown) =>
  Math.min(Math.max(typeof value === 'number' ? value : 0.5, 0), 1);

export function useGemini() {
  const { token } = useAuth();

  const [isValidating, setIsValidating] = useState(false);
  const [isFactChecking, setIsFactChecking] = useState(false);
  const [isBiasChecking, setIsBiasChecking] = useState(false);
  const [lastValidation, setLastValidation] = useState<ValidationResult | null>(null);
  const [lastFactCheck, setLastFactCheck] = useState<FactCheckResult | null>(null);
  const [lastBiasCheck, setLastBiasCheck] = useState<BiasCheckResult | null>(null);

  const runValidateFeedback = useAction(api.functions.ai.validateFeedback);
  const runFactCheckClaim = useAction(api.functions.ai.factCheckClaim);
  const runCheckBias = useAction(api.functions.ai.checkBias);

  const handleGeminiError = useCallback((error: any): GeminiError => {
    console.error('Gemini API error:', error);

    const message: string = error?.message ?? '';

    if (/not configured/i.test(message)) {
      return {
        code: 'NOT_CONFIGURED',
        message: 'AI assistance is not configured - continuing without it',
        isRetryable: false,
      };
    }

    if (/authentication required/i.test(message)) {
      return {
        code: 'UNAUTHENTICATED',
        message: 'Sign in again to use AI assistance',
        isRetryable: false,
      };
    }

    if (/rate limit|quota|429/i.test(message)) {
      return {
        code: 'RATE_LIMITED',
        message: 'Rate limit exceeded - please try again later',
        isRetryable: true,
      };
    }

    if (/did not contain JSON|Empty response|JSON/i.test(message)) {
      return {
        code: 'INVALID_RESPONSE',
        message: 'Unexpected AI response - continuing without AI assistance',
        isRetryable: true,
      };
    }

    return {
      code: 'UNKNOWN_ERROR',
      message: 'AI service unavailable - continuing without AI assistance',
      isRetryable: true,
    };
  }, []);

  const validateFeedback = useCallback(async (
    feedback: string,
    speakerComments: Record<string, string> = {},
    judgeNotes: string = ''
  ): Promise<ValidationResult> => {
    const allComments = Object.values(speakerComments).join('\n');
    const combinedFeedback = `${feedback}\n${allComments}\n${judgeNotes}`.trim();

    if (!combinedFeedback) {
      return { isAppropriate: true, confidence: 1 };
    }

    setIsValidating(true);

    try {
      if (!token) {
        throw new Error('Authentication required');
      }

      const validation = await runValidateFeedback({ token, content: combinedFeedback });

      const finalResult: ValidationResult = {
        isAppropriate: validation.isAppropriate ?? true,
        confidence: clampConfidence(validation.confidence),
        issues: validation.issues ?? [],
        suggestions: validation.suggestions ?? [],
      };

      setLastValidation(finalResult);
      return finalResult;
    } catch (error: any) {
      const geminiError = handleGeminiError(error);

      const fallbackResult = performFallbackValidation(feedback, speakerComments, judgeNotes);
      setLastValidation(fallbackResult);

      console.warn(`Gemini validation failed (${geminiError.code}): ${geminiError.message}`);
      return fallbackResult;
    } finally {
      setIsValidating(false);
    }
  }, [token, runValidateFeedback, handleGeminiError]);

  const factCheckClaim = useCallback(async (
    claim: string,
    context?: string
  ): Promise<FactCheckResult> => {
    setIsFactChecking(true);

    try {
      if (!token) {
        throw new Error('Authentication required');
      }

      const factCheck = await runFactCheckClaim({ token, claim, context });

      const finalResult: FactCheckResult = {
        isValid: factCheck.result === 'true' || factCheck.result === 'partially_true',
        result: factCheck.result,
        sources: factCheck.sources ?? [],
        explanation: factCheck.explanation,
        confidence: clampConfidence(factCheck.confidence),
      };

      setLastFactCheck(finalResult);
      return finalResult;
    } catch (error: any) {
      const geminiError = handleGeminiError(error);

      const fallbackResult: FactCheckResult = {
        isValid: false,
        result: 'inconclusive',
        explanation: `Unable to verify claim: ${geminiError.message}`,
        confidence: 0,
      };

      setLastFactCheck(fallbackResult);
      console.warn(`Gemini fact-check failed (${geminiError.code}): ${geminiError.message}`);
      return fallbackResult;
    } finally {
      setIsFactChecking(false);
    }
  }, [token, runFactCheckClaim, handleGeminiError]);

  const checkBias = useCallback(async (
    content: string,
    contentType: 'feedback' | 'comment' | 'argument' = 'feedback'
  ): Promise<BiasCheckResult> => {
    setIsBiasChecking(true);

    try {
      if (!token) {
        throw new Error('Authentication required');
      }

      const biasCheck = await runCheckBias({ token, content, content_type: contentType });

      const finalResult: BiasCheckResult = {
        hasBias: biasCheck.hasBias ?? false,
        biasType: biasCheck.biasTypes ?? [],
        suggestions: biasCheck.suggestions ?? [],
        confidence: clampConfidence(biasCheck.confidence),
      };

      setLastBiasCheck(finalResult);
      return finalResult;
    } catch (error: any) {
      const geminiError = handleGeminiError(error);

      const fallbackResult: BiasCheckResult = {
        hasBias: false,
        suggestions: [`Unable to check for bias: ${geminiError.message}`],
        confidence: 0,
      };

      setLastBiasCheck(fallbackResult);
      console.warn(`Gemini bias check failed (${geminiError.code}): ${geminiError.message}`);
      return fallbackResult;
    } finally {
      setIsBiasChecking(false);
    }
  }, [token, runCheckBias, handleGeminiError]);

  return {

    validateFeedback,
    factCheckClaim,
    checkBias,

    isValidating,
    isFactChecking,
    isBiasChecking,

    lastValidation,
    lastFactCheck,
    lastBiasCheck,

    handleGeminiError,
  };
}

export function performFallbackValidation(
  feedback: string,
  speakerComments: Record<string, string>,
  judgeNotes: string
): ValidationResult {
  const combinedText = `${feedback} ${Object.values(speakerComments).join(' ')} ${judgeNotes}`.toLowerCase();

  const inappropriatePatterns = [
    /\b(stupid|idiot|dumb|moron|retard)\b/,
    /\b(hate|despise|disgusting)\b/,
    /\b(ugly|fat|skinny)\b/,
    /\b(shut up|garbage|trash|worthless)\b/,
    /\b(racist|sexist)\b/,
    /\b(kill|die|suicide)\b/,
  ];

  const profanityPatterns = [
    /\b(damn|hell|crap|suck)\b/,
    /f[*\-_]?u[*\-_]?c[*\-_]?k/,
    /s[*\-_]?h[*\-_]?i[*\-_]?t/,
    /b[*\-_]?i[*\-_]?t[*\-_]?c[*\-_]?h/,
  ];

  const issues: string[] = [];
  let isAppropriate = true;

  inappropriatePatterns.forEach(pattern => {
    if (pattern.test(combinedText)) {
      issues.push('Contains inappropriate or offensive language');
      isAppropriate = false;
    }
  });

  profanityPatterns.forEach(pattern => {
    if (pattern.test(combinedText)) {
      issues.push('Contains unprofessional language');
    }
  });

  const negativeWords = combinedText.match(/\b(bad|poor|terrible|awful|horrible|worst|failed|failure)\b/g);
  if (negativeWords && negativeWords.length > 5) {
    issues.push('Feedback appears overly negative - consider more balanced approach');
  }

  return {
    isAppropriate,
    confidence: 0.7,
    issues,
    suggestions: issues.length > 0 ? [
      'Use more constructive and professional language',
      'Focus on specific improvements rather than general criticism',
      'Maintain respectful tone appropriate for educational setting'
    ] : [],
  };
}
