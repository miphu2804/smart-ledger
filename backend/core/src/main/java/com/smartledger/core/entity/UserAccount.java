package com.smartledger.core.entity;

import com.smartledger.core.security.VerifiedFirebaseToken;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;
import org.springframework.util.StringUtils;

@Entity
@Table(name = "users")
public class UserAccount {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "display_name", nullable = false, length = 150)
    private String displayName;

    @Column(length = 255)
    private String email;

    @Column(length = 30)
    private String phone;

    @Column(name = "avatar_url", length = 1000)
    private String avatarUrl;

    @Enumerated(EnumType.STRING)
    @Column(name = "system_role", nullable = false, length = 20)
    private SystemRole systemRole;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private UserStatus status;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    protected UserAccount() {
    }

    public static UserAccount createOwner(String displayName, VerifiedFirebaseToken firebaseToken) {
        UserAccount user = new UserAccount();
        user.displayName = displayName;
        user.systemRole = SystemRole.OWNER;
        user.status = UserStatus.ACTIVE;
        user.syncFirebaseProfile(firebaseToken);
        return user;
    }

    public void syncFirebaseProfile(VerifiedFirebaseToken firebaseToken) {
        if (StringUtils.hasText(firebaseToken.email())) {
            email = firebaseToken.email();
        }
        if (StringUtils.hasText(firebaseToken.phoneNumber())) {
            phone = firebaseToken.phoneNumber();
        }
        if (StringUtils.hasText(firebaseToken.avatarUrl())) {
            avatarUrl = firebaseToken.avatarUrl();
        }
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

    public Long getId() {
        return id;
    }

    public String getDisplayName() {
        return displayName;
    }

    public String getEmail() {
        return email;
    }

    public String getPhone() {
        return phone;
    }

    public String getAvatarUrl() {
        return avatarUrl;
    }

    public SystemRole getSystemRole() {
        return systemRole;
    }

    public UserStatus getStatus() {
        return status;
    }
}
