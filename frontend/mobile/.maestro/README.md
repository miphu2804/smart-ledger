# E2E iOS (Maestro)

Flow chạy trên dev build (`expo-dev-client`) đã cài sẵn trên iOS Simulator, với dữ liệu mẫu (mock).

```bash
brew install openjdk mobile-dev-inc/tap/maestro
export JAVA_HOME="$(brew --prefix openjdk)/libexec/openjdk.jdk/Contents/Home"

# Metro riêng cho test, bật mock.
EXPO_PUBLIC_USE_MOCK=true npx expo start --dev-client --port 8090

maestro test .maestro/ai-history.yaml
# Metro ở cổng khác: maestro test -e METRO_URL=http%3A%2F%2F127.0.0.1%3A<port> .maestro/ai-history.yaml
```

- `login-to-ai.yaml`: mở app từ Metro, đăng nhập SĐT mẫu (OTP `123456`) rồi vào màn Trợ lý AI.
- `ai-history.yaml`: lịch sử trò chuyện ở `app/ai.tsx`.

Mock trả lời tức thì nên flow không kiểm được thao tác trong lúc trợ lý đang trả lời; kiểm tay với Core thật.

`inputText` của Maestro trên iOS không gõ được tiếng Việt có dấu; flow gửi tin bằng câu gợi ý và nhập chữ không dấu.
