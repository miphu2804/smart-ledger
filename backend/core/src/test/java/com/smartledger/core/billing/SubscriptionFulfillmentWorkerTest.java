package com.smartledger.core.billing;

import static org.mockito.Mockito.*;
import java.util.List;
import org.junit.jupiter.api.Test;

class SubscriptionFulfillmentWorkerTest {
    @Test void failedOrBusyRowsDoNotStarveFollowingBatchesAndCursorWraps() {
        var service = mock(SubscriptionService.class);
        when(service.pending(0)).thenReturn(List.of(1L, 2L));
        when(service.fulfill(1)).thenThrow(new IllegalStateException("must not log private diagnostics"));
        when(service.pending(2)).thenReturn(List.of(3L));
        when(service.pending(3)).thenReturn(List.of());
        var worker = new SubscriptionFulfillmentWorker(service);
        worker.run(); worker.run(); worker.run(); worker.run();
        verify(service, times(2)).fulfill(1); verify(service, times(2)).fulfill(2); verify(service).fulfill(3);
        verify(service, times(2)).pending(0);
    }
}
