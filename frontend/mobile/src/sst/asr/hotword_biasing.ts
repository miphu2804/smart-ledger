import { HotwordItem, POSMappingConfig } from '../types/asr';

export interface TrieNode {
  children: Map<string, TrieNode>;
  isEndOfWord: boolean;
  boostScore: number;
  word: string | null;
}

/**
 * Xây dựng cây Trie từ BPE Token / Từ vựng POS Menu
 * để cộng điểm Hotword Biasing trong thuật toán Modified Beam Search của sherpa-onnx.
 */
export class HotwordBiasingTrie {
  private root: TrieNode;

  constructor() {
    this.root = this.createNode();
  }

  private createNode(): TrieNode {
    return {
      children: new Map(),
      isEndOfWord: false,
      boostScore: 0.0,
      word: null,
    };
  }

  /**
   * Nạp danh mục từ pos_mapping.json vào cây Trie
   */
  public loadFromPOSConfig(config: POSMappingConfig): void {
    for (const item of config.hotwords) {
      this.insert(item.keyword, item.boost_score);
      if (item.aliases) {
        for (const alias of item.aliases) {
          this.insert(alias, item.boost_score);
        }
      }
    }
  }

  public insert(phrase: string, boostScore: number): void {
    const tokens = phrase.toLowerCase().trim().split(/\s+/);
    let curr = this.root;

    for (const token of tokens) {
      if (!curr.children.has(token)) {
        curr.children.set(token, this.createNode());
      }
      curr = curr.children.get(token)!;
    }

    curr.isEndOfWord = true;
    curr.boostScore = boostScore;
    curr.word = phrase;
  }

  /**
   * Tính toán điểm cộng Hotword Biasing cho chuỗi token dự đoán trong Beam Search
   */
  public getBiasingScore(predictedTokens: string[]): number {
    let totalScore = 0.0;
    const len = predictedTokens.length;

    for (let start = 0; start < len; start++) {
      let curr = this.root;
      for (let end = start; end < len; end++) {
        const token = predictedTokens[end].toLowerCase();
        if (!curr.children.has(token)) {
          break;
        }
        curr = curr.children.get(token)!;
        if (curr.isEndOfWord) {
          totalScore += curr.boostScore;
        }
      }
    }

    return totalScore;
  }
}
