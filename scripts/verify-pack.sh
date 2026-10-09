#!/usr/bin/env bash










set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="${VERIFY_PACK_DIR:-$ROOT/.verify-pack}"
NPM_CACHE="$WORK/npm-cache"
if [ $# -gt 0 ]; then REACT_MAJORS=("$@"); else REACT_MAJORS=(18 19); fi


HEADLESS_MAX_GZIP=$((8 * 1024))

step() { printf '\n\033[1m== %s\033[0m\n' "$1"; }
done_() { printf '\033[32m  OK\033[0m %s\n' "$1"; }
die() { printf '\033[31mFAIL: %s\033[0m\n' "$1" >&2; exit 1; }

write_consumer() {
  local dir="$1" major="$2" tarball="$3"
  mkdir -p "$dir/src"
  cp "$ROOT/test/fixtures/otlp-small.json" "$dir/src/trace.json"

  cat > "$dir/package.json" <<EOF
{
  "name": "verify-pack-react$major",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "dependencies": {
    "@slcomplex/otlp-trace-renderer": "file:$tarball",
    "react": "^$major",
    "react-dom": "^$major"
  },
  "devDependencies": {
    "@types/react": "^$major",
    "@types/react-dom": "^$major",
    "@vitejs/plugin-react": "^6.1.1",
    "typescript": "^5.9.3",
    "vite": "^8.3.1"
  }
}
EOF

  cat > "$dir/tsconfig.json" <<'EOF'
{
  "compilerOptions": {
    "target": "es2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true
  },
  "include": ["src", "vite.config.ts", "vite.headless.config.ts"]
}
EOF

  cat > "$dir/tsconfig.node10.json" <<'EOF'
{
  "compilerOptions": {
    "target": "es2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "node",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "isolatedModules": true
  },
  "include": ["src/node10.ts"]
}
EOF

  cat > "$dir/vite.config.ts" <<'EOF'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({ plugins: [react()], build: { outDir: 'dist-app' } })
EOF

  cat > "$dir/vite.headless.config.ts" <<'EOF'
import { defineConfig } from 'vite'

// 只 import headless / adapters 两个子路径，用来验证 tree-shaking：
// 产物里不该出现 React，也不该出现 i18n 文案或 canvas 绘制代码。
export default defineConfig({
  build: {
    outDir: 'dist-headless',
    lib: { entry: 'src/headless-only.ts', formats: ['es'], fileName: 'headless-only' },
    rollupOptions: { external: ['react', 'react-dom'] },
  },
})
EOF

  cat > "$dir/index.html" <<'EOF'
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>verify-pack</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
EOF


  cat > "$dir/src/main.tsx" <<'EOF'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { TraceDetailView } from '@slcomplex/otlp-trace-renderer'
import { flattenRows, type TraceData } from '@slcomplex/otlp-trace-renderer/headless'
import { normalizeOtlpTrace } from '@slcomplex/otlp-trace-renderer/adapters/otlp'
import { normalizeTempoTrace } from '@slcomplex/otlp-trace-renderer/adapters/tempo'
import raw from './trace.json'

const trace: TraceData = normalizeOtlpTrace(raw)
const rows = flattenRows(trace, new Set())
console.log(`[verify-pack] spans=${trace.spans.length} rows=${rows.length}`)
console.log(`[verify-pack] tempo adapter=${typeof normalizeTempoTrace}`)

const root = document.getElementById('root')
if (!root) throw new Error('#root missing')
createRoot(root).render(
  <StrictMode>
    <TraceDetailView trace={trace} style={{ height: '100vh' }} />
  </StrictMode>,
)
EOF

  cat > "$dir/src/headless-only.ts" <<'EOF'
import { flattenRows } from '@slcomplex/otlp-trace-renderer/headless'
import { normalizeOtlpTrace } from '@slcomplex/otlp-trace-renderer/adapters/otlp'

export function rowCount(raw: unknown): number {
  return flattenRows(normalizeOtlpTrace(raw), new Set()).length
}
EOF

  cat > "$dir/src/node10.ts" <<'EOF'
import { TraceDetailView, type TraceDetailViewApi } from '@slcomplex/otlp-trace-renderer'
import { TraceTimeline } from '@slcomplex/otlp-trace-renderer/react'
import { flattenRows, type TraceData } from '@slcomplex/otlp-trace-renderer/headless'
import { normalizeOtlpTrace } from '@slcomplex/otlp-trace-renderer/adapters/otlp'
import { normalizeTempoTrace } from '@slcomplex/otlp-trace-renderer/adapters/tempo'

export const components = [TraceDetailView, TraceTimeline]
export const adapters = [normalizeOtlpTrace, normalizeTempoTrace]
export type Trace = TraceData
export type Api = TraceDetailViewApi
export const rows: number = flattenRows(normalizeOtlpTrace({}), new Set()).length
EOF
}

verify_consumer() {
  local dir="$1" major="$2"
  step "React $major：install / typecheck / build"

  ( cd "$dir" && npm_config_cache="$NPM_CACHE" npm install --no-audit --no-fund --loglevel=error )

  node -e "
    const p = require('$dir/node_modules/react/package.json')
    const lib = require('$dir/node_modules/@slcomplex/otlp-trace-renderer/package.json')
    console.log(\`  installed: react \${p.version}, lib \${lib.version}\`)
  " || die "装在 node_modules 里的包读不出来（没真装上？）"

  ( cd "$dir" && npx tsc --noEmit ) || die "React $major: tsc --noEmit 失败（.d.ts 或 exports 的 types 条件有问题）"
  done_ "tsc --noEmit（五个入口都解析）"

  ( cd "$dir" && npx tsc -p tsconfig.node10.json ) || die "React $major: moduleResolution:node 解析不了子路径（package.json 的 typesVersions 缺项？漏了 './react' 也会这样）"
  done_ "tsc -p tsconfig.node10.json（node10 也能解析五个入口）"

  ( cd "$dir" && npx vite build >/dev/null ) || die "React $major: vite build 失败"
  [ -f "$dir/dist-app/index.html" ] || die "React $major: 没产出 dist-app/index.html"
  done_ "vite build（应用能打进 bundle）"

  ( cd "$dir" && npx vite build --config vite.headless.config.ts >/dev/null ) || die "React $major: headless lib build 失败"
  local bundle="$dir/dist-headless/headless-only.js"
  [ -f "$bundle" ] || die "React $major: 没产出 headless-only.js"
  grep -qi 'react' "$bundle" && die "React $major: headless 产物里出现了 react（tree-shaking 失效）"
  grep -q 'Trace timeline' "$bundle" && die "React $major: headless 产物里出现了 i18n 文案（tree-shaking 失效）"
  local gz
  gz=$(gzip -c "$bundle" | wc -c | tr -d ' ')
  [ "$gz" -le "$HEADLESS_MAX_GZIP" ] || die "React $major: headless 产物 ${gz}B gzip，超过上限 ${HEADLESS_MAX_GZIP}B"
  done_ "tree-shaking：headless 单入口 $(stat -c%s "$bundle")B raw / ${gz}B gzip，无 React、无 i18n 文案"

  ( cd "$dir" && node --input-type=module -e "
    const fs = await import('node:fs/promises')
    const root = await import('@slcomplex/otlp-trace-renderer')
    const headless = await import('@slcomplex/otlp-trace-renderer/headless')
    const otlp = await import('@slcomplex/otlp-trace-renderer/adapters/otlp')
    const tempo = await import('@slcomplex/otlp-trace-renderer/adapters/tempo')
    const expected = [
      ['root', root, ['TraceDetailView', 'TraceTimeline', 'useTraceMessages'], ['SpanDetailPanel', 'TraceToolbar', 'SpanNameColumn']],
      ['headless', headless, ['flattenRows', 'normalizeTrace', 'traceReducer'], ['DEFAULT_THEME']],
      ['adapters/otlp', otlp, ['normalizeOtlpTrace'], []],
      ['adapters/tempo', tempo, ['normalizeTempoTrace'], []],
    ]
    // forwardRef / memo 包过的组件是对象不是函数，所以「存在」和「是函数」分开断言
    for (const [name, mod, fns, values] of expected) {
      for (const key of fns) if (typeof mod[key] !== 'function') throw new Error(name + ' 里 ' + key + ' 不是函数')
      for (const key of values) if (!(key in mod)) throw new Error(name + ' 里没有 ' + key)
    }
    const raw = JSON.parse(await fs.readFile('src/trace.json', 'utf8'))
    const rows = headless.flattenRows(otlp.normalizeOtlpTrace(raw), new Set())
    if (rows.length === 0) throw new Error('flattenRows 返回空')
    console.log('  node ESM：四个子路径 import OK，flattenRows 得到 ' + rows.length + ' 行')
  " ) || die "React $major: Node 里 import 子路径失败"
  done_ "node ESM（四个子路径 import 不碰 window，SSR 里也能 import）"
}

step "build + pack"
( cd "$ROOT" && pnpm build >/dev/null )
rm -rf "$WORK"
mkdir -p "$WORK"
TARBALL=$(cd "$ROOT" && pnpm pack --pack-destination "$WORK" --json | node -e "
  let raw = ''
  process.stdin.on('data', (chunk) => (raw += chunk))
  process.stdin.on('end', () => console.log(JSON.parse(raw).filename))
")
[ -f "$TARBALL" ] || die "没 pack 出 tgz（拿到的是 $TARBALL）"
done_ "$(basename "$TARBALL")（$(stat -c%s "$TARBALL") bytes）"

for major in "${REACT_MAJORS[@]}"; do
  dir="$WORK/consumer-react$major"
  write_consumer "$dir" "$major" "$TARBALL"
  verify_consumer "$dir" "$major"
done

printf '\n\033[32m全部通过\033[0m：React %s 的 tarball 装机验证都过了。现场留在 %s\n' "$(IFS=/; echo "${REACT_MAJORS[*]}")" "$WORK"
