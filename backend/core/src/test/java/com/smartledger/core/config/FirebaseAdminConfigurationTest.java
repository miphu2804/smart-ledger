package com.smartledger.core.config;

import static org.assertj.core.api.Assertions.assertThat;

import com.google.firebase.FirebaseApp;
import java.security.KeyPairGenerator;
import java.util.Base64;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

class FirebaseAdminConfigurationTest {

    @AfterEach
    void deleteFirebaseApps() {
        FirebaseApp.getApps().forEach(FirebaseApp::delete);
    }

    @Test
    void buildsFirebaseAppFromServiceAccountJsonWithoutKeyFile() throws Exception {
        FirebaseProperties properties = new FirebaseProperties();
        properties.setProjectId("smart-ledger-test");
        properties.setServiceAccountJson(serviceAccountJson());

        FirebaseApp app = new FirebaseAdminConfiguration().firebaseApp(properties);

        assertThat(app.getOptions().getProjectId()).isEqualTo("smart-ledger-test");
    }

    private static String serviceAccountJson() throws Exception {
        byte[] privateKey = KeyPairGenerator.getInstance("RSA").generateKeyPair().getPrivate().getEncoded();
        String pem = "-----BEGIN PRIVATE KEY-----\n"
                + Base64.getMimeEncoder(64, "\n".getBytes()).encodeToString(privateKey)
                + "\n-----END PRIVATE KEY-----\n";
        return """
                {"type":"service_account","project_id":"smart-ledger-test","private_key_id":"key-id",
                 "private_key":"%s","client_email":"svc@smart-ledger-test.iam.gserviceaccount.com",
                 "client_id":"1","token_uri":"https://oauth2.googleapis.com/token"}
                """.formatted(pem.replace("\n", "\\n"));
    }
}
