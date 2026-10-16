package com.smartledger.core.zalo;

public interface ZaloProviderGateway {
    ZaloProfile exchangeCode(String code, String verifier);
}
