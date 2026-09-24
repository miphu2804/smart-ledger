package com.smartledger.core.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OneToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;

@Entity
@Table(name = "auth_identities")
public class AuthIdentity {

    public static final String FIREBASE_PROVIDER = "FIREBASE";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false, unique = true)
    private UserAccount user;

    @Column(nullable = false, length = 30)
    private String provider;

    @Column(name = "provider_subject", nullable = false, unique = true, length = 255)
    private String providerSubject;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    protected AuthIdentity() {
    }

    public static AuthIdentity forFirebase(UserAccount user, String firebaseUid) {
        AuthIdentity identity = new AuthIdentity();
        identity.user = user;
        identity.provider = FIREBASE_PROVIDER;
        identity.providerSubject = firebaseUid;
        return identity;
    }

    @PrePersist
    void onCreate() {
        OffsetDateTime now = OffsetDateTime.now();
        createdAt = now;
        updatedAt = now;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = OffsetDateTime.now();
    }

    public UserAccount getUser() {
        return user;
    }
}
