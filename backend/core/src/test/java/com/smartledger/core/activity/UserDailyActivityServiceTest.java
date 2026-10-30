package com.smartledger.core.activity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.Mockito.*;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Optional;
import java.util.concurrent.Executors;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;

class UserDailyActivityServiceTest {
    private final UserDailyActivityRepository repository = mock(UserDailyActivityRepository.class);
    private final MovingClock clock = new MovingClock("2026-10-29T16:59:59Z");
    private final UserDailyActivityService service = new UserDailyActivityService(repository, clock, 2);
    private final LocalDate date = LocalDate.of(2026, 10, 29);

    private void active(String uid, long id) {
        when(repository.findActiveUserId(uid)).thenReturn(Optional.of(id));
        when(repository.insertActiveDay(eq(id), any())).thenReturn(true);
    }

    @Test
    void vietnamMidnightStartsAnotherDayAndEvictsOldCache() {
        active("uid", 41);
        assertThat(service.today()).isEqualTo(date);
        service.record("uid", date);
        service.record("uid", date);
        clock.now = Instant.parse("2026-10-29T17:00:00Z");
        assertThat(service.today()).isEqualTo(date.plusDays(1));
        service.record("uid", date.plusDays(1));
        service.record("uid", date); // A long request admitted before midnight may still complete.
        verify(repository, times(2)).insertActiveDay(41, date);
        verify(repository).insertActiveDay(41, date.plusDays(1));
    }

    @Test
    void boundedCacheEvictionFallsBackToDatabaseDeduplication() {
        active("a", 1); active("b", 2); active("c", 3);
        service.record("a", date); service.record("b", date); service.record("c", date);
        service.record("a", date);
        verify(repository, times(2)).insertActiveDay(1, date);
    }

    @Test
    void failedCommitIsNotCachedAndNextRequestRetries() {
        active("uid", 1);
        when(repository.insertActiveDay(1, date)).thenThrow(new DataAccessResourceFailureException("secret SQL detail"))
                .thenReturn(true);
        assertThatCode(() -> service.record("uid", date)).doesNotThrowAnyException();
        service.record("uid", date); service.record("uid", date);
        verify(repository, times(2)).insertActiveDay(1, date);
    }

    @Test
    void unknownAndDisabledUsersNeverPopulateCache() {
        when(repository.findActiveUserId("uid")).thenReturn(Optional.empty(), Optional.of(1L));
        when(repository.insertActiveDay(1, date)).thenReturn(false, true);
        service.record("uid", date); service.record("uid", date); service.record("uid", date);
        verify(repository, times(2)).insertActiveDay(1, date);
    }

    @Test
    void simultaneousRequestsWriteOncePerUserDayInThisInstance() throws Exception {
        active("uid", 1);
        try (var pool = Executors.newFixedThreadPool(8)) {
            var jobs = IntStream.range(0, 40).<java.util.concurrent.Callable<Void>>mapToObj(i -> () -> {
                service.record("uid", date); return null;
            }).toList();
            for (var result : pool.invokeAll(jobs)) { result.get(); }
        }
        verify(repository).insertActiveDay(1, date);
    }

    @Test
    void retentionIncludesTodayAndPrevious89DatesAndRejectsInvalidRequestDates() {
        service.record("uid", date.plusDays(1));
        service.record("uid", date.minusDays(90));
        verifyNoInteractions(repository);
        service.cleanup();
        verify(repository).deleteBefore(date.minusDays(89));
        doThrow(new DataAccessResourceFailureException("unavailable")).when(repository).deleteBefore(any());
        assertThatCode(service::cleanup).doesNotThrowAnyException();
    }

    private static final class MovingClock extends Clock {
        private Instant now;
        private MovingClock(String now) { this.now = Instant.parse(now); }
        @Override public ZoneId getZone() { return ZoneId.of("UTC"); }
        @Override public Clock withZone(ZoneId zone) { return Clock.fixed(now, zone); }
        @Override public Instant instant() { return now; }
    }
}
