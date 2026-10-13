package com.smartledger.core.repository;

import com.smartledger.core.entity.AuthIdentity;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface AuthIdentityRepository extends JpaRepository<AuthIdentity, Long> {

    /** Resolves the account without loading a possibly stale User into the persistence context. */
    @Query("select identity.user.id from AuthIdentity identity where identity.providerSubject = :providerSubject")
    Optional<Long> findUserIdByProviderSubject(@Param("providerSubject") String providerSubject);

    @Query("""
            select identity
            from AuthIdentity identity
            join fetch identity.user
            where identity.providerSubject = :providerSubject
            """)
    Optional<AuthIdentity> findWithUserByProviderSubject(@Param("providerSubject") String providerSubject);
}
