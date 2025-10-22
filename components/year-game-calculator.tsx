"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Delete, ArrowLeft } from "lucide-react";

interface CalculatorProps {
  availableNumbers: number[];
  onSubmit: (expression: string, result: number) => void;
  disabled?: boolean;
}

export function YearGameCalculator({ availableNumbers, onSubmit, disabled }: CalculatorProps) {
  const [expression, setExpression] = useState("");
  const [result, setResult] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 숫자 사용 횟수 추적
  const [numberUsage, setNumberUsage] = useState<Record<number, number>>({});

  // 게임이 비활성화되면 입력창 초기화
  useEffect(() => {
    if (disabled) {
      setExpression("");
      setResult(null);
      setError(null);
      setNumberUsage({});
    }
  }, [disabled]);

  // 표현식 평가
  useEffect(() => {
    if (!expression) {
      setResult(null);
      setError(null);
      return;
    }

    try {
      // 안전한 수식 평가
      const evaluated = evaluateExpression(expression);
      
      if (evaluated !== null && Number.isFinite(evaluated) && Number.isInteger(evaluated)) {
        setResult(evaluated);
        
        // 1-100 범위 체크
        if (evaluated < 1 || evaluated > 100) {
          setError("Result must be between 1 and 100");
        } else {
          setError(null);
        }
      } else {
        setResult(null);
        setError("Result must be an integer");
      }
    } catch (e) {
      setResult(null);
      setError("Invalid expression");
    }
  }, [expression]);

  // 숫자 사용 횟수 계산
  useEffect(() => {
    const usage: Record<number, number> = {};
    availableNumbers.forEach(num => usage[num] = 0);

    // 표현식에서 각 숫자가 몇 번 사용되었는지 카운트
    const tokens = expression.match(/\d+/g) || [];
    tokens.forEach(token => {
      const num = parseInt(token);
      if (availableNumbers.includes(num)) {
        usage[num] = (usage[num] || 0) + 1;
      }
    });

    setNumberUsage(usage);
  }, [expression, availableNumbers]);

  // 팩토리얼 계산
  const factorial = (n: number): number => {
    if (n < 0 || n > 20) return NaN;
    if (n === 0 || n === 1) return 1;
    let result = 1;
    for (let i = 2; i <= n; i++) {
      result *= i;
    }
    return result;
  };

  // nPr (Permutation) 계산
  const permutation = (n: number, r: number): number => {
    if (n < 0 || r < 0 || r > n || n > 20) return NaN;
    return factorial(n) / factorial(n - r);
  };

  // nCr (Combination) 계산
  const combination = (n: number, r: number): number => {
    if (n < 0 || r < 0 || r > n || n > 20) return NaN;
    return factorial(n) / (factorial(r) * factorial(n - r));
  };

  // 안전한 수식 평가 함수
  const evaluateExpression = (expr: string): number | null => {
    try {
      // 고급 연산자 처리
      let processedExpr = expr;
      
      // ! (팩토리얼) 처리
      processedExpr = processedExpr.replace(/(\d+)!/g, (match, n) => {
        return factorial(parseInt(n)).toString();
      });
      
      // nPr 처리
      processedExpr = processedExpr.replace(/(\d+)P(\d+)/g, (match, n, r) => {
        return permutation(parseInt(n), parseInt(r)).toString();
      });
      
      // nCr 처리
      processedExpr = processedExpr.replace(/(\d+)C(\d+)/g, (match, n, r) => {
        return combination(parseInt(n), parseInt(r)).toString();
      });
      
      // ^ (거듭제곱)을 ** 로 변환
      processedExpr = processedExpr.replace(/\^/g, '**');

      // 허용된 문자만 체크 (숫자, 연산자, 괄호, 공백, *, .)
      if (!/^[\d+\-*/().\s*]+$/.test(processedExpr)) {
        return null;
      }

      // Function constructor 사용 (제한적 평가)
      const func = new Function(`return ${processedExpr}`);
      const result = func();
      
      return typeof result === 'number' && Number.isFinite(result) ? result : null;
    } catch {
      return null;
    }
  };

  // 버튼 클릭 핸들러
  const handleInput = (value: string) => {
    if (disabled) return;
    setExpression(prev => prev + value);
  };

  const handleClear = () => {
    setExpression("");
    setResult(null);
    setError(null);
  };

  const handleBackspace = () => {
    setExpression(prev => prev.slice(0, -1));
  };

  const handleSubmit = () => {
    if (!expression || result === null || disabled) return;

    // 숫자 사용 검증
    const allNumbersUsed = availableNumbers.every(num => numberUsage[num] === 1);
    const noExtraNumbers = Object.values(numberUsage).every(count => count <= 1);

    if (!allNumbersUsed) {
      setError("You must use all 5 numbers exactly once");
      return;
    }

    if (!noExtraNumbers) {
      setError("Each number can only be used once");
      return;
    }

    if (result >= 1 && result <= 100) {
      onSubmit(expression, result);
      handleClear();
    } else {
      setError("Result must be between 1 and 100");
    }
  };

  // 사용 가능 여부 체크
  const canUseNumber = (num: number) => {
    return (numberUsage[num] || 0) < 1;
  };

  return (
    <div className="space-y-4">
      {/* 디스플레이 */}
      <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950 dark:to-indigo-950">
        <CardContent className="p-6">
          {/* 수식 입력 */}
          <div className="mb-4">
            <div className="text-xs text-muted-foreground mb-1">Expression</div>
            <div className="min-h-12 text-2xl font-mono bg-background rounded-lg p-3 border-2 border-primary/20">
              {expression || <span className="text-muted-foreground">Enter expression...</span>}
            </div>
          </div>

          {/* 결과 */}
          <div>
            <div className="text-xs text-muted-foreground mb-1">Result (1-100 only)</div>
            <div className="min-h-16 text-4xl font-bold bg-background rounded-lg p-4 border-2 border-primary/20 flex flex-col items-center justify-center">
              {result !== null ? (
                <>
                  <span className={result >= 1 && result <= 100 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}>
                    {result}
                  </span>
                  {(result < 1 || result > 100) && (
                    <span className="text-xs text-red-600 dark:text-red-400 mt-1">Out of range!</span>
                  )}
                </>
              ) : error ? (
                <span className="text-red-600 dark:text-red-400 text-sm text-center">{error}</span>
              ) : (
                <span className="text-muted-foreground text-xl">-</span>
              )}
            </div>
          </div>

          {/* 숫자 사용 상태 */}
          <div className="mt-4 flex gap-2 justify-center">
            {availableNumbers.map((num) => (
              <Badge
                key={num}
                variant={numberUsage[num] === 1 ? "default" : numberUsage[num] > 1 ? "destructive" : "outline"}
                className="text-lg px-3 py-1"
              >
                {num} {numberUsage[num] === 1 ? "✓" : numberUsage[num] > 1 ? "⚠" : ""}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 계산기 키패드 */}
      <div className="grid grid-cols-4 gap-2">
        {/* 숫자 버튼 (사용 가능한 숫자들) */}
        {availableNumbers.map((num) => (
          <Button
            key={`num-${num}`}
            variant="outline"
            size="lg"
            className={`text-2xl font-bold h-16 ${
              !canUseNumber(num) ? "opacity-50 bg-muted" : "hover:bg-primary/10"
            }`}
            onClick={() => canUseNumber(num) && handleInput(num.toString())}
            disabled={disabled || !canUseNumber(num)}
          >
            {num}
          </Button>
        ))}

        {/* 연산자 */}
        <Button
          variant="outline"
          size="lg"
          className="text-2xl font-bold h-16 hover:bg-primary/10"
          onClick={() => handleInput("+")}
          disabled={disabled}
        >
          +
        </Button>
        <Button
          variant="outline"
          size="lg"
          className="text-2xl font-bold h-16 hover:bg-primary/10"
          onClick={() => handleInput("-")}
          disabled={disabled}
        >
          −
        </Button>
        <Button
          variant="outline"
          size="lg"
          className="text-2xl font-bold h-16 hover:bg-primary/10"
          onClick={() => handleInput("*")}
          disabled={disabled}
        >
          ×
        </Button>
        <Button
          variant="outline"
          size="lg"
          className="text-2xl font-bold h-16 hover:bg-primary/10"
          onClick={() => handleInput("/")}
          disabled={disabled}
        >
          ÷
        </Button>

        {/* 고급 연산자 */}
        <Button
          variant="outline"
          size="lg"
          className="text-lg font-bold h-16 hover:bg-primary/10"
          onClick={() => handleInput("^")}
          disabled={disabled}
        >
          x^y
        </Button>
        <Button
          variant="outline"
          size="lg"
          className="text-lg font-bold h-16 hover:bg-primary/10"
          onClick={() => handleInput("!")}
          disabled={disabled}
        >
          n!
        </Button>
        <Button
          variant="outline"
          size="lg"
          className="text-lg font-bold h-16 hover:bg-primary/10"
          onClick={() => handleInput("P")}
          disabled={disabled}
        >
          nPr
        </Button>
        <Button
          variant="outline"
          size="lg"
          className="text-lg font-bold h-16 hover:bg-primary/10"
          onClick={() => handleInput("C")}
          disabled={disabled}
        >
          nCr
        </Button>

        {/* 괄호 */}
        <Button
          variant="outline"
          size="lg"
          className="text-xl font-bold h-16 hover:bg-primary/10"
          onClick={() => handleInput("(")}
          disabled={disabled}
        >
          (
        </Button>
        <Button
          variant="outline"
          size="lg"
          className="text-xl font-bold h-16 hover:bg-primary/10"
          onClick={() => handleInput(")")}
          disabled={disabled}
        >
          )
        </Button>

        {/* 전체 지우기 (Clear All) */}
        <Button
          variant="outline"
          size="lg"
          className="h-16 hover:bg-destructive/10"
          onClick={handleClear}
          disabled={disabled}
        >
          <Delete className="h-6 w-6" />
        </Button>

        {/* 마지막 1개 지우기 (Backspace) */}
        <Button
          variant="outline"
          size="lg"
          className="h-16 hover:bg-destructive/10"
          onClick={handleBackspace}
          disabled={disabled}
        >
          <ArrowLeft className="h-6 w-6" />
        </Button>

        {/* 제출 버튼 (전체 너비) */}
        <Button
          variant="default"
          size="lg"
          className="col-span-4 h-16 text-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
          onClick={handleSubmit}
          disabled={disabled || result === null || result < 1 || result > 100 || error !== null}
        >
          {result !== null && result >= 1 && result <= 100
            ? `Submit: ${expression} = ${result}`
            : "Enter valid expression (1-100)"}
        </Button>
      </div>

      {/* 도움말 */}
      <Card className="bg-muted/50">
        <CardContent className="p-4">
          <div className="text-xs space-y-1">
            <p className="font-semibold">💡 Tips:</p>
            <p>• Use all 5 numbers exactly once</p>
            <p>• Operations: + − × ÷ ^ ! P C ( )</p>
            <p>• Target: Any integer from 1 to 100</p>
            <p className="font-mono">• Example: (7+2)×1+9 = 18</p>
            <p className="font-mono">• Power: 2^9 = 512</p>
            <p className="font-mono">• Factorial: 7! = 5040</p>
            <p className="font-mono">• Permutation: 9P2 = 72</p>
            <p className="font-mono">• Combination: 9C2 = 36</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

