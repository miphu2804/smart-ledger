package com.smartledger.core.entity;

import com.smartledger.core.enums.SystemRole;
import com.smartledger.core.enums.UserStatus;
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
import java.time.ZoneOffset;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.springframework.util.StringUtils;

@Entity
@Table(name = "users")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
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

    @Column(name = "avatar_public_id", length = 500)
    private String avatarPublicId;

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
        if (avatarPublicId == null && StringUtils.hasText(firebaseToken.avatarUrl())) {
            avatarUrl = firebaseToken.avatarUrl();
        }
    }

    /** The provider URL is derived per response; only the private media handle is durable. */
    public void replaceCloudinaryAvatar(String avatarPublicId) {
        this.avatarUrl = null;
        this.avatarPublicId = avatarPublicId;
    }

    public void clearCloudinaryAvatar() {
        avatarUrl = null;
        avatarPublicId = null;
    }

    @PrePersist
    void onCreate() {
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
        createdAt = now;
        updatedAt = now;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = OffsetDateTime.now(ZoneOffset.UTC);
    }

}
