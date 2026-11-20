package com.echess.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        if (FirebaseApp.getApps(this).isEmpty()) {
            FirebaseOptions options = new FirebaseOptions.Builder()
                .setProjectId("echess-fd9af")
                .setApiKey("AIzaSyAJm3-tqMRS9uVspXBIQs49bSvbx5Uyg3s")
                .setApplicationId("1:783839710213:web:513463e01d63920ab0206c")
                .setGcmSenderId("783839710213")
                .setStorageBucket("echess-fd9af.firebasestorage.app")
                .build();
            FirebaseApp.initializeApp(this, options);
        }
        super.onCreate(savedInstanceState);
    }
}
