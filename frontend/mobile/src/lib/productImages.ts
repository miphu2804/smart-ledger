/**
 * Product Image Resolution Utility
 * Maps product names to high-quality, realistic product photos instead of generic icons.
 */

const PRODUCT_IMAGE_CATALOG: Array<{ keywords: string[]; url: string }> = [
  // Cà phê & Thức uống pha chế
  {
    keywords: ['cà phê', 'cafe', 'bạc xỉu', 'bac xiu', 'espresso', 'cappuccino', 'latte', 'đen đá', 'sữa đá'],
    url: 'https://images.unsplash.com/photo-1517701550927-30cf4ba1dba5?w=240&auto=format&fit=crop&q=80',
  },
  // Nước tăng lực Sting Dâu / Đỏ
  {
    keywords: ['sting dâu', 'sting dau', 'sting đỏ', 'sting do', 'sting lon', 'sting chai'],
    url: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=240&auto=format&fit=crop&q=80',
  },
  // Nước tăng lực Sting Vàng / Bò húc / Redbull
  {
    keywords: ['sting vàng', 'sting vang', 'sting gold', 'bò húc', 'bo huc', 'redbull', 'red bull', 'monster', 'number 1', 'number one'],
    url: 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=240&auto=format&fit=crop&q=80',
  },
  // Nước ngọt có ga (Coca, Pepsi, 7Up, Sprite, Mirinda, Fanta)
  {
    keywords: ['coca', 'coke', 'pepsi', '7up', 'sprite', 'mirinda', 'fanta', 'nước ngọt', 'nuoc ngot', 'soda'],
    url: 'https://images.unsplash.com/photo-1554866585-cd94860890b7?w=240&auto=format&fit=crop&q=80',
  },
  // Bia (Heineken, Tiger, Saigon, Bia 333, Bia Hà Nội, Budweiser, Corona)
  {
    keywords: ['bia', 'heineken', 'tiger', 'saigon', 'sài gòn', '333', 'hà nội', 'budweiser', 'corona', 'larue'],
    url: 'https://images.unsplash.com/photo-1608270104193-4a18fa300e84?w=240&auto=format&fit=crop&q=80',
  },
  // Nước suối, nước khoáng (Aquafina, Lavie, Dasani, Vĩnh Hảo)
  {
    keywords: ['nước suối', 'nuoc suoi', 'khoáng', 'aquafina', 'lavie', 'dasani', 'vĩnh hảo', 'vinh hao'],
    url: 'https://images.unsplash.com/photo-1548839140-29a749e1bc4e?w=240&auto=format&fit=crop&q=80',
  },
  // Trà xanh, Trà Oolong, C2, Không độ, Trà đào, Trà sữa
  {
    keywords: ['trà xanh', 'tra xanh', 'oolong', 'ô long', 'c2', 'không độ', 'khong do', 'trà đào', 'tra dao', 'trà chanh', 'tra sua', 'trà sữa', 'thạch đào'],
    url: 'https://images.unsplash.com/photo-1556881286-fc6915169721?w=240&auto=format&fit=crop&q=80',
  },
  // Sữa tươi, Sữa đặc, Milo, Vinamilk, TH True Milk, Sữa chua
  {
    keywords: ['sữa', 'sua', 'vinamilk', 'th true milk', 'milo', 'ông thọ', 'ong tho', 'sữa đặc', 'sữa chua', 'yakult', 'fami', 'sữa hạt'],
    url: 'https://images.unsplash.com/photo-1563636619-e9143da7973b?w=240&auto=format&fit=crop&q=80',
  },
  // Mì tôm, Hảo Hảo, Omachi, Kokomi, Mì gói, Hủ tiếu, Phở gói
  {
    keywords: ['mì tôm', 'mi tom', 'hảo hảo', 'hao hao', 'omachi', 'kokomi', 'mì gói', 'mi goi', 'indomie', 'phở gói', 'hủ tiếu', 'cháo gói'],
    url: 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=240&auto=format&fit=crop&q=80',
  },
  // Bánh mì, Bánh bao, Sandwich, Hamburger
  {
    keywords: ['bánh mì', 'banh mi', 'bánh bao', 'banh bao', 'sandwich', 'hamburger', 'croissant', 'bánh nướng', 'bánh tiêu'],
    url: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=240&auto=format&fit=crop&q=80',
  },
  // Bánh snack, Bim bim, Oishi, Lay's, Poca, Khoai tây chiên
  {
    keywords: ['bim bim', 'bimbim', 'snack', 'oishi', 'lays', "lay's", 'poca', 'khoai tây', 'phồng tôm', 'bánh que', 'rong biển'],
    url: 'https://images.unsplash.com/photo-1566478989037-eec170784d0b?w=240&auto=format&fit=crop&q=80',
  },
  // Bánh ngọt, Chocopie, Oreo, Custas, Cosy, Bánh quy, Bánh xốp
  {
    keywords: ['bánh', 'banh', 'chocopie', 'oreo', 'custas', 'cosy', 'quy', 'bánh xốp', 'bông lan', 'biscuit', 'cookie'],
    url: 'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=240&auto=format&fit=crop&q=80',
  },
  // Kẹo, Socola, Kẹo cao su, Singum, Kẹo mút
  {
    keywords: ['kẹo', 'keo', 'socola', 'chocolate', 'singum', 'sing-gum', 'chewing gum', 'cool air', 'kẹo mút', 'kẹo dẻo'],
    url: 'https://images.unsplash.com/photo-1582058091505-f87a2e55a40f?w=240&auto=format&fit=crop&q=80',
  },
  // Thuốc lá, Bật lửa, Quẹt ga
  {
    keywords: ['thuốc lá', 'thuoc la', 'craven', 'thăng long', '555', 'marlboro', 'bật lửa', 'bat lua', 'quẹt', 'quẹt ga', 'zet', 'jet'],
    url: 'https://images.unsplash.com/photo-1527061011665-3652c757a4d4?w=240&auto=format&fit=crop&q=80',
  },
  // Trứng, Trứng gà, Trứng vịt, Trứng cút
  {
    keywords: ['trứng', 'trung', 'trứng gà', 'trứng vịt', 'trứng cút', 'trung ga', 'trung vit'],
    url: 'https://images.unsplash.com/photo-1582722872445-44dc5f7e3c8f?w=240&auto=format&fit=crop&q=80',
  },
  // Gạo, Nếp, Đậu, Ngũ cốc
  {
    keywords: ['gạo', 'gao', 'nếp', 'nep', 'đậu', 'dau', 'ngũ cốc', 'st25', 'nàng thơm', 'yến mạch'],
    url: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=240&auto=format&fit=crop&q=80',
  },
  // Gia vị, Dầu ăn, Nước mắm, Hạt nêm, Bột ngọt, Tương ớt, Đường, Muối
  {
    keywords: ['dầu ăn', 'dau an', 'nước mắm', 'nuoc mam', 'hạt nêm', 'hat nem', 'bột ngọt', 'bot ngot', 'tương ớt', 'tuong ot', 'muối', 'đường', 'tiêu', 'nam ngư', 'simply', 'neptune', 'chinsu', 'chin-su', 'knoor', 'aji-ngon'],
    url: 'https://images.unsplash.com/photo-1589135233689-d56d81765c9e?w=240&auto=format&fit=crop&q=80',
  },
  // Trái cây, Hoa quả, Chuối, Táo, Cam, Dưa hấu
  {
    keywords: ['trái cây', 'trai cay', 'hoa quả', 'hoa qua', 'chuối', 'chuoi', 'táo', 'tao', 'cam', 'dưa', 'xoài', 'thơm', 'dừa'],
    url: 'https://images.unsplash.com/photo-1619566636858-adf3ef46400b?w=240&auto=format&fit=crop&q=80',
  },
  // Hóa mỹ phẩm, Khăn giấy, Bột giặt, Nước xả, Xà bông, Dầu gội, Nước rửa chén
  {
    keywords: ['khăn giấy', 'khan giay', 'giấy vệ sinh', 'bột giặt', 'bot giat', 'omo', 'ariel', 'sunlight', 'nước rửa chén', 'dầu gội', 'dau goi', 'sữa tắm', 'sua tam', 'lifebuoy', 'xà bông', 'kem đánh răng', 'ps', 'colgate'],
    url: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=240&auto=format&fit=crop&q=80',
  },
];

const DEFAULT_PRODUCT_IMAGE = 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=240&auto=format&fit=crop&q=80';

/**
 * Returns a high-quality product photo URL based on the product name or explicit imageUrl.
 */
export function getProductImage(productName?: string | null, explicitImageUrl?: string | null): string {
  if (explicitImageUrl && explicitImageUrl.trim().length > 0) {
    return explicitImageUrl;
  }

  if (!productName || !productName.trim()) {
    return DEFAULT_PRODUCT_IMAGE;
  }

  const normalized = productName.toLowerCase().trim();

  for (const entry of PRODUCT_IMAGE_CATALOG) {
    for (const kw of entry.keywords) {
      if (normalized.includes(kw)) {
        return entry.url;
      }
    }
  }

  return DEFAULT_PRODUCT_IMAGE;
}
