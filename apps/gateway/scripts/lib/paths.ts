import path from 'node:path'

const repoRoot = path.resolve(import.meta.dirname, '../../../..')

export const paths = {
  repoRoot,
  rawCsv: path.join(repoRoot, 'data', 'raw', 'bitext.csv'),
  kbDir: path.join(repoRoot, 'data', 'kb'),
  evalDir: path.join(repoRoot, 'data', 'eval'),
  resultsDir: path.join(repoRoot, 'eval', 'results'),
  modelCache: path.join(repoRoot, '.cache', 'models'),
}
