/** Selected when the user has not chosen a model. */
export const DEFAULT_MODEL = 'gemini-2.5-flash';

const EMBEDDING_MODEL_PREFIXES = [
  'all-minilm',
  'bge-',
  'bge_',
  'e5-',
  'e5_',
  'gte-',
  'gte_',
  'jina-embeddings',
  'nomic-bert',
  'sentence-transformers',
];

export function isEmbedOnlyModel(modelId: string): boolean {
  const name = (modelId || '').trim().toLowerCase();
  const leaf = name.slice(name.lastIndexOf('/') + 1).split(':')[0];
  return (
    leaf.includes('embed') ||
    leaf.includes('minilm') ||
    EMBEDDING_MODEL_PREFIXES.some((prefix) => leaf.startsWith(prefix))
  );
}

/**
 * Cloud models are picked in the model picker's Cloud tab and do not appear in
 * the server's model list, so "not in the list" must not mean "missing".
 */
export function isCloudModel(modelId: string): boolean {
  return /^(gemini-|gpt-(?!oss)|o[134]-|claude-|openrouter\/|atlascloud\/|MiniMax-)/.test(
    modelId || '',
  );
}
