package com.smartledger.core.activity;

import static org.assertj.core.api.Assertions.assertThat;

import com.smartledger.core.config.UserDailyActivityConfiguration;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

class UserDailyActivityConfigurationTest {
    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withUserConfiguration(UserDailyActivityConfiguration.class);

    @Test
    void disabledByDefaultDoesNotNeedDatasourceOrRegisterRecorderAndCleanup() {
        runner.run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context).doesNotHaveBean(UserDailyActivityRepository.class)
                    .doesNotHaveBean(UserDailyActivityService.class).doesNotHaveBean(UserDailyActivityCleanup.class);
        });
    }
}
