package com.smartledger.core.billing;

import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.*;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import java.util.stream.LongStream;
import org.junit.jupiter.api.Test;

class SubscriptionFulfillmentWorkerTest {
    @Test void failedOldPaymentIsRetriedWhileNewPaymentsKeepArriving() {
        var service = mock(SubscriptionService.class);
        when(service.latestRequestId()).thenReturn(2L, 3L, 4L);
        when(service.pending(0, 2)).thenReturn(List.of(1L, 2L));
        when(service.pending(0, 3)).thenReturn(List.of(1L, 3L));
        when(service.pending(0, 4)).thenReturn(List.of(4L));
        when(service.fulfill(1)).thenThrow(new IllegalStateException("must not log private diagnostics")).thenReturn(true);
        var worker = new SubscriptionFulfillmentWorker(service);
        worker.run(); worker.run(); worker.run();
        verify(service, times(2)).fulfill(1); verify(service).fulfill(2); verify(service).fulfill(3); verify(service).fulfill(4);
        verify(service, times(3)).latestRequestId();
    }

    @Test void fullBatchesOfFailedPaymentsDoNotStarveLaterPaymentsOrOldRetries() {
        var service = mock(SubscriptionService.class);
        var latest = new AtomicLong(121);
        when(service.latestRequestId()).thenAnswer(call -> latest.get());
        when(service.pending(anyLong(), anyLong())).thenAnswer(call -> {
            long after = call.getArgument(0);
            long through = call.getArgument(1);
            return LongStream.rangeClosed(after + 1, Math.min(through, latest.get()))
                    .limit(SubscriptionRepository.CANDIDATE_BATCH).boxed().toList();
        });
        when(service.fulfill(longThat(id -> id <= 120))).thenThrow(new IllegalStateException("busy"));
        when(service.fulfill(121)).thenReturn(true);
        var worker = new SubscriptionFulfillmentWorker(service);
        for (int i = 0; i < 7; i++) {
            worker.run();
            latest.incrementAndGet();
        }
        verify(service).fulfill(121);
        verify(service, never()).fulfill(122);
        verify(service).latestRequestId();
        worker.run();
        verify(service).pending(0, 128);
        verify(service, times(2)).fulfill(1);
    }

    @Test void unavailableScanKeepsTheCursor() {
        var service = mock(SubscriptionService.class);
        when(service.latestRequestId()).thenReturn(1L);
        when(service.pending(0, 1)).thenThrow(new IllegalStateException("database down"))
                .thenReturn(List.of());
        var worker = new SubscriptionFulfillmentWorker(service);
        worker.run(); worker.run();
        verify(service, times(2)).pending(0, 1);
        verify(service).latestRequestId();
    }
}
