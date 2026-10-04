# ADR-0001: Dùng pgvector trên Supabase làm vector store thay cho Qdrant

- **Trạng thái:** Accepted — team chọn phương án A (chỉ pgvector) ngày 2026-09-30
- **Ngày:** 2026-09-30
- **Owner:** chưa chỉ định

## Bối cảnh

- `FR-019`: RAG chỉ truy xuất dữ liệu của shop đang chọn và trả căn cứ cho recommendation/chat.
- `NFR-007`, `AC-012`: vector và truy xuất phải cô lập theo `shop_id`; truy vấn ở shop A không trả vector của shop B.
- Thiết kế trước đó chọn Qdrant làm vector store nhưng chưa chốt use case và chưa triển khai.
- PostgreSQL chạy trên Supabase (staging dùng chung với dev, production tách riêng). Đã xác minh trên staging: PostgreSQL 17.6, extension `vector` 0.8.2 có sẵn, chưa bật.

## Quyết định

Lưu embedding trong PostgreSQL bằng extension `pgvector`, cùng DB với dữ liệu nghiệp vụ. Không triển khai Qdrant trong MVP.

- Bật extension bằng migration có phiên bản, không bật tay trên Supabase Dashboard.
- Mọi bảng vector có cột `shop_id` và mọi truy vấn tương đồng lọc theo `shop_id` trong cùng câu SQL.
- Redis giữ vai trò cache/giới hạn tốc độ; không dùng làm vector store.

## Lý do

| Tiêu chí | pgvector | Qdrant |
|---|---|---|
| Cô lập `shop_id` | Lọc trong SQL, test chéo shop bằng integration test hiện có | Phải luôn gắn và lọc payload; quên filter là lộ dữ liệu |
| Nhất quán | Cùng transaction với `products`; archive loại ngay | Cần đồng bộ Postgres → Qdrant, có độ trễ |
| Trả căn cứ | JOIN trực tiếp với dữ liệu nghiệp vụ | Thêm một lượt truy vấn Postgres |
| Backup/schema | Đi cùng DB và migration | Quy trình backup và schema riêng |
| Chi phí vận hành | Không thêm service hay secret | Thêm service, secret và giám sát cho mỗi môi trường |

## Hệ quả

- Job `ai` của CI dùng image `pgvector/pgvector:pg17` để migration chạy giống Supabase; job `core` vẫn dùng `postgres:16` vì migration Core chưa cần extension `vector`.
- Bỏ Qdrant và `QDRANT__URL` khỏi tài liệu thiết kế.
- Xem xét lại quyết định khi đo được một trong các điều kiện: p95 truy vấn tương đồng vượt ngưỡng NFR, số vector đạt hàng triệu, hoặc cần hybrid search/quantization mà pgvector không đáp ứng. Khi đó PostgreSQL vẫn là nguồn chuẩn, store chuyên dụng chỉ là bản sao để tìm kiếm.
