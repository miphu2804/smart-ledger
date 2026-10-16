"""Fail CI when required real-PostgreSQL suites are missing, skipped or failing."""

from pathlib import Path
import sys
from xml.etree import ElementTree


REQUIRED = {
    "com.smartledger.core.config.ZaloNativeMigrationPostgresTest": {
        "freshV18CreatesNativeColumnsAndRerunIsNoOp",
        "upgradeFromV17PreservesWebSessionsMappingsAndBusinessData",
        "v18RejectsMixedChannelsDuplicateReferenceAndInvalidExpiry",
        "earlyColumnCollisionRollsBackWithoutAdoptingUnexpectedSchema",
        "lateConstraintCollisionRollsBackAllColumnsAndRetainsWebConstraint",
        "lockTimeoutLeavesV17UsableAndRetrySucceeds",
        "nativeColumnsRetainRlsAndNoPublicPoliciesOrGrants",
    },
    "com.smartledger.core.service.ZaloNativeFlowPostgresTest": {
        "nativeOffAndMissingV18FailClosedWhileV17WebKeepsWorking",
        "loginUsesVerifierBoundReferenceWithoutPersistingCredentialsAndReusesWebIdentity",
        "wrongVerifierRequestClientPurposeOrChannelCannotConsumeNativeHandoff",
        "concurrentCallbacksAndExchangesHaveExactlyOneWinner",
        "handoffAndSessionExpiryAreExclusiveAndProviderDelayDoesNotExtendSession",
        "linkUsesRecentVerifiedUidPreservesProfileAndNeverMovesConflictingIdentity",
        "linkRejectsMissingStaleOrMismatchedFirebaseProofWithoutConsumingHandoff",
        "disabledAndAdminAccountsCannotLoginOrLinkAndNoProfileIsCreatedImplicitly",
        "firebaseFailureKeepsCanonicalUidAndFreshFlowRecoversWithoutReferenceReplay",
        "competingNativeLinksHaveOneOwnerAndSuspensionDuringMintDoesNotReturnToken",
        "v18EnforcesChannelIsolationReferenceUniquenessAndExpiry",
    },
    "com.smartledger.core.config.ZaloMigrationPostgresTest": {
        "freshMigrationCreatesBothStoresAndExpiryIndexWithoutCoreProfileForeignKey",
        "upgradeFromV16PreservesExistingOwnerIdentityShopAndCreatesNoMappings",
        "migrationFailureRollsBackNewTableAndHistoryWithoutAdoptingUnexpectedTables",
        "rerunIsNoOpAndProviderAppScopeUniquenessPreservesCanonicalUid",
        "databaseRejectsInvalidSessionLifecycleAndDuplicateHandoffProof",
        "nonOwnerRolesCannotReadOrInsertEvenWithBroadTablePrivileges",
    },
    "com.smartledger.core.repository.ZaloOAuthPostgresTest": {
        "concurrentCallbacksHaveOnlyOneWinner",
        "concurrentProofExchangesHaveOnlyOneWinner",
        "sessionTransitionsCommitBeforeSurroundingTransactionRollsBack",
        "concurrentFirstLoginAlwaysResolvesTheSameCanonicalUid",
        "competingLinksCannotReassignIdentity",
        "linkingWaitsForConcurrentDisableAndDoesNotCommitTheNewMapping",
        "verifiedProofIsBoundToPurposeOriginChallengeAndBothExpiries",
    },
    "com.smartledger.core.service.ZaloAuthFlowPostgresTest": {
        "disabledWorksWithOnlyOldSchemaAndMissingNewTablesFailClosedWhenEnabled",
        "repeatedLoginUsesOneFirebaseUidAndCreatesCoreOwnerOnlyThroughExistingSession",
        "linkedLoginKeepsExistingOwnerProfileShopRoleAndPrivateAvatar",
        "conflictingLinkNeverMovesTheIdentityOrChangesEitherOwner",
        "disabledMappedOwnerCannotObtainFirebaseCustomToken",
        "freshOAuthAfterFirebaseFailureReusesReservedUidWithoutReusingConsumedProof",
    },
    "com.smartledger.core.config.SaleRefundMigrationPostgresTest": {
        "notificationUpgradePreservesExistingBusinessDataWithoutBackfill",
        "notificationMigrationAdoptsLocalTablesAndPreservesReadHistory",
        "invalidLocalThresholdFailsNotificationMigrationAtomicallyAndAllowsRetry",
    },
    "com.smartledger.core.service.NotificationPostgresTest": {
        "concurrentConfirmationOfTheSameDraftCreatesOneSaleAndOneAlert",
        "concurrentDifferentSalesProduceOnlyOneOpenStockAlert",
        "concurrentVoidRetryCreatesOneNotificationAndRefund",
        "notificationWriteFailureRollsBackVoidRefundAndIdempotencyKey",
        "readBatchIsAtomicAndEventsCannotBeReadByAnotherOwnerEvenWithAnIncorrectRecipientRow",
        "laterRestockOverflowRollsBackEarlierStockAuditAndAllowsSameKeyRetry",
        "voidRestorationExactlyAtMaximumSucceeds",
        "explicitNoRestockStillVoidsWhenStockIsAlreadyAtMaximum",
    },
    "com.smartledger.core.service.DebtVoidPostgresTest": set(),
    "com.smartledger.core.service.AuditLogPostgresTest": {
        "lateCheckoutFailureRollsBackEveryBusinessWriteAndCanBeRetried",
        "laterProductFailureRollsBackEarlierStockChangeAndCustomer",
    },
    "com.smartledger.core.service.AuthSessionConcurrencyPostgresTest": {
        "sessionReadsCommittedChangesEvenWhenUserWasAlreadyManaged",
        "sessionKeepsItsRowLockUntilCommitAndTheLaterWriterWins",
        "identityLookupDoesNotLoadUserBeforeTakingItsLock",
    },
    "com.smartledger.core.service.ShopConcurrencyPostgresTest": {
        "adminSuspensionWinsBeforeOwnerWrite",
        "adminReadsOwnerCommitWithoutOverwritingProfileOrReopeningArchivedShop",
        "profileEditPreservesLogoCommittedWhileItsShopWasAlreadyManaged",
    },
    "com.smartledger.core.service.CatalogLifecycleConcurrencyPostgresTest": {
        "archiveCommitPreventsStaleReplace",
        "archiveReadsLatestCommittedProfile",
        "concurrentArchivesKeepFirstMetadataAndSingleAudit",
        "archiveBeforeDebtConfirmationRejectsEvenPreloadedCustomer",
        "debtConfirmationSnapshotsLatestCustomerAfterWaitingForProfileWrite",
        "debtConfirmationKeepsCustomerLockUntilCommitBeforeArchive",
        "debtConfirmationAuditFailureRollsBackAndReleasesCustomerLock",
        "fullyPaidConfirmationStillAcceptsArchivedCustomerSnapshotWithoutDebt",
        "debtConfirmationDoesNotLockOrLinkCustomerFromAnotherShop",
    },
    "com.smartledger.core.service.CategoryAssignmentConcurrencyPostgresTest": {
        "archiveCommitRejectsCreateOrPatchWithoutPartialWrites",
        "assignmentCommitMakesArchiveRejectActiveProducts",
        "categoryArchiveDoesNotDeadlockWithMediaStyleShopThenProductLocks",
        "omittedCategoryKeepsLatestAssignmentAfterPreloadedProductWaitsForAnotherPatch",
    },
    "com.smartledger.core.service.MediaConcurrencyPostgresTest": {
        "simultaneousSameAvatarKeyOnlyReservesOnce",
        "avatarAuditAndReferenceRollbackTogetherAndKeepPendingKey",
        "managedAvatarWriterPreservesSessionProfileCommittedDuringUpload",
        "managedAvatarWriterSeesLatestStatusAndRole",
        "managedAvatarWriterCleansLatestReferenceNotPreloadedReference",
        "sessionAfterAvatarWritePreservesMediaReference",
        "managedLogoAndProfileWritersPreserveEachOthersChanges",
        "managedShopMediaWriterRejectsCommittedLifecycleChange",
        "managedProductMediaWriterPreservesCommittedCatalogAndStock",
        "managedProductMediaWriterRejectsArchivedProduct",
    },
    "com.smartledger.core.service.SalesListQueryPostgresTest": {
        "saleSummaryUsesOneAggregateReadForTenThousandSalesWithoutHydratingItems",
        "saleSummaryReusesItemSearchWithoutDuplicateCountingAndHonorsStatus",
        "saleSummaryRejectsAValueOutsideTheApiLongRangeInsteadOfReturningCorruptedMoney",
        "saleSummaryReturnsFiveZerosForEmptyOrUnmatchedSetsAndExcludesDrafts",
        "saleSummaryCombinesAllFiltersWithHalfOpenBoundsAndEquivalentOffsets",
        "saleSummaryUsesDiscountedSaleValueForPaidPartialDebtAndCrossPeriodVoid",
        "saleSummarySupportsExactIdLiteralWildcardsAndArchivedProductSnapshots",
        "saleSummaryRejectsUnauthorizedAccessBeforeAggregateRead",
        "saleSummaryAcceptsExactlyLongMaxValue",
    },
}


def method_name(case_name: str) -> str:
    """Surefire appends parameter signatures and invocation indexes to JUnit methods."""
    return case_name.split("(", 1)[0].split("[", 1)[0]


def verify(reports: Path) -> None:
    suites = {}
    for report in reports.glob("TEST-*.xml"):
        suite = ElementTree.parse(report).getroot()
        suites[suite.get("name")] = suite
    problems = []
    for name, required_methods in REQUIRED.items():
        suite = suites.get(name)
        if suite is None:
            problems.append(f"{name}: report missing")
            continue
        cases = suite.findall("testcase")
        if int(suite.get("tests", "0")) <= 0 or not cases:
            problems.append(f"{name}: no tests executed")
        if any(int(suite.get(field, "0")) for field in ("skipped", "failures", "errors")) or any(
            case.find(tag) is not None for case in cases for tag in ("skipped", "failure", "error")
        ):
            problems.append(f"{name}: tests skipped or failed")
        missing = required_methods - {method_name(case.get("name", "")) for case in cases}
        if missing:
            problems.append(f"{name}: required tests missing: {sorted(missing)}")
        print(f"{name}: tests={suite.get('tests')}, skipped={suite.get('skipped')}")
    if problems:
        raise SystemExit("PostgreSQL verification incomplete:\n" + "\n".join(problems))


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: verify_postgres_tests.py <surefire-reports-directory>")
    verify(Path(sys.argv[1]))
