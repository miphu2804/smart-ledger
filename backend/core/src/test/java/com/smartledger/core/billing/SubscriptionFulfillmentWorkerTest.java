package com.smartledger.core.billing;

import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.*;
import java.util.List;
import java.util.stream.LongStream;
import org.junit.jupiter.api.Test;

class SubscriptionFulfillmentWorkerTest {
    @Test void failedOldPaymentIsRetriedWhileNewPaymentsKeepArriving() {
        var service = mock(SubscriptionService.class);
        when(service.pending(anyLong())).thenReturn(List.of());
        when(service.pending(0)).thenReturn(List.of(1L, 2L), List.of(1L, 3L), List.of(4L));
        when(service.fulfill(1)).thenThrow(new IllegalStateException("must not log private diagnostics")).thenReturn(true);
        var worker = new SubscriptionFulfillmentWorker(service);
        worker.run(); worker.run(); worker.run();
        verify(service, times(2)).fulfill(1); verify(service).fulfill(2); verify(service).fulfill(3); verify(service).fulfill(4);
        verify(service, times(3)).pending(0);
        verify(service, never()).pending(longThat(cursor -> cursor > 0));
    }

    @Test void steadyFullBatchesStillWrapToTheOldestPendingPayment() {
        var service = mock(SubscriptionService.class);
        when(service.pending(anyLong())).thenAnswer(call -> {
            long after = call.getArgument(0);
            return LongStream.rangeClosed(after + 1, after + SubscriptionRepository.CANDIDATE_BATCH).boxed().toList();
        });
        when(service.fulfill(anyLong())).thenThrow(new IllegalStateException("busy"));
        var worker = new SubscriptionFulfillmentWorker(service);
        for (int i = 0; i <= SubscriptionFulfillmentWorker.MAX_FULL_BATCHES; i++) worker.run();
        verify(service, times(2)).pending(0);
        verify(service, times(2)).fulfill(1);
    }

    @Test void unavailableScanKeepsTheCursor() {
        var service = mock(SubscriptionService.class);
        when(service.pending(0)).thenThrow(new IllegalStateException("database down"))
                .thenReturn(List.of());
        var worker = new SubscriptionFulfillmentWorker(service);
        worker.run(); worker.run();
        verify(service, times(2)).pending(0);
    }
}
