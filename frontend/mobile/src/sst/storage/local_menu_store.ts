import { ProductItem } from '../types';

/**
 * Danh mục thực đơn mẫu cho shop mặc định (Offline Menu Cache)
 */
export const DEFAULT_MOCK_PRODUCTS: ProductItem[] = [
  // Bánh mì
  { id: 'prod_bm_opla', shop_id: 'default', name: 'Bánh mì ốp la', price_vnd: 15000, category: 'Đồ ăn', unit: 'ổ', aliases: ['bánh mì trứng', 'bánh mì opla'] },
  { id: 'prod_bm_thitcha', shop_id: 'default', name: 'Bánh mì thịt chả', price_vnd: 20000, category: 'Đồ ăn', unit: 'ổ', aliases: ['bánh mì thịt', 'bánh mì chả'] },
  { id: 'prod_bm_pate', shop_id: 'default', name: 'Bánh mì pate', price_vnd: 18000, category: 'Đồ ăn', unit: 'ổ', aliases: ['bánh mì pa tê'] },

  // Sting
  { id: 'prod_sting_dau', shop_id: 'default', name: 'Sting dâu 330ml', price_vnd: 12000, category: 'Nước ngọt', unit: 'chai', aliases: ['sting dâu', 'sting đỏ', 'xì ting dâu'] },
  { id: 'prod_sting_vang', shop_id: 'default', name: 'Sting vàng 330ml', price_vnd: 12000, category: 'Nước ngọt', unit: 'chai', aliases: ['sting vàng', 'sting nhân sâm', 'xì ting vàng'] },

  // Cà phê
  { id: 'prod_cf_suada', shop_id: 'default', name: 'Cà phê sữa đá', price_vnd: 15000, category: 'Đồ uống', unit: 'ly', aliases: ['cafe sữa', 'cà phê sữa', 'nâu đá', 'cf sữa'] },
  { id: 'prod_cf_denda', shop_id: 'default', name: 'Cà phê đen đá', price_vnd: 12000, category: 'Đồ uống', unit: 'ly', aliases: ['cafe đen', 'cà phê đen', 'đen đá', 'cf đen'] },

  // Bạc xỉu
  { id: 'prod_bac_xiu_da', shop_id: 'default', name: 'Bạc xỉu đá', price_vnd: 18000, category: 'Đồ uống', unit: 'ly', aliases: ['bạc sỉu đá', 'bạc xỉu', 'bac xiu'] },
  { id: 'prod_bac_xiu_nong', shop_id: 'default', name: 'Bạc xỉu nóng', price_vnd: 18000, category: 'Đồ uống', unit: 'ly', aliases: ['bạc sỉu nóng', 'bac xiu nong'] },

  // Sữa
  { id: 'prod_sua_kun_dau', shop_id: 'default', name: 'Sữa dâu Kun 180ml', price_vnd: 10000, category: 'Đồ uống', unit: 'hộp', aliases: ['sữa dâu', 'kun dâu'] },
  { id: 'prod_sua_vinamilk', shop_id: 'default', name: 'Sữa tươi tiệt trùng Vinamilk', price_vnd: 9000, category: 'Đồ uống', unit: 'hộp', aliases: ['sữa tươi', 'sữa vinamilk', 'sữa trắng'] },

  // Kem
  { id: 'prod_kem_socola', shop_id: 'default', name: 'Kem ốc quế socola', price_vnd: 12000, category: 'Kem', unit: 'cây', aliases: ['kem ốc quế socola', 'kem socola'] },
  { id: 'prod_kem_vani', shop_id: 'default', name: 'Kem ốc quế vani', price_vnd: 12000, category: 'Kem', unit: 'cây', aliases: ['kem vani', 'kem ốc quế vani'] },

  // Khác
  { id: 'prod_bo_kho', shop_id: 'default', name: 'Bò kho bánh mì', price_vnd: 35000, category: 'Đồ ăn', unit: 'phần', aliases: ['bò kho'] },
  { id: 'prod_tra_da', shop_id: 'default', name: 'Trà đá', price_vnd: 3000, category: 'Đồ uống', unit: 'ly', aliases: ['tra da'] },
  { id: 'prod_aquafina', shop_id: 'default', name: 'Nước suối Aquafina 500ml', price_vnd: 6000, category: 'Đồ uống', unit: 'chai', aliases: ['nước suối', 'aquafina'] },
];

/**
 * Quản lý kho thực đơn cục bộ (In-Memory / SQLite Cache)
 */
export class LocalMenuStore {
  private productsByShop: Map<string, ProductItem[]> = new Map();

  constructor() {
    this.productsByShop.set('default', DEFAULT_MOCK_PRODUCTS);
  }

  public getProducts(shopId: string = 'default'): ProductItem[] {
    return this.productsByShop.get(shopId) || this.productsByShop.get('default') || [];
  }

  public setProducts(shopId: string, products: ProductItem[]): void {
    this.productsByShop.set(shopId, products);
  }

  public addProduct(shopId: string, product: ProductItem): void {
    const list = this.getProducts(shopId);
    list.push(product);
    this.productsByShop.set(shopId, list);
  }
}
