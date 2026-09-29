#!/usr/bin/env bash
# 用 React 19 跑一遍**全量测试**。
#
# 为什么不能直接在本仓库跑：单包只装得下一个 React，devDependencies 固定 18。
# 所以这里把 src/test（+ example 的两个文件，example-dark-mode.test.ts 要读）拷进一个空目录，
# 装 React 19 和测试依赖，再跑 vitest。CI 与本地共用这一个脚本（见 .github/workflows/ci.yml）。
#
# 用法：bash scripts/verify-react19.sh [react 版本范围，默认 ^19]
# 需要网络；现场留在 .verify-react19/（gitignore 已忽略）。

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="${VERIFY_REACT19_DIR:-$ROOT/.verify-react19}"
REACT_VERSION="${1:-^19}"

step() { printf '\n\033[1m== %s\033[0m\n' "$1"; }
done_() { printf '\033[32m  OK\033[0m %s\n' "$1"; }
die() { printf '\033[31mFAIL: %s\033[0m\n' "$1" >&2; exit 1; }

step "准备空目录（React $REACT_VERSION）"
rm -rf "$WORK"
mkdir -p "$WORK/examples/react-vite/src"
cp -r "$ROOT/src" "$ROOT/test" "$ROOT/stories" "$ROOT/tsconfig.json" "$WORK/"
# test/example-dark-mode.test.ts 会读 example 的这两个文件
cp "$ROOT/examples/react-vite/index.html" "$WORK/examples/react-vite/"
cp "$ROOT/examples/react-vite/src/App.tsx" "$WORK/examples/react-vite/src/"
# 目录名不能带点：npm init -y 会报 Invalid name，所以直接写 package.json
printf '{"name":"verify-react19","private":true,"type":"module"}\n' > "$WORK/package.json"
done_ "src / test / stories / examples 已就位"

step "装依赖（React $REACT_VERSION）"
cd "$WORK"
npm_config_cache="$WORK/npm-cache" npm install -D --no-audit --no-fund --loglevel=error \
  vitest@^5 jsdom@^30 @testing-library/react@^16 @testing-library/dom@^10 \
  "react@$REACT_VERSION" "react-dom@$REACT_VERSION" \
  "@types/react@$REACT_VERSION" "@types/react-dom@$REACT_VERSION" \
  typescript@^5.9 @storybook/react@^10 ||
  die "npm install 失败"
node -e "
  const react = require('react/package.json').version
  const dom = require('react-dom/package.json').version
  console.log(\`  installed: react \${react}, react-dom \${dom}\`)
"
[ "$(node -p "require('react/package.json').version.split('.')[0]")" = "19" ] ||
  die "装到的不是 React 19"
done_ "react 19 就位"

step "跑全量测试"
npx vitest run || die "React 19 上测试挂了（见上面的失败用例）"

printf '\n\033[32m全部通过\033[0m：React %s 上的全量测试。现场留在 %s\n' "$REACT_VERSION" "$WORK"
