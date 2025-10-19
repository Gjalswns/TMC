/**
 * Year Game utility functions for mathematical expression evaluation
 * New rules: Teams choose 4 numbers, must use ALL numbers with basic operations, nPr, nCr, exponents
 */

export interface YearGameConfig {
  targetNumbers: number[]; // 4 numbers chosen by team (0-9)
  timeLimit: number; // in seconds
  validRange: { min: number; max: number }; // valid result range (1-100)
}

export interface YearGameAttempt {
  expression: string;
  targetNumber: number;
  isValid: boolean;
  isCorrect: boolean;
  isDuplicate: boolean;
  result?: number;
  usedNumbers: number[];
  allNumbersUsed: boolean;
}

/**
 * Generate 4 random numbers between 0-9 for the game (fallback)
 * Teams will choose their own numbers in the new system
 */
export function generateTargetNumbers(): number[] {
  const numbers: number[] = [];
  while (numbers.length < 4) {
    const num = Math.floor(Math.random() * 10);
    if (!numbers.includes(num)) {
      numbers.push(num);
    }
  }
  return numbers.sort((a, b) => a - b);
}

/**
 * Calculate factorial (n!)
 */
function factorial(n: number): number {
  if (n < 0 || !Number.isInteger(n)) return NaN;
  if (n === 0 || n === 1) return 1;
  let result = 1;
  for (let i = 2; i <= n; i++) {
    result *= i;
  }
  return result;
}

/**
 * Calculate permutation (nPr)
 */
function permutation(n: number, r: number): number {
  if (n < 0 || r < 0 || !Number.isInteger(n) || !Number.isInteger(r) || r > n) {
    return NaN;
  }
  return factorial(n) / factorial(n - r);
}

/**
 * Calculate combination (nCr)
 */
function combination(n: number, r: number): number {
  if (n < 0 || r < 0 || !Number.isInteger(n) || !Number.isInteger(r) || r > n) {
    return NaN;
  }
  return factorial(n) / (factorial(r) * factorial(n - r));
}

/**
 * Parse and evaluate a mathematical expression safely
 * Supports: +, -, *, /, ^, nPr, nCr, parentheses
 */
export function evaluateExpression(expression: string): {
  result: number | null;
  isValid: boolean;
  error?: string;
} {
  try {
    // Clean the expression
    let cleanExpr = expression.trim();

    // Basic validation - must not be empty
    if (!cleanExpr) {
      return {
        result: null,
        isValid: false,
        error: "Expression cannot be empty",
      };
    }

    // Replace mathematical symbols with JavaScript equivalents
    cleanExpr = cleanExpr
      .replace(/×/g, "*")
      .replace(/÷/g, "/")
      .replace(/\^/g, "**");

    // Handle nPr (permutation) - format: nPr or n_P_r
    cleanExpr = cleanExpr.replace(/(\d+)\s*[Pp]\s*(\d+)/g, (match, n, r) => {
      const nVal = parseInt(n);
      const rVal = parseInt(r);
      const result = permutation(nVal, rVal);
      return isNaN(result) ? "NaN" : result.toString();
    });

    // Handle nCr (combination) - format: nCr or n_C_r
    cleanExpr = cleanExpr.replace(/(\d+)\s*[Cc]\s*(\d+)/g, (match, n, r) => {
      const nVal = parseInt(n);
      const rVal = parseInt(r);
      const result = combination(nVal, rVal);
      return isNaN(result) ? "NaN" : result.toString();
    });

    // Validate that only allowed characters are present
    const allowedChars = /^[0-9+\-*/().\s^]+$/;
    if (!allowedChars.test(cleanExpr)) {
      return {
        result: null,
        isValid: false,
        error: "Invalid characters in expression. Only +, -, *, /, ^, nPr, nCr, parentheses, and numbers are allowed.",
      };
    }

    // Check for division by zero
    if (cleanExpr.includes("/0")) {
      return { result: null, isValid: false, error: "Division by zero" };
    }

    // Check for empty parentheses
    if (cleanExpr.includes("()")) {
      return { result: null, isValid: false, error: "Empty parentheses" };
    }

    // Check for consecutive operators
    if (/[+\-*/]{2,}/.test(cleanExpr)) {
      return { result: null, isValid: false, error: "Consecutive operators" };
    }

    // Check for NaN in expression (from invalid nPr/nCr)
    if (cleanExpr.includes("NaN")) {
      return { result: null, isValid: false, error: "Invalid permutation or combination" };
    }

    // Evaluate the expression
    const result = Function(`"use strict"; return (${cleanExpr})`)();

    // Check if result is a valid number
    if (typeof result !== "number" || !isFinite(result)) {
      return {
        result: null,
        isValid: false,
        error: "Invalid mathematical result",
      };
    }

    return { result, isValid: true };
  } catch (error) {
    return { result: null, isValid: false, error: "Invalid expression syntax" };
  }
}

/**
 * Validate if ALL target numbers are used exactly once in the expression
 */
export function validateNumberUsage(
  expression: string,
  targetNumbers: number[]
): { isValid: boolean; usedNumbers: number[]; allNumbersUsed: boolean; error?: string } {
  // Extract all numbers from the expression
  const numbersInExpr = expression.match(/\d+/g)?.map(Number) || [];

  // Check if all numbers in expression are from target numbers
  const invalidNumbers = numbersInExpr.filter(
    (num) => !targetNumbers.includes(num)
  );
  if (invalidNumbers.length > 0) {
    return {
      isValid: false,
      usedNumbers: [],
      allNumbersUsed: false,
      error: `Invalid numbers used: ${invalidNumbers.join(", ")}`,
    };
  }

  // Count usage of each target number
  const usageCount: { [key: number]: number } = {};
  targetNumbers.forEach((num) => {
    usageCount[num] = 0;
  });

  numbersInExpr.forEach((num) => {
    if (targetNumbers.includes(num)) {
      usageCount[num]++;
    }
  });

  // Check if any number is used more than once
  const overusedNumbers = Object.entries(usageCount)
    .filter(([_, count]) => count > 1)
    .map(([num, _]) => parseInt(num));

  if (overusedNumbers.length > 0) {
    return {
      isValid: false,
      usedNumbers: numbersInExpr,
      allNumbersUsed: false,
      error: `Numbers used more than once: ${overusedNumbers.join(", ")}`,
    };
  }

  // Check if all target numbers are used exactly once
  const unusedNumbers = Object.entries(usageCount)
    .filter(([_, count]) => count === 0)
    .map(([num, _]) => parseInt(num));

  const allNumbersUsed = unusedNumbers.length === 0;

  if (!allNumbersUsed) {
    return {
      isValid: false,
      usedNumbers: numbersInExpr,
      allNumbersUsed: false,
      error: `Must use all numbers: ${targetNumbers.join(", ")}. Missing: ${unusedNumbers.join(", ")}`,
    };
  }

  return { 
    isValid: true, 
    usedNumbers: numbersInExpr, 
    allNumbersUsed: true 
  };
}

/**
 * Check if a result is within the valid range (1-100)
 */
export function isResultInRange(
  result: number,
  range: { min: number; max: number }
): boolean {
  return Number.isInteger(result) && result >= range.min && result <= range.max;
}

/**
 * Validate a complete Year Game attempt
 */
export function validateYearGameAttempt(
  expression: string,
  targetNumbers: number[],
  targetNumber: number,
  alreadyFound: number[] = []
): YearGameAttempt {
  // Check if target number was already found
  const isDuplicate = alreadyFound.includes(targetNumber);

  // Validate number usage (must use ALL numbers exactly once)
  const numberValidation = validateNumberUsage(expression, targetNumbers);
  if (!numberValidation.isValid) {
    return {
      expression,
      targetNumber,
      isValid: false,
      isCorrect: false,
      isDuplicate,
      result: undefined,
      usedNumbers: numberValidation.usedNumbers,
      allNumbersUsed: numberValidation.allNumbersUsed,
    };
  }

  // Evaluate the expression
  const evaluation = evaluateExpression(expression);
  if (!evaluation.isValid) {
    return {
      expression,
      targetNumber,
      isValid: false,
      isCorrect: false,
      isDuplicate,
      result: evaluation.result || undefined,
      usedNumbers: numberValidation.usedNumbers,
      allNumbersUsed: numberValidation.allNumbersUsed,
    };
  }

  const result = evaluation.result!;
  const isCorrect =
    result === targetNumber && isResultInRange(result, { min: 1, max: 100 });

  return {
    expression,
    targetNumber,
    isValid: true,
    isCorrect,
    isDuplicate,
    result,
    usedNumbers: numberValidation.usedNumbers,
    allNumbersUsed: numberValidation.allNumbersUsed,
  };
}

/**
 * Calculate score based on numbers found (팀 단위 점수 시스템)
 * 새로운 점수 시스템: 각 숫자 = 그 숫자만큼 점수
 * 예: 76을 만들면 76점 획득
 */
export function calculateScore(numbersFound: number[]): number {
  // 각 숫자가 그 숫자만큼의 점수를 제공
  return numbersFound.reduce((total, num) => total + num, 0);
}

/**
 * Generate example expressions using ALL 4 numbers (1~100 범위)
 */
export function generateExampleExpressions(targetNumbers: number[]): string[] {
  const [a, b, c, d] = targetNumbers;
  const examples: string[] = [];

  // Examples using all 4 numbers with basic operations
  const sum = a + b + c + d;
  if (sum >= 1 && sum <= 100) examples.push(`${a} + ${b} + ${c} + ${d} = ${sum}`);

  // Multiplication examples
  const product = a * b * c * d;
  if (product >= 1 && product <= 100) examples.push(`${a} × ${b} × ${c} × ${d} = ${product}`);

  // Mixed operations
  const mixed1 = a + b * c - d;
  if (mixed1 >= 1 && mixed1 <= 100) examples.push(`${a} + ${b} × ${c} - ${d} = ${mixed1}`);

  const mixed2 = a * b + c + d;
  if (mixed2 >= 1 && mixed2 <= 100) examples.push(`${a} × ${b} + ${c} + ${d} = ${mixed2}`);

  // Examples with parentheses
  const paren1 = (a + b) * (c + d);
  if (paren1 >= 1 && paren1 <= 100) examples.push(`(${a} + ${b}) × (${c} + ${d}) = ${paren1}`);

  const paren2 = a * (b + c) - d;
  if (paren2 >= 1 && paren2 <= 100) examples.push(`${a} × (${b} + ${c}) - ${d} = ${paren2}`);

  // Examples with exponents (if numbers are small)
  if (a <= 3 && b <= 3 && c <= 3 && d <= 3) {
    const exp1 = Math.pow(a, b) + c + d;
    if (exp1 >= 1 && exp1 <= 100) examples.push(`${a}^${b} + ${c} + ${d} = ${exp1}`);
  }

  // Examples with subtraction
  const sub1 = a * b * c - d;
  if (sub1 >= 1 && sub1 <= 100) examples.push(`${a} × ${b} × ${c} - ${d} = ${sub1}`);

  // More complex examples for higher numbers
  const complex1 = a * b + c * d;
  if (complex1 >= 1 && complex1 <= 100) examples.push(`${a} × ${b} + ${c} × ${d} = ${complex1}`);

  const complex2 = (a + b) * c + d;
  if (complex2 >= 1 && complex2 <= 100) examples.push(`(${a} + ${b}) × ${c} + ${d} = ${complex2}`);

  return examples.slice(0, 8); // Return up to 8 examples
}
