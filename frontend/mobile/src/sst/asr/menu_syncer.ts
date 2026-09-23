import { ProductItem } from '../types';
import { HotwordBiasingTrie } from './hotword_biasing';

/**
 * Tự động đồng bộ danh mục sản phẩm của quán vào cây Trie Hotword Biasing
 */
export class MenuHotwordCompiler {
  public static syncMenuToTrie(products: ProductItem[], trie: HotwordBiasingTrie): number {
    let count = 0;
    for (const prod of products) {
      trie.insert(prod.name, 2.5);
      count++;

      if (prod.aliases && prod.aliases.length > 0) {
        for (const alias of prod.aliases) {
          trie.insert(alias, 2.5);
          count++;
        }
      }
    }
    return count;
  }
}
