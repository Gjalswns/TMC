#!/usr/bin/env node

/**
 * TMC 프로젝트 의존성 검증 스크립트
 * 모든 import와 사용을 자동으로 체크합니다.
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 TMC 프로젝트 의존성 검증 시작...\n');

// 검증할 패턴들
const checks = {
  react: {
    pattern: /\b(useState|useEffect|useCallback|useMemo|useRef|useContext)\b/g,
    import: /import\s+\{[^}]*\b(useState|useEffect|useCallback|useMemo|useRef|useContext)\b[^}]*\}\s+from\s+['"]react['"]/,
    name: 'React Hooks'
  },
  lucide: {
    pattern: /(<(Users|Clock|AlertCircle|CheckCircle|XCircle|Play|Square|Trophy|Target|Calculator|Plus|Minus|Shuffle|Timer|Send|ArrowLeft|ArrowRight|Copy|Check|Hash|ExternalLink|Wifi|WifiOff|RefreshCw|Sword|Loader2|Moon|Sun|ChevronDown|ChevronUp|ChevronLeft|ChevronRight|MoreHorizontal|X|Circle|Dot|Search|GripVertical|PanelLeft|AlertTriangle)\b)/g,
    import: /from\s+['"]lucide-react['"]/,
    name: 'Lucide Icons'
  }
};

let totalErrors = 0;
let totalWarnings = 0;

// 파일 검증 함수
function verifyFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const errors = [];
  
  // React hooks 체크
  if (checks.react.pattern.test(content) && !checks.react.import.test(content)) {
    const hooks = content.match(checks.react.pattern) || [];
    const uniqueHooks = [...new Set(hooks)];
    errors.push({
      type: 'error',
      message: `Missing React hooks import: ${uniqueHooks.join(', ')}`
    });
  }
  
  // Lucide icons 체크
  if (checks.lucide.pattern.test(content) && !checks.lucide.import.test(content)) {
    errors.push({
      type: 'warning',
      message: 'Possible missing lucide-react import (check manually)'
    });
  }
  
  return errors;
}

// 디렉토리 순회
function scanDirectory(dir, ext = '.tsx') {
  const files = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const file of files) {
    const fullPath = path.join(dir, file.name);
    
    if (file.isDirectory()) {
      if (!file.name.startsWith('.') && !file.name.includes('node_modules')) {
        scanDirectory(fullPath, ext);
      }
    } else if (file.name.endsWith(ext)) {
      const errors = verifyFile(fullPath);
      
      if (errors.length > 0) {
        console.log(`\n📁 ${fullPath}:`);
        errors.forEach(err => {
          if (err.type === 'error') {
            console.log(`  ❌ ${err.message}`);
            totalErrors++;
          } else {
            console.log(`  ⚠️  ${err.message}`);
            totalWarnings++;
          }
        });
      }
    }
  }
}

// 검증 시작
const componentsDir = path.join(__dirname, '..', 'components');
const appDir = path.join(__dirname, '..', 'app');

console.log('📦 Checking components...');
scanDirectory(componentsDir);

console.log('\n📦 Checking app...');
scanDirectory(appDir);

// 결과 출력
console.log('\n' + '='.repeat(50));
console.log('✅ 검증 완료!\n');
console.log(`총 에러: ${totalErrors}`);
console.log(`총 경고: ${totalWarnings}`);

if (totalErrors === 0 && totalWarnings === 0) {
  console.log('\n🎉 모든 의존성이 올바르게 설정되었습니다!');
  process.exit(0);
} else {
  console.log('\n⚠️  일부 파일에 문제가 있습니다. 위 내용을 확인하세요.');
  process.exit(totalErrors > 0 ? 1 : 0);
}

