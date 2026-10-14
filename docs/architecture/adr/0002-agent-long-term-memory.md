# ADR-0002: Long-term memory cho Agent theo mẫu TencentDB for PostgreSQL, dựng trên pgvector của Supabase

- **Trạng thái:** Proposed. Chưa có FR/AC; không đổi code hay contract cho tới khi PO duyệt yêu cầu và team chấp nhận ADR này
- **Ngày:** 2026-10-14
- **Owner:** chưa chỉ định

![Agent long-term memory: Tencent reference and proposed SmartLedger flow](../diagrams/images/agent-memory.svg)

Nguồn sơ đồ: [`agent-memory.drawio`](../diagrams/src/agent-memory.drawio), xuất như [sơ đồ CI/CD](../../development/ci-cd.md). Băng trên cùng là mẫu Tencent; phần dưới là luồng đề xuất cho SmartLedger. Số cam là một lượt chat (đọc memory), số xanh lá là ghi memory sau lượt; hộp và cạnh nét đứt là phần đề xuất, chưa có.

## Bối cảnh

- Agent hiện chỉ nhớ trong một hội thoại: mỗi lượt gửi `AGENT_HISTORY_TURNS` lượt gần nhất (mặc định 100), không tóm tắt, không có tool tìm lịch sử ([Ngữ cảnh chat](../../contracts/api-contracts.md#ngữ-cảnh-chat), [AI README](../../../backend/ai/README.md#chat-context)). Thói quen hay sở thích chủ tiệm nói ở hội thoại khác không tới được model.
- Team đã xem ba lựa chọn "long-term memory" của Tencent. Chỉ một lựa chọn chạy trên PostgreSQL: tính năng Agent Long-Term Memory của TencentDB for PostgreSQL, mô tả trong hướng dẫn chính thức.
- [ADR-0001](0001-vector-store-pgvector.md) đã chốt: embedding nằm trong PostgreSQL của Supabase, mọi truy vấn vector lọc `shop_id` trong cùng câu SQL.
- PRD chưa có yêu cầu nào về memory dài hạn. ADR này chỉ ghi phát hiện và hướng kiến trúc để PO quyết định có làm hay không.

## Phát hiện từ hướng dẫn của Tencent

Nội dung dưới đây lấy từ trích đoạn của trang [Agent Long-Term Memory Feature Overview](https://www.tencentcloud.com/document/product/409/80363) và [Building Agentic RAG Applications Based on PostgreSQL](https://intl.cloud.tencent.com/document/product/409/80410) qua công cụ tìm kiếm. Cần đối chiếu trang gốc trước khi chuyển ADR sang Accepted.

| Thành phần trong hướng dẫn | Tencent làm gì | Áp dụng cho SmartLedger |
|---|---|---|
| Kiến trúc | Vector + đồ thị + quan hệ trong một instance PostgreSQL, thay bộ Mem0 + Redis + Neo4j | Giữ ý tưởng một DB; Supabase đã có `vector` |
| `pgvector` ([hướng dẫn](https://www.tencentcloud.com/document/product/409/80360)) | Bản 0.8.x, tìm theo khoảng cách cosine | Dùng y nguyên; staging có `vector` 0.8.2 (ADR-0001) |
| Bảng `memory.records` | Append-only; `tenant_id`, `agent_id` (UUID, bắt buộc), `project_id`, `content`, `memory_type` (mặc định `episodic`), `metadata`, `expires_at`; `embedding vector(1024)` với index HNSW cosine | Bảng `agent_memories` theo khóa `BIGINT` của ERD, scope `shop_id` + `user_id` |
| Loại memory | `episodic` (lịch sử, thao tác), `semantic` (kiến thức), `procedural` (quy trình), `preference` (sở thích, thói quen) | MVP chỉ cần `preference` và `semantic`; danh sách chốt là câu hỏi cho PO |
| Tìm kiếm | Lọc `agent_id` và `expires_at IS NULL OR > now()`, xếp theo khoảng cách cosine tới embedding của câu hỏi, lấy 5 dòng | Giống vậy, lọc thêm `shop_id` và `user_id` trong cùng câu SQL |
| Cách ly tenant | Row-level security: policy so `tenant_id` với setting phiên `app.tenant_id` | Cùng ý với setting `smartledger.shop_id` của các view `ai_read`; với bảng ghi, giữ cách repository hiện tại là `WHERE shop_id AND user_id` tường minh |
| Embedding | `tencentdb_ai.get_embedding('bge-m3', …)` chạy trong DB | Không có extension này; AI service gọi embedding API qua provider hiện có |
| Apache AGE ([hướng dẫn](https://www.tencentcloud.com/document/product/409/80361)) | Bản 1.5.x, đồ thị thực thể bằng openCypher | Không dùng ở MVP; chưa xác minh Supabase có `age` hay không (`SELECT … FROM pg_available_extensions WHERE name = 'age'`) |
| PostgREST | Có trích đoạn nhắc endpoint `/memory/records`, chưa đối chiếu | Không cần: Core không đọc memory, AI nối DB trực tiếp |

Hướng dẫn mô tả cách tự dựng: người dùng tự tạo schema và bảng (`CREATE SCHEMA memory`). Không thấy API memory đóng gói sẵn hay bảng giá riêng; chi phí là instance TencentDB for PostgreSQL cộng tiền gọi model. Vì vậy phần lớn mẫu này dựng được trên Supabase mà không cần đổi nhà cung cấp DB.

## Các phương án

| Phương án | Ưu | Nhược |
|---|---|---|
| **A. Tự dựng theo mẫu Tencent trên Supabase** | Giữ ADR-0001: cùng DB, lọc `shop_id` trong SQL, xóa theo hội thoại trong một transaction; không thêm service hay secret ngoài embedding | Tự viết bước trích xuất fact và đánh giá chất lượng tiếng Việt |
| B. Chuyển sang TencentDB for PostgreSQL | Có sẵn `tencentdb_ai`, AGE | Phải dời hoặc chạy song song DB nghiệp vụ, đổi quy trình backup/migration, thêm chi phí instance |
| C. Chạy [TencentDB-Agent-Memory](https://github.com/TencentCloud/TencentDB-Agent-Memory) (mã nguồn mở) bên cạnh AI | Có pipeline L0–L3, SDK Python | Service Node.js riêng; chỉ lưu `sqlite`, `tcvdb`, `mongodb`. Backend Postgres mới ở PR cộng đồng [#1387](https://github.com/TencentCloud/TencentDB-Agent-Memory/pull/1387) và [#1466](https://github.com/TencentCloud/TencentDB-Agent-Memory/pull/1466), còn mở. Thiếu ID thì rơi về bucket `default`; BM25 chỉ có tham số `zh`/`en` |
| D. Giữ nguyên cửa sổ 100 lượt | Không tốn gì | Không nhớ qua hội thoại |

## Đề xuất

Giữ **D** cho tới khi PO duyệt yêu cầu. Nếu PO duyệt, làm theo **A** và theo các pattern đang có của `backend/ai`:

- **Schema:** một migration mới trong `supabase/migrations/` (`npx supabase@2.119.0 migration new agent_memories`), không sửa baseline. Bản phác thảo, kích thước vector tùy model embedding được chọn:

  ```sql
  CREATE TABLE IF NOT EXISTS agent_memories (
      id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      shop_id BIGINT NOT NULL REFERENCES shops (id) ON DELETE RESTRICT,
      user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
      source_conversation_id BIGINT NOT NULL REFERENCES chat_conversations (id) ON DELETE CASCADE,
      memory_type VARCHAR(16) NOT NULL,
      content TEXT NOT NULL,
      embedding vector(<dim>) NOT NULL,
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_agent_memories_shop_user ON agent_memories (shop_id, user_id);
  CREATE INDEX IF NOT EXISTS idx_agent_memories_embedding
      ON agent_memories USING hnsw (embedding vector_cosine_ops);
  ```

  `ON DELETE CASCADE` giữ đúng contract "xóa chat loại tin nhắn khỏi lịch sử và ngữ cảnh assistant": `AgentConversationRepository.delete_conversation` xóa hội thoại thì fact sinh từ hội thoại đó mất trong cùng transaction.
- **Đọc:** tool `recall_memory(query)` dựng như `build_shop_data_tool` trong `src/agent/tools.py`. Shop và user lấy từ `RunContext[AgentContext]`, model chỉ truyền `query`. Kết quả gửi model kèm header "đây là dữ liệu", như `query_shop_data`. Tool tính vào `AGENT_TOOL_CALL_LIMIT`, câu trả lời vẫn qua `screen_answer`.
- **Ghi:** một `MemoryWriter` chạy sau khi `_save_turn` lưu xong, ngoài thời hạn lượt 35 giây nên không làm chậm câu trả lời. Nó đọc tin đã qua `redact_input`, gọi model trích fact bằng prompt tĩnh tiếng Anh trong `src/prompt_templates/`, gọi embedding rồi `INSERT` qua repository mới. Lỗi ở bước này chỉ ghi log, không làm hỏng lượt chat.
- **Cách ly:** mọi câu SQL đọc hoặc ghi `agent_memories` có `shop_id` và `user_id`. Integration test chéo shop giống `tests/integration_tests/test_sql_reader.py` (`NFR-007`, `AC-012`).

## Hệ quả

- Khi làm: thêm FR/NFR/AC vào PRD (và BRD nếu PO coi đây là phạm vi nghiệp vụ mới), cập nhật [Ngữ cảnh chat](../../contracts/api-contracts.md#ngữ-cảnh-chat), [AI README](../../../backend/ai/README.md#chat-context), [Technical design §1](../technical-design.md#1-phạm-vi), `erd.dbml` và trang quyền riêng tư, vì nội dung chat được gửi thêm tới API embedding.
- Mỗi lượt có memory tốn thêm một lời gọi embedding khi đọc, và sau lượt thêm một lời gọi model cộng embedding khi ghi.
- Request và response của `/internal/v1/agent/chat` và `/api/v1/agent/*` không đổi.

## Câu hỏi mở trước khi Accepted

- PO: chủ tiệm có cần agent nhớ qua hội thoại không, nhớ loại nào, và có cần màn xem/xóa memory riêng không?
- Thời hạn lưu: hợp đồng hiện tại nói MVP không có TTL; `expires_at` có dùng không?
- Model embedding và kích thước vector; đo chất lượng truy xuất tiếng Việt trên dữ liệu mẫu trước khi chọn.
- Đối chiếu trang gốc của Tencent (schema đầy đủ, PostgREST, danh sách hàm `tencentdb_ai`).

## Tham khảo

- [Agent Long-Term Memory Feature Overview](https://www.tencentcloud.com/document/product/409/80363)
- [Building Agentic RAG Applications Based on PostgreSQL](https://intl.cloud.tencent.com/document/product/409/80410)
- [pgvector Vector Extension Usage Guide](https://www.tencentcloud.com/document/product/409/80360)
- [Apache AGE Graph Database Usage Guide](https://www.tencentcloud.com/document/product/409/80361)
- [TencentCloud/TencentDB-Agent-Memory](https://github.com/TencentCloud/TencentDB-Agent-Memory)
