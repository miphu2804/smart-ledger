package com.smartledger.core.config;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties({ZaloProperties.class, ZaloNativeProperties.class})
public class ZaloConfiguration { }
