package com.example.crud;

import com.example.crud.config.RequiredDatabaseSettings;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class CrudApplication {

    public static void main(String[] args) {
        SpringApplication application = new SpringApplication(CrudApplication.class);
        // Checked once the configuration is loaded and before anything connects to a database.
        application.addInitializers(new RequiredDatabaseSettings());
        application.run(args);
    }
}
