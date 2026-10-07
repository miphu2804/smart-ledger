package com.smartledger.core.dto.response;

import com.smartledger.core.enums.SystemRole;
import java.util.List;

public record AuthSessionResponse(
        UserResponse user,
        SystemRole role,
        List<ShopResponse> shops,
        boolean needsOnboarding) {
}
