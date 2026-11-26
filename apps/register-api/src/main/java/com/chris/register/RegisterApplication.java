package com.chris.register;

import com.chris.register.config.RequiredDatabaseSettings;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class RegisterApplication {

    public static void main(String[] args) {
        SpringApplication application = new SpringApplication(RegisterApplication.class);
        // Checked once the configuration is loaded and before anything connects to a database.
        application.addInitializers(new RequiredDatabaseSettings());
        application.run(args);
    }
}
